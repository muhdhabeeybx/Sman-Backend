-- Moving an overpayment from one truck to another.
--
-- A customer regularly pays more against one truck than that truck was
-- worth. Until now the only ways to deal with it were to leave the surplus
-- sitting as a negative balance on a truck that was already settled, or to
-- edit the payment down and re-enter it elsewhere — which loses the fact that
-- the money was really received against the first truck, and leaves the
-- second one with an amount that came from nowhere.
--
-- A transfer is now two rows: a negative payment on the truck the surplus
-- leaves, and a positive one on the truck it lands on. Both carry the same
-- transfer_group_id, so the pair can always be found from either end, and
-- each names the other side in transfer_counterparty.
--
-- Why two rows rather than one adjustment: delivery_sales IS the payment
-- history, and the two questions people ask of it are "what did this truck
-- receive" and "where did that come from". One row can only answer one of
-- them. It is the same shape as the internal transfers on the finance
-- report, for the same reason.
--
-- The legs are ordinary delivery_sales in every other respect, so every
-- existing total, filter and export picks them up without being told: a
-- negative payment_amount reduces the source's total paid because the ledger
-- already sums that column.

ALTER TABLE delivery_sales
  ADD COLUMN IF NOT EXISTS transfer_group_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS transfer_counterparty VARCHAR(255);

-- Both legs are always read together, and always by group.
CREATE INDEX IF NOT EXISTS delivery_sales_transfer_group_idx
  ON delivery_sales (transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;
