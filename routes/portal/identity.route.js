const express = require("express");
const router = express.Router();
const generateLimiter = require("../../middleware/generateLimiter");
const { authenticateCustomer } = require("../../middleware/verifyCustomer");
const validate = require("../../middleware/validate");
const {
  setPasswordSchema,
  passwordLoginSchema,
  passwordStepUpVerifySchema,
  setPinSchema,
  pinRegisterSchema,
  pinLoginSchema,
  providerParamSchema,
  providerLoginSchema,
  providerRegisterSchema,
  deviceIdParamSchema,
  passkeyRegisterVerifySchema,
  passkeyLoginVerifySchema,
} = require("../../schemas/identity.schema");
const identity = require("../../controllers/portal/identity.controller");

// Same coarse per-process front line as the OTP endpoints — the SQL-backed
// budgets in otp.service are the real limits for anything that sends an SMS.
const loginLimiter = generateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many sign-in attempts. Please try again later.",
});
const registerLimiter = generateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many registration attempts. Please try again later.",
});

// ── Directory: what's linked on this account ─────────────────────────────────
router.get("/identities", authenticateCustomer, identity.handleGetIdentities);

// ── Email + password ──────────────────────────────────────────────────────────
router.post(
  "/password",
  authenticateCustomer,
  validate({ body: setPasswordSchema }),
  identity.handleSetPassword
);
router.post(
  "/login/password",
  loginLimiter,
  validate({ body: passwordLoginSchema }),
  identity.handlePasswordLogin
);
router.post(
  "/login/password/verify",
  loginLimiter,
  validate({ body: passwordStepUpVerifySchema }),
  identity.handlePasswordStepUpVerify
);

// ── PIN ───────────────────────────────────────────────────────────────────────
// Sign-up without an OTP: creates the account, sets the PIN, returns a session.
// Rate-limited as a registration endpoint, not a login one — it creates rows.
router.post(
  "/register/pin",
  registerLimiter,
  validate({ body: pinRegisterSchema }),
  identity.handlePinRegister
);
router.post("/pin", authenticateCustomer, validate({ body: setPinSchema }), identity.handleSetPin);
router.post(
  "/login/pin",
  loginLimiter,
  validate({ body: pinLoginSchema }),
  identity.handlePinLogin
);

// ── Google / Apple ────────────────────────────────────────────────────────────
router.post(
  "/login/:provider",
  loginLimiter,
  validate({ params: providerParamSchema, body: providerLoginSchema }),
  identity.handleProviderLogin
);
router.post(
  "/register/:provider",
  registerLimiter,
  validate({ params: providerParamSchema, body: providerRegisterSchema }),
  identity.handleProviderRegister
);
router.post(
  "/link/:provider",
  authenticateCustomer,
  validate({ params: providerParamSchema, body: providerLoginSchema }),
  identity.handleLinkProvider
);
router.delete(
  "/link/:provider",
  authenticateCustomer,
  validate({ params: providerParamSchema }),
  identity.handleUnlinkProvider
);

// ── Trusted devices ───────────────────────────────────────────────────────────
router.delete(
  "/devices/:id",
  authenticateCustomer,
  validate({ params: deviceIdParamSchema }),
  identity.handleRevokeTrustedDevice
);

// ── Passkeys ──────────────────────────────────────────────────────────────────
router.post(
  "/passkeys/register/options",
  authenticateCustomer,
  identity.handlePasskeyRegisterOptions
);
router.post(
  "/passkeys/register/verify",
  authenticateCustomer,
  validate({ body: passkeyRegisterVerifySchema }),
  identity.handlePasskeyRegisterVerify
);
router.post("/passkeys/login/options", loginLimiter, identity.handlePasskeyLoginOptions);
router.post(
  "/passkeys/login/verify",
  loginLimiter,
  validate({ body: passkeyLoginVerifySchema }),
  identity.handlePasskeyLoginVerify
);
router.delete(
  "/passkeys/:id",
  authenticateCustomer,
  validate({ params: deviceIdParamSchema }),
  identity.handleDeletePasskey
);

module.exports = router;
