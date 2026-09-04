// Needed only so requiring the service (for createDepotMatcher) can construct
// its client — the matcher is pure and no query is ever made.
require("dotenv").config();

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { renderDailyReportEmail, ROLE_FIELDS } = require("../notifications/templates/dailyReportEmail");
const { createDepotMatcher } = require("../services/dailyCombinedReport.service");

/**
 * What the daily report email actually says.
 *
 * The template is a pure function of the data builder's output, so this needs
 * no database — which is the point: the failures being pinned here were all
 * silent omissions, and a rendering test is the only thing that catches copy
 * that never appears.
 *
 * Every case below is a field that WAS collected, stored, and then dropped on
 * the floor by a single twelve-column table that every one of the five report
 * types was forced through.
 */

const entry = (over = {}) => ({
  submittedBy: "Test Filer",
  status: "submitted",
  pfiNumber: "PFI/TEST/01",
  productName: "Petrol",
  carriedOverLoading: 0,
  openingStock: 0,
  receivedStock: 0,
  litresSold: 0,
  tankBalance: 0,
  loadingLeftOver: 0,
  priceBands: [],
  avgPrice: 0,
  totalSalesAmount: 0,
  amountPaid: 0,
  differentials: 0,
  truckCount: 0,
  trucksEntered: null,
  yesterdayDeficitPayment: 0,
  yesterdaySurplusPayment: 0,
  totalInflow: 0,
  fundsReceived: null,
  commissionDue: null,
  commissionOutstanding: null,
  fundsRemaining: null,
  customerCount: null,
  orderCount: null,
  rates: "",
  topCustomers: [],
  bankName: "",
  accountNumber: "",
  remarks: "",
  ...over,
});

const ROLES = [
  ["SALES_MANAGER", "sales_manager"],
  ["PRODUCT_MANAGER", "product_manager"],
  ["SECURITY", "security_gate"],
  ["COMMISSIONS", "commissions"],
  ["IT_COMPLIANCE", "it_compliance"],
];

const staffEntries = (byType = {}) =>
  ROLES.map(([role, type]) => ({ role, type, entries: byType[type] || [] }));

const location = (over = {}) => ({
  name: "TEST DEPOT",
  staffEntries: staffEntries(),
  pfiStock: [],
  orders: [],
  orderCount: 0,
  orderLitres: 0,
  orderValue: 0,
  stock: {
    opening: 0,
    closing: 0,
    orderedQty: 0,
    orderedValue: 0,
    confirmedQty: 0,
    confirmedValue: 0,
  },
  ...over,
});

const build = (locations) => ({
  reportDate: "2026-09-02",
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
  locations,
});

describe("daily report email — every desk's own figures", () => {
  test("the gate sheet reports trucks entered AND exited", () => {
    // The headline omission: `trucksEntered` had no column anywhere, so half of
    // what the gate desk exists to report never left the database, while its
    // `truckCount` — which means EXITED for this role alone — showed under a
    // heading reading "Trucks".
    const { html } = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            security_gate: [entry({ trucksEntered: 31, truckCount: 28 })],
          }),
        }),
      ])
    );

    assert.match(html, /Trucks entered/);
    assert.match(html, /Trucks exited/);
    assert.match(html, />31</);
    assert.match(html, />28</);
  });

  test("a zero is reported, and an unanswered field is not reported as zero", () => {
    // Both are nullable with no default precisely so the difference survives.
    const { html } = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            security_gate: [entry({ trucksEntered: 0, truckCount: 12 })],
          }),
        }),
      ])
    );
    assert.match(html, />0</, "a real zero must render as 0");

    const unanswered = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            security_gate: [entry({ trucksEntered: null, truckCount: 12 })],
          }),
        }),
      ])
    ).html;
    assert.match(unanswered, />—</, "an unanswered field must render as a dash, not 0");
  });

  test("every commission figure reaches the page", () => {
    const { html } = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            commissions: [
              entry({
                fundsReceived: 4500000,
                commissionDue: 300000,
                amountPaid: 120000,
                commissionOutstanding: 180000,
                fundsRemaining: 4380000,
                customerCount: 7,
                orderCount: 9,
              }),
            ],
          }),
        }),
      ])
    );

    for (const figure of ["4,500,000", "300,000", "120,000", "180,000", "4,380,000"]) {
      assert.ok(html.includes(figure), `${figure} is missing from the commission table`);
    }
    assert.match(html, /Funds remaining/);
    assert.match(html, /Not yet paid/);
  });

  test("the price table and top customers are rendered, not summarised away", () => {
    const { html } = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            it_compliance: [
              entry({
                orderCount: 4,
                priceBands: [{ price: 1200, litres: 45000 }, { price: 1250, litres: 15000 }],
                topCustomers: [{ name: "Acme Fuels", phone: "", litres: 30000 }],
              }),
            ],
          }),
        }),
      ])
    );

    assert.match(html, /45,000 Litres @ ₦1,200/);
    assert.match(html, /15,000 Litres @ ₦1,250/);
    assert.match(html, /Acme Fuels/);

    // They are COLUMNS now, not hint lines under the row: the price table and
    // the customer list each get a heading, so a reader scanning the figures
    // can look past them instead of stepping over them.
    assert.match(html, /<th[^>]*>Prices<\/th>/, "Prices should be its own column");
    assert.match(html, /<th[^>]*>Top customers<\/th>/, "Top customers should be its own column");
  });

  test("a role nobody filed says so once instead of a row of dashes", () => {
    const { html } = renderDailyReportEmail(build([location()]));
    const notFiled = html.match(/not filed today/g) || [];
    assert.equal(notFiled.length, 5, "all five roles should report that they were not filed");
  });

  test("two sheets for one role are both shown", () => {
    // A depot running several PFIs files one sales sheet per batch. These used
    // to collide in a Map keyed by report type, and every sheet but the last
    // was dropped without trace.
    const { html } = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            sales_manager: [
              entry({ submittedBy: "Filer One", pfiNumber: "PFI/A" }),
              entry({ submittedBy: "Filer Two", pfiNumber: "PFI/B" }),
            ],
          }),
        }),
      ])
    );

    assert.match(html, /Filer One/);
    assert.match(html, /Filer Two/);
    assert.match(html, /2 sheets/);
  });

  test("the filer's name carries no approval badge", () => {
    // The report says what each desk filed. Whether a manager has since signed
    // that sheet off is a workflow state that belongs in the Reports Hub — a
    // green or red chip against a person's name, in a document that goes to
    // the whole company, reads as a verdict on the person.
    const { html } = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            sales_manager: [entry({ submittedBy: "Filer One", status: "approved" })],
            product_manager: [entry({ submittedBy: "Filer Two", status: "rejected" })],
          }),
        }),
      ])
    );

    assert.match(html, /Filer One/);
    assert.match(html, /Filer Two/);
    assert.ok(!/APPROVED|>approved</i.test(html), "no approved badge");
    assert.ok(!/REJECTED|>rejected</i.test(html), "no rejected badge");
  });

  test("a column only appears when a sheet in that table filled it in", () => {
    // Prices, top customers and remarks are columns now. An empty "Top
    // customers" column on every compliance table is the same noise the hint
    // lines were, just in a different shape.
    const { html } = renderDailyReportEmail(
      build([
        location({
          staffEntries: staffEntries({
            product_manager: [entry({ submittedBy: "Filer One", remarks: "Pump 3 down." })],
            security_gate: [entry({ submittedBy: "Filer Two", remarks: "" })],
          }),
        }),
      ])
    );

    assert.match(html, /<th[^>]*>Remarks<\/th>/, "the sheet with a remark gets the column");
    assert.match(html, /Pump 3 down\./);
    // The gate sheet filed no remark, so its table has three columns, not four.
    const gateTable = html.slice(html.indexOf("SECURITY"));
    assert.ok(!/<th[^>]*>Remarks<\/th>/.test(gateTable), "no empty Remarks column");
  });
});

describe("daily report email — stock and orders", () => {
  test("the row reads opening, ordered, confirmed, closing — and reconciles", () => {
    const { html } = renderDailyReportEmail(
      build([
        location({
          stock: {
            opening: 26855679,
            closing: 23460685,
            orderedQty: 3394994,
            orderedValue: 4295827414,
            confirmedQty: 2884994,
            confirmedValue: 3650077414,
          },
          pfiStock: [
            {
              pfiNumber: "PFI 37/26",
              productName: "Petrol",
              unit: "Litres",
              allocation: 33846677,
              openingStock: 26855679,
              closingStock: 23460685,
              orderedQty: 3394994,
              orderedValue: 4295827414,
              confirmedQty: 2884994,
              confirmedValue: 3650077414,
              avgRate: 1265,
              totalRevenue: 13056681023,
            },
          ],
        }),
      ])
    );

    for (const label of ["Opening stock", "Ordered", "Sales value", "Confirmed", "Amount confirmed", "Avg rate", "Closing stock"]) {
      assert.ok(html.includes(label), `the "${label}" column is missing`);
    }
    assert.ok(html.includes("26,855,679"), "opening stock is missing");
    assert.ok(html.includes("23,460,685"), "closing stock is missing");
    assert.ok(html.includes("₦1,265 per litre"), "the average rate is missing");

    // Opening − Ordered = Closing. Both sides are attributed the same way, so
    // this holds on every row and the reader can check it straight across.
    assert.equal(26855679 - 3394994, 23460685);

    // No movement column: it was the difference between two figures already on
    // the row, and gave the reader a third number to reconcile.
    assert.ok(!/Moved today/i.test(html), "the movement column should be gone");

    // The unit is spelled out. It was abbreviated to "L" to keep the columns
    // narrow, and read as a gauge reading rather than as a report.
    assert.ok(html.includes("26,855,679 Litres"), "the unit should be spelled out");
    assert.ok(!/26,855,679 L</.test(html), "the abbreviated unit should be gone");

    // No "All PFIs" total row, however many batches a location runs: a PFI is
    // a separate purchase at its own rate, so the summed row's "avg rate" was
    // an average of unrelated prices.
    assert.ok(!html.includes("All PFIs"), "the PFI totals row should be gone");
  });

  test("a trimmed order list says so, and the totals still cover every order", () => {
    const orders = Array.from({ length: 60 }, (_, i) => ({
      reference: `AS${1000 + i}`,
      customer: "Someone",
      product: "Petrol",
      quantity: 1000,
      rate: 900,
      amount: 900000,
      status: "Paid",
    }));

    const { html } = renderDailyReportEmail(
      build([
        location({
          orders,
          orderCount: 87, // 27 more than the table lists
          orderLitres: 87000,
          orderValue: 78300000,
        }),
      ])
    );

    assert.match(html, /Showing 60 of 87 orders/);
    // The summary band must show the true count, not the listed one — reading
    // the totals off the capped list understated 2 September by 30 orders.
    // The litres are the headline figure and the count is the note beneath.
    assert.ok(html.includes(">87,000 Litres<"), "the ordered quantity should lead the cell");
    assert.ok(html.includes(">87 orders<"), "the true order count is missing from the summary");
  });

  test("the plain-text alternative carries the day, not three numbers", () => {
    const { text, subject } = renderDailyReportEmail(
      build([
        location({
          stock: {
            opening: 100,
            closing: 60,
            orderedQty: 40,
            orderedValue: 36000,
            confirmedQty: 25,
            confirmedValue: 22500,
          },
          orderCount: 3,
        }),
      ])
    );

    assert.equal(subject, "Daily Report - 2nd September 2026");
    assert.match(text, /Opening stock/);
    assert.match(text, /Ordered/);
    assert.match(text, /Confirmed/);
    assert.match(text, /Closing stock/);
    assert.match(text, /TEST DEPOT/);
    assert.ok(!/Moved today/i.test(text), "the movement line should be gone");
  });
});

/**
 * Which depot a filed sheet belongs to.
 *
 * `daily_reports.location` is free text with no depot list behind it, so the
 * live data holds four spellings of one Warri site. The old substring rule
 * matched only the spellings that contained a depot's name verbatim, and every
 * other spelling became its own section — the report showed "KEONAMEX PET
 * WARRI" as though it were a depot of its own, next to the real one.
 *
 * The depot names and location strings below are the live ones.
 */
describe("depot matching — one site, however it was typed", () => {
  const DEPOTS = [
    { id: 49, name: "AIPEC Depot Lagos" },
    { id: 50, name: "Avidor Depot Port Harcourt" },
    { id: 39, name: "Coconut/Ibafon — Lagos" },
    { id: 48, name: "Dangote Lagos — Soroman Ticket" },
    { id: 38, name: "Dangote Refinery" },
    { id: 47, name: "Keonamex Depot Warri" },
    { id: 44, name: "Liquid Bulk Depot, Port Harcourt" },
    { id: 42, name: "Oghara Soroman Depot" },
    { id: 46, name: "Pinnacle Lekki — Lagos" },
    { id: 40, name: "Satellite City — Lagos" },
    { id: 43, name: "Soroman Depot Calabar" },
    { id: 41, name: "Soroman Warri — Pinnacle Depot" },
    { id: 51, name: "TSL Depot Port Harcourt" },
  ];
  const match = createDepotMatcher(DEPOTS);
  const idFor = (text) => match(text)?.id ?? null;

  test("every spelling of the Warri site lands on the same depot", () => {
    // "KEONAMEX PET WARRI" is the one that produced a phantom location.
    for (const typed of [
      "Keonamex Depot Warri",
      "KEONAMEX DEPOT WARRI",
      "KEONAMEX PET WARRI",
      "Soroman Warri — Keonamex Depot",
    ]) {
      assert.equal(idFor(typed), 47, `"${typed}" should match Keonamex Depot Warri`);
    }
  });

  test("the other re-orderings in the live data match too", () => {
    assert.equal(idFor("Calabar Soroman Depot"), 43);
    assert.equal(idFor("Port Harcourt — Liquid Bulk"), 44);
    assert.equal(idFor("Port Harcourt — Avidor Depot"), 50);
    assert.equal(idFor("Port Harcourt - TSL Depot"), 51);
    assert.equal(idFor("TSL Depot Port Harcourt"), 51);
    assert.equal(idFor("Lagos - Aipec Depot"), 49);
  });

  test("depots sharing a city are still told apart", () => {
    // These three share "port" and "harcourt"; only the distinctive word counts.
    assert.notEqual(idFor("Port Harcourt — Avidor Depot"), idFor("Port Harcourt — Liquid Bulk"));
    assert.notEqual(idFor("Port Harcourt — Avidor Depot"), idFor("Port Harcourt - TSL Depot"));
  });

  test("a location naming no depot is not forced onto one", () => {
    // Better an honest section under what was typed than a sheet filed
    // silently against the wrong site.
    assert.equal(idFor("Company-wide"), null);
    assert.equal(idFor(""), null);
    assert.equal(idFor(null), null);
    // "warri" belongs to two depots and "pms"/"bora" to none, so this PFI
    // number typed into the location box stays unmatched.
    assert.equal(idFor("PFI, 27/26/PMS/MT BORA/ WARRI"), null);
  });

  test("a text naming two different depots stays unmatched", () => {
    assert.equal(idFor("Keonamex Warri and Avidor Port Harcourt"), null);
  });
});

describe("daily report email — the role field map", () => {
  test("every report type declares its columns", () => {
    for (const [, type] of ROLES) {
      assert.ok(Array.isArray(ROLE_FIELDS[type]), `${type} has no column set`);
      assert.ok(ROLE_FIELDS[type].length > 0, `${type} declares no columns`);
    }
  });

  test("the two columns that mean different things per role are labelled per role", () => {
    // truckCount is "Trucks exited" on the gate sheet and trucks sold/loaded
    // everywhere else; amountPaid is commission paid on the commission sheet
    // and cash banked elsewhere. Sharing one header is what made the old table
    // quietly wrong rather than merely incomplete.
    const labelOf = (type, key) => ROLE_FIELDS[type].find((f) => f.key === key)?.label;

    assert.equal(labelOf("security_gate", "truckCount"), "Trucks exited");
    assert.equal(labelOf("sales_manager", "truckCount"), "Trucks sold");
    assert.equal(labelOf("product_manager", "truckCount"), "Trucks loaded");
    assert.equal(labelOf("commissions", "amountPaid"), "Commission paid");
    assert.equal(labelOf("sales_manager", "amountPaid"), "Amount paid");
  });
});
