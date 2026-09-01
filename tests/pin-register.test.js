// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { NATIVE_TRANSPORT, closeDb } = require("./helpers");

const PORTAL_AUTH = "/api/customer/auth";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();
const PIN = "715304";

const phoneFor = (tag) => `+234816${String(RUN).slice(-6)}${tag}`;
const emailFor = (tag) => `pinreg${String(RUN).slice(-6)}${tag}@example.com`;

/** The one call the mobile app makes to sign someone up. */
const registerWithPin = (tag, over = {}) =>
  request(app)
    .post(`${PORTAL_AUTH}/register/pin`)
    .set(NATIVE_TRANSPORT)
    .send({
      name: `Pin Reg ${tag}`,
      phone: phoneFor(tag),
      email: emailFor(tag),
      pin: PIN,
      ...over,
    });

describe("OTP-free registration → PIN login", () => {
  after(async () => {
    await closeDb();
  });

  test("register/pin returns a session and an Active account, no OTP", async () => {
    const res = await registerWithPin("1");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.accessToken, "a session is issued immediately");
    assert.equal(res.body.data.customer.phone, phoneFor("1"));
    // Active, not Pending — `requireActiveCustomer` refuses Pending, so a
    // Pending account here would sign in fine and then fail to order.
    assert.equal(res.body.data.customer.status, "Active");
  });

  test("that PIN then signs in with NO device token at all", async () => {
    await registerWithPin("2");

    const login = await request(app)
      .post(`${PORTAL_AUTH}/login/pin`)
      .set(NATIVE_TRANSPORT)
      .send({ phone: phoneFor("2"), pin: PIN });

    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.data.customer.phone, phoneFor("2"));
    assert.ok(login.body.data.accessToken);
  });

  test("the email is an identifier too — it signs in the same account", async () => {
    await registerWithPin("3");

    const login = await request(app)
      .post(`${PORTAL_AUTH}/login/pin`)
      .set(NATIVE_TRANSPORT)
      .send({ email: emailFor("3"), pin: PIN });

    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.data.customer.phone, phoneFor("3"));
  });

  test("a wrong PIN is still refused", async () => {
    await registerWithPin("4");

    const bad = await request(app)
      .post(`${PORTAL_AUTH}/login/pin`)
      .set(NATIVE_TRANSPORT)
      .send({ phone: phoneFor("4"), pin: "000000" });

    assert.equal(bad.status, 401);
  });

  test("a presented-but-invalid device token still fails closed", async () => {
    await registerWithPin("5");

    // Absent is fine; wrong is not. Claiming a trusted device and being wrong
    // is a stronger abuse signal than never claiming one.
    const bogus = await request(app)
      .post(`${PORTAL_AUTH}/login/pin`)
      .set(NATIVE_TRANSPORT)
      .send({ phone: phoneFor("5"), pin: PIN, deviceToken: "not-a-real-token" });

    assert.equal(bogus.status, 401);
  });

  test("re-registering a phone that already has a PIN is refused, not taken over", async () => {
    await registerWithPin("6");

    const again = await request(app)
      .post(`${PORTAL_AUTH}/register/pin`)
      .set(NATIVE_TRANSPORT)
      .send({
        name: "Someone Else",
        phone: phoneFor("6"),
        email: `other${String(RUN).slice(-6)}6@example.com`,
        pin: "999999",
      });

    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(again.body.code, "ACCOUNT_EXISTS");

    // And the original PIN still works — the second caller changed nothing.
    const login = await request(app)
      .post(`${PORTAL_AUTH}/login/pin`)
      .set(NATIVE_TRANSPORT)
      .send({ phone: phoneFor("6"), pin: PIN });
    assert.equal(login.status, 200, "the incumbent's PIN is untouched");
  });

  test("an email already on another account is refused", async () => {
    await registerWithPin("7");

    const clash = await request(app)
      .post(`${PORTAL_AUTH}/register/pin`)
      .set(NATIVE_TRANSPORT)
      .send({
        name: "Email Clash",
        phone: phoneFor("8"),
        email: emailFor("7"),
        pin: PIN,
      });

    assert.equal(clash.status, 409, JSON.stringify(clash.body));
  });

  test("an OTP-registered account cannot be hijacked by register/pin", async () => {
    const phone = phoneFor("9");
    await request(app).post(`${PORTAL_AUTH}/register`).send({ name: "OTP User", phone });
    const ver = await request(app)
      .post(`${PORTAL_AUTH}/verify-otp`)
      .set(NATIVE_TRANSPORT)
      .send({ phone, code: DEV_CODE });
    assert.equal(ver.status, 200, JSON.stringify(ver.body));

    await request(app)
      .post(`${PORTAL_AUTH}/pin`)
      .set("Authorization", `Bearer ${ver.body.data.accessToken}`)
      .send({ pin: PIN });

    const hijack = await request(app)
      .post(`${PORTAL_AUTH}/register/pin`)
      .set(NATIVE_TRANSPORT)
      .send({
        name: "Attacker",
        phone,
        email: `attacker${String(RUN).slice(-6)}@example.com`,
        pin: "111111",
      });

    assert.equal(hijack.status, 409, "an account with a credential is never claimable");
  });

  test("a short PIN is rejected by the schema", async () => {
    const res = await registerWithPin("A", { pin: "1234" });
    assert.equal(res.status, 400);
  });
});
