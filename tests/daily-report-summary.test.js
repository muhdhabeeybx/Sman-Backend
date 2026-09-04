const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDailySummary,
  summaryText,
  buildRemarks,
} = require("../notifications/templates/dailyReportSummary");

/**
 * The narrative summary at the top of the daily report.
 *
 * Pure functions of the report data, so no database. What is pinned here is
 * mostly the awkward days: the one with no orders, the first day with no
 * history to compare against, the single-order day whose grammar has to agree,
 * and the depot whose NAME contains a comma.
 */

const location = (over = {}) => ({
  name: "CALABAR DEPOT",
  orderCount: 0,
  orderLitres: 0,
  orderValue: 0,
  stock: { opening: 0, closing: 0, orderedQty: 0, confirmedQty: 0, confirmedValue: 0 },
  pfiStock: [],
  staffEntries: [],
  orders: [],
  ...over,
});

const filedSheets = (n) => [{ role: "SALES_MANAGER", type: "sales_manager", entries: Array(n).fill({}) }];

const data = (over = {}) => ({
  reportDate: "2026-09-04",
  totals: {
    staffEntries: 0,
    orderCount: 0,
    qtyLitres: 0,
    amountNaira: 0,
    openingStock: 0,
    closingStock: 0,
    confirmedQty: 0,
    confirmedValue: 0,
  },
  locations: [],
  history: [],
  ...over,
});

describe("daily report summary — the day in words", () => {
  test("a normal trading day names the volume, the value and the busiest depot", () => {
    const { paragraphs } = buildDailySummary(
      data({
        totals: { orderCount: 4, qtyLitres: 190000, amountNaira: 242222500, openingStock: 1000000, closingStock: 810000, confirmedQty: 0, confirmedValue: 0, staffEntries: 1 },
        locations: [
          location({ name: "DANGOTE REFINERY", orderCount: 3, orderLitres: 145000, orderValue: 183497500, staffEntries: filedSheets(5) }),
          location({ name: "CALABAR DEPOT", orderCount: 1, orderLitres: 45000, orderValue: 58725000, staffEntries: filedSheets(5) }),
        ],
      })
    );

    // One statement per paragraph, in the agreed reporting register.
    assert.equal(
      paragraphs[0],
      "4 orders were received today, totaling 190,000 litres with a total value of " +
        "₦242,222,500, across 2 depots."
    );
    assert.equal(
      paragraphs[1],
      "DANGOTE REFINERY recorded the highest sales for the day at ₦183,497,500."
    );
    // "litres" is lower-case in prose even though the table columns capitalise it.
    assert.doesNotMatch(paragraphs.join(" "), /Litres/);
  });

  test("a single order reads as one, not as 1 orders", () => {
    const { paragraphs } = buildDailySummary(
      data({
        totals: { orderCount: 1, qtyLitres: 5000, amountNaira: 6000000, openingStock: 0, closingStock: 0, confirmedQty: 0, confirmedValue: 0, staffEntries: 0 },
        locations: [location({ orderCount: 1, orderLitres: 5000, orderValue: 6000000 })],
      })
    );
    assert.match(paragraphs[0], /^1 order was received today/);
    assert.match(paragraphs[0], /across 1 depot\./);
  });

  test("a day with no orders says so instead of dividing by zero", () => {
    const { paragraphs } = buildDailySummary(
      data({ history: [{ date: "2026-09-03", orderCount: 6, qtyLitres: 300000, amountNaira: 12000 }] })
    );
    assert.equal(paragraphs[0], "No orders were received today.");
    // No stock, so no stock statement, and no money statement either.
    assert.equal(paragraphs.length, 1);
  });

  test("the first day ever has nothing to compare against and does not pretend otherwise", () => {
    const { paragraphs } = buildDailySummary(
      data({
        totals: { orderCount: 2, qtyLitres: 50000, amountNaira: 60000000, openingStock: 0, closingStock: 0, confirmedQty: 0, confirmedValue: 0, staffEntries: 0 },
        locations: [location({ orderCount: 2, orderLitres: 50000, orderValue: 60000000 })],
        history: [],
      })
    );
    assert.doesNotMatch(paragraphs.join(" "), /yesterday/);
    assert.doesNotMatch(paragraphs.join(" "), /NaN|Infinity|undefined/);
  });

  test("revenue against yesterday reads as a direction, not a ratio", () => {
    const withYesterday = (todayValue, yesterdayValue) =>
      buildDailySummary(
        data({
          totals: { orderCount: 1, qtyLitres: 1, amountNaira: todayValue, openingStock: 0, closingStock: 0, confirmedQty: 0, confirmedValue: 0, staffEntries: 0 },
          locations: [location({ orderCount: 1, orderLitres: 1, orderValue: todayValue })],
          history: [{ date: "2026-09-03", orderCount: 9, qtyLitres: 1, amountNaira: yesterdayValue }],
        })
      ).paragraphs.join(" ");

    assert.match(withYesterday(136, 100), /Total revenue increased by 36% compared with yesterday's ₦100\./);
    assert.match(withYesterday(60, 100), /Total revenue decreased by 40% compared with yesterday's ₦100\./);
    assert.match(withYesterday(100, 100), /Total revenue was largely unchanged compared with yesterday's ₦100\./);
  });

  test("a depot whose NAME contains a comma gets its own remark line", () => {
    // "LIQUID BULK DEPOT, PORT HARCOURT" is one depot. Keying remarks by depot
    // rather than joining names into a sentence makes the comma harmless.
    const { remarks } = buildDailySummary(
      data({
        locations: [
          location({ name: "LIQUID BULK DEPOT, PORT HARCOURT", stock: { opening: 10, closing: 9 }, staffEntries: [] }),
          location({ name: "TSL DEPOT", orderCount: 1, orderLitres: 1, orderValue: 1, staffEntries: filedSheets(5) }),
        ],
      })
    );
    assert.equal(remarks.length, 1);
    assert.equal(remarks[0].depot, "LIQUID BULK DEPOT, PORT HARCOURT");
    assert.match(remarks[0].note, /No report was submitted today\./);
  });

  test("remarks name the depot, and a clean depot gets no line", () => {
    const { remarks } = buildDailySummary(
      data({
        locations: [
          location({ name: "CALABAR DEPOT", orderCount: 1, orderLitres: 1, orderValue: 1, staffEntries: filedSheets(5) }),
          location({ name: "WARRI DEPOT", orderCount: 1, orderLitres: 1, orderValue: 1, staffEntries: [] }),
        ],
      })
    );
    assert.equal(remarks.length, 1, "only the depot with something to say appears");
    assert.equal(remarks[0].depot, "WARRI DEPOT");
    assert.equal(remarks[0].note, "No report was submitted today.");
  });

  test("several findings about one depot become one line", () => {
    const remarks = buildRemarks({
      locations: [
        {
          name: "CALABAR DEPOT",
          orderCount: 0,
          stock: { closing: 500 },
          staffEntries: [],
          pfiStock: [{ pfiNumber: "PFI/CAL/01", openingStock: 1000, closingStock: 50 }],
        },
      ],
    });
    assert.equal(remarks.length, 1, "one line per depot, however many findings");
    assert.match(remarks[0].note, /No report was submitted today\./);
    assert.match(remarks[0].note, /No orders were recorded, though stock is available\./);
    assert.match(remarks[0].note, /PFI\/CAL\/01 is nearly exhausted, with 50 litres remaining\./);
  });

  test("partial submissions agree with their number", () => {
    const one = buildRemarks({ locations: [{ name: "A", orderCount: 1, stock: { closing: 0 }, pfiStock: [], staffEntries: [{ entries: [{}] }] }] });
    const three = buildRemarks({ locations: [{ name: "A", orderCount: 1, stock: { closing: 0 }, pfiStock: [], staffEntries: [{ entries: [{}, {}, {}] }] }] });
    assert.equal(one[0].note, "Only 1 of 5 report was submitted.");
    assert.equal(three[0].note, "Only 3 of 5 reports were submitted.");
  });

  test("a clean day has no remarks at all, and no REMARKS heading", () => {
    const clean = data({
      totals: { orderCount: 2, qtyLitres: 50000, amountNaira: 60000000, openingStock: 500000, closingStock: 450000, confirmedQty: 50000, confirmedValue: 60000000, staffEntries: 5 },
      locations: [location({ orderCount: 2, orderLitres: 50000, orderValue: 60000000, stock: { opening: 500000, closing: 450000, confirmedQty: 50000, confirmedValue: 60000000 }, staffEntries: filedSheets(5) })],
    });
    assert.deepEqual(buildDailySummary(clean).remarks, []);
    // No REMARKS heading at all when there is nothing to remark on.
    assert.doesNotMatch(summaryText(clean), /REMARKS/);
    assert.match(summaryText(clean), /All of today's total sales of ₦60,000,000 has been confirmed\./);
  });

  test("the confirmation split always accounts for the whole", () => {
    const { paragraphs } = buildDailySummary(
      data({
        totals: { orderCount: 1, qtyLitres: 1, amountNaira: 5655706966, openingStock: 0, closingStock: 0, confirmedQty: 1, confirmedValue: 4495459966, staffEntries: 0 },
        locations: [location({ orderCount: 1, orderLitres: 1, orderValue: 5655706966 })],
      })
    );
    const money = paragraphs.find((p) => /confirmed/.test(p));
    assert.equal(
      money,
      "Of today's total sales of ₦5,655,706,966, ₦4,495,459,966 (79%) has been confirmed, " +
        "while ₦1,160,247,000 (21%) is yet to be confirmed."
    );
  });
});
