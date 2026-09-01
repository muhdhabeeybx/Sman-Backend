const { sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { sessionRepo } = require("../repositories");
const { normalizedKey } = require("../utils/phone");

/**
 * Two rows, one human — folded into one without losing what either one holds.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The same customer arrives twice all the time: they ring from the director's
 * line one week and the warehouse line the next, the desk cannot find the
 * first record, and a second one is opened under the same name. Migration
 * 0019 named this as the source of the duplicate groups the hygiene panel
 * surfaces, and gave a customer somewhere to keep their other numbers — but
 * it could not repair the split that had already happened.
 *
 * Deleting the spare is not the repair. The spare is where half the orders
 * are: the hygiene panel refuses outright to delete any record carrying
 * orders, deposits or a balance, and it is right to, so the duplicates that
 * matter most are precisely the ones nothing could be done about. The only
 * safe answer is to MOVE what the spare holds onto the record being kept and
 * then remove the empty shell.
 *
 * ── The rule everything here follows ───────────────────────────────────────
 *
 * Nothing financial is ever destroyed. Every order, deposit, commission,
 * licence, request, hold and expected payment is re-pointed at the survivor
 * before the loser row goes; wallet balances are ADDED, not replaced; the
 * loser's phone numbers survive as alternates on the survivor, so the number
 * the customer has always rung from still signs them in and still finds them
 * in the search box. What the desk sees afterwards is one customer with the
 * combined history — not a smaller book with orders missing from it.
 *
 * ── Why it is one transaction ──────────────────────────────────────────────
 *
 * Half a merge is worse than no merge: orders under a customer row that no
 * longer exists, or a balance counted twice. Every statement below runs in
 * one transaction and the customer row is deleted last, so a failure anywhere
 * leaves the book exactly as it was.
 */

/** Merging is a review activity, not a bulk one — 20 at a time is generous. */
const MAX_SOURCES = 20;

/**
 * Everything that points at a customer and simply has to follow them.
 *
 * Written out as data rather than fifteen near-identical UPDATE statements so
 * that adding a table is one line here — and so that the list itself is
 * readable as the answer to "what does a customer own?".
 *
 * `notification_deliveries` carries no foreign key (it records sends to leads
 * as well, who have no customer row), which is exactly why it has to be named
 * here: nothing in the database would stop its rows being orphaned.
 */
const REPOINTED = [
  ["orders", "customer_id"],
  ["deposits", "customer_id"],
  ["commissions", "customer_id"],
  ["customer_licenses", "customer_id"],
  ["dangote_order_requests", "customer_id"],
  ["lpg_order_requests", "customer_id"],
  ["wallet_holds", "customer_id"],
  ["expected_payments", "customer_id"],
  ["customer_phones", "customer_id"],
  ["customer_passkeys", "customer_id"],
  ["customer_trusted_devices", "customer_id"],
  ["device_tokens", "customer_id"],
  ["notifications", "customer_id"],
  ["notification_deliveries", "customer_id"],
  ["wa_messages", "customer_id"],
  ["wa_sessions", "customer_id"],
  ["audit_logs", "actor_customer_id"],
];

/**
 * Tables holding at most one row per customer per key.
 *
 * These cannot simply be re-pointed: a customer who already has an "email"
 * notification preference cannot be given a second one, and the UPDATE would
 * fail on the unique index rather than merging anything. The survivor's own
 * row wins — it is the account being kept, so its settings are the ones the
 * customer last chose on it — and the loser's duplicate is dropped.
 */
const KEYED = [
  ["customer_identities", "customer_id", "provider"],
  ["notification_preferences", "customer_id", "category"],
];

/**
 * Auth material that is thrown away rather than moved.
 *
 * A one-time code and a WebAuthn challenge are alive for seconds and are
 * bound to a login attempt against an account that is about to stop existing.
 * Moving them would carry a half-finished sign-in across an identity change;
 * dropping them costs the customer one retry.
 *
 * Both cascade on the delete anyway. They are named here because letting them
 * go is a decision, and a decision made silently by a foreign key is one
 * nobody can find later.
 */
const SCRAPPED = ["customer_otps", "webauthn_challenges"];

/** An int list as ONE json parameter — see people.repository.js#keyMatch. */
const idList = (ids) =>
  sql`(SELECT (k.v)::int FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) k(v))`;

const money = (value) => Number(value || 0);

const fail = (status, message) => ({ ok: false, status, message });

/** Distinct, in the order given, with the survivor removed if it is in there. */
const cleanSources = (sources, target) => {
  const seen = new Set([`${target.kind}:${target.id}`]);
  const out = [];
  for (const s of sources || []) {
    const key = `${s.kind}:${Number(s.id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: s.kind, id: Number(s.id) });
  }
  return out;
};

// ── Reading the parties ─────────────────────────────────────────────────────

const loadCustomers = async (ids, tx) => {
  if (!ids.length) return [];
  const result = await tx.execute(sql`
    SELECT
      c.id, c.name, c.phone, c.phone_normalized AS "phoneKey", c.email,
      c.company_name AS "companyName", c.address, c.status::text AS status,
      c.marketing_opt_out AS "marketingOptOut", c.balance::numeric AS balance,
      c.deposit::numeric AS deposit, c.previous_deposit::numeric AS "previousDeposit",
      c.phone_verified_at AS "phoneVerifiedAt", c.created_at AS "createdAt",
      c.paystack_customer_id AS "paystackCustomerId",
      c.virtual_account_number AS "virtualAccountNumber",
      c.virtual_account_bank AS "virtualAccountBank",
      c.virtual_account_name AS "virtualAccountName",
      c.dva_subaccount_code AS "dvaSubaccountCode",
      c.commission_bank_name AS "commissionBankName",
      c.commission_account_name AS "commissionAccountName",
      c.commission_account_number AS "commissionAccountNumber",
      COALESCE((SELECT array_agg(cp.phone ORDER BY cp.id) FROM customer_phones cp WHERE cp.customer_id = c.id), '{}') AS "extraPhones"
    FROM customers c
    WHERE c.id IN ${idList(ids)}
  `);
  return (result.rows ?? result).map((row) => ({ ...row, kind: "customer", id: Number(row.id) }));
};

const loadContacts = async (ids, tx) => {
  if (!ids.length) return [];
  const result = await tx.execute(sql`
    SELECT
      ct.id, ct.name, ct.phone, ct.phone_normalized AS "phoneKey", ct.email,
      ct.company_name AS "companyName", ct.stage::text AS stage, ct.source::text AS source,
      ct.location_id AS "locationId", ct.tags, ct.notes,
      ct.marketing_opt_out AS "marketingOptOut", ct.created_at AS "createdAt"
    FROM contacts ct
    WHERE ct.id IN ${idList(ids)}
  `);
  return (result.rows ?? result).map((row) => ({ ...row, kind: "contact", id: Number(row.id) }));
};

/**
 * Both books in one call, returned in the order asked for.
 *
 * Order matters because the UI lists the records it is about to merge and the
 * server's answer has to line up with what the person ticked.
 */
const loadParties = async (refs, tx) => {
  const [customers, contacts] = await Promise.all([
    loadCustomers(refs.filter((r) => r.kind === "customer").map((r) => r.id), tx),
    loadContacts(refs.filter((r) => r.kind === "contact").map((r) => r.id), tx),
  ]);
  const byKey = new Map([...customers, ...contacts].map((row) => [`${row.kind}:${row.id}`, row]));
  return refs.map((ref) => byKey.get(`${ref.kind}:${Number(ref.id)}`) || null);
};

/**
 * What the losing customer rows are actually carrying.
 *
 * Counted before anything moves, so the same numbers can be shown in the
 * preview ("47 orders will move") and reported back after the merge as what
 * DID move. One statement rather than nine round trips.
 */
const countBaggage = async (customerIds, tx) => {
  const empty = {
    orders: 0, deposits: 0, commissions: 0, licenses: 0, dangoteRequests: 0,
    lpgRequests: 0, walletHolds: 0, expectedPayments: 0, notifications: 0,
    phones: 0, sessions: 0,
  };
  if (!customerIds.length) return empty;

  const ids = idList(customerIds);
  const result = await tx.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM orders WHERE customer_id IN ${ids})::int                      AS orders,
      (SELECT COUNT(*) FROM deposits WHERE customer_id IN ${ids})::int                    AS deposits,
      (SELECT COUNT(*) FROM commissions WHERE customer_id IN ${ids})::int                 AS commissions,
      (SELECT COUNT(*) FROM customer_licenses WHERE customer_id IN ${ids})::int            AS licenses,
      (SELECT COUNT(*) FROM dangote_order_requests WHERE customer_id IN ${ids})::int       AS "dangoteRequests",
      (SELECT COUNT(*) FROM lpg_order_requests WHERE customer_id IN ${ids})::int           AS "lpgRequests",
      (SELECT COUNT(*) FROM wallet_holds WHERE customer_id IN ${ids})::int                 AS "walletHolds",
      (SELECT COUNT(*) FROM expected_payments WHERE customer_id IN ${ids})::int            AS "expectedPayments",
      (SELECT COUNT(*) FROM notifications WHERE customer_id IN ${ids})::int                AS notifications,
      (SELECT COUNT(*) FROM customer_phones WHERE customer_id IN ${ids})::int              AS phones,
      (SELECT COUNT(*) FROM sessions WHERE customer_id IN ${ids} AND revoked_at IS NULL)::int AS sessions
  `);
  const row = (result.rows ?? result)[0] || {};
  return Object.fromEntries(Object.keys(empty).map((k) => [k, Number(row[k] || 0)]));
};

// ── Deciding what the survivor ends up looking like ─────────────────────────

/**
 * Fields the survivor takes from the records being folded in.
 *
 * Only ever fills a BLANK. A merge must not overwrite something the desk
 * typed on the record it chose to keep — the whole reason that record was
 * chosen is that it is the one they trust — so the loser's details are used
 * to complete it, never to correct it.
 */
const FILLABLE = [
  ["email", "Email"],
  ["companyName", "Company"],
  ["address", "Address"],
  ["commissionBankName", "Commission bank"],
  ["commissionAccountName", "Commission account name"],
  ["commissionAccountNumber", "Commission account number"],
];

const blank = (value) => !String(value ?? "").trim();

const planCustomerFields = (target, sources) => {
  const fills = [];
  const patch = {};

  for (const [field, label] of FILLABLE) {
    if (!blank(target[field])) continue;
    const donor = sources.find((s) => !blank(s[field]));
    if (!donor) continue;
    patch[field] = String(donor[field]).trim();
    fills.push({ field, label, value: patch[field], from: donor.name });
  }

  // A virtual account is how money reaches this customer. If the survivor has
  // none and a record being folded in does, it comes across — otherwise a
  // transfer to that account number would land nowhere after the merge.
  if (blank(target.virtualAccountNumber)) {
    const donor = sources.find((s) => s.kind === "customer" && !blank(s.virtualAccountNumber));
    if (donor) {
      patch.virtualAccountNumber = donor.virtualAccountNumber;
      patch.virtualAccountBank = donor.virtualAccountBank;
      patch.virtualAccountName = donor.virtualAccountName;
      patch.dvaSubaccountCode = donor.dvaSubaccountCode;
      patch.paystackCustomerId = blank(target.paystackCustomerId)
        ? donor.paystackCustomerId
        : target.paystackCustomerId;
      fills.push({
        field: "virtualAccountNumber",
        label: "Virtual account",
        value: donor.virtualAccountNumber,
        from: donor.name,
      });
    }
  }

  return { patch, fills };
};

/**
 * Numbers that will be attached to the survivor, and the ones already there.
 *
 * The survivor's own primary and its alternates are excluded, because two
 * records for the same person are very often the same number written two
 * different ways — "08031234567" and "+2348031234567" — and re-adding it
 * would break the unique index the login depends on.
 */
const planPhones = (target, sources) => {
  const held = new Set([target.phoneKey, ...(target.extraPhones || []).map(normalizedKey)].filter(Boolean));
  const adding = [];
  for (const source of sources) {
    for (const phone of [source.phone, ...(source.extraPhones || [])]) {
      const key = normalizedKey(phone);
      if (!key || held.has(key)) continue;
      held.add(key);
      adding.push({ phone, key, from: source.name });
    }
  }
  return adding;
};

/** Things worth saying out loud before the button is pressed. */
const collectWarnings = (target, sources) => {
  const warnings = [];

  if (target.kind === "customer") {
    const strandedDva = sources.filter(
      (s) => s.kind === "customer" && !blank(s.virtualAccountNumber) && !blank(target.virtualAccountNumber)
    );
    for (const s of strandedDva) {
      warnings.push(
        `${s.name}'s virtual account ${s.virtualAccountNumber} will stop working — ${target.name} keeps their own, and a transfer to the old number will not credit anyone.`
      );
    }

    const differentCompany = sources.filter(
      (s) => !blank(s.companyName) && !blank(target.companyName) &&
        String(s.companyName).trim().toLowerCase() !== String(target.companyName).trim().toLowerCase()
    );
    for (const s of differentCompany) {
      warnings.push(
        `${s.name} trades as "${s.companyName}" and ${target.name} as "${target.companyName}". Only ${target.companyName} is kept — past orders keep the name they were placed under.`
      );
    }
  }

  if (target.kind === "contact") {
    for (const s of sources) {
      warnings.push(
        `${s.name}'s number ${s.phone} will be kept only as a note — a lead holds one number, and alternate numbers belong to an account.`
      );
    }
  }

  if (sources.some((s) => s.marketingOptOut) && !target.marketingOptOut) {
    warnings.push(
      "One of these records has opted out of marketing, so the merged record stays opted out."
    );
  }

  return warnings;
};

// ── The preview ─────────────────────────────────────────────────────────────

/**
 * Everything the merge would do, without doing any of it.
 *
 * The counts come from the same query the merge itself runs, so the sentence
 * on the confirmation screen and the sentence in the result toast cannot
 * disagree about how many orders moved.
 */
const previewMerge = async ({ target, sources }) => {
  const validated = await validate({ target, sources }, db);
  if (!validated.ok) return validated;

  const { targetRow, sourceRows } = validated;
  const sourceCustomerIds = sourceRows.filter((r) => r.kind === "customer").map((r) => r.id);
  const moving = await countBaggage(sourceCustomerIds, db);

  const incoming = sourceRows.reduce((sum, r) => sum + money(r.balance), 0);
  const { fills } = targetRow.kind === "customer"
    ? planCustomerFields(targetRow, sourceRows)
    : { fills: [] };

  return {
    ok: true,
    target: summarise(targetRow),
    sources: sourceRows.map(summarise),
    moving,
    balance: {
      keeping: money(targetRow.balance),
      incoming,
      total: money(targetRow.balance) + incoming,
    },
    phones: planPhones(targetRow, sourceRows).map((p) => p.phone),
    tags: mergedTags(targetRow, sourceRows),
    fills,
    warnings: collectWarnings(targetRow, sourceRows),
  };
};

/** The shape the merge screen renders a party in. */
const summarise = (row) => ({
  kind: row.kind,
  id: row.id,
  name: row.name,
  phone: row.phone,
  companyName: row.companyName || "",
  email: row.email || "",
  balance: row.kind === "customer" ? money(row.balance) : null,
  createdAt: row.createdAt,
});

const mergedTags = (target, sources) => {
  const tags = new Set([...(target.tags || [])]);
  for (const s of sources) for (const t of s.tags || []) tags.add(t);
  return [...tags];
};

// ── Validation, shared by the preview and the merge ─────────────────────────

const validate = async ({ target, sources }, tx) => {
  if (!target || !target.kind || !target.id) {
    return fail(400, "Choose which record to keep");
  }

  const list = cleanSources(sources, { kind: target.kind, id: Number(target.id) });
  if (!list.length) {
    return fail(400, "Choose at least one other record to merge into it");
  }
  if (list.length > MAX_SOURCES) {
    return fail(400, `Merge at most ${MAX_SOURCES} records at a time`);
  }

  const refs = [{ kind: target.kind, id: Number(target.id) }, ...list];
  const rows = await loadParties(refs, tx);
  const [targetRow, ...sourceRows] = rows;

  if (!targetRow) return fail(404, "The record you chose to keep no longer exists");
  const missing = sourceRows.filter((r) => !r);
  if (missing.length) {
    return fail(404, "One of the selected records no longer exists — reload the list and try again");
  }

  /**
   * A customer can never be folded into a lead.
   *
   * The lead row has no wallet and nothing points at it, so "merging" that
   * way round would mean deleting the account carrying the orders. It is
   * always the wrong direction, and the message says which way to go rather
   * than just refusing.
   */
  if (targetRow.kind !== "customer") {
    const customerSource = sourceRows.find((r) => r.kind === "customer");
    if (customerSource) {
      return fail(
        409,
        `${customerSource.name} is a customer with an account behind them. Keep the customer and merge ${targetRow.name} into them instead.`
      );
    }
  }

  return { ok: true, targetRow, sourceRows };
};

// ── The merge ───────────────────────────────────────────────────────────────

/**
 * Fold the source records into the target and remove them.
 *
 * @param {{kind:string,id:number}} target  the record being kept
 * @param {Array<{kind:string,id:number}>} sources  the records being absorbed
 * @param {number|null} actorId  staff id, recorded against numbers carried over
 */
const mergePeople = async ({ target, sources, actorId = null }) => {
  return db.transaction(async (tx) => {
    const validated = await validate({ target, sources }, tx);
    if (!validated.ok) return validated;

    const { targetRow, sourceRows } = validated;
    const sourceCustomers = sourceRows.filter((r) => r.kind === "customer");
    const sourceContacts = sourceRows.filter((r) => r.kind === "contact");
    const sourceCustomerIds = sourceCustomers.map((r) => r.id);

    // Counted first: after the UPDATEs below these rows belong to the target
    // and there is no longer anything to count.
    const moved = await countBaggage(sourceCustomerIds, tx);
    const phonesPlanned = planPhones(targetRow, sourceRows);
    const warnings = collectWarnings(targetRow, sourceRows);

    if (targetRow.kind === "customer") {
      await absorbIntoCustomer({
        targetRow, sourceRows, sourceCustomers, sourceContacts, phonesPlanned, actorId, tx,
      });
    } else {
      await absorbIntoContact({ targetRow, sourceContacts, tx });
    }

    return {
      ok: true,
      target: summarise(targetRow),
      sources: sourceRows.map(summarise),
      moved,
      balance: {
        keeping: money(targetRow.balance),
        incoming: sourceRows.reduce((sum, r) => sum + money(r.balance), 0),
        total: money(targetRow.balance) + sourceRows.reduce((sum, r) => sum + money(r.balance), 0),
      },
      phones: phonesPlanned.map((p) => p.phone),
      warnings,
    };
  });
};

/** The customer case: move everything, add the balances, keep the numbers. */
const absorbIntoCustomer = async ({
  targetRow, sourceRows, sourceCustomers, sourceContacts, phonesPlanned, actorId, tx,
}) => {
  const targetId = targetRow.id;
  const ids = sourceCustomers.map((r) => r.id);

  if (ids.length) {
    /**
     * Sessions are revoked, not moved.
     *
     * A session token resolves to a customer id the client has already cached;
     * carrying it across would leave a signed-in app holding the identity of a
     * row that no longer exists. Signing out costs one OTP, and the code now
     * goes to a number that reaches the surviving account anyway — because the
     * numbers move a few lines below.
     */
    for (const id of ids) {
      await sessionRepo.revokeAllForPrincipal("customer", id, "merged_into_customer", tx);
    }

    /**
     * An alternate that is the survivor's own primary written differently is
     * dropped rather than moved.
     *
     * The unique index on customer_phones spans that table only, so nothing
     * would refuse this row — the survivor would simply end up holding their
     * own number twice, once as the primary and once as an "other" number the
     * numbers dialog then offers to make primary.
     */
    await tx.execute(sql`
      DELETE FROM customer_phones
      WHERE customer_id IN ${idList(ids)}
        AND phone_normalized = (SELECT c.phone_normalized FROM customers c WHERE c.id = ${targetId})
    `);

    // The alternates come across first, so the loser's primary can be tested
    // against a customer_phones table that already holds them.
    for (const [table, column] of REPOINTED) {
      await tx.execute(sql`
        UPDATE ${sql.identifier(table)}
        SET ${sql.identifier(column)} = ${targetId}
        WHERE ${sql.identifier(column)} IN ${idList(ids)}
      `);
    }

    for (const [table, column, key] of KEYED) {
      await tx.execute(sql`
        UPDATE ${sql.identifier(table)} AS t
        SET ${sql.identifier(column)} = ${targetId}
        WHERE t.${sql.identifier(column)} IN ${idList(ids)}
          AND NOT EXISTS (
            SELECT 1 FROM ${sql.identifier(table)} k
            WHERE k.${sql.identifier(column)} = ${targetId}
              AND k.${sql.identifier(key)} = t.${sql.identifier(key)}
          )
      `);
      // Whatever the survivor already had a row for.
      await tx.execute(sql`
        DELETE FROM ${sql.identifier(table)}
        WHERE ${sql.identifier(column)} IN ${idList(ids)}
      `);
    }

    // notification_settings is one row per customer with no second key, so the
    // survivor's own row wins outright when they have one.
    await tx.execute(sql`
      UPDATE notification_settings SET customer_id = ${targetId}
      WHERE customer_id IN ${idList(ids)}
        AND NOT EXISTS (SELECT 1 FROM notification_settings n WHERE n.customer_id = ${targetId})
    `);
    await tx.execute(sql`DELETE FROM notification_settings WHERE customer_id IN ${idList(ids)}`);

    for (const table of SCRAPPED) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE customer_id IN ${idList(ids)}`);
    }
  }

  /**
   * Every number that reached one of these people now reaches the survivor.
   *
   * Guarded rather than inserted blind: the commonest duplicate of all is the
   * same number stored two ways, and `customer_phones` is unique on the last
   * ten digits. The label records whose record it arrived on, which is what
   * makes the numbers dialog afterwards read as a history rather than a list
   * of unexplained lines.
   */
  for (const entry of phonesPlanned) {
    await tx.execute(sql`
      INSERT INTO customer_phones (customer_id, phone, label, created_by)
      SELECT ${targetId}, ${entry.phone}, ${String(entry.from || "").slice(0, 60)}, ${actorId}
      WHERE NOT EXISTS (SELECT 1 FROM customer_phones cp WHERE cp.phone_normalized = ${entry.key})
        AND ${entry.key} IS DISTINCT FROM (SELECT c.phone_normalized FROM customers c WHERE c.id = ${targetId})
    `);
  }

  // The leads. Their tags and notes are what the customer row shows as its
  // history, so they are folded into the survivor's own lead row rather than
  // deleted with the contact.
  for (const contact of sourceContacts) {
    await absorbContactIntoCustomer({ targetRow, contact, tx });
  }

  const { patch } = planCustomerFields(targetRow, sourceRows);
  const incoming = [...sourceCustomers].reduce(
    (acc, r) => ({
      balance: acc.balance + money(r.balance),
      deposit: acc.deposit + money(r.deposit),
      previousDeposit: acc.previousDeposit + money(r.previousDeposit),
    }),
    { balance: 0, deposit: 0, previousDeposit: 0 }
  );

  const optOut =
    targetRow.marketingOptOut || [...sourceCustomers, ...sourceContacts].some((r) => r.marketingOptOut);

  // The earliest arrival is when this relationship actually started; keeping
  // the survivor's own date would make a customer of three years look new
  // because the row that happened to be kept was opened last month.
  const earliest = [targetRow, ...sourceRows]
    .map((r) => new Date(r.createdAt))
    .sort((a, b) => a - b)[0];

  // An archived record that turns out to be the same person as an active one
  // is active: somebody has been trading under it.
  const status =
    targetRow.status !== "Active" && sourceCustomers.some((r) => r.status === "Active")
      ? "Active"
      : targetRow.status;

  const sets = [
    sql`balance = (balance::numeric + ${incoming.balance})`,
    sql`deposit = (deposit::numeric + ${incoming.deposit})`,
    sql`previous_deposit = (previous_deposit::numeric + ${incoming.previousDeposit})`,
    sql`marketing_opt_out = ${optOut}`,
    sql`created_at = ${earliest.toISOString()}::timestamptz`,
    sql`status = ${status}::customer_status`,
    sql`updated_at = now()`,
  ];
  const COLUMN = {
    email: "email",
    companyName: "company_name",
    address: "address",
    commissionBankName: "commission_bank_name",
    commissionAccountName: "commission_account_name",
    commissionAccountNumber: "commission_account_number",
    virtualAccountNumber: "virtual_account_number",
    virtualAccountBank: "virtual_account_bank",
    virtualAccountName: "virtual_account_name",
    dvaSubaccountCode: "dva_subaccount_code",
    paystackCustomerId: "paystack_customer_id",
  };
  for (const [field, value] of Object.entries(patch)) {
    if (!COLUMN[field]) continue;
    sets.push(sql`${sql.identifier(COLUMN[field])} = ${value}`);
  }

  await tx.execute(sql`
    UPDATE customers SET ${sql.join(sets, sql`, `)} WHERE id = ${targetId}
  `);

  // Last, and only once nothing points at them any more.
  if (ids.length) {
    await tx.execute(sql`DELETE FROM customers WHERE id IN ${idList(ids)}`);
  }
};

/**
 * A lead folded into a customer.
 *
 * Their number has already been attached as an alternate by the caller. What
 * is left is the sales context — the tags, the notes, where they came from —
 * which lives on the contacts row and which the people list reads back onto
 * the customer through a phone match.
 *
 * If the customer already has a lead row of their own, the two are combined
 * into it. If they do not, the lead row is RE-POINTED at the customer's own
 * number instead of being deleted: it then IS the customer's lead row, and
 * everything it recorded survives the merge intact.
 */
const absorbContactIntoCustomer = async ({ targetRow, contact, tx }) => {
  const existing = await tx.execute(sql`
    SELECT id, tags, notes FROM contacts
    WHERE phone_normalized = ${targetRow.phoneKey} AND id <> ${contact.id}
    ORDER BY id LIMIT 1
  `);
  const own = (existing.rows ?? existing)[0];

  if (!own) {
    await tx.execute(sql`
      UPDATE contacts SET phone = ${targetRow.phone}, updated_at = now() WHERE id = ${contact.id}
    `);
    return;
  }

  const tags = [...new Set([...(own.tags || []), ...(contact.tags || [])])];
  const notes = [own.notes, contact.notes].map((n) => String(n || "").trim()).filter(Boolean).join("\n\n");

  await tx.execute(sql`
    UPDATE contacts
    SET tags = ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(tags)}::jsonb)),
        notes = ${notes},
        updated_at = now()
    WHERE id = ${own.id}
  `);
  await tx.execute(sql`DELETE FROM contacts WHERE id = ${contact.id}`);
};

/**
 * The lead-into-lead case.
 *
 * Nothing in the database points at a contact, so this is only ever about the
 * details themselves: the tags combine, blanks are filled, and the notes are
 * concatenated with the number that is being given up written into them —
 * a lead holds one number, and losing the second one silently would be losing
 * the only reason somebody recorded that row.
 */
const absorbIntoContact = async ({ targetRow, sourceContacts, tx }) => {
  const tags = mergedTags(targetRow, sourceContacts);
  const notes = [
    String(targetRow.notes || "").trim(),
    ...sourceContacts.map((c) => {
      const body = String(c.notes || "").trim();
      const line = `Merged from ${c.name} (${c.phone})`;
      return body ? `${line}\n${body}` : line;
    }),
  ].filter(Boolean).join("\n\n");

  const patch = {};
  for (const field of ["email", "company_name"]) {
    const key = field === "email" ? "email" : "companyName";
    if (!blank(targetRow[key])) continue;
    const donor = sourceContacts.find((c) => !blank(c[key]));
    if (donor) patch[field] = String(donor[key]).trim();
  }
  if (targetRow.locationId == null) {
    const donor = sourceContacts.find((c) => c.locationId != null);
    if (donor) patch.location_id = donor.locationId;
  }

  const sets = [
    sql`tags = ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(tags)}::jsonb))`,
    sql`notes = ${notes}`,
    sql`marketing_opt_out = ${targetRow.marketingOptOut || sourceContacts.some((c) => c.marketingOptOut)}`,
    sql`updated_at = now()`,
  ];
  for (const [column, value] of Object.entries(patch)) {
    sets.push(sql`${sql.identifier(column)} = ${value}`);
  }

  await tx.execute(sql`UPDATE contacts SET ${sql.join(sets, sql`, `)} WHERE id = ${targetRow.id}`);
  await tx.execute(sql`
    DELETE FROM contacts WHERE id IN ${idList(sourceContacts.map((c) => c.id))}
  `);
};

module.exports = { previewMerge, mergePeople, MAX_SOURCES };
