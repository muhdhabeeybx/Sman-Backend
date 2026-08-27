const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const schemas = require("../../schemas/messageTemplate.schema");
const {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} = require("../../controllers/administration/messageTemplate.controller");

// Whole resource is admin/super_admin only via config/apiPermissions.js — the
// same boundary as the messaging page itself, since a template is meaningless
// to anyone who cannot reach the composer it feeds.
router.get("/", verifyStaff, listTemplates);
router.post("/", verifyStaff, validate({ body: schemas.createTemplate }), createTemplate);
router.patch("/:id", verifyStaff, validate({ params: schemas.idParam, body: schemas.updateTemplate }), updateTemplate);
router.delete("/:id", verifyStaff, validate({ params: schemas.idParam }), deleteTemplate);

module.exports = router;
