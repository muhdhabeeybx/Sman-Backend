#!/usr/bin/env node
/**
 * The per-PFI daily report: look at it, then send it.
 *
 * Preview writes the HTML to a file and sends nothing, because a report is a
 * document — the only way to know whether it reads well is to read it. Sending
 * a draft to the recipient list to find out is how a distribution list learns
 * to filter the report into a folder.
 *
 *   node scripts/send-pfi-report.js                          preview today
 *   node scripts/send-pfi-report.js --date=2026-09-08        preview a date
 *   node scripts/send-pfi-report.js --json                   the data, no HTML
 *   node scripts/send-pfi-report.js --to=a@b.com             send it
 *
 * --to is the only thing that sends, and it takes explicit addresses rather
 * than falling back to REPORT_RECIPIENTS. This report is new; nobody should be
 * able to mail the whole list by forgetting a flag.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

async function main() {
  const { buildPfiDailyReportData } = require("../services/pfiDailyReport.service");
  const { renderPfiDailyReportEmail } = require("../notifications/templates/pfiDailyReportEmail");

  const dateArg = arg("date");
  const date = dateArg ? new Date(`${dateArg}T12:00:00Z`) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(`--date=${dateArg} is not a date`);

  const data = await buildPfiDailyReportData(date);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const rendered = renderPfiDailyReportEmail(data);
  const to = (arg("to") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!to.length) {
    const out = path.join(process.cwd(), `pfi-report-${data.reportDate}.html`);
    fs.writeFileSync(out, rendered.html);

    const s = data.summary;
    console.log(`\n${rendered.subject}\n`);
    console.log(`  litres sold      ${Number(s.litresSold).toLocaleString("en-NG")} L`);
    console.log(`  sales value      ₦${Math.round(s.salesValue).toLocaleString("en-NG")}`);
    console.log(`  funds received   ₦${Math.round(s.fundsReceived).toLocaleString("en-NG")}`);
    console.log(`  balance          ₦${Math.round(s.balance).toLocaleString("en-NG")}`);
    console.log(
      `\n  ${s.activePfis} active PFI(s), ${s.activeBatches} truck-sales batch(es), ${s.activeStations} filling station(s)` +
        (s.settled?.lines ? `, ${s.settled.lines} completed line(s) omitted` : "")
    );
    console.log(`\n  written to ${out}  (${Math.round(rendered.html.length / 1024)}KB — Gmail clips at 100KB)`);
    console.log(`  open it:  open ${JSON.stringify(out)}`);
    console.log(`\n  nothing sent. Add --to=you@example.com to send it.\n`);
    return;
  }

  const { notifyAndWait } = require("../notifications");
  const result = await notifyAndWait("reports.pfi_daily", { to: to.map((email) => ({ email })), data });

  // notifyAndWait does not throw on a provider refusal — it records it — so
  // success is read from what the email channel actually did, not from the
  // call returning. See the same reasoning in dailyReport.controller.
  const rows = result?.results || [];
  const sent = rows.filter((r) => r.channels?.email === "sent" || r.channels?.email === "partial");
  const failed = rows.filter((r) => !sent.includes(r));

  console.log(`\n${rendered.subject}`);
  console.log(`  sent to ${sent.length}/${rows.length} recipient(s)`);
  for (const f of failed) {
    console.log(`  FAILED  ${f.principal?.email || "?"} — ${f.error || f.channelErrors?.email || "no reason given"}`);
  }
  console.log("");
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
