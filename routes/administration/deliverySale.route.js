const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const saleSchemas = require("../../schemas/deliverySale.schema");
const {
  getDeliverySales,
  getDeliverySaleById,
  createDeliverySale,
  updateDeliverySale,
  setDeliverySaleDepositStatus,
  deleteDeliverySale,
} = require("../../controllers/administration/deliverySale.controller");

router.get("/", verifyStaff, validate({ query: saleSchemas.listDeliverySales }), getDeliverySales);
router.get("/:id", verifyStaff, validate({ params: saleSchemas.idParam }), getDeliverySaleById);
router.post("/", verifyStaff, validate({ body: saleSchemas.createDeliverySale }), createDeliverySale);
router.patch("/:id", verifyStaff, validate({ params: saleSchemas.idParam, body: saleSchemas.updateDeliverySale }), updateDeliverySale);
// Narrower than the update route above, and deliberately so — it accepts
// depositStatus and nothing else.
router.patch("/:id/deposit-status", verifyStaff, validate({ params: saleSchemas.idParam, body: saleSchemas.setDepositStatus }), setDeliverySaleDepositStatus);
router.delete("/:id", verifyStaff, validate({ params: saleSchemas.idParam }), deleteDeliverySale);

module.exports = router;
