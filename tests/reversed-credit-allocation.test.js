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

/**
 * A credit that has been reversed must never fund an order again.
 *
 * The live case this exists for is order 11562. Three statement lines were
 * matched to it, then unmatched (which reverses each credit and frees its
 * line), then re-matched — creating three fresh credits for the same three
 * lines. Confirming the order afterwards wrote SIX allocation rows: the three
 * real credits, and the three reversed husks, which still matched because
 * unmatching clears a credit's reference and re-points its statement line but
 * leaves paystack_details->>'orderId' pointing at the order.
 *
 * Both trios carried their FACE value into the allocation's amount column, so
 * the finance report — which sums that column as "received" — showed 48.2m
 * against a 24.1m order and called the difference an overpayment, out of one
 * payment made once. The money was never wrong; only the write-up was.
 */
describe("a reversed credit is not re-allocated to the order", () => {
  const suffix = Date.now().toString(36);
  let customer;
  let depot;
  let product;

  before(async () => {
    [customer] = await db
      .insert(customers)
      .values({
        name: "Reversed Credit Test",
        phone: `+23481${String(Date.now()).slice(-8)}`,
        balance: "0",
      })
      .returning();

    [depot] = await db
      .insert(depots)
      .values({
        name: `Reversal Test Depot ${suffix}`,
        code: `RTD-${suffix}`,
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
        name: `Reversal Test Product ${suffix}`,
        sku: `RTP-${suffix}`,
        category: "PMS",
      })
      .returning();
  });

  after(async () => {
    // FK order: allocations reference orders/deposits; holds reference orders.
    const orderIds = (
      await db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, customer.id))
    ).map((row) => row.id);
    if (orderIds.length) {
      await db.delete(orderDepositAllocations).where(inArray(orderDepositAllocations.orderId, orderIds));
    }
    await db.delete(walletHolds).where(eq(walletHolds.customerId, customer.id));
    await db.delete(deposits).where(eq(deposits.customerId, customer.id));
    await db.delete(orders).where(eq(orders.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await db.delete(products).where(eq(products.id, product.id));
    await db.delete(depots).where(eq(depots.id, depot.id));
    await closeDb();
  });

  test("unmatched-then-rematched payment funds the order once, not twice", async () => {
    const TOTAL = 24100;

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-REVTEST-${suffix}`,
        customerId: customer.id,
        state: "Lagos",
        depotId: depot.id,
        productId: product.id,
        quantity: 100,
        price: "1.00",
        totalAmount: String(TOTAL),
        deliveryType: "pickup",
      })
      .returning();

    // The original match: a statement-line credit recorded FOR this order, so
    // it carries the orderId that findDepositsMatchedToOrder keys off.
    const first = await walletService.credit({
      customerId: customer.id,
      amount: TOTAL,
      description: "original match",
      reference: `rev-test-original-${suffix}`,
      paystackDetails: { orderId: order.id, channel: "manual_bank_transfer" },
    });
    assert.equal(first.success, true);

    // The unmatch: reversed, and its reference cleared exactly as
    // unmatchStatementDeposit leaves it — so the husk is identifiable only by
    // its REV- mirror, which is what the guard matches on.
    const reversal = await walletService.reverseDeposit({
      depositId: first.deposit.id,
      description: `Unmatching all statement matches funding order #${order.id}'s wallet balance`,
    });
    assert.equal(reversal.success, true);
    await db.update(deposits).set({ reference: null }).where(eq(deposits.id, first.deposit.id));

    // The re-match: the same money, recorded again against the same order.
    const second = await walletService.credit({
      customerId: customer.id,
      amount: TOTAL,
      description: "re-match",
      reference: `rev-test-rematch-${suffix}`,
      paystackDetails: { orderId: order.id, channel: "manual_bank_transfer" },
    });
    assert.equal(second.success, true);

    // Confirming the order is what writes the funding trail.
    const held = await walletService.placeHold({
      customerId: customer.id,
      orderId: order.id,
      amount: TOTAL,
    });
    assert.equal(held.success, true);

    const allocations = await db
      .select()
      .from(orderDepositAllocations)
      .where(eq(orderDepositAllocations.orderId, order.id));

    assert.equal(allocations.length, 1, "only the live credit may be written up as funding");
    assert.equal(
      Number(allocations[0].depositId),
      Number(second.deposit.id),
      "the allocation must point at the re-matched credit, not the reversed husk",
    );

    // The regression itself: `amount` is what the finance report sums as
    // received, and the husk would have doubled it.
    const received = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
    assert.equal(received, TOTAL, "received must equal the order's value, not twice it");
    assert.equal(
      allocations.reduce((sum, a) => sum + Number(a.appliedAmount), 0),
      TOTAL,
    );
  });
});
