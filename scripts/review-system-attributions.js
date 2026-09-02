#!/usr/bin/env node
/**
 * Every payment the SYSTEM attributed, and whether it can safely be undone.
 *
 * ── What this is for ───────────────────────────────────────────────────────
 *
 * Migration 0021 attached a great deal of money to orders on its own: 17
 * transfers converted out of old wallet draws, 22 bank lines whose order it
 * picked by a tiebreak, 1,631 rows the old oldest-credit-first walk allocated,
 * and 5,740 with no funding record at all. None of those was a decision a
 * person took, and none carries a reason anybody wrote down.
 *
 * The obvious instinct is to reverse them and re-match by hand. This script
 * exists because that instinct has to be checked against the data BEFORE
 * anything is undone, and the data says most of it cannot be undone safely.
 *
 * ── Why "just reverse it" is not free ──────────────────────────────────────
 *
 * These attributions are load-bearing. An order that was released, ticketed
 * and loaded was released ON THE STRENGTH of this money. Taking it back does
 * not return the system to a clean slate — it returns it to a state where
 * trucks have already left against an order that now reads as unpaid.
 *
 * So each candidate is tested against what would actually happen:
 *
 *   transfers  reverseTransfer() refuses when the destination order needs the
 *              money to cover its own value. That guard is not an obstacle to
 *              route around; it is the thing preventing money vanishing from
 *              an order that has already been acted on.
 *
 *   payments   removePayment() returns the statement line to the pool and
 *              recomputes the order. Where the inferred rows ARE the order's
 *              money, that drops it to Unpaid — with its tickets already
 *              issued.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   node scripts/review-system-attributions.js           # the report
 *   node scripts/review-system-attributions.js --json    # machine-readable
 *
 * This script NEVER writes. Undoing anything is done one at a time, named
 * explicitly, through the desk's own screens or the existing service calls —
 * which is the point: the whole problem is that a bulk process made these
 * decisions once already.
 */
require("dotenv").config();
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");

const JSON_OUT = process.argv.includes("--json");

const naira = (n) =>
  `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The auto-created transfers, each with the test reverseTransfer() would apply.
 *
 * `headroom` is what the destination order would have left over its own value
 * once the transfer was taken back. Negative means reversing pushes it into
 * shortfall and the service refuses — correctly.
 */
async function transfers() {
  const r = await db.execute(sql`
    SELECT
      t.id,
      fo.order_number                       AS "fromOrder",
      too.order_number                      AS "toOrder",
      t.amount::numeric                     AS amount,
      too.status                            AS "destStatus",
      too.total_amount::numeric             AS "destValue",
      COALESCE(dr.received, 0)              AS "destReceived",
      COALESCE(dr.received, 0) - t.amount::numeric - too.total_amount::numeric AS headroom,
      COALESCE(tk.n, 0)                     AS "destTickets"
    FROM order_payment_transfers t
    JOIN orders fo  ON fo.id  = t.from_order_id
    JOIN orders too ON too.id = t.to_order_id
    LEFT JOIN (
      SELECT order_id, SUM(amount) AS received FROM order_payments GROUP BY order_id
    ) dr ON dr.order_id = t.to_order_id
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS n FROM tickets GROUP BY order_id
    ) tk ON tk.order_id = t.to_order_id
    WHERE t.reason LIKE 'Backfilled (migration 0021)%'
    ORDER BY t.amount DESC
  `);
  return (r.rows ?? r).map((x) => ({
    ...x,
    amount: Number(x.amount),
    headroom: Number(x.headroom),
    reversible: Number(x.headroom) >= -0.001,
  }));
}

/**
 * Orders carrying a bank line whose ORDER the migration chose.
 *
 * The line itself is real and findable on a statement. What was never recorded
 * is which order it settles, so 0021 fell back to "the order that consumed the
 * most of it". Those are the ones worth a human eye — unlike the auto-allocated
 * and no-record rows, there is something concrete to check against.
 */
async function inferredOrders() {
  const r = await db.execute(sql`
    SELECT
      o.id,
      o.order_number                        AS "orderNumber",
      o.status,
      o.payment_status                      AS "paymentStatus",
      o.total_amount::numeric               AS "totalAmount",
      COALESCE(rec.received, 0)             AS received,
      COUNT(p.id)::int                      AS "inferredRows",
      SUM(p.amount)::numeric                AS "inferredAmount",
      COALESCE(tk.n, 0)                     AS tickets,
      COALESCE(rec.received, 0) - SUM(p.amount)::numeric - o.total_amount::numeric AS headroom
    FROM order_payments p
    JOIN orders o ON o.id = p.order_id
    LEFT JOIN (
      SELECT order_id, SUM(amount) AS received FROM order_payments GROUP BY order_id
    ) rec ON rec.order_id = o.id
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS n FROM tickets GROUP BY order_id
    ) tk ON tk.order_id = o.id
    WHERE p.source = 'statement'
      AND COALESCE(p.note, '') LIKE 'Backfilled%'
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement_lines l
        JOIN order_deposit_allocations a
          ON a.deposit_id = l.matched_deposit_id AND a.order_id = p.order_id
        WHERE l.id = p.statement_line_id AND a.source = 'bank'
      )
    GROUP BY o.id, o.order_number, o.status, o.payment_status, o.total_amount, rec.received, tk.n
    ORDER BY SUM(p.amount) DESC
  `);
  return (r.rows ?? r).map((x) => ({
    ...x,
    totalAmount: Number(x.totalAmount),
    received: Number(x.received),
    inferredAmount: Number(x.inferredAmount),
    headroom: Number(x.headroom),
    safeToUnmatch: Number(x.headroom) >= -0.001,
  }));
}

/** The two classes with no bank line at all — nothing exists to re-match them TO. */
async function unmatchable() {
  const r = await db.execute(sql`
    SELECT
      CASE WHEN note LIKE 'No payment record exists%' THEN 'no_record' ELSE 'auto_allocated' END AS kind,
      COUNT(*)::int              AS rows,
      COUNT(DISTINCT order_id)::int AS orders,
      SUM(amount)::numeric       AS naira
    FROM order_payments
    WHERE source = 'legacy'
    GROUP BY 1
  `);
  return r.rows ?? r;
}

async function main() {
  const [tx, inf, un] = await Promise.all([transfers(), inferredOrders(), unmatchable()]);

  if (JSON_OUT) {
    console.log(JSON.stringify({ transfers: tx, inferredOrders: inf, unmatchable: un }, null, 2));
    process.exit(0);
  }

  const revOk = tx.filter((t) => t.reversible);
  const revNo = tx.filter((t) => !t.reversible);

  console.log("\n  ══ Transfers the migration created ══\n");
  console.log(`  ${tx.length} transfer(s), ${naira(tx.reduce((s, t) => s + t.amount, 0))} moved.`);
  console.log(`  Safe to reverse: ${revOk.length}.  Would strand the destination order: ${revNo.length}.\n`);
  for (const t of tx) {
    console.log(
      `  ${t.reversible ? "✓" : "✗"} #${String(t.id).padEnd(3)} ${t.fromOrder} → ${String(t.toOrder).padEnd(18)}` +
        ` ${naira(t.amount).padStart(18)}  dest ${String(t.destStatus).padEnd(10)}` +
        ` ${String(t.destTickets).padStart(3)} tickets  headroom ${naira(t.headroom).padStart(18)}`,
    );
  }

  const unmOk = inf.filter((o) => o.safeToUnmatch);
  console.log("\n  ══ Bank lines whose ORDER the migration chose ══\n");
  console.log(`  ${inf.length} order(s), ${naira(inf.reduce((s, o) => s + o.inferredAmount, 0))}.`);
  console.log(`  Safe to unmatch without dropping the order below its value: ${unmOk.length}.\n`);
  for (const o of inf) {
    console.log(
      `  ${o.safeToUnmatch ? "✓" : "✗"} ${String(o.orderNumber).padEnd(18)} ${String(o.status).padEnd(10)}` +
        ` value ${naira(o.totalAmount).padStart(18)}  inferred ${naira(o.inferredAmount).padStart(18)}` +
        ` ${String(o.tickets).padStart(3)} tickets  headroom ${naira(o.headroom).padStart(18)}`,
    );
  }

  console.log("\n  ══ No bank line exists — nothing to re-match to ══\n");
  for (const u of un) {
    console.log(
      `    ${String(u.kind).padEnd(16)} ${String(u.rows).padStart(6)} rows` +
        ` ${String(u.orders).padStart(6)} orders  ${naira(u.naira).padStart(22)}`,
    );
  }
  console.log(
    "\n    These cannot be reversed-and-rematched: there is no statement line behind them.",
  );
  console.log(
    "    The only route to bank evidence for these orders is finding the money in the",
  );
  console.log(
    "    unmatched pool and matching it forward — see scripts/reconcile-wallet-credit.js.\n",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
