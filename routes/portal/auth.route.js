const express = require("express");
const router = express.Router();
const generateLimiter = require("../../middleware/generateLimiter");
const { authenticateCustomer } = require("../../middleware/verifyCustomer");
const { requireCsrfForCookieAuth } = require("../../middleware/csrf");
const validate = require("../../middleware/validate");
const authSchemas = require("../../schemas/auth.schema");
const {
  handleRegister,
  handleRequestOtp,
  handleVerifyOtp,
  handleRefresh,
  handleLogout,
  handleLogoutAll,
  handleListSessions,
  handleRevokeSession,
  handleGetMe,
  handleRequestDeleteOtp,
  handleDeleteAccount,
} = require("../../controllers/portal/auth.controller");

/**
 * These limiters are a coarse per-process front line; the real per-phone and
 * per-IP budgets are SQL-backed in otp.service, because an in-memory limiter
 * resets on every deploy and multiplies by worker count.
 */
const registerLimiter = generateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many registration attempts. Please try again later.",
});

const otpLimiter = generateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many verification requests. Please try again later.",
});

const verifyLimiter = generateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many verification attempts. Please try again later.",
});

router.post("/register", registerLimiter, validate({ body: authSchemas.register }), handleRegister);
router.post("/request-otp", otpLimiter, validate({ body: authSchemas.requestOtp }), handleRequestOtp);
router.post("/verify-otp", verifyLimiter, validate({ body: authSchemas.verifyOtp }), handleVerifyOtp);
// CSRF applies only when the refresh token arrives in a cookie; a caller
// sending it in the body is not exposed to CSRF in the first place.
router.post("/refresh", otpLimiter, requireCsrfForCookieAuth("customer"), validate({ body: authSchemas.refresh }), handleRefresh);
router.post("/logout", requireCsrfForCookieAuth("customer"), validate({ body: authSchemas.refresh }), handleLogout);

router.get("/me", authenticateCustomer, handleGetMe);
router.post("/logout-all", authenticateCustomer, handleLogoutAll);
router.get("/sessions", authenticateCustomer, handleListSessions);
router.delete("/sessions/:id", authenticateCustomer, validate({ params: authSchemas.sessionIdParam }), handleRevokeSession);
// App Store 5.1.1(v): request a deletion OTP, then confirm with DELETE /account.
router.post(
  "/account/request-otp",
  authenticateCustomer,
  otpLimiter,
  handleRequestDeleteOtp
);
router.delete(
  "/account",
  authenticateCustomer,
  requireCsrfForCookieAuth("customer"),
  validate({ body: authSchemas.deleteAccount }),
  handleDeleteAccount
);

module.exports = router;
