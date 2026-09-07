const asyncHandler = require("express-async-handler");
const { dailyReportRepo } = require("../../repositories");
const dailyReportService = require("../../services/dailyReport.service");
const { sendServiceResult } = require("../../utils/serviceResult");
const { staffActor } = require("../../utils/actor");
const { notifyAndWait } = require("../../notifications");
const { sendDailyReportToWhatsApp } = require("../../services/whatsappReport.service");
const { buildCombinedDailyReportData } = require("../../services/dailyCombinedReport.service");

// Roles that manage reports rather than file them — the Reports Hub's own
// allowed-roles list (see rbac.ts '/admin-reports'). Everyone else only ever
// sees their own submissions, no matter what the query string asks for:
// trusting a client-supplied submittedBy here would let any reporting role
// read any other filer's numbers by hand-editing the request.
const CAN_VIEW_ALL_REPORTS = new Set([
  "admin",
  "super_admin",
  "audit",
  "expenditure_officer",
  // Owns the CFO stage of the expense chain and is treated as oversight
  // alongside audit throughout — see ALL_EXPENSES_ROLES in lib/expenseChain.js.
  "finance",
]);

const getDailyReports = asyncHandler(async (req, res) => {
  const roles = new Set(req.user?.roles || []);
  const canViewAll = [...roles].some((r) => CAN_VIEW_ALL_REPORTS.has(r));
  const result = await dailyReportRepo.findAll({
    ...req.query,
    submittedBy: canViewAll ? req.query.submittedBy : req.user?.id,
    // A role that oversees reports still only sees their assigned
    // locations/PFIs once an admin has scoped them — the role check alone
    // predates location/PFI scope and doesn't know about it.
    scopeUser: canViewAll ? req.user : null,
  });
  res.json({ success: true, data: result });
});

const getDailyReportById = asyncHandler(async (req, res) => {
  const report = await dailyReportRepo.findById(req.params.id);
  if (!report) {
    return res.status(404).json({ success: false, message: "Report not found" });
  }
  res.json({ success: true, data: { report } });
});

const submitDailyReport = asyncHandler(async (req, res) => {
  const result = await dailyReportService.submitReport(req.body, { actor: staffActor(req) });
  sendServiceResult(res, result, { successStatus: 201, message: "Report submitted" });
});

const amendDailyReport = asyncHandler(async (req, res) => {
  const result = await dailyReportService.amendReport(req.params.id, req.body, {
    actor: staffActor(req),
  });
  sendServiceResult(res, result, { message: "Report amended" });
});

const reviewDailyReport = asyncHandler(async (req, res) => {
  const result = await dailyReportService.reviewReport(req.params.id, req.body, {
    actor: staffActor(req),
  });
  sendServiceResult(res, result, {
    message: req.body.approve ? "Report approved" : "Report rejected",
  });
});

/**
 * Remove a report. Only the person who filed it, or an admin.
 *
 * Role gating upstream was client-side only — localStorage decided which panel
 * rendered and the API enforced nothing, so any signed-in user could file or
 * remove any report type by hand.
 */
const deleteDailyReport = asyncHandler(async (req, res) => {
  const existing = await dailyReportRepo.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "Report not found" });

  const roles = new Set(req.user?.roles || []);
  const mine = Number(existing.submittedBy) === Number(req.user?.id);
  if (!mine && !roles.has("admin") && !roles.has("super_admin")) {
    return res.status(403).json({ success: false, message: "You can only delete your own reports" });
  }

  await dailyReportRepo.remove(existing.id);
  res.json({ success: true, message: "Report deleted" });
});

/**
 * The Hub's "Email report" button. Builds the same combined report as the
 * scheduled job (`scripts/send-daily-report.js`) for whatever date the admin
 * is looking at, and sends it to a recipient list typed in on the spot
 * rather than a fixed env var. The email is the readable summary and nothing
 * else — no attachment, and the location/PFI filter is ignored, since the
 * combined report already covers every depot for the date in one email.
 */
/**
 * The day's trading as a WhatsApp message, sent when somebody presses send.
 *
 * Text only and no attachment: this is read on a phone, and a workbook there
 * is a file nobody opens. Manual rather than scheduled for the same reason the
 * email is not — an email waits in an inbox, a WhatsApp message interrupts, so
 * who gets interrupted is a decision rather than a cron expression.
 */
const whatsappDailyReports = asyncHandler(async (req, res) => {
  const { recipients, reportDate, preview } = req.body;

  const result = await sendDailyReportToWhatsApp({ date: reportDate, recipients, preview });

  // A preview resolved everything and sent nothing, so it is a success with an
  // empty `sent` — which the partial-success rule below would otherwise read
  // as a total failure.
  if (result.preview) {
    return res.json({
      success: true,
      message: result.templateName
        ? `Would send template "${result.templateName}" with ${result.parameters.length} parameter${result.parameters.length === 1 ? "" : "s"}`
        : "Would send as plain text",
      data: result,
    });
  }

  /**
   * Always 200 on a request that was understood and carried out.
   *
   * This used to answer 502 when nothing sent, which was wrong twice over.
   * A gateway error describes infrastructure, and the commonest reason for
   * sending nothing is a setting — WHATSAPP_ENABLED being off. Worse, a
   * non-2xx makes the browser client throw, so the per-recipient reasons in
   * `failed` were discarded and the operator saw "502 Bad Gateway" with no
   * hint of the cause. The outcome belongs in the body, where it can be read.
   *
   * Partial success is still reported as partial: a send that reached two of
   * five managers and said "sent" is how the desk ends up believing somebody
   * was told something they never saw.
   */
  const ok = result.sent.length > 0;
  const message = ok
    ? `Sent to ${result.sent.length} number${result.sent.length === 1 ? "" : "s"}` +
      (result.failed.length ? `, ${result.failed.length} failed` : "")
    : result.disabled
      ? "WhatsApp sending is switched off — set WHATSAPP_ENABLED=true to send"
      : result.configHint
        // The template mismatch names its own fix; repeating the generic
        // "could not send" over it would bury the useful half.
        ? `${result.failed[0]?.error || "Template mismatch"}. ${result.configHint}`
        : "Could not send to any of those numbers";

  res.json({ success: ok, message, data: result });
});

const emailDailyReports = asyncHandler(async (req, res) => {
  const { recipients, reportDate } = req.body;

  const data = await buildCombinedDailyReportData(reportDate ? new Date(reportDate) : new Date());
  const result = await notifyAndWait("reports.hub_email", {
    to: recipients.map((email) => ({ email })),
    data,
  });

  // notifyAndWait never throws — a provider outage must not read as a 500 — so
  // success is judged from what the email channel actually did.
  //
  // `result.delivered` cannot answer that. It counts recipients the engine got
  // through without throwing, and a provider refusal is not a throw: Resend
  // rejecting every address for an unverified sending domain still produced
  // delivered === 1, so this endpoint answered "Sent to 1 recipient" while the
  // delivery log recorded the refusal and nothing reached anyone. A click that
  // claims "sent" and delivers nothing is worse than an honest failure, which
  // is the whole reason this endpoint waits for the dispatch at all.
  const rows = result?.results || [];
  const sent = rows.filter((r) => r.channels?.email === "sent" || r.channels?.email === "partial");
  const problems = rows
    .filter((r) => !sent.includes(r))
    .map((r) => r.error || r.channelErrors?.email || (r.suppressed || []).find((s) => s.channel === "email")?.reason)
    .filter(Boolean);

  if (result?.error || sent.length === 0) {
    // 422, not the 502 this answered with before — even though "the email
    // provider refused" is precisely what 502 describes. A 502 never reached
    // the browser: the edge in front of this app reads that status as "the
    // origin is broken", drops the response and serves its own error page,
    // which carries no CORS headers. So the dashboard logged a CORS violation,
    // axios raised a bare "Network Error", and the toast showed that instead of
    // the reason — the provider's own words were lost at the last hop, after
    // everything above went to the trouble of collecting them. A 4xx is passed
    // through untouched, so the message actually arrives.
    return res.status(422).json({
      success: false,
      // The provider's own words. "The report could not be sent" is only
      // reached when nothing said anything at all.
      message: result?.error || problems[0] || "The report could not be sent",
    });
  }

  res.json({
    success: true,
    message:
      sent.length < recipients.length
        ? `Sent to ${sent.length} of ${recipients.length} recipients — ${[...new Set(problems)].join("; ")}`
        : `Sent to ${sent.length} recipient${sent.length === 1 ? "" : "s"}`,
  });
});

module.exports = {
  deleteDailyReport,
  getDailyReports,
  getDailyReportById,
  submitDailyReport,
  amendDailyReport,
  reviewDailyReport,
  emailDailyReports,
  whatsappDailyReports,
  CAN_VIEW_ALL_REPORTS,
};
