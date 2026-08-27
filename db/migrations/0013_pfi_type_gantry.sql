-- A PFI is either coastal or gantry, and the two are not the same paperwork.
--
-- Everything the table holds was built around a coastal batch: a vessel
-- discharges, a surveyor measures, and you are billed on the BL figure from the
-- shipping papers while you can only ever sell what measured into the tank. All
-- of that — bl_qty_litres, bl_qty_mt, vessel_name, surveyor_name — describes a
-- cargo that arrived by sea.
--
-- A gantry PFI has none of it. You buy an allocation at the loading gantry,
-- split into tickets, and there is exactly one quantity: what you bought. There
-- is no BL to be billed against, no discharge to measure, and no vessel or
-- surveyor to name. Recording one on the coastal shape meant leaving half the
-- columns blank and reading a surplus/deficit against a BL nobody had, which is
-- not a missing figure but a question that does not apply.
--
-- `pfi_type` is what tells the difference. Every existing row is coastal —
-- that is the only kind that could have been entered until now — so the default
-- backfills them correctly and the column is NOT NULL from the start.
--
-- `ticket_count` is the one genuinely new fact a gantry PFI carries: how many
-- gantry tickets the allocation was split into. Nullable with no default,
-- because a batch nobody has counted tickets for is not a batch with zero
-- tickets — the same "blank means unknown" rule bl_qty_litres already follows.
--
-- Nothing is added for PFI value or sales value. PFI value is quantity ×
-- price per litre and sales value is the revenue from confirmed-paid orders on
-- the batch; both are computed in lib/pfiFinance.js from data already here, and
-- storing either would let a second copy drift out of step with the first.

ALTER TABLE pfis
  ADD COLUMN IF NOT EXISTS pfi_type VARCHAR(20) NOT NULL DEFAULT 'coastal',
  ADD COLUMN IF NOT EXISTS ticket_count INTEGER;

-- Only the two kinds exist. A typo'd type would otherwise silently read as
-- coastal everywhere the code branches on it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pfis_pfi_type_check'
  ) THEN
    ALTER TABLE pfis
      ADD CONSTRAINT pfis_pfi_type_check CHECK (pfi_type IN ('coastal', 'gantry'));
  END IF;
END $$;

ALTER TABLE pfis
  DROP CONSTRAINT IF EXISTS pfis_ticket_count_check;
ALTER TABLE pfis
  ADD CONSTRAINT pfis_ticket_count_check CHECK (ticket_count IS NULL OR ticket_count >= 0);

-- The list page filters by type alongside status, the same way it already
-- filters by status alone.
CREATE INDEX IF NOT EXISTS pfis_pfi_type_idx ON pfis (pfi_type);
