-- Filling-station remittances: which channel the money came through, and
-- which bank account it landed in as a reference rather than free text.
--
-- Written by hand in the style of 0002_daily_report_commission_fields.sql
-- rather than generated: drizzle-kit has never been run against this
-- database (there is no drizzle.__drizzle_migrations table), and generating
-- from the schema folds in earlier hand-applied changes it has no snapshot
-- for. Every statement here is idempotent, so re-running the file is a
-- no-op.
--
-- deposit_channel is nullable with no default on purpose. Every row written
-- before today has no channel on record, and a pump sale or an expense is
-- not a remittance at all — defaulting any of them into 'pos' or
-- 'bank_deposit' would invent a fact the ledger never captured, and bank
-- charges are derived from the difference between the two channels, so an
-- invented row moves a real money figure.
--
-- bank_account_id is a plain integer, not a foreign key: the `bank` string
-- alongside it stays the source of truth for historical rows, which name
-- accounts that may no longer exist in bank_accounts. A hard FK would make
-- deleting a retired account rewrite history.
--
-- Both are additive and nullable, so Postgres applies them as catalog-only
-- changes with no table rewrite.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_channel') THEN
    CREATE TYPE "public"."deposit_channel" AS ENUM ('pos', 'bank_deposit');
  END IF;
END
$$;

ALTER TABLE delivery_sales ADD COLUMN IF NOT EXISTS bank_account_id integer;
ALTER TABLE delivery_sales ADD COLUMN IF NOT EXISTS deposit_channel "public"."deposit_channel";

CREATE INDEX IF NOT EXISTS delivery_sales_deposit_channel_idx
  ON delivery_sales USING btree (deposit_channel);
