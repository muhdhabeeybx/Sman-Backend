-- Which parts of the system may pay into which account.
--
-- Every bank account dropdown in the app currently offers every active
-- account — 15 of them. Someone recording a truck payment sees the refinery
-- account, the project account and a customer's personal account alongside
-- the collection account they actually want, and picking the wrong one is
-- silent: the payment records, and the error only surfaces when the money is
-- reconciled against a statement it was never going to appear on.
--
-- `usage` narrows each dropdown to the accounts that area really collects
-- into. It is a jsonb array of tags, the same shape and treatment as the
-- depot_ids and lpg_station_ids already on this table:
--
--     truck_sales   truck sales ledger, delivery operations, filling stations
--     expenses      raising and paying an expense
--
-- An account may carry both, one, or neither. Neither means it stays out of
-- those two pickers — it does NOT mean "allowed everywhere". Every other
-- picker in the system is left alone and still sees all active accounts,
-- so this migration cannot remove an option from a screen it says nothing
-- about.

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS usage JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Index the tags so the filter stays a lookup rather than a scan of the
-- whole table once these grow.
CREATE INDEX IF NOT EXISTS bank_accounts_usage_idx ON bank_accounts USING GIN (usage);

-- ── The collection accounts for truck sales and the stations ─────────────
--
-- Matched on account_number, which is what identifies an account everywhere
-- else in the system, and inserted only when absent. Re-running this changes
-- nothing.
--
-- Four of these answer a question migration 0004 left open. It seeded two
-- ledger accounts and deliberately skipped four more — 0001732331 Jaiz,
-- 4831626926 and 4831633915 Moniepoint, and 1312295830 Zenith — because
-- nothing on record named their holders, and inventing a name on a finance
-- record is worse than omitting it. Those names were since supplied by the
-- company and are used here.

INSERT INTO bank_accounts (bank_name, account_name, account_number, currency, status, is_default, usage)
SELECT v.bank_name, v.account_name, v.account_number, 'NGN', 'Active', false, '["truck_sales"]'::jsonb
FROM (VALUES
  ('Zenith Bank', 'Soroman Trucks',   '1311924986'),
  ('Jaiz Bank',   'Soroman Nig Ltd',  '0001732331'),
  ('Zenith Bank', 'Soroman Stations', '1312295830'),
  ('Moniepoint',  'Soroman Kano 1',   '4005281106'),
  ('Moniepoint',  'Soroman Kano 2',   '5234562136'),
  ('Moniepoint',  'Soroman Alkaleri', '4831626926'),
  ('Moniepoint',  'Soroman Potiskum', '4831633915'),
  ('Moniepoint',  'Soroman Ningi',    '4831639436'),
  ('Moniepoint',  'Soroman Tirwun',   '4005276991')
) AS v(bank_name, account_name, account_number)
WHERE NOT EXISTS (
  SELECT 1 FROM bank_accounts b WHERE b.account_number = v.account_number
);

-- Tag the ones that already existed. 1311924986 (Soroman Trucks) was seeded
-- by 0004 and so is not inserted above, but still needs the tag or the truck
-- sales dropdown opens empty of the account it most needs.
UPDATE bank_accounts
SET usage = (COALESCE(usage, '[]'::jsonb) || '["truck_sales"]'::jsonb),
    updated_at = NOW()
WHERE account_number IN (
  '1311924986','0001732331','1312295830','4005281106','5234562136',
  '4831626926','4831633915','4831639436','4005276991'
)
AND NOT (COALESCE(usage, '[]'::jsonb) @> '["truck_sales"]'::jsonb);
