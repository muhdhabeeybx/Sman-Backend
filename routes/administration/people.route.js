const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const { requireRole } = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const schemas = require("../../schemas/people.schema");
const { getPeople, getHygiene, deleteReviewed } = require("../../controllers/administration/people.controller");

/**
 * The merged customers-and-contacts book.
 *
 * Reading it is an ordinary desk activity, so `verifyStaff` — the same gate
 * /api/customers and /api/contacts already sit behind. Deleting records off
 * the back of the hygiene review is not: it removes customer rows, so it takes
 * the admin gate the broadcast endpoint uses.
 */
router.get("/", verifyStaff, validate({ query: schemas.listPeople }), getPeople);

// Before any parameterised route — Express matches in declaration order.
router.get("/hygiene", verifyStaff, validate({ query: schemas.listHygiene }), getHygiene);
router.post(
  "/hygiene/delete",
  verifyStaff,
  requireRole("admin", "super_admin"),
  validate({ body: schemas.deleteReviewed }),
  deleteReviewed
);

module.exports = router;
