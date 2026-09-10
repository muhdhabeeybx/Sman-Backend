-- Let a delivery batch be closed.
--
-- Written by hand in the style of 0002-0027, for the reason set out in 0003:
-- drizzle-kit has no snapshot of this database. Every statement is idempotent,
-- so re-running the file is a no-op.
--
-- ── What a batch is today ──────────────────────────────────────────────────
--
-- Nothing. A delivery batch is not a row anywhere: it is every
-- `delivery_inventory` row that happens to share an `allocation_code`, grouped
-- on the way to the screen. That is a deliberate choice and 0027 kept it —
-- loading happens on the inventory page, so a batch exists precisely because
-- somebody loaded a truck under a code, and there is no way to raise an empty
-- one by accident.
--
-- The cost of it is that a batch has nowhere to carry a fact about itself. The
-- delivery desk finishes with a batch — every truck offloaded, every load
-- sold, the money in — and the batch stays at the top of the register forever,
-- indistinguishable from one still running. PFIs have had `status` since they
-- were introduced, and the two lists sit two clicks apart, so the register
-- looks broken by comparison rather than merely different.
--
-- ── What this adds ─────────────────────────────────────────────────────────
--
-- One row per closed batch, keyed by the code. Deliberately NOT a column on
-- `delivery_inventory`: a batch's status is a fact about the batch, and
-- spreading it across the truck rows would mean 61 rows agreeing with each
-- other (PFI-25C has 61), a load added afterwards silently disagreeing, and no
-- answer at all for a code whose rows were all deleted.
--
-- Absence of a row means active. Nothing has to be backfilled, every existing
-- batch keeps behaving exactly as it does now, and a batch that is never
-- closed never touches this table.
--
-- The code is stored normalised — trimmed and upper-cased — because that is
-- how the register groups them, and "pfi-40b" and "PFI-40B " have always been
-- the same batch on screen.
--
-- ── Why not `pfis.status` ──────────────────────────────────────────────────
--
-- Some batches are backed by a delivery PFI (0027) and that PFI already has a
-- status. Closing the batch does NOT touch it. `pfis.status` drives the stock
-- summary on the finance report, the expense chart and the PFI register, and
-- marking a PFI finished from the delivery register would move figures on a
-- report that has been audited. Closing a batch is a statement about the
-- delivery desk's own work; if the PFI should also be finished, that is a
-- decision taken on the PFI, where its consequences are visible.

CREATE TABLE IF NOT EXISTS delivery_batches (
  -- The allocation code, trimmed and upper-cased. The natural key: there is
  -- no batch id anywhere else in the system to reference.
  code        varchar(100) PRIMARY KEY,
  status      varchar(20)  NOT NULL DEFAULT 'active',
  -- When and by whom, so a closed batch can say who finished with it. A
  -- reopened batch keeps neither: it is active again, and the last close is
  -- not a fact about the batch's present state.
  closed_at   timestamptz,
  closed_by   varchar(255) NOT NULL DEFAULT '',
  -- Why it was closed early, where somebody says so. Optional.
  note        text         NOT NULL DEFAULT '',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- A check rather than a pg enum: two values that the application already
-- validates, and altering an enum later is a migration in itself.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_batches_status_check'
  ) THEN
    ALTER TABLE delivery_batches
      ADD CONSTRAINT delivery_batches_status_check
      CHECK (status IN ('active', 'completed'));
  END IF;
END $$;

-- The register asks for the closed ones as a set, never for one code at a
-- time, so this is the index that matters.
CREATE INDEX IF NOT EXISTS delivery_batches_status_idx ON delivery_batches (status);
