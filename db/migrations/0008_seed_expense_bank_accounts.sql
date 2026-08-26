-- Start the expense payment shortlist off with the accounts the record proves
-- were used.
--
-- 0006 gave bank accounts a `usage` tag and the expense payment dropdown now
-- reads it. Left empty, that dropdown would come up blank on the first day and
-- the review drawer would fall back to its free-text box — which is how the
-- data got into its current state in the first place. 162 paid expenses name
-- their account in 17 different spellings for what is really about five
-- accounts:
--
--     57  SRM FIDELITY EXPENSES ACCOUNT      19  FIDELITY SRM MAIN
--     22  Zenith Bank · 1311924890           15  Fidelity SRM Main
--     11  UBA                                11  MONIEPOINT
--     10  SRM Zenith                          4  SRM MAIN PROJ ZENITH
--      3  FIDELITY BANK · 5540039137          2  ZENITH BANK
--      2  SRM FIDELITY EXPENSES ACC           1  SRM expenses account
--      1  fidelity expenses acc soroman       1  Opay …and more
--
-- Only three of those identify an account beyond doubt, because only three
-- carry the number: 1311924890, 5540039137 and 1311924900. Those are tagged
-- here.
--
-- The rest are deliberately NOT guessed. "UBA" matches two accounts on file,
-- "MONIEPOINT" matches none of the old ones, and whether "FIDELITY SRM MAIN"
-- is the same account as "SRM FIDELITY EXPENSES ACCOUNT" is not something the
-- record answers — there is only one Fidelity account in bank_accounts and
-- two names in use. Guessing would put a wrong account number on a finance
-- record, which is the same mistake 0004 refused to make. Finance can tick
-- the others from the Bank accounts button on the Expenses page, where they
-- know which is which.
--
-- Matched on account_number and idempotent.

UPDATE bank_accounts
SET usage = (COALESCE(usage, '[]'::jsonb) || '["expenses"]'::jsonb),
    updated_at = NOW()
WHERE account_number IN ('1311924890', '5540039137', '1311924900')
  AND NOT (COALESCE(usage, '[]'::jsonb) @> '["expenses"]'::jsonb);
