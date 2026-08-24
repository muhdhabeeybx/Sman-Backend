-- The collection accounts the sales ledger actually uses, added to the table
-- that manages them.
--
-- The frontend used to carry three accounts as a hardcoded array, separate
-- from bank_accounts entirely. Moving the pickers onto the managed table
-- removed two of those three from the dropdown, because they were never in
-- it — including the account 481 delivery_sales rows were paid into. Display
-- was never at risk (an unresolved account falls back to the string the row
-- recorded), but staff could no longer RECORD a payment into the company's
-- most-used collection account. This restores that.
--
-- Both names come from the frontend's own hardcoded list, which is the only
-- written record of them; the numbers and banks are corroborated by the 554
-- delivery_sales rows that reference them.
--
-- Four more accounts appear in the ledger and are still absent here:
--
--     109 rows   0001732331   Jaiz Bank
--      15 rows   4831626926   Moniepoint
--      11 rows   4831633915   Moniepoint
--       7 rows   1312295830   Zenith Bank
--
-- They are deliberately NOT seeded: nothing on record names their account
-- holders, and inventing an account name on a finance record is worse than
-- leaving it out. Add them through the Bank Accounts page, where the real
-- names can be entered.
--
-- Idempotent — matched on account_number, which is what identifies an
-- account everywhere else in the system.

INSERT INTO bank_accounts (bank_name, account_name, account_number, currency, status, is_default, depot_ids, lpg_station_ids, notes)
SELECT 'Zenith Bank', 'Soroman Trucks', '1311924986', 'NGN', 'Active', false, '[]'::jsonb, '[]'::jsonb,
       'Filling-station collections. Carried over from the frontend hardcoded list.'
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE account_number = '1311924986');

INSERT INTO bank_accounts (bank_name, account_name, account_number, currency, status, is_default, depot_ids, lpg_station_ids, notes)
SELECT 'Optimus Bank', 'Soroman Nigeria Ltd', '1000102110', 'NGN', 'Active', false, '[]'::jsonb, '[]'::jsonb,
       'Filling-station collections. Carried over from the frontend hardcoded list.'
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE account_number = '1000102110');
