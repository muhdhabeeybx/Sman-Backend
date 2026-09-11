-- Let a filling-station delivery cycle be closed.
--
-- Written by hand in the style of 0002-0028, for the reason set out in 0003.
-- Every statement is idempotent, so re-running the file is a no-op.
--
-- ── What a cycle is ────────────────────────────────────────────────────────
--
-- The filling stations register is one row per delivery cycle: a load that
-- went to a station, what the station sold off it, what it paid in, what it
-- spent, and what is left owing. Like the delivery batch in 0028 it is not a
-- row anywhere — it is a `delivery_inventory` loading with the
-- `delivery_sales` that answer to it, assembled on the way to the screen.
--
-- And like a batch, it has nowhere to record that the desk is finished with
-- it. A station that sold its load and paid up sits in the register beside one
-- still owing, forever. 0028 gave batches a close; this is the same fact for
-- the row this page is actually about.
--
-- ── Why a second table rather than a column on delivery_batches ────────────
--
-- They are keyed by different things. A batch is identified by its allocation
-- code; a cycle is identified by the loading it came from — or, for sales with
-- no loading behind them, by the cycle/station/location triple the register
-- groups them under. Overloading one table would mean a column saying which
-- kind of key each row holds, and two things that are never queried together
-- sharing an index. Same shape, separate table, each legible on its own.
--
-- The key is `text`, not varchar(100): a cycle key carries a truck number, a
-- date, a customer id and a location, and capping it would be an invitation
-- to truncate two different cycles into the same row.
--
-- Closing a cycle does not touch its loading, its sales, its payments or the
-- batch it belongs to. It is a statement about the desk's own work, and
-- nothing downstream reads it.

CREATE TABLE IF NOT EXISTS delivery_cycle_closures (
  -- The register's own group key: "loading:<delivery_inventory id>", or
  -- "sale:<cycle>::<customer>::<location>" where no loading was matched.
  cycle_key   text         PRIMARY KEY,
  status      varchar(20)  NOT NULL DEFAULT 'active',
  closed_at   timestamptz,
  closed_by   varchar(255) NOT NULL DEFAULT '',
  note        text         NOT NULL DEFAULT '',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_cycle_closures_status_check'
  ) THEN
    ALTER TABLE delivery_cycle_closures
      ADD CONSTRAINT delivery_cycle_closures_status_check
      CHECK (status IN ('active', 'completed'));
  END IF;
END $$;

-- The register asks for the closed ones as a set, never one key at a time.
CREATE INDEX IF NOT EXISTS delivery_cycle_closures_status_idx
  ON delivery_cycle_closures (status);
