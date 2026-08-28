// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const { staffToken, closeDb } = require("./helpers");
const { classifyPhone } = require("../utils/phone");
const { peopleRepo, notificationDeliveryRepo, messageCampaignRepo } = require("../repositories");

const PEOPLE = "/api/people";
const CONTACTS = "/api/contacts";
const RUN = String(Date.now()).slice(-6);

/** Numbers unique to this run, so a re-run cannot collide on the phone index. */
const num = (tag) => `0803${RUN}${tag}`;

/**
 * The rows out of a db.execute().
 *
 * The postgres.js driver returns the array itself; others wrap it in `.rows`.
 * The repositories all normalise the same way, and a test that assumed one
 * shape would pass or fail on the driver rather than on the behaviour.
 */
const rowsOf = (result) => result.rows ?? result;

const cleanup = async () => {
  await db.execute(sql`DELETE FROM contacts WHERE phone LIKE ${`%${RUN}%`}`);
  await db.execute(sql`DELETE FROM customers WHERE phone LIKE ${`%${RUN}%`}`);
};

describe("phone hygiene — classifying what is on the book", () => {
  test("names WHY a number is unusable, not just that it is", () => {
    // The reason matters: someone fixing a column of bad numbers by hand needs
    // to see at a glance which are truncated and which are typos.
    assert.equal(classifyPhone("0802121").verdict, "invalid");
    assert.match(classifyPhone("0802121").reason, /Too short — only 7 digits/);

    assert.equal(classifyPhone("0000000000").verdict, "invalid");
    assert.match(classifyPhone("0000000000").reason, /Placeholder/);

    assert.equal(classifyPhone("").verdict, "invalid");
    assert.equal(classifyPhone(null).verdict, "invalid");
  });

  test("a valid mobile passes and is reported in E.164", () => {
    const result = classifyPhone("08108699059");
    assert.equal(result.verdict, "ok");
    assert.equal(result.e164, "+2348108699059");
    assert.equal(result.reason, "");
  });

  test("the same number written four ways yields one identity", () => {
    const forms = ["08108699059", "+2348108699059", "234 810 869 9059", "0810-869-9059"];
    const keys = new Set(forms.map((f) => classifyPhone(f).e164));
    assert.equal(keys.size, 1, "every spelling must normalise to the same number");
  });

  test("a landline is valid but must never count as an SMS recipient", () => {
    // The distinction the whole feature turns on: this is a real number worth
    // holding as a contact detail, and an SMS to it is billed and lost.
    const result = classifyPhone("+2348009101113");
    assert.equal(result.verdict, "unreachable");
    assert.match(result.reason, /billed and never arrives/);
  });
});

describe("people — customers and contacts as one book", () => {
  let token;

  before(async () => {
    token = await staffToken(request, app);
    await cleanup();
  });

  // No closeDb() here — the connection is shared across every describe in this
  // file, and the first hook to close it would fail every suite after it.
  // Only the last describe closes.
  after(cleanup);

  test("requires staff authentication", async () => {
    const res = await request(app).get(PEOPLE);
    assert.equal(res.status, 401);
  });

  test("a lead who becomes a customer occupies ONE row, not two", async () => {
    const phone = num("1");

    await request(app)
      .post(CONTACTS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Converting Lead", phone, companyName: "Lead Co" })
      .expect(201);

    let res = await request(app)
      .get(PEOPLE)
      .query({ search: phone })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.people.length, 1);
    assert.equal(res.body.data.people[0].kind, "lead");

    // The customer is created on the SAME number, written differently — which
    // is exactly how the duplicate used to appear.
    await db.execute(
      sql`INSERT INTO customers (name, phone, status) VALUES ('Converting Lead', ${`+234${phone.slice(1)}`}, 'Active')`
    );

    res = await request(app)
      .get(PEOPLE)
      .query({ search: phone })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.body.data.people.length, 1, "the same person must not appear twice");

    const row = res.body.data.people[0];
    assert.equal(row.kind, "customer", "the customer record wins the row");
    assert.equal(row.cameInAsLead, true, "and remembers it started as a lead");
  });

  test("filters split the book the way the page's Type control does", async () => {
    const res = await request(app)
      .get(PEOPLE)
      .query({ kind: "customer", search: num("1") })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.people.every((p) => p.kind === "customer"));

    const prospects = await request(app)
      .get(PEOPLE)
      .query({ kind: "prospect", search: num("1") })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(prospects.body.data.people.length, 0, "a converted lead is no longer a prospect");
  });

  test("a broken number is reported on its own row, with the reason", async () => {
    const phone = `0${RUN}`; // seven digits — too short to be anything
    await db.execute(
      sql`INSERT INTO contacts (name, phone, stage) VALUES ('Broken Number', ${phone}, 'lead')`
    );

    const res = await request(app)
      .get(PEOPLE)
      .query({ search: phone })
      .set("Authorization", `Bearer ${token}`);
    const row = res.body.data.people.find((p) => p.name === "Broken Number");
    assert.ok(row, "the row must still be listed — it is bad data, not hidden data");
    assert.equal(row.numberStatus, "invalid");
    assert.match(row.numberReason, /Too short/);
  });

  test("the guard names every reason a record cannot be removed", () => {
    // The single rule the whole quarantine flow rests on, tested directly:
    // anything financial pointing at a record makes it un-removable, and the
    // reason comes back as words the button can display rather than a boolean.
    const { deletableReason } = peopleRepo;

    assert.equal(deletableReason({ kind: "contact", orderCount: 0, depositCount: 0, balance: 0 }), null);
    // Nothing points at a contact row — not even a stray count could block it.
    assert.equal(deletableReason({ kind: "contact", orderCount: 9, depositCount: 9, balance: 500 }), null);

    assert.equal(deletableReason({ kind: "customer", orderCount: 0, depositCount: 0, balance: 0 }), null);
    assert.equal(deletableReason({ kind: "customer", orderCount: 1, depositCount: 0, balance: 0 }), "Has 1 order");
    assert.equal(deletableReason({ kind: "customer", orderCount: 97, depositCount: 0, balance: 0 }), "Has 97 orders");
    assert.equal(deletableReason({ kind: "customer", orderCount: 0, depositCount: 2, balance: 0 }), "Has 2 deposits");
    assert.equal(
      deletableReason({ kind: "customer", orderCount: 0, depositCount: 0, balance: 250 }),
      "Wallet balance is not zero"
    );
    // A negative balance is money owed, which is every bit as much a reason.
    assert.equal(
      deletableReason({ kind: "customer", orderCount: 0, depositCount: 0, balance: -250 }),
      "Wallet balance is not zero"
    );
  });

  test("the review panel surfaces a duplicated number with every record on it", async () => {
    const phone = num("9");
    // Two customers on one number, written differently — the exact shape that
    // exists on the live book, where an auto-merge would have destroyed one.
    await db.execute(
      sql`INSERT INTO customers (name, phone, status, balance) VALUES ('Has Money', ${phone}, 'Active', 5000)`
    );
    await db.execute(
      sql`INSERT INTO customers (name, phone, status) VALUES ('No History', ${`+234${phone.slice(1)}`}, 'Active')`
    );

    peopleRepo.invalidateHygieneCache();
    const res = await request(app)
      .get(`${PEOPLE}/hygiene`)
      .query({ issue: "duplicate" })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const group = res.body.data.issues.find((g) => g.records.some((r) => r.name === "Has Money"));
    assert.ok(group, "the duplicated number must be surfaced");
    assert.equal(group.records.length, 2, "grouped by number — both records, one decision");

    const withMoney = group.records.find((r) => r.name === "Has Money");
    const without = group.records.find((r) => r.name === "No History");
    assert.equal(withMoney.deletableReason, "Wallet balance is not zero", "and must say why it cannot go");
    assert.equal(without.deletableReason, null, "while the empty duplicate may");
  });

  test("the delete guard is re-run server-side, whatever the client sends", async () => {
    const phone = num("8");
    const [{ id }] = rowsOf(
      await db.execute(
        sql`INSERT INTO customers (name, phone, status, balance)
            VALUES ('Guarded', ${phone}, 'Active', 1200) RETURNING id`
      )
    );

    // The client asks for a delete the panel would never have offered — a
    // stale browser, or a crafted request. The server must still refuse.
    const res = await request(app)
      .post(`${PEOPLE}/hygiene/delete`)
      .set("Authorization", `Bearer ${token}`)
      .send({ records: [{ kind: "customer", id }] });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.deleted.length, 0);
    assert.equal(res.body.data.blocked.length, 1);
    assert.match(res.body.data.blocked[0].reason, /balance/i);

    const still = await db.execute(sql`SELECT id FROM customers WHERE id = ${id}`);
    assert.equal(rowsOf(still).length, 1, "the customer must still be there");
  });

  test("an empty duplicate IS removed, so the panel is not merely decorative", async () => {
    const phone = num("2");
    const [{ id }] = rowsOf(
      await db.execute(
        sql`INSERT INTO customers (name, phone, status) VALUES ('Disposable', ${phone}, 'Active') RETURNING id`
      )
    );

    const res = await request(app)
      .post(`${PEOPLE}/hygiene/delete`)
      .set("Authorization", `Bearer ${token}`)
      .send({ records: [{ kind: "customer", id }] });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.deleted.length, 1);
    assert.equal(res.body.data.blocked.length, 0);

    const gone = await db.execute(sql`SELECT id FROM customers WHERE id = ${id}`);
    assert.equal(rowsOf(gone).length, 0);
  });
});

describe("csv import — the dry run in front of the decision", () => {
  let token;

  before(async () => {
    token = await staffToken(request, app);
    await cleanup();
    await db.execute(
      sql`INSERT INTO customers (name, phone, status) VALUES ('Already A Customer', ${num("5")}, 'Active')`
    );
    await db.execute(
      sql`INSERT INTO contacts (name, phone, stage) VALUES ('Already A Contact', ${num("6")}, 'lead')`
    );
  });

  after(cleanup);

  test("every row gets a verdict, and nothing is written", async () => {
    const rows = [
      { name: "Brand New", phone: num("7") },
      { name: "Dupe Of New", phone: `+234${num("7").slice(1)}` },
      { name: "Already A Customer", phone: num("5") },
      { name: "Already A Contact", phone: num("6") },
      { name: "Bad Number", phone: "0802121" },
      { name: "", phone: num("4") },
    ];

    const res = await request(app)
      .post(`${CONTACTS}/import/preview`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rows });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const { counts, rows: preview } = res.body.data;
    assert.equal(counts.new, 1);
    assert.equal(counts.duplicate_in_file, 1, "the same number written twice is one person");
    assert.equal(counts.existing_customer, 1);
    assert.equal(counts.existing_contact, 1);
    assert.equal(counts.invalid, 1);
    assert.equal(counts.incomplete, 1);

    // Line numbers, so someone can find the offending row in their own file.
    assert.equal(preview[4].line, 5);
    assert.match(preview[4].reason, /Too short/);

    const written = await db.execute(sql`SELECT id FROM contacts WHERE phone LIKE ${`%${RUN}7%`}`);
    assert.equal(rowsOf(written).length, 0, "a preview must write nothing at all");
  });

  test("new_only leaves the people already on file untouched", async () => {
    const rows = [
      { name: "Renamed In Sheet", phone: num("6") },
      { name: "Genuinely New", phone: num("3") },
    ];

    const res = await request(app)
      .post(`${CONTACTS}/import`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rows, mode: "new_only" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.inserted, 1);
    assert.equal(res.body.data.updated, 0);

    const kept = await db.execute(sql`SELECT name FROM contacts WHERE phone = ${num("6")}`);
    assert.equal(rowsOf(kept)[0].name, "Already A Contact", "the existing row must not be rewritten");
  });

  test("an unparseable number is refused rather than stored", async () => {
    // The old rule was "seven digits or more", which is how "0802121" and
    // "0000000000" reached the book in the first place.
    const res = await request(app)
      .post(`${CONTACTS}/import`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rows: [{ name: "Junk", phone: "0000000000" }] });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.inserted, 0);
    assert.equal(res.body.data.invalid, 1);
  });

  test("someone who already has an account is never imported as a contact", async () => {
    const res = await request(app)
      .post(`${CONTACTS}/import`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rows: [{ name: "Already A Customer", phone: num("5") }], mode: "upsert" });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.inserted, 0);
    assert.equal(res.body.data.alreadyCustomers, 1);

    const contacts = await db.execute(sql`SELECT id FROM contacts WHERE phone LIKE ${`%${RUN}5%`}`);
    assert.equal(rowsOf(contacts).length, 0, "importing a customer would double them on the book");
  });
});

describe("delivery receipts — the other half of 'did they get it?'", () => {
  const MESSAGE_ID = `test-msg-${RUN}`;
  let campaignId;

  after(async () => {
    await db.execute(sql`DELETE FROM notification_deliveries WHERE provider_message_id = ${MESSAGE_ID}`);
    if (campaignId) await db.execute(sql`DELETE FROM message_campaigns WHERE id = ${campaignId}`);
    await closeDb();
  });

  test("a campaign groups the delivery rows a broadcast produces", async () => {
    const campaign = await messageCampaignRepo.start({
      title: "Test blast",
      body: "Prices today",
      channels: ["sms"],
      audience: "everyone",
      audienceLabel: "Everyone",
      recipientCount: 1,
      smsSegments: 1,
      balanceBefore: "1000.00",
      balanceCurrency: "NGN",
    });
    assert.ok(campaign?.id);
    campaignId = campaign.id;

    const opened = await notificationDeliveryRepo.start({
      campaignId,
      type: "system.announcement",
      channel: "sms",
      destination: "+2348108699059",
      recipientName: "Test Recipient",
    });
    await notificationDeliveryRepo.markSent(opened.id, { providerMessageId: MESSAGE_ID });

    await messageCampaignRepo.complete(campaignId, { balanceAfter: "997.00", recipientCount: 1 });

    const found = await messageCampaignRepo.findById(campaignId);
    assert.equal(found.deliveries.total, 1);
    assert.equal(found.deliveries.sent, 1);
    // What Termii's own wallet moved by, not an estimate.
    assert.equal(found.spent, 3);
  });

  test("a carrier receipt turns 'sent' into 'delivered'", async () => {
    const res = await request(app)
      .post("/api/webhooks/termii")
      .send({ message_id: MESSAGE_ID, status: "DELIVERED" });
    assert.equal(res.status, 200);

    // The webhook answers before doing its work, so give the write a moment.
    await new Promise((r) => setTimeout(r, 250));

    const rows = await db.execute(
      sql`SELECT status, provider_status, delivered_at, recipient_name
          FROM notification_deliveries WHERE provider_message_id = ${MESSAGE_ID}`
    );
    assert.equal(rowsOf(rows)[0].status, "delivered");
    assert.equal(rowsOf(rows)[0].provider_status, "DELIVERED", "the provider's own word, kept verbatim");
    assert.ok(rowsOf(rows)[0].delivered_at);
    assert.equal(rowsOf(rows)[0].recipient_name, "Test Recipient", "a name, not just a number");
  });

  test("a receipt cannot resurrect a send we already know failed", async () => {
    await db.execute(
      sql`UPDATE notification_deliveries SET status = 'failed'
          WHERE provider_message_id = ${MESSAGE_ID}`
    );

    await request(app)
      .post("/api/webhooks/termii")
      .send({ message_id: MESSAGE_ID, status: "DELIVERED" })
      .expect(200);
    await new Promise((r) => setTimeout(r, 250));

    const rows = await db.execute(
      sql`SELECT status FROM notification_deliveries WHERE provider_message_id = ${MESSAGE_ID}`
    );
    assert.equal(rowsOf(rows)[0].status, "failed", "receipts arrive out of order; failure is terminal");
  });

  test("an unknown provider status is left alone rather than guessed at", async () => {
    await db.execute(
      sql`UPDATE notification_deliveries SET status = 'sent'
          WHERE provider_message_id = ${MESSAGE_ID}`
    );

    await request(app)
      .post("/api/webhooks/termii")
      .send({ message_id: MESSAGE_ID, status: "SOME_NEW_TERMII_STATE" })
      .expect(200);
    await new Promise((r) => setTimeout(r, 250));

    const rows = await db.execute(
      sql`SELECT status FROM notification_deliveries WHERE provider_message_id = ${MESSAGE_ID}`
    );
    assert.equal(rowsOf(rows)[0].status, "sent", "rounding an unknown state to 'failed' would be a lie");
  });

  test("a receipt for a message we never sent is ignored, not invented", async () => {
    const beforeCount = await db.execute(sql`SELECT COUNT(*)::int AS n FROM notification_deliveries`);
    await request(app)
      .post("/api/webhooks/termii")
      .send({ message_id: "never-heard-of-this", status: "DELIVERED" })
      .expect(200);
    await new Promise((r) => setTimeout(r, 250));

    const afterCount = await db.execute(sql`SELECT COUNT(*)::int AS n FROM notification_deliveries`);
    assert.equal(rowsOf(afterCount)[0].n, rowsOf(beforeCount)[0].n);
  });
});
