// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { eq } = require("drizzle-orm");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis, orders } = require("../db/schema");
const { customerRepo, orderRepo, pfiRepo, bankAccountRepo } = require("../repositories");
const orderService = require("../services/order.service");
const { NATIVE_TRANSPORT, closeDb } = require("./helpers");

const PORTAL_AUTH = "/api/customer/auth";
const ORDERS = "/api/customer/orders";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();

const UNIT_PRICE = 100;
const QTY = 20000;
const TOTAL = UNIT_PRICE * QTY;

async function registerActiveCustomer(tag) {
  const phone = `+234816${String(RUN).slice(-6)}${tag}`;
  const reg = await request(app).post(`${PORTAL_AUTH}/register`).send({ name: `Exp ${tag}`, phone });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const ver = await request(app)
    .post(`${PORTAL_AUTH}/verify-otp`)
    .set(NATIVE_TRANSPORT)
    .send({ phone, code: DEV_CODE });
  assert.equal(ver.status, 200, JSON.stringify(ver.body));
  const customer = await customerRepo.findByPhone(phone);
  await customerRepo.update(customer.id, {
    virtualAccountNumber: `VE${tag}${String(RUN).slice(-6)}`,
    virtualAccountBank: "Test Bank",
    virtualAccountName: `SOROMAN/E${tag}`,
  });
  return { customer, accessToken: ver.body.data.accessToken };
}

describe("order expiry — unpaid orders lapse after the window, distinct from cancellation", () => {
  let depotId;
  let productId;
  let pfiId;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Expiry Depot",
        code: `EXP${String(RUN).slice(-5)}`,
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

    // placeOrder pays into the depot's own bank account (manual deposit
    // only — no Paystack DVA), so every order-placing test depot needs one.
    await bankAccountRepo.create({
      bankName: "Test Bank",
      accountName: "Expiry Depot Account",
      accountNumber: `EXPACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Expiry PMS", sku: `EXP-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: String(UNIT_PRICE) });
    const [pfi] = await db
      .insert(pfis)
      .values({
        pfiNumber: `PFI-EXP-${RUN}`,
        status: "active",
        locationId: depotId,
        productId,
        startingQtyLitres: 5000000,
        soldQtyLitres: 0,
      })
      .returning();
    pfiId = pfi.id;
  });

  after(async () => {
    await closeDb();
  });

  const placeOrder = (accessToken) =>
    request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ depot: depotId, product: productId, state: "Lagos", quantity: QTY, deliveryType: "pickup", companyName: "Expiry Co" });

  /** Move an order's creation time into the past so the sweep sees it as stale. */
  const backdate = (orderId, hoursAgo) =>
    db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) })
      .where(eq(orders.id, orderId));

  test("a Pending order older than the window is Expired and its reserved stock returned", async () => {
    const { customer, accessToken } = await registerActiveCustomer("1");
    const placed = await placeOrder(accessToken);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;

    // The order reserved its litres on the PFI at placement.
    const beforeSold = Number((await pfiRepo.findById(pfiId)).soldQtyLitres);
    assert.equal(beforeSold >= QTY, true, "stock was reserved at placement");

    await backdate(orderId, 25); // default window is 24h
    const expired = await orderService.expireStaleOrders();
    assert.equal(expired >= 1, true, "the sweep expired at least this order");

    const order = await orderRepo.findById(orderId);
    assert.equal(order.status, "Expired", "status is Expired, not Cancelled");
    assert.ok(order.expiredAt, "expiredAt is stamped");
    assert.equal(order.paymentStatus, "Unpaid", "an unpaid order stays unpaid");

    const afterSold = Number((await pfiRepo.findById(pfiId)).soldQtyLitres);
    assert.equal(afterSold, beforeSold - QTY, "the reserved litres were returned to the pool");

    // Expiry never touches the wallet (there was no hold on an unpaid order).
    assert.equal(Number((await customerRepo.findById(customer.id)).balance), 0, "wallet untouched");
  });

  test("a fresh order (within the window) is left alone", async () => {
    const { accessToken } = await registerActiveCustomer("2");
    const placed = await placeOrder(accessToken);
    const orderId = placed.body.data.order.id;

    await orderService.expireStaleOrders();

    assert.equal((await orderRepo.findById(orderId)).status, "Pending", "still Pending");
  });

  test("a Paid order is never expired, even when old", async () => {
    const { customer, accessToken } = await registerActiveCustomer("3");
    await customerRepo.creditBalance(customer.id, TOTAL);
    const placed = await placeOrder(accessToken);
    const orderId = placed.body.data.order.id;

    await orderService.payOrder({ orderId, actor: { type: "system" } });
    await backdate(orderId, 100);
    await orderService.expireStaleOrders();

    // Paid orders are Released the moment they are paid, and neither status is
    // reachable from the expiry sweep — only Pending lapses.
    assert.equal((await orderRepo.findById(orderId)).status, "Released", "a funded order never lapses");
  });

  test("the window is set by ORDER_EXPIRY_HOURS", async () => {
    const original = process.env.ORDER_EXPIRY_HOURS;
    try {
      process.env.ORDER_EXPIRY_HOURS = "48";
      const { accessToken } = await registerActiveCustomer("4");
      const placed = await placeOrder(accessToken);
      const orderId = placed.body.data.order.id;

      // 30h old, under the 48h window — untouched.
      await backdate(orderId, 30);
      await orderService.expireStaleOrders();
      assert.equal((await orderRepo.findById(orderId)).status, "Pending", "under the window: Pending");

      // 50h old, past the 48h window — expired.
      await backdate(orderId, 50);
      await orderService.expireStaleOrders();
      assert.equal((await orderRepo.findById(orderId)).status, "Expired", "past the window: Expired");
    } finally {
      if (original === undefined) delete process.env.ORDER_EXPIRY_HOURS;
      else process.env.ORDER_EXPIRY_HOURS = original;
    }
  });

  test("paying a lapsed order expires it and refuses (409), without debiting the wallet", async () => {
    const { customer, accessToken } = await registerActiveCustomer("5");
    await customerRepo.creditBalance(customer.id, TOTAL);
    const placed = await placeOrder(accessToken);
    const orderId = placed.body.data.order.id;

    await backdate(orderId, 25);

    await assert.rejects(
      () => orderService.payOrder({ orderId, actor: { type: "system" } }),
      (err) => err.status === 409 && /expired/i.test(err.message),
      "paying a lapsed order is refused as expired"
    );

    const order = await orderRepo.findById(orderId);
    assert.equal(order.status, "Expired", "the pay attempt flagged it Expired");
    assert.equal(Number((await customerRepo.findById(customer.id)).balance), TOTAL, "wallet not debited");
  });

  test("expiring an already-expired order is refused by the state machine (idempotent sweep)", async () => {
    const { accessToken } = await registerActiveCustomer("6");
    const placed = await placeOrder(accessToken);
    const orderId = placed.body.data.order.id;

    await backdate(orderId, 25);
    await orderService.expireOrder(orderId);
    assert.equal((await orderRepo.findById(orderId)).status, "Expired");

    await assert.rejects(
      () => orderService.expireOrder(orderId),
      (err) => err.status === 409,
      "a second expire is a no-op the sweep swallows"
    );
  });
});
