// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const {
  customerRepo,
  orderRepo,
  orderTruckRepo,
  ticketRepo,
  auditLogRepo,
  bankAccountRepo,
} = require("../repositories");
const { staffTokenWithRoles, NATIVE_TRANSPORT, closeDb, makeStatementLine } = require("./helpers");

const PORTAL = "/api/customer/auth";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();

/**
 * THE WHOLE ORDER JOURNEY, end to end, through the real HTTP surface.
 *
 * A customer registers and proves their phone; the desk creates a wallet-funded
 * order (which the payment path advances to Paid); the release desk allocates
 * the fleet trucks; entrance security gates each truck in (opening Loading);
 * ticketing loads each and issues its ticket; exit security gates each out, and
 * the last one out completes the order. Every actor is a different role — this
 * is the composition test: each step's output feeds the next, and the audit
 * trail must read Paid → Released → Loading → Completed at the end.
 *
 * Only two things are stubbed, and only to keep the test about the lifecycle:
 * the customer's virtual account + wallet balance are seeded directly (standing
 * in for a funded Paystack wallet), so order creation pays from the wallet
 * without reaching the external payment provider.
 */
describe("integration — customer register → order → release → gates → completed", () => {
  let depotId;
  let productId;
  let customerId;

  // The people at each post.
  let desk; // super_admin — the walk-in desk that creates the order
  let release; // release desk
  let entry; // entrance-gate security
  let ticketing; // ticketing
  let exit; // exit-gate security

  // A valid NG mobile (813 prefix) with a per-run unique tail.
  const PHONE = `+234813${String(RUN).slice(-7)}`;
  const UNIT_PRICE = 100;
  const ORDER_QTY = 60000; // two 30,000 L trucks
  const TOTAL = UNIT_PRICE * ORDER_QTY;

  before(async () => {
    // Depot + product + configured price + a stocked, active PFI.
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Journey Depot",
        code: `JRN${String(RUN).slice(-5)}`,
        address: "1 Depot Rd",
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
      accountName: "Journey Depot Account",
      accountNumber: `JRNACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Journey PMS", sku: `JRN-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({
      depotId,
      productId,
      currentPrice: String(UNIT_PRICE),
    });

    await db.insert(pfis).values({
      pfiNumber: `PFI-JRN-${RUN}`,
      status: "active",
      locationId: depotId,
      productId,
      startingQtyLitres: 500000,
      soldQtyLitres: 0,
    });

    desk = await staffTokenWithRoles(["super_admin"], "test-jrny-desk@soroman.test");
    release = await staffTokenWithRoles(["release"], "test-jrny-release@soroman.test");
    entry = await staffTokenWithRoles(["security_entry"], "test-jrny-entry@soroman.test");
    ticketing = await staffTokenWithRoles(["ticketing"], "test-jrny-ticketing@soroman.test");
    exit = await staffTokenWithRoles(["security_exit"], "test-jrny-exit@soroman.test");
  });

  after(async () => {
    await closeDb();
  });

  test("the full lifecycle, every post played by its own role", async () => {
    // ── 1. Customer self-registers and proves their phone ────────────────────
    const registered = await request(app)
      .post(`${PORTAL}/register`)
      .send({ name: "Journey Customer", phone: PHONE });
    assert.equal(registered.status, 200, JSON.stringify(registered.body));

    const verified = await request(app)
      .post(`${PORTAL}/verify-otp`)
      .set(NATIVE_TRANSPORT)
      .send({ phone: PHONE, code: DEV_CODE });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.ok(verified.body.data.accessToken, "customer got a session on first correct OTP");

    const customer = await customerRepo.findByPhone(PHONE);
    customerId = customer.id;
    assert.equal(customer.status, "Active", "first correct OTP proved the number");

    // Seed a funded wallet + virtual account (stands in for a funded Paystack
    // wallet) so order creation pays from the wallet, no external call.
    await customerRepo.update(customerId, {
      virtualAccountNumber: "1234567890",
      virtualAccountBank: "Test Bank",
      virtualAccountName: "SOROMANNIGERI/ JC",
    });
    await customerRepo.creditBalance(customerId, TOTAL);

    // ── 2. The desk creates the order (Unpaid), then finance pays it ─────────
    const placed = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${desk.accessToken}`)
      .send({
        customer: customerId,
        depot: depotId,
        product: productId,
        state: "Lagos",
        quantity: ORDER_QTY,
        deliveryType: "delivery",
        companyName: "Journey Co",
      });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;

    let order = await orderRepo.findById(orderId);
    assert.equal(order.paymentStatus, "Unpaid", "created Unpaid, awaiting payment");

    // Finance confirms the order against the bank statement line that paid for
    // it. There is no other way to pay an order, and no amount is sent — the
    // amount is whatever the bank says the line is worth.
    const { bankAccountId, lineIds } = await makeStatementLine(order.totalAmount, "JOURNEY PAYER");
    const paid = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set("Authorization", `Bearer ${desk.accessToken}`)
      .send({ bankAccountId, lineIds });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.data.payment.reconciled, true, "a statement line stands behind it");
    assert.equal(paid.body.data.payment.shortfall, 0);

    order = await orderRepo.findById(orderId);
    assert.equal(order.paymentStatus, "Paid", "the statement line covered it");
    assert.equal(order.status, "Released", "payment released it in the same transaction");
    assert.ok(order.paymentConfirmedAt, "paymentConfirmedAt stamped");
    assert.ok(order.releasedAt, "releasedAt stamped");
    // And the customer's wallet balance is untouched — it plays no part.
    assert.equal(Number((await customerRepo.findById(customerId)).balance), TOTAL);

    // ── 3. Release desk allocates the fleet trucks ───────────────────────────
    // The order is already Released; this call is here for the allocation, and
    // the transition it used to drive is a no-op.
    const released = await request(app)
      .post(`/api/orders/${orderId}/release`)
      .set("Authorization", `Bearer ${release.accessToken}`)
      .send({
        trucks: [
          { truckNumber: "JRN-T1", quantity: 30000, driverName: "Musa", driverPhone: "+2348010000001" },
          { truckNumber: "JRN-T2", quantity: 30000, driverName: "Ben", driverPhone: "+2348010000002" },
        ],
      });
    assert.equal(released.status, 200, JSON.stringify(released.body));
    assert.equal(released.body.data.order.status, "Released");

    const loads = await orderTruckRepo.findByOrder(orderId);
    assert.equal(loads.length, 2, "two loads allocated");
    const [t1, t2] = loads;

    // ── 4. Entrance security gates each truck in (first opens Loading) ────────
    let res = await request(app)
      .post(`/api/orders/${orderId}/gate-in`)
      .set("Authorization", `Bearer ${entry.accessToken}`)
      .send({ loadId: t1.id });
    assert.equal(res.status, 200);
    assert.equal((await orderRepo.findById(orderId)).status, "Loading", "first truck opened Loading");

    res = await request(app)
      .post(`/api/orders/${orderId}/gate-in`)
      .set("Authorization", `Bearer ${entry.accessToken}`)
      .send({ loadId: t2.id });
    assert.equal(res.status, 200);

    // ── 5. Ticketing confirms each loading and issues its ticket ─────────────
    // A truck already through the entrance gate keeps that state — being marked
    // loaded afterwards must not read as though it were back outside.
    for (const t of [t1, t2]) {
      res = await request(app)
        .post(`/api/orders/${orderId}/trucks/${t.id}/load`)
        .set("Authorization", `Bearer ${ticketing.accessToken}`)
        .send({});
      assert.equal(res.status, 200);
      assert.equal(res.body.data.truck.status, "gated_in");
      assert.ok(res.body.data.truck.loadedAt, "the loading is stamped");
      const ticket = await ticketRepo.findByOrderTruck(t.id);
      assert.ok(ticket, `truck ${t.truckIndex} has a ticket`);
      assert.ok(ticket.ticketNumber.endsWith(`-${t.truckIndex}`), "per-truck ticket number");
    }

    // ── 6. Exit security gates each out; the last completes the order ────────
    res = await request(app)
      .post(`/api/orders/${orderId}/trucks/${t1.id}/gate-out`)
      .set("Authorization", `Bearer ${exit.accessToken}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.orderCompleted, false, "one truck still inside");
    assert.equal((await orderRepo.findById(orderId)).status, "Loading");

    res = await request(app)
      .post(`/api/orders/${orderId}/trucks/${t2.id}/gate-out`)
      .set("Authorization", `Bearer ${exit.accessToken}`)
      .send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.orderCompleted, true, "last truck out completed the order");

    // ── 7. Final state + the audit trail tells the whole story ───────────────
    order = await orderRepo.findById(orderId);
    assert.equal(order.status, "Completed");
    assert.ok(order.completedAt, "completedAt stamped");

    const finalLoads = await orderTruckRepo.findByOrder(orderId);
    assert.ok(finalLoads.every((l) => l.status === "gated_out"), "every truck has left");

    const timeline = await auditLogRepo.findStateTimeline("order", orderId);
    assert.deepEqual(
      timeline.map((e) => e.newState),
      ["Paid", "Released", "Loading", "Completed"],
      "the audit trail is the full pipeline, in order"
    );
    // The Paid step is now a staff action (finance's manual "Pay Now"); the
    // rest were staff at their posts. Release rides on the payment, so it is
    // attributed to whoever took the money — not to the release desk, whose
    // call arrived afterwards and found the work already done.
    const paidEvent = timeline.find((e) => e.newState === "Paid");
    assert.equal(paidEvent.actorType, "staff");
    assert.equal(paidEvent.actorStaffId, desk.staff.id);
    const releasedEvent = timeline.find((e) => e.newState === "Released");
    assert.equal(releasedEvent.actorType, "staff");
    assert.equal(releasedEvent.actorStaffId, desk.staff.id);
    assert.equal(releasedEvent.metadata?.trigger, "payment");

    // The audit trail records every business event, not only state changes:
    // creation is there before any transition, and each truck's physical
    // movements are logged per load.
    const orderEvents = (await auditLogRepo.findByEntity("order", orderId)).map((e) => e.action);
    assert.ok(orderEvents.includes("order.created"), "order.created is recorded");
    assert.equal(orderEvents[0], "order.created", "creation is the first event on the order");

    for (const t of finalLoads) {
      const truckActions = (await auditLogRepo.findByEntity("order_truck", t.id)).map((e) => e.action);
      for (const a of ["order_truck.allocated", "order_truck.gated_in", "order_truck.loaded", "order_truck.gated_out"]) {
        assert.ok(truckActions.includes(a), `${a} logged for load ${t.id}`);
      }
    }
  });

  test("the same journey, but the CUSTOMER places their own order", async () => {
    // Identical to the first journey in every downstream step — the only
    // difference is the door the order comes through: the customer places it
    // themselves at the portal, not the desk. Everything after must behave the
    // same, proving the two order-entry paths converge on one lifecycle.
    const phone = `+234813${String(RUN).slice(-6)}9`;

    // ── 1. Customer registers, proves the phone, funds the wallet ────────────
    const registered = await request(app)
      .post(`${PORTAL}/register`)
      .send({ name: "Self Serve", phone });
    assert.equal(registered.status, 200, JSON.stringify(registered.body));

    const verified = await request(app)
      .post(`${PORTAL}/verify-otp`)
      .set(NATIVE_TRANSPORT)
      .send({ phone, code: DEV_CODE });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const customerToken = verified.body.data.accessToken;

    const cust = await customerRepo.findByPhone(phone);
    await customerRepo.update(cust.id, {
      virtualAccountNumber: "1234500009",
      virtualAccountBank: "Test Bank",
      virtualAccountName: "SOROMANNIGERI/ SS",
    });
    await customerRepo.creditBalance(cust.id, TOTAL);

    // ── 2. The customer places their OWN order (Unpaid), finance pays it ─────
    const placed = await request(app)
      .post("/api/customer/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        depot: depotId,
        product: productId,
        state: "Lagos",
        quantity: ORDER_QTY,
        deliveryType: "delivery",
        companyName: "Journey Co",
      });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;
    assert.equal(placed.body.data.order.customerId, cust.id, "the order is the customer's own");
    assert.equal(placed.body.data.order.status, "Pending", "created Unpaid, awaiting payment");

    const { bankAccountId: acct, lineIds: lines } = await makeStatementLine(
      placed.body.data.order.totalAmount,
      "JOURNEY PAYER",
    );
    const settled = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set("Authorization", `Bearer ${desk.accessToken}`)
      .send({ bankAccountId: acct, lineIds: lines });
    assert.equal(settled.status, 200, JSON.stringify(settled.body));
    assert.equal((await orderRepo.findById(orderId)).status, "Released", "payment released it");

    // ── 3. Release desk allocates the fleet trucks ──────────────────────────
    const released = await request(app)
      .post(`/api/orders/${orderId}/release`)
      .set("Authorization", `Bearer ${release.accessToken}`)
      .send({
        trucks: [
          { truckNumber: "SS-T1", quantity: 30000, driverName: "Ada", driverPhone: "+2348010000003" },
          { truckNumber: "SS-T2", quantity: 30000, driverName: "Uche", driverPhone: "+2348010000004" },
        ],
      });
    assert.equal(released.status, 200, JSON.stringify(released.body));
    const [t1, t2] = await orderTruckRepo.findByOrder(orderId);

    // ── 4. Gate each in (first opens Loading), load each, gate each out ─────
    for (const t of [t1, t2]) {
      const gin = await request(app)
        .post(`/api/orders/${orderId}/gate-in`)
        .set("Authorization", `Bearer ${entry.accessToken}`)
        .send({ loadId: t.id });
      assert.equal(gin.status, 200, JSON.stringify(gin.body));
    }
    assert.equal((await orderRepo.findById(orderId)).status, "Loading");

    for (const t of [t1, t2]) {
      const load = await request(app)
        .post(`/api/orders/${orderId}/trucks/${t.id}/load`)
        .set("Authorization", `Bearer ${ticketing.accessToken}`)
        .send({});
      assert.equal(load.status, 200);
      assert.ok(await ticketRepo.findByOrderTruck(t.id), "each truck ticketed");
    }

    const out1 = await request(app)
      .post(`/api/orders/${orderId}/trucks/${t1.id}/gate-out`)
      .set("Authorization", `Bearer ${exit.accessToken}`)
      .send({});
    assert.equal(out1.body.data.orderCompleted, false);

    const out2 = await request(app)
      .post(`/api/orders/${orderId}/trucks/${t2.id}/gate-out`)
      .set("Authorization", `Bearer ${exit.accessToken}`)
      .send({});
    assert.equal(out2.body.data.orderCompleted, true, "last truck out completed it");

    // ── 5. Same destination as the desk-placed order ────────────────────────
    assert.equal((await orderRepo.findById(orderId)).status, "Completed");
    const timeline = await auditLogRepo.findStateTimeline("order", orderId);
    assert.deepEqual(
      timeline.map((e) => e.newState),
      ["Paid", "Released", "Loading", "Completed"],
      "a customer-placed order reaches the same pipeline end"
    );
  });

  test("pickup of any amount can be placed without declaring trucks", async () => {
    const phone = `+234813${String(RUN).slice(-6)}7`;

    const registered = await request(app)
      .post(`${PORTAL}/register`)
      .send({ name: "Big Pickup", phone });
    assert.equal(registered.status, 200, JSON.stringify(registered.body));

    const verified = await request(app)
      .post(`${PORTAL}/verify-otp`)
      .set(NATIVE_TRANSPORT)
      .send({ phone, code: DEV_CODE });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));

    const cust = await customerRepo.findByPhone(phone);
    await customerRepo.update(cust.id, {
      virtualAccountNumber: "1234500007",
      virtualAccountBank: "Test Bank",
      virtualAccountName: "SOROMANNIGERI/ BP",
    });

    // 120,000 L — well over one tanker — with no trucks declared. Desk and
    // portal may both book it as a single pickup; security splits it across
    // trucks at the gate.
    const placed = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${desk.accessToken}`)
      .send({
        customer: cust.id,
        depot: depotId,
        product: productId,
        state: "Lagos",
        quantity: 120000,
        deliveryType: "pickup",
        companyName: "Big Pickup Co",
      });
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;

    const loads = await orderTruckRepo.findByOrder(orderId);
    assert.equal(loads.length, 0, "no loads declared at order; captured at the gate");

    const portal = await request(app)
      .post("/api/customer/orders")
      .set("Authorization", `Bearer ${verified.body.data.accessToken}`)
      .send({
        depot: depotId,
        product: productId,
        state: "Lagos",
        quantity: 90000,
        deliveryType: "pickup",
        companyName: "Big Pickup Co",
      });
    assert.equal(portal.status, 201, JSON.stringify(portal.body));
    assert.equal(
      (await orderTruckRepo.findByOrder(portal.body.data.order.id)).length,
      0,
      "portal pickup also defers trucks to the gate"
    );
  });
});
