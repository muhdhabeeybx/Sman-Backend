-- Let an expense be raised in a currency other than naira.
--
-- Written by hand in the style of 0002-0025, for the reason set out in 0003:
-- drizzle-kit has no snapshot of this database. Every statement is idempotent,
-- so re-running the file is a no-op.
--
-- ── What this is for ──────────────────────────────────────────────────────
--
-- The cargo side of the chart is denominated abroad. 5010 Vessel Hire/Charter,
-- 5020 Freight & Shipping, 5030 Demurrage, 5310 Marine Insurance and the rest
-- of the vessel accounts are billed by counterparties who invoice in dollars.
-- Until now the only way to raise one of those was to convert it by hand and
-- type a naira figure, which threw away the invoice's own number — the one the
-- vendor will chase, the one on the document an auditor reads.
--
-- ── The rule this encodes ─────────────────────────────────────────────────
--
-- The FOREIGN amount is the debt. `amount` keeps meaning "what the request
-- asks for", now denominated in `currency`, and that is the figure the vendor
-- is owed. Naira is a translation of it, and the translation is done twice:
-- once at the rate when the request was raised, and again at the rate on the
-- day it was actually paid. The gap between those two is a real FX gain or
-- loss, and the point of storing both rates is that it can be seen rather than
-- silently absorbed into the expense.
--
-- ── A rate is OPTIONAL on a foreign invoice ───────────────────────────────
--
-- An invoice can be recorded in dollars and left in dollars. Forcing a rate at
-- the moment of raising would mean inventing one: the desk often does not know
-- what it will buy the currency at, and a made-up rate is worse than no rate
-- because it looks like a fact.
--
-- The consequence is that such a row HAS no naira value, and `amount_ngn` is
-- NULL rather than a guess. SUM() skips nulls, so a naira total silently
-- excludes it — which is why every aggregate over these rows also counts what
-- it could not convert, so a total can say "and USD 50,000 besides" instead of
-- quietly under-reporting. Naira rows are unaffected: their rate is 1, always,
-- and the constraint below refuses anything else.
--
-- ── Why the naira columns are GENERATED ───────────────────────────────────
--
-- Every total in the system sums `amount`: two in pfiExpense.repository, three
-- in vendor.repository, and the whole of the frontend's expense-presentation.
-- Each of those has to move to the naira column, and the failure mode if one
-- is missed is silent — a $50,000 demurrage invoice adds 50,000 into a naira
-- total and understates it seventy-fold. Nothing about the number looks wrong.
--
-- So the naira figure is not something application code computes and writes.
-- It is derived by the database from the amount and the rate on the same row,
-- and it cannot drift from them, cannot be written stale by a code path that
-- forgot, and cannot be back-dated by an UPDATE that set one and not the
-- other. The safety is structural rather than remembered.

-- ── 1. The currency and the rate at the time of raising ───────────────────
--
-- Currency defaults to NGN so all 295 existing rows are correct without being
-- touched. The rate does not default, and is backfilled explicitly below.

ALTER TABLE pfi_expenses
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'NGN';

-- Nullable, and deliberately WITHOUT a default. A default of 1 would silently
-- translate an unconverted $50,000 into ₦50,000 for any insert that omitted
-- the column — the exact error this migration exists to prevent. Every writer
-- states the rate, or states that there isn't one.
ALTER TABLE pfi_expenses
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 6);

-- Every row that exists today is naira, and a naira row's rate is exactly 1.
UPDATE pfi_expenses
   SET exchange_rate = 1
 WHERE currency = 'NGN' AND exchange_rate IS NULL;

-- ── 2. The rate on the day it actually cleared ────────────────────────────
--
-- NULL until paid, and NULL forever on a naira expense, where there is no
-- second rate to record. Distinct from 1: "no conversion happened" and "the
-- conversion happened at parity" are different facts, and only the first is
-- true of a naira invoice.

ALTER TABLE pfi_expenses
  ADD COLUMN IF NOT EXISTS paid_exchange_rate NUMERIC(18, 6);

-- ── 3. The naira translations, derived ────────────────────────────────────
--
-- `amount_ngn` is what every total sums from here on.
--
-- `amount_paid_ngn` falls back to the raising rate when no payment rate was
-- recorded, so an expense paid without one still lands in the totals at a
-- defensible figure rather than dropping to NULL and vanishing from them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pfi_expenses' AND column_name = 'amount_ngn'
  ) THEN
    ALTER TABLE pfi_expenses
      ADD COLUMN amount_ngn NUMERIC(15, 2)
      GENERATED ALWAYS AS (ROUND(amount * exchange_rate, 2)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pfi_expenses' AND column_name = 'amount_paid_ngn'
  ) THEN
    ALTER TABLE pfi_expenses
      ADD COLUMN amount_paid_ngn NUMERIC(15, 2)
      GENERATED ALWAYS AS (
        ROUND(amount_paid * COALESCE(paid_exchange_rate, exchange_rate), 2)
      ) STORED;
  END IF;
END $$;

-- ── 4. Guards ─────────────────────────────────────────────────────────────
--
-- A rate of zero would translate every foreign invoice to nothing at all and
-- read as a free expense; a negative one is meaningless. Both are cheaper to
-- refuse here than to find in a total later.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pfi_expenses_exchange_rate_positive'
  ) THEN
    ALTER TABLE pfi_expenses
      ADD CONSTRAINT pfi_expenses_exchange_rate_positive
      CHECK (exchange_rate > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pfi_expenses_paid_rate_positive'
  ) THEN
    ALTER TABLE pfi_expenses
      ADD CONSTRAINT pfi_expenses_paid_rate_positive
      CHECK (paid_exchange_rate IS NULL OR paid_exchange_rate > 0);
  END IF;

  -- Three upper-case letters. Not an enum: the set of currencies a cargo
  -- business meets is not ours to close, and a rejected request because
  -- somebody billed in a currency nobody listed is a worse failure than a
  -- typo that shows up on the face of the row.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pfi_expenses_currency_shape'
  ) THEN
    ALTER TABLE pfi_expenses
      ADD CONSTRAINT pfi_expenses_currency_shape
      CHECK (currency ~ '^[A-Z]{3}$');
  END IF;

  -- A naira expense has nothing to convert, and its rate is NOT optional:
  -- NULL there would make amount_ngn NULL and drop the row out of every naira
  -- total.
  --
  -- IS NOT DISTINCT FROM, not `= 1`. Written as `exchange_rate = 1` this
  -- constraint does not hold: for an NGN row with a NULL rate the test is
  -- `false OR NULL`, which is NULL, and a CHECK passes on NULL. The exact row
  -- it exists to refuse was the one row it let through — caught by testing the
  -- guard rather than reading it. IS NOT DISTINCT FROM returns false on NULL
  -- instead, so the row is rejected.
  --
  -- Dropped and recreated rather than skipped when present, so a database that
  -- already took the unsound version is corrected by re-running this file.
  ALTER TABLE pfi_expenses DROP CONSTRAINT IF EXISTS pfi_expenses_ngn_rate_is_one;
  ALTER TABLE pfi_expenses
    ADD CONSTRAINT pfi_expenses_ngn_rate_is_one
    CHECK (currency <> 'NGN' OR exchange_rate IS NOT DISTINCT FROM 1);

  -- A payment rate on a request that never had a raising rate would put a
  -- naira figure on the settlement of something with no naira value to
  -- compare it against, so the pair moves together.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pfi_expenses_paid_rate_needs_rate'
  ) THEN
    ALTER TABLE pfi_expenses
      ADD CONSTRAINT pfi_expenses_paid_rate_needs_rate
      CHECK (paid_exchange_rate IS NULL OR exchange_rate IS NOT NULL);
  END IF;
END $$;

-- ── 5. Reading the totals ─────────────────────────────────────────────────
--
-- Partial, because it exists for the one query that will run constantly once
-- the ledger posts from here: everything still owed, in naira, by vendor.

CREATE INDEX IF NOT EXISTS pfi_expenses_currency_idx
  ON pfi_expenses (currency)
  WHERE currency <> 'NGN';

-- The rows no naira total can include. Few, and asked for on every summary.
CREATE INDEX IF NOT EXISTS pfi_expenses_unconverted_idx
  ON pfi_expenses (currency)
  WHERE exchange_rate IS NULL;

-- ── Verification ──────────────────────────────────────────────────────────
--
-- Every pre-existing row must be untouched in naira terms: amount_ngn has to
-- equal amount exactly, or a total has just moved without anybody asking.

DO $$
DECLARE
  drifted INTEGER;
BEGIN
  SELECT COUNT(*) INTO drifted
    FROM pfi_expenses
   WHERE currency = 'NGN' AND amount_ngn IS DISTINCT FROM ROUND(amount, 2);

  IF drifted > 0 THEN
    RAISE EXCEPTION
      'Migration 0026 changed the naira value of % existing expense row(s). Rolling back.', drifted;
  END IF;
END $$;
