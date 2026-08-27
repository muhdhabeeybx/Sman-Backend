const asyncHandler = require("express-async-handler");
const { vendorRepo } = require("../../repositories");

const getVendors = asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const vendors = await vendorRepo.findAll({ search, status });

  res.json({
    success: true,
    data: { vendors, count: vendors.length },
  });
});

const getVendorById = asyncHandler(async (req, res) => {
  const vendor = await vendorRepo.findById(req.params.id);
  if (!vendor) {
    return res.status(404).json({ success: false, message: "Vendor not found" });
  }

  const [summary, expenses] = await Promise.all([
    vendorRepo.summaryFor(vendor.id),
    vendorRepo.expensesFor(vendor.id),
  ]);

  res.json({
    success: true,
    data: { vendor, summary, expenses },
  });
});

const createVendor = asyncHandler(async (req, res) => {
  const existing = await vendorRepo.findByName(req.body.name);
  if (existing) {
    return res.status(200).json({
      success: true,
      message: "A vendor with this name already exists",
      data: { vendor: existing },
    });
  }

  const vendor = await vendorRepo.create({ ...req.body, createdBy: req.user?.id ?? null });

  res.status(201).json({
    success: true,
    message: "Vendor saved",
    data: { vendor },
  });
});

const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorRepo.findById(req.params.id);
  if (!vendor) {
    return res.status(404).json({ success: false, message: "Vendor not found" });
  }

  const updated = await vendorRepo.update(req.params.id, req.body);

  res.json({
    success: true,
    message: "Vendor updated",
    data: { vendor: updated },
  });
});

module.exports = {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
};
