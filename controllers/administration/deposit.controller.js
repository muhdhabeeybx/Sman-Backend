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

const createDeposit = asyncHandler(async (req, res) => {
  const {
    customer: customerId,
    amount,
    type = "credit",
    description,
    reference,
    bankAccountId,
    bankName,
    accountName,
    accountNumber,
    depositorName,
    paymentDate,
    paystackDetails,
    lineIds,
    orderId,
  } = req.body;

  const fromStatementLines = Array.isArray(lineIds) && lineIds.length > 0;

  if (!customerId || (!amount && !fromStatementLines)) {
    return res.status(400).json({
      success: false,
      message: "Customer and amount are required",
    });
  }

  if (type !== "credit") {
    return res.status(400).json({
      success: false,
      message: "Deposit only handles money coming in (type must be 'credit')",
    });
  }

  const customer = await customerRepo.findById(customerId);
  if (!customer) {
    return res.status(404).json({ success: false, message: "Customer not found" });
  }

  // Several statement lines, one deposit each: every line's own amount,
  // depositor, date and reference stay intact rather than being summed into
  // one row — see wallet.service.js. A claim/credit failure partway through
  // throws and rolls the whole transaction back (handled by errorHandler).
  if (fromStatementLines) {
    if (!bankAccountId) {
      return res.status(400).json({
        success: false,
        message: "bankAccountId is required to claim statement lines",
      });
    }

    const result = await walletService.creditFromStatementLines({
      customerId,
      bankAccountId: Number(bankAccountId),
      lineIds: lineIds.map(Number),
      staffId: req.user?.id || null,
      description,
      orderId: orderId ? Number(orderId) : null,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    const fullDeposits = await Promise.all(
      result.deposits.map((d) => depositRepo.findByIdFull(d.id)),
    );
    return res.status(201).json({
      success: true,
      message: `Recorded ${fullDeposits.length} deposit${fullDeposits.length === 1 ? "" : "s"} from ${result.claimedLines.length} bank statement line${result.claimedLines.length === 1 ? "" : "s"}`,
      data: { deposits: fullDeposits, totalAmount: result.totalAmount, deposit: fullDeposits[0] },
    });
  }

  const metadata = paystackDetails || {
    paymentMethod: "manual_bank_transfer",
    bankAccountId: bankAccountId || null,
    bankName: bankName || null,
    accountName: accountName || null,
    accountNumber: accountNumber || null,
    senderName: depositorName || null,
    paidAt: paymentDate || new Date().toISOString(),
    channel: "manual_bank_transfer",
    // No statement line to stamp matchedOrderId on for a typed-amount
    // deposit — this is the only trail linking it back to the order it was
    // recorded to confirm.
    ...(orderId ? { orderId: Number(orderId) } : {}),
  };

  const depositDescription =
    description ||
    (bankName && accountNumber
      ? `Manual deposit into ${bankName} (${accountNumber})`
      : "Manual bank deposit");

  const depositRef =
    reference && reference.trim()
      ? reference.trim()
      : `DEP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

  // Ledger row and balance move together or not at all; a duplicate
  // reference is reported instead of crediting the balance twice.
  const result = await walletService.credit({
    customerId,
    amount: Number(amount),
    description: depositDescription,
    reference: depositRef,
    paystackDetails: metadata,
    recordedBy: req.user?.id || null,
  });

  if (result.alreadyProcessed) {
    return res.status(409).json({
      success: false,
      message: result.message,
    });
  }

  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  const fullDeposit = await depositRepo.findByIdFull(result.deposit.id);

  res.status(201).json({
    success: true,
    message: "Deposit recorded successfully",
    data: { deposit: fullDeposit },
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
