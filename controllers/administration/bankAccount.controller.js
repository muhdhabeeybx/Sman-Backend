const asyncHandler = require("express-async-handler");
const { inArray } = require("drizzle-orm");
const { db } = require("../../config/db");
const { pfis } = require("../../db/schema");
const { bankAccountRepo } = require("../../repositories");

const getBankAccounts = asyncHandler(async (req, res) => {
  const { search, status, depotId, lpgStationId, usage } = req.query;
  const accounts = await bankAccountRepo.findAll({ search, status, depotId, lpgStationId, usage });

  res.json({
    success: true,
    data: { bankAccounts: accounts, count: accounts.length },
  });
});

const getBankAccountById = asyncHandler(async (req, res) => {
  const account = await bankAccountRepo.findById(req.params.id);

  if (!account) {
    return res.status(404).json({ success: false, message: "Bank account not found" });
  }

  res.json({
    success: true,
    data: { bankAccount: account },
  });
});


/**
 * The locations the chosen PFIs sit in.
 *
 * depot_ids is no longer picked by hand — a location is what the assigned
 * PFIs imply. Deriving it on every save keeps everything still reading it (the
 * subaccount lookup, staff scope, the accounts list) working, and makes it
 * impossible for the two to disagree.
 */
async function depotsForPfis(pfiIds) {
  const ids = (Array.isArray(pfiIds) ? pfiIds : []).map(Number).filter((n) => !Number.isNaN(n));
  if (!ids.length) return { pfiIds: [], depotIds: [] };
  const rows = await db
    .select({ locationId: pfis.locationId })
    .from(pfis)
    .where(inArray(pfis.id, ids));
  const depotIds = [...new Set(rows.map((r) => r.locationId).filter((v) => v != null))];
  return { pfiIds: ids, depotIds };
}

const createBankAccount = asyncHandler(async (req, res) => {
  const { bankName, accountName, accountNumber, bankCode, branchName, currency, status, isDefault, pfiIds, lpgStationIds, usage, notes } = req.body;

  if (!bankName || !accountName || !accountNumber) {
    return res.status(400).json({
      success: false,
      message: "Bank name, account name, and account number are required",
    });
  }

  const scoped = await depotsForPfis(pfiIds);

  const account = await bankAccountRepo.create({
    bankName: bankName.trim(),
    accountName: accountName.trim(),
    accountNumber: accountNumber.trim(),
    bankCode: bankCode ? bankCode.trim() : "",
    branchName: branchName ? branchName.trim() : "",
    currency: currency || "NGN",
    status: status || "Active",
    isDefault: Boolean(isDefault),
    pfiIds: scoped.pfiIds,
    depotIds: scoped.depotIds,
    lpgStationIds: Array.isArray(lpgStationIds) ? lpgStationIds : [],
    usage: Array.isArray(usage) ? usage : [],
    notes: notes || "",
  });

  res.status(201).json({
    success: true,
    message: "Bank account created successfully",
    data: { bankAccount: account },
  });
});

const updateBankAccount = asyncHandler(async (req, res) => {
  const account = await bankAccountRepo.findById(req.params.id);

  if (!account) {
    return res.status(404).json({ success: false, message: "Bank account not found" });
  }

  // Same rule as create: the locations follow the PFIs. Only recomputed when
  // pfiIds is actually part of the update, so a patch changing only the bank
  // name does not silently clear the assignment.
  const patch = { ...req.body };
  if (patch.pfiIds !== undefined) {
    const scoped = await depotsForPfis(patch.pfiIds);
    patch.pfiIds = scoped.pfiIds;
    patch.depotIds = scoped.depotIds;
  }

  const updatedAccount = await bankAccountRepo.update(req.params.id, patch);

  res.json({
    success: true,
    message: "Bank account updated successfully",
    data: { bankAccount: updatedAccount },
  });
});

const deleteBankAccount = asyncHandler(async (req, res) => {
  const account = await bankAccountRepo.findById(req.params.id);

  if (!account) {
    return res.status(404).json({ success: false, message: "Bank account not found" });
  }

  await bankAccountRepo.delete(req.params.id);

  res.json({
    success: true,
    message: "Bank account deleted successfully",
  });
});

module.exports = {
  getBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
};
