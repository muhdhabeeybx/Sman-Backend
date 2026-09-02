const asyncHandler = require("express-async-handler");
const { orderRepo } = require("../../repositories");

/**
 * Every confirmed payment, order by order — who paid, what for, which bank
 * statement line settled it, and HOW that line came to be attached to that
 * order.
 *
 * That last part is the point of `reconciliation` and `confirmationBasis`.
 * Both were supported by the repository and neither was passed through here,
 * so the two questions the report exists to answer — "can I check this against
 * a statement" and "did a person decide this, or did the software" — could not
 * be asked from the dashboard at all.
 */
const getFinanceReport = asyncHandler(async (req, res) => {
  const result = await orderRepo.findFinanceReport({
    search: req.query.search,
    paymentStatus: req.query.paymentStatus,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    depotId: req.query.depotId,
    pfiId: req.query.pfiId,
    productId: req.query.productId,
    reconciliation: req.query.reconciliation,
    confirmationBasis: req.query.confirmationBasis,
    scopeUser: req.user,
  });

  res.json({ success: true, data: result });
});

module.exports = { getFinanceReport };
