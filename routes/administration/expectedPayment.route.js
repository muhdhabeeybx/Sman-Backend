const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const {
  getExpectedPayments,
  createExpectedPayment,
  resolveExpectedPayment,
  cancelExpectedPayment,
} = require("../../controllers/administration/expectedPayment.controller");

router.get("/", verifyStaff, getExpectedPayments);
router.post("/", verifyStaff, createExpectedPayment);
router.patch("/:id/resolve", verifyStaff, resolveExpectedPayment);
router.patch("/:id/cancel", verifyStaff, cancelExpectedPayment);

module.exports = router;
