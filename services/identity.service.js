const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { customerRepo, customerIdentityRepo } = require("../repositories");
const providerTokenService = require("./providerToken.service");
const otpService = require("./otp.service");
const { toE164, checkSmsEligibility } = require("../utils/phone");
const { secretFor } = require("../config/auth");
const { emitEvent } = require("./events");

// The identity layer: one customer, many sign-in methods, all issuing the
// same sessions. Phone+OTP stays the default and lives in the existing OTP
// flow; this service adds email+password, Google, Apple and PIN on top of
// the same customer row, plus the trusted-device mechanism that lets
// password/PIN skip the OTP step-up on devices proven once.

const BCRYPT_ROUNDS = 12;
const LOCK_AFTER_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DEVICE_TRUST_DAYS = 90;
const REGISTRATION_TOKEN_TTL = "15m";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^\d{6}$/;

const hashDeviceToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const isLocked = (identity) =>
  identity.lockedUntil && new Date(identity.lockedUntil) > new Date();

// ── Email + password ─────────────────────────────────────────────────────────

/**
 * Set (or change) the email+password identity. Caller is authenticated — the
 * session proves account ownership, so the email is stored verified.
 */
const setEmailPassword = async (customer, { email, password }) => {
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return { success: false, message: "Enter a valid email address" };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { success: false, message: "Password must be at least 8 characters" };
  }

  const normalized = email.trim().toLowerCase();
  const taken = await customerIdentityRepo.findByProviderUserId("email", normalized);
  if (taken && taken.customerId !== customer.id) {
    return { success: false, message: "That email is already in use on another account" };
  }

  const secretHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const existing = await customerIdentityRepo.findByCustomerAndProvider(customer.id, "email");

  const identity = existing
    ? await customerIdentityRepo.update(existing.id, {
        providerUserId: normalized,
        secretHash,
        verified: true,
        failedAttempts: 0,
        lockedUntil: null,
      })
    : await customerIdentityRepo.create({
        customerId: customer.id,
        provider: "email",
        providerUserId: normalized,
        secretHash,
        verified: true,
      });

  // The email you sign in with is the account's email — persist it on the
  // customer so it shows on the profile, invoices, and the session payload,
  // not only inside the identity row. Otherwise a fresh login has no address
  // to display even though email sign-in is configured.
  if ((customer.email || "").trim().toLowerCase() !== normalized) {
    await customerRepo.update(customer.id, { email: normalized });
  }

  emitEvent("customer.identity_linked", {
    actor: { type: "customer", id: customer.id, name: customer.name },
    entityType: "customer",
    entityId: customer.id,
    provider: "email",
  });

  return { success: true, identity };
};

/**
 * Password check for login. Uniform failure — the caller cannot tell an
 * unknown email from a wrong password from a locked identity.
 */
const verifyEmailPassword = async ({ email, password }) => {
  const fail = { success: false, message: "Invalid email or password" };
  if (typeof email !== "string" || typeof password !== "string") return fail;

  const identity = await customerIdentityRepo.findByProviderUserId(
    "email",
    email.trim().toLowerCase()
  );
  // Burn comparable time on unknown emails so timing doesn't disclose them.
  if (!identity || !identity.secretHash) {
    await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvaOOOOOOOOOOOOOOOOOOOOOOOOOOOOO");
    return fail;
  }
  if (isLocked(identity)) return fail;

  const match = await bcrypt.compare(password, identity.secretHash);
  if (!match) {
    await customerIdentityRepo.recordFailedAttempt(identity.id, {
      lockAfter: LOCK_AFTER_ATTEMPTS,
      lockMinutes: LOCK_MINUTES,
    });
    return fail;
  }

  await customerIdentityRepo.resetFailures(identity.id);
  const customer = await customerRepo.findById(identity.customerId);
  if (!customer || customer.status === "Inactive") return fail;
  return { success: true, customer };
};

// ── PIN ──────────────────────────────────────────────────────────────────────

const setPin = async (customer, { pin }) => {
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    return { success: false, message: "PIN must be exactly 6 digits" };
  }

  const secretHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
  const existing = await customerIdentityRepo.findByCustomerAndProvider(customer.id, "pin");
  const identity = existing
    ? await customerIdentityRepo.update(existing.id, {
        secretHash,
        verified: true,
        failedAttempts: 0,
        lockedUntil: null,
      })
    : await customerIdentityRepo.create({
        customerId: customer.id,
        provider: "pin",
        providerUserId: String(customer.id),
        secretHash,
        verified: true,
      });

  emitEvent("customer.identity_linked", {
    actor: { type: "customer", id: customer.id, name: customer.name },
    entityType: "customer",
    entityId: customer.id,
    provider: "pin",
  });

  return { success: true, identity };
};

/**
 * PIN login — only ever valid together with a trusted device (a 6-digit PIN
 * alone is too weak to be a remote credential). Uniform failure message.
 */
const verifyPin = async ({ phone, email, pin }) => {
  // One message for every failure mode — a distinct 'no such email' would turn
  // this into an account-enumeration oracle.
  const fail = { success: false, message: "Invalid credentials or PIN" };
  if (typeof pin !== "string") return fail;
  if (typeof phone !== "string" && typeof email !== "string") return fail;

  let customer = null;
  if (typeof phone === "string" && phone.trim()) {
    const e164 = toE164(phone);
    // Any number on the account resolves it — see customerRepo.findByAnyPhone.
    customer = e164 ? (await customerRepo.findByAnyPhone(e164))?.customer || null : null;
  } else if (typeof email === "string" && email.trim()) {
    customer = await customerRepo.findByEmail(email.trim().toLowerCase());
  }
  if (!customer || customer.status === "Inactive") return fail;

  const identity = await customerIdentityRepo.findByCustomerAndProvider(customer.id, "pin");
  if (!identity || !identity.secretHash || isLocked(identity)) return fail;

  const match = await bcrypt.compare(pin, identity.secretHash);
  if (!match) {
    await customerIdentityRepo.recordFailedAttempt(identity.id, {
      lockAfter: LOCK_AFTER_ATTEMPTS,
      lockMinutes: LOCK_MINUTES,
    });
    return fail;
  }

  await customerIdentityRepo.resetFailures(identity.id);
  return { success: true, customer };
};

// ── Trusted devices ──────────────────────────────────────────────────────────

const trustDevice = async (customer, { deviceName, userAgent }) => {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000);

  await customerIdentityRepo.createTrustedDevice({
    customerId: customer.id,
    tokenHash: hashDeviceToken(token),
    deviceName: (deviceName || "").slice(0, 255),
    userAgent: (userAgent || "").slice(0, 512),
    expiresAt,
  });

  return { success: true, deviceToken: token, expiresAt };
};

/** Is this raw device token a live trust grant for this customer? */
const isTrustedDevice = async (customerId, deviceToken) => {
  if (typeof deviceToken !== "string" || !deviceToken) return false;
  const device = await customerIdentityRepo.findLiveTrustedDevice(hashDeviceToken(deviceToken));
  if (!device || device.customerId !== customerId) return false;
  await customerIdentityRepo.touchTrustedDevice(device.id);
  return true;
};

// ── Google / Apple ───────────────────────────────────────────────────────────

/**
 * Sign in with a provider ID token. Outcomes:
 *  - linked identity found        → { success, customer }
 *  - valid token, no identity     → { success, needsRegistration, registrationToken }
 *  - anything else                → uniform failure
 */
const loginWithProvider = async (provider, idToken) => {
  const fail = { success: false, message: "Sign-in failed. Please try again." };

  const verified = await providerTokenService.verifyIdToken(provider, idToken);
  if (!verified.ok) {
    console.warn(`[identity] ${provider} token rejected: ${verified.reason}`);
    return fail;
  }

  const identity = await customerIdentityRepo.findByProviderUserId(provider, verified.sub);
  if (identity) {
    const customer = await customerRepo.findById(identity.customerId);
    if (!customer || customer.status === "Inactive") return fail;
    return { success: true, customer };
  }

  // New face: hand back a short-lived registration token binding this proven
  // provider identity, so the registration step can link it without trusting
  // anything the client claims.
  const registrationToken = jwt.sign(
    {
      typ: "provider_registration",
      provider,
      sub: verified.sub,
      email: verified.email,
      name: verified.name,
    },
    secretFor("customer"),
    { expiresIn: REGISTRATION_TOKEN_TTL }
  );

  return { success: true, needsRegistration: true, registrationToken };
};

/**
 * Complete provider-first registration: the provider proved who they are,
 * the phone still gets verified by OTP before the account can do anything —
 * the customer lands as Pending and the standard verify-otp promotes it.
 */
const registerWithProvider = async ({ registrationToken, phone, name }, { requestIp }) => {
  let claim;
  try {
    claim = jwt.verify(registrationToken, secretFor("customer"));
  } catch {
    return { success: false, message: "Registration session expired. Please sign in again." };
  }
  if (claim.typ !== "provider_registration") {
    return { success: false, message: "Registration session expired. Please sign in again." };
  }

  const e164 = toE164(phone);
  if (!e164) {
    return {
      success: false,
      message:
        "Enter a valid phone number. International numbers must include a country code, e.g. +447400123456",
    };
  }
  if (!checkSmsEligibility(e164).ok) {
    return { success: false, message: "That phone number cannot receive verification codes" };
  }

  const existingIdentity = await customerIdentityRepo.findByProviderUserId(claim.provider, claim.sub);
  if (existingIdentity) {
    return { success: false, message: "This sign-in is already linked to an account. Just sign in." };
  }

  let customer = (await customerRepo.findByAnyPhone(e164))?.customer || null;
  if (!customer) {
    const displayName = (typeof name === "string" && name.trim()) || claim.name || "Customer";
    customer = await customerRepo.create({
      name: displayName.trim(),
      phone: e164,
      email: claim.email || "",
      status: "Pending",
    });
  }

  // Link now, even though the phone is not yet verified: the provider proof
  // is real, and verify-otp is still required before a session exists.
  const clash = await customerIdentityRepo.findByCustomerAndProvider(customer.id, claim.provider);
  if (!clash) {
    await customerIdentityRepo.create({
      customerId: customer.id,
      provider: claim.provider,
      providerUserId: claim.sub,
      verified: true,
      metadata: { email: claim.email, name: claim.name },
    });
  }

  // To the number they gave, which may be an alternate already on the account.
  const result = await otpService.issueAndSend(customer, {
    action: "register",
    requestIp,
    sendTo: e164,
  });
  if (!result.sent) {
    console.warn(`[identity] register-with-provider: no code sent (${result.reason})`);
  }

  emitEvent("customer.identity_linked", {
    actor: { type: "customer", id: customer.id, name: customer.name },
    entityType: "customer",
    entityId: customer.id,
    provider: claim.provider,
  });

  return { success: true };
};

/** Link a provider to an already-authenticated account. */
const linkProvider = async (customer, provider, idToken) => {
  const verified = await providerTokenService.verifyIdToken(provider, idToken);
  if (!verified.ok) {
    console.warn(`[identity] link ${provider} rejected: ${verified.reason}`);
    return { success: false, message: "Verification failed. Please try again." };
  }

  const taken = await customerIdentityRepo.findByProviderUserId(provider, verified.sub);
  if (taken && taken.customerId !== customer.id) {
    return { success: false, message: "That sign-in is already linked to another account" };
  }
  if (taken) return { success: true, identity: taken };

  const identity = await customerIdentityRepo.create({
    customerId: customer.id,
    provider,
    providerUserId: verified.sub,
    verified: true,
    metadata: { email: verified.email, name: verified.name },
  });

  emitEvent("customer.identity_linked", {
    actor: { type: "customer", id: customer.id, name: customer.name },
    entityType: "customer",
    entityId: customer.id,
    provider,
  });

  return { success: true, identity };
};

const unlinkProvider = async (customer, provider) => {
  const identity = await customerIdentityRepo.findByCustomerAndProvider(customer.id, provider);
  if (!identity) return { success: false, notFound: true, message: "Not linked" };

  await customerIdentityRepo.deleteById(identity.id);

  emitEvent("customer.identity_unlinked", {
    actor: { type: "customer", id: customer.id, name: customer.name },
    entityType: "customer",
    entityId: customer.id,
    provider,
  });

  return { success: true };
};

module.exports = {
  setEmailPassword,
  verifyEmailPassword,
  setPin,
  verifyPin,
  trustDevice,
  isTrustedDevice,
  loginWithProvider,
  registerWithProvider,
  linkProvider,
  unlinkProvider,
};
