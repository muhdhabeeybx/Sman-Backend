const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const reporting = require("../../controllers/administration/reporting.controller");

router.get("/sales", verifyStaff, reporting.salesSummary);
router.get("/wallets", verifyStaff, reporting.walletSummary);
router.get("/pfis", verifyStaff, reporting.pfiSummary);
router.get("/deliveries", verifyStaff, reporting.deliverySummary);
router.get("/fleet", verifyStaff, reporting.fleetSummary);
router.get("/stations", verifyStaff, reporting.stationSummary);
router.get("/outstanding", verifyStaff, reporting.outstandingPayments);
router.get("/daily-reports", verifyStaff, reporting.dailyReportSummary);
router.get("/revenue", verifyStaff, reporting.revenueSummary);
router.get("/audit-trail", verifyStaff, reporting.auditTrail);
router.get("/gate-movements", verifyStaff, reporting.gateMovements);

module.exports = router;
