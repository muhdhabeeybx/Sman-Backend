const { escapeHtml } = require("./email");
const {
  INK, MUTED, TABLE, TH_S, KEY_S, CREDIT_S, BALANCE_S,
  cell, hcell, m, n0, ordinalDate,
} = require("./reportTable");

/**
 * The per-PFI daily report email.
 *
 * `buildPfiDailyReportData` (services/pfiDailyReport.service.js) supplies `d`;
 * this file only renders it. Same constraints as the combined report: bare
 * markup, every style inline, no wrapper — mail clients strip <style> blocks
 * and Gmail ignores classes — and the same palette, imported rather than
 * copied, so green means money in and red means still owed in both emails.
 *
 * ── Tables, not sections ──────────────────────────────────────────────────
 *
 * The obvious shape for "everything per PFI" is one section per PFI. With ten
 * active batches that is ten headings to scroll past before two of them can be
 * compared, and comparison is the entire reason somebody opens this: which
 * batch moved, which is owed on, which is nearly out.
 *
 * So each fact gets ONE table with one row per batch, and the reader compares
 * down a column. Station detail is the only thing that nests, because a
 * station belongs to exactly one batch and there is nothing to compare across.
 *
 * ── What is left out ──────────────────────────────────────────────────────
 *
 * Gmail clips at 102KB and the combined report already runs to 72KB, so this
 * one earns its space. Station detail prints only for batches that are live —
 * activity today, or stock still on the ground. A batch that is finished
 * except for its debt appears once, in the summary table, with what it owes.
 */

/** Section rule + label. The only chrome in the document. */
const section = (label, note = "") =>
  `<tr><td colspan="99" style="padding:26px 0 8px;border:0;">` +
  `<div style="font-size:13px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${INK};border-bottom:2px solid ${INK};padding-bottom:5px;">` +
  `${escapeHtml(label)}` +
  (note ? `<span style="float:right;font-weight:400;text-transform:none;letter-spacing:0;color:${MUTED};font-size:11px;">${escapeHtml(note)}</span>` : "") +
  `</div></td></tr>`;

/** Litres, always with the unit — a bare number next to money misreads. */
const L = (v) => (Number(v || 0) === 0 ? "—" : `${n0(v)} L`);

/** A figure the data cannot support. Never a zero, never a negative. */
const UNKNOWN = `<span style="color:${MUTED};">n/a</span>`;

const headRow = (labels) =>
  `<tr>${labels.map((l, i) => hcell(l, { r: i > 0 })).join("")}</tr>`;

const table = (labels, rows) =>
  rows.length ? `${TABLE}${headRow(labels)}${rows.join("")}</table>` : "";

const renderPfiDailyReportEmail = (d) => {
  const date = ordinalDate(d.reportDate);
  const subject = `PFI Daily Report — ${date}`;
  const s = d.summary || {};
  const out = [];

  out.push(
    `<div style="font-family:Arial,Helvetica,sans-serif;color:${INK};max-width:1100px;">`,
    `<div style="font-size:20px;font-weight:700;">PFI Daily Report</div>`,
    `<div style="font-size:13px;color:${MUTED};margin-top:2px;">${escapeHtml(date)}</div>`,
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`
  );

  // ── Summary ─────────────────────────────────────────────────────────────
  //
  // Four figures, because four is what fits on a phone in one row and what a
  // reader can hold at once. Everything else in the document explains one of
  // them.
  out.push(section("Summary"));
  out.push(
    `<tr><td colspan="99" style="border:0;padding:0;">`,
    `${TABLE}`,
    headRow(["Litres sold today", "Sales value today", "Collected today", "Outstanding"]),
    `<tr>`,
    cell(L(s.litresToday), { s: KEY_S }),
    cell(m(s.valueToday), { r: true, s: CREDIT_S }),
    cell(m(s.collectedToday), { r: true, s: CREDIT_S }),
    cell(m(s.outstanding), { r: true, s: BALANCE_S }),
    `</tr></table>`,
    `<div style="font-size:12px;color:${MUTED};padding-top:6px;">` +
      `${s.activePfis || 0} active PFI(s) · ${s.activeBatches || 0} truck-sales batch(es) · ` +
      `${s.depot?.exitedToday || 0} truck(s) out of the gate · ` +
      `${m(s.depot?.expensesToday)} expenses booked` +
      // Collections routinely exceed same-day sales, because most of what
      // arrives settles an earlier order. Said once here, so the reader does
      // not stop to work out whether the page contradicts itself.
      `<br>Collected covers payments received today against orders of any date.` +
      `</div>`,
    `</td></tr>`
  );

  // ── Depot trading ───────────────────────────────────────────────────────
  const pfis = d.pfis || [];
  const tradingRows = pfis.map((p) => {
    const t = p.orders.today;
    return (
      `<tr>` +
      cell(`<strong>${escapeHtml(p.pfiNumber)}</strong>`, { s: KEY_S }) +
      cell(escapeHtml(p.type)) +
      cell(escapeHtml(p.location)) +
      cell(L(p.stock.starting), { r: true }) +
      cell(L(p.stock.sold), { r: true }) +
      cell(L(p.stock.remaining), { r: true, s: BALANCE_S }) +
      cell(t.count ? n0(t.count) : "—", { r: true }) +
      cell(L(t.litres), { r: true }) +
      cell(m(t.value), { r: true, s: t.value ? CREDIT_S : "" }) +
      cell(m(t.paid), { r: true, s: t.paid ? CREDIT_S : "" }) +
      cell(m(p.orders.outstanding), { r: true, s: p.orders.outstanding ? BALANCE_S : "" }) +
      `</tr>`
    );
  });

  if (tradingRows.length) {
    out.push(section("Depot trading", "stock and orders, by PFI"));
    out.push(
      `<tr><td colspan="99" style="border:0;padding:0;">`,
      table(
        ["PFI", "Type", "Location", "Opening", "Drawn", "Remaining", "Orders today", "Litres today", "Value today", "Collected today", "Outstanding"],
        tradingRows
      ),
      `</td></tr>`
    );

    // ── Movements and cost ────────────────────────────────────────────────
    const moveRows = pfis
      .filter((p) => p.movements.trucksToDate > 0 || p.expenses.toDate.count > 0)
      .map((p) => {
        const mv = p.movements;
        return (
          `<tr>` +
          cell(`<strong>${escapeHtml(p.pfiNumber)}</strong>`, { s: KEY_S }) +
          cell(mv.enteredToday ? n0(mv.enteredToday) : "—", { r: true }) +
          cell(mv.loadedToday ? n0(mv.loadedToday) : "—", { r: true }) +
          cell(mv.exitedToday ? n0(mv.exitedToday) : "—", { r: true }) +
          cell(L(mv.litresOutToday), { r: true, s: mv.litresOutToday ? CREDIT_S : "" }) +
          cell(mv.onSite ? n0(mv.onSite) : "—", { r: true, s: mv.onSite ? BALANCE_S : "" }) +
          cell(n0(mv.trucksToDate), { r: true }) +
          cell(m(p.expenses.today.amount), { r: true }) +
          cell(m(p.expenses.toDate.amount), { r: true }) +
          cell(m(p.expenses.toDate.paid), { r: true }) +
          `</tr>`
        );
      });

    if (moveRows.length) {
      out.push(section("Gate, loading and cost", "today unless stated"));
      out.push(
        `<tr><td colspan="99" style="border:0;padding:0;">`,
        table(
          ["PFI", "Gate in", "Loaded", "Gate out", "Litres out", "On site now", "Trucks to date", "Expenses today", "Expenses to date", "Expenses paid"],
          moveRows
        ),
        `</td></tr>`
      );
    }
  }

  // ── Truck sales, by batch ───────────────────────────────────────────────
  const batches = d.truckSales || [];
  if (batches.length) {
    const batchRows = batches.map((b) => {
      const t = b.totals;
      return (
        `<tr>` +
        cell(`<strong>${escapeHtml(b.code)}</strong>`, { s: KEY_S }) +
        cell(n0(t.stations), { r: true }) +
        cell(t.trucksSoldToday ? n0(t.trucksSoldToday) : "—", { r: true }) +
        cell(n0(t.trucksSold), { r: true }) +
        cell(t.allocatedLitres ? L(t.allocatedLitres) : UNKNOWN, { r: true }) +
        cell(L(t.soldLitresToday), { r: true }) +
        cell(L(t.soldLitres), { r: true }) +
        cell(t.stockKnown ? L(t.remainingLitres) : UNKNOWN, { r: true, s: t.stockKnown ? BALANCE_S : "" }) +
        cell(m(t.salesValue), { r: true, s: CREDIT_S }) +
        cell(m(t.deposited), { r: true, s: CREDIT_S }) +
        cell(m(t.outstanding), { r: true, s: t.outstanding ? BALANCE_S : "" }) +
        `</tr>`
      );
    });

    out.push(section("Truck sales", "by allocation"));
    out.push(
      `<tr><td colspan="99" style="border:0;padding:0;">`,
      table(
        ["Batch", "Stations", "Loads today", "Loads to date", "Allocated", "Sold today", "Sold to date", "Remaining", "Sales value", "Deposited", "Outstanding"],
        batchRows
      ),
      `</td></tr>`
    );

    // ── Station detail, live batches only ─────────────────────────────────
    const live = batches.filter(
      (b) => b.totals.soldLitresToday > 0 || b.totals.depositedToday > 0 || (b.totals.stockKnown && b.totals.remainingLitres > 0)
    );

    for (const b of live) {
      const rows = b.stations.map((st) => (
        `<tr>` +
        cell(escapeHtml(st.name), { s: KEY_S }) +
        cell(st.trucksAllocated ? n0(st.trucksAllocated) : "—", { r: true }) +
        cell(st.allocatedLitres ? L(st.allocatedLitres) : UNKNOWN, { r: true }) +
        cell(L(st.soldLitresToday), { r: true }) +
        cell(L(st.soldLitres), { r: true }) +
        cell(st.stockKnown ? L(st.remainingLitres) : UNKNOWN, { r: true, s: st.stockKnown && st.remainingLitres ? BALANCE_S : "" }) +
        cell(m(st.salesValue), { r: true, s: st.salesValue ? CREDIT_S : "" }) +
        cell(m(st.deposited), { r: true, s: st.deposited ? CREDIT_S : "" }) +
        cell(m(st.outstanding), { r: true, s: st.outstanding ? BALANCE_S : "" }) +
        `</tr>`
      ));

      out.push(section(`${b.code} — stations`, `${b.totals.stations} station(s)`));
      out.push(
        `<tr><td colspan="99" style="border:0;padding:0;">`,
        table(
          ["Station", "Trucks", "Allocated", "Sold today", "Sold to date", "Remaining", "Sales value", "Deposited", "Outstanding"],
          rows
        ),
        `</td></tr>`
      );
    }

    // ── Data notes ────────────────────────────────────────────────────────
    //
    // At the foot, not the head: they qualify the figures rather than replace
    // them, and a report that opens with its own caveats does not get read.
    const notes = [];
    for (const b of batches) {
      for (const [a, c] of b.possibleDuplicates) {
        notes.push(`${b.code}: “${a}” and “${c}” are listed separately — likely one station spelt two ways.`);
      }
      if (!b.totals.stockKnown && b.totals.soldLitres > 0) {
        notes.push(
          `${b.code}: ${b.totals.allocatedLitres ? "more sold than allocated" : "sales with no allocation recorded"} — remaining stock cannot be stated.`
        );
      }
    }

    if (notes.length) {
      out.push(section("Data notes"));
      out.push(
        `<tr><td colspan="99" style="border:0;padding:0;">`,
        `<div style="font-size:12px;color:${MUTED};line-height:1.7;">` +
          notes.map((n) => `• ${escapeHtml(n)}`).join("<br>") +
          `</div>`,
        `</td></tr>`
      );
    }
  }

  out.push(`</table></div>`);

  const text = [
    `PFI Daily Report — ${date}`,
    "",
    `Litres sold today   ${L(s.litresToday)}`,
    `Sales value today   ${m(s.valueToday)}`,
    `Collected today     ${m(s.collectedToday)}`,
    `Outstanding         ${m(s.outstanding)}`,
    "",
    `${s.activePfis || 0} active PFI(s), ${s.activeBatches || 0} truck-sales batch(es).`,
  ].join("\n");

  return { subject, html: out.join(""), text };
};

module.exports = { renderPfiDailyReportEmail };
