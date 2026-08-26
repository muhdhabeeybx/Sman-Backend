// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { eq, inArray, and } = require("drizzle-orm");

const { db } = require("../config/db");
const {
  customers, depots, products, orders, walletHolds, deposits,
  orderDepositAllocations, bankAccounts, bankStatements, bankStatementLines,
} = require("../db/schema");
const walletService = require("../services/wallet.service");
const { closeDb } = require("./helpers");

/**
 * What an order's payment is written up as.
 *
 * The property under test: an order confirmed against a bank statement line
 * is attributed to THAT line, at THAT line's face value — not to whatever
 * unclaimed money in the wallet happens to be oldest.
 *
 * Order 11453 in production is what this exists for. Staff matched an
 * ₦18,075,000 credit from TETRIS ENERGY to it; the report showed ₦250,000
 * from a stranger, ₦250,000 from an internal transfer, and ₦9,724,500 of the
 * credit actually chosen. Every figure unfindable on a bank statement, on a
 * report whose only purpose is to agree with one.
 */

const suffix = Date.now().toString(36);
const money = (v) => Number(v || 0);

describe("order payment attribution", () => {
  let customer;
  let depot;
  let product;
  let bankAccount;
  let statement;
  let orderSeq = 0;
  let lineSeq = 0;

  const makeOrder = async (totalAmount) => {
    orderSeq += 1;
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-ATTRIB-${suffix}-${orderSeq}`,
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

  /** An unmatched statement line, as an upload would leave it. */
  const makeLine = async (amount, depositor) => {
    lineSeq += 1;
    const [line] = await db
      .insert(bankStatementLines)
      .values({
        statementId: statement.id,
        bankAccountId: bankAccount.id,
        txnDate: new Date("2026-08-20T23:00:00Z"),
        amount: String(amount),
        depositor,
        narration: depositor,
        bankRef: `REF-${suffix}-${lineSeq}`,
        dedupKey: `DEDUP-${suffix}-${lineSeq}`,
        status: "UNMATCHED",
      })
      .returning();
    return line;
  };

  /** The whole confirm flow: claim the lines for the order, then pay it. */
  const confirm = async (order, lineIds) => {
    if (lineIds.length) {
      const res = await walletService.creditFromStatementLines({
        customerId: customer.id,
        bankAccountId: bankAccount.id,
        lineIds,
        staffId: null,
        orderId: order.id,
      });
      assert.equal(res.success, true, res.message);
    }
    return walletService.placeHold({
      customerId: customer.id,
      orderId: order.id,
      amount: money(order.totalAmount),
      description: `Payment for ${order.orderNumber}`,
    });
  };

  const fundingFor = async (orderId) =>
    db
      .select({
        depositId: orderDepositAllocations.depositId,
        amount: orderDepositAllocations.amount,
        appliedAmount: orderDepositAllocations.appliedAmount,
        source: orderDepositAllocations.source,
        reference: deposits.reference,
      })
      .from(orderDepositAllocations)
      .innerJoin(deposits, eq(deposits.id, orderDepositAllocations.depositId))
      .where(eq(orderDepositAllocations.orderId, orderId))
      .orderBy(orderDepositAllocations.id);

  before(async () => {
    [customer] = await db
      .insert(customers)
      .values({
        name: "Attribution Test",
        phone: `+23481${String(Date.now()).slice(-8)}`,
        balance: "0",
      })
      .returning();

    [depot] = await db
      .insert(depots)
      .values({
        name: `Attribution Depot ${suffix}`,
        code: `ATD-${suffix}`,
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
      .values({ name: `Attribution Product ${suffix}`, sku: `ATP-${suffix}`, category: "PMS" })
      .returning();

    [bankAccount] = await db
      .insert(bankAccounts)
      .values({
        bankName: "Zenith Bank",
        accountName: "SOROMAN TEST",
        accountNumber: `13119${String(Date.now()).slice(-5)}`,
        status: "Active",
      })
      .returning();

    [statement] = await db
      .insert(bankStatements)
      .values({
        bankAccountId: bankAccount.id,
        filename: `attrib-${suffix}.csv`,
        periodStart: new Date("2026-08-01"),
        periodEnd: new Date("2026-08-31"),
      })
      .returning();
  });

  after(async () => {
    const orderIds = (
      await db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, customer.id))
    ).map((r) => r.id);
    if (orderIds.length) {
      await db.delete(orderDepositAllocations).where(inArray(orderDepositAllocations.orderId, orderIds));
    }
    await db.delete(walletHolds).where(eq(walletHolds.customerId, customer.id));
    await db.delete(bankStatementLines).where(eq(bankStatementLines.statementId, statement.id));
    await db.delete(bankStatements).where(eq(bankStatements.id, statement.id));
    await db.delete(deposits).where(eq(deposits.customerId, customer.id));
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, bankAccount.id));
    await db.delete(products).where(eq(products.id, product.id));
    await db.delete(depots).where(eq(depots.id, depot.id));
    await closeDb();
  });

  test("an order is attributed to the line matched to it, not to the oldest money", async () => {
    // Older, unrelated money sitting in the wallet — precisely what the old
    // oldest-first walk would have spent first.
    const stale = await makeLine(250000, "SOMEONE ELSE");
    const staleOrder = await makeOrder(100000);
    await confirm(staleOrder, [stale.id]);
    // 150,000 of that credit is now spare balance.

    const line = await makeLine(18075000, "TETRIS ENERGY LIMITED");
    const order = await makeOrder(10224500);
    const held = await confirm(order, [line.id]);
    assert.equal(held.success, true, held.message);

    const funding = await fundingFor(order.id);
    assert.equal(funding.length, 1, "one payment was matched, so one row belongs on the order");
    assert.equal(funding[0].source, "bank");
    assert.equal(money(funding[0].amount), 18075000, "the statement's own figure, at face value");
    assert.equal(money(funding[0].appliedAmount), 10224500, "capped at what the order was worth");
    assert.equal(funding[0].reference, line.bankRef);

    // The surplus stays spendable, under the reference it arrived on.
    const [credit] = await db.select().from(deposits).where(eq(deposits.reference, line.bankRef));
    assert.equal(money(credit.remainingAmount), 18075000 - 10224500);

    // And the stale 150,000 was left alone — it is not this order's payment.
    const [staleCredit] = await db.select().from(deposits).where(eq(deposits.reference, stale.bankRef));
    assert.equal(money(staleCredit.remainingAmount), 150000);
  });

  test("a shortfall is drawn from wallet balance and marked as such", async () => {
    // 150,000 of spare balance is still sitting there from the test above.
    const line = await makeLine(400000, "PART PAYER");
    const order = await makeOrder(500000);
    const held = await confirm(order, [line.id]);
    assert.equal(held.success, true, held.message);

    const funding = await fundingFor(order.id);
    const bank = funding.filter((f) => f.source === "bank");
    const wallet = funding.filter((f) => f.source === "wallet");

    assert.equal(bank.length, 1);
    assert.equal(money(bank[0].amount), 400000);
    assert.equal(money(bank[0].appliedAmount), 400000);

    assert.equal(wallet.length, 1, "the 100,000 shortfall came from balance");
    assert.equal(money(wallet[0].amount), 100000);
    assert.equal(money(wallet[0].appliedAmount), 100000);
    // The draw still names where that balance originally came from, which is
    // the whole reason it is allowed to be drawn on at all.
    assert.ok(wallet[0].reference, "a wallet draw carries its origin's bank reference");

    assert.equal(
      funding.reduce((s, f) => s + money(f.amount), 0),
      500000,
      "received against the order totals what it was worth",
    );
  });

  test("several lines matched to one order all land on it at face value", async () => {
    const a = await makeLine(20000000, "TRANCHE ONE");
    const b = await makeLine(15000000, "TRANCHE TWO");
    const order = await makeOrder(30000000);
    const held = await confirm(order, [a.id, b.id]);
    assert.equal(held.success, true, held.message);

    const funding = await fundingFor(order.id);
    assert.equal(funding.length, 2);
    assert.ok(funding.every((f) => f.source === "bank"));
    assert.equal(funding.reduce((s, f) => s + money(f.amount), 0), 35000000, "both lines, in full");
    assert.equal(
      funding.reduce((s, f) => s + money(f.appliedAmount), 0),
      30000000,
      "the order consumed only its own value",
    );
  });

  test("releasing a hold gives back what was consumed, not what was received", async () => {
    const line = await makeLine(5000000, "OVERPAYER");
    const order = await makeOrder(2000000);
    await confirm(order, [line.id]);

    const [credit] = await db.select().from(deposits).where(eq(deposits.reference, line.bankRef));
    assert.equal(money(credit.remainingAmount), 3000000);

    const released = await walletService.releaseHold(order.id);
    assert.equal(released.success, true);

    const [after] = await db.select().from(deposits).where(eq(deposits.id, credit.id));
    assert.equal(
      money(after.remainingAmount),
      5000000,
      "the credit is whole again — handing back the face value would have invented 2,000,000",
    );
    assert.equal((await fundingFor(order.id)).length, 0);
  });

  test("no credit is ever applied beyond its own amount", async () => {
    const rows = await db
      .select({
        depositId: orderDepositAllocations.depositId,
        applied: orderDepositAllocations.appliedAmount,
        amount: deposits.amount,
      })
      .from(orderDepositAllocations)
      .innerJoin(deposits, eq(deposits.id, orderDepositAllocations.depositId))
      .where(eq(deposits.customerId, customer.id));

    const appliedByDeposit = new Map();
    for (const r of rows) {
      appliedByDeposit.set(r.depositId, (appliedByDeposit.get(r.depositId) || 0) + money(r.applied));
    }
    for (const r of rows) {
      assert.ok(
        appliedByDeposit.get(r.depositId) <= money(r.amount) + 0.005,
        `deposit ${r.depositId} applied beyond its own value`,
      );
    }

    // And the invariant the whole wallet rests on still holds.
    const ledger = await walletService.getLedgerBalance(customer.id);
    const [row] = await db.select().from(customers).where(eq(customers.id, customer.id));
    assert.equal(ledger, Number(row.balance));
  });
});
