// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { eq } = require("drizzle-orm");

const { db } = require("../config/db");
const { dailyReports } = require("../db/schema");
const dailyReportService = require("../services/dailyReport.service");
const { ensureTestStaff, closeDb } = require("./helpers");

const suffix = Date.now().toString(36);
const LOCATION = `Totals Test Location ${suffix}`;

/**
 * What a report ends up saying its day was worth.
 *
 * Pinned because the way this went wrong was invisible from the outside. The
 * IT compliance sheet collected a price table on screen, summarised it into
 * litres/value/price, and then posted only the summary — the rows themselves
 * were dropped by a `def.type === 'sales_manager'` check on the way out. The
 * server, seeing no bands, fell back to litres × price, and the dashboard was
 * sending NaN for both of those, which JSON turns into null and the schema
 * coerces to 0.
 *
 * Result: 101 of 105 compliance reports on live data recorded a day of
 * trading as 0 litres at ₦0, with every one of them looking like a filled-in
 * report. Nobody could correct one either — the three boxes were read-only.
 */
describe("daily report totals — what the day was worth", () => {
  let staffRow;
  let actor;

  before(async () => {
    staffRow = await ensureTestStaff();
    actor = { type: "staff", id: staffRow.id, name: "totals-test@soroman.test" };
  });

  after(async () => {
    await db.delete(dailyReports).where(eq(dailyReports.location, LOCATION));
    await closeDb();
  });

  test("price rows are what the volume, value and price are read from", async () => {
    const { success, report } = await dailyReportService.submitReport(
      {
        reportType: "it_compliance",
        reportDate: "2026-07-20",
        location: LOCATION,
        pfiNumber: `PFI-TOTALS-${suffix}`,
        orderCount: 3,
        priceBands: [
          { price: 1200, litres: 45000 },
          { price: 1250, litres: 15000 },
        ],
      },
      { actor }
    );

    assert.equal(success, true);
    assert.equal(Number(report.litresSold), 60000);
    assert.equal(Number(report.totalSalesAmount), 54000000 + 18750000);
    // Weighted by volume, not the plain mean of 1200 and 1250.
    assert.equal(Number(report.avgPrice), 72750000 / 60000);
    // And the rows survive the round trip, so an amendment has something to
    // work from and the report can say which volume went out at which price.
    assert.equal(report.priceBands.length, 2);
  });

  test("a figure the filer states beats the one the rows work out", async () => {
    const submitted = await dailyReportService.submitReport(
      {
        reportType: "sales_manager",
        reportDate: "2026-07-21",
        location: LOCATION,
        pfiNumber: `PFI-TOTALS-${suffix}`,
        priceBands: [{ price: 1000, litres: 50000 }],
        // Short of what the rows add up to: the dip says 49,000 went out, and
        // the sheet is the record.
        litresSold: 49000,
        totalSalesAmount: 49000000,
      },
      { actor }
    );

    assert.equal(submitted.success, true);
    assert.equal(Number(submitted.report.litresSold), 49000);
    assert.equal(Number(submitted.report.totalSalesAmount), 49000000);

    // An amendment that says nothing about them leaves both alone rather than
    // silently recomputing them back to the rows.
    const amended = await dailyReportService.amendReport(
      submitted.report.id,
      { truckCount: 6 },
      { actor }
    );
    assert.equal(amended.success, true);
    assert.equal(Number(amended.report.litresSold), 49000);
    assert.equal(Number(amended.report.totalSalesAmount), 49000000);
    assert.equal(amended.report.truckCount, 6);
  });

  test("rows alone still answer for themselves — the long-standing contract", async () => {
    const { success, report } = await dailyReportService.submitReport(
      {
        reportType: "sales_manager",
        reportDate: "2026-07-22",
        location: LOCATION,
        pfiNumber: `PFI-TOTALS-${suffix}`,
        priceBands: [{ price: 900, litres: 10000 }],
      },
      { actor }
    );

    assert.equal(success, true);
    assert.equal(Number(report.litresSold), 10000);
    assert.equal(Number(report.totalSalesAmount), 9000000);
    assert.equal(Number(report.avgPrice), 900);
  });

  test("the commission report can state what is still owed", async () => {
    const { success, report } = await dailyReportService.submitReport(
      {
        reportType: "commissions",
        reportDate: "2026-07-23",
        location: LOCATION,
        pfiNumber: `PFI-TOTALS-${suffix}`,
        fundsReceived: 5000000,
        commissionDue: 800000,
        amountPaid: 500000,
        // More than due − paid: this period's 300,000 plus 120,000 of arrears,
        // which today's two figures cannot see. Stored as filed.
        commissionOutstanding: 420000,
        fundsRemaining: 4500000,
      },
      { actor }
    );

    assert.equal(success, true);
    assert.equal(Number(report.commissionOutstanding), 420000);
    assert.equal(Number(report.fundsRemaining), 4500000);
  });
});
