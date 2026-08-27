// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis, orders, orderTrucks } = require("../db/schema");
const { eq } = require("drizzle-orm");
const { customerRepo, bankAccountRepo } = require("../repositories");
const { NATIVE_TRANSPORT, closeDb } = require("./helpers");

const PORTAL_AUTH = "/api/customer/auth";
const ORDERS = "/api/customer/orders";
const TRACK = "/api/tracking";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();
const QTY = 30000;

async function activeCustomer(tag) {
  const phone = `+234816${String(RUN).slice(-6)}${tag}`;
  await request(app).post(`${PORTAL_AUTH}/register`).send({ name: `Track ${tag}`, phone });
  const ver = await request(app)
    .post(`${PORTAL_AUTH}/verify-otp`)
    .set(NATIVE_TRANSPORT)
    .send({ phone, code: DEV_CODE });
  const customer = await customerRepo.findByPhone(phone);
  await customerRepo.update(customer.id, {
    virtualAccountNumber: `VA${tag}${String(RUN).slice(-6)}`,
    virtualAccountBank: "Test Bank",
    virtualAccountName: `SOROMANNIGERI/ T${tag}`,
  });
  return { customer, accessToken: ver.body.data.accessToken };
}

describe("public order tracking", () => {
  let depotId;
  let productId;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Track Depot",
        code: `TRK${String(RUN).slice(-5)}`,
        address: "1 Rd",
        city: "Warri",
        state: "Delta",
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
      accountName: "Track Depot Account",
      accountNumber: `TRKACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Track PMS", sku: `TRK-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;
    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: "900" });
    await db.insert(pfis).values({
      pfiNumber: `PFI-TRK-${RUN}`,
      status: "active",
      locationId: depotId,
      productId,
      startingQtyLitres: 5000000,
      soldQtyLitres: 0,
    });
  });

  after(async () => {
    await closeDb();
  });

  const place = async (accessToken) => {
    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ depot: depotId, product: productId, state: "Delta", quantity: QTY, deliveryType: "pickup", companyName: "Tracking Co" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data.order;
  };

  test("an unknown reference is a 404", async () => {
    const res = await request(app).get(`${TRACK}/ORD-DOESNOTEXIST`);
    assert.equal(res.status, 404);
  });

  test("a fresh order tracks at 'received' with movement only — no price or identity", async () => {
    const { accessToken } = await activeCustomer("1");
    const order = await place(accessToken);

    const res = await request(app).get(`${TRACK}/${encodeURIComponent(order.orderNumber)}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const t = res.body.data.tracked;

    assert.equal(t.ref, order.orderNumber);
    assert.equal(t.stage, "received");
    assert.equal(t.depotName, "Track Depot");
    assert.equal(t.depotState, "Delta");
    assert.equal(t.lines[0].quantity, QTY);
    assert.equal(t.lines[0].category, "PMS");
    assert.ok(t.reached.received, "received is timestamped");
    assert.equal(t.reached.released, undefined, "later stages are not reached yet");

    // The privacy contract: nothing here may reveal price or who the buyer is.
    // Scan everything EXCEPT the legitimately-public reference and the movement
    // timestamps — those carry random digit runs (a hex order number, a `.900`
    // millisecond) that would otherwise trip the short "900" price pattern.
    const { ref, placedAt, reached, ...privacyScan } = t;
    const blob = JSON.stringify(privacyScan);
    assert.ok(!/price|total|900|27000000/i.test(blob), "no price or total leaks");
    assert.ok(!/Track 1|virtualAccount|balance|company/i.test(blob), "no buyer identity leaks");
  });

  test("stage advances with the order's lifecycle timestamps", async () => {
    const { accessToken } = await activeCustomer("2");
    const order = await place(accessToken);

    await db
      .update(orders)
      .set({ status: "Paid", paymentStatus: "Paid", paymentConfirmedAt: new Date() })
      .where(eq(orders.id, order.id));

    const res = await request(app).get(`${TRACK}/${encodeURIComponent(order.orderNumber)}`);
    const t = res.body.data.tracked;
    assert.equal(t.stage, "processing", "paid-but-not-released reads as processing");
    assert.ok(t.reached.payment_confirmed, "payment_confirmed is timestamped");
    assert.ok(t.reached.processing, "processing is timestamped");
  });

  test("the lookup is case-insensitive and tolerates surrounding space", async () => {
    const { accessToken } = await activeCustomer("3");
    const order = await place(accessToken);
    const res = await request(app).get(
      `${TRACK}/${encodeURIComponent(`  ${order.orderNumber.toLowerCase()}  `)}`
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.tracked.ref, order.orderNumber);
  });

  test("the loading stage shows each truck and its status — plates only, no driver", async () => {
    const { accessToken } = await activeCustomer("5");
    const order = await place(accessToken);
    await db
      .update(orders)
      .set({
        status: "Loading",
        paymentStatus: "Paid",
        paymentConfirmedAt: new Date(),
        releasedAt: new Date(),
        loadingStartedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    // One truck loaded and away, one still on the yard. Progress is counted off
    // the exit gate, not off the ticket — a ticketed truck (`loaded`) may not
    // have reached the depot yet.
    await db.insert(orderTrucks).values([
      { orderId: order.id, truckIndex: 1, truckNumber: "LAG-T1", quantity: "15000", status: "gated_out", driverName: "Ada Private", driverPhone: "+2348010000001" },
      { orderId: order.id, truckIndex: 2, truckNumber: "LAG-T2", quantity: "15000", status: "gated_in", driverName: "Uche Private", driverPhone: "+2348010000002" },
    ]);

    const res = await request(app).get(`${TRACK}/${encodeURIComponent(order.orderNumber)}`);
    const t = res.body.data.tracked;
    assert.equal(t.stage, "loading");
    assert.equal(t.trucks.length, 2, "both trucks are shown");
    assert.deepEqual(
      t.trucks.map((x) => [x.index, x.plate, x.status]),
      [
        [1, "LAG-T1", "gated_out"],
        [2, "LAG-T2", "gated_in"],
      ],
      "in index order, plate + status each",
    );
    assert.ok(t.trucks[0].statusLabel, "a human label accompanies the status");
    assert.match(t.note, /1 of 2 trucks loaded/, "the note summarises progress");

    const blob = JSON.stringify(t);
    assert.ok(!/Ada Private|Uche Private|\+23480100000/.test(blob), "no driver name or phone leaks");
  });

  test("before release there are no trucks", async () => {
    const { accessToken } = await activeCustomer("6");
    const order = await place(accessToken);
    const res = await request(app).get(`${TRACK}/${encodeURIComponent(order.orderNumber)}`);
    assert.deepEqual(res.body.data.tracked.trucks, [], "empty until assigned at release");
  });

  test("a cancelled order is publicly trackable, shown as cancelled", async () => {
    const { accessToken } = await activeCustomer("4");
    const order = await place(accessToken);
    await db.update(orders).set({ status: "Cancelled", cancelledAt: new Date() }).where(eq(orders.id, order.id));

    const res = await request(app).get(`${TRACK}/${encodeURIComponent(order.orderNumber)}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const tracked = res.body.data.tracked;
    assert.equal(tracked.stage, "cancelled");
    assert.match(tracked.note, /cancelled/i);
    assert.ok(tracked.reached.cancelled, "the cancellation is timestamped");
    assert.deepEqual(tracked.trucks, [], "no trucks on a cancelled order");
  });
});
