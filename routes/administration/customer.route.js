const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const customerSchemas = require("../../schemas/customer.schema");
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerSegment,
} = require("../../controllers/administration/customer.controller");

router.get("/", verifyStaff, validate({ query: customerSchemas.listCustomers }), getCustomers);
// Before "/:id" — Express matches in declaration order, and "segments" would
// otherwise be swallowed as an :id value.
router.get("/segments", verifyStaff, validate({ query: customerSchemas.segmentCustomers }), getCustomerSegment);
router.get("/:id", verifyStaff, validate({ params: customerSchemas.idParam }), getCustomerById);
router.post("/", verifyStaff, validate({ body: customerSchemas.createCustomer }), createCustomer);
router.patch("/:id", verifyStaff, validate({ params: customerSchemas.idParam, body: customerSchemas.updateCustomer }), updateCustomer);
router.delete("/:id", verifyStaff, validate({ params: customerSchemas.idParam }), deleteCustomer);

module.exports = router;
