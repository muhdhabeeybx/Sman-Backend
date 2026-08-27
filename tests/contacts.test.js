// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { sql } = require("drizzle-orm");
const { staffToken, closeDb } = require("./helpers");

const CONTACTS = "/api/contacts";
const RUN = String(Date.now()).slice(-6);

/** Numbers unique to this run, so a re-run does not collide on the phone index. */
const num = (tag) => `0803${RUN}${tag}`;

describe("contacts — leads that are not customers yet", () => {
  let token;

  before(async () => {
    token = await staffToken(request, app);
    await db.execute(sql`DELETE FROM contacts WHERE phone LIKE ${`%${RUN}%`}`);
    await db.execute(sql`DELETE FROM customers WHERE phone LIKE ${`%${RUN}%`}`);
  });

  after(async () => {
    await db.execute(sql`DELETE FROM contacts WHERE phone LIKE ${`%${RUN}%`}`);
    await db.execute(sql`DELETE FROM customers WHERE phone LIKE ${`%${RUN}%`}`);
    await closeDb();
  });

  test("requires staff authentication", async () => {
    const res = await request(app).get(CONTACTS);
    assert.equal(res.status, 401);
  });

  test("creates a contact and lists it as an unconverted lead", async () => {
    const res = await request(app)
      .post(CONTACTS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Lead One", phone: num("1"), companyName: "Lead Co", tags: ["warri"] });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const list = await request(app)
      .get(CONTACTS)
      .query({ search: num("1") })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.contacts.length, 1);
    assert.equal(list.body.data.contacts[0].isCustomer, false);
    assert.equal(list.body.data.summary.leads, 1);
  });

  test("refuses a number that is already on the customer book", async () => {
    const phone = num("2");
    await db.execute(
      sql`INSERT INTO customers (name, phone, status) VALUES ('Existing Customer', ${phone}, 'Active')`
    );

    const res = await request(app)
      .post(CONTACTS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Same Person", phone });

    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /already a customer/i);
  });

  test("import upserts on the number however it was written, and never wipes a field it was not given", async () => {
    const phone = num("3");
    const first = await request(app)
      .post(`${CONTACTS}/import`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        rows: [
          { name: "Import A", phone, email: "a@example.com", companyName: "A Ltd", tags: ["vip"] },
          // Same person, written differently — must merge inside the batch
          // rather than trip ON CONFLICT twice in one statement.
          { name: "Import A", phone: `+234${phone.slice(1)}` },
          { name: "", phone: num("9") },   // no name    -> skipped
          { name: "No Number", phone: "n/a" }, // unusable -> skipped
        ],
      });

    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.inserted, 1);
    assert.equal(first.body.data.skipped, 2);

    // Re-upload with a corrected name and no email column at all.
    const second = await request(app)
      .post(`${CONTACTS}/import`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rows: [{ name: "Import A Corrected", phone }] });

    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.data.inserted, 0);
    assert.equal(second.body.data.updated, 1);

    const list = await request(app)
      .get(CONTACTS)
      .query({ search: "Import A Corrected" })
      .set("Authorization", `Bearer ${token}`);
    const row = list.body.data.contacts[0];
    assert.equal(row.name, "Import A Corrected");
    // A blank column on a re-upload means "I don't have it", not "delete it".
    assert.equal(row.email, "a@example.com");
    assert.deepEqual(row.tags, ["vip"]);
  });

  test("a contact reads as converted once a customer exists on the number — no matter the format", async () => {
    const phone = num("4");
    await request(app)
      .post(CONTACTS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Future Customer", phone });

    let list = await request(app)
      .get(CONTACTS).query({ search: phone }).set("Authorization", `Bearer ${token}`);
    assert.equal(list.body.data.contacts[0].isCustomer, false);

    // Signs up through some other surface entirely, number typed another way.
    const spaced = `+234 ${phone.slice(1, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
    await db.execute(
      sql`INSERT INTO customers (name, phone, status) VALUES ('Future Customer', ${spaced}, 'Active')`
    );

    list = await request(app)
      .get(CONTACTS).query({ search: phone }).set("Authorization", `Bearer ${token}`);
    const row = list.body.data.contacts[0];
    assert.equal(row.isCustomer, true, "conversion must be derived from the phone match");
    assert.ok(row.customerId);

    // And the filter agrees with the flag.
    const converted = await request(app)
      .get(CONTACTS).query({ search: phone, converted: "yes" }).set("Authorization", `Bearer ${token}`);
    assert.equal(converted.body.data.pagination.total, 1);
    const notConverted = await request(app)
      .get(CONTACTS).query({ search: phone, converted: "no" }).set("Authorization", `Bearer ${token}`);
    assert.equal(notConverted.body.data.pagination.total, 0);
  });

  test("convert creates the customer and is idempotent", async () => {
    const phone = num("5");
    const created = await request(app)
      .post(CONTACTS)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Converting Lead", phone, email: "conv@example.com" });
    const id = created.body.data.contact.id;

    const first = await request(app)
      .post(`${CONTACTS}/${id}/convert`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.alreadyExisted, false);
    assert.equal(first.body.data.customer.name, "Converting Lead");

    // Pressing it twice must not create a second customer on the same number.
    const second = await request(app)
      .post(`${CONTACTS}/${id}/convert`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.data.alreadyExisted, true);

    const rows = await db.execute(sql`SELECT COUNT(*)::int AS n FROM customers WHERE phone LIKE ${`%${phone.slice(-10)}%`}`);
    assert.equal((rows.rows ?? rows)[0].n, 1);
  });

  test("rejects a sort it does not recognise rather than putting it in the ORDER BY", async () => {
    const res = await request(app)
      .get(CONTACTS)
      .query({ sort: "name; DROP TABLE contacts" })
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 400);
  });

  test("update and delete", async () => {
    const phone = num("6");
    const created = await request(app)
      .post(CONTACTS).set("Authorization", `Bearer ${token}`)
      .send({ name: "Temp Contact", phone });
    const id = created.body.data.contact.id;

    const patched = await request(app)
      .patch(`${CONTACTS}/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stage: "contact", notes: "Haulier, not a buyer" });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.data.contact.stage, "contact");

    const removed = await request(app)
      .delete(`${CONTACTS}/${id}`).set("Authorization", `Bearer ${token}`);
    assert.equal(removed.status, 200);

    const gone = await request(app)
      .get(`${CONTACTS}/${id}`).set("Authorization", `Bearer ${token}`);
    assert.equal(gone.status, 404);
  });
});
