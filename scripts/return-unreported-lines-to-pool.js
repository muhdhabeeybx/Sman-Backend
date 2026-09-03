#!/usr/bin/env node
/**
 * Put every bank line the report cannot see back in the matching pool.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * A statement line is either ON an order — meaning it has an order_payments
 * row, so the finance report can show it — or it is available to be matched.
 * There is no third state, and a line marked MATCHED that no order claims is
 * the worst of both: real money, invisible to the report, and hidden from the
 * desk that would otherwise match it, because the queue thinks the work is
 * done.
 *
 * On production there are 9 such lines, ₦234,845,000. Eight were claimed in
 * one batch on 21 August; the ninth (line 2537) names an order that never got
 * a payment row from it.
 *
 * ── Why the deposit has to go with the line ───────────────────────────────
 *
 * Freeing the line alone is not enough. The old wallet credit still holds the
 * line's bank reference, and credit() is idempotent on that reference, so
 * re-matching would be refused as "already used by another deposit" — visible
 * in the pool and impossible to actually claim, which is worse than leaving it
 * alone. The deposit is only safe to remove while it has funded nothing, so
 * this refuses outright if any allocation points at it.
 *
 * ── The wallet balance ────────────────────────────────────────────────────
 *
 * reset-statement-match.js declines this work, and its guard is correct for
 * what it was written for: it subtracts the deleted credits from
 * customers.balance and refuses to leave a customer negative.
 *
 * These customers are already at zero. Farive Global's three books disagree —
 * balance ₦0, credits less debits ₦481,290,000, deposit remainders
 * ₦211,191,000 — and Dimkpa's credits and debits cancel exactly while its
 * remainders still claim ₦62,400,000 unspent. The balance of zero is the one
 * to believe: the money was spent, and only the record of WHICH ORDER spent it
 * was lost. Removing these credits therefore takes away nothing anyone can
 * spend, so the balance is decremented with a floor of zero rather than being
 * driven negative. customers.balance still gates Dangote and LPG requests, so
 * it must never go below zero; a customer who would be pushed past that floor
 * by more than a kobo is reported and skipped instead.
 *
 * ── What it does not do ───────────────────────────────────────────────────
 *
 * It does not decide which order any line belongs to. That is the whole point:
 * the desk matches them by hand, from the pool, against the statement.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/return-unreported-lines-to-pool.js            dry run
 *   node scripts/return-unreported-lines-to-pool.js --apply    commits
 */
require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const naira = (v) =>
  `NGN ${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORPHANS = `
  SELECT l.id, l.txn_date, l.amount, l.status, l.bank_ref, l.depositor,
         l.matched_order_id, l.matched_deposit_id, l.matched_by, l.matched_at,
         d.customer_id, d.amount AS deposit_amount, d.type AS deposit_type,
         c.balance AS customer_balance,
         COALESCE(c.company_name, c.name) AS customer,
         (SELECT COUNT(*)::int FROM order_deposit_allocations a
           WHERE a.deposit_id = l.matched_deposit_id) AS allocations,
         o.order_number AS named_order
    FROM bank_statement_lines l
    LEFT JOIN deposits  d ON d.id = l.matched_deposit_id
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN orders    o ON o.id = l.matched_order_id
   WHERE l.status = 'MATCHED'
     AND NOT EXISTS (SELECT 1 FROM order_payments op WHERE op.statement_line_id = l.id)
   ORDER BY l.txn_date, l.id
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query("BEGIN");

  const { rows } = await client.query(ORPHANS);

  const plan = [];
  const skipped = [];
  for (const r of rows) {
    if (r.allocations > 0) {
      skipped.push({ ...r, why: `deposit ${r.matched_deposit_id} funds ${r.allocations} order(s)` });
      continue;
    }
    if (r.matched_deposit_id && r.deposit_type !== "credit") {
      skipped.push({ ...r, why: `deposit ${r.matched_deposit_id} is a ${r.deposit_type}, not a credit` });
      continue;
    }
    plan.push(r);
  }

  // How far each customer's balance would fall, so a customer holding real
  // spendable credit cannot be quietly pushed below zero by this.
  const byCustomer = new Map();
  for (const r of plan) {
    if (!r.customer_id) continue;
    const e = byCustomer.get(r.customer_id) || {
      name: r.customer, balance: Number(r.customer_balance), removing: 0,
    };
    e.removing += Number(r.deposit_amount);
    byCustomer.set(r.customer_id, e);
  }

  const wouldGoNegative = [...byCustomer.entries()].filter(
    ([, e]) => e.balance - e.removing < -0.005 && e.balance > 0.005
  );

  const total = plan.reduce((s, r) => s + Number(r.amount), 0);
  console.log(`${rows.length} line(s) marked MATCHED that no order claims`);
  console.log(`${plan.length} returning to the pool, worth ${naira(total)}`);
  console.log(`${skipped.length} skipped\n`);

  for (const r of plan) {
    console.log(
      `  line ${String(r.id).padStart(5)}  ${naira(r.amount).padStart(22)}  ref ${String(r.bank_ref).padEnd(18)}` +
      `  deposit ${String(r.matched_deposit_id ?? "none").padStart(5)}` +
      `  order ${r.named_order ?? "none"}`
    );
  }

  console.log("\nWallet balances (floored at zero — these customers hold no spendable credit):");
  for (const [id, e] of byCustomer) {
    const after = Math.max(0, e.balance - e.removing);
    console.log(
      `  ${e.name} (#${id}): ${naira(e.balance)} -> ${naira(after)}` +
      `   removing ${naira(e.removing)} of credits`
    );
  }

  if (skipped.length) {
    console.log("\nSkipped:");
    for (const r of skipped) console.log(`  line ${r.id}  ${naira(r.amount)}  — ${r.why}`);
  }

  if (wouldGoNegative.length) {
    console.log("\nRefusing — these hold real spendable credit that this would erase:");
    for (const [id, e] of wouldGoNegative) {
      console.log(`  ${e.name} (#${id}): balance ${naira(e.balance)}, removing ${naira(e.removing)}`);
    }
    await client.query("ROLLBACK");
    await client.end();
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
    await client.query("ROLLBACK");
    await client.end();
    return;
  }

  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const rollbackPath = path.join(__dirname, `rollback-pool-return-${stamp}.json`);

    const depositIds = plan.map((r) => r.matched_deposit_id).filter(Boolean);
    const { rows: depositsBefore } = depositIds.length
      ? await client.query(`SELECT * FROM deposits WHERE id = ANY($1::int[])`, [depositIds])
      : { rows: [] };

    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          note:
            "Undo: re-insert the deposits verbatim, then restore each line's status/matched_* " +
            "fields from linesBefore, then restore customers.balance from balancesBefore.",
          linesBefore: plan.map((r) => ({
            id: r.id, status: r.status,
            matched_order_id: r.matched_order_id,
            matched_deposit_id: r.matched_deposit_id,
            matched_by: r.matched_by, matched_at: r.matched_at,
          })),
          deposits: depositsBefore,
          balancesBefore: [...byCustomer.entries()].map(([id, e]) => ({ id, balance: e.balance })),
        },
        null,
        2
      )
    );

    // Free the lines before the deposits go: matched_deposit_id is a FK.
    const lineIds = plan.map((r) => r.id);
    await client.query(
      `UPDATE bank_statement_lines
          SET status = 'UNMATCHED', matched_order_id = NULL, matched_deposit_id = NULL,
              matched_by = NULL, matched_at = NULL
        WHERE id = ANY($1::int[])`,
      [lineIds]
    );

    if (depositIds.length) {
      await client.query(`DELETE FROM deposits WHERE id = ANY($1::int[])`, [depositIds]);
    }

    for (const [id, e] of byCustomer) {
      await client.query(`UPDATE customers SET balance = GREATEST(0, balance - $1) WHERE id = $2`, [
        e.removing.toFixed(2),
        id,
      ]);
    }

    const { rows: [left] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM bank_statement_lines l
        WHERE l.status = 'MATCHED'
          AND NOT EXISTS (SELECT 1 FROM order_payments op WHERE op.statement_line_id = l.id)`
    );
    const { rows: [neg] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM customers WHERE balance < 0`
    );
    if (neg.n > 0) throw new Error("post-write invariant broken: a customer balance went negative");

    console.log(`\nreturned ${lineIds.length} lines to the pool | ${naira(total)}`);
    console.log(`deleted ${depositIds.length} orphan wallet credits`);
    console.log(`lines still MATCHED with no order: ${left.n}`);
    console.log(`rollback written to ${rollbackPath}`);

    await client.query("COMMIT");
    console.log("COMMITTED");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK:", err.message);
    process.exitCode = 1;
  }

  await client.end();
}

main();
