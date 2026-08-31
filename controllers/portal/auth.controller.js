const asyncHandler = require("express-async-handler");
const { customerRepo, customerPhoneRepo, sessionRepo } = require("../../repositories");
const otpService = require("../../services/otp.service");
const botCheck = require("../../services/botCheck.service");
const sessionService = require("../../services/session.service");
const cookieService = require("../../services/cookie.service");
const identityService = require("../../services/identity.service");
const accountDeletionService = require("../../services/accountDeletion.service");
const { toE164, checkSmsEligibility } = require("../../utils/phone");
const { constantTimeFloor } = require("../../utils/timing");
const { publicCustomer } = require("../../utils/publicCustomer");

const REALM = "customer";

/**
 * Every OTP-issuing endpoint answers with this, whatever actually happened.
 *
 * The caller learns nothing about whether the number is registered, eligible,
 * rate-limited or unparseable. Those distinctions go to the logs.
 */
const GENERIC_OTP_RESPONSE = {
  success: true,
  message: "If that number can receive a code, one has been sent.",
};

/**
 * The generic body, plus the fixed dev code when OTP dev mode is on — so a
 * tester on an SMS-less environment can read the code off the screen. Never
 * present in production (dev mode cannot boot there).
 */
const otpResponse = () => {
  const code = otpService.devCode();
  return code ? { ...GENERIC_OTP_RESPONSE, devCode: code } : GENERIC_OTP_RESPONSE;
};

/**
 * Must exceed the slowest branch — an SMS round trip — or the timing itself
 * discloses whether a number is known.
 */
const TIMING_FLOOR_MS = 700;

/**
 * POST /register — { phone, name, companyName?, turnstileToken? }
 *
 * The only endpoint that creates customers, and the only one expected to
 * accept an unknown number. That is precisely why it is separate from
 * request-otp: a single find-or-create endpoint must either send an SMS to any
 * number on earth or behave as an enumeration oracle. Two endpoints let each
 * be honest.
 */
const handleRegister = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const { phone, name, email, companyName, turnstileToken } = req.body || {};

  // Validated server-side. The client requiring a field is a UX affordance,
  // not a guarantee.
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ success: false, message: "Name is required" });
  }
  if (typeof phone !== "string" || !phone.trim()) {
    return res.status(400).json({ success: false, message: "Phone number is required" });
  }

  const bot = await botCheck.verify(turnstileToken, req.ip);
  if (!bot.ok) {
    return res.status(400).json({ success: false, message: "Verification failed. Please try again." });
  }

  const e164 = toE164(phone);
  if (!e164) {
    // A malformed number is a client error, not an enumeration signal — it
    // reveals nothing about who is registered.
    return res.status(400).json({
      success: false,
      message:
        "Enter a valid phone number. International numbers must include a country code, e.g. +447400123456",
    });
  }

  if (!otpService.isDemoAccount(e164) && (await otpService.isOverDailyCap())) {
    // Global, not per-phone, so a 503 discloses nothing about any number — and
    // silently returning 200 would strand real customers with no signal to
    // anyone that the budget is spent. Demo-review numbers skip this: a spent
    // SMS budget must not strand an App Store reviewer.
    return res.status(503).json({
      success: false,
      message: "Verification is temporarily unavailable. Please try again later.",
    });
  }

  // Any of the customer's numbers, not just the primary. Someone registering
  // on a line the desk already recorded against their account must land in
  // that account, not open a second one on the same person — which is exactly
  // how the duplicate groups on the live book were created.
  const match = await customerRepo.findByAnyPhone(e164);
  let customer = match?.customer || null;
  if (!customer) {
    const eligibility = checkSmsEligibility(e164);
    if (eligibility.ok) {
      customer = await customerRepo.create({
        name: name.trim(),
        phone: e164,
        email: typeof email === "string" ? email.trim().toLowerCase() : "",
        companyName: typeof companyName === "string" ? companyName.trim() : "",
        status: "Pending",
      });
    }
  }

  if (customer) {
    // Sending to an already-registered number is deliberate: it costs the same
    // as a login SMS, keeps the response indistinguishable, and lets someone
    // who landed on the wrong form in rather than dead-ending them.
    const result = await otpService.issueAndSend(customer, {
      action: "register",
      requestIp: req.ip,
      // To the number they typed. On a fresh account that is the primary; on
      // an existing one it may be their second line, and the code has to
      // arrive on the handset in their hand.
      sendTo: e164,
    });
    if (!result.sent) {
      console.warn(`[portal/auth] register: no code sent (${result.reason})`);
    }
  }

  await constantTimeFloor(startedAt, TIMING_FLOOR_MS);
  return res.json(otpResponse());
});

/**
 * POST /request-otp — { phone }
 *
 * Login only. An unknown number gets nothing: no row, no SMS, no hint.
 */
const handleRequestOtp = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const { phone } = req.body || {};

  if (typeof phone !== "string" || !phone.trim()) {
    return res.status(400).json({ success: false, message: "Phone number is required" });
  }

  const e164 = toE164(phone);
  // Resolved across every number on the account. A customer whose account
  // holds three numbers could previously sign in with exactly one of them;
  // the other two answered like an unknown number, which is indistinguishable
  // from having no account at all.
  const match = e164 ? await customerRepo.findByAnyPhone(e164) : null;
  const customer = match?.customer || null;

  if (customer) {
    if (!otpService.isDemoAccount(match.matchedPhone) && (await otpService.isOverDailyCap())) {
      return res.status(503).json({
        success: false,
        message: "Verification is temporarily unavailable. Please try again later.",
      });
    }
    const result = await otpService.issueAndSend(customer, {
      action: "login",
      requestIp: req.ip,
      // The number that matched, which is the one being signed in with.
      sendTo: match.matchedPhone,
    });
    if (!result.sent) {
      console.warn(`[portal/auth] request-otp: no code sent (${result.reason})`);
    }
  }

  await constantTimeFloor(startedAt, TIMING_FLOOR_MS);
  return res.json(otpResponse());
});

/**
 * POST /verify-otp — { phone, code }
 *
 * Completes register or login. Purpose is always `auth` — deletion codes live
 * under `account_deletion` and cannot mint a session here.
 */
const handleVerifyOtp = asyncHandler(async (req, res) => {
  const { phone, code, trustDevice, deviceName } = req.body || {};

  const reject = () =>
    res.status(401).json({ success: false, message: "Invalid or expired code" });

  if (typeof phone !== "string" || typeof code !== "string") return reject();

  const e164 = toE164(phone);
  if (!e164) return reject();

  const match = await customerRepo.findByAnyPhone(e164);
  const customer = match?.customer || null;
  if (!customer) return reject();

  // A deactivated account must not be able to authenticate at all. Checked
  // before the code is consumed, so a suspended customer's code is not burned,
  // and answered with the same rejection so nothing is disclosed.
  if (customer.status === "Inactive") return reject();

  const verified = await otpService.verifyCode(customer.id, code, otpService.PURPOSE_AUTH);
  if (!verified.ok) return reject();

  // Proving control of the number IS the activation gate — there is no staff
  // approval step. `Pending` means "registered, phone not yet proven", and the
  // first successful verification promotes it.
  //
  // Only Pending is promoted. `Inactive` is a staff decision and is refused
  // above; passing an OTP must never undo a deactivation.
  //
  // `phoneVerifiedAt` on the customer row describes the PRIMARY number, so it
  // is only stamped when the primary is what was proven. A code passed on an
  // alternate proves that alternate, and is recorded against its own row —
  // otherwise verifying a second line would silently claim the primary had
  // been verified when nobody had answered on it.
  const patch = { lastLoginAt: new Date() };
  if (match.isPrimary) patch.phoneVerifiedAt = new Date();
  if (customer.status === "Pending") patch.status = "Active";

  const updated = await customerRepo.update(customer.id, patch);
  if (!match.isPrimary) {
    await customerPhoneRepo.markVerifiedByKey(customer.id, match.matchedPhone);
  }

  const { accessToken, refreshToken } = await sessionService.issue(
    REALM,
    updated,
    sessionService.requestContext(req)
  );
  const { refreshToken: bodyToken, csrfToken } = cookieService.applyIssuedToken(
    req,
    res,
    REALM,
    refreshToken
  );

  // Opt-in: remember this device so the customer can use a PIN next time
  // instead of waiting on another OTP. Verifying the OTP is itself the phone
  // proof a trusted device represents, so no extra factor is needed.
  let deviceToken;
  if (trustDevice) {
    const trust = await identityService.trustDevice(updated, {
      deviceName,
      userAgent: req.get("user-agent"),
    });
    deviceToken = trust.deviceToken;
  }

  return res.json({
    success: true,
    message: "Verified",
    data: {
      customer: publicCustomer(updated),
      accessToken,
      ...(bodyToken !== undefined ? { refreshToken: bodyToken } : {}),
      ...(csrfToken !== undefined ? { csrfToken } : {}),
      ...(deviceToken ? { deviceToken } : {}),
    },
  });
});

const handleRefresh = asyncHandler(async (req, res) => {
  const { token: presented } = cookieService.readRefreshToken(req, REALM);
  if (!presented) {
    return res.status(400).json({ success: false, message: "Refresh token required" });
  }

  const result = await sessionService.rotate(
    REALM,
    presented,
    sessionService.requestContext(req)
  );
  if (!result.ok) {
    // Uniform: distinguishing stale from reused would tell an attacker whether
    // a token is being watched.
    cookieService.clearRefreshCookie(res, REALM);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const customer = await customerRepo.findById(result.session.customerId);
  const { refreshToken: bodyToken, csrfToken } = cookieService.applyIssuedToken(
    req,
    res,
    REALM,
    result.refreshToken
  );

  return res.json({
    success: true,
    message: "Token refreshed",
    data: {
      customer: publicCustomer(customer),
      accessToken: result.accessToken,
      ...(bodyToken !== undefined ? { refreshToken: bodyToken } : {}),
      ...(csrfToken !== undefined ? { csrfToken } : {}),
    },
  });
});

const handleLogout = asyncHandler(async (req, res) => {
  const { token: presented } = cookieService.readRefreshToken(req, REALM);
  cookieService.clearRefreshCookie(res, REALM);
  if (!presented) return res.sendStatus(204);

  const revoked = await sessionService.revoke(REALM, presented, "logout");
  if (!revoked) return res.sendStatus(204);
  return res.json({ success: true, message: "Logged out" });
});

const handleLogoutAll = asyncHandler(async (req, res) => {
  const revoked = await sessionService.revokeAll(REALM, req.customer.id, "logout_all");
  return res.json({
    success: true,
    message: "Signed out of all devices",
    data: { revokedCount: revoked.length },
  });
});

const handleListSessions = asyncHandler(async (req, res) => {
  const rows = await sessionRepo.listActive(REALM, req.customer.id);
  return res.json({
    success: true,
    data: {
      sessions: rows.map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        lastUsedAt: s.lastUsedAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        current: req.authSession?.id === s.id,
      })),
    },
  });
});

const handleRevokeSession = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: "Invalid session id" });
  }

  // Ownership is in the WHERE, so another customer's id simply does not match.
  const revoked = await sessionRepo.revokeOwnedById(REALM, req.customer.id, id, "logout");
  if (!revoked) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }
  return res.json({ success: true, message: "Session revoked" });
});

const handleGetMe = asyncHandler(async (req, res) => {
  return res.json({ success: true, data: { customer: publicCustomer(req.customer) } });
});

/**
 * POST /account/request-otp — authenticated.
 *
 * Sends a purpose-scoped deletion code to the customer's phone. Blockers are
 * checked first so we do not burn an SMS when deletion cannot proceed.
 */
const handleRequestDeleteOtp = asyncHandler(async (req, res) => {
  const { blockers } = await accountDeletionService.collectBlockers(req.customer.id);
  if (blockers.length > 0) {
    return res.status(409).json({
      success: false,
      message: accountDeletionService.formatBlockerMessage(blockers),
      data: { blockers },
    });
  }

  if (
    !otpService.isDemoAccount(req.customer.phone) &&
    (await otpService.isOverDailyCap())
  ) {
    return res.status(503).json({
      success: false,
      message: "Verification is temporarily unavailable. Please try again later.",
    });
  }

  const result = await otpService.issueAndSend(req.customer, {
    action: "delete",
    requestIp: req.ip,
  });
  if (!result.sent) {
    console.warn(`[portal/auth] delete-otp: no code sent (${result.reason})`);
    if (result.capped) {
      return res.status(503).json({
        success: false,
        message: "Verification is temporarily unavailable. Please try again later.",
      });
    }
    if (result.reason === "phone_rate_limited" || result.reason === "ip_rate_limited") {
      return res.status(429).json({
        success: false,
        message: "Too many deletion codes requested. Please try again later.",
      });
    }
  }

  const payload = {
    success: true,
    message: "If that number can receive a code, one has been sent.",
  };
  const code = otpService.devCode();
  if (code) payload.devCode = code;
  return res.json(payload);
});

/**
 * DELETE /account — { code }. App Store Guideline 5.1.1(v).
 *
 * Re-proves phone control with an account_deletion OTP, then anonymizes the
 * customer tombstone and wipes auth surfaces. Ledger rows that legally/ops
 * must stay keep the customer id; personal data does not.
 */
const handleDeleteAccount = asyncHandler(async (req, res) => {
  const { code } = req.body || {};

  const verified = await otpService.verifyCode(
    req.customer.id,
    code,
    otpService.PURPOSE_ACCOUNT_DELETION
  );
  if (!verified.ok) {
    return res.status(401).json({ success: false, message: "Invalid or expired code" });
  }

  const result = await accountDeletionService.deleteCustomerAccount(req.customer.id);

  if (!result.ok) {
    return res.status(result.status).json({
      success: false,
      message: result.message,
      ...(result.blockers ? { data: { blockers: result.blockers } } : {}),
    });
  }

  // Sessions are already revoked inside the service; drop the cookie so a
  // browser client cannot keep refreshing into a dead principal.
  cookieService.clearRefreshCookie(res, REALM);

  return res.json({
    success: true,
    message: "Your account has been deleted.",
    data: { deletedAt: result.deletedAt },
  });
});

module.exports = {
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
};
