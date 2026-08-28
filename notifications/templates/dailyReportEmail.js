const { escapeHtml } = require("./email");

/**
 * The daily combined report email — staff entries, PFI stock and orders, one
 * section per depot. Ported from Django's `_build_combined_html_report()` /
 * `send_report_email()` (administration/tasks.py) to the letter: same bare
 * markup (no <html>/<head>/<body>, no wrapper, no CSS classes — every style
 * is inline), same two colours, same table shapes, same em-dash-for-empty
 * number formatting, same "Dear Sir," / "Best regards, Soroman System"
 * sign-off. `buildCombinedDailyReportData` (services/dailyCombinedReport
 * .service.js) supplies `d`; this file only renders it.
 *
 * Three things were deliberately NOT copied from the Django version:
 *   1. The empty-role row's colspan was 10 in a 12-column table (one short,
 *      ragged right edge) — this uses 11.
 *   2. Header alignment right-aligned by column INDEX (>= 3), which also
 *      right-aligned the trailing text columns (Bank/Remarks, Status) —
 *      this aligns by which columns are actually numeric.
 *   3. Every cell had text-transform:uppercase, including remarks, customer
 *      and bank names. That stays on headers only; body text reads normally.
 *
 * The subject's ordinal date ("27th August 2026") deliberately still
 * disagrees with the body's plain date ("27 August 2026") — that mismatch is
 * in the original, not a bug, so it is kept rather than "fixed".
 */

const GREEN = "#1E5F3A";
const BORDER = "#CCCCCC";

const TBL = "width:100%;border-collapse:collapse;margin-bottom:0;";
const TH =
  "padding:7px 10px;background:" +
  GREEN +
  ";color:#ffffff;font-weight:600;text-align:left;border:1px solid " +
  BORDER +
  ";text-transform:uppercase;";
const TH_R = TH + "text-align:right;";
// Fix 3: no text-transform on data cells — only the headers shout.
const TD = "padding:6px 10px;border:1px solid " + BORDER + ";color:#1a1a1a;vertical-align:top;";
const TD_R = TD + "text-align:right;";

/** "1,880,000" — thousands, no decimals, em-dash for zero or unparseable. */
const n = (val) => {
  const f = Number(val);
  if (!Number.isFinite(f) || f === 0) return "—";
  return f.toLocaleString("en-NG", { maximumFractionDigits: 0 });
};

/** "₦1,504,000" — same rule, with the naira sign. */
const m = (val) => {
  const f = Number(val);
  if (!Number.isFinite(f) || f === 0) return "—";
  return `₦${f.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
};

/** Plain {:,.0f}-style formatting for the PFI stock table, which prints 0 rather than —. */
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

// ─── Table 1 — Staff Entries (12 columns) ───────────────────────────────────

const STAFF_HEADERS = [
  "Role",
  "Submitted By",
  "PFI",
  "Opening (L)",
  "Sold (L)",
  "Trucks",
  "Left Over (L)",
  "Amt Paid",
  "Total Sales",
  "Diff",
  "Bank",
  "Remarks",
];
// Columns 3–9 are the numeric ones; 0–2 and 10–11 are text (fix 2).
const STAFF_NUMERIC = new Set([3, 4, 5, 6, 7, 8, 9]);

function staffEntriesTable(staffEntries) {
  const head = STAFF_HEADERS.map(
    (label, i) => `<th style='${STAFF_NUMERIC.has(i) ? TH_R : TH}'>${escapeHtml(label)}</th>`
  ).join("");

  const rows = staffEntries
    .map(({ role, entry }) => {
      if (!entry) {
        // Fix 1: 1 label cell + colspan 11 = 12 columns, not 11.
        return (
          `<tr><td style='${TD}'>${escapeHtml(role)}</td>` +
          `<td style='${TD}' colspan='11'>No entry</td></tr>`
        );
      }
      const cells = [
        escapeHtml(role),
        escapeHtml(entry.submittedBy) || "—",
        escapeHtml(entry.pfiNumber) || "—",
        n(entry.opening),
        n(entry.sold),
        n(entry.trucks),
        n(entry.leftOver),
        m(entry.amountPaid),
        m(entry.totalSales),
        m(entry.diff),
        escapeHtml(entry.bank) || "—",
        escapeHtml(entry.remarks) || "—",
      ];
      return (
        "<tr>" +
        cells.map((c, i) => `<td style='${STAFF_NUMERIC.has(i) ? TD_R : TD}'>${c}</td>`).join("") +
        "</tr>"
      );
    })
    .join("");

  return `<div style='overflow-x:auto;'><table style='${TBL}'><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Table 2 — PFI Stock (6 columns) ────────────────────────────────────────

const PFI_HEADERS = ["PFI Number", "Ordered Today", "Confirmed", "Balance", "Revenue Today", "Total Revenue (PFI)"];

function pfiStockTable(pfiStock) {
  if (pfiStock.length === 0) {
    return "<p style='color:#999;margin:4px 0;text-transform:uppercase;'>No PFI activity today.</p>";
  }
  const head = PFI_HEADERS.map((label, i) => `<th style='${i > 0 ? TH_R : TH}'>${escapeHtml(label)}</th>`).join("");
  const rows = pfiStock
    .map((row) => {
      const cells = [
        escapeHtml(row.pfiNumber),
        `${n0(row.orderedToday)} L`,
        `${n0(row.confirmed)} L`,
        `${n0(row.balance)} L`,
        `₦${n0(row.revenueToday)}`,
        `₦${n0(row.totalRevenue)}`,
      ];
      return "<tr>" + cells.map((c, i) => `<td style='${i > 0 ? TD_R : TD}'>${c}</td>`).join("") + "</tr>";
    })
    .join("");
  return `<div style='overflow-x:auto;'><table style='${TBL}'><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Table 3 — Orders (7 columns) ───────────────────────────────────────────

const ORDER_HEADERS = ["Reference", "Customer", "Product", "Qty", "Rate", "Amount", "Status"];
// Columns 3–5 are numeric; 6 (Status) is text (fix 2).
const ORDER_NUMERIC = new Set([3, 4, 5]);

function ordersTable(orders) {
  if (orders.length === 0) {
    return "<p style='color:#999;margin:4px 0;text-transform:uppercase;'>No orders today.</p>";
  }
  const head = ORDER_HEADERS.map(
    (label, i) => `<th style='${ORDER_NUMERIC.has(i) ? TH_R : TH}'>${escapeHtml(label)}</th>`
  ).join("");
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
      return (
        "<tr>" +
        cells.map((c, i) => `<td style='${ORDER_NUMERIC.has(i) ? TD_R : TD}'>${c}</td>`).join("") +
        "</tr>"
      );
    })
    .join("");
  return `<div style='overflow-x:auto;'><table style='${TBL}'><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

function locationSection(loc) {
  return (
    `<div style='margin-top:28px;padding:0 0 4px;border-top:2px solid ${GREEN};'>` +
    `<h3 style='margin:10px 0 4px;font-size:14px;color:${GREEN};'>${escapeHtml(loc.name)}</h3>` +
    `<p style='margin:18px 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${GREEN};'>Staff Entries</p>` +
    staffEntriesTable(loc.staffEntries) +
    `<p style='margin:18px 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${GREEN};'>PFI Stock</p>` +
    pfiStockTable(loc.pfiStock) +
    `<p style='margin:18px 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${GREEN};'>Orders</p>` +
    ordersTable(loc.orders) +
    `</div>`
  );
}

function combinedReportBody(d) {
  const locations = d.locations || [];
  if (locations.length === 0) {
    return "<p>No active locations.</p>";
  }
  const { staffEntries = 0, orderCount = 0, qtyLitres = 0, amountNaira = 0 } = d.totals || {};
  const summary =
    `${plural(staffEntries, "staff entry", "staff entries")} ` +
    `&nbsp;&bull;&nbsp; ${plural(orderCount, "order")} ` +
    `&nbsp;&bull;&nbsp; ${qtyLitres.toLocaleString("en-NG")} L ` +
    `&nbsp;&bull;&nbsp; &#8358;${amountNaira.toLocaleString("en-NG")} total`;

  const header =
    `<h2 style='margin:0 0 4px;font-size:16px;color:${GREEN};'>Daily Report &mdash; ${plainDate(d.reportDate)}</h2>` +
    `<p style='margin:0 0 20px;color:#555;text-transform:uppercase;'>${summary}</p>` +
    `<hr style='border:none;border-top:2px solid ${GREEN};margin:0;'/>`;

  return header + locations.map(locationSection).join("");
}

function renderDailyReportEmail(d) {
  const subjectDate = ordinalDate(d.reportDate);
  const subject = `Daily Report - ${subjectDate}`;

  const html = `<p>Dear Sir,</p>${combinedReportBody(d)}<p>Best regards,<br/>Soroman System</p>`;

  const { orderCount = 0, qtyLitres = 0, amountNaira = 0 } = d.totals || {};
  const text =
    `Dear Sir,\n\n` +
    `Daily Orders report for ${subjectDate}\n\n` +
    `orders=${orderCount}, qty=${qtyLitres.toLocaleString("en-NG", { minimumFractionDigits: 2 })}, ` +
    `amount=${amountNaira.toLocaleString("en-NG", { minimumFractionDigits: 2 })}\n\n` +
    `Best regards,\nSoroman System`;

  return { subject, html, text };
}

module.exports = { renderDailyReportEmail };
