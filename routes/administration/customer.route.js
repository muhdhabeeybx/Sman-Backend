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
const phones = require("../../controllers/administration/customerPhone.controller");

router.get("/", verifyStaff, validate({ query: customerSchemas.listCustomers }), getCustomers);
// Before "/:id" — Express matches in declaration order, and "segments" would
// otherwise be swallowed as an :id value.
router.get("/segments", verifyStaff, validate({ query: customerSchemas.segmentCustomers }), getCustomerSegment);
router.get("/:id", verifyStaff, validate({ params: customerSchemas.idParam }), getCustomerById);
router.post("/", verifyStaff, validate({ body: customerSchemas.createCustomer }), createCustomer);
router.patch("/:id", verifyStaff, validate({ params: customerSchemas.idParam, body: customerSchemas.updateCustomer }), updateCustomer);
router.delete("/:id", verifyStaff, validate({ params: customerSchemas.idParam }), deleteCustomer);

/**
 * The numbers one customer signs in on.
 *
 * Nested under the customer because that is what they belong to — there is no
 * useful "all phone numbers" list, and every one of these already has the
 * customer id in the path to check ownership against. Same `verifyStaff` gate
 * as editing the customer itself: adding a number to an account is exactly as
 * consequential as changing the one it already has, since either decides who
 * can sign in.
 */
router.get("/:id/phones", verifyStaff, validate({ params: customerSchemas.idParam }), phones.listPhones);
router.post(
  "/:id/phones",
  verifyStaff,
  validate({ params: customerSchemas.idParam, body: customerSchemas.addCustomerPhone }),
  phones.addPhone
);
router.delete(
  "/:id/phones/:phoneId",
  verifyStaff,
  validate({ params: customerSchemas.phoneIdParam }),
  phones.deletePhone
);
router.post(
  "/:id/phones/:phoneId/primary",
  verifyStaff,
  validate({ params: customerSchemas.phoneIdParam }),
  phones.makePrimary
);

module.exports = router;
