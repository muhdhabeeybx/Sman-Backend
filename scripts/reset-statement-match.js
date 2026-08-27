#!/usr/bin/env node
/**
 * Put statement lines back to unmatched, as if they had never been claimed.
 *
 *   node scripts/reset-statement-match.js 4911 4912 4913
 *   node scripts/reset-statement-match.js 4911 4912 4913 --apply
 *
 * ── Why this deletes rather than reverses ─────────────────────────────────
 *
 * wallet.service.unmatchStatementDeposit() reverses: it writes a mirror debit
 * and leaves both rows on the ledger, which is right when a real payment was
 * attributed to the wrong place and the history matters.
 *
 * It is wrong here, because a reversed deposit keeps its bank reference, and
 * credit() is idempotent on that reference. Re-matching the same line would
 * find the old deposit and be refused — "already used by another deposit".
 * The line would be free in the UI and impossible to actually claim, which is
 * worse than leaving it alone.
 *
 * So when the intent is genuinely "start this match over", the deposit has to
 * go. That is only safe while it has funded nothing: this refuses outright if
 * any allocation points at it, since removing it would silently defund an
 * order.
 *
 * ── What it leaves behind ─────────────────────────────────────────────────
 *
 * The statement lines, UNMATCHED, with no deposit, order, matcher or match
 * time — exactly as an upload leaves them. The customer's balance drops by
 * what the deleted credits put there, so nothing is left sitting in a wallet.
 */
require("dotenv").config();
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);

const naira = (v) =>
  `₦${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  if (!ids.length) {
    console.error("Give at least one deposit id:\n  node scripts/reset-statement-match.js 4911 4912 4913 [--apply]");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");

  try {
    const deposits = (
      await client.query(
        `SELECT d.id, d.customer_id, d.amount::numeric, d.type, d.reference, d.remaining_amount::numeric AS remaining,
                c.name AS customer_name, c.balance::numeric AS balance
           FROM deposits d JOIN customers c ON c.id = d.customer_id
          WHERE d.id = ANY($1::int[])`,
        [ids]
      )
    ).rows;

    const found = new Set(deposits.map((d) => d.id));
    for (const id of ids) if (!found.has(id)) console.log(`  deposit ${id}: not found — skipped`);

    // A deposit that funded something must not be removed from under it.
    const allocated = (
      await client.query(
        `SELECT deposit_id, order_id FROM order_deposit_allocations WHERE deposit_id = ANY($1::int[])`,
        [ids]
      )
    ).rows;
    if (allocated.length) {
      for (const a of allocated) {
        console.error(`  deposit ${a.deposit_id} still funds order ${a.order_id}`);
      }
      throw new Error("refusing: one or more deposits are attributed to an order — re-match that order instead");
    }

    const lines = (
      await client.query(
        `SELECT id, matched_deposit_id, matched_order_id, amount::numeric, status
           FROM bank_statement_lines WHERE matched_deposit_id = ANY($1::int[]) ORDER BY id`,
        [ids]
      )
    ).rows;

    // Per customer, so a multi-customer run reports each balance correctly.
    const byCustomer = new Map();
    for (const d of deposits) {
      if (d.type !== "credit") throw new Error(`deposit ${d.id} is a ${d.type}, not a credit`);
      const entry = byCustomer.get(d.customer_id) || {
        name: d.customer_name, balance: Number(d.balance), total: 0,
      };
      entry.total += Number(d.amount);
      byCustomer.set(d.customer_id, entry);
    }

    console.log(`\nDeposits to delete: ${deposits.length}`);
    for (const d of deposits) {
      console.log(`  ${d.id} · ${naira(d.amount)} · ref ${d.reference || "none"} · ${d.customer_name}`);
    }
    console.log(`\nStatement lines returned to UNMATCHED: ${lines.length}`);
    for (const l of lines) {
      console.log(`  line ${l.id} · ${naira(l.amount)} · was deposit ${l.matched_deposit_id}, order ${l.matched_order_id ?? "none"}`);
    }
    console.log(`\nWallet balances:`);
    for (const [id, e] of byCustomer) {
      console.log(`  ${e.name} (#${id}): ${naira(e.balance)} → ${naira(e.balance - e.total)}`);
      if (e.balance - e.total < -0.005) {
        throw new Error(`refusing: ${e.name} would be left with a negative balance — that money has been spent`);
      }
    }

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN — nothing written. Add --apply to commit.");
      await client.end();
      return;
    }

    // Free the lines before the deposits go: matched_deposit_id is a FK.
    await client.query(
      `UPDATE bank_statement_lines
          SET status = 'UNMATCHED', matched_deposit_id = NULL, matched_order_id = NULL,
              matched_by = NULL, matched_at = NULL
        WHERE matched_deposit_id = ANY($1::int[])`,
      [ids]
    );
    await client.query(`DELETE FROM deposits WHERE id = ANY($1::int[])`, [ids]);
    for (const [id, e] of byCustomer) {
      await client.query(
        `UPDATE customers SET balance = balance - $1, updated_at = now() WHERE id = $2`,
        [e.total, id]
      );
    }

    const negative = (await client.query(`SELECT COUNT(*)::int n FROM customers WHERE balance < 0`)).rows[0].n;
    if (negative) throw new Error(`${negative} customer(s) left with a negative balance`);

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
