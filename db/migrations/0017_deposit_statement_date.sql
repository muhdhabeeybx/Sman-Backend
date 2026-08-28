-- The date a deposit actually hit the bank, as a column on the deposit.
--
-- Written by hand in the style of 0002–0016, for the reason set out in 0003:
-- drizzle-kit has no snapshot of this database. Every statement is idempotent,
-- so re-running the file is a no-op.
--
-- ── The bug ────────────────────────────────────────────────────────────────
--
-- `deposits` had no date of its own. It had `created_at` — when the row was
-- keyed in — and nothing else, so "Deposit Date" was reconstructed at read
-- time by looking sideways at the statement line that funded it:
--
--   LEFT JOIN LATERAL (
--     SELECT txn_date FROM bank_statement_lines
--     WHERE matched_deposit_id = d.id ORDER BY id LIMIT 1
--   )
--
-- That went wrong two ways, and both show up as "the date is sometimes not
-- the one on the statement":
--
--   1. ORDER BY id, not by date. A deposit funded by several statement lines
--      showed whichever line happened to have the lowest id — which is upload
--      order, not date order. With lines from different days behind one
--      deposit, the date shown was effectively arbitrary.
--
--   2. The fallback was `|| created_at`. When the join found nothing, the
--      column headed "Deposit Date" quietly printed the day the row was
--      keyed in instead — indistinguishable, on the page, from a real
--      statement date. A statement uploaded the same day looked correct; one
--      uploaded a week later was a week out, silently.
--
-- Deriving it at read time was the mistake. The date the money reached the
-- bank is a FACT ABOUT THE DEPOSIT, so it is stored on the deposit.
ALTER TABLE "deposits"
  ADD COLUMN IF NOT EXISTS "deposit_date" timestamp with time zone;

COMMENT ON COLUMN "deposits"."deposit_date" IS
  'The value date from the bank statement — when the money actually reached the account. NULL only where no statement backs the deposit (an internal wallet transfer, or a credit keyed in before this column existed). Never fall back to created_at for display: that is when the row was keyed in, which is a different fact.';

-- ── Backfill, best source first ────────────────────────────────────────────
--
-- 1. The matched statement line. Ordered by txn_date (then id to break ties),
--    NOT by id — the earliest banking date is the defensible answer where one
--    deposit was built from several lines, and it is at least deterministic,
--    which the old ordering was not.
UPDATE "deposits" d
SET "deposit_date" = l."txn_date"
FROM (
  SELECT DISTINCT ON (matched_deposit_id)
         matched_deposit_id, txn_date
  FROM "bank_statement_lines"
  WHERE matched_deposit_id IS NOT NULL
  ORDER BY matched_deposit_id, txn_date ASC, id ASC
) l
WHERE l."matched_deposit_id" = d."id"
  AND d."deposit_date" IS NULL;

-- 2. `paystack_details->>'paidAt'`, which the statement-match path has been
--    writing all along (see wallet.service.js). This recovers deposits whose
--    statement line was since deleted along with its statement.
UPDATE "deposits"
SET "deposit_date" = ("paystack_details" ->> 'paidAt')::timestamptz
WHERE "deposit_date" IS NULL
  AND "paystack_details" ? 'paidAt'
  AND NULLIF("paystack_details" ->> 'paidAt', '') IS NOT NULL
  -- A malformed value must skip the row rather than abort the migration.
  AND ("paystack_details" ->> 'paidAt') ~ '^\d{4}-\d{2}-\d{2}';

-- Deliberately NO third pass copying created_at into the gap. A deposit with
-- no statement behind it genuinely has no statement date, and writing the
-- entry date there would recreate exactly the confusion this column exists to
-- end — except stored, and so no longer detectable. NULL means "no statement
-- date", the page says so, and that is the honest answer.

-- The reporting query: deposits for a customer, in banking-date order.
CREATE INDEX IF NOT EXISTS "deposits_customer_deposit_date_idx"
  ON "deposits" ("customer_id", "deposit_date" DESC);

-- ── The read-time join this replaces ───────────────────────────────────────
--
-- The lateral join stays (it still supplies the depositor and the narration)
-- but its ordering is fixed in the repositories to match the backfill above:
-- ORDER BY txn_date, id. A query that picks one of several rows must say which
-- one it means, and "lowest id" was never what anyone meant.
