// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const { customerRepo, bankAccountRepo } = require("../repositories");
const { NATIVE_TRANSPORT, closeDb } = require("./helpers");

const GUEST = "/api/customer/orders/guest";
const PORTAL_AUTH = "/api/customer/auth";
const ORDERS = "/api/customer/orders";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();

const UNIT_PRICE = 100;
const QTY = 20000;

// Nigerian E.164: +234 + 10 digits; tag keeps phones unique per test.
const guestPhone = (tag) => `+234905${String(RUN).slice(-5)}${String(tag).padStart(2, "0")}`;

describe("guest checkout — an order placed with just a phone number", () => {
  let depotId;
  let productId;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Guest Depot",
        code: `GST${String(RUN).slice(-5)}`,
        address: "1 Rd",
        city: "Lagos",
        state: "Lagos",
        country: "NG",
        postcode: "100001",
        maxCapacity: 10000000,
        establishedYear: "2020",
      })
      .returning();
    depotId = depot.id;

    await bankAccountRepo.create({
      bankName: "Test Bank",
      accountName: "Guest Depot Account",
      accountNumber: `GSTACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Guest PMS", sku: `GST-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: String(UNIT_PRICE) });
    await db.insert(pfis).values({
      pfiNumber: `PFI-GST-${RUN}`,
      status: "active",
      locationId: depotId,
      productId,
      startingQtyLitres: 500000,
      soldQtyLitres: 0,
    });
  });

  after(async () => {
    await closeDb();
  });

  const body = (extra = {}) => ({
    depot: depotId,
    product: productId,
    state: "Lagos",
    quantity: QTY,
    deliveryType: "pickup",
    companyName: "Guest Buyer Co",
    name: "Guest Buyer",
    ...extra,
  });

  test("a new phone creates a Pending portal customer and a Pending/Unpaid order", async () => {
    const phone = guestPhone(1);
    const res = await request(app).post(GUEST).send(body({ phone }));
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const { order, payment } = res.body.data;
    assert.equal(order.status, "Pending");
    assert.equal(order.paymentStatus, "Unpaid");
    assert.ok(order.orderNumber, "an order reference to track by");
    assert.ok(payment.accountNumber, "an account to transfer into");

    const customer = await customerRepo.findByPhone(phone);
    assert.ok(customer, "a customer row exists for the phone");
    assert.equal(customer.status, "Pending", "phone not proven yet");
    assert.equal(customer.createdVia, "portal");
    assert.equal(customer.name, "Guest Buyer");
  });

  test("the response never carries the joined customer columns", async () => {
    const res = await request(app).post(GUEST).send(body({ phone: guestPhone(2) }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const order = res.body.data.order;
    for (const leaked of ["customerName", "customerEmail", "customerBalance", "customerPhone", "customerId"]) {
      assert.equal(leaked in order, false, `${leaked} must not be in a guest response`);
    }
  });

  test("an existing customer's phone attaches the order to their row without leaking their data", async () => {
    const phone = guestPhone(3);
    const existing = await customerRepo.create({
      name: "Longtime Customer",
      phone,
      email: "longtime@example.com",
      companyName: "Longtime Co",
      status: "Active",
      createdVia: "desk",
    });

    const res = await request(app).post(GUEST).send(body({ phone, name: "Someone Typing" }));
    assert.equal(res.status, 201, JSON.stringify(res.body));

    // Attached to the existing row, not a duplicate…
    const stillOne = await customerRepo.findByPhone(phone);
    assert.equal(stillOne.id, existing.id, "no duplicate customer was created");
    assert.equal(stillOne.name, "Longtime Customer", "the stored name is not overwritten");

    // …and nothing about the stored account came back to the guest.
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes("Longtime"), "stored name/company must not leak");
    assert.ok(!text.includes("longtime@example.com"), "stored email must not leak");
  });

  test("registering later with the same phone shows the guest order in the account's history", async () => {
    const phone = guestPhone(4);
    const placed = await request(app).post(GUEST).send(body({ phone }));
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderNumber = placed.body.data.order.orderNumber;

    // The person now "creates an account": register + OTP on that phone.
    const reg = await request(app).post(`${PORTAL_AUTH}/register`).send({ name: "Guest Buyer", phone });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    const ver = await request(app)
      .post(`${PORTAL_AUTH}/verify-otp`)
      .set(NATIVE_TRANSPORT)
      .send({ phone, code: DEV_CODE });
    assert.equal(ver.status, 200, JSON.stringify(ver.body));

    const list = await request(app)
      .get(ORDERS)
      .set("Authorization", `Bearer ${ver.body.data.accessToken}`);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const numbers = list.body.data.orders.map((o) => o.orderNumber);
    assert.ok(numbers.includes(orderNumber), "the guest order is in their history");
  });

  test("an Inactive customer's phone is refused (403), revealing nothing else", async () => {
    const phone = guestPhone(5);
    await customerRepo.create({
      name: "Blocked Customer",
      phone,
      status: "Inactive",
      createdVia: "desk",
    });
    const res = await request(app).post(GUEST).send(body({ phone }));
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes("Blocked Customer"));
  });

  test("a malformed phone is a 400", async () => {
    const res = await request(app).post(GUEST).send(body({ phone: "not-a-phone" }));
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  test("name is required", async () => {
    const res = await request(app).post(GUEST).send({ ...body({ phone: guestPhone(6) }), name: undefined });
    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
