// Throwaway config for `drizzle-kit introspect` against soroman_db.
//
// The committed drizzle.config.js has out: "./db/migrations.legacy-neon" —
// introspecting with it would dump the live schema into the quarantined
// migrations folder. This config's `out` is scratch-only, gitignored, and
// regenerable; nothing here is imported by the app.
//
// introspect issues read-only queries (information_schema / pg_catalog) —
// it cannot write DDL. Never point this file's dbCredentials at anything but
// LIVE_DATABASE_URL, and never add this config's `out` to db:generate/migrate/push.
const { defineConfig } = require("drizzle-kit");

if (!process.env.LIVE_DATABASE_URL) {
  throw new Error("LIVE_DATABASE_URL is not set — see .env.example");
}

module.exports = defineConfig({
  out: "./.drizzle-introspect",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.LIVE_DATABASE_URL,
  },
});
