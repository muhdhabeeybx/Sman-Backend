-- Assign a bank account to a PFI, not to a location.
--
-- A bank account was linked to depots, and a depot could belong to only one
-- account, so every PFI operating out of a location collected into the same
-- account. That is not how the business works: two PFIs can run from one
-- location at the same time and need separate accounts — different vessels,
-- different partners, different money.
--
-- The report panel shows the cost of the old shape plainly. It picked an
-- account with:
--
--     bankAccounts.find(a => a.depotIds.includes(pfi.locationId))
--
-- which cannot distinguish two PFIs at the same location and silently handed
-- both the first account it found.
--
-- `pfi_ids` becomes the assignment that matters. `depot_ids` stays, derived
-- from the locations of the assigned PFIs whenever an account is saved, so
-- everything still reading it — the Paystack subaccount lookup, staff scope,
-- the accounts list — keeps working without being rewritten. A location is no
-- longer something you pick; it is what the chosen PFIs imply.
--
-- Existing assignments are carried across: every PFI at a location the account
-- already covers becomes an explicit assignment, so nothing that resolved
-- before this stops resolving after it.

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS pfi_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── First, repair the lists that are not lists ──────────────────────────────
--
-- 15 of 25 accounts hold depot_ids as a JSON *string* containing an array —
-- '"[43]"' rather than '[43]' — from a value being stringified twice on its
-- way in. jsonb_array_length refuses it, which is how it surfaced, but the
-- quieter damage was in the browser: `depotIds?.map(Number)` on a string
-- yields undefined, so every lookup keyed on those accounts silently matched
-- nothing and no error was ever raised. lpg_station_ids is wrong on the same
-- rows for the same reason.
--
-- Unwrapped in place. A string that does not parse as an array becomes an
-- empty one rather than failing the migration — it held nothing usable
-- anyway.
UPDATE bank_accounts
   SET depot_ids = CASE
         WHEN jsonb_typeof(depot_ids) = 'array' THEN depot_ids
         WHEN jsonb_typeof(depot_ids) = 'string'
              AND (depot_ids #>> '{}') ~ '^\s*\[.*\]\s*$' THEN (depot_ids #>> '{}')::jsonb
         ELSE '[]'::jsonb
       END,
       lpg_station_ids = CASE
         WHEN jsonb_typeof(lpg_station_ids) = 'array' THEN lpg_station_ids
         WHEN jsonb_typeof(lpg_station_ids) = 'string'
              AND (lpg_station_ids #>> '{}') ~ '^\s*\[.*\]\s*$' THEN (lpg_station_ids #>> '{}')::jsonb
         ELSE '[]'::jsonb
       END
 WHERE jsonb_typeof(depot_ids) <> 'array'
    OR jsonb_typeof(lpg_station_ids) <> 'array';

-- Carry the location-level assignments down to the PFIs they were standing in
-- for. Only where the account has no explicit PFI list yet, so re-running this
-- cannot flatten a list someone has since curated.
UPDATE bank_accounts b
   SET pfi_ids = COALESCE((
         SELECT jsonb_agg(p.id ORDER BY p.id)
           FROM pfis p
          WHERE p.location_id::text IN (
                  SELECT jsonb_array_elements_text(b.depot_ids)
                )
       ), '[]'::jsonb)
 WHERE b.pfi_ids = '[]'::jsonb
   AND jsonb_array_length(b.depot_ids) > 0;

-- Looked up by PFI on every payment confirmation and every daily report.
CREATE INDEX IF NOT EXISTS bank_accounts_pfi_ids_idx ON bank_accounts USING gin (pfi_ids);
