const asyncHandler = require("express-async-handler");
const { expectedPaymentRepo, orderRepo } = require("../../repositories");

const getExpectedPayments = asyncHandler(async (req, res) => {
  const { customerId, orderId, status, search } = req.query;
  const rows = await expectedPaymentRepo.findAll({ customerId, orderId, status, search, scopeUser: req.user });

  res.json({ success: true, data: { expectedPayments: rows, count: rows.length } });
});

const createExpectedPayment = asyncHandler(async (req, res) => {
  const { customerId, orderId, expectedAmount, reference, note } = req.body;

  if (!customerId) {
    return res.status(400).json({ success: false, message: "Customer is required" });
  }

  // Raised from the order wizard: inherit the order's depot/PFI so this note
  // is location/PFI-scoped the same way the order itself is. Raised
  // standalone (no orderId), it stays unattributed — see deposits.depotId.
  let depotId = null;
  let pfiId = null;
  if (orderId) {
    const order = await orderRepo.findById(Number(orderId));
    if (order) {
      depotId = order.depotId ?? null;
      pfiId = order.pfiId ?? null;
    }
  }

  const row = await expectedPaymentRepo.create({
    customerId: Number(customerId),
    orderId: orderId ? Number(orderId) : null,
    depotId,
    pfiId,
    expectedAmount: expectedAmount != null && expectedAmount !== "" ? String(expectedAmount) : null,
    reference: reference || "",
    note: note || "",
    createdBy: req.user?.id || null,
  });

  res.status(201).json({ success: true, message: "Expected payment noted", data: { expectedPayment: row } });
});

const resolveExpectedPayment = asyncHandler(async (req, res) => {
  const existing = await expectedPaymentRepo.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Expected payment not found" });
  }

  const { depositId } = req.body;
  if (!depositId) {
    return res.status(400).json({ success: false, message: "depositId is required to resolve this" });
  }

  const row = await expectedPaymentRepo.resolve(req.params.id, Number(depositId));
  res.json({ success: true, message: "Marked as resolved", data: { expectedPayment: row } });
});

const cancelExpectedPayment = asyncHandler(async (req, res) => {
  const existing = await expectedPaymentRepo.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Expected payment not found" });
  }

  const row = await expectedPaymentRepo.cancel(req.params.id);
  res.json({ success: true, message: "Cancelled", data: { expectedPayment: row } });
});

module.exports = {
  getExpectedPayments,
  createExpectedPayment,
  resolveExpectedPayment,
  cancelExpectedPayment,
};
