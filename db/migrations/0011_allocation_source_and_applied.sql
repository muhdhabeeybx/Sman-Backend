-- Say which money actually paid for an order, and say how it got there.
--
-- An order confirmed from the bank statement records exactly one fact worth
-- auditing: THESE statement lines, for THIS order. Until now that fact was
-- thrown away the moment it was recorded. The line was claimed and credited
-- to the customer's wallet, and then allocateOrderFunding() walked the whole
-- wallet oldest-credit-first to decide what had "paid" for the order — so an
-- order confirmed against an 18,075,000 credit was written up as 250,000 from
-- one stranger's payment, 250,000 from an internal transfer, and 9,724,500 of
-- the credit that was actually chosen. Every one of those figures is
-- unfindable on a bank statement, which is the only place this report is ever
-- checked against.
--
-- Two columns fix it, because two different quantities were being asked of
-- one:
--
--   amount          what was received against this order — the statement
--                   line at face value. This is what reconciles to the bank.
--   applied_amount  how much of it the order actually consumed, capped at
--                   the order's own value. This is what draws deposits.
--                   remaining_amount down, so a surplus stays spendable.
--
-- They differ exactly when a payment overshoots the order it was made for:
-- 18,075,000 received, 10,224,500 consumed, 7,850,500 left in the wallet and
-- still traceable to the reference it arrived under. The report shows the
-- 18,075,000 and puts the 7,850,500 in the Differential column, which is what
-- an auditor holding the statement is looking for.
--
-- `source` names how the money reached the order, so the two kinds are never
-- confused again on screen:
--
--   bank    a statement line matched to THIS order at confirm time
--   wallet  a deliberate draw from balance already in the wallet, carrying
--           the reference of the deposit it originally arrived under
--   legacy  written by the old oldest-first walk, with nothing recorded
--           about why that deposit and not another. Marked, not deleted —
--           an unverifiable attribution should look unverifiable.
--
-- Existing rows are backfilled to 'legacy' and applied_amount = amount, which
-- is exactly what they meant before this migration; the restore script
-- (scripts/restore-order-payment-attribution.js) then rewrites the ones the
-- statement can actually account for.

ALTER TABLE order_deposit_allocations
  ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS applied_amount DECIMAL(15, 2);

-- Every pre-existing row consumed exactly what it was attributed — that was
-- the whole model before there was a difference between the two.
UPDATE order_deposit_allocations
   SET applied_amount = amount
 WHERE applied_amount IS NULL;

ALTER TABLE order_deposit_allocations
  ALTER COLUMN applied_amount SET NOT NULL;

-- The report groups an order's funding by source, and the restore script
-- sweeps for legacy rows to replace.
CREATE INDEX IF NOT EXISTS order_deposit_allocations_source_idx
  ON order_deposit_allocations (source);
