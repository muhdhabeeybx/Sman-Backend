const { escapeHtml } = require("./email");
const {
  INK, MUTED, TABLE, KEY_S, CREDIT_S, BALANCE_S,
  cell, hcell, m, n0, ordinalDate,
} = require("./reportTable");

/**
 * The Soroman daily report.
 *
 * `buildPfiDailyReportData` (services/pfiDailyReport.service.js) supplies `d`;
 * this file only renders it. Same constraints as the combined report — bare
 * markup, every style inline, no wrapper, because mail clients strip <style>
 * blocks and Gmail ignores classes — and the same palette, imported rather
 * than copied, so green means money in and red means still owed in both.
 *
 * ── Tables, not sections ──────────────────────────────────────────────────
 *
 * One table per fact, one row per batch, so the reader compares down a column.
 * Ten sections would mean scrolling past nine to compare two, and comparison
 * is the whole reason the report gets opened: which batch moved, which is owed
 * on, which is nearly out.
 *
 * ── Wording ───────────────────────────────────────────────────────────────
 *
 * The labels are the dashboard's own: SALES VALUE, FUNDS RECEIVED, BALANCE,
 * OPENING STOCK, COMMISSION DUE. Not "collected", not "outstanding". A report
 * that renames the things it reports makes the reader translate before they
 * can read, and eventually they translate one of them wrong.
 */

const up = (v) => String(v == null ? "" : v).toUpperCase();

/** "product_manager" → "PRODUCT MANAGER" */
const roleLabel = (r) => up(String(r || "").replace(/_/g, " "));

const section = (label, note = "") =>
  `<tr><td colspan="99" style="padding:26px 0 8px;border:0;">` +
  `<div style="font-size:13px;font-weight:700;letter-spacing:.6px;color:${INK};border-bottom:2px solid ${INK};padding-bottom:5px;">` +
  `${escapeHtml(up(label))}` +
  (note ? `<span style="float:right;font-weight:400;letter-spacing:0;color:${MUTED};font-size:11px;">${escapeHtml(note)}</span>` : "") +
  `</div></td></tr>`;

/** Litres, always with the unit — a bare number beside money misreads. */
const L = (v) => (Number(v || 0) === 0 ? "—" : `${n0(v)} L`);
const c0 = (v) => (Number(v || 0) === 0 ? "—" : n0(v));

/** A figure the data cannot support. Never a zero, never a negative. */
const UNKNOWN = `<span style="color:${MUTED};">N/A</span>`;

const headRow = (labels) => `<tr>${labels.map((l, i) => hcell(up(l), { r: i > 0 })).join("")}</tr>`;
const table = (labels, rows) => (rows.length ? `${TABLE}${headRow(labels)}${rows.join("")}</table>` : "");
const block = (html) => `<tr><td colspan="99" style="border:0;padding:0;">${html}</td></tr>`;

/** The row label column: uppercase, tinted, bold. Every table opens with one. */
const idCell = (text) => cell(`<strong>${escapeHtml(up(text))}</strong>`, { s: KEY_S });

const renderPfiDailyReportEmail = (d) => {
  const date = ordinalDate(d.reportDate);
  const subject = `Soroman Daily Report — ${date}`;
  const s = d.summary || {};
  const out = [];

  out.push(
    `<div style="font-family:Arial,Helvetica,sans-serif;color:${INK};max-width:1100px;">`,
    `<div style="font-size:20px;font-weight:700;letter-spacing:.5px;">SOROMAN DAILY REPORT</div>`,
    `<div style="font-size:13px;color:${MUTED};margin-top:2px;">${escapeHtml(up(date))}</div>`,
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`
  );

  out.push(section("Summary"));
  out.push(
    block(
      `${TABLE}` +
        headRow(["Litres sold", "Sales value", "Funds received", "Balance"]) +
        `<tr>` +
        cell(L(s.litresSold), { s: KEY_S }) +
        cell(m(s.salesValue), { r: true, s: CREDIT_S }) +
        cell(m(s.fundsReceived), { r: true, s: CREDIT_S }) +
        cell(m(s.balance), { r: true, s: BALANCE_S }) +
        `</tr></table>` +
        `<div style="font-size:12px;color:${MUTED};padding-top:6px;">` +
        `${s.activePfis || 0} ACTIVE PFI(S) · ${s.activeBatches || 0} TRUCK-SALES BATCH(ES) · ` +
        `${s.activeStations || 0} FILLING STATION(S) · ${s.depot?.exitedToday || 0} TRUCK(S) EXITED` +
        `<br>Funds received covers payments taken today against orders of any date.` +
        `</div>`
    )
  );

  const pfis = d.pfis || [];
  if (pfis.length) {
    out.push(section("Depot sales", "stock and orders, by PFI"));
    out.push(
      block(
        table(
          ["PFI", "Type", "Location", "Opening stock", "Drawn", "Closing stock", "Orders", "Litres sold", "Sales value", "Funds received", "Balance"],
          pfis.map((p) => {
            const t = p.orders.today;
            return (
              `<tr>` +
              idCell(p.pfiNumber) +
              cell(escapeHtml(up(p.type))) +
              cell(escapeHtml(up(p.location))) +
              cell(L(p.stock.starting), { r: true }) +
              cell(L(p.stock.sold), { r: true }) +
              cell(L(p.stock.remaining), { r: true, s: BALANCE_S }) +
              cell(c0(t.count), { r: true }) +
              cell(L(t.litres), { r: true }) +
              cell(m(t.value), { r: true, s: t.value ? CREDIT_S : "" }) +
              cell(m(t.paid), { r: true, s: t.paid ? CREDIT_S : "" }) +
              cell(m(p.orders.outstanding), { r: true, s: p.orders.outstanding ? BALANCE_S : "" }) +
              `</tr>`
            );
          })
        )
      )
    );

    const moveRows = pfis
      .filter((p) => p.movements.trucksToDate > 0)
      .map((p) => {
        const mv = p.movements;
        return (
          `<tr>` +
          idCell(p.pfiNumber) +
          cell(c0(mv.enteredToday), { r: true }) +
          cell(c0(mv.loadedToday), { r: true }) +
          cell(c0(mv.exitedToday), { r: true }) +
          cell(L(mv.litresOutToday), { r: true, s: mv.litresOutToday ? CREDIT_S : "" }) +
          cell(c0(mv.onSite), { r: true, s: mv.onSite ? BALANCE_S : "" }) +
          cell(n0(mv.trucksToDate), { r: true }) +
          cell(L(mv.litresTicketedToDate), { r: true }) +
          `</tr>`
        );
      });
    if (moveRows.length) {
      out.push(section("Gate and loading", "today unless stated"));
      out.push(
        block(
          table(
            ["PFI", "Trucks entered", "Trucks loaded", "Trucks exited", "Litres out", "On site now", "Trucks to date", "Litres to date"],
            moveRows
          )
        )
      );
    }

    const expRows = pfis
      .filter((p) => p.expenses.toDate.count > 0)
      .map((p) => (
        `<tr>` +
        idCell(p.pfiNumber) +
        cell(c0(p.expenses.today.count), { r: true }) +
        cell(m(p.expenses.today.amount), { r: true }) +
        cell(n0(p.expenses.toDate.count), { r: true }) +
        cell(m(p.expenses.toDate.amount), { r: true }) +
        cell(m(p.expenses.toDate.paid), { r: true, s: CREDIT_S }) +
        cell(m(Math.max(0, p.expenses.toDate.amount - p.expenses.toDate.paid)), { r: true, s: BALANCE_S }) +
        `</tr>`
      ));
    /**
     * General expenses sit in the same table, under the batch rows.
     *
     * They are money out like any other, and a separate table would invite the
     * reader to add the two up themselves. Labelled by category, because
     * "General" as one number answers nothing.
     */
    const genRows = (d.generalExpenses || [])
      .filter((g) => g.toDate.count > 0)
      .map((g) => (
        `<tr>` +
        idCell(`GENERAL — ${g.category}`) +
        cell(c0(g.today.count), { r: true }) +
        cell(m(g.today.amount), { r: true }) +
        cell(n0(g.toDate.count), { r: true }) +
        cell(m(g.toDate.amount), { r: true }) +
        cell(m(g.toDate.paid), { r: true, s: CREDIT_S }) +
        cell(m(Math.max(0, g.toDate.amount - g.toDate.paid)), { r: true, s: BALANCE_S }) +
        `</tr>`
      ));

    if (expRows.length || genRows.length) {
      out.push(section("Expenses", "by PFI, then general"));
      out.push(
        block(
          table(
            ["PFI / category", "Entries today", "Amount today", "Entries to date", "Amount to date", "Amount paid", "Not yet paid"],
            [...expRows, ...genRows]
          )
        )
      );
    }

    const comRows = pfis
      .filter((p) => p.commission.entries > 0)
      .map((p) => (
        `<tr>` +
        idCell(p.pfiNumber) +
        cell(n0(p.commission.entries), { r: true }) +
        cell(L(p.commission.litres), { r: true }) +
        cell(m(p.commission.due), { r: true, s: p.commission.due ? BALANCE_S : "" }) +
        cell(m(p.commission.paid), { r: true, s: p.commission.paid ? CREDIT_S : "" }) +
        `</tr>`
      ));
    if (comRows.length) {
      out.push(section("Commissions", "by PFI"));
      out.push(block(table(["PFI", "Entries", "Litres", "Commission due", "Commission paid"], comRows)));
    }
  }

  const batches = d.truckSales || [];
  if (batches.length) {
    out.push(section("Truck sales", "active allocations"));
    out.push(
      block(
        table(
          ["Batch", "Customers", "Trucks sold today", "Trucks sold to date", "Sales value", "Funds received", "Balance"],
          batches.map((b) => (
            `<tr>` +
            idCell(b.code) +
            cell(n0(b.customers), { r: true }) +
            cell(c0(b.trucksSoldToday), { r: true }) +
            cell(n0(b.trucksSold), { r: true }) +
            cell(m(b.salesValue), { r: true, s: CREDIT_S }) +
            cell(m(b.fundsReceived), { r: true, s: CREDIT_S }) +
            cell(m(b.balance), { r: true, s: b.balance ? BALANCE_S : "" }) +
            `</tr>`
          ))
        )
      )
    );
  }

  const stations = d.stations || [];
  if (stations.length) {
    out.push(section("Filling stations", "active stock"));
    out.push(
      block(
        table(
          ["Station", "Batch", "Opening stock", "Litres sold today", "Litres sold to date", "Stock remaining", "Sales value", "Funds received", "Balance"],
          stations.map((st) => (
            `<tr>` +
            idCell(st.party) +
            cell(escapeHtml(up(st.code))) +
            cell(st.allocatedLitres ? L(st.allocatedLitres) : UNKNOWN, { r: true }) +
            cell(L(st.litresToday), { r: true }) +
            cell(L(st.litres), { r: true }) +
            cell(st.stockKnown ? L(st.remainingLitres) : UNKNOWN, { r: true, s: st.stockKnown && st.remainingLitres ? BALANCE_S : "" }) +
            cell(m(st.salesValue), { r: true, s: st.salesValue ? CREDIT_S : "" }) +
            cell(m(st.fundsReceived), { r: true, s: st.fundsReceived ? CREDIT_S : "" }) +
            cell(m(st.balance), { r: true, s: st.balance ? BALANCE_S : "" }) +
            `</tr>`
          ))
        )
      )
    );
  }

  const entries = d.staffEntries || [];
  if (entries.length) {
    out.push(section("Staff entries", `${entries.length} sheet(s) filed`));
    out.push(
      block(
        table(
          ["Role", "Location", "PFI", "Filed by", "Litres sold", "Sales value", "Amount paid", "Status"],
          entries.map((e) => (
            `<tr>` +
            idCell(roleLabel(e.role)) +
            cell(escapeHtml(up(e.location || "—"))) +
            cell(escapeHtml(up(e.pfi_number || "—"))) +
            cell(escapeHtml(e.submitted_by_name || "—")) +
            cell(e.litres_sold == null ? "—" : L(e.litres_sold), { r: true }) +
            cell(m(e.sales_value), { r: true, s: Number(e.sales_value) ? CREDIT_S : "" }) +
            cell(m(e.amount_paid), { r: true, s: Number(e.amount_paid) ? CREDIT_S : "" }) +
            cell(escapeHtml(up(e.status || "—"))) +
            `</tr>`
          ))
        )
      )
    );
  }

  out.push(`</table></div>`);

  const text = [
    `SOROMAN DAILY REPORT — ${up(date)}`,
    "",
    `Litres sold      ${L(s.litresSold)}`,
    `Sales value      ${m(s.salesValue)}`,
    `Funds received   ${m(s.fundsReceived)}`,
    `Balance          ${m(s.balance)}`,
    "",
    `${s.activePfis || 0} active PFI(s), ${s.activeBatches || 0} batch(es), ${s.activeStations || 0} station(s).`,
  ].join("\n");

  return { subject, html: out.join(""), text };
};

module.exports = { renderPfiDailyReportEmail };
