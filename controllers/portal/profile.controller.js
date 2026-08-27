const asyncHandler = require("express-async-handler");
const { customerRepo } = require("../../repositories");
const { publicCustomer } = require("../../utils/publicCustomer");

/**
 * The signed-in customer's own profile — publicCustomer plus the fields the
 * account screen needs that the auth payload deliberately omits: the
 * address.
 *
 * `virtualAccount` used to carry the customer's personal Paystack Dedicated
 * Virtual Account — their permanent self-service funding route. Wallet
 * funding is manual-deposit-only now (staff record deposits from the admin
 * dashboard; an order shows the depot's own bank account instead, see
 * order.service.js placeOrder), so this is always null. Kept in the response
 * shape — not removed — so the field can be repopulated without a client
 * contract change if DVA funding is reinstated:
 *
 * virtualAccount: customer.virtualAccountNumber
 *   ? {
 *       bank: customer.virtualAccountBank,
 *       accountNumber: customer.virtualAccountNumber,
 *       accountName: customer.virtualAccountName,
 *     }
 *   : null,
 */
const profilePayload = (customer) => ({
  customer: { ...publicCustomer(customer), address: customer.address || "" },
  virtualAccount: null,
});

/** GET /api/customer/profile */
const getMyProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: profilePayload(req.customer) });
});

/** PATCH /api/customer/profile — text fields only; see profile.schema. */
const updateMyProfile = asyncHandler(async (req, res) => {
  const allowed = ["name", "companyName", "email", "address"];
  const patch = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }

  const updated = await customerRepo.update(req.customer.id, patch);
  res.json({ success: true, message: "Profile updated", data: profilePayload(updated) });
});

module.exports = { getMyProfile, updateMyProfile };
