#!/usr/bin/env node
/**
 * One-off: hard reset every real staff account to the same password.
 * Skips the @local.dev / @soroman.test dev fixture rows (not real staff).
 *
 *   node scripts/reset-all-staff-passwords.js --password='Soroman2026#'
 *   node scripts/reset-all-staff-passwords.js --password='Soroman2026#' --yes   (skip confirmation)
 */
require("dotenv").config();
const postgres = require("postgres");
const bcrypt = require("bcrypt");
const readline = require("readline");

const arg = (n) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : null;
};

const confirm = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });

(async () => {
  const password = arg("password") || "";
  const skipConfirm = process.argv.includes("--yes");

  if (!password) {
    console.error("Usage: --password='Soroman2026#' [--yes]");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("Refusing: use at least 10 characters.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    const targets = await sql`
      SELECT id, email FROM staff
       WHERE email NOT LIKE '%@local.dev' AND email NOT LIKE '%@soroman.test'
       ORDER BY id`;

    if (targets.length === 0) {
      console.log("No staff accounts found. Nothing to do.");
      return;
    }

    console.log(`About to reset ${targets.length} staff account password(s) to the given password:`);
    for (const t of targets) console.log(`  id=${t.id}  ${t.email}`);

    if (!skipConfirm) {
      const ok = await confirm(`\nType "yes" to proceed: `);
      if (!ok) {
        console.log("Aborted. Nothing changed.");
        return;
      }
    }

    const hash = await bcrypt.hash(password, 12);
    const ids = targets.map((t) => t.id);
    const updated = await sql`
      UPDATE staff
         SET password = ${hash}, is_password_set = true, is_active = true, suspended = false
       WHERE id IN ${sql(ids)}
      RETURNING id, email`;

    console.log(`\n✓ Reset ${updated.length} staff password(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
})().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
