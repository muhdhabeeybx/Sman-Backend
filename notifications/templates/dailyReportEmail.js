const { escapeHtml } = require("./email");
const { buildDailySummary, summaryText } = require("./dailyReportSummary");

/**
 * The daily combined report email — the day's stock movement, what each desk
 * filed, and every order, one section per depot.
 *
 * `buildCombinedDailyReportData` (services/dailyCombinedReport.service.js)
 * supplies `d`; this file only renders it. Still bare markup with every style
 * inline and no <html>/<head>/<body> wrapper, because mail clients strip
 * <style> blocks and Gmail ignores classes — the constraint the original
 * Django port was written under, and it has not changed.
 *
 * ── Why the staff section is five tables and not one ───────────────────────
 *
 * It used to be a single 12-column table with fixed headers (Opening, Sold,
 * Trucks, Left Over, Amt Paid, Total Sales, Diff, Bank, Remarks) that every
 * role was forced through. The five daily reports do not share those fields:
 *
 *   * the gate sheet's `trucksEntered` had NO column at all, so "trucks
 *     entered" — half of what that desk exists to report — never appeared,
 *     while its `truckCount` (which means trucks EXITED for that role alone)
 *     showed under a heading reading "Trucks".
 *   * every commission figure — funds received, commission due, outstanding,
 *     funds remaining, customers, orders — was absent, and its `amountPaid`
 *     (which means commission paid) rendered under "Amt Paid" beside sales
 *     sheets where the same column means cash banked.
 *   * compliance's order count, price table, average price and top customers
 *     were all absent, so a filed compliance sheet showed a row of dashes.
 *   * the sales sheet's price bands, total inflow, yesterday's settlement and
 *     account number were absent.
 *
 * So each role now declares its own columns, in the same order and under the
 * same labels as the form that collects them and the Reports Hub that lists
 * them (see -report-config.ts in the dashboard). One table per role that
 * actually filed, and a role nobody filed says so in one line instead of
 * spending twelve columns saying nothing.
 */

/**
 * ── Black and white, with two colours that mean something ──────────────────
 *
 * The report used to be green throughout: green header rows, a green tint on
 * every key cell, green section labels, a green rule above each depot. Colour
 * that is everywhere carries no information — it was decoration, and it made
 * the figures harder to pick out rather than easier.
 *
 * So the document is ink on white, and colour is spent on the two things a
 * reader looks for first: what came IN — revenue and litres sold — in green,
 * and what is LEFT or STILL OWED — closing stock, balances, unpaid commission
 * — in red. Nothing else is coloured, which is what makes those two legible.
 */
const INK = "#1a1a1a";
const MUTED = "#6B7280";
/** Header rows: black ground, white type. */
const HEAD = "#1a1a1a";
const HEAD_KEY = "#000000";
/** The one tint left in the document, for the cells that anchor a row. */
const TINT = "#F5F5F5";
/** Money in, product moved. */
const CREDIT = "#15803D";
/** What is left standing: closing stock, balances, amounts not yet paid. */
const BALANCE = "#B91C1C";

/**
 * Cells carry attributes, not repeated style strings.
 *
 * Every `<td>` used to open with 72 bytes of identical inline CSS
 * (padding + border + colour + vertical-align). Over a day with ninety orders
 * and five staff tables per depot that alone came to ~90KB, and Gmail clips a
 * message at 102KB — the report would have been cut off mid-table, which is
 * the one failure a daily report cannot have.
 *
 * `cellpadding` and `align` are HTML attributes every mail client including
 * Outlook honours, so padding and alignment cost nothing per cell and only the
 * border remains in CSS. Colour is inherited from the wrapper. Same rendering,
 * roughly a third of the bytes.
 */
const TABLE =
  '<table width="100%" border="1" bordercolor="#CCCCCC" cellpadding="6" cellspacing="0" ' +
  'style="border-collapse:collapse;font-size:12px;">';
const TH_S = "background:" + HEAD + ";color:#fff;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.3px;";
// Opening and closing stock carry the report, so they are tinted: the eye
// finds the two ends of the day's movement without reading the headers.
const KEY_S = "background:" + TINT + ";font-weight:700;";
const TH_KEY_S = TH_S + "background:" + HEAD_KEY + ";";
/** The two meaning-carrying colours, as cell styles. */
const CREDIT_S = "color:" + CREDIT + ";font-weight:600;";
const BALANCE_S = "color:" + BALANCE + ";font-weight:600;";

/**
 * A plain cell carries no style attribute at all — the table's `border` and
 * `cellpadding` attributes draw it. Only a cell that is tinted, totalled or
 * spanned pays for CSS, and those are a handful per table rather than every
 * cell in it.
 */
const cell = (html, { r = false, s = "", span = 0 } = {}) =>
  `<td${r ? ' align="right"' : ""}${span ? ` colspan="${span}"` : ""}${s ? ` style="${s}"` : ""}>${html}</td>`;

const hcell = (label, { r = false, s = "" } = {}) =>
  `<th${r ? ' align="right"' : ""} style="${s || TH_S}">${escapeHtml(label)}</th>`;

/** "₦1,504,000" — same rule, with the naira sign. */
const m = (val) => {
  const f = Number(val);
  if (!Number.isFinite(f) || f === 0) return "—";
  return `₦${f.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
};

/** Plain {:,.0f}-style formatting for stock figures, which print 0 rather than —. */
const n0 = (val) => Number(val || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });

const ORDINALS = { 1: "st", 2: "nd", 3: "rd" };
function ordinalDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDate();
  const suffix = ORDINALS[day % 10] && !(day % 100 >= 11 && day % 100 <= 13) ? ORDINALS[day % 10] : "th";
  const month = d.toLocaleDateString("en-NG", { month: "long", timeZone: "UTC" });
  return `${day}${suffix} ${month} ${d.getUTCFullYear()}`;
}

function plainDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const plural = (count, singular, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

// ─── Field formatting ───────────────────────────────────────────────────────

/**
 * Null is not zero.
 *
 * The commission and gate figures are nullable with no default precisely so
 * that "nobody filled this in" stays distinguishable from "the answer is
 * zero" on a sheet somebody files in stages. A null renders as an em-dash; a
 * real 0 renders as 0.
 */
const FORMATTERS = {
  litres: (v, unit) => (v === null || v === undefined ? "—" : `${n0(v)} ${unitOf(unit)}`),
  money: (v) => (v === null || v === undefined ? "—" : `₦${n0(v)}`),
  rate: (v, unit) =>
    v === null || v === undefined || Number(v) === 0 ? "—" : `₦${n0(v)} per ${rateWord(unit)}`,
  count: (v) => (v === null || v === undefined ? "—" : n0(v)),
  text: (v) => escapeHtml(String(v ?? "")) || "—",
};

const NUMERIC_FORMATS = new Set(["litres", "money", "rate", "count"]);

const TONE_STYLE = { credit: CREDIT_S, balance: BALANCE_S };

/**
 * The unit, spelled out.
 *
 * These columns used to abbreviate to "L" to stay narrow. It read as
 * engineering shorthand rather than as a report — "300,000 L" is a gauge
 * reading, "300,000 Litres" is a sentence — so the word is written in full and
 * the table is simply allowed to be wider; it already scrolls on its own.
 * `pfis.product_unit` spells the same unit several ways, and an unrecognised
 * one passes through as written rather than being guessed at.
 */
const UNIT_LABEL = {
  l: "Litres",
  litres: "Litres",
  litre: "Litres",
  liters: "Litres",
  kilograms: "Kg",
  kilogram: "Kg",
  kg: "Kg",
  tonnes: "MT",
  mt: "MT",
};
const unitOf = (u) => UNIT_LABEL[String(u || "").toLowerCase()] || String(u || "Litres");

/**
 * The denominator in a rate: "₦1,200 per litre", not "₦1,200/Litres".
 * A rate reads as prose, so the unit goes singular and lower-case.
 */
const RATE_WORD = { Litres: "litre", Kg: "kg", MT: "MT" };
const rateWord = (u) => RATE_WORD[unitOf(u)] || unitOf(u).toLowerCase();

/**
 * What each desk reports, in the order its own form asks for it.
 *
 * Keys are the API's column names — the same ones the dashboard form posts and
 * the Reports Hub lists — so a field added to a form needs one line here and
 * nothing else. Labels match the form's labels, with the two that mean
 * different things per role spelled out: `truckCount` is "Trucks exited" on the
 * gate sheet and "Trucks sold/loaded" everywhere else, and `amountPaid` is
 * "Commission paid" on the commission sheet and cash banked elsewhere.
 *
 * `tone` is the only place colour is decided for these tables: "credit" for a
 * figure that means money in or product moved, "balance" for one that means
 * what is left standing or not yet paid. A field with no tone prints in ink,
 * which is most of them — that is the point.
 */
const ROLE_FIELDS = {
  security_gate: [
    { key: "trucksEntered", label: "Trucks entered", fmt: "count" },
    { key: "truckCount", label: "Trucks exited", fmt: "count" },
  ],
  sales_manager: [
    { key: "openingStock", label: "Opening balance", fmt: "litres" },
    { key: "litresSold", label: "Litres sold", fmt: "litres", tone: "credit" },
    { key: "avgPrice", label: "Avg price", fmt: "rate" },
    { key: "totalSalesAmount", label: "Total sales", fmt: "money", tone: "credit" },
    { key: "truckCount", label: "Trucks sold", fmt: "count" },
    { key: "amountPaid", label: "Amount paid", fmt: "money", tone: "credit" },
    { key: "totalInflow", label: "Total inflow", fmt: "money", tone: "credit" },
    { key: "differentials", label: "Differentials", fmt: "money" },
    { key: "yesterdayDeficitPayment", label: "Yest. deficit", fmt: "money" },
    { key: "yesterdaySurplusPayment", label: "Yest. surplus", fmt: "money" },
    { key: "bankName", label: "Bank", fmt: "text" },
    { key: "accountNumber", label: "Account no.", fmt: "text" },
  ],
  product_manager: [
    { key: "openingStock", label: "Opening (b/f)", fmt: "litres" },
    { key: "receivedStock", label: "Ordered today", fmt: "litres" },
    { key: "litresSold", label: "Loaded today", fmt: "litres", tone: "credit" },
    { key: "loadingLeftOver", label: "Loading left over", fmt: "litres" },
    { key: "tankBalance", label: "Tank balance", fmt: "litres", tone: "balance" },
    { key: "truckCount", label: "Trucks loaded", fmt: "count" },
    { key: "differentials", label: "Differentials", fmt: "money" },
  ],
  commissions: [
    { key: "fundsReceived", label: "Funds received", fmt: "money", tone: "credit" },
    { key: "litresSold", label: "Litres sold", fmt: "litres", tone: "credit" },
    { key: "truckCount", label: "Trucks sold", fmt: "count" },
    { key: "customerCount", label: "Customers", fmt: "count" },
    { key: "orderCount", label: "Orders", fmt: "count" },
    { key: "commissionDue", label: "Commission due", fmt: "money" },
    { key: "amountPaid", label: "Commission paid", fmt: "money", tone: "credit" },
    { key: "commissionOutstanding", label: "Not yet paid", fmt: "money", tone: "balance" },
    { key: "fundsRemaining", label: "Funds remaining", fmt: "money", tone: "balance" },
  ],
  it_compliance: [
    { key: "orderCount", label: "Orders", fmt: "count" },
    { key: "litresSold", label: "Litres ordered", fmt: "litres", tone: "credit" },
    { key: "avgPrice", label: "Avg price", fmt: "rate" },
    { key: "totalSalesAmount", label: "Total value", fmt: "money", tone: "credit" },
  ],
};

/** Which roles collect a price table, and which collect a customer list. */
const HAS_PRICE_BANDS = new Set(["sales_manager", "it_compliance"]);
const HAS_TOP_CUSTOMERS = new Set(["it_compliance"]);

// No approval badge beside the filer's name. The report says what each desk
// filed; whether a manager has since signed it off is a workflow state that
// belongs in the Reports Hub, and a green or red chip against a person's name
// in a document circulated to the whole company reads as a verdict on them.

// ─── The at-a-glance band ───────────────────────────────────────────────────

/**
 * The whole day in one strip, before any table.
 *
 * Built as a table rather than flex or grid: Outlook renders neither, and this
 * is the one block that has to survive every client intact.
 */
const TONE_COLOR = { credit: CREDIT, balance: BALANCE };

function summaryBand(cells) {
  const width = `${Math.floor(100 / cells.length)}%`;
  const tds = cells
    .map(
      (c) =>
        `<td width="${width}" style="background:${TINT};vertical-align:top;">` +
        `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${MUTED};">${escapeHtml(c.label)}</div>` +
        `<div style="font-size:15px;font-weight:700;color:${TONE_COLOR[c.tone] || INK};padding-top:2px;">${c.value}</div>` +
        (c.note ? `<div style="font-size:10px;color:${MUTED};padding-top:1px;">${escapeHtml(c.note)}</div>` : "") +
        `</td>`
    )
    .join("");
  return `${TABLE}<tr>${tds}</tr></table>`;
}

// ─── PFI stock and sales ────────────────────────────────────────────────────

const STOCK_HEADERS = [
  { label: "PFI" },
  { label: "Product" },
  { label: "Opening stock", key: true },
  { label: "Ordered", r: true },
  { label: "Sales value", r: true },
  { label: "Confirmed", r: true },
  { label: "Amount confirmed", r: true },
  { label: "Avg rate", r: true },
  { label: "Closing stock", key: true },
  { label: "Total revenue", r: true },
];

/**
 * The day's trading against each batch, with opening and closing stock either
 * side of it.
 *
 * There is deliberately no "moved today" column. It was the difference between
 * the two stock figures and so said nothing that "Ordered" does not already
 * say — it only gave the reader a third number to reconcile. Opening minus
 * Ordered is Closing, and both sides come from the same attribution, so the row
 * checks out straight across.
 */
function stockTable(pfiStock) {
  if (pfiStock.length === 0) {
    return `<p style="color:${MUTED};margin:4px 0;">No active PFI at this location.</p>`;
  }

  const header = STOCK_HEADERS.map((h) =>
    hcell(h.label, { r: h.key || h.r, s: h.key ? TH_KEY_S : "" })
  ).join("");

  const rows = pfiStock
    .map((r) => {
      const u = escapeHtml(unitOf(r.unit));
      return (
        "<tr>" +
        cell(escapeHtml(r.pfiNumber)) +
        cell(escapeHtml(r.productName) || "—", { s: `color:${MUTED};` }) +
        cell(`${n0(r.openingStock)} ${u}`, { r: true, s: KEY_S }) +
        cell(r.orderedQty ? `${n0(r.orderedQty)} ${u}` : "—", { r: true, s: CREDIT_S }) +
        cell(m(r.orderedValue), { r: true, s: CREDIT_S }) +
        cell(r.confirmedQty ? `${n0(r.confirmedQty)} ${u}` : "—", { r: true, s: CREDIT_S }) +
        cell(m(r.confirmedValue), { r: true, s: CREDIT_S }) +
        cell(r.avgRate ? `₦${n0(r.avgRate)} per ${rateWord(r.unit)}` : "—", { r: true }) +
        cell(`${n0(r.closingStock)} ${u}`, { r: true, s: KEY_S + BALANCE_S }) +
        cell(m(r.totalRevenue), { r: true, s: CREDIT_S }) +
        "</tr>"
      );
    })
    .join("");

  // No "All PFIs" total row, however many batches a location is running.
  //
  // A PFI is a separate purchase at its own rate, often of a different product;
  // summing them produced a line whose stock figures were real but whose "avg
  // rate" was an average of unrelated prices, and whose only honest reading was
  // "these numbers happen to be in the same table". Each row stands on its own,
  // and the location's real totals are already in the band above.
  return `<div style="overflow-x:auto;">${TABLE}<thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Staff entries, one table per role ──────────────────────────────────────

/**
 * Prices, the customer list and remarks are COLUMNS, not notes under the row.
 *
 * They used to render as a second full-width row beneath each entry, each
 * prefixed with its own little "Prices:" / "Top customers:" / "Remarks:"
 * label — three lines of hint text per sheet filed. Across five roles and
 * several PFIs that becomes most of the section, and a reader following a
 * column of figures has to step over prose to reach the next number.
 *
 * As columns they line up with everything else, and a reader who does not want
 * them can look past them — which is the whole reason a column exists.
 *
 * A column only appears when at least one sheet in that table actually filled
 * it in: an empty "Top customers" column on every compliance table is the same
 * noise wearing a different hat.
 */
const priceBandsText = (bands) =>
  (bands || []).map((b) => `${n0(b.litres)} Litres @ ₦${n0(b.price)}`).join("<br>");

const topCustomersText = (list) =>
  (list || []).map((c) => `${escapeHtml(c.name) || "—"} &mdash; ${n0(c.litres)} Litres`).join("<br>");

/** An array with something in it, or a string that is not just whitespace. */
const filled = (v) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "");

const EXTRA_COLUMNS = [
  { key: "priceBands", label: "Prices", roles: HAS_PRICE_BANDS, render: priceBandsText },
  { key: "topCustomers", label: "Top customers", roles: HAS_TOP_CUSTOMERS, render: topCustomersText },
  // Every role can leave a remark, so this one is not restricted by role.
  { key: "remarks", label: "Remarks", roles: null, render: (v) => escapeHtml(String(v)) },
];

function roleTable({ role, type, entries }) {
  const fields = ROLE_FIELDS[type] || [];

  if (entries.length === 0) {
    return (
      `<p style="margin:12px 0 0;color:${MUTED};font-size:12px;">` +
      `<span style="font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${INK};">${escapeHtml(role)}</span>` +
      ` &nbsp;—&nbsp; not filed today.</p>`
    );
  }

  const extraCols = EXTRA_COLUMNS.filter(
    (c) => (!c.roles || c.roles.has(type)) && entries.some((e) => filled(e[c.key]))
  );

  const header =
    hcell("PFI") +
    hcell("Filed by") +
    fields.map((f) => hcell(f.label, { r: NUMERIC_FORMATS.has(f.fmt) })).join("") +
    extraCols.map((c) => hcell(c.label)).join("");

  const rows = entries
    .map((e) => {
      const cells = fields
        .map((f) => {
          const fmt = FORMATTERS[f.fmt] || FORMATTERS.text;
          const value = fmt(e[f.key], e.unit);
          // An em-dash means "not filled in" and is not a figure, so it never
          // takes a colour — a red dash reads as a problem where there is none.
          const tone = f.tone && value !== "—" ? TONE_STYLE[f.tone] : "";
          return cell(value, { r: NUMERIC_FORMATS.has(f.fmt), s: tone });
        })
        .join("");

      const extras = extraCols
        .map((c) => cell(filled(e[c.key]) ? c.render(e[c.key]) : "—"))
        .join("");

      return (
        "<tr>" +
        cell(escapeHtml(e.pfiNumber) || "—") +
        cell(escapeHtml(e.submittedBy) || "—") +
        cells +
        extras +
        "</tr>"
      );
    })
    .join("");

  return (
    `<p style="margin:16px 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${INK};font-size:12px;">` +
    `${escapeHtml(role)} <span style="color:${MUTED};font-weight:400;text-transform:none;letter-spacing:0;">` +
    `— ${plural(entries.length, "sheet")}</span></p>` +
    `<div style="overflow-x:auto;">${TABLE}<thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

// ─── Orders ─────────────────────────────────────────────────────────────────

const ORDER_HEADERS = ["Reference", "Customer", "Product", "Quantity", "Rate", "Amount", "Status"];
const ORDER_NUMERIC = new Set([3, 4, 5]);

function ordersTable(orders, total) {
  if (orders.length === 0) {
    return `<p style="color:${MUTED};margin:4px 0;">No orders today.</p>`;
  }
  // Say so when the list is trimmed, rather than letting the reader count the
  // rows and believe that was the whole day. Kept to one short line: it is the
  // only note in the section, and it changes how the table is read.
  const trimmed =
    total > orders.length
      ? `<p style="margin:4px 0 0;color:${MUTED};font-size:11px;">` +
        `Showing ${n0(orders.length)} of ${n0(total)} orders. The figures above cover all ${n0(total)}.</p>`
      : "";
  const header = ORDER_HEADERS.map((label, i) => hcell(label, { r: ORDER_NUMERIC.has(i) })).join("");
  const rows = orders
    .map((o) => {
      const cells = [
        escapeHtml(o.reference),
        escapeHtml(o.customer) || "—",
        escapeHtml(o.product) || "—",
        `${n0(o.quantity)} ${unitOf(o.unit)}`,
        o.rate ? `₦${n0(o.rate)} per ${rateWord(o.unit)}` : "—",
        o.amount ? `₦${n0(o.amount)}` : "—",
        escapeHtml(o.status),
      ];
      return "<tr>" + cells.map((c, i) => cell(c, { r: ORDER_NUMERIC.has(i) })).join("") + "</tr>";
    })
    .join("");
  return `<div style="overflow-x:auto;">${TABLE}<thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>${trimmed}`;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

const SECTION_LABEL = `margin:22px 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${INK};font-size:12px;`;

function locationSection(loc) {
  const filed = loc.staffEntries.reduce((count, s) => count + s.entries.length, 0);

  return (
    `<div style='margin-top:26px;padding:0 0 4px;border-top:2px solid ${INK};'>` +
    `<h3 style='margin:12px 0 2px;font-size:15px;color:${INK};'>${escapeHtml(loc.name)}</h3>` +
    summaryBand([
      { label: "Opening stock", value: `${n0(loc.stock.opening)} Litres` },
      // The quantity is the headline; the order count is the footnote. It was
      // the other way round, so the biggest figure in the cell was "12" — a
      // number nobody trades on — while the litres sat underneath in grey.
      {
        label: "Ordered",
        value: `${n0(loc.orderLitres)} Litres`,
        note: plural(loc.orderCount, "order"),
        tone: "credit",
      },
      { label: "Sales value", value: m(loc.orderValue), tone: "credit" },
      {
        label: "Confirmed",
        value: `${n0(loc.stock.confirmedQty)} Litres`,
        note: m(loc.stock.confirmedValue),
        tone: "credit",
      },
      { label: "Closing stock", value: `${n0(loc.stock.closing)} Litres`, tone: "balance" },
      { label: "Sheets filed", value: `${filed} of 5` },
    ]) +
    `<p style='${SECTION_LABEL}'>PFI stock &amp; sales</p>` +
    stockTable(loc.pfiStock) +
    `<p style='${SECTION_LABEL}'>Staff entries</p>` +
    loc.staffEntries.map(roleTable).join("") +
    `<p style='${SECTION_LABEL}'>Orders</p>` +
    ordersTable(loc.orders, loc.orderCount) +
    `</div>`
  );
}

function combinedReportBody(d) {
  const locations = d.locations || [];
  if (locations.length === 0) {
    return "<p>No active locations.</p>";
  }
  const {
    staffEntries = 0,
    orderCount = 0,
    qtyLitres = 0,
    amountNaira = 0,
    openingStock = 0,
    closingStock = 0,
    confirmedQty = 0,
    confirmedValue = 0,
  } = d.totals || {};

  const { paragraphs, remarks } = buildDailySummary(d);

  /**
   * The day in words, above the numbers.
   *
   * Deliberately the first thing in the document and deliberately not a table:
   * somebody opening this at midnight should read five short statements, know
   * how the day went, and stop. The tables are there for when the answer is
   * "look closer".
   *
   * One statement per paragraph rather than a packed block — the confirmed
   * figure is the one people hunt for, and it should sit on its own line.
   *
   * REMARKS renders only when there is something to remark on. An empty
   * section heading reads as a section that failed to load.
   */
  const summaryBlock =
    `<div style="margin:14px 0 4px;padding:14px 16px;background:${TINT};border-left:3px solid ${INK};">` +
    paragraphs
      .map(
        (para) =>
          `<p style="margin:0 0 10px;font-size:13px;line-height:1.55;color:${INK};">${escapeHtml(para)}</p>`
      )
      .join("") +
    (remarks.length
      ? `<p style="margin:14px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;` +
        `letter-spacing:.6px;color:${BALANCE};">Remarks</p>` +
        remarks
          .map(
            (r) =>
              `<p style="margin:0 0 4px;font-size:12.5px;line-height:1.5;color:${INK};">` +
              `<span style="font-weight:700;">${escapeHtml(r.depot)}:</span> ${escapeHtml(r.note)}</p>`
          )
          .join("")
      : "") +
    `</div>`;

  const header =
    `<h2 style='margin:0 0 2px;font-size:18px;color:${INK};'>Daily Report &mdash; ${plainDate(d.reportDate)}</h2>` +
    `<p style='margin:0 0 4px;color:${MUTED};font-size:12px;'>` +
    `${plural(locations.length, "location")} &nbsp;&bull;&nbsp; ` +
    `${plural(staffEntries, "sheet")} filed</p>` +
    // Words before figures: the summary leads, the at-a-glance band follows it,
    // and the tables come after both.
    summaryBlock +
    summaryBand([
      { label: "Opening stock", value: `${n0(openingStock)} Litres` },
      {
        label: "Ordered",
        value: `${n0(qtyLitres)} Litres`,
        note: plural(orderCount, "order"),
        tone: "credit",
      },
      { label: "Sales value", value: m(amountNaira), tone: "credit" },
      { label: "Confirmed", value: `${n0(confirmedQty)} Litres`, note: m(confirmedValue), tone: "credit" },
      { label: "Closing stock", value: `${n0(closingStock)} Litres`, tone: "balance" },
    ]);

  return header + locations.map(locationSection).join("");
}

function renderDailyReportEmail(d) {
  const subjectDate = ordinalDate(d.reportDate);
  const subject = `Daily Report - ${subjectDate}`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${INK};">` +
    `<p>Dear Sir,</p>` +
    combinedReportBody(d) +
    `<p style="margin-top:26px;">Best regards,<br/>Soroman System</p>` +
    `</div>`;

  const {
    orderCount = 0,
    qtyLitres = 0,
    amountNaira = 0,
    openingStock = 0,
    closingStock = 0,
    confirmedQty = 0,
    confirmedValue = 0,
    staffEntries = 0,
  } = d.totals || {};

  /**
   * The plain-text alternative, which used to be three numbers.
   *
   * It is what a text-only client, a watch and most screen readers actually
   * render, and "orders=33" told none of them what the day was. Every figure
   * the summary band shows is here in the same order.
   */
  const text =
    `Dear Sir,\n\n` +
    `Daily Report for ${subjectDate}\n\n` +
    // The same summary the HTML leads with. A text-only client should get the
    // day in words too — it is the part that survives having no layout at all.
    `${summaryText(d)}\n\n` +
    `Opening stock: ${n0(openingStock)} Litres\n` +
    `Ordered:       ${n0(qtyLitres)} Litres, ${plural(orderCount, "order")}\n` +
    `Sales value:   ${n0(amountNaira)}\n` +
    `Confirmed:     ${n0(confirmedQty)} Litres, ${n0(confirmedValue)}\n` +
    `Closing stock: ${n0(closingStock)} Litres\n` +
    `Sheets filed:  ${n0(staffEntries)}\n\n` +
    (d.locations || [])
      .map(
        (loc) =>
          `${loc.name}\n` +
          `  opening ${n0(loc.stock.opening)} Litres / ordered ${n0(loc.stock.orderedQty)} Litres / ` +
          `confirmed ${n0(loc.stock.confirmedQty)} Litres / closing ${n0(loc.stock.closing)} Litres\n` +
          `  ${plural(loc.orderCount, "order")}, ` +
          `${plural(loc.staffEntries.reduce((c, s) => c + s.entries.length, 0), "sheet")} filed`
      )
      .join("\n") +
    `\n\nBest regards,\nSoroman System`;

  return { subject, html, text };
}

module.exports = { renderDailyReportEmail, ROLE_FIELDS };
