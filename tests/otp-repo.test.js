// Must precede any require that reaches config/db, which reads DATABASE_URL at
// module load. Explicit here rather than relying on require order via helpers.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { customerOtpRepo } = require("../repositories");
const { ensureTestCustomer, closeDb } = require("./helpers");

describe("customerOtp.repository — one live code, single use", () => {
  let customerId;

  before(async () => {
    customerId = (await ensureTestCustomer()).id;
  });

  after(async () => {
    await closeDb();
  });

  test("generated codes are 6 digits and cover the low keyspace", () => {
    // The common `100000 + rand*900000` form can never emit a code below
    // 100000 — 10% of the keyspace. Zero-padded codes must appear.
    let sawLeadingZero = false;
    for (let i = 0; i < 4000; i++) {
      const code = customerOtpRepo.generateCode();
      assert.match(code, /^\d{6}$/);
      if (code.startsWith("0")) sawLeadingZero = true;
    }
    assert.ok(sawLeadingZero, "codes below 100000 must be reachable");
  });

  test("the code hash is domain-separated by customer", () => {
    const a = customerOtpRepo.hashCode(1, "123456");
    const b = customerOtpRepo.hashCode(2, "123456");
    assert.notEqual(a, b, "same code, different customer, different hash");
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test("issuing a code invalidates the previous one", async () => {
    const first = await customerOtpRepo.issue(customerId);
    const second = await customerOtpRepo.issue(customerId);

    const live = await customerOtpRepo.findLive(customerId);
    assert.equal(live.id, second.row.id, "only the newest code is live");
    assert.notEqual(first.row.id, second.row.id);
  });

  test("the plaintext code never reaches the stored row", async () => {
    const { row, code } = await customerOtpRepo.issue(customerId);
    const serialised = JSON.stringify(row);
    assert.ok(!serialised.includes(code), "row must not carry the plaintext");
    assert.equal(row.codeHash, customerOtpRepo.hashCode(customerId, code));
  });

  test("consume is guarded — a correct code cannot be redeemed twice", async () => {
    const { row } = await customerOtpRepo.issue(customerId);

    const results = await Promise.all([
      customerOtpRepo.consume(row.id),
      customerOtpRepo.consume(row.id),
      customerOtpRepo.consume(row.id),
    ]);
    assert.equal(results.filter(Boolean).length, 1, "exactly one consume wins");
    assert.equal(await customerOtpRepo.findLive(customerId), null, "no live code remains");
  });

  test("failed attempts accumulate on the row being guessed", async () => {
    const { row } = await customerOtpRepo.issue(customerId);
    for (let i = 0; i < 3; i++) await customerOtpRepo.recordFailedAttempt(row.id);

    const live = await customerOtpRepo.findLive(customerId);
    assert.equal(live.attempts, 3, "attempts land on the live row, not a fresh one");
    assert.ok(customerOtpRepo.MAX_ATTEMPTS >= live.attempts);
  });

  test("an expired code is not live", async () => {
    await customerOtpRepo.issue(customerId, { ttlMinutes: -1 });
    assert.equal(
      await customerOtpRepo.findLive(customerId),
      null,
      "a code past expiry must not be returned"
    );
  });

  test("countSince bounds by phone and by IP independently", async () => {
    const ip = "203.0.113.77";
    const before = await customerOtpRepo.countSince({ customerId, sinceMinutes: 60 });

    await customerOtpRepo.issue(customerId, { requestIp: ip });
    await customerOtpRepo.issue(customerId, { requestIp: ip });

    const byCustomer = await customerOtpRepo.countSince({ customerId, sinceMinutes: 60 });
    assert.equal(byCustomer, before + 2);

    const byIp = await customerOtpRepo.countSince({ requestIp: ip, sinceMinutes: 60 });
    assert.ok(byIp >= 2, "IP counter sees the same sends");

    const windowed = await customerOtpRepo.countSince({ customerId, sinceMinutes: 0 });
    assert.equal(windowed, 0, "a zero-length window counts nothing");
  });

  test("countToday sees sends made today", async () => {
    // Backs the daily SMS spend cap, so it must move when a code is issued.
    const before = await customerOtpRepo.countToday();
    await customerOtpRepo.issue(customerId);
    assert.equal(await customerOtpRepo.countToday(), before + 1);
  });

  test("auth and account_deletion codes do not clobber each other", async () => {
    const auth = await customerOtpRepo.issue(customerId, {
      purpose: customerOtpRepo.PURPOSE_AUTH,
    });
    const del = await customerOtpRepo.issue(customerId, {
      purpose: customerOtpRepo.PURPOSE_ACCOUNT_DELETION,
    });

    const liveAuth = await customerOtpRepo.findLive(customerId, customerOtpRepo.PURPOSE_AUTH);
    const liveDel = await customerOtpRepo.findLive(
      customerId,
      customerOtpRepo.PURPOSE_ACCOUNT_DELETION
    );

    assert.equal(liveAuth.id, auth.row.id);
    assert.equal(liveDel.id, del.row.id);
    assert.notEqual(liveAuth.id, liveDel.id);
  });
});
