const asyncHandler = require("express-async-handler");
const { orderRepo } = require("../../repositories");

/**
 * Every confirmed payment, order by order — who paid, what for, which wallet
 * funded it (and its balance before/after), and, where the allocation ledger
 * reaches, which deposit(s) originally topped that wallet up.
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
    scopeUser: req.user,
  });

  res.json({ success: true, data: result });
});

module.exports = { getFinanceReport };
