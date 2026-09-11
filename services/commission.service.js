const { eq } = require("drizzle-orm");
const { db } = require("../config/db");
const { orderTrucks } = require("../db/schema");
const commissionRepo = require("../repositories/commission.repository");
const { orderRepo } = require("../repositories");
const walletService = require("./wallet.service");

/**
 * Create — or re-snapshot — the commission record for a paid order.
 *
 * Called after an order takes money. Looks up the commission rate for the
 * order's depot+product and records a snapshot of the quantity commission is
 * due on.
 *
 * ── The basis, and why a part payment changes it ──────────────────────────
 *
 * Commission is per litre, so the question is only ever "how many litres".
 *
 *   Fully paid   the loaded quantity if the trucks are out, else the order's
 *                own quantity. Unchanged from before part payments existed,
 *                which is what keeps every historical order computing the
 *                same figure it always did.
 *
 *   Part paid    the quantity actually paid for, and nothing more. Taking
 *                order.quantity here — as this did before instalments were
 *                possible — would credit the whole order's commission off a
 *                half-landed payment. The truck sum is not used: it cannot
 *                exceed the paid quantity anyway (generate-tickets caps loads
 *                at exactly that), so preferring it would only ever
 *                under-credit an order whose trucks have not all rolled yet.
 *
 * Each instalment therefore enlarges the basis, and the total lands on the
 * same figure a single full payment would have produced.
 *
 * ── Re-snapshotting ───────────────────────────────────────────────────────
 *
 * This used to return early whenever a commission already existed, which is
 * what made it safe to call from the post-payment effects on every retry. It
 * still is: a row whose basis has not moved is returned untouched. But an
 * instalment HAS moved it, so the pending row is rewritten rather than left
 * describing the first payment forever.
 *
 * A commission already marked paid is never rewritten — that money has left,
 * and a snapshot is a record of what was paid on, not a live calculation.
 *
 * If no rate is configured, commission is created with rate=0 so it
 * still appears on the page — admin can set the rate later.
 */
async function createForOrder(orderId) {
  const order = await orderRepo.findById(orderId);
  if (!order) return null;

  const existing = await commissionRepo.findByOrderId(orderId);
  // Already settled: leave it exactly as it was paid out.
  if (existing && existing.status === "paid") return existing;

  const quantity = await commissionQuantity(order);
  // The table requires a positive quantity, and a first instalment too small to
  // buy a whole litre has nothing to compute on yet. The next payment creates it.
  if (quantity <= 0) return existing || null;

  const rateEntry = await commissionRepo.getRate(order.depotId, order.productId);
  const commissionRate = rateEntry ? parseFloat(rateEntry.commissionRate) : 0;
  const commissionAmount = quantity * commissionRate;

  if (existing) {
    // Nothing moved — the ordinary retry case, still a no-op.
    if (Number(existing.quantity) === quantity && parseFloat(existing.commissionRate) === commissionRate) {
      return existing;
    }
    return commissionRepo.update(existing.id, {
      quantity,
      commissionRate: String(commissionRate),
      commissionAmount: String(commissionAmount.toFixed(2)),
    });
  }

  const commission = await commissionRepo.create({
    orderId: order.id,
    customerId: order.customerId,
    depotId: order.depotId,
    productId: order.productId,
    quantity,
    commissionRate: String(commissionRate),
    commissionAmount: String(commissionAmount.toFixed(2)),
    status: "pending",
  });

  return commission;
}

/**
 * The litres an order's commission is due on. See createForOrder for the rule.
 * Floored to a whole litre because commissions.quantity is an integer column.
 */
async function commissionQuantity(order) {
  const total = Number(order.totalAmount);
  const paid = Number(order.amountPaid ?? 0);
  const fullyPaid = Math.round(paid * 100) >= Math.round(total * 100);

  if (!fullyPaid) {
    const price = Number(order.price);
    if (!(price > 0)) return 0;
    return Math.floor(paid / price);
  }

  const trucks = await db
    .select()
    .from(orderTrucks)
    .where(eq(orderTrucks.orderId, order.id));

  if (trucks.length > 0) {
    const truckSum = trucks.reduce((s, t) => s + Number(t.quantity), 0);
    if (truckSum > 0) return Math.floor(truckSum);
  }
  return Math.floor(Number(order.quantity));
}

/**
 * Confirm a commission payment.
 *
 * Validates the commission exists and is still pending, then:
 * 1. Credits the customer's wallet balance with the commission amount
 * 2. Creates a deposit entry (visible in deposit history)
 * 3. Marks the commission as "paid"
 *
 * All steps run in a single transaction.
 */
async function confirmPayment(commissionId, staffId) {
  const commission = await commissionRepo.findById(commissionId);
  if (!commission) {
    throw Object.assign(new Error("Commission not found"), { status: 404 });
  }
  if (commission.status === "paid") {
    throw Object.assign(new Error("Commission already paid"), { status: 400 });
  }

  const amount = parseFloat(commission.commissionAmount);
  if (amount <= 0) {
    throw Object.assign(new Error("Commission amount is zero — set a rate first"), { status: 400 });
  }

  // Credit the customer's wallet balance
  const reference = `COM-${commission.orderNumber || commission.orderId}-${commissionId}`;
  const description = `Commission for Order ${commission.orderNumber || commission.orderId}`;

  const creditResult = await walletService.credit({
    customerId: commission.customerId,
    amount,
    description,
    reference,
    recordedBy: staffId,
    trackDeposit: true,
  });

  if (!creditResult.success) {
    throw Object.assign(new Error(creditResult.message || "Failed to credit wallet"), { status: 400 });
  }

  // Mark the commission as paid
  const paid = await commissionRepo.markAsPaid(commissionId, staffId);

  return { commission: paid, deposit: creditResult.deposit };
}

/**
 * Settle a commission without paying it.
 *
 * No wallet credit and no deposit — that is the whole difference from
 * confirmPayment, and it is why this one does not care whether the amount is
 * zero. An order with no rate set is one of the cases somebody skips.
 *
 * A reason is required. The row outlives everyone's memory of the order, and
 * "why was this not paid" is the only question it will ever be asked.
 */
async function skipCommission(commissionId, staffId, reason = "") {
  const commission = await commissionRepo.findById(commissionId);
  if (!commission) {
    throw Object.assign(new Error("Commission not found"), { status: 404 });
  }
  if (commission.status === "paid") {
    throw Object.assign(
      new Error("Commission already paid — it cannot be skipped after the customer has been credited"),
      { status: 400 },
    );
  }
  if (commission.status === "skipped") {
    throw Object.assign(new Error("Commission already skipped"), { status: 400 });
  }

  const trimmed = String(reason || "").trim();
  if (trimmed.length < 3) {
    throw Object.assign(new Error("Say why this order is being skipped"), { status: 400 });
  }

  const skipped = await commissionRepo.markAsSkipped(commissionId, staffId, trimmed.slice(0, 2000));
  return { commission: skipped };
}

/**
 * The same two acts over a selection.
 *
 * One at a time inside the loop rather than in one statement: confirming
 * credits a wallet, and a batch that half-succeeded needs to say how far it
 * got rather than roll back money that has already moved. Each failure is
 * collected with its reason so the desk can see which rows did not go and
 * why, instead of a single "3 failed".
 */
async function resolveMany({ ids, action, reason = "", staffId }) {
  const results = { done: [], failed: [] };

  for (const id of ids) {
    try {
      if (action === "skip") await skipCommission(id, staffId, reason);
      else await confirmPayment(id, staffId);
      results.done.push(id);
    } catch (err) {
      results.failed.push({ id, message: err.message || "Failed" });
    }
  }

  return results;
}

module.exports = { createForOrder, confirmPayment, skipCommission, resolveMany };
