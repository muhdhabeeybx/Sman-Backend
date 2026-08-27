const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const contactSchemas = require("../../schemas/contact.schema");
const {
  getContacts,
  getContactTags,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  convertContact,
} = require("../../controllers/administration/contact.controller");

router.get("/", verifyStaff, validate({ query: contactSchemas.listContacts }), getContacts);

// Both before "/:id" — Express matches in declaration order, so "tags" and
// "import" would otherwise be swallowed as an :id value and fail id
// validation rather than reaching their handlers.
router.get("/tags", verifyStaff, getContactTags);
router.post("/import", verifyStaff, validate({ body: contactSchemas.importContacts }), importContacts);

router.get("/:id", verifyStaff, validate({ params: contactSchemas.idParam }), getContactById);
router.post("/", verifyStaff, validate({ body: contactSchemas.createContact }), createContact);
router.patch(
  "/:id",
  verifyStaff,
  validate({ params: contactSchemas.idParam, body: contactSchemas.updateContact }),
  updateContact
);
router.delete("/:id", verifyStaff, validate({ params: contactSchemas.idParam }), deleteContact);
router.post("/:id/convert", verifyStaff, validate({ params: contactSchemas.idParam }), convertContact);

module.exports = router;
