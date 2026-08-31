// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const { staffToken, closeDb } = require("./helpers");
const { customerRepo, customerPhoneRepo, notificationDeliveryRepo } = require("../repositories");
const { deliveryReason, REASON_CATALOG } = require("../utils/deliveryReason");

const CUSTOMERS = "/api/customers";
const PORTAL = "/api/customer/auth";
const DEV_CODE = process.env.OTP_DEV_CODE || "000000";
const RUN = String(Date.now()).slice(-6);

/** Numbers unique to this run, so a re-run cannot collide on the phone index. */
const num = (tag) => `0803${RUN}${tag}`;

let tokenPromise = null;
const sharedToken = () => (tokenPromise ??= staffToken(request, app));

const cleanup = async () => {
  // customer_phones cascades off customers, so deleting the customer is enough.
  await db.execute(sql`DELETE FROM customers WHERE phone LIKE ${`%${RUN}%`}`);
  await db.execute(sql`DELETE FROM notification_deliveries WHERE destination LIKE ${`%${RUN}%`}`);
};

before(cleanup);
after(async () => {
  await cleanup();
  await closeDb();
});

describe("one customer, several numbers", () => {
  let token;
  let customerId;

  before(async () => {
    token = await sharedToken();
    const res = await request(app)
      .post(CUSTOMERS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Multi Line Ltd", phone: num("1"), companyName: "Multi Line" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    customerId = res.body.data.customer.id;
  });

  test("the primary comes back in the list even though it lives on the customer row", async () => {
    const res = await request(app)
      .get(`${CUSTOMERS}/${customerId}/phones`)
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200);
    const { phones } = res.body.data;
    assert.equal(phones.length, 1);
    assert.equal(phones[0].isPrimary, true);
    // Null, not a row id — it has no row, and a fake id would make
    // DELETE /phones/:id look like it should work on the primary.
    assert.equal(phones[0].id, null);
  });

  test("an added number is a way into the same account", async () => {
    const add = await request(app)
      .post(`${CUSTOMERS}/${customerId}/phones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: num("2"), label: "Warehouse" });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    assert.equal(add.body.data.phones.length, 2);

    // The whole point: the alternate resolves the account the primary owns.
    const match = await customerRepo.findByAnyPhone(num("2"));
    assert.ok(match, "the alternate did not resolve to a customer");
    assert.equal(match.customer.id, customerId);
    assert.equal(match.isPrimary, false);
  });

  test("however the number is typed, it finds the same account", async () => {
    // Stored E.164, searched in local format — the two must agree, or the
    // collision simply moves out of the database and into the login.
    const local = await customerRepo.findByAnyPhone(num("2"));
    const international = await customerRepo.findByAnyPhone(`+234${num("2").slice(1)}`);
    assert.equal(local.customer.id, customerId);
    assert.equal(international.customer.id, customerId);
  });

  test("a number already on another account is refused, and the owner is named", async () => {
    const other = await request(app)
      .post(CUSTOMERS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Somebody Else", phone: num("3") });
    assert.equal(other.status, 201);

    const clash = await request(app)
      .post(`${CUSTOMERS}/${customerId}/phones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: num("3") });

    assert.equal(clash.status, 409);
    // Named, not just refused — "that number is taken" leaves the desk unable
    // to tell a duplicate of their own customer from a genuine clash.
    assert.match(clash.body.message, /Somebody Else/);
  });

  test("creating a customer on somebody's ALTERNATE is refused too", async () => {
    // The half no unique index can enforce: the clash is in the other table.
    const res = await request(app)
      .post(CUSTOMERS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Sneaky Duplicate", phone: num("2") });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /Multi Line Ltd/);
    assert.match(res.body.message, /one of their numbers/);
  });

  test("adding the same number twice is a no-op, not an error", async () => {
    const res = await request(app)
      .post(`${CUSTOMERS}/${customerId}/phones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: num("2") });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.phones.length, 2);
  });

  test("an unparseable number never reaches the table", async () => {
    const res = await request(app)
      .post(`${CUSTOMERS}/${customerId}/phones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: "0802121" });

    assert.equal(res.status, 400);
    const phones = await customerPhoneRepo.listAll(customerId);
    assert.equal(phones.length, 2);
  });

  test("promoting an alternate swaps it with the primary, and both still sign in", async () => {
    const before = await customerPhoneRepo.listAll(customerId);
    const alternate = before.find((p) => !p.isPrimary);
    const oldPrimary = before.find((p) => p.isPrimary).phone;

    const res = await request(app)
      .post(`${CUSTOMERS}/${customerId}/phones/${alternate.id}/primary`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const customer = await customerRepo.findById(customerId);
    assert.equal(customer.phone, alternate.phone);

    // The old primary is kept, not discarded: it still signs in, and it is
    // still the number half the order history was confirmed on.
    const stillWorks = await customerRepo.findByAnyPhone(oldPrimary);
    assert.ok(stillWorks, "the demoted primary stopped resolving");
    assert.equal(stillWorks.customer.id, customerId);
    assert.equal(stillWorks.isPrimary, false);
  });

  test("removing an alternate takes the number out of the account", async () => {
    const phones = await customerPhoneRepo.listAll(customerId);
    const alternate = phones.find((p) => !p.isPrimary);

    const res = await request(app)
      .delete(`${CUSTOMERS}/${customerId}/phones/${alternate.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);

    assert.equal(await customerRepo.findByAnyPhone(alternate.phone), null);
  });

  test("another customer's number cannot be removed through this customer's path", async () => {
    const victim = await request(app)
      .post(CUSTOMERS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Victim Ltd", phone: num("4") });
    const victimId = victim.body.data.customer.id;

    const added = await request(app)
      .post(`${CUSTOMERS}/${victimId}/phones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: num("5") });
    assert.equal(added.status, 201);
    const theirPhone = added.body.data.phones.find((p) => !p.isPrimary);

    // Ownership is checked against the path, so another customer's id 404s
    // rather than deleting a row that happens to exist.
    const res = await request(app)
      .delete(`${CUSTOMERS}/${customerId}/phones/${theirPhone.id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 404);

    assert.ok(await customerRepo.findByAnyPhone(num("5")));
  });
});

describe("signing in on any of your numbers", () => {
  let token;
  let customerId;

  before(async () => {
    token = await sharedToken();
    const res = await request(app)
      .post(CUSTOMERS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Two Line Trader", phone: num("6"), status: "Active" });
    customerId = res.body.data.customer.id;

    // Asserted, not assumed. A setup that silently 409s leaves the tests below
    // failing on "the alternate was not verified" — which points at the login
    // code rather than at the fixture that never existed.
    const added = await request(app)
      .post(`${CUSTOMERS}/${customerId}/phones`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: num("7"), label: "Second line" });
    assert.equal(added.status, 201, JSON.stringify(added.body));
  });

  test("an OTP requested on the alternate signs the same account in", async () => {
    const asked = await request(app).post(`${PORTAL}/request-otp`).send({ phone: num("7") });
    assert.equal(asked.status, 200);

    const verified = await request(app)
      .post(`${PORTAL}/verify-otp`)
      .send({ phone: num("7"), code: DEV_CODE });

    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.data.customer.id, customerId);
  });

  test("passing a code on an alternate proves THAT number, not the primary", async () => {
    // phone_verified_at on the customer row describes the primary. Stamping it
    // from an alternate would claim a number nobody has answered on.
    const customer = await customerRepo.findById(customerId);
    assert.equal(customer.phoneVerifiedAt, null);

    const phones = await customerPhoneRepo.listAll(customerId);
    const alternate = phones.find((p) => !p.isPrimary);
    assert.ok(alternate.verifiedAt, "the alternate was not marked verified");
  });

  test("registering on a number already on the account joins it rather than doubling it", async () => {
    const res = await request(app)
      .post(`${PORTAL}/register`)
      .send({ name: "Different Name Typed", phone: num("7") });
    assert.equal(res.status, 200);

    // No second customer on that number — which is precisely how the
    // duplicate groups on the live book were created.
    const verified = await request(app)
      .post(`${PORTAL}/verify-otp`)
      .send({ phone: num("7"), code: DEV_CODE });
    assert.equal(verified.body.data.customer.id, customerId);
  });

  test("a number on nobody's account still gets nothing back", async () => {
    // The enumeration guarantee has to survive the new lookup: an unknown
    // number must answer exactly as a known one does.
    const asked = await request(app).post(`${PORTAL}/request-otp`).send({ phone: num("8") });
    assert.equal(asked.status, 200);

    const verified = await request(app)
      .post(`${PORTAL}/verify-otp`)
      .send({ phone: num("8"), code: DEV_CODE });
    assert.equal(verified.status, 401);
  });
});

describe("the delivery log says what actually happened", () => {
  let token;

  before(async () => {
    token = await sharedToken();
  });

  test("a raw provider complaint becomes one short reason", () => {
    // The text stored is the evidence and stays untouched; the reason is what
    // a person scanning 300 failures can actually act on.
    const cases = [
      [{ status: "failed", error: 'dnd: Successfully Sent | generic: {"code":402,"message":"Insufficient balance"}' }, "no_credit"],
      [{ status: "failed", providerStatus: "DND Active on phone number" }, "dnd"],
      [{ status: "failed", providerStatus: "Rejected", error: "Carrier reported: Rejected" }, "rejected"],
      [{ status: "failed", providerStatus: "Expired" }, "expired"],
      [{ status: "failed", error: "Invalid phone number" }, "bad_number"],
      [{ status: "failed", error: "You have reached your daily email sending quota." }, "quota_exceeded"],
      [{ status: "failed", error: "Too many requests. You can only make 10 requests per second." }, "rate_limited"],
      [{ status: "delivered" }, "delivered"],
      [{ status: "sent" }, "awaiting_receipt"],
      [{ status: "suppressed" }, "opted_out"],
      [{ status: "skipped", error: "No phone number on file" }, "no_address"],
      [{ status: "failed", error: "something nobody has seen before" }, "other"],
    ];
    for (const [row, expected] of cases) {
      assert.equal(deliveryReason(row).code, expected, JSON.stringify(row));
    }
  });

  test("the channel label in a fallback error is not mistaken for a DND rejection", () => {
    // sendSMSWithFallback labels each attempt with the channel it tried, so a
    // failure that never involved DND still reads "dnd: … | generic: …".
    // Matching the bare word would file every fallback failure as a DND
    // problem — which is most of them.
    const row = { status: "failed", error: "dnd: Termii error | generic: Termii error" };
    assert.equal(deliveryReason(row).code, "other");
  });

  test("every reason a row can carry has a label to render", () => {
    for (const code of Object.keys(REASON_CATALOG)) {
      assert.ok(REASON_CATALOG[code].label, `${code} has no label`);
      assert.ok(REASON_CATALOG[code].tone, `${code} has no tone`);
    }
  });

  test("the SQL and JS classifiers agree, row for row", async () => {
    // They are two copies of the same rules — one for filtering and grouping
    // in Postgres, one for shaping a row in JS — and the only thing keeping
    // them honest is this.
    const { rows } = await notificationDeliveryRepo.findAll({ limit: 200 });
    for (const row of rows) {
      assert.equal(
        row.reasonCode,
        deliveryReason(row).code,
        `disagreed on: ${JSON.stringify(row.error || row.providerStatus || row.status).slice(0, 120)}`
      );
    }
  });

  test("a row with no recorded name is still attributed to whoever holds the number", async () => {
    // Most of the log predates the recipient_name column. A log that shows a
    // bare number for half its rows is one nobody can answer a call from.
    const customer = await customerRepo.create({
      name: "Named By Lookup",
      phone: num("9"),
      status: "Active",
    });

    await db.execute(sql`
      INSERT INTO notification_deliveries (type, channel, destination, status, recipient_name, error)
      VALUES ('system.announcement', 'sms', ${customer.phone}, 'failed', '', 'Carrier reported: Rejected')
    `);

    const { rows } = await notificationDeliveryRepo.findAll({ search: "Named By Lookup", limit: 5 });
    assert.ok(rows.length >= 1, "the fallback name was not searchable");
    assert.equal(rows[0].recipientName, "Named By Lookup");
    // Said out loud: a name looked up today is a fair guess at who holds the
    // number, not a record of who was addressed.
    assert.equal(rows[0].nameResolvedNow, true);
    assert.equal(rows[0].reasonCode, "rejected");
  });

  test("an alternate number resolves a name too", async () => {
    // findByAnyPhone, not findByPhone: the fixture above was written straight
    // through the repository, so it holds the raw local form rather than E.164.
    const customer = (await customerRepo.findByAnyPhone(num("9"))).customer;
    await customerPhoneRepo.create({ customerId: customer.id, phone: `+234${num("0").slice(1)}` });

    await db.execute(sql`
      INSERT INTO notification_deliveries (type, channel, destination, status, recipient_name)
      VALUES ('system.announcement', 'sms', ${`+234${num("0").slice(1)}`}, 'sent', '')
    `);

    const { rows } = await notificationDeliveryRepo.findAll({
      search: num("0").slice(-6),
      limit: 5,
    });
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].recipientName, "Named By Lookup");
  });

  test("the log can be narrowed to one kind of failure", async () => {
    const res = await request(app)
      .get("/api/notifications/deliveries")
      .query({ reason: "rejected", limit: 5 })
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200);
    for (const row of res.body.data.data) assert.equal(row.reasonCode, "rejected");
  });

  test("the summary counts a day, names its failures and prices it", async () => {
    const res = await request(app)
      .get("/api/notifications/delivery-summary")
      .query({ groupBy: "day", limit: 5 })
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { buckets, reasons } = res.body.data;
    assert.ok(Array.isArray(buckets));
    assert.ok(buckets.length >= 1, "no day buckets came back");

    const day = buckets[0];
    // The counts have to add up, or the summary and the rows beneath it
    // describe different sets.
    assert.equal(
      day.delivered + day.sent + day.failed + day.pending + day.skipped,
      day.total
    );
    assert.ok(Array.isArray(day.reasons));
    for (const r of day.reasons) {
      assert.ok(reasons[r.code], `${r.code} is not in the catalogue`);
      // Delivered needs no explanation and would bury the ones that do.
      assert.notEqual(r.code, "delivered");
    }
    // Null, never 0, when no wallet reading exists — "could not read" and
    // "cost nothing" are different facts.
    assert.ok(day.spent === null || typeof day.spent === "number");
  });

  test("grouping by campaign keeps the sends that belong to no campaign", async () => {
    const res = await request(app)
      .get("/api/notifications/delivery-summary")
      .query({ groupBy: "campaign", limit: 10 })
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200);
    const orphan = res.body.data.buckets.find((b) => b.key === null);
    assert.ok(orphan, "transactional sends were dropped from the campaign view");
    assert.match(orphan.label, /Not part of a broadcast/);
    // And it says how many of them nothing has priced.
    assert.equal(typeof orphan.unpricedSms, "number");
  });

  test("the summary honours the same filters as the list", async () => {
    // If they diverged, the counts would stop reconciling the moment somebody
    // narrowed the log.
    const [list, summary] = await Promise.all([
      request(app)
        .get("/api/notifications/deliveries")
        .query({ channel: "sms", limit: 1 })
        .set("Authorization", `Bearer ${token}`),
      request(app)
        .get("/api/notifications/delivery-summary")
        .query({ channel: "sms", groupBy: "campaign", limit: 365 })
        .set("Authorization", `Bearer ${token}`),
    ]);

    const summed = summary.body.data.buckets.reduce((n, b) => n + b.total, 0);
    assert.equal(summed, list.body.data.pagination.total);
  });
});
