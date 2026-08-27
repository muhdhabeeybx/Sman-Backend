// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { eq } = require("drizzle-orm");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis, orders } = require("../db/schema");
const { customerRepo, bankAccountRepo } = require("../repositories");
const orderService = require("../services/order.service");
const { NATIVE_TRANSPORT, closeDb } = require("./helpers");

const PORTAL_AUTH = "/api/customer/auth";
const ORDERS = "/api/customer/orders";
const DASHBOARD = "/api/customer/dashboard";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();

const UNIT_PRICE = 100;
const QTY = 20000;
const TOTAL = UNIT_PRICE * QTY;

async function registerActiveCustomer(tag) {
  const phone = `+234815${String(RUN).slice(-6)}${tag}`;
  const reg = await request(app).post(`${PORTAL_AUTH}/register`).send({ name: `Dash ${tag}`, phone });
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
    virtualAccountName: `SOROMANNIGERI/ D${tag}`,
  });
  return { customer, accessToken: ver.body.data.accessToken };
}

describe("customer portal — dashboard", () => {
  let depotId;
  let productId;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Dash Depot",
        code: `DASH${String(RUN).slice(-5)}`,
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
      accountName: "Dash Depot Account",
      accountNumber: `DASHACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Dash PMS", sku: `DASH-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: String(UNIT_PRICE) });
    await db.insert(pfis).values({
      pfiNumber: `PFI-DASH-${RUN}`,
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

  const placeOrder = (accessToken) =>
    request(app)
      .post(ORDERS)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ depot: depotId, product: productId, state: "Lagos", quantity: QTY, deliveryType: "pickup", companyName: "Dash Co" });

  test("requires authentication", async () => {
    const res = await request(app).get(DASHBOARD);
    assert.equal(res.status, 401);
  });

  test("a fresh customer sees an empty, zeroed dashboard with a dense trend", async () => {
    const { accessToken } = await registerActiveCustomer("1");
    const res = await request(app).get(DASHBOARD).set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const { wallet, month, trend, orders } = res.body.data;
    assert.equal(wallet.balance, 0);
    assert.equal(month.orders, 0);
    assert.equal(month.litres, 0);
    assert.equal(month.spent, 0);
    assert.equal(orders.length, 0);
    // One point per day from the 1st through today — never empty.
    assert.ok(Array.isArray(trend) && trend.length >= 1, "trend is a dense daily series");
    assert.ok(trend.every((p) => p.spent === 0), "no spend yet");
    assert.match(trend[0].date, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("the wallet balance is the customer's own, exposed only here", async () => {
    const { customer, accessToken } = await registerActiveCustomer("2");
    await customerRepo.creditBalance(customer.id, 750000);
    const res = await request(app).get(DASHBOARD).set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.body.data.wallet.balance, 750000);
  });

  test("an unpaid order counts toward month orders/litres but not spent", async () => {
    const { accessToken } = await registerActiveCustomer("3");
    const placed = await placeOrder(accessToken);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal(placed.body.data.order.paymentStatus, "Unpaid");

    const res = await request(app).get(DASHBOARD).set("Authorization", `Bearer ${accessToken}`);
    const { month, orders } = res.body.data;
    assert.equal(month.orders, 1, "the order is counted");
    assert.equal(month.litres, QTY, "its litres are counted");
    assert.equal(month.spent, 0, "but nothing is 'spent' until payment confirms");
    assert.equal(orders.length, 1, "it appears in recent orders");
    assert.equal(orders[0].productCategory, "PMS", "the trade code the portal badges the order with");
  });

  test("an expired order does not count toward month orders or litres", async () => {
    const { accessToken } = await registerActiveCustomer("7");
    const placed = await placeOrder(accessToken);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    const orderId = placed.body.data.order.id;

    // Push the order past the payment window, then sweep it to Expired.
    await db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(orders.id, orderId));
    const expired = await orderService.expireStaleOrders();
    assert.ok(expired >= 1, "the sweep expired at least this order");

    const res = await request(app).get(DASHBOARD).set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { month, orders: recent } = res.body.data;
    assert.equal(month.orders, 0, "lapsed orders are not counted as orders");
    assert.equal(month.litres, 0, "nor do their litres count");
    assert.equal(month.spent, 0, "and nothing was paid");
    assert.equal(recent.length, 1, "the order still appears in recent history");
    assert.equal(recent[0].status, "Expired");
  });

  test("a wallet-paid order lands in month spent and the day's trend point", async () => {
    const { customer, accessToken } = await registerActiveCustomer("4");
    await customerRepo.creditBalance(customer.id, TOTAL);
    const placed = await placeOrder(accessToken);
    assert.equal(placed.status, 201, JSON.stringify(placed.body));
    assert.equal(placed.body.data.order.paymentStatus, "Unpaid");

    // Pay the order from the wallet so it becomes confirmed spend.
    await orderService.payOrder({ orderId: placed.body.data.order.id, actor: { type: "system" } });

    const res = await request(app).get(DASHBOARD).set("Authorization", `Bearer ${accessToken}`);
    const { month, trend } = res.body.data;
    assert.equal(month.spent, TOTAL, "a confirmed payment is spend");
    const todaysSpend = trend[trend.length - 1].spent;
    assert.equal(todaysSpend, TOTAL, "today's trend point carries it");
  });

  test("the dashboard is scoped — one customer never sees another's numbers", async () => {
    const a = await registerActiveCustomer("5");
    const b = await registerActiveCustomer("6");
    await customerRepo.creditBalance(a.customer.id, TOTAL);
    await placeOrder(a.accessToken);

    const res = await request(app).get(DASHBOARD).set("Authorization", `Bearer ${b.accessToken}`);
    assert.equal(res.body.data.month.orders, 0, "B sees none of A's orders");
    assert.equal(res.body.data.wallet.balance, 0, "nor A's wallet");
  });
});
