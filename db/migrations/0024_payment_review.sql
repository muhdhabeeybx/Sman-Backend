-- Let a person take responsibility for an attribution the system made.
--
-- Written by hand in the style of 0002-0023, for the reason set out in 0003:
-- drizzle-kit has no snapshot of this database. Every statement is idempotent,
-- so re-running the file is a no-op.
--
-- ── Why a separate layer, rather than editing confirmation_basis ───────────
--
-- The obvious move is to flip `confirmation_basis` from 'transfer_auto' to
-- 'transfer_desk' when somebody signs a movement off. That is wrong, and it is
-- wrong in exactly the way that caused this whole problem.
--
-- 0021 rewrote history: it took wallet draws nobody had chosen and presented
-- them as transfers, carrying the name of whoever had keyed in the underlying
-- deposit. Anyone reading the report afterwards saw a deliberate act by a named
-- person. Flipping the basis on review would do the same thing again — it would
-- erase the fact that the system made the original call, and in a year nobody
-- would be able to tell a movement a person decided from one a person merely
-- agreed with after the fact.
--
-- Those are different facts and both matter:
--
--   confirmation_basis   how this payment CAME to be on this order. History.
--                        Immutable for anything the backfill created.
--   reviewed_by/at/note  who has since examined it and vouched for it, and
--                        what reason they gave. Present-day accountability.
--
-- So the report can say "auto-allocated by the system — reviewed by Habeeb on
-- 2 Sep: customer confirmed by phone", which is the truth, instead of
-- "transfer recorded by staff", which would not be.
--
-- ── What this makes possible ───────────────────────────────────────────────
--
-- A work queue. "System-decided AND not yet reviewed" is a finite, shrinking
-- list — 6,412 payment rows today — and every one that gets looked at leaves a
-- name and a reason behind it. None of the money moves; what changes is that
-- the record stops being anonymous.
--
-- Reversal was considered first and rejected on the data: 0 of the 17
-- auto-created transfers and 0 of the 8 orders carrying an inferred bank line
-- can be undone without pushing an already-released, already-ticketed order
-- below its own value. See scripts/review-system-attributions.js.

ALTER TABLE order_payments
  ADD COLUMN IF NOT EXISTS reviewed_by  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note  TEXT NOT NULL DEFAULT '';

-- A transfer is reviewed as one movement, not as two independent legs — the
-- legs can never then disagree about whether the movement was vouched for.
ALTER TABLE order_payment_transfers
  ADD COLUMN IF NOT EXISTS reviewed_by  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note  TEXT NOT NULL DEFAULT '';

-- A review is a person, a time and a reason together, or it is not a review.
-- A row carrying a reviewer with no timestamp, or a sign-off with no reason
-- given, is precisely the half-recorded state this whole change exists to end.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_review_complete_check'
  ) THEN
    ALTER TABLE order_payments
      ADD CONSTRAINT order_payments_review_complete_check
      CHECK (
        (reviewed_by IS NULL AND reviewed_at IS NULL AND review_note = '')
        OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_note <> '')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_payment_transfers_review_complete_check'
  ) THEN
    ALTER TABLE order_payment_transfers
      ADD CONSTRAINT order_payment_transfers_review_complete_check
      CHECK (
        (reviewed_by IS NULL AND reviewed_at IS NULL AND review_note = '')
        OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_note <> '')
      );
  END IF;
END $$;

-- The queue is "system-decided and unreviewed", so the index that matters is
-- the partial one over exactly that set — it stays small as the work is done.
CREATE INDEX IF NOT EXISTS order_payments_needs_review_idx
  ON order_payments (confirmation_basis)
  WHERE reviewed_at IS NULL
    AND confirmation_basis IN ('bank_inferred', 'auto_allocated', 'no_record', 'transfer_auto', 'unknown');

-- ── What this is expected to leave behind ──────────────────────────────────
--
--   -- the review queue, largest class first
--   SELECT confirmation_basis, count(*) FROM order_payments
--    WHERE reviewed_at IS NULL
--      AND confirmation_basis IN ('bank_inferred','auto_allocated','no_record','transfer_auto')
--    GROUP BY 1;
--
--     no_record        5,740
--     auto_allocated   1,631
--     transfer_auto       34
--     bank_inferred       22
--
--   -- nothing is reviewed yet, so both columns are empty everywhere
--   SELECT count(*) FROM order_payments WHERE reviewed_at IS NOT NULL;  -- 0
