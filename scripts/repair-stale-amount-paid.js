#!/usr/bin/env node
/**
 * Make orders.amount_paid agree with the payment rows underneath it again.
 *
 * ── The invariant, and where it broke ──────────────────────────────────────
 *
 *   orders.amount_paid = SUM(order_payments.amount) for that order
 *
 * `amount_paid` is meant to be a CACHE of the payment rows, rewritten by
 * orderPayment.service.recomputeOrder() inside the transaction of every write
 * that touches them. The finance report relies on this: it sums the payment
 * rows, on the stated grounds that "the two are kept equal by recomputeOrder".
 *
 * Migration 0021's backfill broke it. It INSERTs into order_payments and never
 * issues a single `UPDATE orders SET amount_paid`, and never calls
 * recomputeOrder. So every order paid before the cutover carries payment rows
 * derived from history alongside an `amount_paid` still holding whatever the
 * old wallet logic left there — which capped it at the order's own total.
 *
 * The result is two screens printing different figures for the same order: the
 * sales ledger reads amount_paid, the finance report sums the rows. On
 * production that is 164 orders and ₦2.40bn of disagreement.
 *
 * ── The two directions are NOT the same problem ────────────────────────────
 *
 * rows > amount_paid   (128 orders, ₦1.29bn)
 *     The cache is stale and low, almost always because the old logic capped
 *     it at the order total. The payment rows are the better record — they are
 *     individual bank statement lines at face value. Recomputing raises
 *     amount_paid to what was really received and reveals the surplus that was
 *     being hidden. Payment status does not move: the order was fully covered
 *     before and still is. SAFE, and this is what --apply repairs.
 *
 * amount_paid > rows   (36 orders, ₦1.11bn)
 *     The backfill could not find evidence for money the order says it got.
 *     Recomputing here would write the order DOWN to the rows and flip it from
 *     Paid to Part Paid — reducing recorded revenue and re-opening settled
 *     orders on the strength of evidence being MISSING, which is not evidence.
 *     This script will not do that. It reports them for a person to decide.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   node scripts/repair-stale-amount-paid.js            # report, writes nothing
 *   node scripts/repair-stale-amount-paid.js --json     # machine-readable
 *   node scripts/repair-stale-amount-paid.js --apply    # repair the safe direction
 *   node scripts/repair-stale-amount-paid.js --apply --order=10649   # just one
 *
 * --apply writes a rollback file next to the other scripts/rollback-*.json,
 * holding each order's previous amount_paid and payment_status.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const orderPaymentService = require("../services/orderPayment.service");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const JSON_OUT = args.includes("--json");
const ONLY_ORDER = (() => {
  const a = args.find((x) => x.startsWith("--order="));
  return a ? Number(a.split("=")[1]) : null;
})();

const naira = (n) =>
  `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Every order whose cache disagrees with its rows.
 *
 * The 0.01 tolerance is the same one the service uses: numeric(15,2) arithmetic
 * can leave a sub-kobo residue that is not a disagreement anybody can act on.
 */
async function findDisagreements() {
  const result = await db.execute(sql`
    SELECT
      o.id,
      o.order_number                                AS "orderNumber",
      o.total_amount::numeric                       AS "totalAmount",
      o.amount_paid::numeric                        AS "amountPaid",
      COALESCE(p.total, 0)                          AS "rowsTotal",
      o.amount_paid::numeric - COALESCE(p.total, 0) AS gap,
      o.payment_status                              AS "paymentStatus",
      p.bases
    FROM orders o
    LEFT JOIN (
      SELECT order_id,
             SUM(amount) AS total,
             string_agg(DISTINCT confirmation_basis, ',') AS bases
        FROM order_payments
       GROUP BY order_id
    ) p ON p.order_id = o.id
    WHERE ABS(o.amount_paid::numeric - COALESCE(p.total, 0)) > 0.01
      ${ONLY_ORDER ? sql`AND o.id = ${ONLY_ORDER}` : sql``}
    ORDER BY ABS(o.amount_paid::numeric - COALESCE(p.total, 0)) DESC
  `);
  return (result.rows ?? result).map((r) => ({
    ...r,
    totalAmount: Number(r.totalAmount),
    amountPaid: Number(r.amountPaid),
    rowsTotal: Number(r.rowsTotal),
    gap: Number(r.gap),
  }));
}

async function main() {
  const rows = await findDisagreements();

  // Negative gap = the rows hold MORE than the cache. That is the stale-and-low
  // case, and the only one this script is willing to write.
  const safe = rows.filter((r) => r.gap < 0);
  const needsReview = rows.filter((r) => r.gap > 0);

  const sum = (list, f) => list.reduce((s, r) => s + f(r), 0);

  if (JSON_OUT) {
    console.log(JSON.stringify({ safe, needsReview }, null, 2));
    process.exit(0);
  }

  console.log("\n  orders.amount_paid vs SUM(order_payments)\n");
  console.log(`  ${rows.length} order(s) disagree, ${naira(sum(rows, (r) => Math.abs(r.gap)))} gross\n`);

  console.log(`  ── Safe to repair — the cache is stale and low (${safe.length}) ──`);
  console.log(`     The payment rows hold ${naira(sum(safe, (r) => -r.gap))} more than the order admits to.\n`);
  for (const r of safe.slice(0, 15)) {
    console.log(
      `     ${String(r.orderNumber).padEnd(18)} value ${naira(r.totalAmount).padStart(20)}` +
        `  ledger ${naira(r.amountPaid).padStart(20)}  rows ${naira(r.rowsTotal).padStart(20)}`,
    );
  }
  if (safe.length > 15) console.log(`     … and ${safe.length - 15} more`);

  console.log(`\n  ── NOT repaired — evidence is missing, needs a decision (${needsReview.length}) ──`);
  console.log(`     These say they received ${naira(sum(needsReview, (r) => r.gap))} that no payment row accounts for.`);
  console.log(`     Recomputing would write them DOWN and re-open settled orders. Left alone on purpose.\n`);
  for (const r of needsReview.slice(0, 15)) {
    console.log(
      `     ${String(r.orderNumber).padEnd(18)} ledger ${naira(r.amountPaid).padStart(20)}` +
        `  rows ${naira(r.rowsTotal).padStart(20)}  unaccounted ${naira(r.gap).padStart(18)}` +
        `  [${r.bases || "no payment rows at all"}]`,
    );
  }
  if (needsReview.length > 15) console.log(`     … and ${needsReview.length - 15} more`);

  if (!APPLY) {
    console.log("\n  Nothing was written. Re-run with --apply to repair the safe set.\n");
    process.exit(0);
  }

  if (!safe.length) {
    console.log("\n  Nothing to repair.\n");
    process.exit(0);
  }

  console.log(`\n  Applying to ${safe.length} order(s)…\n`);

  const rollback = [];
  let repaired = 0;

  for (const r of safe) {
    // One transaction per order rather than one for all of them: a failure on
    // order 900 must not roll back the 899 that were already correct, and
    // recomputeOrder takes its own row lock anyway.
    try {
      await db.transaction(async (tx) => {
        rollback.push({
          orderId: r.id,
          orderNumber: r.orderNumber,
          previousAmountPaid: r.amountPaid,
          previousPaymentStatus: r.paymentStatus,
        });
        const after = await orderPaymentService.recomputeOrder(r.id, tx);
        // A status change here would mean the arithmetic disagrees with the
        // reasoning at the top of this file. Surfaced rather than swallowed.
        if (after.paymentStatus !== r.paymentStatus) {
          console.log(
            `     ! ${r.orderNumber}: status moved ${r.paymentStatus} → ${after.paymentStatus}`,
          );
        }
        repaired++;
      });
    } catch (err) {
      console.error(`     ✗ ${r.orderNumber}: ${err.message}`);
    }
  }

  const file = path.join(
    __dirname,
    `rollback-amount-paid-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(rollback, null, 2));

  console.log(`\n  Repaired ${repaired} of ${safe.length}.`);
  console.log(`  Rollback written to ${path.relative(process.cwd(), file)}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
