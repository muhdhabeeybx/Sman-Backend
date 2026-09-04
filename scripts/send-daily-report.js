#!/usr/bin/env node
/**
 * Build and send the daily reports.
 *
 *   npm run report:daily                 both reports, for today
 *   npm run report:daily -- --date=2026-08-09
 *   npm run report:daily -- --dry        build the files, send nothing
 *   npm run report:daily -- --to=a@b.com,c@d.com
 *   npm run report:daily -- --only=staff-sales
 *
 * Django ran these from Celery Beat. The scheduled trigger now lives in
 * jobs/scheduler.js, as a pg-boss cron at 23:50 Africa/Lagos — and it calls the
 * SAME function this script does, services/dailyReportDispatch.js. That is the
 * point: two triggers, one send path, so the scheduled report and the hand-run
 * one cannot drift apart.
 *
 * This script stays because a report sometimes has to be re-sent by hand, for a
 * past date, or previewed without mailing anybody.
 *
 *   --force  send again even though tonight's is already logged as sent
 *
 * The two reports are shaped differently on purpose:
 *   "daily"        the combined HTML report (staff entries / PFI stock / orders
 *                   per depot) — matches Django's _build_combined_html_report(),
 *                   sent as the email body itself, no attachment.
 *   "staff-sales"  the staff sales workbook, unchanged — an .xlsx attachment.
 *
 * Recipients come from REPORT_RECIPIENTS (comma-separated) unless --to is given.
 * With neither set the script refuses rather than silently mailing nobody —
 * Django's equivalent read a ReportRecipient table that was empty on a fresh
 * install, and the reports quietly went nowhere for weeks.
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { buildStaffSalesReport } = require("../services/reportWorkbook.service");
const { buildCombinedDailyReportData } = require("../services/dailyCombinedReport.service");
const { renderDailyReportEmail } = require("../notifications/templates/dailyReportEmail");
const { dispatchDailyReports, resolveRecipients } = require("../services/dailyReportDispatch.service");
const { client } = require("../db");

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const flag = (name) => process.argv.includes(`--${name}`);

(async () => {
  const dateArg = arg("date");
  const date = dateArg ? new Date(dateArg) : new Date();
  if (Number.isNaN(date.getTime())) {
    console.error(`Not a date: ${dateArg}`);
    process.exit(1);
  }

  const only = arg("only");
  const dry = flag("dry");
  const force = flag("force");

  // --dry never sends, so it never goes through the dispatcher: it builds the
  // same artefacts and writes them to disk for inspection.
  if (dry) {
    const reportDate = new Date(date).toISOString().slice(0, 10);
    if (only !== "staff-sales") {
      const data = await buildCombinedDailyReportData(date);
      const { html, text, subject } = renderDailyReportEmail(data);
      const out = path.join(process.cwd(), `daily-report-${data.reportDate}.html`);
      fs.writeFileSync(out, html);
      console.log(
        `→ reports.daily  ${data.locations.length} location(s), ${data.totals.orderCount} order(s), ` +
          `${data.totals.qtyLitres.toLocaleString()} L, ₦${data.totals.amountNaira.toLocaleString()}`
      );
      console.log(`  subject: ${subject}`);
      console.log(`  text part:\n${text.split("\n").map((l) => `    ${l}`).join("\n")}`);
      console.log(`  html written to ${out} — nothing sent (--dry)`);
    }
    if (only !== "daily") {
      const result = await buildStaffSalesReport(date);
      const out = path.join(process.cwd(), result.filename);
      fs.writeFileSync(out, result.buffer);
      console.log(`→ ${result.filename}  (${result.buffer.length.toLocaleString()} bytes)`);
      console.log(`  written to ${out} — nothing sent (--dry)`);
    }
    void reportDate;
  } else {
    const recipients = resolveRecipients(arg("to"));
    if (recipients.length === 0) {
      console.error(
        "No recipients. Set REPORT_RECIPIENTS in .env or pass --to=a@b.com.\n" +
          "Refusing to build a report nobody receives."
      );
      process.exit(1);
    }

    const result = await dispatchDailyReports({ date, to: arg("to"), only, force });
    console.log(`→ daily report ${result.reportDate}`);
    if (result.sent.length) console.log(`  sent: ${result.sent.join(", ")} → ${result.recipients.join(", ")}`);
    if (result.skipped.length) {
      console.log(
        `  skipped (already sent today): ${result.skipped.join(", ")}  — re-send with --force`
      );
    }
  }

  await client.end({ timeout: 5 });
  process.exit(0);
})().catch((err) => {
  console.error("send-daily-report failed:", err.message || err);
  process.exit(1);
});
