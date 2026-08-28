const { sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { classifyPhone, normalizedKey } = require("../utils/phone");

/**
 * Everyone we hold a number for, customers and contacts alike, as one list.
 *
 * ── Why one list ───────────────────────────────────────────────────────────
 *
 * `customers` and `contacts` are two tables for good reasons (see migration
 * 0005) and stay two tables. But they were also two PAGES, and that was the
 * mistake: the same human is on both the moment a lead signs up, so the desk
 * had to know which page to look on, and the messaging composer needed an
 * "exclude contacts who are already customers" checkbox to stop sending the
 * same person the same SMS twice under two identities.
 *
 * This is the join those two pages should always have been. A person appears
 * exactly ONCE, keyed on the normalised phone number, and the customer side
 * wins the row when both exist — because that is the record with the orders
 * and the wallet behind it. The lead they used to be is not lost; it comes
 * along as `cameInAsLead`, with the tags and the source that brought them in.
 *
 * ── Why the money columns are here too ─────────────────────────────────────
 *
 * The customers page earned its keep with balance, lifetime value and an
 * activity band, and a merged list that dropped them would be a downgrade
 * dressed as a simplification. They are selected for customer rows and null
 * for everyone else, which is the honest answer — a lead has no wallet.
 */

/** Mirrors the generated `phone_normalized` column on both tables. */
const NORMALIZED = (col) => sql`RIGHT(regexp_replace(${col}, '[^0-9]', '', 'g'), 10)`;

/**
 * "Is this row's number one of these?", for a list of keys computed in JS.
 *
 * The list travels as ONE json parameter and is unpacked by
 * jsonb_array_elements_text, rather than as `= ANY(${array})`. Drizzle's sql
 * template expands a JS array into a parameter LIST — `('a','b')` — not a
 * Postgres array literal, so `ANY` gets a syntax error and an empty array gets
 * `()`. The contacts importer hit the identical trap; the identical fix.
 *
 * EXISTS rather than IN because `phoneKey` is null for a row whose number
 * holds no digits at all, and `NOT IN (…)` against a null yields null — which
 * would silently drop exactly the worst rows from the "healthy numbers" view.
 */
const keyMatch = (keys) =>
  sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb) k(v) WHERE k.v = p."phoneKey")`;

/** How long a customer counts as "recently active", matching customer.repository. */
const ACTIVITY_WINDOW_DAYS = 90;
const FREQUENT_MIN_ORDERS = 3;

const SORTS = {
  newest: sql`p."createdAt" DESC NULLS LAST`,
  oldest: sql`p."createdAt" ASC NULLS LAST`,
  name: sql`p.name ASC`,
  company: sql`p."companyName" ASC NULLS LAST`,
  // Customers with recent orders first, then everyone else. The default,
  // because "who should I be calling?" is the question the page is opened to
  // answer far more often than "who was added last?".
  active: sql`p."lastOrderAt" DESC NULLS LAST, p."createdAt" DESC`,
  value: sql`p."lifetimeValue" DESC NULLS LAST`,
};

/**
 * The union, before filtering.
 *
 * A contact is excluded when a customer exists on the same normalised number —
 * NOT LEFT JOINed and flagged, because the whole point is that the person
 * occupies one row. The customer row picks the lead's details back up through
 * the same match, so nothing the contact recorded is lost.
 */
const UNIFIED = sql`
  WITH stats AS (
    SELECT
      o.customer_id,
      COUNT(*)::int AS order_count,
      COUNT(*) FILTER (
        WHERE o.created_at >= now() - (${ACTIVITY_WINDOW_DAYS} || ' days')::interval
      )::int AS orders_recent,
      MAX(o.created_at) AS last_order_at,
      COALESCE(SUM(o.total_amount::numeric) FILTER (WHERE o.payment_status = 'Paid'), 0)::float AS lifetime_value,
      MODE() WITHIN GROUP (ORDER BY o.depot_id) AS primary_depot_id
    FROM orders o
    GROUP BY o.customer_id
  )
  SELECT
    'customer'::text                      AS kind,
    c.id                                  AS "customerId",
    lead.id                               AS "contactId",
    c.name                                AS name,
    c.phone                               AS phone,
    c.phone_normalized                    AS "phoneKey",
    COALESCE(c.email, '')                 AS email,
    COALESCE(c.company_name, '')          AS "companyName",
    c.status::text                        AS "customerStatus",
    c.marketing_opt_out                   AS "marketingOptOut",
    c.created_at                          AS "createdAt",
    c.balance::numeric                    AS balance,
    COALESCE(s.order_count, 0)            AS "orderCount",
    s.last_order_at                       AS "lastOrderAt",
    COALESCE(s.lifetime_value, 0)         AS "lifetimeValue",
    CASE
      WHEN COALESCE(s.order_count, 0) = 0 THEN 'never'
      WHEN COALESCE(s.orders_recent, 0) >= ${FREQUENT_MIN_ORDERS} THEN 'frequent'
      WHEN COALESCE(s.orders_recent, 0) >= 1 THEN 'occasional'
      ELSE 'dormant'
    END                                   AS "activityBand",
    d.name                                AS "locationName",
    -- Carried over from the contact row they arrived as, when there was one.
    COALESCE(lead.tags, '{}'::text[])     AS tags,
    COALESCE(lead.stage::text, '')        AS stage,
    COALESCE(lead.source::text, '')        AS source,
    COALESCE(lead.notes, '')              AS notes,
    (lead.id IS NOT NULL)                 AS "cameInAsLead"
  FROM customers c
  LEFT JOIN stats s ON s.customer_id = c.id
  LEFT JOIN depots d ON d.id = s.primary_depot_id
  LEFT JOIN LATERAL (
    SELECT ct.id, ct.tags, ct.stage, ct.source, ct.notes
    FROM contacts ct
    WHERE ct.phone_normalized = c.phone_normalized
    ORDER BY ct.id
    LIMIT 1
  ) lead ON TRUE

  UNION ALL

  SELECT
    ct.stage::text                        AS kind,
    NULL::int                             AS "customerId",
    ct.id                                 AS "contactId",
    ct.name,
    ct.phone,
    ct.phone_normalized                   AS "phoneKey",
    ct.email,
    ct.company_name                       AS "companyName",
    NULL::text                            AS "customerStatus",
    ct.marketing_opt_out                  AS "marketingOptOut",
    ct.created_at                         AS "createdAt",
    NULL::numeric                         AS balance,
    0                                     AS "orderCount",
    NULL::timestamptz                     AS "lastOrderAt",
    0                                     AS "lifetimeValue",
    NULL::text                            AS "activityBand",
    dep.name                              AS "locationName",
    ct.tags,
    ct.stage::text                        AS stage,
    ct.source::text                       AS source,
    ct.notes,
    false                                 AS "cameInAsLead"
  FROM contacts ct
  LEFT JOIN depots dep ON dep.id = ct.location_id
  -- The dedupe. A lead who has since signed up is one person, and they are
  -- represented above by the customer row that carries their orders.
  WHERE NOT EXISTS (
    SELECT 1 FROM customers c2 WHERE c2.phone_normalized = ct.phone_normalized
  )
`;

/**
 * Every normalised number on the book that is not a good, reachable mobile —
 * plus the keys that appear more than once.
 *
 * libphonenumber cannot run inside Postgres, so this is the one place the
 * whole book is pulled through it. That is ~1,400 rows and a few tens of
 * milliseconds, which is why it is cached for a minute rather than
 * recalculated per keystroke on a filtered list.
 *
 * @returns {Promise<{invalid: Map<string,string>, unreachable: Map<string,string>, duplicates: Set<string>}>}
 */
let hygieneCache = { at: 0, value: null };
const HYGIENE_TTL_MS = 60_000;

const scanPhoneHygiene = async ({ force = false } = {}) => {
  if (!force && hygieneCache.value && Date.now() - hygieneCache.at < HYGIENE_TTL_MS) {
    return hygieneCache.value;
  }

  const result = await db.execute(sql`
    SELECT phone, phone_normalized AS key FROM customers
    UNION ALL
    SELECT phone, phone_normalized AS key FROM contacts
  `);
  const rows = result.rows ?? result;

  const invalid = new Map();
  const unreachable = new Map();
  const seen = new Map();
  const duplicates = new Set();

  for (const row of rows) {
    const key = row.key || normalizedKey(row.phone);
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    // A key held by two rows is a duplicate person, whichever tables they are
    // spread across — two customers written "0803…" and "+234803…", or a
    // contact that survived alongside the customer it converted into.
    if (key && count > 1) duplicates.add(key);

    if (invalid.has(key) || unreachable.has(key)) continue;
    const { verdict, reason } = classifyPhone(row.phone);
    if (verdict === "invalid") invalid.set(key, reason);
    else if (verdict === "unreachable") unreachable.set(key, reason);
  }

  hygieneCache = { at: Date.now(), value: { invalid, unreachable, duplicates } };
  return hygieneCache.value;
};

/** Writes that change a number must not be read back through a stale scan. */
const invalidateHygieneCache = () => {
  hygieneCache = { at: 0, value: null };
};

/**
 * The merged list.
 *
 * `numberStatus` filters on the hygiene scan rather than on SQL: validity is a
 * libphonenumber question, and approximating it with a digit-length regex in
 * the WHERE clause would disagree with the review panel about which rows are
 * broken. The key set goes into the query as an array instead, so the filter
 * and the panel can never tell two different stories.
 */
const findAll = async ({
  search,
  kind,
  converted,
  locationId,
  tag,
  optedOut,
  status,
  activity,
  hasBalance,
  numberStatus,
  sort = "active",
  page = 1,
  limit = 50,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(5000, Math.max(1, parseInt(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const where = [];

  if (search) {
    const pattern = `%${search}%`;
    // Numbers are searched the way the searcher writes them, which is rarely
    // how they were stored — "0803…" has to find a row held as "+234803…".
    const digits = String(search).replace(/[^0-9]/g, "");
    const byNumber =
      digits.length >= 4 ? sql` OR p."phoneKey" LIKE ${`%${digits.slice(-10)}%`}` : sql``;
    where.push(
      sql`(p.name ILIKE ${pattern} OR p.phone ILIKE ${pattern} OR p.email ILIKE ${pattern} OR p."companyName" ILIKE ${pattern}${byNumber})`
    );
  }

  if (kind === "customer") where.push(sql`p.kind = 'customer'`);
  else if (kind === "lead") where.push(sql`p.kind = 'lead'`);
  else if (kind === "contact") where.push(sql`p.kind = 'contact'`);
  else if (kind === "prospect") where.push(sql`p.kind <> 'customer'`);

  // "Converted" is now visible as a property of the merged row rather than a
  // separate page: a customer who arrived as a lead, versus one who walked in.
  if (converted === "yes") where.push(sql`p."cameInAsLead" = true`);
  if (converted === "no") where.push(sql`p.kind <> 'customer'`);

  if (locationId) where.push(sql`p."locationName" = (SELECT name FROM depots WHERE id = ${Number(locationId)})`);
  if (tag) where.push(sql`${tag} = ANY(p.tags)`);
  if (optedOut === "yes") where.push(sql`p."marketingOptOut" = true`);
  if (optedOut === "no") where.push(sql`p."marketingOptOut" = false`);
  if (status && status !== "all") where.push(sql`p."customerStatus" = ${status}`);
  if (activity && activity !== "all") where.push(sql`p."activityBand" = ${activity}`);
  if (hasBalance === "yes") where.push(sql`p.balance > 0`);
  if (hasBalance === "no") where.push(sql`COALESCE(p.balance, 0) <= 0`);

  let hygiene = null;
  if (numberStatus && numberStatus !== "all") {
    hygiene = await scanPhoneHygiene();
    const keysFor = {
      invalid: [...hygiene.invalid.keys()],
      unreachable: [...hygiene.unreachable.keys()],
      duplicate: [...hygiene.duplicates],
    };
    if (numberStatus === "ok") {
      const bad = [
        ...new Set([...keysFor.invalid, ...keysFor.unreachable, ...keysFor.duplicate]),
      ];
      if (bad.length) where.push(sql`NOT ${keyMatch(bad)}`);
    } else {
      const keys = keysFor[numberStatus] || [];
      // Nothing matches an empty set — say so explicitly rather than letting
      // the clause fall away and silently return the whole book.
      where.push(keys.length ? keyMatch(keys) : sql`false`);
    }
  }

  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
  const orderBySql = SORTS[sort] || SORTS.active;

  const [rowsResult, summaryResult] = await Promise.all([
    db.execute(sql`
      WITH people AS (${UNIFIED})
      SELECT p.* FROM people p
      ${whereSql}
      ORDER BY ${orderBySql}
      LIMIT ${limitNum} OFFSET ${offset}
    `),
    db.execute(sql`
      WITH people AS (${UNIFIED})
      SELECT
        COUNT(*)::int                                                  AS total,
        COUNT(*) FILTER (WHERE p.kind = 'customer')::int               AS customers,
        COUNT(*) FILTER (WHERE p.kind = 'lead')::int                   AS leads,
        COUNT(*) FILTER (WHERE p.kind = 'contact')::int                AS "otherContacts",
        COUNT(*) FILTER (WHERE p."cameInAsLead")::int                  AS converted,
        COUNT(*) FILTER (WHERE p."marketingOptOut" = false)::int       AS reachable,
        COUNT(*) FILTER (WHERE p."createdAt" >= date_trunc('month', now()))::int AS "newThisMonth"
      FROM people p
      ${whereSql}
    `),
  ]);

  const rows = rowsResult.rows ?? rowsResult;
  const summary = (summaryResult.rows ?? summaryResult)[0] || {};
  const total = Number(summary.total || 0);

  // Annotate the page — not the whole book — with its number verdicts, so a
  // broken number is visible on the row rather than only inside the panel.
  hygiene ||= await scanPhoneHygiene();
  const people = rows.map((row) => {
    const { verdict, reason } = classifyPhone(row.phone);
    return {
      ...row,
      balance: row.balance === null ? null : Number(row.balance),
      lifetimeValue: Number(row.lifetimeValue || 0),
      orderCount: Number(row.orderCount || 0),
      numberStatus: verdict,
      numberReason: reason,
      hasDuplicate: hygiene.duplicates.has(row.phoneKey),
    };
  });

  return {
    people,
    pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, limit: limitNum },
    summary: {
      total,
      customers: Number(summary.customers || 0),
      leads: Number(summary.leads || 0),
      otherContacts: Number(summary.otherContacts || 0),
      converted: Number(summary.converted || 0),
      reachable: Number(summary.reachable || 0),
      newThisMonth: Number(summary.newThisMonth || 0),
      // Counted over the whole book, never the filtered view: "117 numbers
      // need attention" is a standing fact about the data, and having it move
      // when someone types in the search box would make it meaningless.
      needsAttention: hygiene.invalid.size + hygiene.unreachable.size + hygiene.duplicates.size,
    },
  };
};

/**
 * The review panel: every number that is broken, unreachable or doubled, with
 * enough context attached for a human to decide what to do about it.
 *
 * Nothing is deleted here and nothing is deleted automatically anywhere. 115
 * of the 1,380 customer numbers on the live book are invalid, and some of
 * those rows carry orders, deposits and a wallet balance — dropping a customer
 * over a typed phone number would destroy the order history behind it. The
 * guard lives in `deletableReason` below, which is computed per row and
 * re-checked server-side before any delete is honoured.
 */
const findHygieneIssues = async ({ issue = "all", limit = 500 } = {}) => {
  const hygiene = await scanPhoneHygiene({ force: true });
  const limitNum = Math.min(2000, Math.max(1, Number(limit) || 500));

  const keys = new Set([
    ...(issue === "all" || issue === "invalid" ? hygiene.invalid.keys() : []),
    ...(issue === "all" || issue === "unreachable" ? hygiene.unreachable.keys() : []),
    ...(issue === "all" || issue === "duplicate" ? hygiene.duplicates : []),
  ]);
  if (!keys.size) {
    return { issues: [], summary: { invalid: 0, unreachable: 0, duplicate: 0, total: 0 } };
  }

  // One json parameter, unpacked server-side — see keyMatch above for why an
  // array cannot be bound directly here. `IN (subquery)` and not
  // `= ANY(array)`: fed a scalar subquery, ANY compares the column against the
  // whole array as a single value and Postgres rejects `varchar = text[]`.
  const keyList = sql`(SELECT k.v FROM jsonb_array_elements_text(${JSON.stringify([...keys])}::jsonb) k(v))`;
  const result = await db.execute(sql`
    SELECT
      'customer'::text AS kind,
      c.id,
      c.name,
      c.phone,
      c.phone_normalized AS "phoneKey",
      c.email,
      c.company_name AS "companyName",
      c.created_at AS "createdAt",
      c.balance::numeric AS balance,
      COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id), 0)::int AS "orderCount",
      COALESCE((SELECT COUNT(*) FROM deposits dp WHERE dp.customer_id = c.id), 0)::int AS "depositCount"
    FROM customers c
    WHERE c.phone_normalized IN ${keyList}

    UNION ALL

    SELECT
      'contact'::text,
      ct.id,
      ct.name,
      ct.phone,
      ct.phone_normalized,
      ct.email,
      ct.company_name,
      ct.created_at,
      NULL::numeric,
      0,
      0
    FROM contacts ct
    WHERE ct.phone_normalized IN ${keyList}

    ORDER BY "phoneKey", kind, "createdAt"
    LIMIT ${limitNum}
  `);
  const rows = result.rows ?? result;

  // Grouped by the number, because that is the unit a person reasons about —
  // "these two rows are the same man" is one decision, not two.
  const groups = new Map();
  for (const row of rows) {
    const key = row.phoneKey;
    if (!groups.has(key)) {
      groups.set(key, {
        phoneKey: key,
        problems: [
          ...(hygiene.invalid.has(key) ? [{ type: "invalid", reason: hygiene.invalid.get(key) }] : []),
          ...(hygiene.unreachable.has(key)
            ? [{ type: "unreachable", reason: hygiene.unreachable.get(key) }]
            : []),
          ...(hygiene.duplicates.has(key)
            ? [{ type: "duplicate", reason: "More than one record holds this number" }]
            : []),
        ],
        records: [],
      });
    }

    const orderCount = Number(row.orderCount || 0);
    const depositCount = Number(row.depositCount || 0);
    const balance = row.balance === null ? null : Number(row.balance);

    groups.get(key).records.push({
      kind: row.kind,
      id: Number(row.id),
      name: row.name,
      phone: row.phone,
      email: row.email || "",
      companyName: row.companyName || "",
      createdAt: row.createdAt,
      balance,
      orderCount,
      depositCount,
      // Why this row may or may not be removed, decided here and enforced
      // again in the controller. A contact is just a number on a list; a
      // customer with history is a ledger entry other tables point at.
      deletableReason: deletableReason({ kind: row.kind, orderCount, depositCount, balance }),
    });
  }

  return {
    issues: [...groups.values()],
    summary: {
      invalid: hygiene.invalid.size,
      unreachable: hygiene.unreachable.size,
      duplicate: hygiene.duplicates.size,
      total: keys.size,
    },
  };
};

/**
 * Whether a row is safe to delete, and why not when it isn't.
 *
 * The single rule the whole quarantine flow rests on: a record that anything
 * financial points at is never removable from here. Returning the reason
 * rather than a boolean means the button can say what it is refusing and why,
 * instead of being mysteriously greyed out.
 *
 * @returns {null|string} null when deletable, otherwise the reason it is not
 */
const deletableReason = ({ kind, orderCount, depositCount, balance }) => {
  if (kind === "contact") return null; // nothing points at a contact row
  if (orderCount > 0) return `Has ${orderCount} order${orderCount === 1 ? "" : "s"}`;
  if (depositCount > 0) return `Has ${depositCount} deposit${depositCount === 1 ? "" : "s"}`;
  if (Number(balance || 0) !== 0) return "Wallet balance is not zero";
  return null;
};

/** Re-check one customer's guard at delete time, against live rows. */
const customerDeleteGuard = async (id) => {
  const result = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.balance::numeric AS balance,
      COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id), 0)::int AS "orderCount",
      COALESCE((SELECT COUNT(*) FROM deposits dp WHERE dp.customer_id = c.id), 0)::int AS "depositCount"
    FROM customers c WHERE c.id = ${Number(id)}
  `);
  const row = (result.rows ?? result)[0];
  if (!row) return { found: false };
  return {
    found: true,
    name: row.name,
    reason: deletableReason({
      kind: "customer",
      orderCount: Number(row.orderCount),
      depositCount: Number(row.depositCount),
      balance: Number(row.balance),
    }),
  };
};

module.exports = {
  findAll,
  findHygieneIssues,
  customerDeleteGuard,
  scanPhoneHygiene,
  invalidateHygieneCache,
  deletableReason,
};
