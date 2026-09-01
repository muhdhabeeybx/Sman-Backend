const asyncHandler = require("express-async-handler");
const { depositRepo, customerRepo } = require("../../repositories");
const walletService = require("../../services/wallet.service");
const { processPaystackPayment } = require("../../services/payment.service");

const getDeposits = asyncHandler(async (req, res) => {
  const { customer, page = 1, limit = 50, type = "credit" } = req.query;

  const result = await depositRepo.findAll({ customer, page, limit, type, scopeUser: req.user });

  res.json({ success: true, data: result });
});

const getDepositById = asyncHandler(async (req, res) => {
  const deposit = await depositRepo.findByIdFull(req.params.id);

  if (!deposit) {
    return res.status(404).json({ success: false, message: "Deposit not found" });
  }

  res.json({ success: true, data: { deposit } });
});

/**
 * POST /deposits — withdrawn.
 *
 * This credited a CUSTOMER's wallet, either from bank statement lines or from
 * a typed-in amount. It is the front door to the model the finance desk asked
 * to be rid of: money arriving against a person rather than against the order
 * it was sent to pay for.
 *
 * Leaving it open would defeat everything else in this change. A statement
 * line consumed here disappears into a balance, and the only way it can then
 * reach an order is by being drawn on — which is the automatic draw that made
 * the report unauditable in the first place. Blocking it is what makes the
 * guarantee hold: every statement line either sits unmatched in the pool or is
 * recorded against exactly one order.
 *
 * Money that genuinely is not for any one order — an advance, a deposit
 * against future business — has no home in this system by design, and should
 * be matched to the order it eventually pays for, when that order exists.
 *
 * 410 rather than 404: a page still offering the button gets a sentence it can
 * show the user. See db/migrations/0021 and services/orderPayment.service.js.
 */
const createDeposit = asyncHandler(async (req, res) => {
  res.status(410).json({
    success: false,
    message:
      "Deposits are no longer recorded against a customer. Open the order the money was sent for and confirm it there against the bank statement line — that way the payment stays attached to the order, and the finance report can be checked against the statement line by line.",
  });
});

/** POST /deposits/transfer — move wallet balance from one customer to another. */
const transferBalance = asyncHandler(async (req, res) => {
  const { fromCustomer, toCustomer, amount, description } = req.body;

  if (!fromCustomer || !toCustomer || !amount) {
    return res.status(400).json({
      success: false,
      message: "fromCustomer, toCustomer and amount are required",
    });
  }

  const [from, to] = await Promise.all([
    customerRepo.findById(fromCustomer),
    customerRepo.findById(toCustomer),
  ]);
  if (!from) return res.status(404).json({ success: false, message: "Source customer not found" });
  if (!to) return res.status(404).json({ success: false, message: "Destination customer not found" });

  const result = await walletService.transfer({
    fromCustomerId: Number(fromCustomer),
    toCustomerId: Number(toCustomer),
    amount: Number(amount),
    description: description || "",
    recordedBy: req.user?.id || null,
  });

  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  res.status(201).json({
    success: true,
    message: `Transferred to ${to.name || `customer #${to.id}`}`,
    data: {
      debit: result.debit,
      credit: result.credit,
      fromBalance: result.fromCustomer.balance,
      toBalance: result.toCustomer.balance,
    },
  });
});

/** POST /deposits/:id/reverse — undo a credit deposit recorded against the wrong customer. */
const reverseDepositById = asyncHandler(async (req, res) => {
  const existing = await depositRepo.findByIdFull(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Deposit not found" });
  }

  const result = await walletService.reverseDeposit({
    depositId: Number(req.params.id),
    recordedBy: req.user?.id || null,
    description: req.body?.description || "",
  });

  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  const fullReversal = await depositRepo.findByIdFull(result.deposit.id);
  res.json({
    success: true,
    message: "Deposit reversed",
    data: { deposit: fullReversal, newBalance: result.customer.balance },
  });
});

/**
 * POST /deposits/:id/unmatch — undo a statement match.
 *
 * Detaches the deposit from whatever order it was attributed to, takes the
 * money back out of the wallet and returns its statement line to the
 * unmatched pool. Refused while that money is what funds a live order — the
 * response says to re-match that order instead, which brings a replacement.
 */
const unmatchDeposit = asyncHandler(async (req, res) => {
  const existing = await depositRepo.findByIdFull(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Deposit not found" });
  }

  const result = await walletService.unmatchStatementDeposit({
    depositId: Number(req.params.id),
    staffId: req.user?.id || null,
    description: req.body?.description || "",
  });

  if (!result.success) {
    return res.status(result.insufficient ? 409 : 400).json({
      success: false,
      message: result.message,
    });
  }

  res.json({
    success: true,
    message: result.freedLineIds.length
      ? "Unmatched — the statement line is back in the pool"
      : "Unmatched",
    data: {
      detachedFrom: result.detachedFrom,
      freedLineIds: result.freedLineIds,
    },
  });
});

const syncPaystackDeposit = asyncHandler(async (req, res) => {
  const { reference } = req.body;

  if (!reference || typeof reference !== "string" || !reference.trim()) {
    return res.status(400).json({
      success: false,
      message: "Paystack transaction reference is required",
    });
  }

  const result = await processPaystackPayment({ reference: reference.trim() }, "manual_sync");

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.message,
    });
  }

  res.status(200).json({
    success: true,
    message: result.alreadyProcessed
      ? result.message
      : `Deposit successfully processed and credited for reference ${reference.trim()}`,
    data: result,
  });
});

module.exports = {
  getDeposits, getDepositById, createDeposit, syncPaystackDeposit,
  transferBalance, reverseDepositById, unmatchDeposit,
};
