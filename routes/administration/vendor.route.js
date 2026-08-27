const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const misc = require("../../schemas/misc.schema");
const {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
} = require("../../controllers/administration/vendor.controller");

router.get("/", verifyStaff, getVendors);
router.get("/:id", verifyStaff, getVendorById);
router.post("/", verifyStaff, validate({ body: misc.createVendor }), createVendor);
router.patch("/:id", verifyStaff, validate({ params: misc.idParam, body: misc.updateVendor }), updateVendor);

module.exports = router;
