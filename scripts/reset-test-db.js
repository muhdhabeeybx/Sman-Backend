#!/usr/bin/env node
/**
 * Reset the isolated test database to a clean, fully-migrated state — what CI
 * gets for free on every run, and what a dirty local DB needs when migrations
 * diverge (see the merge/renumber flow). Drops and recreates the schema, then
 * applies every migration in order — the generated ones through drizzle-kit,
 * then the hand-written ones it has no journal entry for.
 *
 * Guarded to a localhost TEST_DATABASE_URL so it can never wipe a real database.
 * Run with: npm run db:reset-test
 */
require("dotenv").config();
const postgres = require("postgres");
const { execSync } = require("child_process");

(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.error("TEST_DATABASE_URL is not set — nothing to reset.");
    process.exit(1);
  }
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    console.error("Refusing: TEST_DATABASE_URL is not a localhost database:\n  ", url);
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE;");
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE;");
  await sql.unsafe("CREATE SCHEMA public;");
  await sql.end();
  console.log("✓ test DB schema reset — applying migrations…");

  execSync("npx drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  // drizzle-kit only runs what is in meta/_journal.json, and some migrations
  // are hand-written precisely because generating them is not safe here. Left
  // out, a reset test DB is missing real columns and endpoints that select
  // them 500 under test while working fine locally.
  execSync("node scripts/apply-unjournaled-migrations.js", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  console.log("✓ test DB is clean and fully migrated.");
})().catch((err) => {
  console.error("reset-test-db failed:", err.message);
  process.exit(1);
});
