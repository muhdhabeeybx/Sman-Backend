#!/usr/bin/env node
/**
 * Give back money that a deleted order took with it.
 *
 * ── What happened ─────────────────────────────────────────────────────────
 *
 * placeHold() takes an order's amount out of customers.balance, and the
 * wallet_holds row is the only record that it is owed back. deleteOrder used
 * to remove that row with a raw DELETE, so the balance stayed short and
 * nothing on the ledger said why. Fixed in the controller; this repairs the
 * one order it already happened to.
 *
 * PU11486 — ₦103,700,000, Paid, deleted 2026-08-26. Customer 6997 was left
 * with three unspent credits totalling exactly that (₦40,000,000 +
 * ₦54,900,000 + ₦8,800,000) and a balance of zero.
 *
 * ── What it does ──────────────────────────────────────────────────────────
 *
 * Two things, both derived from the audit log rather than hardcoded:
 *
 *   1. Credits the balance back by what the deleted order was holding.
 *   2. Clears matched_order_id on any statement line still pointing at an
 *      order that no longer exists. The line stays MATCHED to its deposit —
 *      the payment is real and the match was right — it simply stops naming
 *      a dead order, which is what made those credits look spent when they
 *      are not.
 *
 * Deliberately does NOT reverse the deposits. They are genuine, unspent, and
 * matched to the right statement lines; the money just needs to be spendable
 * again so it can be put toward the replacement order.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/repair-deleted-order-holds.js            dry run
 *   node scripts/repair-deleted-order-holds.js --apply    commits
 *
 * Safe to re-run: it credits only what is still missing, and a customer whose
 * balance already covers the loss is skipped.
 */
require("dotenv").config();
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const naira = (v) =>
  `₦${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");

  try {
    // Every paid order that was hard-deleted, and therefore took a live hold
    // with it. Unpaid orders held nothing, so they cost nothing.
    const losses = (
      await client.query(`
        SELECT entity_id AS order_id,
               metadata->>'orderNumber' AS order_number,
               (metadata->>'totalAmount')::numeric AS amount,
               (metadata->>'customerId')::int AS customer_id,
               created_at
          FROM audit_logs
         WHERE action = 'order.deleted'
           AND metadata->>'paymentStatus' = 'Paid'
         ORDER BY created_at
      `)
    ).rows;

    console.log(`\nPaid orders hard-deleted: ${losses.length}`);

    let restored = 0;
    for (const loss of losses) {
      const [customer] = (
        await client.query(`SELECT id, name, balance::numeric FROM customers WHERE id = $1`, [
          loss.customer_id,
        ])
      ).rows;
      if (!customer) {
        console.log(`  ${loss.order_number}: customer ${loss.customer_id} no longer exists — skipped`);
        continue;
      }

      console.log(
        `\n  ${loss.order_number} · ${customer.name} (#${customer.id})` +
          `\n    held at deletion : ${naira(loss.amount)}` +
          `\n    balance now      : ${naira(customer.balance)}` +
          `\n    balance after    : ${naira(Number(customer.balance) + Number(loss.amount))}`
      );

      if (APPLY) {
        await client.query(
          `UPDATE customers SET balance = balance + $1, updated_at = now() WHERE id = $2`,
          [loss.amount, customer.id]
        );
      }
      restored += Number(loss.amount);
    }

    // Statement lines left naming an order that no longer exists. Their
    // deposits are real and unspent; only the pointer is dangling.
    const dangling = (
      await client.query(`
        SELECT l.id, l.matched_deposit_id, l.matched_order_id, d.amount::numeric, d.reference
          FROM bank_statement_lines l
          JOIN deposits d ON d.id = l.matched_deposit_id
         WHERE l.matched_order_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = l.matched_order_id)
         ORDER BY l.id
      `)
    ).rows;

    console.log(`\nStatement lines pointing at a deleted order: ${dangling.length}`);
    for (const l of dangling) {
      console.log(
        `  line ${l.id} · deposit ${l.matched_deposit_id} · ${naira(l.amount)} · ${l.reference || "no ref"}` +
          ` — was pointing at order ${l.matched_order_id}`
      );
    }

    if (APPLY && dangling.length) {
      await client.query(
        `UPDATE bank_statement_lines SET matched_order_id = NULL WHERE id = ANY($1::int[])`,
        [dangling.map((l) => l.id)]
      );
    }

    console.log(`\nBalance to restore: ${naira(restored)}`);

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
      await client.end();
      return;
    }

    const negative = (
      await client.query(`SELECT COUNT(*)::int n FROM customers WHERE balance < 0`)
    ).rows[0].n;
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
