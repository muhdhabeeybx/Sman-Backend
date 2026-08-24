#!/usr/bin/env node
/**
 * Apply the migration files drizzle-kit does not know about.
 *
 * Some migrations in db/migrations are written by hand rather than generated —
 * see 0002_daily_report_commission_fields.sql and
 * 0003_delivery_sale_deposit_channel.sql for why. Hand-written files are not
 * in meta/_journal.json, so `drizzle-kit migrate` skips them entirely.
 *
 * That left a real gap: those columns were applied to the live and dev
 * databases by hand, but a freshly reset test database never got them, so any
 * endpoint selecting one 500s under test while working fine locally. That is
 * exactly how it surfaced — /api/delivery-sales began returning 500 in the
 * smoke-test route list the moment a hand-written column joined the schema.
 *
 * Every hand-written migration is required to be idempotent (IF NOT EXISTS,
 * or a DO block guarding CREATE TYPE), so running this repeatedly, or over a
 * database that already has them, is a no-op.
 *
 * Usage:
 *   node scripts/apply-unjournaled-migrations.js            # DATABASE_URL
 *   DATABASE_URL="$TEST_DATABASE_URL" node scripts/…        # somewhere else
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");

/** The `tag` of every migration drizzle-kit already owns. */
function journaledTags() {
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return new Set();
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  return new Set((journal.entries || []).map((e) => e.tag));
}

function unjournaledFiles() {
  const owned = journaledTags();
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => !owned.has(f.replace(/\.sql$/, "")))
    .sort();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set — nothing to apply.");
    process.exit(1);
  }

  const files = unjournaledFiles();
  if (files.length === 0) {
    console.log("No hand-written migrations to apply.");
    return;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const file of files) {
      const body = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await sql.unsafe(body);
      console.log(`✓ applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("apply-unjournaled-migrations failed:", err.message);
  process.exit(1);
});
