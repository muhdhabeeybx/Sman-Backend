// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis, orders } = require("../db/schema");
const { eq } = require("drizzle-orm");
const { customerRepo, pfiRepo, orderRepo, bankAccountRepo } = require("../repositories");
const { placeOrder } = require("../services/order.service");
const { closeDb } = require("./helpers");

const RUN = Date.now();
const UNIT_PRICE = 100;

describe("placeOrder idempotency — a redelivered request must not order twice", () => {
  let customerId;
  let depotId;
  let productId;
  let pfiId;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Idem Depot",
        code: `IDM${String(RUN).slice(-5)}`,
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
      accountName: "Idem Depot Account",
      accountNumber: `IDMACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Idem PMS", sku: `IDM-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: String(UNIT_PRICE) });
    const [pfi] = await db
      .insert(pfis)
      .values({
        pfiNumber: `PFI-IDM-${RUN}`,
        status: "active",
        locationId: depotId,
        productId,
        startingQtyLitres: 2000000,
        soldQtyLitres: 0,
      })
      .returning();
    pfiId = pfi.id;

    // Balance 0: the wallet hold fails cleanly and the order stays Pending —
    // no ticket generation, no wallet noise; virtual account pre-set so the
    // service never reaches for Paystack.
    const customer = await customerRepo.create({
      name: "Idem Customer",
      phone: `+234816${String(RUN).slice(-6)}9`,
      status: "Active",
      virtualAccountNumber: `VIDM${String(RUN).slice(-6)}`,
      virtualAccountBank: "Test Bank",
      virtualAccountName: "SOROMANNIGERI/ IC",
    });
    customerId = customer.id;
  });

  after(async () => {
    await closeDb();
  });

  const order = (overrides = {}) =>
    placeOrder({
      customerId,
      state: "Lagos",
      depotId,
      productId,
      quantity: 5000,
      deliveryType: "pickup",
      trucks: [],
      ...overrides,
    });

  test("the same key twice returns the original order, reserves stock once", async () => {
    const key = `wamid.IDEM-${RUN}-1`;
    const first = await order({ idempotencyKey: key });
    assert.ok(first.order.id, "first call created an order");
    assert.ok(!first.alreadyProcessed);

    const soldAfterFirst = Number((await pfiRepo.findById(pfiId)).soldQtyLitres);

    const second = await order({ idempotencyKey: key });
    assert.equal(second.order.id, first.order.id, "same order back, not a duplicate");
    assert.equal(second.alreadyProcessed, true);
    assert.equal(second.payment.accountNumber, first.payment.accountNumber);

    const soldAfterSecond = Number((await pfiRepo.findById(pfiId)).soldQtyLitres);
    assert.equal(soldAfterSecond, soldAfterFirst, "no additional stock reserved by the replay");

    const rows = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
    assert.equal(rows.length, 1, "exactly one order carries the key");
  });

  test("different keys create different orders", async () => {
    const a = await order({ idempotencyKey: `wamid.IDEM-${RUN}-A` });
    const b = await order({ idempotencyKey: `wamid.IDEM-${RUN}-B` });
    assert.notEqual(a.order.id, b.order.id);
  });

  test("no key keeps today's behaviour — every call is a new order", async () => {
    const a = await order();
    const b = await order();
    assert.notEqual(a.order.id, b.order.id);
    assert.equal(a.order.idempotencyKey ?? null, null);
  });

  test("concurrent same-key calls: exactly one order wins the race", async () => {
    const key = `wamid.IDEM-${RUN}-RACE`;
    const [a, b] = await Promise.all([order({ idempotencyKey: key }), order({ idempotencyKey: key })]);
    assert.equal(a.order.id, b.order.id, "both callers got the same order");
    assert.ok(a.alreadyProcessed || b.alreadyProcessed, "one of the two was a replay");
    const rows = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
    assert.equal(rows.length, 1);
  });

  test("the replay lookup exists on the repository", async () => {
    const key = `wamid.IDEM-${RUN}-1`;
    const found = await orderRepo.findByIdempotencyKey(key);
    assert.ok(found, "findByIdempotencyKey resolves the order");
  });
});
