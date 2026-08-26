#!/usr/bin/env node
/**
 * Put every confirmed order back on the payment it was actually confirmed
 * against.
 *
 * ── What went wrong ───────────────────────────────────────────────────────
 *
 * Confirming an order from the bank statement records one auditable fact:
 * THESE lines, for THIS order. It is written down twice — on the line
 * (matched_order_id) and on the deposit (paystack_details.orderId) — and until
 * now neither was ever read back. The order was paid by placing a wallet hold,
 * and allocateOrderFunding() then walked the customer's whole wallet
 * oldest-credit-first to decide what had "paid" for it.
 *
 * Order 11453 is the case that surfaced it. Staff matched statement line 3761
 * — TETRIS ENERGY LIMITED, ref 32923089257, ₦18,075,000 — to it. The report
 * showed:
 *
 *     250,000.00   off a stranger's credit (ref 32871165789)
 *     250,000.00   "Wallet transfer from customer #7966"
 *   9,724,500.00   of the credit that was actually chosen
 *
 * Not one of those three figures can be found on a bank statement, which is
 * the only document this report is ever checked against.
 *
 * scripts/solve-split-allocations.js then re-shuffled the ledger again to
 * minimise pass-through chains — a reasonable thing to optimise if the
 * allocations were arbitrary, which is exactly the assumption this script
 * removes.
 *
 * ── What this does ────────────────────────────────────────────────────────
 *
 * For every order the statement can account for, it rewrites the allocation
 * ledger to say what was really done:
 *
 *   bank rows    one per statement line matched to this order, recorded at
 *                the line's FACE value. What the order consumed of it is
 *                capped at the order's own value, so an overpayment shows as
 *                a differential instead of being trimmed away silently.
 *   wallet rows  only where the matched lines did not cover the order, and
 *                only from allocations the ledger already had — this never
 *                invents a funding link that was not already believed.
 *
 * ── What it will not touch ────────────────────────────────────────────────
 *
 *   - any order with no statement evidence. There is nothing to restore it
 *     to, and a guess dressed as a correction is worse than the status quo.
 *   - the applied amounts of those orders. They are reserved off each
 *     deposit before anything is written, so repairing one order can never
 *     take funding away from an order this script is not looking at.
 *   - balances, holds, deposits, statement lines. Nothing here is money
 *     movement; it is bookkeeping about money that already moved.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/restore-order-payment-attribution.js              dry run
 *   node scripts/restore-order-payment-attribution.js --verbose    + per-order detail
 *   node scripts/restore-order-payment-attribution.js --apply      commits
 *
 * --apply writes a rollback file (scripts/rollback-attribution-<stamp>.json)
 * holding every allocation row and deposit remainder as they were before,
 * and refuses to commit if any invariant below fails.
 *
 *   - no deposit applied beyond its own amount
 *   - no order applied beyond its own value
 *   - no negative remainder
 *   - every untouched order's funding identical to before
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

/** Money in kobo — integers only, so nothing rounds its way into a mismatch. */
const K = (v) => Math.round(Number(v || 0) * 100);
const naira = (k) =>
  `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dec = (k) => (k / 100).toFixed(2);

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");

  try {
    // ── 1. The evidence ───────────────────────────────────────────────────
    // A statement line naming the order it was claimed for is the strongest
    // record there is: it is the row an auditor holds. The deposit's own
    // paystack_details.orderId covers deposits typed in by hand, which have
    // no line. Where a deposit has both, the line's amount wins — the deposit
    // is derived from it, not the other way round.
    const evidence = (
      await client.query(`
        SELECT
          l.matched_order_id            AS order_id,
          l.matched_deposit_id          AS deposit_id,
          SUM(l.amount)::numeric        AS face,
          MIN(d.created_at)             AS deposit_created_at,
          MIN(d.reference)              AS reference,
          MIN(d.customer_id)            AS customer_id
        FROM bank_statement_lines l
        JOIN deposits d ON d.id = l.matched_deposit_id
        WHERE l.matched_order_id IS NOT NULL
          AND l.matched_deposit_id IS NOT NULL
          AND d.type = 'credit'
        GROUP BY l.matched_order_id, l.matched_deposit_id

        UNION ALL

        SELECT
          (d.paystack_details->>'orderId')::int,
          d.id,
          d.amount::numeric,
          d.created_at,
          d.reference,
          d.customer_id
        FROM deposits d
        WHERE d.type = 'credit'
          AND d.paystack_details->>'orderId' ~ '^[0-9]+$'
          AND NOT EXISTS (
            SELECT 1 FROM bank_statement_lines l
            WHERE l.matched_deposit_id = d.id AND l.matched_order_id IS NOT NULL
          )
      `)
    ).rows;

    // A credit claimed for two different orders would be double-reported at
    // face value under both. It should be impossible — a line is claimed once
    // and becomes exactly one deposit — but "should be impossible" is what
    // the old allocation walk was built on, so it gets checked.
    const ordersPerDeposit = new Map();
    for (const e of evidence) {
      if (!ordersPerDeposit.has(e.deposit_id)) ordersPerDeposit.set(e.deposit_id, new Set());
      ordersPerDeposit.get(e.deposit_id).add(e.order_id);
    }
    const contested = [...ordersPerDeposit].filter(([, s]) => s.size > 1);
    if (contested.length) {
      console.log(`\n⚠ ${contested.length} credit(s) claimed by more than one order — skipped, they need a human:`);
      for (const [dep, orders] of contested.slice(0, 20)) {
        console.log(`   deposit ${dep} → orders ${[...orders].join(", ")}`);
      }
    }
    const contestedDeposits = new Set(contested.map(([dep]) => dep));

    const usable = evidence.filter((e) => !contestedDeposits.has(e.deposit_id));
    const targetOrderIds = [...new Set(usable.map((e) => e.order_id))];

    // ── 2. What is on the books now ───────────────────────────────────────
    const existing = (
      await client.query(`
        SELECT a.id, a.order_id, a.deposit_id, a.amount::numeric, a.applied_amount::numeric AS applied,
               a.source, d.created_at AS deposit_created_at, d.amount::numeric AS deposit_amount,
               d.reference
          FROM order_deposit_allocations a
          JOIN deposits d ON d.id = a.deposit_id
      `)
    ).rows;

    /**
     * Which orders get rewritten.
     *
     * The ones with evidence, obviously. But also every order holding a claim
     * on a credit the statement assigns to a DIFFERENT order — because that
     * claim is the fabrication being undone, and leaving it in place would
     * defeat the whole exercise.
     *
     * Order 11437 is the case that showed why. Nineteen statement lines were
     * matched to it, summing to its value exactly. Three of those credits had
     * been handed to orders 11291 and 11293 by the old oldest-first walk, so
     * reserving those two orders' claims left 11437 unable to apply its own
     * payments — and it filled the gap with wallet draws instead, reporting
     * ₦877,791,000 received against a ₦666,600,000 order. Both figures wrong,
     * and the ₦211,191,000 gap between them pure double-count.
     *
     * An order rewritten only for this reason keeps whatever allocations it
     * holds on credits nobody else has a claim to, and loses the rest. What it
     * loses shows on the report as payment that isn't accounted for, which is
     * the truth: nothing recorded says what paid for it, and a borrowed bank
     * reference is not an answer.
     */
    const claimedByEvidence = new Set(usable.map((e) => e.deposit_id));
    const rewriting = new Set(targetOrderIds);
    const displaced = new Set();
    for (const a of existing) {
      if (rewriting.has(a.order_id)) continue;
      if (!claimedByEvidence.has(a.deposit_id)) continue;
      // Unless the evidence points at this very order, which would make it a
      // target already.
      rewriting.add(a.order_id);
      displaced.add(a.order_id);
    }

    // ── 3. The orders, and what each actually consumed ────────────────────
    // The wallet hold is the authority on what was taken; orders paid before
    // holds existed fall back to their own total. An unpaid order consumed
    // nothing at all, however much was received against it — that surplus is
    // the customer's balance, not this order's payment.
    const orders = (
      await client.query(
        `SELECT o.id, o.order_number, o.total_amount::numeric AS total, o.payment_status,
                o.customer_id,
                (SELECT h.amount::numeric FROM wallet_holds h
                  WHERE h.order_id = o.id AND h.status IN ('active','converted') LIMIT 1) AS hold
           FROM orders o WHERE o.id = ANY($1::int[])`,
        [[...rewriting]]
      )
    ).rows;
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const consumedBudget = (o) => {
      if (!o) return 0;
      if (o.hold != null) return K(o.hold);
      return o.payment_status === "Paid" ? K(o.total) : 0;
    };

    // Every deposit's capacity, less what orders this script is NOT touching
    // already hold against it. Reserving first is what makes repairing one
    // order incapable of defunding another.
    const depositIds = [...new Set([...usable.map((e) => e.deposit_id), ...existing.map((a) => a.deposit_id)])];
    const depositRows = (
      await client.query(
        `SELECT id, amount::numeric, remaining_amount::numeric AS remaining, customer_id, reference
           FROM deposits WHERE id = ANY($1::int[])`,
        [depositIds]
      )
    ).rows;
    const depositById = new Map(depositRows.map((d) => [d.id, d]));

    const available = new Map(depositRows.map((d) => [d.id, K(d.amount)]));
    for (const a of existing) {
      if (rewriting.has(a.order_id)) continue;
      available.set(a.deposit_id, (available.get(a.deposit_id) ?? 0) - K(a.applied));
    }

    // ── 4. Build the replacement ──────────────────────────────────────────
    const byOrder = new Map();
    for (const e of usable) {
      if (!byOrder.has(e.order_id)) byOrder.set(e.order_id, []);
      byOrder.get(e.order_id).push(e);
    }
    const existingByOrder = new Map();
    for (const a of existing) {
      if (!existingByOrder.has(a.order_id)) existingByOrder.set(a.order_id, []);
      existingByOrder.get(a.order_id).push(a);
    }

    /** { orderId, depositId, received, applied, source } */
    const planned = [];
    const report = [];
    let skippedWrongCustomer = 0;

    // Orders with evidence first: their bank rows have first claim on the
    // credits the statement says are theirs. A displaced order is only
    // entitled to whatever is left after that, which is the entire point of
    // pulling it into the rewrite.
    const rewriteOrder = [...targetOrderIds, ...displaced];

    for (const orderId of rewriteOrder) {
      const order = orderById.get(orderId);
      // An order deleted since the line was matched; the line's own
      // matched_order_id is stale and there is nothing to write it against.
      if (!order) continue;

      const rows = (byOrder.get(orderId) || [])
        .slice()
        .sort((a, b) => new Date(a.deposit_created_at) - new Date(b.deposit_created_at) || a.deposit_id - b.deposit_id);

      let need = consumedBudget(order);
      const before = existingByOrder.get(orderId) || [];
      const beforeReceived = before.reduce((s, a) => s + K(a.amount), 0);
      const lines = [];

      // --- bank rows: the statement, at face value ------------------------
      const claimed = new Set();
      for (const e of rows) {
        const deposit = depositById.get(e.deposit_id);
        // Money never crosses customers. A line matched to an order whose
        // customer does not own the deposit is a data problem, not something
        // to write into the ledger as fact.
        if (!deposit || deposit.customer_id !== order.customer_id) {
          skippedWrongCustomer += 1;
          continue;
        }
        const received = K(e.face);
        if (received <= 0) continue;
        const applied = Math.max(0, Math.min(received, need, available.get(e.deposit_id) ?? 0));
        available.set(e.deposit_id, (available.get(e.deposit_id) ?? 0) - applied);
        need -= applied;
        claimed.add(e.deposit_id);
        planned.push({ orderId, depositId: e.deposit_id, received, applied, source: "bank", reference: e.reference });
        lines.push(`      bank   ${naira(received)} received, ${naira(applied)} applied · ${e.reference || "no ref"}`);
      }

      // --- wallet rows: only the shortfall, only from what was already there
      // Deliberately not a fresh FIFO walk over the wallet. Where the
      // statement does not cover the order, the money genuinely did come from
      // balance, and the existing ledger's opinion of which balance is the
      // only record of it that exists. Re-deriving it would be inventing a
      // second guess to replace the first.
      if (need > 0) {
        const carryOver = before
          .filter((a) => !claimed.has(a.deposit_id))
          // A credit the statement assigns to some other order is not this
          // order's balance to draw on, however much of it is left over. That
          // borrowed claim is exactly what this script exists to remove, and
          // re-taking it here under a different label would be no better.
          .filter((a) => !claimedByEvidence.has(a.deposit_id))
          .sort((a, b) => new Date(a.deposit_created_at) - new Date(b.deposit_created_at) || a.deposit_id - b.deposit_id);
        for (const a of carryOver) {
          if (need <= 0) break;
          const take = Math.max(0, Math.min(K(a.applied), need, available.get(a.deposit_id) ?? 0));
          if (take <= 0) continue;
          available.set(a.deposit_id, (available.get(a.deposit_id) ?? 0) - take);
          need -= take;
          planned.push({ orderId, depositId: a.deposit_id, received: take, applied: take, source: "wallet", reference: a.reference });
          lines.push(`      wallet ${naira(take)} drawn from balance · ${a.reference || "no ref"}`);
        }
      }

      const afterReceived = planned
        .filter((p) => p.orderId === orderId)
        .reduce((s, p) => s + p.received, 0);

      const changed =
        before.length !== lines.length ||
        beforeReceived !== afterReceived ||
        before.some((a) => !planned.some((p) => p.orderId === orderId && p.depositId === a.deposit_id && p.received === K(a.amount)));

      if (changed) {
        report.push({
          orderId,
          orderNumber: order.order_number,
          total: K(order.total),
          beforeReceived,
          afterReceived,
          beforeRows: before.length,
          afterRows: lines.length,
          unfunded: need,
          displaced: displaced.has(orderId),
          lines,
        });
      }
    }

    // ── 5. Deposit remainders, recomputed from scratch ────────────────────
    // Not adjusted incrementally: remaining_amount has been written by three
    // different generations of this code, and the only figure that can be
    // trusted is the one derived from what is on the books right now.
    const appliedByDeposit = new Map();
    for (const a of existing) {
      if (rewriting.has(a.order_id)) continue;
      appliedByDeposit.set(a.deposit_id, (appliedByDeposit.get(a.deposit_id) || 0) + K(a.applied));
    }
    for (const p of planned) {
      appliedByDeposit.set(p.depositId, (appliedByDeposit.get(p.depositId) || 0) + p.applied);
    }

    const remainderChanges = [];
    for (const d of depositRows) {
      const next = K(d.amount) - (appliedByDeposit.get(d.id) || 0);
      // A deposit that predates the ledger carries a NULL remainder and must
      // keep it — writing a figure would offer it to the FIFO walk as
      // spendable money that was in fact spent years ago, off the books.
      if (d.remaining === null) continue;
      if (next !== K(d.remaining)) remainderChanges.push({ id: d.id, from: K(d.remaining), to: next });
    }

    // ── 6. Invariants ─────────────────────────────────────────────────────
    const problems = [];
    for (const [depId, applied] of appliedByDeposit) {
      const d = depositById.get(depId);
      if (d && applied > K(d.amount)) {
        problems.push(`deposit ${depId} applied ${naira(applied)} of a ${naira(K(d.amount))} credit`);
      }
    }
    const appliedByOrder = new Map();
    for (const p of planned) {
      appliedByOrder.set(p.orderId, (appliedByOrder.get(p.orderId) || 0) + p.applied);
    }
    for (const [orderId, applied] of appliedByOrder) {
      const budget = consumedBudget(orderById.get(orderId));
      if (applied > budget) {
        problems.push(`order ${orderId} applied ${naira(applied)} against a ${naira(budget)} budget`);
      }
    }
    for (const r of remainderChanges) {
      if (r.to < 0) problems.push(`deposit ${r.id} would be left with ${naira(r.to)}`);
    }

    // ── 7. Say what happens ───────────────────────────────────────────────
    const totalBefore = report.reduce((s, r) => s + r.beforeReceived, 0);
    const totalAfter = report.reduce((s, r) => s + r.afterReceived, 0);

    console.log(`\nOrders with statement evidence : ${targetOrderIds.length}`);
    console.log(`Orders holding another's credit: ${displaced.size}`);
    console.log(`Orders whose funding changes   : ${report.length}`);
    console.log(`Allocation rows to be written  : ${planned.length}`);
    console.log(`Deposit remainders to correct  : ${remainderChanges.length}`);
    if (skippedWrongCustomer) {
      console.log(`Lines skipped (deposit belongs to another customer): ${skippedWrongCustomer}`);
    }
    console.log(`Amount attributed to those orders: ${naira(totalBefore)} → ${naira(totalAfter)}`);

    const stillShort = report.filter((r) => r.unfunded > 0);
    if (stillShort.length) {
      const gap = stillShort.reduce((s, r) => s + r.unfunded, 0);
      console.log(
        `\n${stillShort.length} order(s) end up with ${naira(gap)} that nothing on record accounts for.\n` +
          `  These were paid — the hold covered them — but every credit the old walk pointed at\n` +
          `  belongs, per the statement, to a different order. The report carries the gap as\n` +
          `  untraced wallet balance, so those orders still reconcile to zero; they simply stop\n` +
          `  claiming a bank reference that was never theirs.`
      );
    }

    if (VERBOSE) {
      for (const r of report.slice(0, 200)) {
        console.log(
          `\n  ${r.orderNumber} (#${r.orderId}) · order ${naira(r.total)}` +
            (r.displaced ? " · was holding another order's credit" : "") +
            `\n    ${r.beforeRows} row(s) totalling ${naira(r.beforeReceived)}` +
            ` → ${r.afterRows} row(s) totalling ${naira(r.afterReceived)}`
        );
        for (const l of r.lines) console.log(l);
        if (r.unfunded > 0) console.log(`      (${naira(r.unfunded)} of the order not accounted for)`);
      }
      if (report.length > 200) console.log(`\n  … and ${report.length - 200} more`);
    }

    if (problems.length) {
      console.log(`\n✖ ${problems.length} invariant failure(s) — nothing will be written:`);
      for (const p of problems.slice(0, 30)) console.log(`   ${p}`);
      throw new Error("invariants failed");
    }

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN — nothing written. Re-run with --apply to commit, --verbose for per-order detail.");
      await client.end();
      return;
    }

    // ── 8. Rollback file, then write ──────────────────────────────────────
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rollbackPath = path.join(__dirname, `rollback-attribution-${stamp}.json`);
    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          allocations: existing.filter((a) => rewriting.has(a.order_id)),
          depositRemainders: remainderChanges.map((r) => ({ id: r.id, remaining: dec(r.from) })),
        },
        null,
        2
      )
    );
    console.log(`\nRollback written to ${rollbackPath}`);

    const del = (
      await client.query(`DELETE FROM order_deposit_allocations WHERE order_id = ANY($1::int[])`, [
        [...rewriting],
      ])
    ).rowCount;

    // One statement per batch, not one per row. Row-at-a-time was fine against
    // a local database and unusable against production: 2,645 inserts over
    // Railway's public proxy is 2,645 network round-trips, which turned a
    // sub-second write into several minutes of waiting on latency.
    const CHUNK = 500;
    for (let i = 0; i < planned.length; i += CHUNK) {
      const batch = planned.slice(i, i + CHUNK);
      const values = [];
      const params = [];
      batch.forEach((p, n) => {
        const b = n * 5;
        values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`);
        params.push(p.orderId, p.depositId, dec(p.received), dec(p.applied), p.source);
      });
      await client.query(
        `INSERT INTO order_deposit_allocations (order_id, deposit_id, amount, applied_amount, source)
         VALUES ${values.join(", ")}`,
        params
      );
    }

    // Same again: one UPDATE driven by a values list, rather than 23 of them.
    if (remainderChanges.length) {
      await client.query(
        `UPDATE deposits d SET remaining_amount = v.remaining::numeric
           FROM (SELECT * FROM unnest($1::int[], $2::text[]) AS t(id, remaining)) v
          WHERE d.id = v.id`,
        [remainderChanges.map((r) => r.id), remainderChanges.map((r) => dec(r.to))]
      );
    }

    // Same checks again, against what is actually in the table now.
    const over = (
      await client.query(`SELECT COUNT(*)::int n FROM (
        SELECT d.id FROM deposits d JOIN order_deposit_allocations a ON a.deposit_id = d.id
        GROUP BY d.id, d.amount
        HAVING SUM(a.applied_amount::numeric) > d.amount::numeric + 0.005) t`)
    ).rows[0].n;
    const negative = (
      await client.query(
        `SELECT COUNT(*)::int n FROM deposits WHERE remaining_amount IS NOT NULL AND remaining_amount < 0`
      )
    ).rows[0].n;

    console.log(`deleted ${del} | inserted ${planned.length} | remainders corrected ${remainderChanges.length}`);
    console.log(`credits overspent: ${over} | negative remainders: ${negative}`);
    if (over || negative) throw new Error("post-write invariant broken");

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
