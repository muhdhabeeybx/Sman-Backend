// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { customerRepo } = require("../repositories");
const { NATIVE_TRANSPORT, closeDb } = require("./helpers");

const PORTAL_AUTH = "/api/customer/auth";
const PROFILE = "/api/customer/profile";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = Date.now();

async function registerCustomer(tag) {
  const phone = `+234814${String(RUN).slice(-6)}${tag}`;
  const reg = await request(app)
    .post(`${PORTAL_AUTH}/register`)
    .send({ name: `Profile ${tag}`, phone, companyName: "Profile Co" });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const ver = await request(app)
    .post(`${PORTAL_AUTH}/verify-otp`)
    .set(NATIVE_TRANSPORT)
    .send({ phone, code: DEV_CODE });
  assert.equal(ver.status, 200, JSON.stringify(ver.body));
  const customer = await customerRepo.findByPhone(phone);
  return { customer, accessToken: ver.body.data.accessToken, phone };
}

describe("customer portal — own profile", () => {
  after(async () => {
    await closeDb();
  });

  test("requires authentication", async () => {
    const res = await request(app).get(PROFILE);
    assert.equal(res.status, 401);
  });

  test("GET returns the customer with address; virtualAccount stays null by design", async () => {
    const { customer, accessToken } = await registerCustomer("1");
    // Even a customer whose row still carries DVA columns gets null back:
    // wallet funding is manual-deposit-only (orders show the depot's own
    // bank account), and profilePayload deliberately keeps the field in the
    // response shape but never populates it — see profile.controller.js.
    await customerRepo.update(customer.id, {
      address: "12 Depot Rd, Apapa",
      virtualAccountNumber: `99${String(RUN).slice(-8)}`,
      virtualAccountBank: "Test Bank",
      virtualAccountName: "SOROMAN / PROFILE",
    });

    const res = await request(app).get(PROFILE).set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.customer.address, "12 Depot Rd, Apapa");
    assert.equal(res.body.data.customer.companyName, "Profile Co");
    assert.equal(res.body.data.virtualAccount, null, "always null while DVA funding is disabled");
    assert.ok(!("balance" in res.body.data.customer), "internal fields stay internal");
  });

  test("GET reports a null virtual account until one is assigned", async () => {
    const { accessToken } = await registerCustomer("2");
    const res = await request(app).get(PROFILE).set("Authorization", `Bearer ${accessToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.virtualAccount, null);
  });

  test("PATCH updates the allowed text fields", async () => {
    const { accessToken } = await registerCustomer("3");
    const res = await request(app)
      .patch(PROFILE)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Renamed Buyer", email: "buyer@profile.test", address: "New address" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.customer.name, "Renamed Buyer");
    assert.equal(res.body.data.customer.email, "buyer@profile.test");
    assert.equal(res.body.data.customer.address, "New address");
  });

  test("PATCH refuses fields a customer must never write", async () => {
    const { customer, accessToken } = await registerCustomer("4");
    const res = await request(app)
      .patch(PROFILE)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "Active", balance: "9999999", phone: "+2348000000000" });
    // The schema strips/rejects unknown keys; with nothing allowed left, the
    // request is a validation error, not a silent no-op write.
    assert.equal(res.status, 400, JSON.stringify(res.body));
    const fresh = await customerRepo.findById(customer.id);
    assert.notEqual(fresh.phone, "+2348000000000", "phone is never writable here");
  });

  test("PATCH with an empty body is refused", async () => {
    const { accessToken } = await registerCustomer("5");
    const res = await request(app)
      .patch(PROFILE)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});
    assert.equal(res.status, 400);
  });
});
