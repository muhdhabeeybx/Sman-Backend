-- Say, on every payment row, HOW that payment came to be attached to its order.
--
-- Written by hand in the style of 0002-0022, for the reason set out in 0003:
-- drizzle-kit has no snapshot of this database. Every statement is idempotent,
-- so re-running the file is a no-op.
--
-- ── Why this exists ────────────────────────────────────────────────────────
--
-- The finance report can already say whether an order has a bank statement
-- line behind it (`reconciled`). That is not the same question as "who decided
-- this bank line paid for this order", and conflating the two is what has been
-- causing the confusion:
--
--   * 17 of 17 transfers between orders were NOT created by anybody. They were
--     converted by migration 0021 out of the old oldest-credit-first wallet
--     draws, and they render on the report exactly like a transfer a person
--     deliberately made on the transfer screen.
--
--   * 1,631 payment rows came from that same oldest-first walk, which picked
--     a deposit because it was the oldest unspent one and for no other reason.
--     Nothing records why that deposit and not another.
--
--   * 5,740 rows carry no funding record at all — they exist because the order
--     said it was paid, and the amount is the order's own `amount_paid`.
--
--   * 22 rows DO have a real statement line, but 0021 had to guess which order
--     it belonged to (the "order that consumed the most of it" tiebreak),
--     because the old ledger never wrote it down.
--
-- All of the above render identically today. A person reading the report
-- cannot tell a payment a colleague matched against a bank statement from one
-- the system invented on their behalf. This column makes the difference a
-- fact on the row rather than something to be re-derived, guessed at, or
-- explained in a meeting.
--
-- It is computed ONCE, here, from evidence that exists now
-- (`order_deposit_allocations.source`, the migration's own note text, and the
-- transfer's reason) and would be far more expensive — and eventually
-- impossible — to recover later. The live write paths set it going forward.

ALTER TABLE order_payments
  ADD COLUMN IF NOT EXISTS confirmation_basis VARCHAR(24);

-- ── 1. Transfer legs ───────────────────────────────────────────────────────
--
-- A transfer leg's provenance is the transfer's, so it is read from there
-- rather than from the leg's own note — the two can never then disagree.
-- 0021 stamped every transfer it created with a reason beginning
-- 'Backfilled (migration 0021)', which is the only marker distinguishing a
-- movement the system invented from one somebody chose to make.
UPDATE order_payments p
   SET confirmation_basis = CASE
         WHEN t.reason LIKE 'Backfilled (migration 0021)%' THEN 'transfer_auto'
         ELSE 'transfer_desk'
       END
  FROM order_payment_transfers t
 WHERE t.id = p.transfer_id
   AND p.confirmation_basis IS NULL;

-- ── 2. Statement-backed rows ───────────────────────────────────────────────
--
-- A row written by the live endpoint (POST /orders/:id/payments) carries an
-- empty note and is, by construction, a person naming the lines: there is no
-- other way to reach that code path.
UPDATE order_payments
   SET confirmation_basis = 'bank_matched'
 WHERE source = 'statement'
   AND confirmation_basis IS NULL
   AND COALESCE(note, '') NOT LIKE 'Backfilled%';

-- A backfilled statement row is only as trustworthy as the allocation it came
-- from. `order_deposit_allocations.source = 'bank'` was written at confirm
-- time and means "this line was claimed FOR this order" — a recorded human
-- decision. Anything else ('wallet', 'legacy', or no allocation row at all)
-- means 0021 fell back to its tiebreak and CHOSE the order.
UPDATE order_payments p
   SET confirmation_basis = 'bank_matched'
 WHERE p.source = 'statement'
   AND p.confirmation_basis IS NULL
   AND EXISTS (
     SELECT 1
       FROM bank_statement_lines l
       JOIN order_deposit_allocations a
         ON a.deposit_id = l.matched_deposit_id
        AND a.order_id = p.order_id
      WHERE l.id = p.statement_line_id
        AND a.source = 'bank'
   );

-- The remainder: the line is real and checkable against a statement, but which
-- order it settles is this migration's inference, not a recorded fact.
UPDATE order_payments
   SET confirmation_basis = 'bank_inferred'
 WHERE source = 'statement'
   AND confirmation_basis IS NULL;

-- ── 3. Legacy rows ─────────────────────────────────────────────────────────
--
-- Section 6 of 0021 wrote one row per paid order that had no funding record
-- whatsoever, taking the amount from orders.amount_paid. Its note is the only
-- thing that distinguishes those from the oldest-first walk's output.
UPDATE order_payments
   SET confirmation_basis = 'no_record'
 WHERE source = 'legacy'
   AND confirmation_basis IS NULL
   AND note LIKE 'No payment record exists%';

-- What is left of the legacy rows is the oldest-credit-first walk: a deposit
-- and an amount, with nothing recorded about why that deposit.
UPDATE order_payments
   SET confirmation_basis = 'auto_allocated'
 WHERE source = 'legacy'
   AND confirmation_basis IS NULL;

-- ── 4. Anything the rules above did not reach ──────────────────────────────
--
-- There should be none. Defaulted rather than left NULL so the column can be
-- NOT NULL and no reader ever has to handle an absent basis; 'unknown' is
-- itself an honest answer and is surfaced as such.
UPDATE order_payments
   SET confirmation_basis = 'unknown'
 WHERE confirmation_basis IS NULL;

ALTER TABLE order_payments
  ALTER COLUMN confirmation_basis SET NOT NULL,
  ALTER COLUMN confirmation_basis SET DEFAULT 'bank_matched';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_confirmation_basis_check'
  ) THEN
    ALTER TABLE order_payments
      ADD CONSTRAINT order_payments_confirmation_basis_check
      CHECK (confirmation_basis IN (
        'bank_matched', 'bank_inferred', 'auto_allocated',
        'no_record', 'transfer_desk', 'transfer_auto', 'unknown'
      ));
  END IF;
END $$;

-- The report groups and filters by this, over a filtered set of orders.
CREATE INDEX IF NOT EXISTS order_payments_confirmation_basis_idx
  ON order_payments (confirmation_basis);

-- ── 5. What this is expected to leave behind ───────────────────────────────
--
-- Not assertions — a migration that aborts on a data condition is a migration
-- that cannot be run. These are the queries to run after it, and what they
-- said on production when it was written (2 Sep 2026):
--
--   SELECT confirmation_basis, count(*) FROM order_payments GROUP BY 1;
--
--     bank_matched     3,170   verifiable against a bank statement
--     bank_inferred       22   real line, order chosen by 0021
--     auto_allocated   1,631   oldest-credit-first walk, no line
--     no_record        5,740   no funding record ever existed
--     transfer_desk        0   nobody has yet made a transfer by hand
--     transfer_auto       34   17 transfers x 2 legs
--     unknown              0
