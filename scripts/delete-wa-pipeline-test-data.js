#!/usr/bin/env node
/**
 * Remove the rows tests/wa-pipeline.test.js leaves behind when it is run
 * against a real database.
 *
 * ── How they got there ────────────────────────────────────────────────────
 *
 * That suite places a whole WhatsApp order end to end, so its `before` hook
 * builds the catalogue it needs — a depot, a bank account, a product, a price,
 * a PFI — and the tests then create a customer, a session, messages, an order
 * and an allocation. Its `after` hook stops the queue and closes the
 * connection. It deletes none of it.
 *
 * db/index.js has a guard meant to stop exactly this, but the guard is keyed on
 * NODE_ENV === "test", which only `npm test` sets. Run the obvious command —
 * `node --test tests/wa-pipeline.test.js` — and NODE_ENV is unset, the guard
 * never evaluates, and the suite connects to DATABASE_URL: production. The
 * fixtures then show up in the dashboard as a depot called "Pipe Depot 7462"
 * and a product called "Pipe PMS 7462". "Pipe" is not a product. It is short
 * for pipeline.
 *
 * ── What it will not do ───────────────────────────────────────────────────
 *
 * A run is removed only if its order never touched money: no order_payments,
 * no expected_payments, amount_paid of zero. A test order that somehow
 * attracted a real payment is a different problem and this script refuses it
 * rather than deciding.
 *
 * Every row is also checked for references from outside the run. A leftover
 * fixture that something real has since attached itself to is reported and
 * kept — the whole run is skipped, because deleting half of it would leave the
 * order pointing at a depot that no longer exists.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/delete-wa-pipeline-test-data.js            dry run
 *   node scripts/delete-wa-pipeline-test-data.js --apply    commits
 *
 * --apply writes scripts/rollback-wa-pipeline-<stamp>.json with every deleted
 * row in full, and runs the whole thing in one transaction.
 */
require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const q = (id) => `"${String(id).replace(/"/g, '""')}"`;

/**
 * Deletion order: children before parents.
 *
 * wa_messages hang off the session; the allocation and the order hang off the
 * PFI and the catalogue; the customer goes last because the session and the
 * order both point at it.
 */
const ORDER_OF_DELETION = [
  "wa_messages",
  "wa_sessions",
  "notification_deliveries",
  "notifications",
  "audit_logs",
  "order_trucks",
  "order_pfi_allocations",
  "orders",
  "depot_price_history",
  "depot_product_prices",
  "pfis",
  "bank_accounts",
  "depots",
  "products",
  "customers",
];

/** Every FK referencing a table's id, with its delete rule. */
const FK_SQL = `
  SELECT tc.table_name AS child_table,
         kcu.column_name AS child_column,
         rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND ccu.table_name = $1
     AND ccu.column_name = 'id'`;

/** Collect every row one wa-pipeline run created, keyed by table. */
async function collectRun(db, pfi) {
  const run = pfi.pfi_number.replace(/^PFI-PIP-/, "");
  const phone = `+234817${run.slice(-6)}0`;
  const set = { run, phone, rows: {} };
  const put = (table, rows) => {
    if (rows.length) set.rows[table] = (set.rows[table] || []).concat(rows);
  };

  const pick = async (table, sql, params) => {
    const { rows } = await db.query(sql, params);
    put(table, rows);
    return rows;
  };

  put("pfis", [pfi]);
  const depot = await pick("depots", `SELECT * FROM depots WHERE code = $1`, [`PIP${run.slice(-5)}`]);
  const product = await pick("products", `SELECT * FROM products WHERE sku = $1`, [`PIP-${run.slice(-5)}`]);
  await pick("bank_accounts", `SELECT * FROM bank_accounts WHERE account_number = $1`, [`PIPACC${run.slice(-6)}`]);
  if (depot[0]) {
    await pick("depot_product_prices", `SELECT * FROM depot_product_prices WHERE depot_id = $1`, [depot[0].id]);
  }
  for (const price of set.rows.depot_product_prices || []) {
    await pick(
      "depot_price_history",
      `SELECT * FROM depot_price_history WHERE depot_product_price_id = $1`,
      [price.id]
    );
  }
  const orders = await pick("orders", `SELECT * FROM orders WHERE pfi_id = $1`, [pfi.id]);
  for (const o of orders) {
    await pick("order_pfi_allocations", `SELECT * FROM order_pfi_allocations WHERE order_id = $1`, [o.id]);
    await pick("order_trucks", `SELECT * FROM order_trucks WHERE order_id = $1`, [o.id]);
  }
  const customer = await pick("customers", `SELECT * FROM customers WHERE phone = $1`, [phone]);
  const session = await pick("wa_sessions", `SELECT * FROM wa_sessions WHERE wa_phone = $1`, [phone]);

  // wa_messages hang off the session AND off the customer, and the first
  // inbound arrives before either exists — so the phone is the only complete
  // key. Collecting by session_id alone found 4 of 28.
  await pick("wa_messages", `SELECT * FROM wa_messages WHERE wa_phone = $1`, [phone]);

  for (const c of customer) {
    const notes = await pick("notifications", `SELECT * FROM notifications WHERE customer_id = $1`, [c.id]);
    for (const n of notes) {
      await pick(
        "notification_deliveries",
        `SELECT * FROM notification_deliveries WHERE notification_id = $1`,
        [n.id]
      );
    }
    // Audit rows recording this fake customer's fake actions. Kept visible in
    // the dry run rather than swept quietly: deleting audit history is worth
    // seeing, even when the history is of a test.
    await pick("audit_logs", `SELECT * FROM audit_logs WHERE actor_customer_id = $1`, [c.id]);
  }

  set.orders = orders;
  set.customer = customer[0] || null;
  set.product = product[0] || null;
  return set;
}

/** Has any money reached this run's orders? */
async function moneyCheck(db, orders) {
  const problems = [];
  for (const o of orders) {
    const { rows: p } = await db.query(`SELECT count(*)::int AS n FROM order_payments WHERE order_id = $1`, [o.id]);
    const { rows: e } = await db.query(`SELECT count(*)::int AS n FROM expected_payments WHERE order_id = $1`, [o.id]);
    const paid = Number(o.amount_paid || 0);
    if (p[0].n > 0) problems.push(`order ${o.id} has ${p[0].n} payment row(s)`);
    if (e[0].n > 0) problems.push(`order ${o.id} has ${e[0].n} expected payment(s)`);
    if (paid > 0) problems.push(`order ${o.id} has amount_paid ${paid}`);
  }
  return problems;
}

/** Anything outside the run that points at one of its rows. */
async function outsideRefs(db, set, fkCache) {
  const own = {};
  for (const [table, rows] of Object.entries(set.rows)) own[table] = new Set(rows.map((r) => r.id));

  const found = [];
  for (const [table, rows] of Object.entries(set.rows)) {
    if (!fkCache[table]) fkCache[table] = (await db.query(FK_SQL, [table])).rows;
    for (const row of rows) {
      for (const fk of fkCache[table]) {
        const { rows: hits } = await db.query(
          `SELECT id FROM ${q(fk.child_table)} WHERE ${q(fk.child_column)} = $1`,
          [row.id]
        );
        const mine = own[fk.child_table];
        const strangers = mine ? hits.filter((h) => !mine.has(h.id)) : hits;
        if (strangers.length) {
          found.push(
            `${table}#${row.id} <- ${fk.child_table}.${fk.child_column} ` +
              `(${strangers.length} row(s) [ON DELETE ${fk.delete_rule}], ids ${strangers.slice(0, 6).map((s) => s.id).join(", ")})`
          );
        }
      }
    }
  }
  return found;
}

async function main() {
  const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — wa-pipeline test residue\n`);

  const { rows: pfis } = await db.query(
    `SELECT * FROM pfis WHERE pfi_number LIKE 'PFI-PIP-%' ORDER BY id`
  );
  if (pfis.length === 0) {
    console.log("No wa-pipeline runs found. Nothing to clean up.");
    await db.end();
    return;
  }

  const fkCache = {};
  const clean = [];

  for (const pfi of pfis) {
    const set = await collectRun(db, pfi);
    const total = Object.values(set.rows).reduce((n, r) => n + r.length, 0);
    console.log(`══ run ${set.run} — ${total} row(s), phone ${set.phone} ══`);
    for (const [table, rows] of Object.entries(set.rows)) {
      const ids = rows.map((r) => r.id).join(", ");
      const names = rows.map((r) => r.name || r.pfi_number || r.order_number || r.account_number || "").filter(Boolean);
      console.log(`  ${table.padEnd(24)} ${String(rows.length).padStart(3)}  ids ${ids}${names.length ? `  (${names.join(", ")})` : ""}`);
    }

    const money = await moneyCheck(db, set.orders);
    const outside = await outsideRefs(db, set, fkCache);

    if (money.length) {
      console.log("\n  REFUSED — money has touched this run:");
      money.forEach((m) => console.log(`    ${m}`));
      console.log("  Nothing from this run will be deleted.\n");
      continue;
    }
    if (outside.length) {
      console.log("\n  REFUSED — something outside the run points at it:");
      outside.forEach((o) => console.log(`    ${o}`));
      console.log("  Nothing from this run will be deleted.\n");
      continue;
    }

    console.log("\n  clean: no payments, no expected payments, nothing outside the run attached\n");
    clean.push(set);
  }

  console.log("─────────────────────────────────────────────────────────────");
  console.log(`runs safe to remove: ${clean.length} of ${pfis.length}`);

  if (!APPLY) {
    console.log("\nDry run — nothing was changed. Re-run with --apply to commit.");
    await db.end();
    return;
  }
  if (clean.length === 0) {
    console.log("\nNothing to delete.");
    await db.end();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(__dirname, `rollback-wa-pipeline-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        deletedAt: new Date().toISOString(),
        note: "Re-insert in reverse of ORDER_OF_DELETION: customers, products, depots, bank_accounts, pfis, prices, orders, allocations, sessions, messages.",
        runs: clean.map((s) => ({ run: s.run, phone: s.phone, rows: s.rows })),
      },
      null,
      2
    )
  );
  console.log(`\nrollback written: ${file}`);

  await db.query("BEGIN");
  try {
    for (const set of clean) {
      for (const table of ORDER_OF_DELETION) {
        const rows = set.rows[table];
        if (!rows || rows.length === 0) continue;
        const ids = rows.map((r) => r.id);
        await db.query(`DELETE FROM ${q(table)} WHERE id = ANY($1::int[])`, [ids]);
        console.log(`  deleted ${rows.length} from ${table} (${ids.join(", ")})`);
      }
    }
    await db.query("COMMIT");
    console.log(`\nCommitted. ${clean.length} run(s) removed.`);
  } catch (e) {
    await db.query("ROLLBACK");
    console.error(`\nRolled back, nothing deleted: ${e.message}`);
    process.exitCode = 1;
  }

  await db.end();
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
