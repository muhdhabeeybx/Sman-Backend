-- Seed the expense chart of accounts, and move the 221 booked expenses onto it.
--
-- ── What was actually there ──────────────────────────────────────────────
--
-- expense_categories held 49 rows, every one with gl_group NULL. 41 of those
-- were not categories at all: one per PFI, named after the cargo
-- ("PFI 36B/26/MT STELLAR/CALABAR"), carrying 181 expenses between them. They
-- answered "which cargo", never "what was the money spent on". The remaining
-- 8 were the whole vocabulary the company had for the other 40 expenses:
-- Administrative, Gas Plant, Stations, Truck Maintenance, Truck Servicing,
-- Electricity, Tashaf Filling Station, and three unused.
--
-- The machinery for a real chart already existed — expense_categories has
-- gl_code, gl_group and gl_subgroup; the controller enforces that a
-- pfi_direct account names a PFI and that nothing else does; the API builds
-- group → subgroup → account. It had simply never been given any accounts, so
-- the picker rendered an empty tree and the form fell back to listing PFIs.
-- This supplies them.
--
-- ── Why the remap is safe ────────────────────────────────────────────────
--
-- pfi_expenses.pfi_id is ALREADY populated on all 181 cargo expenses, and
-- agrees with the old category's own pfi_id on every single row — 181 agree,
-- 0 disagree. So which cargo an expense belongs to is recorded independently
-- of the category and is not touched here. The remap only rewrites
-- category_id, from "which PFI" to "what for". Nothing is deleted, no amount
-- changes, and no expense changes the batch it costs into.
--
-- Old categories are retired rather than dropped: is_active goes false so
-- they leave the pickers, but the rows survive, so anything still pointing at
-- one resolves to its original name instead of a dangling id.

ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;

-- ── Decide where every expense goes, before anything moves ───────────────
--
-- Worked out first, against the categories as they stand, for two reasons.
-- The old vocabulary overlaps the new chart by name — there is already a
-- "Feeding", and expense_categories has a unique index on name — so the old
-- names have to be moved aside before the new ones can be inserted, which
-- destroys the very information the mapping reads. And computing it up front
-- makes it one decision per expense, visible in one place, rather than a rule
-- that has to be re-derived at each step.
--
-- Keyed by expense, not by category, because for cargo costs the old category
-- said only which PFI: what the money was actually for survives nowhere but
-- the description.

CREATE TEMP TABLE remap ON COMMIT DROP AS
SELECT
  e.id AS expense_id,
  CASE
    -- Cargo costs: read the description. Most specific first, so
    -- "MARINE INSURANCE MT STELLER" reaches Marine Insurance rather than
    -- Vessel Operations.
    WHEN old.pfi_id IS NOT NULL THEN CASE
      WHEN e.description ILIKE '%demurrage%'                                   THEN '5030'
      WHEN e.description ILIKE '%marine insurance%'                            THEN '5310'
      WHEN e.description ILIKE '%insurance%'                                   THEN '5330'
      WHEN e.description ILIKE '%jetty%'                                       THEN '5040'
      WHEN e.description ILIKE '%throughput%'                                  THEN '5050'
      WHEN e.description ILIKE '%discharge clearance%'                         THEN '5080'
      WHEN e.description ILIKE '%loading clearance%'                           THEN '5070'
      WHEN e.description ILIKE '%clearance%' OR e.description ILIKE '%clearing%' THEN '5060'
      -- "VESEL" is how the ledger spells it about half the time, and a vessel
      -- named with a payment instalment ("MT ZONDA VESEL HIRE THIRD PAY",
      -- "KINGIS VESSEL COST") is always hire being paid down.
      WHEN e.description ILIKE '%vessel hire%' OR e.description ILIKE '%vesel hire%'
        OR e.description ILIKE '%hire vessel%' OR e.description ILIKE '%hire vesel%'
        OR e.description ILIKE '%charter%' OR e.description ILIKE '%hire mt%'
        OR e.description ILIKE '%vessel cost%' OR e.description ILIKE '%vessel budget%'
        OR e.description ILIKE '%vessel%payment%'                              THEN '5010'
      WHEN e.description ILIKE '%tugboat%' OR e.description ILIKE '%tug boat%'
        OR e.description ILIKE '%berth%' OR e.description ILIKE '%birthing%'   THEN '5130'
      WHEN e.description ILIKE '%safety certification%'                        THEN '5270'
      WHEN e.description ILIKE '%certification%' OR e.description ILIKE '%recertification%'
        OR e.description ILIKE '%accreditation%' OR e.description ILIKE '%calibration%' THEN '5260'
      WHEN e.description ILIKE '%surveyor%' OR e.description ILIKE '%survey%'
        OR e.description ILIKE '%superintend%'                                 THEN '5230'
      WHEN e.description ILIKE '%inspection%' OR e.description ILIKE '%analysis%' THEN '5220'
      WHEN e.description ILIKE '%gauging%' OR e.description ILIKE '%ullage%'   THEN '5250'
      WHEN e.description ILIKE '%nmdpra%' OR e.description ILIKE '%dpr%'       THEN '5280'
      WHEN e.description ILIKE '%sampling%'                                    THEN '5540'
      -- Spelled four ways in the ledger; all four mean the same payment.
      WHEN e.description ILIKE '%commission%' OR e.description ILIKE '%commision%'
        OR e.description ILIKE '%comission%' OR e.description ILIKE '%comision%' THEN '5410'
      WHEN e.description ILIKE '%feeding%' OR e.description ILIKE '%lunch%'
        OR e.description ILIKE '%food%'                                        THEN '5430'
      WHEN e.description ILIKE '%accommodation%' OR e.description ILIKE '%accomodation%'
        OR e.description ILIKE '%house rent%' OR e.description ILIKE '%hotel%' THEN '5440'
      WHEN e.description ILIKE '%crew%'                                        THEN '5420'
      WHEN e.description ILIKE '%haulage%' OR e.description ILIKE '%transport%' THEN '5120'
      WHEN e.description ILIKE '%freight%' OR e.description ILIKE '%shipping%' THEN '5020'
      WHEN e.description ILIKE '%port charge%'                                 THEN '5090'
      WHEN e.description ILIKE '%terminal%'                                    THEN '5100'
      WHEN e.description ILIKE '%hose%'                                        THEN '5150'
      WHEN e.description ILIKE '%fender%'                                      THEN '5160'
      WHEN e.description ILIKE '%cleaning%'                                    THEN '5530'
      -- Moving or working the cargo itself, once the more specific clearance
      -- and hire tests above have had their turn.
      WHEN e.description ILIKE '%stevedor%' OR e.description ILIKE '%discharge%'
        OR e.description ILIKE '%loading%' OR e.description ILIKE '%cargo handling%' THEN '5110'
      WHEN e.description ILIKE '%travel%' OR e.description ILIKE '%flight%'
        OR e.description ILIKE '%ticket%'                                      THEN '5450'
      WHEN e.description ILIKE '%compressor%' OR e.description ILIKE '%bearing%'
        OR e.description ILIKE '%extinguisher%' OR e.description ILIKE '%mattress%' THEN '5520'
      -- Office running costs that happened to be raised against a cargo.
      WHEN e.description ILIKE '%toner%' OR e.description ILIKE '%tonner%'
        OR e.description ILIKE '%cartridge%' OR e.description ILIKE '%cartrideg%'
        OR e.description ILIKE '%printer%' OR e.description ILIKE '%stationery%'
        OR e.description ILIKE '%office equipment%' OR e.description ILIKE '%starlink%' THEN '5550'
      WHEN e.description ILIKE '%welfare%'                                     THEN '5460'
      -- Nothing in the record identifies it. Says so, rather than guessing a
      -- category that would then read as fact on a cost report.
      ELSE '5560'
    END
    -- Overheads had a category, just a very coarse one, so they map by name.
    -- Gas Plant, Stations and the named filling station describe WHERE the
    -- money went rather than what for, and nothing in the new chart means
    -- that: they go to Other General Expenses rather than being forced into
    -- a category that would misstate them.
    ELSE CASE
      WHEN old.name ILIKE 'truck maintenance' OR old.name ILIKE 'truck servicing' THEN '6090'
      WHEN old.name ILIKE 'electricity'                                           THEN '6070'
      WHEN old.name ILIKE 'administrative'                                        THEN '6300'
      WHEN old.name ILIKE 'feeding'                                               THEN '6020'
      WHEN old.name ILIKE 'license' OR old.name ILIKE 'licence'                   THEN '6130'
      ELSE '6310'
    END
  END AS gl_code
FROM pfi_expenses e
JOIN expense_categories old ON old.id = e.category_id
WHERE e.deleted_at IS NULL
  -- Only what is still on the old vocabulary, so re-running this migration
  -- finds nothing left to move.
  AND old.gl_group IS NULL;

-- ── Move the old names aside ─────────────────────────────────────────────
--
-- Retired, not dropped: the rows survive, so an expense still pointing at one
-- resolves to a readable name instead of a dangling id. Renamed because the
-- unique index on name would otherwise block the chart below — the suffix
-- also makes it obvious in any old export which vocabulary a row came from.

UPDATE expense_categories
SET name = name || ' (pre-chart)', is_active = false, updated_at = NOW()
WHERE gl_group IS NULL AND is_active;

-- ── The chart ────────────────────────────────────────────────────────────
--
-- Subgroup headings are read off runs of gl_code rather than looked up, so
-- the codes are laid out in the order the headings should appear and each
-- run is kept contiguous. General expenses are one flat list and carry no
-- subgroup.

INSERT INTO expense_categories (name, gl_code, gl_group, gl_subgroup, is_system_category, is_active)
SELECT v.name, v.gl_code, v.gl_group, v.gl_subgroup, false, true
FROM (VALUES
  -- PFI Attached — Cargo / Vessel Costs
  ('Vessel Hire/Charter',                  '5010', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Freight & Shipping',                   '5020', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Demurrage',                            '5030', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Jetty Fees',                           '5040', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Throughput Fees',                      '5050', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Agency & Clearing',                    '5060', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Loading Clearance',                    '5070', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Discharge Clearance',                  '5080', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Port Charges',                         '5090', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Terminal Charges',                     '5100', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Cargo Handling',                       '5110', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Transportation/Haulage',               '5120', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Vessel Operations',                    '5130', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Vessel Repairs & Maintenance',         '5140', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Hose Hire',                            '5150', 'pfi_direct', 'Cargo / Vessel Costs'),
  ('Fender Hire',                          '5160', 'pfi_direct', 'Cargo / Vessel Costs'),
  -- PFI Attached — Inspection & Compliance
  ('Marine Inspection',                    '5210', 'pfi_direct', 'Inspection & Compliance'),
  ('Inspection & Analysis',                '5220', 'pfi_direct', 'Inspection & Compliance'),
  ('Survey & Superintendence',             '5230', 'pfi_direct', 'Inspection & Compliance'),
  ('Product Testing',                      '5240', 'pfi_direct', 'Inspection & Compliance'),
  ('Quantity/Gauging Services',            '5250', 'pfi_direct', 'Inspection & Compliance'),
  ('Certification & Recertification',      '5260', 'pfi_direct', 'Inspection & Compliance'),
  ('Safety Certification',                 '5270', 'pfi_direct', 'Inspection & Compliance'),
  ('Other Regulatory/Compliance Charges',  '5280', 'pfi_direct', 'Inspection & Compliance'),
  -- PFI Attached — Insurance
  ('Marine Insurance',                     '5310', 'pfi_direct', 'Insurance'),
  ('Cargo Insurance',                      '5320', 'pfi_direct', 'Insurance'),
  ('Other PFI Insurance',                  '5330', 'pfi_direct', 'Insurance'),
  -- PFI Attached — PFI Operational Expenses
  ('Customer Commission',                  '5410', 'pfi_direct', 'PFI Operational Expenses'),
  ('Vessel Crew Expenses',                 '5420', 'pfi_direct', 'PFI Operational Expenses'),
  ('Feeding',                              '5430', 'pfi_direct', 'PFI Operational Expenses'),
  ('Staff Accommodation',                  '5440', 'pfi_direct', 'PFI Operational Expenses'),
  ('Travel Expenses',                      '5450', 'pfi_direct', 'PFI Operational Expenses'),
  ('Other PFI Operational Expenses',       '5460', 'pfi_direct', 'PFI Operational Expenses'),
  -- PFI Attached — Other PFI Costs
  ('Equipment Hire',                       '5510', 'pfi_direct', 'Other PFI Costs'),
  ('Equipment Purchase',                   '5520', 'pfi_direct', 'Other PFI Costs'),
  ('Cleaning',                             '5530', 'pfi_direct', 'Other PFI Costs'),
  ('Sampling Expenses',                    '5540', 'pfi_direct', 'Other PFI Costs'),
  ('Miscellaneous PFI Expenses',           '5550', 'pfi_direct', 'Other PFI Costs'),
  ('Other Direct PFI Costs',               '5560', 'pfi_direct', 'Other PFI Costs'),
  -- General Expenses — one flat list, no subgroup
  ('Salaries & Wages',                     '6010', 'general', ''),
  ('Staff Welfare',                        '6020', 'general', ''),
  ('Staff Medical Expenses',               '6030', 'general', ''),
  ('Staff Training',                       '6040', 'general', ''),
  ('Transport & Travelling',               '6050', 'general', ''),
  ('Office Rent',                          '6060', 'general', ''),
  ('Electricity & Power',                  '6070', 'general', ''),
  ('Fuel Oil & Lubricants',                '6080', 'general', ''),
  ('Repairs & Maintenance',                '6090', 'general', ''),
  ('Office Equipment',                     '6100', 'general', ''),
  ('Printing & Stationery',                '6110', 'general', ''),
  ('Telephone & Internet',                 '6120', 'general', ''),
  ('Licences & Permits',                   '6130', 'general', ''),
  ('Statutory Fees Rates & Taxes',         '6140', 'general', ''),
  ('Bank Charges',                         '6150', 'general', ''),
  ('Insurance – General',                  '6160', 'general', ''),
  ('Audit Fees',                           '6170', 'general', ''),
  ('Consultancy Fees',                     '6180', 'general', ''),
  ('Legal & Professional Fees',            '6190', 'general', ''),
  ('Directors'' Allowances',               '6200', 'general', ''),
  ('Directors'' Expenses',                 '6210', 'general', ''),
  ('Recruitment Expenses',                 '6220', 'general', ''),
  ('Advertising & Promotion',              '6230', 'general', ''),
  ('Corporate Social Responsibility',      '6240', 'general', ''),
  ('Fines & Penalties',                    '6250', 'general', ''),
  ('Depreciation & Amortisation',          '6260', 'general', ''),
  ('Bad Debts',                            '6270', 'general', ''),
  ('Corporate Fees',                       '6280', 'general', ''),
  ('General Office Expenses',              '6290', 'general', ''),
  ('Other Administrative Expenses',        '6300', 'general', ''),
  ('Other General Expenses',               '6310', 'general', '')
) AS v(name, gl_code, gl_group, gl_subgroup)
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories c WHERE c.gl_code = v.gl_code
);

-- ── Move the expenses ────────────────────────────────────────────────────
--
-- One statement, applying the decision made at the top. Only category_id
-- changes: no amount is touched, nothing is deleted, and pfi_id is left
-- exactly as it was — which is what keeps every cargo cost on the same batch
-- it was already costed to.

UPDATE pfi_expenses e
SET category_id = t.id, updated_at = NOW()
FROM remap r
JOIN expense_categories t ON t.gl_code = r.gl_code
WHERE e.id = r.expense_id;
