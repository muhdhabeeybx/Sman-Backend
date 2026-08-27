const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const { requireRole } = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const {
  idParamSchema,
  submitDailyReportSchema,
  amendDailyReportSchema,
  reviewDailyReportSchema,
  dailyReportQuerySchema,
  emailReportsHubSchema,
} = require("../../schemas/dailyReport.schema");
const {
  getDailyReports,
  getDailyReportById,
  submitDailyReport,
  deleteDailyReport,
  amendDailyReport,
  reviewDailyReport,
  emailDailyReports,
  CAN_VIEW_ALL_REPORTS,
} = require("../../controllers/administration/dailyReport.controller");

router.get("/", verifyStaff, validate({ query: dailyReportQuerySchema }), getDailyReports);
router.post(
  "/email",
  verifyStaff,
  requireRole(...CAN_VIEW_ALL_REPORTS, { message: "Reports Hub access required" }),
  validate({ body: emailReportsHubSchema }),
  emailDailyReports
);
router.get("/:id", verifyStaff, validate({ params: idParamSchema }), getDailyReportById);
router.delete("/:id", verifyStaff, deleteDailyReport);
router.post("/", verifyStaff, validate({ body: submitDailyReportSchema }), submitDailyReport);
router.patch(
  "/:id",
  verifyStaff,
  validate({ params: idParamSchema, body: amendDailyReportSchema }),
  amendDailyReport
);
router.post(
  "/:id/review",
  verifyStaff,
  validate({ params: idParamSchema, body: reviewDailyReportSchema }),
  reviewDailyReport
);

module.exports = router;
