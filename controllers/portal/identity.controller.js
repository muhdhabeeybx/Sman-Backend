const asyncHandler = require("express-async-handler");
const { customerRepo, customerIdentityRepo } = require("../../repositories");
const identityService = require("../../services/identity.service");
const passkeyService = require("../../services/passkey.service");
const sessionService = require("../../services/session.service");
const cookieService = require("../../services/cookie.service");
const otpService = require("../../services/otp.service");
const botCheck = require("../../services/botCheck.service");
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
  // Any number on the account — the step-up code was issued against whichever
  // one the customer typed, so verification has to resolve the same way.
  const customer = (await customerRepo.findByAnyPhone(e164))?.customer || null;
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

/** POST /login/pin — { phone|email, pin, deviceToken? } — device token optional; see below. */
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
    candidate = e164Check ? (await customerRepo.findByAnyPhone(e164Check))?.customer || null : null;
  } else if (typeof email === "string" && email.trim()) {
    candidate = await customerRepo.findByEmail(email.trim().toLowerCase());
  }
  if (!candidate) return fail();

  // A presented device token must still be valid — a client that claims a
  // trusted device and is wrong is a stronger signal of abuse than one that
  // never claimed anything, so it fails rather than falling through.
  //
  // Absent entirely, the PIN stands alone. That is what the mobile app does:
  // it never runs an OTP, so it has no way to obtain a device token. The
  // remaining protections are bcrypt storage, the uniform failure message
  // above, and the 5-attempt / 15-minute lockout in identityService.verifyPin.
  // The web keeps sending its token and keeps the device-bound check.
  if (typeof deviceToken === "string" && deviceToken.trim()) {
    const trusted = await identityService.isTrustedDevice(candidate.id, deviceToken);
    if (!trusted) return fail();
  }

  const result = await identityService.verifyPin({ phone, email, pin });
  if (!result.success) return fail();

  await issueSessionResponse(req, res, result.customer);
});

/**
 * POST /api/customer/auth/register/pin — OTP-free sign-up for the mobile app.
 *
 * The PIN replaces the OTP as the activation gate, so the account is created
 * `Active` and usable for ordering immediately (`requireActiveCustomer` rejects
 * `Pending`). The trade is explicit: nothing here proves the phone belongs to
 * the person registering.
 *
 * That makes claiming an EXISTING row the dangerous case — desk-created
 * customers carry real phone numbers, and letting a stranger set a PIN on one
 * would hand over its history and wallet. So an existing row is claimable only
 * when there is nothing to steal:
 *   - no linked identity (no PIN, password, or social) — someone already owns
 *     an account that has one, and they must sign in, not re-register;
 *   - no wallet balance.
 * Prior ORDERS deliberately do not block the claim: a guest checkout creates
 * exactly this kind of row, and folding those orders into the account the
 * customer then makes is the intended path (see createGuestOrder).
 *
 * Anything else answers 409 ACCOUNT_EXISTS, which routes the client to sign-in
 * or to PIN reset — the one flow that still goes through an OTP.
 */
const handlePinRegister = asyncHandler(async (req, res) => {
  const { name, phone, email, companyName, pin, turnstileToken } = req.body || {};

  const bot = await botCheck.verify(turnstileToken, req.ip);
  if (!bot.ok) {
    return res.status(400).json({ success: false, message: "Verification failed. Please try again." });
  }

  const e164 = toE164(phone);
  if (!e164) {
    return res.status(400).json({
      success: false,
      message:
        "Enter a valid phone number. International numbers must include a country code, e.g. +447400123456",
    });
  }

  const existingEmail = await customerRepo.findByEmail(String(email).trim().toLowerCase());
  const match = await customerRepo.findByAnyPhone(e164);
  let customer = match?.customer || null;

  // The email is a sign-in identifier too, so it cannot silently land on a
  // second row pointing at someone else's address.
  if (existingEmail && (!customer || existingEmail.id !== customer.id)) {
    return res.status(409).json({
      success: false,
      code: "ACCOUNT_EXISTS",
      message: "An account already uses that email address. Sign in instead.",
    });
  }

  if (customer) {
    if (customer.status === "Inactive") {
      return res.status(403).json({
        success: false,
        message: "This account cannot be used at the moment. Please contact support.",
      });
    }

    const identities = await customerIdentityRepo.listByCustomer(customer.id);
    const claimable = identities.length === 0 && !(Number(customer.balance || 0) > 0);
    if (!claimable) {
      return res.status(409).json({
        success: false,
        code: "ACCOUNT_EXISTS",
        message: "An account already exists for that number. Sign in with your PIN instead.",
      });
    }

    customer = await customerRepo.update(customer.id, {
      status: "Active",
      // Fill only what the row is missing — never overwrite details the desk
      // recorded with what an unverified caller typed.
      ...(customer.name ? {} : { name: String(name).trim() }),
      ...(customer.email ? {} : { email: String(email).trim().toLowerCase() }),
      ...(customer.companyName || !companyName ? {} : { companyName: String(companyName).trim() }),
    });
  } else {
    customer = await customerRepo.create({
      name: String(name).trim(),
      phone: e164,
      email: String(email).trim().toLowerCase(),
      companyName: typeof companyName === "string" ? companyName.trim() : "",
      status: "Active",
      createdVia: "portal",
    });
  }

  const result = await identityService.setPin(customer, { pin });
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  await issueSessionResponse(req, res, customer, { message: "Account created" });
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
  handlePinRegister,
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
