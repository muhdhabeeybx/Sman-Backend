// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { eq } = require("drizzle-orm");

const app = require("../app");
const { db } = require("../config/db");
const {
  customers,
  customerIdentities,
  customerOtps,
  customerTrustedDevices,
} = require("../db/schema");
const { customerRepo, customerOtpRepo } = require("../repositories");
const otpService = require("../services/otp.service");
const identityService = require("../services/identity.service");
const { closeDb, NATIVE_TRANSPORT } = require("./helpers");

const BASE = "/api/customer/auth";
const DEMO_CODE = "000000";
const PASSWORD = "reviewer-password-1";

// 0803 = MTN mobile. Seven digits of the timestamp keep phones unique
// across reruns without colliding with the shared test fixtures.
const stamp = Date.now();
const demoPhone = `+234803${String(stamp).slice(-7)}`;
const otherPhone = `+234811${String(stamp + 1).slice(-7)}`;
const demoEmail = `demo-review-${stamp}@soroman.test`;

describe("store-review demo OTP (single-number static code)", () => {
  const ORIGINAL = {
    OTP_DEV_MODE: process.env.OTP_DEV_MODE,
    OTP_DEMO_PHONES: process.env.OTP_DEMO_PHONES,
    OTP_DEMO_CODE: process.env.OTP_DEMO_CODE,
  };

  let demoCustomer;
  let otherCustomer;

  const enableDemo = () => {
    process.env.OTP_DEV_MODE = "false";
    process.env.OTP_DEMO_PHONES = demoPhone;
    process.env.OTP_DEMO_CODE = DEMO_CODE;
  };

  before(async () => {
    enableDemo();
    demoCustomer = await customerRepo.create({
      name: "Demo Reviewer",
      phone: demoPhone,
      email: demoEmail,
      status: "Active",
      phoneVerifiedAt: new Date(),
    });
    otherCustomer = await customerRepo.create({
      name: "Regular Customer",
      phone: otherPhone,
      email: `other-review-${stamp}@soroman.test`,
      status: "Active",
      phoneVerifiedAt: new Date(),
    });
    await identityService.setEmailPassword(demoCustomer, {
      email: demoEmail,
      password: PASSWORD,
    });
  });

  after(async () => {
    process.env.OTP_DEV_MODE = ORIGINAL.OTP_DEV_MODE;
    process.env.OTP_DEMO_PHONES = ORIGINAL.OTP_DEMO_PHONES;
    process.env.OTP_DEMO_CODE = ORIGINAL.OTP_DEMO_CODE;

    for (const c of [demoCustomer, otherCustomer]) {
      if (!c) continue;
      await db.delete(customerTrustedDevices).where(eq(customerTrustedDevices.customerId, c.id));
      await db.delete(customerIdentities).where(eq(customerIdentities.customerId, c.id));
      await db.delete(customerOtps).where(eq(customerOtps.customerId, c.id));
      await db.delete(customers).where(eq(customers.id, c.id));
    }
    await closeDb();
  });

  beforeEach(async () => {
    enableDemo();
    await db.delete(customerOtps).where(eq(customerOtps.customerId, demoCustomer.id));
    await db.delete(customerOtps).where(eq(customerOtps.customerId, otherCustomer.id));
  });

  test("issueAndSend on the demo number uses the static code and skips SMS", async () => {
    const result = await otpService.issueAndSend(demoCustomer, {
      action: "login",
      requestIp: "203.0.113.40",
    });
    assert.equal(result.sent, true);
    assert.equal(result.reason, "demo_account");
    const live = await customerOtpRepo.findLive(demoCustomer.id);
    assert.equal(live.codeHash, customerOtpRepo.hashCode(demoCustomer.id, DEMO_CODE));
  });

  test("a local 0803… form of the same number is treated as the demo account", () => {
    const local = `0${demoPhone.slice(4)}`;
    assert.equal(otpService.isDemoAccount(local), true);
    assert.equal(otpService.isDemoAccount(otherPhone), false);
  });

  test("verify accepts the static code even with no live OTP row", async () => {
    const verified = await otpService.verifyCode(
      demoCustomer.id,
      DEMO_CODE,
      otpService.PURPOSE_AUTH
    );
    assert.equal(verified.ok, true);
  });

  test("a wrong code on the demo number is still refused", async () => {
    const verified = await otpService.verifyCode(
      demoCustomer.id,
      "111111",
      otpService.PURPOSE_AUTH
    );
    assert.equal(verified.ok, false);
  });

  test("a neighbouring number cannot use the demo code", async () => {
    const verified = await otpService.verifyCode(
      otherCustomer.id,
      DEMO_CODE,
      otpService.PURPOSE_AUTH
    );
    assert.equal(verified.ok, false);
  });

  test("unsetting the allowlist fails closed", async () => {
    process.env.OTP_DEMO_PHONES = "";
    assert.equal(otpService.isDemoAccount(demoPhone), false);
    const verified = await otpService.verifyCode(
      demoCustomer.id,
      DEMO_CODE,
      otpService.PURPOSE_AUTH
    );
    assert.equal(verified.ok, false);
  });

  test("email+password on a new device steps up, then 000000 issues a session", async () => {
    const stepUp = await request(app)
      .post(`${BASE}/login/password`)
      .send({ email: demoEmail, password: PASSWORD });
    assert.equal(stepUp.status, 200);
    assert.equal(stepUp.body.stepUpRequired, true);
    assert.equal(stepUp.body.data.phone, demoPhone);
    assert.equal(stepUp.body.data.accessToken, undefined);

    const verify = await request(app)
      .post(`${BASE}/login/password/verify`)
      .set(NATIVE_TRANSPORT)
      .send({ phone: demoPhone, code: DEMO_CODE, trustDevice: true, deviceName: "Reviewer iPhone" });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    assert.ok(verify.body.data.accessToken);
    assert.ok(verify.body.data.deviceToken);
  });

  test("phone OTP login on the demo number accepts 000000", async () => {
    const requested = await request(app).post(`${BASE}/request-otp`).send({ phone: demoPhone });
    assert.equal(requested.status, 200);

    const verify = await request(app)
      .post(`${BASE}/verify-otp`)
      .set(NATIVE_TRANSPORT)
      .send({ phone: demoPhone, code: DEMO_CODE });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    assert.ok(verify.body.data.accessToken);
  });
});
