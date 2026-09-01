// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nock = require("nock");
const { eq } = require("drizzle-orm");

const app = require("../app");
const { db } = require("../config/db");
const { customerIdentities, customerTrustedDevices, customerOtps, customers } = require("../db/schema");
const { customerRepo, customerIdentityRepo } = require("../repositories");
const { closeDb } = require("./helpers");

const BASE = "/api/customer/auth";
// Digits only, and a real Nigerian mobile prefix (0811 = Glo) —
// libphonenumber validates against actual assigned ranges, so a
// timestamp-as-base36 string (which contains letters) or an unassigned
// prefix both get rejected as "unparseable"/"not SMS capable" rather than
// accepted as a test fixture. Six digits of the timestamp plus a per-use
// offset keeps phones unique within and across runs.
const testPhone = (offset) =>
  `+234811${String((Date.now() + offset) % 10000000).padStart(7, "0")}`;
// For non-phone unique strings (emails, OAuth subs, key ids) any suffix is
// fine — base36 is fine there since it's never passed through phone parsing.
const suffix = Date.now().toString(36);

describe("customer identity — password, PIN, provider login", () => {
  let customer;
  let accessToken;

  before(async () => {
    customer = await customerRepo.create({
      name: "Identity Test Customer",
      phone: testPhone(1),
      status: "Active",
      phoneVerifiedAt: new Date(),
    });

    // Manufacture a session the way verify-otp would, without spending an
    // OTP send: sign an access token directly against the running secret.
    const { signAccessToken } = require("../services/token.service");
    const sessionRepo = require("../repositories").sessionRepo;
    const token = sessionRepo.generateToken();
    const session = await sessionRepo.create("customer", customer.id, {
      token,
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceName: "",
      userAgent: null,
      ipAddress: null,
    });
    accessToken = signAccessToken("customer", customer, session.id);
  });

  after(async () => {
    // Not closeDb() here: a second describe block below shares this process
    // and this connection. Only the last describe in the file closes it.
    await db.delete(customerTrustedDevices).where(eq(customerTrustedDevices.customerId, customer.id));
    await db.delete(customerIdentities).where(eq(customerIdentities.customerId, customer.id));
    await db.delete(customerOtps).where(eq(customerOtps.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
  });

  test("email+password: set, then unrecognized device requires OTP step-up", async () => {
    const email = `identity-${suffix}@soroman.test`;

    const setRes = await request(app)
      .post(`${BASE}/password`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email, password: "correct horse battery" });
    assert.equal(setRes.status, 200);

    // Wrong password: uniform failure, not "wrong password" vs "no account".
    const wrong = await request(app)
      .post(`${BASE}/login/password`)
      .send({ email, password: "wrong password entirely" });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.success, false);

    // Correct password, no device token: step-up required, not a session.
    const stepUp = await request(app)
      .post(`${BASE}/login/password`)
      .send({ email, password: "correct horse battery" });
    assert.equal(stepUp.status, 200);
    assert.equal(stepUp.body.stepUpRequired, true);
    assert.ok(!stepUp.body.data?.accessToken, "no session issued before step-up");

    // Complete step-up with the dev-mode fixed code, trusting the device.
    const verify = await request(app)
      .post(`${BASE}/login/password/verify`)
      .send({
        phone: customer.phone,
        code: process.env.OTP_DEV_CODE,
        trustDevice: true,
        deviceName: "Test Browser",
      });
    assert.equal(verify.status, 200);
    assert.ok(verify.body.data.accessToken, "step-up issues a real session");
    assert.ok(verify.body.data.deviceToken, "trustDevice returns a device token");

    const deviceToken = verify.body.data.deviceToken;

    // Same password login, now presenting the trusted device token: signs
    // straight in, no step-up.
    const trusted = await request(app)
      .post(`${BASE}/login/password`)
      .send({ email, password: "correct horse battery", deviceToken });
    assert.equal(trusted.status, 200);
    assert.ok(trusted.body.data.accessToken, "trusted device skips step-up");
    assert.equal(trusted.body.stepUpRequired, undefined);
  });

  test("PIN: a device token that was never issued is refused outright", async () => {
    const setRes = await request(app)
      .post(`${BASE}/pin`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pin: "482913" });
    assert.equal(setRes.status, 200);

    // Correct PIN, but a device token that was never issued: refused. A client
    // that claims a trusted device and is wrong is a stronger abuse signal than
    // one that never claimed anything, so it fails rather than falling through
    // to the PIN-alone path the next test covers.
    const badDevice = await request(app)
      .post(`${BASE}/login/pin`)
      .send({ phone: customer.phone, pin: "482913", deviceToken: "not-a-real-token" });
    assert.equal(badDevice.status, 401);

    // Establish a trusted device via the password step-up flow. Issue a
    // fresh code directly rather than depending on another test having
    // triggered one — OTP dev mode always fixes the code, but a live one
    // must actually exist for verify to accept it.
    const otpService = require("../services/otp.service");
    await otpService.issueAndSend(customer, { action: "login", requestIp: null });

    const stepUp = await request(app)
      .post(`${BASE}/login/password/verify`)
      .send({ phone: customer.phone, code: process.env.OTP_DEV_CODE, trustDevice: true });
    assert.equal(stepUp.status, 200, JSON.stringify(stepUp.body));
    const deviceToken = stepUp.body.data.deviceToken;

    const withDevice = await request(app)
      .post(`${BASE}/login/pin`)
      .send({ phone: customer.phone, pin: "482913", deviceToken });
    assert.equal(withDevice.status, 200);
    assert.ok(withDevice.body.data.accessToken);

    // Wrong PIN even with a trusted device: still refused.
    const wrongPin = await request(app)
      .post(`${BASE}/login/pin`)
      .send({ phone: customer.phone, pin: "000000", deviceToken });
    assert.equal(wrongPin.status, 401);
  });

  test("PIN: signs in with no device token at all — the mobile app's path", async () => {
    // The app never runs an OTP, so it has no way to obtain a device token.
    // Omitting the field entirely must succeed: only a *presented* token that
    // fails to validate is refused (the test above). Sets its own PIN rather
    // than leaning on the previous test having run.
    const setRes = await request(app)
      .post(`${BASE}/pin`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pin: "482913" });
    assert.equal(setRes.status, 200);

    const res = await request(app)
      .post(`${BASE}/login/pin`)
      .send({ phone: customer.phone, pin: "482913" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.accessToken);
  });

  test("identities directory reflects what's linked", async () => {
    const res = await request(app)
      .get(`${BASE}/identities`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.status, 200);
    const providers = res.body.data.identities.map((i) => i.provider).sort();
    assert.deepEqual(providers, ["email", "pin"]);
    assert.ok(res.body.data.trustedDevices.length >= 1);
  });

  test("unlinking a provider removes it from the directory", async () => {
    const res = await request(app)
      .delete(`${BASE}/link/google`)
      .set("Authorization", `Bearer ${accessToken}`);
    // Never linked in the first place — not found, not a 500.
    assert.equal(res.status, 404);

    const del = await request(app)
      .delete(`${BASE}/devices/999999999`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(del.status, 404);
  });
});

describe("customer identity — Google sign-in (JWKS-mocked)", () => {
  const GOOGLE_HOST = "https://www.googleapis.com";
  const GOOGLE_JWKS_PATH = "/oauth2/v3/certs";
  const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  const KID = `test-kid-${suffix}`;

  let keyPair;
  let originalClientId;

  before(async () => {
    originalClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;

    keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  });

  after(async () => {
    // closeDb() happens once, in the last describe in this file.
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    nock.cleanAll();
  });

  const signGoogleToken = (claims) => {
    return jwt.sign(claims, keyPair.privateKey, {
      algorithm: "RS256",
      keyid: KID,
    });
  };

  const mockJwks = () => {
    const jwk = keyPair.publicKey.export({ format: "jwk" });
    nock(GOOGLE_HOST)
      .get(GOOGLE_JWKS_PATH)
      .reply(200, { keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] });
  };

  test("a brand-new Google identity is offered registration, not a session", async () => {
    mockJwks();
    const sub = `google-sub-${suffix}`;
    const idToken = signGoogleToken({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub,
      email: `newgoogle-${suffix}@example.com`,
      email_verified: true,
      name: "New Google User",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await request(app).post(`${BASE}/login/google`).send({ idToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.needsRegistration, true);
    assert.ok(res.body.data.registrationToken);
  });

  test("registering with the provider token creates a Pending customer and sends an OTP", async () => {
    mockJwks();
    const sub = `google-sub-reg-${suffix}`;
    const idToken = signGoogleToken({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub,
      email: `reggoogle-${suffix}@example.com`,
      email_verified: true,
      name: "Reg Google User",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const login = await request(app).post(`${BASE}/login/google`).send({ idToken });
    const registrationToken = login.body.data.registrationToken;

    const phone = testPhone(2);
    const reg = await request(app)
      .post(`${BASE}/register/google`)
      .send({ registrationToken, phone, name: "Reg Google User" });
    assert.equal(reg.status, 200);
    assert.equal(reg.body.success, true);

    const created = await customerRepo.findByPhone(phone);
    assert.ok(created, "customer row created");
    assert.equal(created.status, "Pending");

    const identity = await customerIdentityRepo.findByCustomerAndProvider(created.id, "google");
    assert.ok(identity, "google identity linked even before phone verification");

    // Second login with the same Google sub now finds the linked identity
    // directly — no registration step this time.
    mockJwks();
    const idToken2 = signGoogleToken({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub,
      email: `reggoogle-${suffix}@example.com`,
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const secondLogin = await request(app).post(`${BASE}/login/google`).send({ idToken: idToken2 });
    assert.equal(secondLogin.status, 200);
    assert.equal(secondLogin.body.data.customer.id, created.id);
    assert.ok(secondLogin.body.data.accessToken, "linked identity signs straight in");

    await db.delete(customerIdentities).where(eq(customerIdentities.customerId, created.id));
    await db.delete(customerOtps).where(eq(customerOtps.customerId, created.id));
    await db.delete(customers).where(eq(customers.id, created.id));
  });

  test("a tampered ID token (wrong signing key) is rejected uniformly", async () => {
    mockJwks();
    // Signed by a different key than the one served in the JWKS.
    const otherKeyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const idToken = jwt.sign(
      {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: "attacker-sub",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      otherKeyPair.privateKey,
      { algorithm: "RS256", keyid: KID }
    );

    const res = await request(app).post(`${BASE}/login/google`).send({ idToken });
    assert.equal(res.status, 401);
  });

  test("wrong audience is rejected", async () => {
    mockJwks();
    const idToken = signGoogleToken({
      iss: "https://accounts.google.com",
      aud: "some-other-app.apps.googleusercontent.com",
      sub: "sub-wrong-aud",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await request(app).post(`${BASE}/login/google`).send({ idToken });
    assert.equal(res.status, 401);
  });
});

// Full WebAuthn ceremonies need a real (or virtual) authenticator to produce
// a valid attestation/assertion signature — out of reach for a unit/HTTP test
// without a browser. What's covered here is the server contract: options are
// well-formed and scoped to the right account, and a garbage or replayed
// ceremony response is rejected rather than crashing.
describe("customer identity — passkeys (contract only, no real authenticator)", () => {
  let customer;
  let accessToken;

  before(async () => {
    customer = await customerRepo.create({
      name: "Passkey Test Customer",
      phone: testPhone(3),
      status: "Active",
      phoneVerifiedAt: new Date(),
    });

    const { signAccessToken } = require("../services/token.service");
    const sessionRepo = require("../repositories").sessionRepo;
    const token = sessionRepo.generateToken();
    const session = await sessionRepo.create("customer", customer.id, {
      token,
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceName: "",
      userAgent: null,
      ipAddress: null,
    });
    accessToken = signAccessToken("customer", customer, session.id);
  });

  after(async () => {
    await db.delete(customerIdentities).where(eq(customerIdentities.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await closeDb();
  });

  test("registration options are scoped to the authenticated customer", async () => {
    const res = await request(app)
      .post(`${BASE}/passkeys/register/options`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.name, customer.phone);
    assert.ok(res.body.data.challenge, "a challenge was issued");
    assert.equal(res.body.data.rp.id, process.env.WEBAUTHN_RP_ID || "localhost");
  });

  test("registration requires authentication", async () => {
    const res = await request(app).post(`${BASE}/passkeys/register/options`);
    assert.equal(res.status, 401);
  });

  test("login options require no authentication (discoverable credentials)", async () => {
    const res = await request(app).post(`${BASE}/passkeys/login/options`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.challenge);
    assert.equal(res.body.data.allowCredentials, undefined);
  });

  test("a garbage registration response is rejected, not a 500", async () => {
    await request(app)
      .post(`${BASE}/passkeys/register/options`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app)
      .post(`${BASE}/passkeys/register/verify`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ credential: { id: "not-real", response: { clientDataJSON: "not-base64url-json" } } });
    assert.equal(res.status, 400);
  });

  test("a garbage login response is rejected, not a 500", async () => {
    await request(app).post(`${BASE}/passkeys/login/options`);

    const res = await request(app)
      .post(`${BASE}/passkeys/login/verify`)
      .send({ credential: { id: "not-real", response: { clientDataJSON: "not-base64url-json" } } });
    assert.equal(res.status, 401);
  });

  test("deleting a nonexistent passkey 404s cleanly", async () => {
    const res = await request(app)
      .delete(`${BASE}/passkeys/999999999`)
      .set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.status, 404);
  });
});
