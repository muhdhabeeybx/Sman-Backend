const asyncHandler = require("express-async-handler");
const { deliverySaleRepo, deliveryCustomerRepo } = require("../../repositories");
// Paystack DVA auto-generation is disabled — see createDeliverySale below.
// Re-add this import if reinstating:
// const { generateDeliveryCustomerDva } = require("../../services/deliveryCustomerDva.service");

const getDeliverySales = asyncHandler(async (req, res) => {
  const { search, customer, truck_number, date_from, date_to, page = 1, limit = 500 } = req.query;

  const result = await deliverySaleRepo.findAll({
    search,
    customer,
    truck_number,
    date_from,
    date_to,
    page,
    limit,
  });

  res.json({ success: true, data: result });
});

const getDeliverySaleById = asyncHandler(async (req, res) => {
  const sale = await deliverySaleRepo.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: "Sale record not found" });
  }
  res.json({ success: true, data: { sale } });
});

const createDeliverySale = asyncHandler(async (req, res) => {
  // Paystack DVA auto-generation (disabled — manual deposit only): delivery
  // customers used to get a personal DVA on first truck assignment so a bank
  // transfer could auto-credit their wallet. Wallet funding is
  // manual-deposit-only now (staff record deposits from the admin
  // dashboard), so there's nothing to auto-generate. Kept for
  // reinstatement — restore this block and the import above.
  //
  // if (req.body.customer) {
  //   try {
  //     const customer = await deliveryCustomerRepo.findById(req.body.customer);
  //     if (customer && !customer.virtualAccountNumber) {
  //       const dvaResult = await generateDeliveryCustomerDva(customer);
  //       if (dvaResult.success) {
  //         console.log(`DVA generated for customer ${customer.name}: ${dvaResult.data.accountNumber}`);
  //       } else {
  //         console.warn(`DVA generation failed for customer ${customer.name}: ${dvaResult.message}`);
  //       }
  //     }
  //   } catch (dvaErr) {
  //     console.warn("DVA auto-generation error (non-blocking):", dvaErr.message);
  //   }
  // }

  const sale = await deliverySaleRepo.create(req.body);
  res.status(201).json({
    success: true,
    message: "Delivery sale record created",
    data: { sale },
  });
});

const updateDeliverySale = asyncHandler(async (req, res) => {
  const sale = await deliverySaleRepo.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: "Sale record not found" });
  }

  const updated = await deliverySaleRepo.update(sale.id, req.body);

  res.json({
    success: true,
    message: "Delivery sale record updated",
    data: { sale: updated },
  });
});

/**
 * Confirm (or un-confirm) a hand-recorded deposit.
 *
 * Its own route because depositStatus is deliberately absent from the update
 * schema — see the audit note in schemas/deliverySale.schema.js. The UI's
 * toggle previously sent it on the update route, where zod stripped it, so
 * the status never moved while the toast said it had.
 */
const setDeliverySaleDepositStatus = asyncHandler(async (req, res) => {
  const sale = await deliverySaleRepo.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: "Sale record not found" });
  }

  const updated = await deliverySaleRepo.update(sale.id, {
    depositStatus: req.body.depositStatus,
  });

  res.json({
    success: true,
    message: `Deposit marked ${req.body.depositStatus}`,
    data: { sale: updated },
  });
});

const deleteDeliverySale = asyncHandler(async (req, res) => {
  const sale = await deliverySaleRepo.deleteById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: "Sale record not found" });
  }
  res.json({ success: true, message: "Delivery sale deleted" });
});

module.exports = {
  getDeliverySales,
  getDeliverySaleById,
  createDeliverySale,
  updateDeliverySale,
  setDeliverySaleDepositStatus,
  deleteDeliverySale,
};
