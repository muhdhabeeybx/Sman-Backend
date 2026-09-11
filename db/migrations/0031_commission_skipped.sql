-- Let a commission be skipped.
--
-- Written by hand in the style of 0002-0030. Idempotent: the enum value and
-- the columns are all added conditionally, so re-running the file is a no-op.
--
-- ── Why ────────────────────────────────────────────────────────────────────
--
-- A commission row is raised for every qualifying order, and the only thing
-- the desk can do with one is confirm it — which credits the customer. Some
-- orders carry no commission: a deal done at a flat rate, an order that was
-- really a correction, a facilitator who was paid another way. Those rows have
-- nowhere to go. They sit pending forever, so "pending" stops meaning "still
-- to pay" and starts meaning "still to pay, or never going to be paid, and you
-- cannot tell which from here".
--
-- Skipping is the second exit. It settles the row without crediting anybody,
-- and it records who decided and why, because "we do not pay commission on
-- this one" is a decision somebody has to be able to stand behind later.
--
-- ── Shape ──────────────────────────────────────────────────────────────────
--
-- Its own status rather than a flag beside 'pending', so every existing query
-- that filters on status keeps working and none of them silently start
-- counting skipped rows as payable. Its own timestamp and actor rather than
-- reusing paid_at/paid_by, because a skipped commission was never paid and a
-- row claiming otherwise would be worse than no row at all.
--
-- ALTER TYPE ... ADD VALUE is safe inside the runner's implicit transaction
-- here (PG 12+) precisely because nothing in this file writes the new value.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'commission_status' AND e.enumlabel = 'skipped'
  ) THEN
    ALTER TYPE commission_status ADD VALUE 'skipped';
  END IF;
END $$;

ALTER TABLE commissions ADD COLUMN IF NOT EXISTS skipped_at timestamptz;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS skipped_by integer REFERENCES staff(id) ON DELETE SET NULL;
-- Why it was skipped. Required by the application rather than by the column:
-- a NOT NULL default of '' would let an empty reason through just as easily.
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS skip_reason text NOT NULL DEFAULT '';
