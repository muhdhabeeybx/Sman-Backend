#!/usr/bin/env node
/**
 * Stop an order claiming more payment than it was billed.
 *
 * ── What is wrong ─────────────────────────────────────────────────────────
 *
 * 44 orders carry allocations summing to more than the order's own value —
 * ₦213,990,477 more in total. Order 10190 is the clearest: billed
 * ₦60,144,000, and carrying four credits totalling ₦120,288,000, exactly
 * double.
 *
 *     deposit 1308   48,420,000   LEKLAD GLOBAL RESOURCES · FCMB
 *     deposit 1316   48,420,000   LEKLAD GLOBAL RESOURCES · FCMB
 *     deposit 1309   11,724,000   LEKLAD GLOBAL RESOURCES · FCMB
 *     deposit 1317   11,724,000   LEKLAD GLOBAL RESOURCES · Zenith Bank
 *
 * On the report that reads as ₦60,144,000 overpaid, which it is not. It is an
 * order attributed twice over by the old oldest-credit-first walk, which
 * never checked what the order was worth.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * It does not delete or merge deposits, and it takes no view on whether any
 * of them are duplicate imports. Some plainly look it — 837 and 838 are the
 * same amount, same payer, same account, same day — but 1309 and 1317 are the
 * same amount into DIFFERENT banks, which is two real payments, not one
 * imported twice. Telling those apart needs the bank statement, not a script.
 *
 * All this does is cap: an order keeps credits up to its own value, oldest
 * first, and releases the rest. A released credit is not destroyed — it goes
 * back to being unattributed, which is the honest state for money nothing
 * records the destination of.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/cap-over-allocated-orders.js            dry run
 *   node scripts/cap-over-allocated-orders.js --verbose  + per-order detail
 *   node scripts/cap-over-allocated-orders.js --apply    commits
 *
 * --apply writes scripts/rollback-overalloc-<stamp>.json and refuses to
 * commit unless, afterwards, no order is over-applied and no deposit is
 * over-spent or left negative.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

const K = (v) => Math.round(Number(v || 0) * 100);
const naira = (k) =>
  `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dec = (k) => (k / 100).toFixed(2);

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");

  try {
    const over = (
      await client.query(`
        SELECT o.id, o.order_number, o.company_name, o.total_amount::numeric AS total,
               COALESCE(SUM(a.applied_amount), 0)::numeric AS applied
          FROM orders o
          JOIN order_deposit_allocations a ON a.order_id = o.id
         GROUP BY o.id, o.order_number, o.company_name, o.total_amount
        HAVING COALESCE(SUM(a.applied_amount), 0) - o.total_amount > 0.005
         ORDER BY COALESCE(SUM(a.applied_amount), 0) - o.total_amount DESC
      `)
    ).rows;

    if (!over.length) {
      console.log("No order is over-allocated. Nothing to do.");
      await client.query("ROLLBACK");
      await client.end();
      return;
    }

    const orderIds = over.map((o) => o.id);
    const allocations = (
      await client.query(
        `SELECT a.id, a.order_id, a.deposit_id, a.amount::numeric, a.applied_amount::numeric AS applied,
                a.source, d.created_at, d.remaining_amount::numeric AS remaining, d.reference,
                LEFT(d.description, 60) AS descr
           FROM order_deposit_allocations a
           JOIN deposits d ON d.id = a.deposit_id
          WHERE a.order_id = ANY($1::int[])
          ORDER BY a.order_id, d.created_at ASC, a.deposit_id ASC`,
        [orderIds]
      )
    ).rows;

    const byOrder = new Map();
    for (const a of allocations) {
      if (!byOrder.has(a.order_id)) byOrder.set(a.order_id, []);
      byOrder.get(a.order_id).push(a);
    }

    /** Allocation rows to delete outright, and rows to trim to a smaller slice. */
    const toDelete = [];
    const toTrim = [];
    /** depositId -> kobo to give back to remaining_amount (tracked deposits only). */
    const giveBack = new Map();
    const report = [];

    for (const o of over) {
      const rows = byOrder.get(o.id) || [];
      let budget = K(o.total);
      const lines = [];

      for (const a of rows) {
        const applied = K(a.applied);
        if (budget <= 0) {
          // Nothing left for this credit to pay for — release it whole.
          toDelete.push(a.id);
          if (a.remaining !== null) giveBack.set(a.deposit_id, (giveBack.get(a.deposit_id) || 0) + applied);
          lines.push(`      release ${naira(applied)} · ${a.reference || a.descr || "no ref"}`);
          continue;
        }
        if (applied > budget) {
          // Straddles the line: keep what the order can still take, release
          // the rest. `amount` follows `applied` down — on these legacy rows
          // the two are equal by construction (see migration 0011).
          const keep = budget;
          toTrim.push({ id: a.id, amount: keep, applied: keep });
          if (a.remaining !== null) giveBack.set(a.deposit_id, (giveBack.get(a.deposit_id) || 0) + (applied - keep));
          lines.push(`      trim    ${naira(applied)} → ${naira(keep)} · ${a.reference || a.descr || "no ref"}`);
          budget = 0;
          continue;
        }
        budget -= applied;
        lines.push(`      keep    ${naira(applied)} · ${a.reference || a.descr || "no ref"}`);
      }

      report.push({
        id: o.id,
        ref: o.order_number,
        total: K(o.total),
        was: K(o.applied),
        lines,
      });
    }

    const excess = over.reduce((s, o) => s + (K(o.applied) - K(o.total)), 0);
    console.log(`\nOrders over-allocated       : ${over.length}`);
    console.log(`Excess attribution removed  : ${naira(excess)}`);
    console.log(`Allocation rows released    : ${toDelete.length}`);
    console.log(`Allocation rows trimmed     : ${toTrim.length}`);
    console.log(`Deposit remainders restored : ${giveBack.size}`);

    if (VERBOSE) {
      for (const r of report) {
        console.log(`\n  ${r.ref} (#${r.id}) · billed ${naira(r.total)} · was carrying ${naira(r.was)}`);
        for (const l of r.lines) console.log(l);
      }
    }

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN — nothing written. Re-run with --apply to commit, --verbose for detail.");
      await client.end();
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rollbackPath = path.join(__dirname, `rollback-overalloc-${stamp}.json`);
    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          allocations: allocations.filter(
            (a) => toDelete.includes(a.id) || toTrim.some((t) => t.id === a.id)
          ),
          depositRemainders: [...giveBack.keys()].map((id) => ({
            id,
            remaining: allocations.find((a) => a.deposit_id === id)?.remaining ?? null,
          })),
        },
        null,
        2
      )
    );
    console.log(`\nRollback written to ${rollbackPath}`);

    if (toDelete.length) {
      await client.query(`DELETE FROM order_deposit_allocations WHERE id = ANY($1::int[])`, [toDelete]);
    }
    for (const t of toTrim) {
      await client.query(
        `UPDATE order_deposit_allocations SET amount = $1, applied_amount = $2 WHERE id = $3`,
        [dec(t.amount), dec(t.applied), t.id]
      );
    }
    for (const [depositId, back] of giveBack) {
      await client.query(
        `UPDATE deposits SET remaining_amount = remaining_amount + $1 WHERE id = $2 AND remaining_amount IS NOT NULL`,
        [dec(back), depositId]
      );
    }

    const stillOver = (
      await client.query(`SELECT COUNT(*)::int n FROM (
        SELECT o.id FROM orders o JOIN order_deposit_allocations a ON a.order_id = o.id
        GROUP BY o.id, o.total_amount
        HAVING SUM(a.applied_amount::numeric) - o.total_amount::numeric > 0.005) t`)
    ).rows[0].n;
    const overspent = (
      await client.query(`SELECT COUNT(*)::int n FROM (
        SELECT d.id FROM deposits d JOIN order_deposit_allocations a ON a.deposit_id = d.id
        GROUP BY d.id, d.amount HAVING SUM(a.applied_amount::numeric) > d.amount::numeric + 0.005) t`)
    ).rows[0].n;
    const negative = (
      await client.query(
        `SELECT COUNT(*)::int n FROM deposits WHERE remaining_amount IS NOT NULL AND remaining_amount < 0`
      )
    ).rows[0].n;

    console.log(`orders still over-applied: ${stillOver} | credits overspent: ${overspent} | negative remainders: ${negative}`);
    if (stillOver || overspent || negative) throw new Error("post-write invariant broken");

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
