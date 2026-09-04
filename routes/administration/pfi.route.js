const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const misc = require("../../schemas/misc.schema");
const {
  getPfis,
  getPfiById,
  createPfi,
  updatePfi,
  deletePfi,
  startPfi,
  finishPfi,
  getPfiSummary,
  getPfiExpenses,
  addPfiExpense,
  getStockSummary,
  assignOrdersToPfi,
} = require("../../controllers/administration/pfi.controller");

// Stock across every PFI. Declared before "/:id" so it is not swallowed by it.
router.get("/stock-summary", verifyStaff, getStockSummary);
// Bulk assignment lives here rather than under /orders because it is the PFI
// that validates the request.
router.post("/assign-orders", verifyStaff, assignOrdersToPfi);

router.get("/", verifyStaff, validate({ query: misc.listPfis }), getPfis);
router.post("/", verifyStaff, validate({ body: misc.createPfi }), createPfi);

router.get("/:id", verifyStaff, validate({ params: misc.idParam }), getPfiById);
router.patch("/:id", verifyStaff, validate({ params: misc.idParam, body: misc.updatePfi }), updatePfi);
router.delete("/:id", verifyStaff, validate({ params: misc.idParam }), deletePfi);

router.post("/:id/start", verifyStaff, validate({ params: misc.idParam }), startPfi);
router.post("/:id/finish", verifyStaff, validate({ params: misc.idParam }), finishPfi);
router.get("/:id/summary", verifyStaff, validate({ params: misc.idParam }), getPfiSummary);
router.get("/:id/expenses", verifyStaff, validate({ params: misc.idParam }), getPfiExpenses);
router.post("/:id/expenses", verifyStaff, validate({ params: misc.idParam }), addPfiExpense);

module.exports = router;
