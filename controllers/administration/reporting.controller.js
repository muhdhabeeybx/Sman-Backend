const asyncHandler = require("express-async-handler");
const reportingService = require("../../services/reporting.service");
const { auditEventRepo, orderTruckRepo } = require("../../repositories");

// Thin fan-out over the reporting service: every endpoint is read-only.
const wrap = (fn) =>
  asyncHandler(async (req, res) => {
    const data = await fn(req.query);
    res.json({ success: true, data });
  });

module.exports = {
  salesSummary: wrap(reportingService.salesSummary),
  walletSummary: wrap(reportingService.walletSummary),
  pfiSummary: wrap(reportingService.pfiSummary),
  deliverySummary: wrap(reportingService.deliverySummary),
  fleetSummary: wrap(reportingService.fleetSummary),
  stationSummary: wrap(reportingService.stationSummary),
  outstandingPayments: wrap(reportingService.outstandingPayments),
  dailyReportSummary: wrap(reportingService.dailyReportSummary),
  revenueSummary: wrap(reportingService.revenueSummary),
  auditTrail: asyncHandler(async (req, res) => {
    const data = await auditEventRepo.findAll(req.query);
    res.json({ success: true, data });
  }),
  /**
   * Every truck the gate handled in a period — in, out, by whom, and
   * everything recorded about the load. Scoped like every other report, so an
   * officer sees their own location.
   */
  gateMovements: asyncHandler(async (req, res) => {
    const data = await orderTruckRepo.findGateMovements({
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      depotId: req.query.depotId,
      pfiId: req.query.pfiId,
      search: req.query.search,
      scopeUser: req.user,
    });
    res.json({ success: true, data });
  }),
};
