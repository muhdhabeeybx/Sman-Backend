// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { orders, depots, products } = require("../db/schema");
const { customerRepo, truckRepo, orderTruckRepo, bankAccountRepo } = require("../repositories");
const { staffTokenWithRoles, closeDb } = require("./helpers");

// placeOrder pays into the depot's own bank account (manual deposit only —
// no Paystack DVA), so whichever depot this resolves to needs one linked.
async function depotFixture() {
  const [existing] = await db.select().from(depots).limit(1);
  const depotId = existing
    ? existing.id
    : (
        await db
          .insert(depots)
          .values({
            name: "Truck Depot",
            code: "TRKD",
            address: "1 Test Rd",
            city: "Lagos",
            state: "Lagos",
            country: "NG",
            postcode: "100001",
            maxCapacity: 1000000,
            establishedYear: "2020",
          })
          .returning()
      )[0].id;

  const linked = await bankAccountRepo.findAll({ depotId, status: "Active" });
  if (linked.length === 0) {
    await bankAccountRepo.create({
      bankName: "Test Bank",
      accountName: "Truck Depot Account",
      accountNumber: `TRKDACC${depotId}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });
  }

  return depotId;
}

async function productFixture() {
  const [existing] = await db.select().from(products).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(products)
    .values({ name: "Truck Product", sku: "TRKD-PRD", category: "PMS" })
    .returning();
  return row.id;
}

let seq = 0;
const RUN = Date.now();
async function makeOrder(customerId, depotId, productId, { deliveryType, quantity } = {}) {
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: `ORD-TRK-${RUN}-${seq++}`,
      customerId,
      state: "Lagos",
      depotId,
      productId,
      quantity: quantity ?? 60000,
      price: "100.00",
      totalAmount: "6000000.00",
      deliveryType: deliveryType || "delivery",
      status: "Paid",
      paymentStatus: "Paid",
    })
    .returning();
  return row;
}

describe("release-time truck allocation (delivery) — order_trucks", () => {
  let depotId;
  let productId;
  let customerId;
  let releaseStaff;
  let fleetTruck;

  before(async () => {
    depotId = await depotFixture();
    productId = await productFixture();
    const customer = await customerRepo.create({
      name: "Truck Customer",
      phone: `+23482${String(RUN).slice(-8)}`,
      status: "Active",
    });
    customerId = customer.id;
    releaseStaff = await staffTokenWithRoles(["release"], "test-trk-release@soroman.test");
    fleetTruck = await truckRepo.create({
      plateNumber: `FLEET-${String(RUN).slice(-6)}`,
      model: "Actros",
      capacity: "45000 L",
    });
  });

  after(async () => {
    await closeDb();
  });

  test("a delivery release creates one load per truck, copying the fleet plate", async () => {
    const order = await makeOrder(customerId, depotId, productId, {
      deliveryType: "delivery",
      quantity: 60000,
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/release`)
      .set("Authorization", `Bearer ${releaseStaff.accessToken}`)
      .send({
        trucks: [
          { truckId: fleetTruck.id, quantity: 30000, driverName: "Musa", driverPhone: "+2348010000001" },
          { truckNumber: "EXT-9001", quantity: 30000, driverName: "Ben" },
        ],
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.status, "Released");

    const loads = await orderTruckRepo.findByOrder(order.id);
    assert.equal(loads.length, 2);
    assert.deepEqual(loads.map((l) => l.truckIndex), [1, 2]);

    const fleetLoad = loads.find((l) => l.truckId === fleetTruck.id);
    assert.ok(fleetLoad, "fleet load present");
    assert.equal(fleetLoad.truckNumber, fleetTruck.plateNumber, "plate copied from the registry");
    assert.equal(fleetLoad.status, "pending");
    assert.equal(fleetLoad.driverName, "Musa");

    const extLoad = loads.find((l) => l.truckId === null);
    assert.ok(extLoad, "external load present");
    assert.equal(extLoad.truckNumber, "EXT-9001");
  });

  test("the truck quantities must sum to the order quantity (400), and nothing is released", async () => {
    const order = await makeOrder(customerId, depotId, productId, {
      deliveryType: "delivery",
      quantity: 60000,
    });

    const res = await request(app)
      .post(`/api/orders/${order.id}/release`)
      .set("Authorization", `Bearer ${releaseStaff.accessToken}`)
      .send({ trucks: [{ truckNumber: "EXT-1", quantity: 30000 }] }); // 30k ≠ 60k

    assert.equal(res.status, 400);

    // The transition rolled back with the bad allocation.
    const [after] = await db.select().from(orders).where(require("drizzle-orm").eq(orders.id, order.id));
    assert.equal(after.status, "Paid", "still Paid — release rolled back");
    assert.equal(await orderTruckRepo.countByOrder(order.id), 0, "no loads persisted");
  });

  test("a delivery release with no trucks is refused (400)", async () => {
    const order = await makeOrder(customerId, depotId, productId, { deliveryType: "delivery" });
    const res = await request(app)
      .post(`/api/orders/${order.id}/release`)
      .set("Authorization", `Bearer ${releaseStaff.accessToken}`)
      .send({ trucks: [] });
    assert.equal(res.status, 400);
  });

  test("a pickup release must NOT carry trucks — those are captured at the gate (400)", async () => {
    const order = await makeOrder(customerId, depotId, productId, {
      deliveryType: "pickup",
      quantity: 60000,
    });
    const res = await request(app)
      .post(`/api/orders/${order.id}/release`)
      .set("Authorization", `Bearer ${releaseStaff.accessToken}`)
      .send({ trucks: [{ truckNumber: "OWN-1", quantity: 60000 }] });
    assert.equal(res.status, 400);
  });

  test("a pickup release with no trucks is allowed and just flips status", async () => {
    const order = await makeOrder(customerId, depotId, productId, { deliveryType: "pickup" });
    const res = await request(app)
      .post(`/api/orders/${order.id}/release`)
      .set("Authorization", `Bearer ${releaseStaff.accessToken}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.order.status, "Released");
    assert.equal(await orderTruckRepo.countByOrder(order.id), 0);
  });

  test("a truck with neither a fleet id nor a plate is rejected by validation (400)", async () => {
    const order = await makeOrder(customerId, depotId, productId, { deliveryType: "delivery" });
    const res = await request(app)
      .post(`/api/orders/${order.id}/release`)
      .set("Authorization", `Bearer ${releaseStaff.accessToken}`)
      .send({ trucks: [{ quantity: 60000 }] });
    assert.equal(res.status, 400);
  });

  test("an unknown fleet truck id is rejected (400) and the release rolls back", async () => {
    const order = await makeOrder(customerId, depotId, productId, { deliveryType: "delivery" });
    const res = await request(app)
      .post(`/api/orders/${order.id}/release`)
      .set("Authorization", `Bearer ${releaseStaff.accessToken}`)
      .send({ trucks: [{ truckId: 999999, quantity: 60000 }] });
    assert.equal(res.status, 400);

    const [after] = await db.select().from(orders).where(require("drizzle-orm").eq(orders.id, order.id));
    assert.equal(after.status, "Paid", "release rolled back");
  });
});
