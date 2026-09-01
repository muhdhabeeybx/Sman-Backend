#!/usr/bin/env node
/**
 * Give the codeless delivery_sales rows their PFI back.
 *
 *   node scripts/backfill-delivery-sale-allocation-codes.js
 *   node scripts/backfill-delivery-sale-allocation-codes.js --apply
 *
 * ── Why these rows are invisible ──────────────────────────────────────────
 *
 * delivery_sales.allocation_code is how a payment is attributed to a PFI, and
 * how anyone searches for one. 66 rows carry no code at all, so no PFI search
 * will ever return them no matter how the query is written — they belong to
 * nothing.
 *
 * ── Where the missing code comes from ─────────────────────────────────────
 *
 * A loading is identified by truck plus load date, which is the same key the
 * ledger already groups a cycle by (see deliverySale.repository cycleStanding).
 * delivery_inventory holds the same loading WITH its allocation code, so the
 * code can be read across rather than invented.
 *
 * The customer is deliberately NOT part of the join. A split load puts several
 * customers on one truck for one date, and they all sit under the same PFI —
 * joining on customer too would drop exactly those rows. What matters is that
 * every matching loading agrees on the code, which is what the
 * `distinct_codes = 1` guard below checks. A truck-date whose loadings
 * disagree is left alone and reported: two candidate PFIs is not evidence.
 *
 * Rows with no matching loading at all are also left alone. There is nothing
 * to read the code from, and a guess on a financial attribution is worse than
 * a blank.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { client } = require("../db");

const APPLY = process.argv.includes("--apply");

async function main() {
  const candidates = await client`
    SELECT s.id,
           s.truck_number,
           s.date_loaded,
           s.customer_name,
           s.payment_amount,
           MIN(i.allocation_code)              AS code,
           COUNT(DISTINCT i.allocation_code)::int AS distinct_codes
      FROM delivery_sales s
      JOIN delivery_inventory i
        ON regexp_replace(UPPER(COALESCE(i.truck_number, '')), '\s', '', 'g')
         = regexp_replace(UPPER(COALESCE(s.truck_number, '')), '\s', '', 'g')
       AND LEFT(COALESCE(i.date_allocated, ''), 10) = LEFT(COALESCE(s.date_loaded, ''), 10)
     WHERE COALESCE(s.allocation_code, '') = ''
       AND COALESCE(i.allocation_code, '') <> ''
     GROUP BY s.id, s.truck_number, s.date_loaded, s.customer_name, s.payment_amount
     ORDER BY s.id`;

  const [{ total }] = await client`
    SELECT count(*)::int AS total FROM delivery_sales WHERE COALESCE(allocation_code,'') = ''`;

  const clear = candidates.filter((r) => r.distinct_codes === 1);
  const ambiguous = candidates.filter((r) => r.distinct_codes > 1);

  console.log(`delivery_sales rows with no allocation code : ${total}`);
  console.log(`  attributable from a matching loading      : ${clear.length}`);
  console.log(`  ambiguous (loadings disagree) — skipped   : ${ambiguous.length}`);
  console.log(`  no matching loading at all — skipped      : ${total - candidates.length}`);

  const byCode = clear.reduce((acc, r) => ((acc[r.code] = (acc[r.code] || 0) + 1), acc), {});
  console.log("\nWould set:");
  for (const [code, n] of Object.entries(byCode).sort()) console.log(`  ${code.padEnd(14)} ${n} row(s)`);

  for (const r of ambiguous) {
    console.log(`  AMBIGUOUS ${r.truck_number} ${r.date_loaded} — left blank`);
  }

  if (!clear.length) {
    console.log("\nNothing to do.");
    process.exit(0);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Add --apply to commit.");
    process.exit(0);
  }

  // Rollback file first: it is the only way back, so it is written before the
  // transaction rather than after a successful one.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rollback = path.join(__dirname, `rollback-allocation-codes-${stamp}.json`);
  fs.writeFileSync(
    rollback,
    JSON.stringify(
      clear.map((r) => ({ id: r.id, previousAllocationCode: "", newAllocationCode: r.code })),
      null,
      2
    )
  );
  console.log(`\nRollback written to ${path.basename(rollback)}`);

  // One transaction: a half-applied attribution is harder to reason about than
  // none, and the guard re-checks the blank so a concurrent edit is not clobbered.
  let updated = 0;
  await client.begin(async (tx) => {
    for (const r of clear) {
      const rows = await tx`
        UPDATE delivery_sales
           SET allocation_code = ${r.code}, updated_at = now()
         WHERE id = ${r.id} AND COALESCE(allocation_code, '') = ''
        RETURNING id`;
      updated += rows.length;
    }
  });

  console.log(`Updated ${updated} row(s).`);
  console.log("COMMITTED");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED (nothing committed):", err.message);
  process.exit(1);
});
