const { eq, and, ne, asc, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { customerPhones, customers } = require("../db/schema");
const { normalizedKey } = require("../utils/phone");

/**
 * The alternate numbers a customer can be reached and sign in on.
 *
 * `customers.phone` remains the primary and is NOT duplicated in here — see
 * db/migrations/0019_customer_phone_numbers.sql. So "every number that reaches
 * this customer" is the primary plus these, and the two are joined in
 * `listAll` rather than left for each caller to remember.
 */

/** Just the alternates, oldest first — the order they were added is the order
 *  the desk thinks of them in. */
const findByCustomer = async (customerId) =>
  db
    .select()
    .from(customerPhones)
    .where(eq(customerPhones.customerId, Number(customerId)))
    .orderBy(asc(customerPhones.id));

/**
 * Every number that reaches this customer, primary first.
 *
 * The primary is synthesised into the list with `id: null` rather than given a
 * fake row id: it lives in a different table, it cannot be deleted, and a
 * caller that tries to DELETE /phones/null gets a validation error instead of
 * silently removing an alternate that happened to share the id.
 */
const listAll = async (customerId) => {
  const [customer] = await db
    .select({
      phone: customers.phone,
      verifiedAt: customers.phoneVerifiedAt,
    })
    .from(customers)
    .where(eq(customers.id, Number(customerId)))
    .limit(1);
  if (!customer) return null;

  const alternates = await findByCustomer(customerId);
  return [
    {
      id: null,
      phone: customer.phone,
      phoneNormalized: normalizedKey(customer.phone),
      label: "",
      isPrimary: true,
      verifiedAt: customer.verifiedAt,
      createdAt: null,
    },
    ...alternates.map((row) => ({
      id: row.id,
      phone: row.phone,
      phoneNormalized: row.phoneNormalized,
      label: row.label || "",
      isPrimary: false,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
    })),
  ];
};

/**
 * Who already holds this number — as a primary OR as an alternate.
 *
 * The single guard the whole feature rests on. A number must reach exactly one
 * account, or "sign in with any of your numbers" becomes "sign in to whichever
 * of these two accounts the query happened to return first". The unique index
 * on customer_phones covers alternate-vs-alternate; this covers the half no
 * constraint can, because the other candidate lives in `customers`.
 *
 * Matched on the normalised key, not the raw string: "+2348012345678" already
 * on file must block "08012345678" being added, or the collision simply moves
 * from the database into the login.
 *
 * @param {string} phone      any format
 * @param {number} [exceptId] a customer allowed to already hold it — used when
 *                            re-checking a number that is being moved within
 *                            the same account
 * @returns {Promise<{customerId:number, name:string, phone:string, isPrimary:boolean}|null>}
 */
const findOwner = async (phone, { exceptCustomerId = null } = {}) => {
  const key = normalizedKey(phone);
  if (!key) return null;

  const result = await db.execute(sql`
    SELECT c.id AS "customerId", c.name, c.phone, true AS "isPrimary"
    FROM customers c
    WHERE c.phone_normalized = ${key}
      ${exceptCustomerId ? sql`AND c.id <> ${Number(exceptCustomerId)}` : sql``}

    UNION ALL

    SELECT cp.customer_id, c2.name, cp.phone, false
    FROM customer_phones cp
    JOIN customers c2 ON c2.id = cp.customer_id
    WHERE cp.phone_normalized = ${key}
      ${exceptCustomerId ? sql`AND cp.customer_id <> ${Number(exceptCustomerId)}` : sql``}

    LIMIT 1
  `);
  const row = (result.rows ?? result)[0];
  return row
    ? {
        customerId: Number(row.customerId),
        name: row.name,
        phone: row.phone,
        isPrimary: Boolean(row.isPrimary),
      }
    : null;
};

const create = async ({ customerId, phone, label = "", createdBy = null, verifiedAt = null }) => {
  const [row] = await db
    .insert(customerPhones)
    .values({
      customerId: Number(customerId),
      phone,
      label: String(label || "").slice(0, 60),
      createdBy: createdBy ? Number(createdBy) : null,
      verifiedAt,
    })
    .returning();
  return row;
};

const findById = async (id) => {
  const [row] = await db
    .select()
    .from(customerPhones)
    .where(eq(customerPhones.id, Number(id)))
    .limit(1);
  return row || null;
};

const update = async (id, patch) => {
  const [row] = await db
    .update(customerPhones)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(customerPhones.id, Number(id)))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db
    .delete(customerPhones)
    .where(eq(customerPhones.id, Number(id)))
    .returning();
  return row || null;
};

/**
 * Mark an alternate as proven, by its normalised key.
 *
 * Called from verify-otp when the code was sent to an alternate rather than
 * the primary. Keyed on the number rather than the row id because the login
 * path holds a number, not a row — it never had to look one up.
 */
const markVerifiedByKey = async (customerId, phone) => {
  const key = normalizedKey(phone);
  if (!key) return null;
  const [row] = await db
    .update(customerPhones)
    .set({ verifiedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(customerPhones.customerId, Number(customerId)),
        eq(customerPhones.phoneNormalized, key)
      )
    )
    .returning();
  return row || null;
};

/**
 * Swap an alternate with the primary.
 *
 * Both sides move in one transaction: the old primary becomes an alternate
 * row, the chosen alternate goes onto `customers.phone`. Done in the wrong
 * order — or half-done — the account either loses a number or briefly holds
 * the same one twice, which the unique index would then refuse to repair.
 *
 * The alternate row is deleted BEFORE the customer is updated, because the
 * unique index does not span the two tables but the intent does: a moment
 * where `customers.phone` and a `customer_phones` row hold the same number is
 * a moment `findOwner` reports a collision with the account itself.
 */
const makePrimary = async (customerId, phoneId) => {
  return db.transaction(async (tx) => {
    const [alternate] = await tx
      .select()
      .from(customerPhones)
      .where(
        and(eq(customerPhones.id, Number(phoneId)), eq(customerPhones.customerId, Number(customerId)))
      )
      .limit(1);
    if (!alternate) return null;

    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, Number(customerId)))
      .limit(1);
    if (!customer) return null;

    await tx.delete(customerPhones).where(eq(customerPhones.id, alternate.id));

    await tx.insert(customerPhones).values({
      customerId: Number(customerId),
      phone: customer.phone,
      label: "",
      // The old primary's proof travels with it. `phone_verified_at` on the
      // customer row is about to describe a different number, so dropping it
      // here would silently un-verify a number that really was proven.
      verifiedAt: customer.phoneVerifiedAt,
      createdBy: alternate.createdBy,
    });

    const [updated] = await tx
      .update(customers)
      .set({
        phone: alternate.phone,
        phoneVerifiedAt: alternate.verifiedAt,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, Number(customerId)))
      .returning();

    return updated;
  });
};

/**
 * How many alternates each of these customers holds.
 *
 * One query for a whole page of the people list, keyed by customer id — the
 * list renders 50 rows and a per-row lookup would be 50 round trips to show a
 * "+2 more" badge.
 *
 * @param {number[]} customerIds
 * @returns {Promise<Map<number, {count:number, phones:string[]}>>}
 */
const countsFor = async (customerIds) => {
  const ids = [...new Set((customerIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return new Map();

  const result = await db.execute(sql`
    SELECT
      cp.customer_id AS "customerId",
      COUNT(*)::int  AS count,
      array_agg(cp.phone ORDER BY cp.id) AS phones
    FROM customer_phones cp
    WHERE cp.customer_id IN (
      SELECT (k.v)::int FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) k(v)
    )
    GROUP BY cp.customer_id
  `);

  const map = new Map();
  for (const row of result.rows ?? result) {
    map.set(Number(row.customerId), { count: Number(row.count), phones: row.phones || [] });
  }
  return map;
};

module.exports = {
  findByCustomer,
  listAll,
  findOwner,
  findById,
  create,
  update,
  deleteById,
  markVerifiedByKey,
  makePrimary,
  countsFor,
};
