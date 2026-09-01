// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const { customerRepo, orderTruckRepo, ticketRepo, auditLogRepo, bankAccountRepo } = require("../repositories");
const orderService = require("../services/order.service");
const { staffTokenWithRoles, NATIVE_TRANSPORT, closeDb, payOrderWithStatementLine } = require("./helpers");

/**
 * Pay an order against a bank statement line — the finance desk's confirm
 * action, which moves Pending → Paid. Orders are created Unpaid; releasing and
 * gating need a Paid order, so tests that reach the gate pay first.
 */
const payOrder = (orderId) => payOrderWithStatementLine(orderId);

const PORTAL_AUTH = "/api/customer/auth";
const ORDERS = "/api/customer/orders";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();
const UNIT_PRICE = 100;

async function activeFundedCustomer(tag, litres) {
  const phone = `+234815${String(RUN).slice(-6)}${tag}`;
  const reg = await request(app).post(`${PORTAL_AUTH}/register`).send({ name: `Pickup ${tag}`, phone });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const ver = await request(app)
    .post(`${PORTAL_AUTH}/verify-otp`)
    .set(NATIVE_TRANSPORT)
    .send({ phone, code: DEV_CODE });
  assert.equal(ver.status, 200, JSON.stringify(ver.body));
  const customer = await customerRepo.findByPhone(phone);
  await customerRepo.update(customer.id, {
    virtualAccountNumber: `VP${tag}${String(RUN).slice(-6)}`,
    virtualAccountBank: "Test Bank",
    virtualAccountName: `SOROMANNIGERI/ P${tag}`,
  });
  await customerRepo.creditBalance(customer.id, UNIT_PRICE * litres);
  return { customer, accessToken: ver.body.data.accessToken };
}

describe("pickup trucks — declared at order, editable at the gate and at ticketing", () => {
  let depotId;
  let productId;
  let release;
  let entry;
  let ticketing;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Pickup Depot",
        code: `PCK${String(RUN).slice(-5)}`,
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
      accountName: "Pickup Depot Account",
      accountNumber: `PCKACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Pickup PMS", sku: `PCK-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: String(UNIT_PRICE) });
    await db.insert(pfis).values({
      pfiNumber: `PFI-PCK-${RUN}`,
      status: "active",
      locationId: depotId,
      productId,
      startingQtyLitres: 2000000,
      soldQtyLitres: 0,
    });

    release = await staffTokenWithRoles(["release"], "test-pck-release@soroman.test");
    entry = await staffTokenWithRoles(["security_entry"], "test-pck-entry@soroman.test");
    ticketing = await staffTokenWithRoles(["ticketing"], "test-pck-ticketing@soroman.test");
  });

  after(async () => {
    await closeDb();
  });

  const body = (extra) => ({
    depot: depotId,
    product: productId,
    state: "Lagos",
    quantity: extra.quantity,
    deliveryType: "pickup",
    companyName: "Pickup Co",
    ...extra,
  });

  test("a customer splits a >60k pickup across trucks, setting each truck's quantity", async () => {
    const { customer, accessToken } = await activeFundedCustomer("1", 100000);

    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        body({
          quantity: 100000,
          trucks: [
            { truckNumber: "PK-AAA", quantity: 60000 },
            { truckNumber: "PK-BBB", quantity: 40000 },
          ],
        })
      );

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const orderId = res.body.data.order.id;

    const loads = await orderTruckRepo.findByOrder(orderId);
    assert.equal(loads.length, 2, "one load per declared truck");
    assert.deepEqual(
      loads.map((l) => [l.truckNumber, Number(l.quantity), l.status]),
      [
        ["PK-AAA", 60000, "pending"],
        ["PK-BBB", 40000, "pending"],
      ],
      "plate + per-truck quantity captured, awaiting the gate"
    );
    assert.equal(loads[0].orderId, orderId);

    // Payment is a bank statement line recorded against the order. The
    // customer's wallet balance is not touched by it at all any more — that
    // indirection is exactly what was removed (see db/migrations/0021), so
    // what is asserted here is the order, not a balance.
    const paid = await payOrder(orderId);
    assert.equal(paid.paymentStatus, "Paid", "the statement line settled the order");
  });

  test("the truck quantities must sum to the order quantity", async () => {
    const { accessToken } = await activeFundedCustomer("2", 100000);
    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(
        body({
          quantity: 100000,
          trucks: [
            { truckNumber: "PK-1", quantity: 60000 },
            { truckNumber: "PK-2", quantity: 30000 }, // 90k ≠ 100k
          ],
        })
      );
    assert.equal(res.status, 400);
    assert.match(res.body.message, /sum to the order quantity/i);
  });

  test("no single truck may exceed 60,000 L", async () => {
    const { accessToken } = await activeFundedCustomer("3", 70000);
    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ quantity: 70000, trucks: [{ truckNumber: "PK-BIG", quantity: 70000 }] }));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /60,000|60000/);
  });

  test("a pickup over 60,000 L can be placed without declaring trucks", async () => {
    const { accessToken } = await activeFundedCustomer("4", 90000);
    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ quantity: 90000 })); // no trucks — gate captures them later
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const loads = await orderTruckRepo.findByOrder(res.body.data.order.id);
    assert.equal(loads.length, 0, "no loads until declared or gated in");
  });

  test("security correcting the plate at gate-in is recorded as a correction", async () => {
    const { accessToken } = await activeFundedCustomer("5", 30000);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ quantity: 30000, trucks: [{ truckNumber: "PK-DECLARED", quantity: 30000 }] }));
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;

    await payOrder(orderId);
    await request(app)
      .post(`/api/orders/${orderId}/release`)
      .set("Authorization", `Bearer ${release.accessToken}`)
      .send({});

    const [load] = await orderTruckRepo.findByOrder(orderId);
    const res = await request(app)
      .post(`/api/orders/${orderId}/gate-in`)
      .set("Authorization", `Bearer ${entry.accessToken}`)
      .send({ loadId: load.id, truckNumber: "PK-ACTUAL" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.truck.truckNumber, "PK-ACTUAL", "the arriving plate replaced the declared one");

    const events = await auditLogRepo.findByEntity("order_truck", load.id);
    const corrected = events.find((e) => e.action === "order_truck.plate_corrected");
    assert.ok(corrected, "the plate correction was audited");
    assert.equal(corrected.metadata.from, "PK-DECLARED");
    assert.equal(corrected.metadata.to, "PK-ACTUAL");
  });

  test("a truck swapped at the gantry is recorded and the ticket names the new truck", async () => {
    const { accessToken } = await activeFundedCustomer("6", 30000);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ quantity: 30000, trucks: [{ truckNumber: "PK-FIRST", quantity: 30000 }] }));
    const orderId = placed.body.data.order.id;

    await payOrder(orderId);
    await request(app)
      .post(`/api/orders/${orderId}/release`)
      .set("Authorization", `Bearer ${release.accessToken}`)
      .send({});
    const [load] = await orderTruckRepo.findByOrder(orderId);
    await request(app)
      .post(`/api/orders/${orderId}/gate-in`)
      .set("Authorization", `Bearer ${entry.accessToken}`)
      .send({ loadId: load.id }); // arrives as declared

    // At the gantry the first truck failed; a different one loads.
    const res = await request(app)
      .post(`/api/orders/${orderId}/trucks/${load.id}/load`)
      .set("Authorization", `Bearer ${ticketing.accessToken}`)
      .send({ truckNumber: "PK-SECOND" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.truck.truckNumber, "PK-SECOND", "the actual loaded truck");

    const events = await auditLogRepo.findByEntity("order_truck", load.id);
    const swapped = events.find((e) => e.action === "order_truck.truck_swapped");
    assert.ok(swapped, "the swap was audited");
    assert.equal(swapped.metadata.from, "PK-FIRST");
    assert.equal(swapped.metadata.to, "PK-SECOND");

    const ticket = await ticketRepo.findByOrderTruck(load.id);
    assert.ok(ticket, "a ticket was issued");
    assert.equal(ticket.orderTruckId, load.id, "the ticket is bound to this load");
    // The plate lives on the load (single source of truth); the ticket names the
    // truck through that link, and the load now carries the swapped-in truck.
    const reloaded = await orderTruckRepo.findById(load.id);
    assert.equal(reloaded.truckNumber, "PK-SECOND", "the load the ticket points at is the truck that loaded");
  });

  test("a customer can fill in a plate on a pending pickup declaration via the portal", async () => {
    const { accessToken } = await activeFundedCustomer("8", 30000);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ quantity: 30000, trucks: [{ quantity: 30000 }] }));
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const ref = placed.body.data.order.orderNumber;

    const before = await orderTruckRepo.findByOrder(placed.body.data.order.id);
    assert.equal(before.length, 1);
    assert.equal(before[0].truckNumber, null, "plate was left blank at order");

    const res = await request(app)
      .patch(`${ORDERS}/by-ref/${encodeURIComponent(ref)}/trucks`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        trucks: [{ truckNumber: "PK-LATER", quantity: 30000, driverName: "Musa" }],
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.trucks[0].plate, "PK-LATER");
    assert.equal(res.body.data.order.trucks[0].driverName, "Musa");
    assert.equal(res.body.data.order.trucks[0].status, "pending");

    const after = await orderTruckRepo.findByOrder(placed.body.data.order.id);
    assert.equal(after.length, 1);
    assert.equal(after[0].truckNumber, "PK-LATER");
    assert.equal(after[0].driverName, "Musa");
  });

  test("a customer can declare trucks later when they skipped them at order (≤60k)", async () => {
    const { accessToken } = await activeFundedCustomer("9", 30000);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ quantity: 30000 }));
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal((await orderTruckRepo.findByOrder(placed.body.data.order.id)).length, 0);

    const ref = placed.body.data.order.orderNumber;
    const res = await request(app)
      .patch(`${ORDERS}/by-ref/${encodeURIComponent(ref)}/trucks`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ trucks: [{ truckNumber: "PK-NEW", quantity: 30000 }] });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.trucks.length, 1);
    assert.equal(res.body.data.order.trucks[0].plate, "PK-NEW");
  });

  test("customer truck update is refused once a load has gated in", async () => {
    const { accessToken } = await activeFundedCustomer("0", 30000);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ quantity: 30000, trucks: [{ truckNumber: "PK-GATE", quantity: 30000 }] }));
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;
    const ref = placed.body.data.order.orderNumber;
    const load = (await orderTruckRepo.findByOrder(orderId))[0];

    await payOrder(orderId);
    const releaseRes = await request(app)
      .post(`/api/orders/${orderId}/release`)
      .set("Authorization", `Bearer ${release.accessToken}`)
      .send({});
    assert.equal(releaseRes.status, 200, JSON.stringify(releaseRes.body));

    const gate = await request(app)
      .post(`/api/orders/${orderId}/gate-in`)
      .set("Authorization", `Bearer ${entry.accessToken}`)
      .send({ loadId: load.id });
    assert.equal(gate.status, 200, JSON.stringify(gate.body));

    const res = await request(app)
      .patch(`${ORDERS}/by-ref/${encodeURIComponent(ref)}/trucks`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ trucks: [{ truckNumber: "PK-TOO-LATE", quantity: 30000 }] });
    assert.equal(res.status, 409, JSON.stringify(res.body));
  });
});
