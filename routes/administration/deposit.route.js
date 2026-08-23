const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const { requireRole } = require("../../middleware/verifyStaff");
const validate = require("../../middleware/validate");
const depositSchemas = require("../../schemas/deposit.schema");
const {
  getDeposits,
  getDepositById,
  createDeposit,
  syncPaystackDeposit,
  transferBalance,
  reverseDepositById,
  unmatchDeposit,
} = require("../../controllers/administration/deposit.controller");

router.post("/sync-paystack", verifyStaff, validate({ body: depositSchemas.syncPaystack }), syncPaystackDeposit);
// Wallet-to-wallet balance move — money movement, same role gate as creating
// a deposit.
router.post(
  "/transfer",
  verifyStaff,
  requireRole("super_admin", "finance"),
  validate({ body: depositSchemas.transferBalance }),
  transferBalance
);
router.get("/", verifyStaff, validate({ query: depositSchemas.listDeposits }), getDeposits);
router.get("/:id", verifyStaff, validate({ params: depositSchemas.idParam }), getDepositById);
router.post(
  "/:id/reverse",
  verifyStaff,
  requireRole("super_admin", "finance"),
  validate({ params: depositSchemas.idParam, body: depositSchemas.reverseDeposit }),
  reverseDepositById
);
// Undo a statement match — see unmatchDeposit. Refused while the money is
// committed to a live order, which the response explains.
router.post(
  "/:id/unmatch",
  verifyStaff,
  requireRole("super_admin", "finance"),
  validate({ params: depositSchemas.idParam, body: depositSchemas.reverseDeposit }),
  unmatchDeposit
);
router.post("/", verifyStaff, requireRole("super_admin", "finance"), validate({ body: depositSchemas.createDeposit }), createDeposit);

module.exports = router;
