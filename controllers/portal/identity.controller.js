const asyncHandler = require("express-async-handler");
const { customerRepo, customerIdentityRepo } = require("../../repositories");
const identityService = require("../../services/identity.service");
const passkeyService = require("../../services/passkey.service");
const sessionService = require("../../services/session.service");
const cookieService = require("../../services/cookie.service");
const otpService = require("../../services/otp.service");
const { toE164 } = require("../../utils/phone");
const { publicCustomer } = require("../../utils/publicCustomer");

const REALM = "customer";

/**
 * Every login method funnels through here once a customer is identified —
 * the session/cookie/CSRF machinery is provider-agnostic by design, so a new
 * sign-in method never touches token issuance.
 */
const issueSessionResponse = async (req, res, customer, { message = "Signed in" } = {}) => {
  const { accessToken, refreshToken } = await sessionService.issue(
    REALM,
    customer,
    sessionService.requestContext(req)
  );
  const { refreshToken: bodyToken, csrfToken } = cookieService.applyIssuedToken(
    req,
    res,
    REALM,
    refreshToken
  );

  return res.json({
    success: true,
    message,
    data: {
      customer: publicCustomer(customer),
      accessToken,
      ...(bodyToken !== undefined ? { refreshToken: bodyToken } : {}),
      ...(csrfToken !== undefined ? { csrfToken } : {}),
    },
  });
};

// ── Provider directory: what's linked on this account ────────────────────────

const handleGetIdentities = asyncHandler(async (req, res) => {
  const identities = await customerIdentityRepo.listByCustomer(req.customer.id);
  const passkeys = await customerIdentityRepo.listPasskeys(req.customer.id);
  const devices = await customerIdentityRepo.listTrustedDevices(req.customer.id);

  res.json({
    success: true,
    data: {
      phone: { verified: Boolean(req.customer.phoneVerifiedAt) },
      identities: identities.map((i) => ({
        provider: i.provider,
        verified: i.verified,
        linkedAt: i.createdAt,
      })),
      passkeys: passkeys.map((p) => ({ id: p.id, deviceName: p.deviceName, createdAt: p.createdAt })),
      trustedDevices: devices.map((d) => ({
        id: d.id,
        deviceName: d.deviceName,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
      })),
    },
  });
});

// ── Email + password ─────────────────────────────────────────────────────────

/** Authenticated: set or change the email+password identity. */
const handleSetPassword = asyncHandler(async (req, res) => {
  const result = await identityService.setEmailPassword(req.customer, req.body || {});
  if (!result.success) return res.status(400).json({ success: false, message: result.message });
  res.json({ success: true, message: "Password set" });
});

/**
 * POST /login/password — { email, password, deviceToken? }
 *
 * A recognized device signs straight in. An unrecognized one still succeeds
 * (the password is real) but is asked to prove the phone once more before a
 * session is issued — mirroring the OTP step-up, not bypassing it.
 */
const handlePasswordLogin = asyncHandler(async (req, res) => {
  const { email, password, deviceToken } = req.body || {};
  const result = await identityService.verifyEmailPassword({ email, password });
  if (!result.success) return res.status(401).json({ success: false, message: result.message });

  const trusted = await identityService.isTrustedDevice(result.customer.id, deviceToken);
  if (!trusted) {
    if (
      !otpService.isDemoAccount(result.customer.phone) &&
      (await otpService.isOverDailyCap())
    ) {
      return res.status(503).json({
        success: false,
        message: "Verification is temporarily unavailable. Please try again later.",
      });
    }
    const sent = await otpService.issueAndSend(result.customer, {
      action: "login",
      requestIp: req.ip,
    });
    if (!sent.sent) console.warn(`[identity] password login step-up: no code sent (${sent.reason})`);
    return res.json({
      success: true,
      stepUpRequired: true,
      message: "New device detected. Enter the verification code sent to your phone to continue.",
      data: { phone: result.customer.phone },
    });
  }

  await issueSessionResponse(req, res, result.customer);
});

/**
 * POST /login/password/verify — completes step-up: { phone, code, trustDevice?, deviceName? }
 * Same OTP verification rules as the phone flow (10 min TTL, 5 attempts,
 * single use) — this is not a second, weaker code path.
 */
const handlePasswordStepUpVerify = asyncHandler(async (req, res) => {
  const { phone, code, trustDevice, deviceName } = req.body || {};

  const reject = () => res.status(401).json({ success: false, message: "Invalid or expired code" });
  if (typeof phone !== "string" || typeof code !== "string") return reject();

  const e164 = toE164(phone);
  if (!e164) return reject();
  const customer = await customerRepo.findByPhone(e164);
  if (!customer || customer.status === "Inactive") return reject();

  const verified = await otpService.verifyCode(customer.id, code, otpService.PURPOSE_AUTH);
  if (!verified.ok) return reject();

  let deviceToken;
  if (trustDevice) {
    const trust = await identityService.trustDevice(customer, {
      deviceName,
      userAgent: req.get("user-agent"),
    });
    deviceToken = trust.deviceToken;
  }

  const { accessToken, refreshToken } = await sessionService.issue(
    REALM,
    customer,
    sessionService.requestContext(req)
  );
  const { refreshToken: bodyToken, csrfToken } = cookieService.applyIssuedToken(
    req,
    res,
    REALM,
    refreshToken
  );

  res.json({
    success: true,
    message: "Signed in",
    data: {
      customer: publicCustomer(customer),
      accessToken,
      ...(bodyToken !== undefined ? { refreshToken: bodyToken } : {}),
      ...(csrfToken !== undefined ? { csrfToken } : {}),
      ...(deviceToken ? { deviceToken } : {}),
    },
  });
});

// ── PIN ──────────────────────────────────────────────────────────────────────

const handleSetPin = asyncHandler(async (req, res) => {
  const result = await identityService.setPin(req.customer, req.body || {});
  if (!result.success) return res.status(400).json({ success: false, message: result.message });
  res.json({ success: true, message: "PIN set" });
});

/** POST /login/pin — { phone, pin, deviceToken } — trusted device REQUIRED. */
const handlePinLogin = asyncHandler(async (req, res) => {
  const { phone, email, pin, deviceToken } = req.body || {};
  // One message for every failure — distinguishing 'unknown email' from 'wrong
  // PIN' would make this an account-enumeration oracle.
  const fail = () => res.status(401).json({ success: false, message: "Invalid credentials or PIN" });

  // A PIN is only ever a second factor for a device already proven by OTP —
  // never accept it as a sole remote credential. Either identifier resolves the
  // same account; the trusted-device check below is what actually gates it.
  let candidate = null;
  if (typeof phone === "string" && phone.trim()) {
    const e164Check = toE164(phone);
    candidate = e164Check ? await customerRepo.findByPhone(e164Check) : null;
  } else if (typeof email === "string" && email.trim()) {
    candidate = await customerRepo.findByEmail(email.trim().toLowerCase());
  }
  if (!candidate) return fail();

  const trusted = await identityService.isTrustedDevice(candidate.id, deviceToken);
  if (!trusted) return fail();

  const result = await identityService.verifyPin({ phone, email, pin });
  if (!result.success) return fail();

  await issueSessionResponse(req, res, result.customer);
});

// ── Google / Apple ───────────────────────────────────────────────────────────

/** POST /login/:provider — { idToken } */
const handleProviderLogin = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  if (!["google", "apple"].includes(provider)) {
    return res.status(404).json({ success: false, message: "Unknown provider" });
  }

  const result = await identityService.loginWithProvider(provider, req.body?.idToken);
  if (!result.success) return res.status(401).json({ success: false, message: result.message });

  if (result.needsRegistration) {
    return res.json({
      success: true,
      needsRegistration: true,
      message: "Almost done — confirm your phone number to finish creating your account.",
      data: { registrationToken: result.registrationToken },
    });
  }

  await issueSessionResponse(req, res, result.customer);
});

/** POST /register/:provider — { registrationToken, phone, name? } */
const handleProviderRegister = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  if (!["google", "apple"].includes(provider)) {
    return res.status(404).json({ success: false, message: "Unknown provider" });
  }

  const result = await identityService.registerWithProvider(req.body || {}, { requestIp: req.ip });
  if (!result.success) return res.status(400).json({ success: false, message: result.message });

  res.json({
    success: true,
    message: "If that number can receive a code, one has been sent.",
  });
});

/** Authenticated: link a provider to the current account. */
const handleLinkProvider = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  if (!["google", "apple"].includes(provider)) {
    return res.status(404).json({ success: false, message: "Unknown provider" });
  }
  const result = await identityService.linkProvider(req.customer, provider, req.body?.idToken);
  if (!result.success) return res.status(400).json({ success: false, message: result.message });
  res.json({ success: true, message: `${provider} linked` });
});

const handleUnlinkProvider = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const result = await identityService.unlinkProvider(req.customer, provider);
  if (!result.success) {
    return res.status(result.notFound ? 404 : 400).json({ success: false, message: result.message });
  }
  res.json({ success: true, message: `${provider} unlinked` });
});

// ── Trusted devices ──────────────────────────────────────────────────────────

const handleRevokeTrustedDevice = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: "Invalid device id" });
  }
  const revoked = await customerIdentityRepo.revokeTrustedDevice(req.customer.id, id);
  if (!revoked) return res.status(404).json({ success: false, message: "Device not found" });
  res.json({ success: true, message: "Device trust revoked" });
});

// ── Passkeys ─────────────────────────────────────────────────────────────────

const handlePasskeyRegisterOptions = asyncHandler(async (req, res) => {
  const result = await passkeyService.startRegistration(req.customer);
  res.json({ success: true, data: result.options });
});

const handlePasskeyRegisterVerify = asyncHandler(async (req, res) => {
  const result = await passkeyService.finishRegistration(req.customer, req.body || {});
  if (!result.success) return res.status(400).json({ success: false, message: result.message });
  res.status(201).json({ success: true, message: "Passkey added", data: { passkey: result.passkey } });
});

const handlePasskeyLoginOptions = asyncHandler(async (req, res) => {
  const result = await passkeyService.startAuthentication();
  res.json({ success: true, data: result.options });
});

const handlePasskeyLoginVerify = asyncHandler(async (req, res) => {
  const result = await passkeyService.finishAuthentication(req.body || {});
  if (!result.success) return res.status(401).json({ success: false, message: result.message });
  await issueSessionResponse(req, res, result.customer);
});

const handleDeletePasskey = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: "Invalid passkey id" });
  }
  const deleted = await customerIdentityRepo.deletePasskey(req.customer.id, id);
  if (!deleted) return res.status(404).json({ success: false, message: "Passkey not found" });
  res.json({ success: true, message: "Passkey removed" });
});

module.exports = {
  handleGetIdentities,
  handleSetPassword,
  handlePasswordLogin,
  handlePasswordStepUpVerify,
  handleSetPin,
  handlePinLogin,
  handleProviderLogin,
  handleProviderRegister,
  handleLinkProvider,
  handleUnlinkProvider,
  handleRevokeTrustedDevice,
  handlePasskeyRegisterOptions,
  handlePasskeyRegisterVerify,
  handlePasskeyLoginOptions,
  handlePasskeyLoginVerify,
  handleDeletePasskey,
};
