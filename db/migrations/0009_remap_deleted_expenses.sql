-- Finish the job 0007 started: move the soft-deleted expenses onto the chart too.
--
-- 0007 remapped every LIVE expense and deliberately scoped itself to
-- `deleted_at IS NULL`. That left 44 soft-deleted rows still pointing at the
-- pre-chart vocabulary — the only references to it anywhere.
--
-- Two things followed from that, both wrong:
--
--   · the category filter on Expenses and My Requests offered a "Retired
--     (pre-chart)" group of 49 options, every one of which could only ever
--     return zero rows, because the list never shows deleted expenses;
--   · restoring a deleted expense would have brought back a category named
--     after a vessel, reintroducing the old vocabulary one row at a time.
--
-- Same rules as 0007, applied to the rows it skipped. Only category_id
-- changes; pfi_id, amounts and deleted_at are untouched, so nothing is
-- un-deleted and no cargo changes the batch it costs into.

CREATE TEMP TABLE remap_deleted ON COMMIT DROP AS
SELECT
  e.id AS expense_id,
  CASE
    WHEN old.pfi_id IS NOT NULL THEN CASE
      WHEN e.description ILIKE '%demurrage%'                                   THEN '5030'
      WHEN e.description ILIKE '%marine insurance%'                            THEN '5310'
      WHEN e.description ILIKE '%insurance%'                                   THEN '5330'
      WHEN e.description ILIKE '%jetty%'                                       THEN '5040'
      WHEN e.description ILIKE '%throughput%'                                  THEN '5050'
      WHEN e.description ILIKE '%discharge clearance%'                         THEN '5080'
      WHEN e.description ILIKE '%loading clearance%'                           THEN '5070'
      WHEN e.description ILIKE '%clearance%' OR e.description ILIKE '%clearing%' THEN '5060'
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
      WHEN e.description ILIKE '%stevedor%' OR e.description ILIKE '%discharge%'
        OR e.description ILIKE '%loading%' OR e.description ILIKE '%cargo handling%' THEN '5110'
      WHEN e.description ILIKE '%travel%' OR e.description ILIKE '%flight%'
        OR e.description ILIKE '%ticket%'                                      THEN '5450'
      WHEN e.description ILIKE '%compressor%' OR e.description ILIKE '%bearing%'
        OR e.description ILIKE '%extinguisher%' OR e.description ILIKE '%mattress%' THEN '5520'
      WHEN e.description ILIKE '%toner%' OR e.description ILIKE '%tonner%'
        OR e.description ILIKE '%cartridge%' OR e.description ILIKE '%cartrideg%'
        OR e.description ILIKE '%printer%' OR e.description ILIKE '%stationery%'
        OR e.description ILIKE '%office equipment%' OR e.description ILIKE '%starlink%' THEN '5550'
      WHEN e.description ILIKE '%welfare%'                                     THEN '5460'
      ELSE '5560'
    END
    -- Name tests take a trailing wildcard: 0007 renamed these with a
    -- " (pre-chart)" suffix, so an exact match would now miss every one.
    ELSE CASE
      WHEN old.name ILIKE 'truck maintenance%' OR old.name ILIKE 'truck servicing%' THEN '6090'
      WHEN old.name ILIKE 'electricity%'                                            THEN '6070'
      WHEN old.name ILIKE 'administrative%'                                         THEN '6300'
      WHEN old.name ILIKE 'feeding%'                                                THEN '6020'
      WHEN old.name ILIKE 'license%' OR old.name ILIKE 'licence%'                   THEN '6130'
      ELSE '6310'
    END
  END AS gl_code
FROM pfi_expenses e
JOIN expense_categories old ON old.id = e.category_id
WHERE e.deleted_at IS NOT NULL
  AND old.gl_group IS NULL;

UPDATE pfi_expenses e
SET category_id = t.id
FROM remap_deleted r
JOIN expense_categories t ON t.gl_code = r.gl_code
WHERE e.id = r.expense_id;

-- Deliberately not touching updated_at: these rows are deleted, and bumping
-- the timestamp would make a housekeeping rewrite look like someone edited a
-- deleted expense.
