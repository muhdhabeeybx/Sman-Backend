const { eq, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { contacts } = require("../db/schema");

/**
 * The last ten digits of a number, which is what identifies a Nigerian
 * subscriber however the number was typed.
 *
 * Mirrors the generated `phone_normalized` column exactly. Kept here as well
 * because the customer side has no such column — the match between a contact
 * and a customer has to normalise the customers row on the fly.
 */
const NORMALIZED = (col) => sql`RIGHT(regexp_replace(${col}, '[^0-9]', '', 'g'), 10)`;

/** Same rule in JS, for deduping a CSV batch before it reaches the database. */
const normalizePhone = (v) => String(v ?? "").replace(/[^0-9]/g, "").slice(-10);

/**
 * Two spreadsheet lines for the same person, folded into one.
 *
 * Later wins per FIELD, not per row: a blank cell on the second line means
 * "not filled in here", never "clear what the first line said". Tags union
 * rather than replace, since two lines tagging someone differently both mean
 * it.
 */
const mergeRow = (a, b) => {
  const pick = (x, y) => (String(y ?? "").trim() ? y : x);
  return {
    ...a,
    ...b,
    name: pick(a.name, b.name),
    phone: pick(a.phone, b.phone),
    email: pick(a.email, b.email),
    companyName: pick(a.companyName, b.companyName),
    notes: pick(a.notes, b.notes),
    locationId: b.locationId ?? a.locationId,
    tags: [...new Set([...(a.tags || []), ...(b.tags || [])])],
  };
};

/**
 * The customer sitting on this number, matched the way the list matches —
 * normalised, so "+234803…" and "0803…" are the same person.
 *
 * customerRepo.findByPhone compares the column exactly, which is right for
 * the paths that store and look up in one format, and wrong here: a lead is
 * keyed in however the salesperson wrote it down.
 */
const findCustomerByPhone = async (phone) => {
  const key = normalizePhone(phone);
  if (!key) return null;
  const result = await db.execute(sql`
    SELECT id, name, status FROM customers
    WHERE ${NORMALIZED(sql`phone`)} = ${key}
    ORDER BY id LIMIT 1
  `);
  return (result.rows ?? result)[0] || null;
};

const SORTS = {
  newest: sql`ct.created_at DESC`,
  oldest: sql`ct.created_at ASC`,
  name: sql`ct.name ASC`,
  company: sql`ct.company_name ASC NULLS LAST`,
};

/**
 * Contacts, each with whether they have since become a customer.
 *
 * The customer match is a join on the normalised number rather than a stored
 * flag: a customer record can be created by the desk, by WhatsApp or by
 * self-signup, and none of those paths would think to update a contacts row.
 * Deriving it means the answer is right the moment the customer exists, and
 * "converted" can never be wrong.
 *
 * `orderCount` comes along because it is the difference between a lead who
 * has an account and a lead who has actually bought — the second is the one
 * that closes the loop the page is about.
 */
const findAll = async ({
  search,
  stage,
  source,
  locationId,
  converted,
  optedOut,
  tag,
  sort = "newest",
  page = 1,
  limit = 50,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(5000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const where = [];
  if (search) {
    const pattern = `%${search}%`;
    // A number is searched for the way the searcher happens to write it, which
    // is rarely the way it was stored — someone types "0803…" to find a row
    // held as "+234803…". Anything digit-shaped is matched against the
    // normalised column as well, so either spelling finds the person.
    const digits = String(search).replace(/[^0-9]/g, "");
    const byNumber =
      digits.length >= 4
        ? sql` OR ct.phone_normalized LIKE ${`%${digits.slice(-10)}%`}`
        : sql``;
    where.push(
      sql`(ct.name ILIKE ${pattern} OR ct.phone ILIKE ${pattern} OR ct.email ILIKE ${pattern} OR ct.company_name ILIKE ${pattern}${byNumber})`
    );
  }
  if (stage) where.push(sql`ct.stage = ${stage}`);
  if (source) where.push(sql`ct.source = ${source}`);
  if (locationId) where.push(sql`ct.location_id = ${Number(locationId)}`);
  if (tag) where.push(sql`${tag} = ANY(ct.tags)`);
  if (optedOut === "yes") where.push(sql`ct.marketing_opt_out = true`);
  if (optedOut === "no") where.push(sql`ct.marketing_opt_out = false`);
  // "converted" means a customer exists on this number — not that they have
  // ordered. A lead who signed up but never bought is still worth chasing,
  // and is visible as converted-with-no-orders rather than being hidden.
  if (converted === "yes") where.push(sql`cu.id IS NOT NULL`);
  if (converted === "no") where.push(sql`cu.id IS NULL`);

  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const orderBySql = SORTS[sort] || SORTS.newest;

  const from = sql`
    FROM contacts ct
    LEFT JOIN LATERAL (
      SELECT c.id, c.name, c.status
      FROM customers c
      WHERE ${NORMALIZED(sql`c.phone`)} = ct.phone_normalized
      ORDER BY c.id
      LIMIT 1
    ) cu ON TRUE
    LEFT JOIN depots d ON d.id = ct.location_id
  `;

  const [rowsResult, summaryResult] = await Promise.all([
    db.execute(sql`
      SELECT
        ct.*,
        d.name AS "locationName",
        cu.id AS "customerId",
        cu.status AS "customerStatus",
        COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = cu.id), 0)::int AS "orderCount",
        (cu.id IS NOT NULL) AS "isCustomer"
      ${from}
      ${whereSql}
      ORDER BY ${orderBySql}
      LIMIT ${limitNum} OFFSET ${offset}
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ct.stage = 'lead')::int AS leads,
        COUNT(*) FILTER (WHERE ct.stage = 'contact')::int AS "otherContacts",
        COUNT(*) FILTER (WHERE cu.id IS NOT NULL)::int AS converted,
        COUNT(*) FILTER (WHERE ct.marketing_opt_out = false)::int AS reachable,
        COUNT(*) FILTER (WHERE ct.created_at >= date_trunc('month', now()))::int AS "newThisMonth"
      ${from}
      ${whereSql}
    `),
  ]);

  const rows = rowsResult.rows ?? rowsResult;
  const summary = (summaryResult.rows ?? summaryResult)[0] || {};
  const total = Number(summary.total || 0);

  return {
    contacts: rows,
    pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 },
    summary: {
      total,
      leads: Number(summary.leads || 0),
      otherContacts: Number(summary.otherContacts || 0),
      converted: Number(summary.converted || 0),
      reachable: Number(summary.reachable || 0),
      newThisMonth: Number(summary.newThisMonth || 0),
    },
  };
};

const findById = async (id) => {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return row || null;
};

const create = async (data) => {
  const [row] = await db.insert(contacts).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const [row] = await db
    .update(contacts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(contacts.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(contacts).where(eq(contacts.id, id)).returning();
  return row || null;
};

/**
 * Import a batch, upserting on the normalised number.
 *
 * A spreadsheet is re-uploaded constantly — with more rows, with corrections,
 * with the same people written "+234…" this time instead of "0…". So the same
 * person arriving twice updates rather than duplicates or fails, and the
 * caller is told which of the two happened for every row.
 *
 * COALESCE(NULLIF(excluded.x, ''), contacts.x) on the optional fields: a
 * re-upload that leaves the email column blank means "I don't have it", not
 * "delete the one you had". Only a non-empty value overwrites.
 *
 * The whole batch runs in one statement inside one transaction, so a file
 * either lands or does not — a partial import that stopped on row 400 leaves
 * nobody able to say what was already in.
 */
const importMany = async (rows, { source = "csv", createdBy = null } = {}) => {
  if (!rows.length) return { inserted: 0, updated: 0, skipped: 0, contacts: [] };

  // De-dupe inside the batch first. Postgres refuses an ON CONFLICT that hits
  // the same row twice in one statement ("cannot affect row a second time"),
  // and a spreadsheet with the same number on two lines is completely normal.
  const seen = new Map();
  let skipped = 0;
  for (const r of rows) {
    const key = normalizePhone(r.phone);
    if (!key || key.length < 7 || !String(r.name || "").trim()) {
      skipped++;
      continue;
    }
    // A repeat of the same person MERGES with the earlier line rather than
    // replacing it. Wholesale replacement looked reasonable until a file
    // carried the same number twice — once with an email, once without — and
    // the blank second line silently threw the email away. A later line only
    // overwrites a field it actually fills in.
    const prev = seen.get(key);
    seen.set(key, prev ? mergeRow(prev, r) : r);
  }
  if (!seen.size) return { inserted: 0, updated: 0, skipped, contacts: [] };

  // The batch travels as one JSON parameter and is unpacked by
  // jsonb_to_recordset, rather than being built into a VALUES list row by
  // row. A per-row list has to bind `tags` as a Postgres array, and drizzle's
  // sql template expands a JS array into a parameter LIST — `('a','b')`, not
  // `'{a,b}'` — which produced `()::text[]` for an empty one and a syntax
  // error for a full one. One JSON parameter sidesteps the whole question and
  // is still fully parameterised.
  const payload = [...seen.values()].map((r) => ({
    name: String(r.name).trim(),
    phone: String(r.phone).trim(),
    email: String(r.email || "").trim(),
    company_name: String(r.companyName || "").trim(),
    stage: r.stage === "contact" ? "contact" : "lead",
    location_id: r.locationId ? Number(r.locationId) : null,
    tags: Array.isArray(r.tags) ? r.tags.filter(Boolean).map(String) : [],
    notes: String(r.notes || "").trim(),
  }));

  const result = await db.execute(sql`
    INSERT INTO contacts (name, phone, email, company_name, stage, source, location_id, tags, notes, created_by)
    SELECT
      j.name,
      j.phone,
      COALESCE(j.email, ''),
      COALESCE(j.company_name, ''),
      COALESCE(j.stage, 'lead')::contact_stage,
      ${source}::contact_source,
      j.location_id,
      COALESCE(j.tags, '{}'::text[]),
      COALESCE(j.notes, ''),
      ${createdBy}
    FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS j(
      name text,
      phone text,
      email text,
      company_name text,
      stage text,
      location_id integer,
      tags text[],
      notes text
    )
    ON CONFLICT (phone_normalized) DO UPDATE SET
      name         = excluded.name,
      phone        = excluded.phone,
      email        = COALESCE(NULLIF(excluded.email, ''), contacts.email),
      company_name = COALESCE(NULLIF(excluded.company_name, ''), contacts.company_name),
      location_id  = COALESCE(excluded.location_id, contacts.location_id),
      tags         = CASE WHEN cardinality(excluded.tags) > 0 THEN excluded.tags ELSE contacts.tags END,
      notes        = COALESCE(NULLIF(excluded.notes, ''), contacts.notes),
      updated_at   = now()
    RETURNING id, (xmax = 0) AS inserted
  `);

  const returned = result.rows ?? result;
  const inserted = returned.filter((r) => r.inserted).length;
  return {
    inserted,
    updated: returned.length - inserted,
    skipped,
    contacts: returned,
  };
};

/**
 * Contacts as messaging recipients — the same shape findForSegment returns
 * for customers, so the messaging page can pool the two.
 *
 * Opted-out contacts are excluded here rather than at the caller, for the
 * same reason they are on the customer side: the suppression must hold
 * wherever the audience is built from.
 */
const findForSegment = async ({ stage, locationId, tag, excludeConverted = false, limit = 5000 } = {}) => {
  const where = [sql`ct.marketing_opt_out = false`];
  if (stage) where.push(sql`ct.stage = ${stage}`);
  if (locationId) where.push(sql`ct.location_id = ${Number(locationId)}`);
  if (tag) where.push(sql`${tag} = ANY(ct.tags)`);
  // A contact who is already a customer would otherwise be messaged twice —
  // once as a customer, once as the lead they used to be.
  if (excludeConverted) {
    where.push(
      sql`NOT EXISTS (SELECT 1 FROM customers c WHERE ${NORMALIZED(sql`c.phone`)} = ct.phone_normalized)`
    );
  }

  const result = await db.execute(sql`
    SELECT ct.id, ct.name, ct.phone, ct.email, ct.company_name AS "companyName"
    FROM contacts ct
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY ct.id
    LIMIT ${Math.min(5000, Math.max(1, Number(limit) || 5000))}
  `);
  const rows = result.rows ?? result;
  return { contacts: rows, count: rows.length };
};

/** Every distinct tag in use, for the filter dropdown. */
const findTags = async () => {
  const result = await db.execute(
    sql`SELECT DISTINCT unnest(tags) AS tag FROM contacts WHERE cardinality(tags) > 0 ORDER BY 1`
  );
  return (result.rows ?? result).map((r) => r.tag);
};

module.exports = {
  findAll,
  findCustomerByPhone,
  findById,
  create,
  update,
  deleteById,
  importMany,
  findForSegment,
  findTags,
  normalizePhone,
};
