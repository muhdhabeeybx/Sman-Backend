const { escapeHtml } = require("./email");

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

const GREEN = "#1E5F3A";
const GREEN_SOFT = "#F1F6F3";
const BORDER = "#CCCCCC";
const MUTED = "#6B7280";
const INK = "#1a1a1a";

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
const TH_S = "background:" + GREEN + ";color:#fff;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.3px;";
// Opening and closing stock carry the report, so they are tinted: the eye
// finds the two ends of the day's movement without reading the headers.
const KEY_S = "background:" + GREEN_SOFT + ";font-weight:700;";
const TH_KEY_S = TH_S + "background:#17492D;";
const TOTAL_S = "border-top:2px solid " + GREEN + ";font-weight:700;background:#FAFAFA;";

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
  litres: (v, unit) => (v === null || v === undefined ? "—" : `${n0(v)} ${unit || "L"}`),
  money: (v) => (v === null || v === undefined ? "—" : `₦${n0(v)}`),
  rate: (v, unit) => (v === null || v === undefined || Number(v) === 0 ? "—" : `₦${n0(v)}/${unit || "L"}`),
  count: (v) => (v === null || v === undefined ? "—" : n0(v)),
  text: (v) => escapeHtml(String(v ?? "")) || "—",
};

const NUMERIC_FORMATS = new Set(["litres", "money", "rate", "count"]);

/**
 * `pfis.product_unit` holds the word ("Litres"), which is right for a form
 * label and wrong for a column of nine-figure numbers — the unit ended up
 * wider than the value. Abbreviated for the tables, unrecognised units passed
 * through as written rather than guessed at.
 */
const UNIT_SHORT = {
  litres: "L",
  litre: "L",
  liters: "L",
  kilograms: "kg",
  kilogram: "kg",
  kg: "kg",
  tonnes: "MT",
  mt: "MT",
};
const unitOf = (u) => UNIT_SHORT[String(u || "").toLowerCase()] || String(u || "L");

/**
 * What each desk reports, in the order its own form asks for it.
 *
 * Keys are the API's column names — the same ones the dashboard form posts and
 * the Reports Hub lists — so a field added to a form needs one line here and
 * nothing else. Labels match the form's labels, with the two that mean
 * different things per role spelled out: `truckCount` is "Trucks exited" on the
 * gate sheet and "Trucks sold/loaded" everywhere else, and `amountPaid` is
 * "Commission paid" on the commission sheet and cash banked elsewhere.
 */
const ROLE_FIELDS = {
  security_gate: [
    { key: "trucksEntered", label: "Trucks entered", fmt: "count" },
    { key: "truckCount", label: "Trucks exited", fmt: "count" },
  ],
  sales_manager: [
    { key: "openingStock", label: "Opening balance", fmt: "litres" },
    { key: "litresSold", label: "Litres sold", fmt: "litres" },
    { key: "avgPrice", label: "Avg price", fmt: "rate" },
    { key: "totalSalesAmount", label: "Total sales", fmt: "money" },
    { key: "truckCount", label: "Trucks sold", fmt: "count" },
    { key: "amountPaid", label: "Amount paid", fmt: "money" },
    { key: "totalInflow", label: "Total inflow", fmt: "money" },
    { key: "differentials", label: "Differentials", fmt: "money" },
    { key: "yesterdayDeficitPayment", label: "Yest. deficit", fmt: "money" },
    { key: "yesterdaySurplusPayment", label: "Yest. surplus", fmt: "money" },
    { key: "bankName", label: "Bank", fmt: "text" },
    { key: "accountNumber", label: "Account no.", fmt: "text" },
  ],
  product_manager: [
    { key: "openingStock", label: "Opening (b/f)", fmt: "litres" },
    { key: "receivedStock", label: "Ordered today", fmt: "litres" },
    { key: "litresSold", label: "Loaded today", fmt: "litres" },
    { key: "loadingLeftOver", label: "Loading left over", fmt: "litres" },
    { key: "tankBalance", label: "Tank balance", fmt: "litres" },
    { key: "truckCount", label: "Trucks loaded", fmt: "count" },
    { key: "differentials", label: "Differentials", fmt: "money" },
  ],
  commissions: [
    { key: "fundsReceived", label: "Funds received", fmt: "money" },
    { key: "litresSold", label: "Litres sold", fmt: "litres" },
    { key: "truckCount", label: "Trucks sold", fmt: "count" },
    { key: "customerCount", label: "Customers", fmt: "count" },
    { key: "orderCount", label: "Orders", fmt: "count" },
    { key: "commissionDue", label: "Commission due", fmt: "money" },
    { key: "amountPaid", label: "Commission paid", fmt: "money" },
    { key: "commissionOutstanding", label: "Not yet paid", fmt: "money" },
    { key: "fundsRemaining", label: "Funds remaining", fmt: "money" },
  ],
  it_compliance: [
    { key: "orderCount", label: "Orders", fmt: "count" },
    { key: "litresSold", label: "Litres ordered", fmt: "litres" },
    { key: "avgPrice", label: "Avg price", fmt: "rate" },
    { key: "totalSalesAmount", label: "Total value", fmt: "money" },
  ],
};

/** Which roles collect a price table, and which collect a customer list. */
const HAS_PRICE_BANDS = new Set(["sales_manager", "it_compliance"]);
const HAS_TOP_CUSTOMERS = new Set(["it_compliance"]);

/**
 * Only a sheet a manager has actually ruled on gets a badge.
 *
 * `submitted` is the state every sheet starts in, so badging it put the same
 * amber chip on every row and made the two states worth noticing — approved
 * and rejected — harder to spot, not easier.
 */
const STATUS_STYLE = {
  approved: "background:#DCFCE7;color:#166534;",
  rejected: "background:#FEE2E2;color:#991B1B;",
};

function statusBadge(status) {
  const key = String(status || "").toLowerCase();
  const style = STATUS_STYLE[key];
  if (!style) return "";
  return (
    `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;` +
    `font-weight:700;text-transform:uppercase;letter-spacing:.3px;${style}">${escapeHtml(key)}</span>`
  );
}

// ─── The at-a-glance band ───────────────────────────────────────────────────

/**
 * The whole day in one strip, before any table.
 *
 * Built as a table rather than flex or grid: Outlook renders neither, and this
 * is the one block that has to survive every client intact.
 */
function summaryBand(cells) {
  const width = `${Math.floor(100 / cells.length)}%`;
  const tds = cells
    .map(
      (c) =>
        `<td width="${width}" style="background:${GREEN_SOFT};vertical-align:top;">` +
        `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:${MUTED};">${escapeHtml(c.label)}</div>` +
        `<div style="font-size:15px;font-weight:700;color:${GREEN};padding-top:2px;">${c.value}</div>` +
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
        cell(r.orderedQty ? `${n0(r.orderedQty)} ${u}` : "—", { r: true }) +
        cell(m(r.orderedValue), { r: true }) +
        cell(r.confirmedQty ? `${n0(r.confirmedQty)} ${u}` : "—", { r: true }) +
        cell(m(r.confirmedValue), { r: true }) +
        cell(r.avgRate ? `₦${n0(r.avgRate)}/${u}` : "—", { r: true }) +
        cell(`${n0(r.closingStock)} ${u}`, { r: true, s: KEY_S }) +
        cell(m(r.totalRevenue), { r: true }) +
        "</tr>"
      );
    })
    .join("");

  const t = pfiStock.reduce(
    (acc, r) => {
      acc.opening += r.openingStock;
      acc.orderedQty += r.orderedQty;
      acc.orderedValue += r.orderedValue;
      acc.confirmedQty += r.confirmedQty;
      acc.confirmedValue += r.confirmedValue;
      acc.closing += r.closingStock;
      return acc;
    },
    { opening: 0, orderedQty: 0, orderedValue: 0, confirmedQty: 0, confirmedValue: 0, closing: 0 }
  );
  const avgRate = t.orderedQty > 0 ? t.orderedValue / t.orderedQty : 0;

  const totalRow =
    "<tr>" +
    cell("All PFIs", { s: TOTAL_S + "text-align:left;", span: 2 }) +
    cell(n0(t.opening), { r: true, s: TOTAL_S }) +
    cell(t.orderedQty ? n0(t.orderedQty) : "—", { r: true, s: TOTAL_S }) +
    cell(m(t.orderedValue), { r: true, s: TOTAL_S }) +
    cell(t.confirmedQty ? n0(t.confirmedQty) : "—", { r: true, s: TOTAL_S }) +
    cell(m(t.confirmedValue), { r: true, s: TOTAL_S }) +
    cell(avgRate ? `₦${n0(avgRate)}` : "—", { r: true, s: TOTAL_S }) +
    cell(n0(t.closing), { r: true, s: TOTAL_S }) +
    cell("", { s: TOTAL_S }) +
    "</tr>";

  return `<div style="overflow-x:auto;">${TABLE}<thead><tr>${header}</tr></thead><tbody>${rows}${totalRow}</tbody></table></div>`;
}

// ─── Staff entries, one table per role ──────────────────────────────────────

/** The price table a sales or compliance sheet was filed with, inline. */
function priceBandsCell(bands) {
  if (!bands || bands.length === 0) return "";
  const rows = bands.map((b) => `${n0(b.litres)} L @ ₦${n0(b.price)}`).join(" &nbsp;·&nbsp; ");
  return (
    `<div style="padding-top:3px;font-size:11px;color:${MUTED};">` +
    `<span style="text-transform:uppercase;letter-spacing:.3px;">Prices:</span> ${rows}</div>`
  );
}

/** Compliance's top five, inline. */
function topCustomersCell(list) {
  if (!list || list.length === 0) return "";
  const rows = list.map((c) => `${escapeHtml(c.name) || "—"} (${n0(c.litres)} L)`).join(" &nbsp;·&nbsp; ");
  return (
    `<div style="padding-top:3px;font-size:11px;color:${MUTED};">` +
    `<span style="text-transform:uppercase;letter-spacing:.3px;">Top customers:</span> ${rows}</div>`
  );
}

function roleTable({ role, type, entries }) {
  const fields = ROLE_FIELDS[type] || [];

  if (entries.length === 0) {
    return (
      `<p style="margin:12px 0 0;color:${MUTED};font-size:12px;">` +
      `<span style="font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${INK};">${escapeHtml(role)}</span>` +
      ` &nbsp;—&nbsp; not filed today.</p>`
    );
  }

  const header =
    hcell("PFI") +
    hcell("Filed by") +
    fields.map((f) => hcell(f.label, { r: NUMERIC_FORMATS.has(f.fmt) })).join("");

  const rows = entries
    .map((e) => {
      const cells = fields
        .map((f) => {
          const fmt = FORMATTERS[f.fmt] || FORMATTERS.text;
          return cell(fmt(e[f.key], "L"), { r: NUMERIC_FORMATS.has(f.fmt) });
        })
        .join("");

      // Remarks, prices and the customer list sit full-width beneath the row
      // rather than in columns: they are prose and lists, and squeezing them
      // into a numeric grid is what made the old single table unreadable.
      const extras =
        (HAS_PRICE_BANDS.has(type) ? priceBandsCell(e.priceBands) : "") +
        (HAS_TOP_CUSTOMERS.has(type) ? topCustomersCell(e.topCustomers) : "") +
        (e.remarks
          ? `<div style="padding-top:3px;font-size:11px;color:${MUTED};">` +
            `<span style="text-transform:uppercase;letter-spacing:.3px;">Remarks:</span> ${escapeHtml(e.remarks)}</div>`
          : "");

      const main =
        "<tr>" +
        cell(escapeHtml(e.pfiNumber) || "—") +
        cell(`${escapeHtml(e.submittedBy) || "—"} ${statusBadge(e.status)}`) +
        cells +
        "</tr>";

      const extraRow = extras
        ? `<tr>${cell(extras, { s: "border-top:none;", span: fields.length + 2 })}</tr>`
        : "";

      return main + extraRow;
    })
    .join("");

  return (
    `<p style="margin:16px 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${GREEN};font-size:12px;">` +
    `${escapeHtml(role)} <span style="color:${MUTED};font-weight:400;text-transform:none;letter-spacing:0;">` +
    `— ${plural(entries.length, "sheet")}</span></p>` +
    `<div style="overflow-x:auto;">${TABLE}<thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

// ─── Orders ─────────────────────────────────────────────────────────────────

const ORDER_HEADERS = ["Reference", "Customer", "Product", "Qty", "Rate", "Amount", "Status"];
const ORDER_NUMERIC = new Set([3, 4, 5]);

function ordersTable(orders, total) {
  if (orders.length === 0) {
    return `<p style="color:${MUTED};margin:4px 0;">No orders today.</p>`;
  }
  // Say so when the list is trimmed, rather than letting the reader count the
  // rows and believe that was the whole day.
  const trimmed =
    total > orders.length
      ? `<p style="margin:4px 0 0;color:${MUTED};font-size:11px;">` +
        `Listing the first ${n0(orders.length)} of ${n0(total)} orders — the figures above cover all ${n0(total)}.</p>`
      : "";
  const header = ORDER_HEADERS.map((label, i) => hcell(label, { r: ORDER_NUMERIC.has(i) })).join("");
  const rows = orders
    .map((o) => {
      const cells = [
        escapeHtml(o.reference),
        escapeHtml(o.customer) || "—",
        escapeHtml(o.product) || "—",
        `${n0(o.quantity)} L`,
        o.rate ? `₦${n0(o.rate)}/L` : "—",
        o.amount ? `₦${n0(o.amount)}` : "—",
        escapeHtml(o.status),
      ];
      return "<tr>" + cells.map((c, i) => cell(c, { r: ORDER_NUMERIC.has(i) })).join("") + "</tr>";
    })
    .join("");
  return `<div style="overflow-x:auto;">${TABLE}<thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>${trimmed}`;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

const SECTION_LABEL = `margin:22px 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${GREEN};font-size:12px;`;

function locationSection(loc) {
  const filed = loc.staffEntries.reduce((count, s) => count + s.entries.length, 0);

  return (
    `<div style='margin-top:26px;padding:0 0 4px;border-top:2px solid ${GREEN};'>` +
    `<h3 style='margin:12px 0 2px;font-size:15px;color:${GREEN};'>${escapeHtml(loc.name)}</h3>` +
    summaryBand([
      { label: "Opening stock", value: `${n0(loc.stock.opening)} L` },
      { label: "Ordered", value: n0(loc.orderCount), note: `${n0(loc.orderLitres)} L` },
      { label: "Sales value", value: m(loc.orderValue) },
      { label: "Confirmed", value: `${n0(loc.stock.confirmedQty)} L`, note: m(loc.stock.confirmedValue) },
      { label: "Closing stock", value: `${n0(loc.stock.closing)} L` },
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

  const header =
    `<h2 style='margin:0 0 2px;font-size:18px;color:${GREEN};'>Daily Report &mdash; ${plainDate(d.reportDate)}</h2>` +
    `<p style='margin:0 0 4px;color:${MUTED};font-size:12px;'>` +
    `${plural(locations.length, "location")} &nbsp;&bull;&nbsp; ` +
    `${plural(staffEntries, "sheet")} filed</p>` +
    summaryBand([
      { label: "Opening stock", value: `${n0(openingStock)} L` },
      { label: "Ordered", value: n0(orderCount), note: `${n0(qtyLitres)} L` },
      { label: "Sales value", value: m(amountNaira) },
      { label: "Confirmed", value: `${n0(confirmedQty)} L`, note: m(confirmedValue) },
      { label: "Closing stock", value: `${n0(closingStock)} L` },
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
    `Opening stock: ${n0(openingStock)} L\n` +
    `Ordered:       ${n0(orderCount)} order(s), ${n0(qtyLitres)} L\n` +
    `Sales value:   ${n0(amountNaira)}\n` +
    `Confirmed:     ${n0(confirmedQty)} L, ${n0(confirmedValue)}\n` +
    `Closing stock: ${n0(closingStock)} L\n` +
    `Sheets filed:  ${n0(staffEntries)}\n\n` +
    (d.locations || [])
      .map(
        (loc) =>
          `${loc.name}\n` +
          `  opening ${n0(loc.stock.opening)} L / ordered ${n0(loc.stock.orderedQty)} L / ` +
          `confirmed ${n0(loc.stock.confirmedQty)} L / closing ${n0(loc.stock.closing)} L\n` +
          `  ${loc.orderCount} order(s), ${loc.staffEntries.reduce((c, s) => c + s.entries.length, 0)} sheet(s) filed`
      )
      .join("\n") +
    `\n\nBest regards,\nSoroman System`;

  return { subject, html, text };
}

module.exports = { renderDailyReportEmail, ROLE_FIELDS };
