#!/usr/bin/env node
/**
 * Move the legacy wallet credit onto the orders it was actually for.
 *
 * ── What this is cleaning up ───────────────────────────────────────────────
 *
 * Before migration 0021, a bank statement line was credited to a CUSTOMER's
 * wallet and an order was paid by drawing on that wallet. Where the draw was
 * never recorded — which is most of the history — the line stayed credited to
 * a person and attached to no order at all.
 *
 * The backfill in 0021 could only carry over what the allocation ledger knew.
 * Anything it did not know is left exactly as it was: a MATCHED statement line
 * with real money on it, sitting against a wallet, belonging to no order. That
 * money is real and it is on a bank statement; it just is not on the report,
 * because the report now only shows what is recorded against an order.
 *
 * ── What this script does, and deliberately does not do ────────────────────
 *
 * By default it REPORTS. It lists every stranded line, every order still short
 * of its value, and — where the arithmetic is unambiguous — which order each
 * line most likely belongs to. It writes nothing.
 *
 * It will not guess on your behalf. A proposal is only made when the line and
 * the order agree to the kobo, or when one order is the customer's only short
 * order and the line fits inside its shortfall. Everything else is listed as
 * needing a decision, because attributing somebody's payment to the wrong
 * order is precisely the class of mistake this whole change exists to end —
 * and doing it in bulk, from a script, would be worse than the FIFO walk it
 * replaced.
 *
 * Applying is therefore one line at a time, named explicitly:
 *
 *   node scripts/reconcile-wallet-credit.js                       # report
 *   node scripts/reconcile-wallet-credit.js --json                # machine-readable
 *   node scripts/reconcile-wallet-credit.js --apply --line=3635 --order=11293
 *
 * Applying reuses the two service functions the finance desk's own screens
 * use — unmatchStatementDeposit() to take the credit back out of the wallet
 * and free the line, then recordFromStatementLines() to record it against the
 * order — so the wallet ledger stays consistent and an audit row is written,
 * exactly as if a person had done it by hand.
 *
 * DATABASE_URL decides which database this touches. Check it first:
 *   node -e "require('dotenv').config();console.log(new URL(process.env.DATABASE_URL).hostname)"
 * A *.proxy.rlwy.net host is PRODUCTION.
 */
require("dotenv").config();

const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const walletService = require("../services/wallet.service");
const orderPaymentService = require("../services/orderPayment.service");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : null;
};

const naira = (v) =>
  `₦${Number(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rowsOf = (result) => result.rows ?? result;

/** Bank money credited to a wallet that no order has ever claimed. */
async function strandedLines() {
  return rowsOf(
    await db.execute(sql`
      SELECT
        l.id, l.amount::numeric AS amount, l.txn_date AS "txnDate",
        l.depositor, l.narration, l.bank_ref AS "bankRef",
        l.bank_account_id AS "bankAccountId",
        d.id AS "depositId", d.customer_id AS "customerId", c.name AS "customerName"
      FROM bank_statement_lines l
      LEFT JOIN deposits d ON d.id = l.matched_deposit_id
      LEFT JOIN customers c ON c.id = d.customer_id
      WHERE l.status = 'MATCHED'
        AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.statement_line_id = l.id)
      ORDER BY l.amount::numeric DESC
    `),
  );
}

/** Orders still short of their own value, with who they belong to. */
async function shortOrders() {
  return rowsOf(
    await db.execute(sql`
      SELECT
        o.id, o.order_number AS "orderNumber", o.company_name AS "companyName",
        o.customer_id AS "customerId", c.name AS "customerName",
        o.total_amount::numeric AS "orderValue",
        COALESCE(p.received, 0) AS received,
        (o.total_amount::numeric - COALESCE(p.received, 0)) AS shortfall,
        o.payment_status AS "paymentStatus", o.created_at AS "createdAt"
      FROM orders o
      LEFT JOIN (SELECT order_id, SUM(amount) AS received FROM order_payments GROUP BY 1) p
        ON p.order_id = o.id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.payment_status IN ('Paid', 'Part Paid')
        AND o.total_amount::numeric - COALESCE(p.received, 0) > 0.01
      ORDER BY (o.total_amount::numeric - COALESCE(p.received, 0)) DESC
    `),
  );
}

/**
 * The order a stranded line most likely belongs to — or nothing.
 *
 * Two rules only, and both have to be defensible to somebody holding the bank
 * statement:
 *
 *   exact   the line and one of the customer's short orders agree to the kobo
 *   only    the customer has exactly one short order, and the line fits in it
 *
 * Anything else — several candidates, a line bigger than the shortfall, a line
 * whose wallet was never linked to a customer — returns null and is listed for
 * a human. "Most plausible of four" is a guess, and a guess written into the
 * payment record is indistinguishable from a fact once it is there.
 */
function propose(line, ordersForCustomer) {
  if (!line.customerId || !ordersForCustomer.length) return null;
  const amount = Number(line.amount);

  const exact = ordersForCustomer.filter(
    (o) => Math.abs(Number(o.shortfall) - amount) < 0.01,
  );
  if (exact.length === 1) return { order: exact[0], rule: "exact match to the shortfall" };
  if (exact.length > 1) return null;

  if (ordersForCustomer.length === 1 && amount <= Number(ordersForCustomer[0].shortfall) + 0.01) {
    return { order: ordersForCustomer[0], rule: "the customer's only short order, and it fits" };
  }
  return null;
}

async function report() {
  const [lines, orders] = await Promise.all([strandedLines(), shortOrders()]);

  const byCustomer = new Map();
  for (const o of orders) {
    if (!byCustomer.has(o.customerId)) byCustomer.set(o.customerId, []);
    byCustomer.get(o.customerId).push(o);
  }

  const proposed = [];
  const needsDecision = [];
  for (const line of lines) {
    const candidates = byCustomer.get(line.customerId) || [];
    const p = propose(line, candidates);
    if (p) proposed.push({ line, ...p });
    else needsDecision.push({ line, candidates });
  }

  if (has("--json")) {
    console.log(JSON.stringify({ proposed, needsDecision, shortOrders: orders }, null, 2));
    return;
  }

  const total = lines.reduce((s, l) => s + Number(l.amount), 0);
  console.log("\n══ Bank money credited to a wallet that no order claims ══\n");
  console.log(`${lines.length} statement line(s), ${naira(total)}\n`);

  if (proposed.length) {
    console.log("── Proposed, unambiguous ─────────────────────────────────\n");
    for (const { line, order, rule } of proposed) {
      console.log(`  line ${line.id}  ${naira(line.amount)}  ${String(line.depositor || "").slice(0, 34)}`);
      console.log(`    ref ${line.bankRef} · ${new Date(line.txnDate).toISOString().slice(0, 10)} · ${line.customerName}`);
      console.log(`    → order ${order.id} ${order.orderNumber} (${order.companyName || "—"})`);
      console.log(`      short ${naira(order.shortfall)} of ${naira(order.orderValue)} — ${rule}`);
      console.log(`      apply:  node scripts/reconcile-wallet-credit.js --apply --line=${line.id} --order=${order.id}\n`);
    }
  }

  if (needsDecision.length) {
    console.log("── Needs a decision ──────────────────────────────────────\n");
    for (const { line, candidates } of needsDecision) {
      console.log(`  line ${line.id}  ${naira(line.amount)}  ${String(line.depositor || "").slice(0, 34)}`);
      console.log(`    ref ${line.bankRef} · ${new Date(line.txnDate).toISOString().slice(0, 10)} · ${line.customerName || "no customer on the wallet credit"}`);
      if (!candidates.length) {
        console.log("    no short order on this customer — it may belong to another customer's order, or be a genuine advance\n");
      } else {
        console.log(`    ${candidates.length} short order(s) on this customer:`);
        for (const o of candidates) {
          console.log(`      order ${o.id} ${o.orderNumber} (${o.companyName || "—"}) short ${naira(o.shortfall)} of ${naira(o.orderValue)}`);
        }
        console.log("");
      }
    }
  }

  console.log("── Orders still short, whether or not a line is waiting ──\n");
  const owed = orders.reduce((s, o) => s + Number(o.shortfall), 0);
  console.log(`${orders.length} order(s), ${naira(owed)} owed in total`);
  for (const o of orders.slice(0, 20)) {
    console.log(
      `  ${o.orderNumber.padEnd(18)} ${(o.companyName || "—").slice(0, 24).padEnd(26)} short ${naira(o.shortfall)}`,
    );
  }
  if (orders.length > 20) console.log(`  … and ${orders.length - 20} more`);
  console.log("");
}

async function apply(lineId, orderId) {
  const [line] = rowsOf(
    await db.execute(sql`
      SELECT l.id, l.amount::numeric AS amount, l.status, l.bank_account_id AS "bankAccountId",
             l.matched_deposit_id AS "depositId", l.depositor, l.bank_ref AS "bankRef"
      FROM bank_statement_lines l WHERE l.id = ${lineId}
    `),
  );
  if (!line) throw new Error(`Statement line ${lineId} not found`);
  if (line.status === "MATCHED" && !line.depositId) {
    throw new Error(`Line ${lineId} is MATCHED but has no wallet credit behind it — free it by hand first`);
  }

  const [order] = rowsOf(
    await db.execute(sql`SELECT id, order_number AS "orderNumber" FROM orders WHERE id = ${orderId}`),
  );
  if (!order) throw new Error(`Order ${orderId} not found`);

  console.log(`Moving line ${lineId} (${naira(line.amount)}, ref ${line.bankRef}) onto ${order.orderNumber}…`);

  // 1. Take the credit back out of the wallet and free the line. The same
  //    guarded path the desk's own Unmatch uses — it refuses if that money is
  //    holding up a live order, which is the answer we want, not an override.
  if (line.status === "MATCHED") {
    const res = await walletService.unmatchStatementDeposit({
      depositId: line.depositId,
      description: `Reconciled onto order #${orderId} — this payment was for that order (scripts/reconcile-wallet-credit.js)`,
    });
    if (!res.success) throw new Error(`Could not free the line: ${res.message}`);
    console.log("  ✓ credit reversed, statement line back in the pool");
  }

  // 2. Record it against the order, through the same service the desk uses.
  const { summary } = await orderPaymentService.recordFromStatementLines({
    orderId: Number(orderId),
    bankAccountId: line.bankAccountId,
    lineIds: [Number(lineId)],
    note: "Reconciled from legacy wallet credit (scripts/reconcile-wallet-credit.js)",
  });

  console.log(`  ✓ recorded against ${order.orderNumber}`);
  console.log(
    `    received ${naira(summary.received)} of ${naira(summary.orderTotal)} · ` +
      `shortfall ${naira(summary.shortfall)} · surplus ${naira(summary.surplus)}`,
  );
}

(async () => {
  const host = new URL(process.env.DATABASE_URL).hostname;
  console.log(`database: ${host}${host.includes("proxy.rlwy.net") ? "  ⚠️  PRODUCTION" : ""}`);

  if (has("--apply")) {
    const lineId = valueOf("line");
    const orderId = valueOf("order");
    if (!lineId || !orderId) {
      console.error("--apply needs both --line=<id> and --order=<id>. Run without --apply to see the proposals.");
      process.exit(1);
    }
    await apply(Number(lineId), Number(orderId));
  } else {
    await report();
  }
  process.exit(0);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
