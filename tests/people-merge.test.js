// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const { staffToken, closeDb } = require("./helpers");

const MERGE = "/api/people/merge";
const PREVIEW = "/api/people/merge/preview";
const PEOPLE = "/api/people";
const RUN = String(Date.now()).slice(-6);

const rowsOf = (result) => result.rows ?? result;
const one = async (query) => rowsOf(await db.execute(query))[0];

/** Numbers unique to this run, so a re-run cannot collide on the phone index. */
const num = (tag) => `0803${RUN}${tag}`;

/**
 * Merging duplicate records into one.
 *
 * The behaviour under test is a single promise: NOTHING the losing records
 * carry is destroyed. Everything else here — the balances, the numbers, the
 * refusals — is a way of checking that promise from a different angle, because
 * a merge that quietly drops an order is worse than no merge at all: the desk
 * would not find out until a customer disputed an invoice months later.
 */
const cleanup = async () => {
  await db.execute(sql`DELETE FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE ${`%${RUN}%`})`);
  await db.execute(sql`DELETE FROM customer_phones WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE ${`%${RUN}%`})`);
  await db.execute(sql`DELETE FROM contacts WHERE phone LIKE ${`%${RUN}%`}`);
  await db.execute(sql`DELETE FROM customers WHERE phone LIKE ${`%${RUN}%`}`);
};

/** A customer with a wallet balance, created straight through SQL. */
const makeCustomer = async ({ name, phone, balance = 0, email = "", companyName = "" }) =>
  one(sql`
    INSERT INTO customers (name, phone, email, company_name, status, balance)
    VALUES (${name}, ${phone}, ${email}, ${companyName}, 'Active', ${balance})
    RETURNING id, name, phone
  `);

/**
 * An order against a customer, with only the columns the merge cares about.
 *
 * Deliberately minimal: this suite is not testing order creation, it is
 * testing that an order written under one customer id is readable under
 * another one afterwards.
 */
const makeOrder = async (customerId) =>
  one(sql`
    INSERT INTO orders (
      order_number, customer_id, company_name, status, payment_status,
      state, depot_id, product_id, quantity, price, total_amount, delivery_type
    )
    SELECT ${`MERGE-${RUN}-${Math.random().toString(36).slice(2, 8)}`}, ${customerId}, 'Merge Test',
           'Pending', 'Unpaid', 'Kano',
           (SELECT id FROM depots ORDER BY id LIMIT 1),
           (SELECT id FROM products ORDER BY id LIMIT 1),
           33000, 900, 100000, 'pickup'
    RETURNING id
  `);

let tokenPromise = null;
const sharedToken = () => (tokenPromise ??= staffToken(request, app));

describe("merging duplicate records", () => {
  let token;

  before(async () => {
    token = await sharedToken();
    await cleanup();
  });

  after(async () => {
    await cleanup();
    await closeDb();
  });

  test("requires staff authentication", async () => {
    const res = await request(app).post(MERGE).send({});
    assert.equal(res.status, 401);
  });

  test("the preview says what moves before anything moves", async () => {
    const keep = await makeCustomer({ name: "Keep Me", phone: num("1"), balance: 10000 });
    const lose = await makeCustomer({
      name: "Lose Me", phone: num("2"), balance: 25000, email: "lose@example.test",
    });
    await makeOrder(lose.id);
    await makeOrder(lose.id);

    const res = await request(app)
      .post(PREVIEW)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "customer", id: keep.id }, sources: [{ kind: "customer", id: lose.id }] });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const plan = res.body.data;
    assert.equal(plan.moving.orders, 2);
    assert.equal(plan.balance.total, 35000, "the two wallets add up");
    assert.ok(plan.phones.includes(num("2")), "the loser's number carries over");
    assert.ok(
      plan.fills.some((f) => f.value === "lose@example.test"),
      "a blank field on the survivor is filled from the record folded in"
    );

    // A preview writes nothing.
    const still = await one(sql`SELECT COUNT(*)::int AS n FROM customers WHERE id = ${lose.id}`);
    assert.equal(still.n, 1, "the preview must not have merged anything");
  });

  test("every order survives the merge, on the record that was kept", async () => {
    const keep = await makeCustomer({ name: "Survivor", phone: num("3"), balance: 5000 });
    const lose = await makeCustomer({ name: "Duplicate", phone: num("4"), balance: 2500 });
    const orders = [await makeOrder(keep.id), await makeOrder(lose.id), await makeOrder(lose.id)];

    const res = await request(app)
      .post(MERGE)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "customer", id: keep.id }, sources: [{ kind: "customer", id: lose.id }] });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.moved.orders, 2);

    for (const order of orders) {
      const row = await one(sql`SELECT customer_id FROM orders WHERE id = ${order.id}`);
      assert.equal(Number(row.customer_id), keep.id, "no order may be left behind or deleted");
    }

    const merged = await one(sql`SELECT balance::numeric AS balance FROM customers WHERE id = ${keep.id}`);
    assert.equal(Number(merged.balance), 7500, "the wallets are added, never replaced");

    const gone = await one(sql`SELECT COUNT(*)::int AS n FROM customers WHERE id = ${lose.id}`);
    assert.equal(gone.n, 0, "the emptied record is removed");
  });

  test("the number the customer used to ring from still finds them", async () => {
    const keep = await makeCustomer({ name: "Two Lines", phone: num("5") });
    const lose = await makeCustomer({ name: "Two Lines", phone: num("6") });

    await request(app)
      .post(MERGE)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "customer", id: keep.id }, sources: [{ kind: "customer", id: lose.id }] })
      .expect(200);

    // Searching the OLD number has to land on the surviving record — that is
    // the whole reason the numbers are kept rather than discarded with the row.
    const res = await request(app)
      .get(PEOPLE)
      .query({ search: num("6") })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    const row = res.body.data.people.find((p) => p.customerId === keep.id);
    assert.ok(row, "the old number must still find the person");
    assert.ok(row.extraPhones.includes(num("6")), "and it is shown on their row");
  });

  test("the same number written two ways is not added to the account twice", async () => {
    const local = num("7");
    const international = `+234${local.slice(1)}`;
    const keep = await makeCustomer({ name: "One Number", phone: local });
    const lose = await makeCustomer({ name: "One Number", phone: international });

    await request(app)
      .post(MERGE)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "customer", id: keep.id }, sources: [{ kind: "customer", id: lose.id }] })
      .expect(200);

    const alternates = await one(
      sql`SELECT COUNT(*)::int AS n FROM customer_phones WHERE customer_id = ${keep.id}`
    );
    assert.equal(alternates.n, 0, "the survivor must not hold their own primary as an alternate");
  });

  test("a lead folded into a customer keeps its tags and its number", async () => {
    const keep = await makeCustomer({ name: "Real Account", phone: num("8") });
    const lead = await one(sql`
      INSERT INTO contacts (name, phone, stage, tags, notes)
      VALUES ('Same Man', ${num("9")}, 'lead', ARRAY['vip'], 'Rang about diesel')
      RETURNING id
    `);

    await request(app)
      .post(MERGE)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "customer", id: keep.id }, sources: [{ kind: "contact", id: lead.id }] })
      .expect(200);

    const res = await request(app)
      .get(PEOPLE)
      .query({ search: num("8") })
      .set("Authorization", `Bearer ${token}`);
    const row = res.body.data.people.find((p) => p.customerId === keep.id);
    assert.ok(row.tags.includes("vip"), "the lead's tags follow them onto the customer");
    assert.ok(row.extraPhones.includes(num("9")), "and so does the number they were reached on");
  });

  test("refuses to fold a customer into a lead, and says which way to go", async () => {
    const customer = await makeCustomer({ name: "Has An Account", phone: num("a") });
    const lead = await one(sql`
      INSERT INTO contacts (name, phone, stage) VALUES ('Just A Lead', ${num("b")}, 'lead') RETURNING id
    `);

    const res = await request(app)
      .post(MERGE)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "contact", id: lead.id }, sources: [{ kind: "customer", id: customer.id }] });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /Keep the customer/);

    const survived = await one(sql`SELECT COUNT(*)::int AS n FROM customers WHERE id = ${customer.id}`);
    assert.equal(survived.n, 1, "the refusal must not have deleted anything");
  });

  test("refuses a record that is already gone rather than half-merging", async () => {
    const keep = await makeCustomer({ name: "Still Here", phone: num("c") });

    const res = await request(app)
      .post(MERGE)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "customer", id: keep.id }, sources: [{ kind: "customer", id: 2147483000 }] });

    assert.equal(res.status, 404);
    assert.match(res.body.message, /no longer exists/);
  });

  test("the list can find the rows that share a name", async () => {
    // The other half of the feature. Two records for one man under two lines
    // share nothing but the name, so a filter on numbers cannot find them and
    // the desk was left scrolling for the pair it wanted to merge.
    await makeCustomer({ name: `Doubled Man ${RUN}`, phone: num("e") });
    await makeCustomer({ name: `doubled man ${RUN} `, phone: num("f") });
    await makeCustomer({ name: `Only Once ${RUN}`, phone: num("g") });

    const res = await request(app)
      .get(PEOPLE)
      .query({ duplicates: "name", search: RUN, limit: 200 })
      .set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 200, JSON.stringify(res.body));
    const names = res.body.data.people.map((p) => p.name.trim().toLowerCase());
    assert.equal(
      names.filter((n) => n === `doubled man ${RUN}`).length,
      2,
      "both halves of the pair must be listed — case and stray spaces are not a difference"
    );
    assert.ok(
      !names.some((n) => n === `only once ${RUN}`),
      "a name held once is not a duplicate"
    );
  });

  test("refuses to merge a record into itself", async () => {
    const keep = await makeCustomer({ name: "Only One", phone: num("d") });

    const res = await request(app)
      .post(MERGE)
      .set("Authorization", `Bearer ${token}`)
      .send({ target: { kind: "customer", id: keep.id }, sources: [{ kind: "customer", id: keep.id }] });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /at least one other record/);
  });
});
