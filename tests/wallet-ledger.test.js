// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { eq, inArray } = require("drizzle-orm");

const { db } = require("../config/db");
const {
  customers,
  depots,
  products,
  orders,
  walletHolds,
  deposits,
  orderDepositAllocations,
} = require("../db/schema");
const walletService = require("../services/wallet.service");
const { closeDb } = require("./helpers");

// The property under test throughout:
//   customers.balance = credits - debits - active holds
// checked after every operation via getLedgerBalance().

const suffix = Date.now().toString(36);

const currentBalance = async (customerId) => {
  const [row] = await db.select().from(customers).where(eq(customers.id, customerId));
  return Number(row.balance);
};

const assertLedgerMatchesBalance = async (customerId) => {
  const ledger = await walletService.getLedgerBalance(customerId);
  const balance = await currentBalance(customerId);
  assert.equal(ledger, balance, "ledger-derived balance must equal customers.balance");
};

describe("wallet ledger", () => {
  let customer;
  let depot;
  let product;
  let orderSeq = 0;

  const makeOrder = async (totalAmount) => {
    orderSeq += 1;
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-WALLETTEST-${suffix}-${orderSeq}`,
        customerId: customer.id,
        state: "Lagos",
        depotId: depot.id,
        productId: product.id,
        quantity: 100,
        price: "1.00",
        totalAmount: String(totalAmount),
        deliveryType: "pickup",
      })
      .returning();
    return order;
  };

  before(async () => {
    [customer] = await db
      .insert(customers)
      .values({
        name: "Wallet Ledger Test",
        phone: `+23480${String(Date.now()).slice(-8)}`,
        balance: "0",
      })
      .returning();

    [depot] = await db
      .insert(depots)
      .values({
        name: `Wallet Test Depot ${suffix}`,
        code: `WTD-${suffix}`,
        address: "1 Test Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        postcode: "100001",
        maxCapacity: 1000000,
        establishedYear: "2020",
      })
      .returning();

    [product] = await db
      .insert(products)
      .values({
        name: `Wallet Test Product ${suffix}`,
        sku: `WTP-${suffix}`,
        category: "PMS",
      })
      .returning();
  });

  after(async () => {
    // FK order: allocations reference orders/deposits; holds reference orders.
    const customerOrderIds = (
      await db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, customer.id))
    ).map((row) => row.id);
    if (customerOrderIds.length) {
      await db
        .delete(orderDepositAllocations)
        .where(inArray(orderDepositAllocations.orderId, customerOrderIds));
    }
    await db.delete(walletHolds).where(eq(walletHolds.customerId, customer.id));
    await db.delete(deposits).where(eq(deposits.customerId, customer.id));
    await db.delete(orders).where(eq(orders.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await db.delete(products).where(eq(products.id, product.id));
    await db.delete(depots).where(eq(depots.id, depot.id));
    await closeDb();
  });

  test("credit writes a ledger row and moves the balance atomically", async () => {
    const result = await walletService.credit({
      customerId: customer.id,
      amount: 10000,
      description: "test credit",
      reference: `wallet-test-credit-${suffix}`,
    });

    assert.equal(result.success, true);
    assert.equal(Number(result.deposit.amount), 10000);
    assert.equal(Number(result.deposit.balanceAfter), 10000);
    assert.equal(await currentBalance(customer.id), 10000);
    await assertLedgerMatchesBalance(customer.id);
  });

  test("credit with a seen reference is a no-op, not a double credit", async () => {
    const result = await walletService.credit({
      customerId: customer.id,
      amount: 10000,
      reference: `wallet-test-credit-${suffix}`,
    });

    assert.equal(result.success, true);
    assert.equal(result.alreadyProcessed, true);
    assert.equal(await currentBalance(customer.id), 10000);
    await assertLedgerMatchesBalance(customer.id);
  });

  test("concurrent credits with the same reference credit exactly once", async () => {
    // Two webhook deliveries racing: both pass the pre-check, the partial
    // unique index on deposits.reference stops the second insert, and the
    // loser reports alreadyProcessed instead of crashing.
    const reference = `wallet-test-race-credit-${suffix}`;
    const results = await Promise.all([
      walletService.credit({ customerId: customer.id, amount: 5000, reference }),
      walletService.credit({ customerId: customer.id, amount: 5000, reference }),
    ]);

    assert.equal(results.filter((r) => r.success).length, 2, "both calls report success");
    assert.equal(
      results.filter((r) => r.alreadyProcessed).length,
      1,
      "exactly one call is a duplicate no-op"
    );
    assert.equal(await currentBalance(customer.id), 15000);
    await assertLedgerMatchesBalance(customer.id);

    // Put the balance back so the later tests keep their arithmetic.
    const undo = await walletService.debit({
      customerId: customer.id,
      amount: 5000,
      description: "undo race-credit fixture",
    });
    assert.equal(undo.success, true);
    assert.equal(await currentBalance(customer.id), 10000);
  });

  test("debit beyond the balance fails closed", async () => {
    const result = await walletService.debit({
      customerId: customer.id,
      amount: 999999,
      description: "should not happen",
    });

    assert.equal(result.success, false);
    assert.equal(result.insufficient, true);
    assert.equal(await currentBalance(customer.id), 10000);
  });

  test("concurrent debits cannot overspend the balance", async () => {
    // Two 6000 debits against a 10000 balance: exactly one may win. Without
    // the FOR UPDATE lock both read 10000, both pass the check, and the
    // customer ends up at -2000.
    const results = await Promise.all([
      walletService.debit({ customerId: customer.id, amount: 6000, description: "racer A" }),
      walletService.debit({ customerId: customer.id, amount: 6000, description: "racer B" }),
    ]);

    const wins = results.filter((r) => r.success).length;
    assert.equal(wins, 1, "exactly one concurrent debit must succeed");
    assert.equal(await currentBalance(customer.id), 4000);
    await assertLedgerMatchesBalance(customer.id);
  });

  test("hold lifecycle: place reduces balance, release restores it", async () => {
    const order = await makeOrder(1500);

    const placed = await walletService.placeHold({
      customerId: customer.id,
      orderId: order.id,
      amount: 1500,
    });
    assert.equal(placed.success, true);
    assert.equal(await currentBalance(customer.id), 2500);
    await assertLedgerMatchesBalance(customer.id);

    // Second hold on the same order must fail, not stack.
    const duplicate = await walletService.placeHold({
      customerId: customer.id,
      orderId: order.id,
      amount: 1500,
    });
    assert.equal(duplicate.success, false);
    assert.equal(duplicate.alreadyHeld, true);

    const released = await walletService.releaseHold(order.id);
    assert.equal(released.success, true);
    assert.equal(await currentBalance(customer.id), 4000);
    await assertLedgerMatchesBalance(customer.id);

    // A released hold cannot be released (or converted) again.
    const releasedTwice = await walletService.releaseHold(order.id);
    assert.equal(releasedTwice.success, false);
    const convertedAfterRelease = await walletService.convertHold(order.id);
    assert.equal(convertedAfterRelease.success, false);
    assert.equal(await currentBalance(customer.id), 4000);
  });

  test("converting a hold writes the debit ledger row without moving the balance", async () => {
    const order = await makeOrder(3000);

    await walletService.placeHold({
      customerId: customer.id,
      orderId: order.id,
      amount: 3000,
    });
    assert.equal(await currentBalance(customer.id), 1000);

    const converted = await walletService.convertHold(order.id, "test conversion");
    assert.equal(converted.success, true);
    assert.equal(converted.hold.status, "converted");
    assert.equal(Number(converted.deposit.amount), 3000);
    assert.equal(converted.deposit.type, "debit");

    // Balance already moved at hold time; conversion is ledger-only.
    assert.equal(await currentBalance(customer.id), 1000);
    await assertLedgerMatchesBalance(customer.id);

    const convertedTwice = await walletService.convertHold(order.id);
    assert.equal(convertedTwice.success, false);
  });

  test("concurrent holds cannot commit the same money twice", async () => {
    // 1000 left; two 800 holds on different orders race.
    const [orderA, orderB] = await Promise.all([makeOrder(800), makeOrder(800)]);

    const results = await Promise.all([
      walletService.placeHold({ customerId: customer.id, orderId: orderA.id, amount: 800 }),
      walletService.placeHold({ customerId: customer.id, orderId: orderB.id, amount: 800 }),
    ]);

    const wins = results.filter((r) => r.success).length;
    assert.equal(wins, 1, "exactly one concurrent hold must succeed");
    assert.equal(await currentBalance(customer.id), 200);
    await assertLedgerMatchesBalance(customer.id);
  });
});
