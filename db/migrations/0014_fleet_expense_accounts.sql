-- Give running the trucks its own accounts under General Expenses.
--
-- The chart seeded by 0007 has one line for the whole fleet: "Repairs &
-- Maintenance" (6090), sitting between office rent and printing. Everything
-- spent keeping the trucks on the road — a set of tyres, a battery, a
-- calibration, a gearbox — lands in that single bucket alongside a repair to
-- the office air conditioner. The result is a number nobody can act on: you
-- cannot tell what the fleet costs to run, which truck is eating the budget,
-- or whether tyres are a bigger line than servicing.
--
-- 0007's own notes record that the company HAD this vocabulary before the
-- chart existed — "Truck Maintenance" and "Truck Servicing" were among the
-- eight categories it retired — and folding them into 6090 lost it. This
-- brings it back properly, as a named run of accounts rather than two
-- free-text categories.
--
-- ── Why these names ──────────────────────────────────────────────────────
--
-- Taken from the per-truck fleet ledger's own list
-- (soromanfe/src/lib/hooks/useFleet.ts: Brake Pads, Tyres, Engine Oil,
-- Fuel/Diesel, Truck Servicing, Repairs & Maintenance, Insurance,
-- Licence/Registration, Spare Parts, Battery, Electrical, Body Work, Towing,
-- Driver Salary, Driver Allowance), plus the two the business asked for that
-- it does not carry: service items and calibration.
--
-- Matching that list deliberately. The fleet ledger records what was spent on
-- a given truck; these accounts record the same spending in the company's
-- books. Using one vocabulary in both means someone who books "Tyres" against
-- a truck finds "Tyres" in the expense picker, instead of guessing which of
-- two half-overlapping lists this screen wants.
--
-- ── The deliberate overlaps ──────────────────────────────────────────────
--
-- Four of these look like accounts that already exist, and are separate on
-- purpose, because the fleet figure is only useful if it is complete:
--
--   Truck Fuel & Diesel      vs 6080 Fuel Oil & Lubricants  (generators, plant)
--   Truck Insurance          vs 6160 Insurance – General    (office, liability)
--   Truck Licence & Papers   vs 6130 Licences & Permits     (company licences)
--   Driver Salary            vs 6010 Salaries & Wages       (everyone else)
--
-- 6090 Repairs & Maintenance stays where it is and keeps its meaning for
-- everything that is not a truck. Nothing already booked is moved: the
-- historical rows were classified against the chart as it stood, and
-- reinterpreting them now would silently rewrite months of reported figures.
-- New spending goes to the new accounts; the old total stays auditable.
--
-- ── Where they appear ────────────────────────────────────────────────────
--
-- gl_subgroup is "Fleet & Truck Costs", which is what makes them a headed
-- block rather than fifteen more entries in a flat list of thirty. Every
-- existing general account carries an empty subgroup, and buildGroups
-- (controllers/administration/expense.controller.js) forms its headings from
-- runs of equal gl_subgroup in gl_code order — so codes above 6310 keep the
-- whole run contiguous and produce exactly one new heading under General
-- Expenses. No application change is needed; the picker reads the table.

-- ── Clear the names first ────────────────────────────────────────────────
--
-- `name` carries a unique index (expense_categories_name_idx), and 0007
-- retired the pre-chart categories by suffixing them " (pre-chart)" rather
-- than deleting them — so an old free-text "Truck Servicing" or "Spare Parts"
-- could still be sitting there holding a name the insert below wants.
--
-- Run BEFORE the insert, not after, for the reason 0007 spells out: a name
-- that has not been moved aside yet is a name the insert cannot take, and the
-- migration would fail on the unique index instead of retiring the row.
-- Restricted to gl_code IS NULL so it can only ever touch a pre-chart row,
-- never an account this chart owns.
UPDATE expense_categories
SET name = name || ' (pre-chart)', is_active = false, updated_at = NOW()
WHERE gl_code IS NULL
  AND name IN (
    'Truck Servicing', 'Truck Repairs & Maintenance', 'Spare Parts', 'Tyres',
    'Battery', 'Brake Pads', 'Engine Oil & Lubricants',
    'Service Items & Consumables', 'Truck Calibration', 'Electrical',
    'Body Work & Fabrication', 'Towing & Recovery', 'Truck Fuel & Diesel',
    'Truck Insurance', 'Truck Licence & Papers', 'Driver Salary & Allowances',
    'Other Fleet Expenses'
  );

INSERT INTO expense_categories (name, gl_code, gl_group, gl_subgroup, is_system_category, is_active)
SELECT v.name, v.gl_code, v.gl_group, v.gl_subgroup, false, true
FROM (VALUES
  -- Servicing and the wear items that go with it.
  ('Truck Servicing',                 '6320', 'general', 'Fleet & Truck Costs'),
  ('Truck Repairs & Maintenance',     '6330', 'general', 'Fleet & Truck Costs'),
  ('Spare Parts',                     '6340', 'general', 'Fleet & Truck Costs'),
  ('Tyres',                           '6350', 'general', 'Fleet & Truck Costs'),
  ('Battery',                         '6360', 'general', 'Fleet & Truck Costs'),
  ('Brake Pads',                      '6370', 'general', 'Fleet & Truck Costs'),
  ('Engine Oil & Lubricants',         '6380', 'general', 'Fleet & Truck Costs'),
  -- The consumables a service uses up that are not a named part: filters,
  -- belts, coolant, greases.
  ('Service Items & Consumables',     '6390', 'general', 'Fleet & Truck Costs'),
  -- Recalibrating a tanker's compartments. A regulatory requirement with its
  -- own schedule, so it is a line of its own rather than "servicing".
  ('Truck Calibration',               '6400', 'general', 'Fleet & Truck Costs'),
  ('Electrical',                      '6410', 'general', 'Fleet & Truck Costs'),
  ('Body Work & Fabrication',         '6420', 'general', 'Fleet & Truck Costs'),
  ('Towing & Recovery',               '6430', 'general', 'Fleet & Truck Costs'),
  -- See the overlap note above: these four are the fleet's share of costs
  -- that also exist company-wide.
  ('Truck Fuel & Diesel',             '6440', 'general', 'Fleet & Truck Costs'),
  ('Truck Insurance',                 '6450', 'general', 'Fleet & Truck Costs'),
  ('Truck Licence & Papers',          '6460', 'general', 'Fleet & Truck Costs'),
  ('Driver Salary & Allowances',      '6470', 'general', 'Fleet & Truck Costs'),
  -- The "etc". Every group in this chart ends with one, so a cost that fits
  -- nowhere still lands in the right section instead of in Other General.
  ('Other Fleet Expenses',            '6480', 'general', 'Fleet & Truck Costs')
) AS v(name, gl_code, gl_group, gl_subgroup)
-- Skips on gl_code, so re-running is a no-op rather than a duplicate — the
-- same guard 0007 uses, and what makes this safe to apply repeatedly.
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories c WHERE c.gl_code = v.gl_code
);
