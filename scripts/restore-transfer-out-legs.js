#!/usr/bin/env node
/**
 * Put back the outgoing half of every wallet-era transfer between two orders.
 *
 * ── What is wrong ─────────────────────────────────────────────────────────
 *
 * Under the wallet, a customer could ask for money sitting on one order to be
 * moved to another. The old system recorded that as a pair of deposits and a
 * pair of allocation rows:
 *
 *   order 9370   allocation -53,415,000   debit deposit 191
 *                              "From TRF TO ORDER AU9369 — Customer's request"
 *   order 9369   allocation +53,415,000   credit deposit 192
 *                              "From TRF FROM ORDER MR9370 — Customer's request"
 *
 * Migration 0021's backfill carried over the POSITIVE allocations and skipped
 * the negative ones — `order_payments` today holds no negative row outside a
 * transfer. So the money was credited to the order it moved TO and never
 * debited from the order it moved FROM, and both orders now claim it.
 *
 * On production that is 32 movements and 267,734,000 of surplus that does not
 * exist. Order 9370 is billed 53,415,000, carries 106,830,000 of payment rows,
 * and reads as 53,415,000 overpaid when in truth it is exactly settled.
 *
 * ── What this does ────────────────────────────────────────────────────────
 *
 * For each movement, and only where BOTH halves are on file:
 *
 *   1. writes the order_payment_transfers row the movement always was,
 *      carrying the customer's own stated reason;
 *   2. inserts the missing outgoing leg on the source order — negative,
 *      source 'transfer_out', at the amount the allocation ledger recorded;
 *   3. re-labels the existing incoming row on the destination order from
 *      'legacy' to 'transfer_in' and attaches it to the same transfer.
 *
 * Step 3 matters twice over. It makes the pair reversible as a unit —
 * reverseTransfer() deletes by transfer_id, and a half-attached transfer would
 * take the money off the source and leave it sitting on the destination. And
 * it is the more truthful label: that money did not arrive at the bank on that
 * order, it came off another order, which is exactly the line the report draws
 * between its "Amount Paid" column and its transfer columns. The destination's
 * `received` does not move — its bank figure falls and its net transfers rise
 * by the same amount — so no destination changes payment status.
 *
 * ── How a pair is identified ──────────────────────────────────────────────
 *
 * By what the old system wrote down, never by looking for a number that fits:
 *
 *   the debit deposit names the destination     "TRF TO ORDER <ref>"
 *   the credit deposit names the source         "TRF FROM ORDER <ref>"
 *
 * Both references end in the order's own id. A movement is repaired only when
 * those two descriptions point at each other, the amounts agree to the kobo,
 * and the credit deposit has exactly one payment row to re-label. Anything
 * else is printed and skipped — see "Skipped" in the output.
 *
 * ── What it will not touch ────────────────────────────────────────────────
 *
 *   - orders with a genuine shortfall. Nothing here creates or clears one:
 *     every source order in this set is fully covered once its outgoing leg
 *     is back, which is what the allocation ledger has said all along.
 *   - deposits, statement lines, balances, holds. No money moves. This is
 *     bookkeeping about money that moved in June and July.
 *   - any order outside a repaired pair.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/restore-transfer-out-legs.js            dry run, prints a plan
 *   node scripts/restore-transfer-out-legs.js --apply    commits
 *
 * --apply writes scripts/rollback-transfer-legs-<stamp>.json holding every row
 * it created and the prior state of every row it changed.
 */
require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const naira = (v) =>
  `NGN ${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dec = (v) => Number(v).toFixed(2);

/**
 * Every movement the old ledger recorded, with both halves resolved.
 *
 * The join is deliberately strict. `from_order` on the credit side and
 * `to_order` on the debit side must point back at each other, so a credit that
 * merely happens to be the right size cannot be taken for the other half of
 * this movement — which matters where one order sent the same round figure to
 * several others on the same afternoon.
 */
const PAIRS = `
  WITH out_leg AS (
    SELECT a.id          AS alloc_id,
           a.order_id    AS from_order,
           a.amount      AS amount,
           a.created_at  AS moved_at,
           d.id          AS debit_deposit,
           d.description AS description,
           substring(d.description from 'TRF TO ORDER [A-Z]*([0-9]+)')::int AS to_order
      FROM order_deposit_allocations a
      JOIN deposits d ON d.id = a.deposit_id
     WHERE a.amount < 0
  ),
  in_leg AS (
    SELECT cd.id     AS credit_deposit,
           cd.amount AS amount,
           substring(cd.description from 'TRF FROM ORDER [A-Z]*([0-9]+)')::int AS from_order
      FROM deposits cd
     WHERE cd.type = 'credit' AND cd.description LIKE '%TRF FROM ORDER%'
  )
  SELECT o.alloc_id, o.from_order, o.to_order, o.moved_at, o.debit_deposit, o.description,
         (-o.amount)::numeric AS moved,
         i.credit_deposit,
         p.id                 AS in_payment_id,
         p.order_id           AS in_payment_order,
         p.source             AS in_payment_source,
         p.confirmation_basis AS in_payment_basis,
         p.transfer_id        AS in_payment_transfer,
         fo.order_number AS from_ref, fo.total_amount AS from_value,
         t2.order_number AS to_ref,
         (SELECT COALESCE(SUM(x.amount),0) FROM order_payments x WHERE x.order_id = o.from_order) AS from_pays,
         (SELECT COUNT(*)::int FROM order_payments x
           WHERE x.order_id = o.from_order AND x.source = 'transfer_out'
             AND ROUND(x.amount) = ROUND(o.amount)) AS already_done
    FROM out_leg o
    LEFT JOIN in_leg i          ON i.from_order = o.from_order AND ROUND(i.amount) = ROUND(-o.amount)
    LEFT JOIN order_payments p  ON p.deposit_id = i.credit_deposit
    LEFT JOIN orders fo         ON fo.id = o.from_order
    LEFT JOIN orders t2         ON t2.id = o.to_order
   ORDER BY o.amount
`;

/** The reason the customer actually gave, off the deposit's own description. */
const reasonFrom = (description) => {
  const said = String(description || "").split("—")[1];
  const trimmed = (said || "").trim();
  return trimmed
    ? `Wallet-era transfer between orders — ${trimmed}`
    : "Wallet-era transfer between orders, restored from the allocation ledger";
};

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query("BEGIN");

  const { rows } = await client.query(PAIRS);

  const plan = [];
  const skipped = [];
  for (const r of rows) {
    const stop = (why) => skipped.push({ ...r, why });
    if (Number(r.already_done) > 0) { stop("outgoing leg already present"); continue; }
    if (!r.credit_deposit) { stop("no matching credit deposit"); continue; }
    if (!r.in_payment_id) { stop("credit deposit has no payment row to re-label"); continue; }
    if (Number(r.in_payment_order) !== Number(r.to_order)) {
      stop(`incoming row sits on order ${r.in_payment_order}, not ${r.to_order}`); continue;
    }
    if (r.in_payment_transfer) { stop("incoming row already belongs to a transfer"); continue; }
    if (!r.to_ref) { stop("destination order not found"); continue; }
    plan.push(r);
  }

  console.log(`${rows.length} movements in the allocation ledger`);
  console.log(`${plan.length} repairable, ${skipped.length} skipped\n`);

  let total = 0;
  for (const r of plan) {
    total += Number(r.moved);
    const surplusNow = Number(r.from_pays) - Number(r.from_value);
    console.log(
      `  ${String(r.from_ref).padEnd(16)} -> ${String(r.to_ref).padEnd(16)} ${naira(r.moved).padStart(22)}` +
      `   surplus ${naira(surplusNow).padStart(22)} -> ${naira(surplusNow - Number(r.moved)).padStart(22)}`
    );
  }
  console.log(`\n  total moving back: ${naira(total)}`);

  if (skipped.length) {
    console.log("\nSkipped — these need a person:");
    for (const r of skipped) {
      console.log(`  alloc ${r.alloc_id}  order ${r.from_order} -> ${r.to_order}  ${naira(r.moved)}  — ${r.why}`);
      console.log(`      ${r.description}`);
    }
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
    await client.query("ROLLBACK");
    await client.end();
    return;
  }

  try {
    const created = [];
    const relabelled = [];

    for (const r of plan) {
      const { rows: [transfer] } = await client.query(
        `INSERT INTO order_payment_transfers
           (from_order_id, to_order_id, amount, reason, recorded_by, created_at)
         VALUES ($1, $2, $3, $4, NULL, $5)
         RETURNING id`,
        [r.from_order, r.to_order, dec(r.moved), reasonFrom(r.description), r.moved_at]
      );

      // Basis 'transfer_auto' for the same reason migration 0021 used it: this
      // leg was converted from a wallet draw by a script, and nobody at the
      // desk made it on the transfer screen. It stays in the review queue
      // until a person vouches for it.
      const { rows: [outLeg] } = await client.query(
        `INSERT INTO order_payments
           (order_id, statement_line_id, bank_account_id, amount, source, txn_date,
            depositor, narration, bank_ref, bank_name, account_name, account_number,
            transfer_id, deposit_id, recorded_by, note, confirmation_basis, created_at, updated_at)
         VALUES ($1, NULL, NULL, $2, 'transfer_out', NULL,
                 '', '', '', '', '', '',
                 $3, $4, NULL, $5, 'transfer_auto', $6, NOW())
         RETURNING id`,
        [
          r.from_order,
          dec(-Number(r.moved)),
          transfer.id,
          r.debit_deposit,
          `Restored from allocation ${r.alloc_id} — ${r.description}`,
          r.moved_at,
        ]
      );

      // Prior state comes off the SELECT above, taken before this UPDATE ran —
      // reading it back afterwards would only return what we just wrote.
      relabelled.push({
        paymentId: r.in_payment_id,
        priorSource: r.in_payment_source,
        priorConfirmationBasis: r.in_payment_basis,
        priorTransferId: r.in_payment_transfer,
        transferId: transfer.id,
      });

      await client.query(
        `UPDATE order_payments
            SET source = 'transfer_in', transfer_id = $1,
                confirmation_basis = 'transfer_auto', updated_at = NOW()
          WHERE id = $2`,
        [transfer.id, r.in_payment_id]
      );

      created.push({ transferId: transfer.id, outLegPaymentId: outLeg.id, allocId: r.alloc_id });
    }

    // Both ends of every repaired movement, so amount_paid and payment_status
    // agree with the rows underneath them again. Same arithmetic as
    // orderPayment.service.recomputeOrder(), compared at kobo scale.
    const touched = [...new Set(plan.flatMap((r) => [Number(r.from_order), Number(r.to_order)]))];
    const { rows: ordersBefore } = await client.query(
      `SELECT id, amount_paid, payment_status FROM orders WHERE id = ANY($1::int[])`,
      [touched]
    );

    await client.query(
      `UPDATE orders o
          SET amount_paid = t.received,
              -- payment_status is the order_payment_status enum, not text, so
              -- the CASE has to be cast: Postgres will not coerce it here.
              payment_status = (CASE
                WHEN t.received <= 0 THEN 'Unpaid'
                WHEN ROUND(t.received * 100) >= ROUND(o.total_amount::numeric * 100) THEN 'Paid'
                ELSE 'Part Paid' END)::order_payment_status,
              updated_at = NOW()
         FROM (SELECT o2.id,
                      COALESCE((SELECT SUM(p.amount) FROM order_payments p WHERE p.order_id = o2.id), 0) AS received
                 FROM orders o2 WHERE o2.id = ANY($1::int[])) t
        WHERE o.id = t.id`,
      [touched]
    );

    const { rows: ordersAfter } = await client.query(
      `SELECT id, amount_paid, payment_status FROM orders WHERE id = ANY($1::int[])`,
      [touched]
    );
    const flipped = ordersAfter.filter((a) => {
      const b = ordersBefore.find((x) => x.id === a.id);
      return b && b.payment_status !== a.payment_status;
    });

    // The point of the exercise, checked against the table rather than the
    // plan: no order in this set may still claim surplus that came from a
    // movement, and no repair may have pushed one below its own value.
    const { rows: [balance] } = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE t.recv - o.total_amount::numeric > 0.005)::int AS still_over,
         COUNT(*) FILTER (WHERE o.total_amount::numeric - t.recv > 0.005)::int AS now_short
       FROM orders o
       JOIN LATERAL (SELECT COALESCE(SUM(p.amount),0) AS recv
                       FROM order_payments p WHERE p.order_id = o.id) t ON TRUE
      WHERE o.id = ANY($1::int[])`,
      [touched]
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const rollbackPath = path.join(__dirname, `rollback-transfer-legs-${stamp}.json`);
    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          note:
            "Undo: delete order_payments by outLegPaymentId, delete order_payment_transfers by transferId, " +
            "restore each relabelled row's priorSource/priorConfirmationBasis/priorTransferId, " +
            "then restore orders.amount_paid and payment_status from ordersBefore.",
          created,
          relabelled,
          ordersBefore,
        },
        null,
        2
      )
    );

    console.log(`\nrepaired ${plan.length} movements | ${naira(total)} moved back`);
    console.log(`orders touched ${touched.length} | payment status changed on ${flipped.length}`);
    for (const f of flipped) {
      const b = ordersBefore.find((x) => x.id === f.id);
      console.log(`   order ${f.id}: ${b.payment_status} -> ${f.payment_status}`);
    }
    console.log(`still showing surplus: ${balance.still_over} | now short: ${balance.now_short}`);
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
