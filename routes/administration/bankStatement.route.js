const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const misc = require("../../schemas/misc.schema");
const {
  getMapping,
  saveMapping,
  uploadStatement,
  listStatements,
  statementLines,
  deleteStatement,
  searchLines,
  matchLines,
} = require("../../controllers/administration/bankStatement.controller");

// The matching pool, queried while confirming a payment.
router.get("/lines", verifyStaff, searchLines);
router.post("/match", verifyStaff, validate({ body: misc.matchBankLines }), matchLines);

// Per-account statement format.
router.get("/mapping/:bankAccountId", verifyStaff, getMapping);
router.put("/mapping/:bankAccountId", verifyStaff, validate({ body: misc.bankStatementMapping }), saveMapping);

// Statements themselves.
router.get("/", verifyStaff, listStatements);
router.post("/", verifyStaff, validate({ body: misc.createBankStatement }), uploadStatement);
router.get("/:id/lines", verifyStaff, statementLines);
router.delete("/:id", verifyStaff, deleteStatement);

module.exports = router;
