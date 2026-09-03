#!/usr/bin/env node
/**
 * Remove bank statement rows that are the same transaction imported twice.
 *
 * ── What is wrong ─────────────────────────────────────────────────────────
 *
 * The same statement has been uploaded more than once. Each upload gets its
 * own bank_statements row, and the line-level `dedup_key` was never enforced
 * across uploads, so one bank transaction can sit in the table two or three
 * times:
 *
 *   ref 32545872447  100,000,000  line 3390  statement 323  MATCHED to 11138
 *   ref 32545872447  100,000,000  line 3397  statement 324  UNMATCHED
 *                    ^ identical dedup_key d9a0220eedacfcef5f06cda473408361
 *
 * On production that is 82 references, 96 redundant rows, and roughly ₦5.19bn
 * of money that was never in the bank twice. None of it is double-counted onto
 * an order today — every duplicate group has at most one row carrying a
 * payment — so no order balance is wrong because of this. What it does is
 * offer the matching desk money that does not exist, and the day somebody
 * matches one of these to an order, revenue is invented.
 *
 * ── Which row survives ────────────────────────────────────────────────────
 *
 * The one that is actually in use, never simply the oldest. A group is keyed
 * on (bank_ref, amount) — which also catches the copies whose txn_date shifted
 * by a day between uploads and so have different dedup_keys — and the keeper
 * is chosen in this order:
 *
 *   1. a row carrying an order_payments row
 *   2. a row with a matched order or a matched deposit
 *   3. a row whose status is MATCHED
 *   4. failing all of that, the lowest id
 *
 * ── What it deletes ───────────────────────────────────────────────────────
 *
 * Only rows that are provably free: status UNMATCHED, no matched order, no
 * matched deposit, and no payment row pointing at them. A duplicate that is
 * attached to anything at all is left where it is and printed under "kept,
 * still attached" — two rows of a group being in use is a different problem
 * from this one, and deleting either would take money off an order.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/delete-duplicate-statement-lines.js            dry run
 *   node scripts/delete-duplicate-statement-lines.js --apply    commits
 *
 * --apply writes scripts/rollback-duplicate-lines-<stamp>.json containing every
 * deleted row in full, so any of them can be re-inserted verbatim.
 */
require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const naira = (v) =>
  `NGN ${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const GROUPS = `
  WITH g AS (
    SELECT bank_ref, amount
      FROM bank_statement_lines
     WHERE bank_ref IS NOT NULL AND bank_ref <> '' AND amount > 0
     GROUP BY bank_ref, amount
    HAVING COUNT(*) > 1
  )
  SELECT l.*,
         (SELECT COUNT(*)::int FROM order_payments op WHERE op.statement_line_id = l.id) AS payment_rows
    FROM bank_statement_lines l
    JOIN g ON g.bank_ref = l.bank_ref AND g.amount = l.amount
   ORDER BY l.bank_ref, l.amount, l.id
`;

/** In use by anything at all — never a deletion candidate. */
const attached = (r) =>
  r.payment_rows > 0 ||
  r.matched_order_id !== null ||
  r.matched_deposit_id !== null ||
  r.status !== "UNMATCHED";

/** Rank a row's claim to being the copy that survives. Lower wins. */
const keeperRank = (r) => {
  if (r.payment_rows > 0) return 0;
  if (r.matched_order_id !== null || r.matched_deposit_id !== null) return 1;
  if (r.status === "MATCHED") return 2;
  return 3;
};

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query("BEGIN");

  const { rows } = await client.query(GROUPS);

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.bank_ref}|${Number(r.amount)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const doomed = [];
  const stuck = [];
  for (const [key, members] of groups) {
    const sorted = [...members].sort((a, b) => keeperRank(a) - keeperRank(b) || a.id - b.id);
    const keeper = sorted[0];
    for (const r of sorted.slice(1)) {
      if (attached(r)) stuck.push({ key, keeper: keeper.id, row: r });
      else doomed.push({ key, keeper: keeper.id, row: r });
    }
  }

  const total = doomed.reduce((s, d) => s + Number(d.row.amount), 0);
  console.log(`${groups.size} duplicated references, ${rows.length} rows in total`);
  console.log(`${doomed.length} free copies to delete, worth ${naira(total)}`);
  console.log(`${stuck.length} copies left alone because they are attached to something\n`);

  for (const d of doomed.slice(0, 20)) {
    console.log(
      `  delete line ${String(d.row.id).padStart(5)}  ${naira(d.row.amount).padStart(22)}` +
      `  ref ${String(d.row.bank_ref).padEnd(20)} keeping ${d.keeper}`
    );
  }
  if (doomed.length > 20) console.log(`  … and ${doomed.length - 20} more`);

  if (stuck.length) {
    console.log("\nKept, still attached — two copies of one transaction are both in use:");
    for (const s of stuck) {
      console.log(
        `  line ${s.row.id}  ${naira(s.row.amount)}  ref ${s.row.bank_ref}` +
        `  status ${s.row.status} order ${s.row.matched_order_id ?? "none"}` +
        ` deposit ${s.row.matched_deposit_id ?? "none"} payments ${s.row.payment_rows}` +
        `  (keeper ${s.keeper})`
      );
    }
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
    await client.query("ROLLBACK");
    await client.end();
    return;
  }

  try {
    const ids = doomed.map((d) => d.row.id);

    // Re-check under the open transaction rather than trusting the read above:
    // the desk is matching lines while this runs, and a line that became
    // attached in the meantime must not be deleted.
    const { rows: recheck } = await client.query(
      `SELECT l.id FROM bank_statement_lines l
        WHERE l.id = ANY($1::int[])
          AND (l.status <> 'UNMATCHED'
               OR l.matched_order_id IS NOT NULL
               OR l.matched_deposit_id IS NOT NULL
               OR EXISTS (SELECT 1 FROM order_payments op WHERE op.statement_line_id = l.id))`,
      [ids]
    );
    if (recheck.length) {
      throw new Error(
        `refusing: ${recheck.length} line(s) became attached since the plan was built (${recheck
          .map((r) => r.id)
          .join(", ")}) — re-run to rebuild the plan`
      );
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const rollbackPath = path.join(__dirname, `rollback-duplicate-lines-${stamp}.json`);
    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          note: "Undo: re-insert each row into bank_statement_lines verbatim, ids included.",
          deleted: doomed.map((d) => d.row),
        },
        null,
        2
      )
    );

    const { rowCount } = await client.query(
      `DELETE FROM bank_statement_lines WHERE id = ANY($1::int[])`,
      [ids]
    );

    const { rows: [left] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT bank_ref, amount FROM bank_statement_lines
          WHERE bank_ref IS NOT NULL AND bank_ref <> '' AND amount > 0
          GROUP BY bank_ref, amount HAVING COUNT(*) > 1) t`
    );

    console.log(`\ndeleted ${rowCount} rows | ${naira(total)}`);
    console.log(`duplicated references remaining: ${left.n} (each with an attached copy)`);
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
