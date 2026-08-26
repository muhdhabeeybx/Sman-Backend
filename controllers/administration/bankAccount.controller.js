const asyncHandler = require("express-async-handler");
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

const createBankAccount = asyncHandler(async (req, res) => {
  const { bankName, accountName, accountNumber, bankCode, branchName, currency, status, isDefault, depotIds, lpgStationIds, usage, notes } = req.body;

  if (!bankName || !accountName || !accountNumber) {
    return res.status(400).json({
      success: false,
      message: "Bank name, account name, and account number are required",
    });
  }

  const account = await bankAccountRepo.create({
    bankName: bankName.trim(),
    accountName: accountName.trim(),
    accountNumber: accountNumber.trim(),
    bankCode: bankCode ? bankCode.trim() : "",
    branchName: branchName ? branchName.trim() : "",
    currency: currency || "NGN",
    status: status || "Active",
    isDefault: Boolean(isDefault),
    depotIds: Array.isArray(depotIds) ? depotIds : [],
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

  const updatedAccount = await bankAccountRepo.update(req.params.id, req.body);

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
