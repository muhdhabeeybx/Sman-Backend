-- Commission report: the two figures it needs that no existing column means.
--
-- Nullable with no default on purpose — 0 and "not filled in yet" are
-- different answers on a report that may be filed in stages, and the derived
-- outstanding/remaining figures must not read as settled when nothing has
-- been entered.
--
-- Applied to the live database with these exact statements; IF NOT EXISTS
-- keeps re-running it a no-op. Additive and nullable, so Postgres does this
-- as a catalog-only change with no table rewrite.
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS funds_received numeric(15,2);
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS commission_due numeric(15,2);
