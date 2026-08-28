const asyncHandler = require("express-async-handler");
const { dailyReportRepo } = require("../../repositories");
const dailyReportService = require("../../services/dailyReport.service");
const { sendServiceResult } = require("../../utils/serviceResult");
const { staffActor } = require("../../utils/actor");
const { notifyAndWait } = require("../../notifications");
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
 * rather than a fixed env var. Any workbook/location/PFI filter the client
 * still sends is ignored — the combined report already covers every depot
 * for the date in one email.
 */
const emailDailyReports = asyncHandler(async (req, res) => {
  const { recipients, reportDate } = req.body;

  const data = await buildCombinedDailyReportData(reportDate ? new Date(reportDate) : new Date());
  const result = await notifyAndWait("reports.hub_email", {
    to: recipients.map((email) => ({ email })),
    data,
  });

  // notifyAndWait never throws — a provider outage must not read as a 500 —
  // so success is judged from what actually delivered, not from the call
  // returning at all. This is the one place that distinction matters: a
  // scheduled report going quiet is invisible, but a click that claims
  // "sent" while delivering nothing is the same bug the CLI script's own
  // refusal-with-no-recipients guard exists to avoid.
  const delivered = result?.delivered ?? 0;
  const failed = (result?.results || []).filter((r) => r.error);
  if (result?.error || delivered === 0) {
    return res.status(502).json({
      success: false,
      message: result?.error || failed[0]?.error || "The report could not be sent",
    });
  }

  res.json({
    success: true,
    message:
      delivered < recipients.length
        ? `Sent to ${delivered} of ${recipients.length} recipients — ${failed.map((f) => f.error).join("; ")}`
        : `Sent to ${delivered} recipient${delivered === 1 ? "" : "s"}`,
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
  CAN_VIEW_ALL_REPORTS,
};
