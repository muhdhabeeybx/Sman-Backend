// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const { customerRepo, orderRepo, ticketRepo, bankAccountRepo } = require("../repositories");
const orderService = require("../services/order.service");
const { NATIVE_TRANSPORT, closeDb, payOrderWithStatementLine } = require("./helpers");

const PORTAL_AUTH = "/api/customer/auth";
const ORDERS = "/api/customer/orders";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();

const UNIT_PRICE = 100;
const QTY = 20000;
const TOTAL = UNIT_PRICE * QTY;

/**
 * Register a customer, prove the phone (first correct OTP → Active), and seed a
 * virtual account so order creation doesn't reach the external payment provider.
 * Returns the customer row + a native-transport access token.
 */
async function registerActiveCustomer(tag) {
  // Nigerian E.164: +234 + 10 digits. Tag is an integer counter so many
  // customers can share one RUN without colliding or overflowing the length.
  const phone = `+234813${String(RUN).slice(-5)}${String(tag).padStart(2, "0")}`;
  const reg = await request(app).post(`${PORTAL_AUTH}/register`).send({ name: `Cust ${tag}`, phone });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const ver = await request(app)
    .post(`${PORTAL_AUTH}/verify-otp`)
    .set(NATIVE_TRANSPORT)
    .send({ phone, code: DEV_CODE });
  assert.equal(ver.status, 200, JSON.stringify(ver.body));

  const customer = await customerRepo.findByPhone(phone);
  await customerRepo.update(customer.id, {
    virtualAccountNumber: `VA${tag}${String(RUN).slice(-6)}`,
    virtualAccountBank: "Test Bank",
    virtualAccountName: `SOROMANNIGERI/ C${tag}`,
  });
  return { customer, accessToken: ver.body.data.accessToken };
}

describe("customer portal — a customer places their own order", () => {
  let depotId;
  let productId;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Portal Depot",
        code: `POR${String(RUN).slice(-5)}`,
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
      accountName: "Portal Depot Account",
      accountNumber: `PORACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Portal PMS", sku: `POR-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: String(UNIT_PRICE) });
    await db.insert(pfis).values({
      pfiNumber: `PFI-POR-${RUN}`,
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
    companyName: "Test Buyer Co",
    ...extra,
  });

  test("an unfunded customer's order is created Pending/Unpaid with an account to pay into", async () => {
    const { customer, accessToken } = await registerActiveCustomer("1");

    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.order.customerId, customer.id, "the order is the customer's own");
    assert.equal(res.body.data.order.status, "Pending");
    assert.equal(res.body.data.order.paymentStatus, "Unpaid");
    assert.ok(res.body.data.payment.accountNumber, "an account to transfer into is returned");
    assert.equal(res.body.data.order.companyName, "Test Buyer Co", "the company the order is for is stored");
  });

  test("company name is required — an order without one is refused (400)", async () => {
    const { accessToken } = await registerActiveCustomer("50");
    const { companyName, ...noCompany } = body();

    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(noCompany);

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.ok(
      res.body.errors.some((e) => e.path === "companyName"),
      `expected a companyName error, got ${JSON.stringify(res.body.errors)}`,
    );
  });

  test("a blank company name is refused too — not just an absent one (400)", async () => {
    const { accessToken } = await registerActiveCustomer("51");

    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ companyName: "   " }));

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.ok(res.body.errors.some((e) => e.path === "companyName"));
  });

  test("confirming a statement line against an order advances it to Paid and Released", async () => {
    const { customer, accessToken } = await registerActiveCustomer("2");
    // Funded on purpose: the balance must stay exactly where it is. Under the
    // old flow this is the money that would have paid the order.
    await customerRepo.creditBalance(customer.id, TOTAL);

    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());

    // Orders are always created Unpaid now; payment is a separate action.
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.order.paymentStatus, "Unpaid");
    assert.equal(res.body.data.order.status, "Pending");

    // Finance confirms the order against the bank statement line that paid for
    // it — the only way an order becomes Paid now.
    await payOrderWithStatementLine(res.body.data.order.id);

    const order = await orderRepo.findById(res.body.data.order.id);
    assert.equal(order.paymentStatus, "Paid");
    // Payment releases the order in the same transaction — nothing sits at Paid
    // waiting for a desk to wave it through.
    assert.equal(order.status, "Released", "payment cleared it for loading");
    assert.ok(order.releasedAt, "releasedAt stamped by the payment");
    assert.equal(
      Number((await customerRepo.findById(customer.id)).balance),
      TOTAL,
      "the wallet was not touched — the bank statement line paid for the order",
    );
  });

  test("a customer may choose fleet delivery too, not only pickup", async () => {
    const { accessToken } = await registerActiveCustomer("3");
    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ deliveryType: "delivery" }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.order.deliveryType, "delivery");
  });

  test("a delivery order carries the customer's address; dispatch needs a street, not a state", async () => {
    const { accessToken } = await registerActiveCustomer("8");
    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ deliveryType: "delivery", deliveryAddress: "  Plot 18 Oshodi–Apapa Expy  " }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(
      res.body.data.order.deliveryAddress,
      "Plot 18 Oshodi–Apapa Expy",
      "stored trimmed, in the customer's words"
    );
  });

  test("a pickup order ignores any delivery address — the depot is the address", async () => {
    const { accessToken } = await registerActiveCustomer("9");
    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ deliveryType: "pickup", deliveryAddress: "somewhere irrelevant" }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.order.deliveryAddress, "");
  });

  test("the body cannot smuggle a different customer — the order is always the caller's", async () => {
    const { customer, accessToken } = await registerActiveCustomer("4");
    const victim = await registerActiveCustomer("5");

    const res = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body({ customer: victim.customer.id, customerId: victim.customer.id }));

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.order.customerId, customer.id, "ignored the body id, used the token");
  });

  test("placing an order requires authentication", async () => {
    const res = await request(app).post(ORDERS).send(body());
    assert.equal(res.status, 401);
  });

  test("a customer sees their own orders but not another customer's", async () => {
    const a = await registerActiveCustomer("6");
    const b = await registerActiveCustomer("7");

    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send(body());
    assert.equal(placed.status, 201);
    const orderId = placed.body.data.order.id;

    // A's own list contains it.
    const list = await request(app).get(ORDERS).set("Authorization", `Bearer ${a.accessToken}`);
    assert.equal(list.status, 200);
    assert.ok(
      list.body.data.orders.some((o) => o.id === orderId),
      "the order is in the customer's own list"
    );
    assert.ok(
      list.body.data.orders.every((o) => o.customerId === a.customer.id),
      "the list is scoped to the caller"
    );

    // B cannot read A's order — it reads as 404, never leaks.
    const peek = await request(app)
      .get(`${ORDERS}/${orderId}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    assert.equal(peek.status, 404, "another customer's order is not visible");

    // A can read it.
    const own = await request(app)
      .get(`${ORDERS}/${orderId}`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.data.order.id, orderId);
    // Owner detail carries the stage timeline and trucks array so the signed-in
    // page does not need a second hop to the public tracking endpoint.
    assert.ok(own.body.data.order.reached?.received, "reached.received is stamped");
    assert.equal(own.body.data.order.stage, "received");
    assert.ok(typeof own.body.data.order.note === "string");
    assert.ok(Array.isArray(own.body.data.order.trucks), "trucks array is present");
    assert.ok(
      own.body.data.order.paymentConfirmedAt === null ||
        own.body.data.order.paymentConfirmedAt === undefined ||
        typeof own.body.data.order.paymentConfirmedAt === "string",
      "lifecycle stamps are exposed on the owner detail"
    );
  });

  test("by-ref lookup returns the same owner detail keyed by order number", async () => {
    const { accessToken } = await registerActiveCustomer("10");
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    assert.equal(placed.status, 201);
    const { id, orderNumber } = placed.body.data.order;

    const byRef = await request(app)
      .get(`${ORDERS}/by-ref/${encodeURIComponent(orderNumber)}`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(byRef.status, 200, JSON.stringify(byRef.body));
    assert.equal(byRef.body.data.order.id, id);
    assert.equal(byRef.body.data.order.orderNumber, orderNumber);
    assert.ok(byRef.body.data.order.reached?.received);
    assert.ok(Array.isArray(byRef.body.data.order.trucks));

    // Case-insensitive / trimmed — the same normalisation tracking uses.
    const mixed = await request(app)
      .get(`${ORDERS}/by-ref/${encodeURIComponent(orderNumber.toLowerCase())}`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(mixed.status, 200);
    assert.equal(mixed.body.data.order.id, id);

    // An unknown reference is a flat 404.
    const missing = await request(app)
      .get(`${ORDERS}/by-ref/ORD-DOESNOTEXIST`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(missing.status, 404);
  });

  test("by-ref does not leak another customer's order", async () => {
    const a = await registerActiveCustomer("11");
    const b = await registerActiveCustomer("12");
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send(body());
    assert.equal(placed.status, 201);
    const { orderNumber } = placed.body.data.order;

    const peek = await request(app)
      .get(`${ORDERS}/by-ref/${encodeURIComponent(orderNumber)}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    assert.equal(peek.status, 404);
  });

  test("list accepts status / search / date filters and returns pagination.limit", async () => {
    const { accessToken } = await registerActiveCustomer("13");

    // One unpaid Pending order.
    const pending = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    assert.equal(pending.status, 201);
    const pendingNumber = pending.body.data.order.orderNumber;

    // Fund the wallet, place a second order, then pay it so it settles and
    // releases, leaving one Pending order and one Released for the filters.
    await customerRepo.creditBalance(pending.body.data.order.customerId, TOTAL);
    const paid = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    assert.equal(paid.status, 201);
    await payOrderWithStatementLine(paid.body.data.order.id);
    assert.equal((await orderRepo.findById(paid.body.data.order.id)).status, "Released");

    // Status filter: only Pending.
    const onlyPending = await request(app)
      .get(`${ORDERS}?status=Pending`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(onlyPending.status, 200, JSON.stringify(onlyPending.body));
    assert.ok(onlyPending.body.data.orders.every((o) => o.status === "Pending"));
    assert.ok(onlyPending.body.data.orders.some((o) => o.orderNumber === pendingNumber));
    assert.equal(onlyPending.body.data.pagination.limit, 50, "pagination carries the page limit");

    // Search by order number fragment.
    const fragment = pendingNumber.slice(-6);
    const searched = await request(app)
      .get(`${ORDERS}?search=${encodeURIComponent(fragment)}`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(searched.status, 200);
    assert.ok(
      searched.body.data.orders.every((o) => o.orderNumber.includes(fragment)),
      "search narrows to matching order numbers"
    );

    // Pagination: limit is echoed and hard-capped at 100 by the repository.
    const paged = await request(app)
      .get(`${ORDERS}?page=1&limit=1`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(paged.status, 200);
    assert.equal(paged.body.data.orders.length, 1);
    assert.equal(paged.body.data.pagination.limit, 1);
    assert.equal(paged.body.data.pagination.page, 1);
    assert.ok(paged.body.data.pagination.pages >= 2);
    assert.ok(paged.body.data.pagination.total >= 2);

    // Date range with no matches in the far past returns an empty page.
    const empty = await request(app)
      .get(`${ORDERS}?dateFrom=2000-01-01&dateTo=2000-01-02`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(empty.status, 200);
    assert.equal(empty.body.data.orders.length, 0);
    assert.equal(empty.body.data.pagination.total, 0);
  });

  // ── Self-service payment: withdrawn ───────────────────────────────────────
  //
  // POST /orders/:id/pay and /orders/by-ref/:ref/pay settled a customer's own
  // order out of their wallet balance. Both are gone with the rest of the
  // wallet payment path (db/migrations/0021): an order is confirmed by the
  // finance desk against the bank statement line that paid for it, so there is
  // nothing for a customer to press. What the tests below pin is that the
  // endpoints answer with a sentence a person can act on, and — the part that
  // actually matters — that no order can be moved through them.

  test("self-service pay is withdrawn, and moves nothing", async () => {
    const { customer, accessToken } = await registerActiveCustomer("20");
    // Funded, deliberately: a balance that WOULD have covered the order in full
    // is exactly the case that must no longer be able to pay for it.
    await customerRepo.creditBalance(customer.id, TOTAL);

    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;

    const res = await request(app)
      .post(`${ORDERS}/${orderId}/pay`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 410, JSON.stringify(res.body));
    assert.match(res.body.message, /finance desk|bank transfer/i);

    assert.equal((await orderRepo.findById(orderId)).paymentStatus, "Unpaid", "still unpaid");
    assert.equal(
      Number((await customerRepo.findById(customer.id)).balance),
      TOTAL,
      "and the balance was not touched",
    );
  });

  test("self-service pay by reference is withdrawn too", async () => {
    const { customer, accessToken } = await registerActiveCustomer("21");
    await customerRepo.creditBalance(customer.id, TOTAL);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    const ref = placed.body.data.order.orderNumber;

    const res = await request(app)
      .post(`${ORDERS}/by-ref/${encodeURIComponent(ref)}/pay`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 410, JSON.stringify(res.body));
    assert.equal((await orderRepo.findById(placed.body.data.order.id)).paymentStatus, "Unpaid");
    assert.equal(Number((await customerRepo.findById(customer.id)).balance), TOTAL);
  });

  test("paying still requires authentication — the withdrawal is not a way in", async () => {
    const res = await request(app).post(`${ORDERS}/1/pay`).send({});
    assert.equal(res.status, 401);
  });

  // ── Self-service cancel: POST /api/customer/orders/:id/cancel ──────────────

  test("a customer cancels their own unpaid order", async () => {
    const { accessToken } = await registerActiveCustomer("30");
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    const orderId = placed.body.data.order.id;

    const res = await request(app)
      .post(`${ORDERS}/${orderId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.status, "Cancelled");
    assert.equal((await orderRepo.findById(orderId)).status, "Cancelled");
  });

  test("a customer cannot cancel a paid order here (409)", async () => {
    const { customer, accessToken } = await registerActiveCustomer("31");
    await customerRepo.creditBalance(customer.id, TOTAL);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    const orderId = placed.body.data.order.id;
    await payOrderWithStatementLine(orderId);

    const res = await request(app)
      .post(`${ORDERS}/${orderId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal((await orderRepo.findById(orderId)).status, "Released", "the paid order is untouched");
  });

  test("a customer cannot cancel another customer's order — 404", async () => {
    const owner = await registerActiveCustomer("32");
    const intruder = await registerActiveCustomer("33");
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(body());
    const orderId = placed.body.data.order.id;

    const res = await request(app)
      .post(`${ORDERS}/${orderId}/cancel`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({});
    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal((await orderRepo.findById(orderId)).status, "Pending", "the owner's order is untouched");
  });

  test("cancelling requires authentication", async () => {
    const res = await request(app).post(`${ORDERS}/1/cancel`).send({});
    assert.equal(res.status, 401);
  });

  // ── Cancel an order by reference: POST /orders/by-ref/:ref/cancel ──────────

  test("a customer cancels their own unpaid order by its reference", async () => {
    const { accessToken } = await registerActiveCustomer("40");
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    const { id, orderNumber } = placed.body.data.order;

    const res = await request(app)
      .post(`${ORDERS}/by-ref/${encodeURIComponent(orderNumber)}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.status, "Cancelled");
    assert.equal((await orderRepo.findById(id)).status, "Cancelled");
  });

  test("a customer cannot cancel a paid order by reference (409), and it is untouched", async () => {
    const { customer, accessToken } = await registerActiveCustomer("41");
    await customerRepo.creditBalance(customer.id, TOTAL);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    const { id, orderNumber } = placed.body.data.order;
    await payOrderWithStatementLine(id);

    const res = await request(app)
      .post(`${ORDERS}/by-ref/${encodeURIComponent(orderNumber)}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal((await orderRepo.findById(id)).status, "Released", "the paid order is untouched");
  });

  test("a customer cannot cancel another customer's order by reference — 404", async () => {
    const owner = await registerActiveCustomer("42");
    const intruder = await registerActiveCustomer("43");
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(body());
    const { id, orderNumber } = placed.body.data.order;

    const res = await request(app)
      .post(`${ORDERS}/by-ref/${encodeURIComponent(orderNumber)}/cancel`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({});
    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal((await orderRepo.findById(id)).status, "Pending", "the owner's order is untouched");
  });

  test("cancelling an unknown reference — 404", async () => {
    const { accessToken } = await registerActiveCustomer("44");
    const res = await request(app)
      .post(`${ORDERS}/by-ref/ORD-DOESNOTEXIST/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 404, JSON.stringify(res.body));
  });

  test("post-payment effects are idempotent — re-running creates no duplicate ticket", async () => {
    const { customer, accessToken } = await registerActiveCustomer("37");
    await customerRepo.creditBalance(customer.id, TOTAL);
    const placed = await request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body());
    const orderId = placed.body.data.order.id;
    await payOrderWithStatementLine(orderId);

    const ticket = await ticketRepo.findByOrder(orderId);
    assert.ok(ticket, "payment generated a loading ticket");

    // Reconcile again — must heal without duplicating. (runPostPaymentEffects
    // also reports a subaccountTransfer effect now; we only assert the two this
    // test is about — the ticket and commission heal idempotently.)
    const result = await orderService.runPostPaymentEffects(orderId);
    assert.equal(result.ticket, true, "re-run heals the ticket");
    assert.equal(result.commission, true, "re-run heals the commission");
    assert.equal(
      (await ticketRepo.findByOrder(orderId)).id,
      ticket.id,
      "the same ticket, not a duplicate"
    );
  });
});
