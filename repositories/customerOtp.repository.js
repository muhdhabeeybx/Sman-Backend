const crypto = require("crypto");
const { eq, and, isNull, gt, desc, sql, count } = require("drizzle-orm");
const { db } = require("../config/db");
const { customerOtps } = require("../db/schema");

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

/** Register / login / password step-up. */
const PURPOSE_AUTH = "auth";
/** App Store account deletion confirmation. */
const PURPOSE_ACCOUNT_DELETION = "account_deletion";

/**
 * sha256(customerId + ":" + code).
 *
 * Not bcrypt, deliberately. A 6-digit code has 10^6 possibilities, so a slow
 * KDF buys nothing against an attacker holding the database — the whole
 * keyspace is enumerable regardless. What it would cost is lookup: bcrypt's
 * per-row salt makes the hash un-searchable, forcing a fetch-all-and-compare
 * loop that makes "which row do I increment attempts on?" ambiguous.
 *
 * The customerId prefix stops one customer's code hash matching another's.
 */
function hashCode(customerId, code) {
  return crypto.createHash("sha256").update(`${customerId}:${code}`).digest("hex");
}

/**
 * A uniformly random 6-digit code.
 *
 * `randomInt(0, 1e6)` then zero-pad — the common
 * `100000 + Math.random() * 900000` form silently drops every code below
 * 100000, i.e. 10% of the keyspace, and uses a non-cryptographic PRNG.
 */
function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(CODE_LENGTH, "0");
}

/**
 * Invalidate every unconsumed code for this customer+purpose, so at most one
 * is ever live for that purpose. Auth and account_deletion do not clobber
 * each other.
 */
const invalidateLive = async (customerId, purpose = PURPOSE_AUTH, tx = db) => {
  return tx
    .update(customerOtps)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(customerOtps.customerId, customerId),
        eq(customerOtps.purpose, purpose),
        isNull(customerOtps.consumedAt)
      )
    )
    .returning({ id: customerOtps.id });
};

/**
 * Issue a code. Invalidate-then-insert runs in one transaction so a concurrent
 * request cannot leave two live codes behind for the same purpose.
 *
 * Returns { row, code } — `code` is the only time the plaintext exists; it goes
 * straight to the SMS service and is never logged or persisted.
 */
const issue = async (
  customerId,
  { ttlMinutes = 10, requestIp = null, code: fixedCode, purpose = PURPOSE_AUTH } = {}
) => {
  // `code` is an override for the development bypass, which needs a
  // predictable value. It never shortcuts verification — the code is still
  // hashed, stored, expired and attempt-capped exactly as a random one is.
  const code = fixedCode || generateCode();
  return db.transaction(async (tx) => {
    await invalidateLive(customerId, purpose, tx);
    const [row] = await tx
      .insert(customerOtps)
      .values({
        customerId,
        purpose,
        codeHash: hashCode(customerId, code),
        expiresAt: sql`now() + make_interval(mins => ${ttlMinutes})`,
        requestIp,
      })
      .returning();
    return { row, code };
  });
};

/** The single live code for a customer+purpose, or null. */
const findLive = async (customerId, purpose = PURPOSE_AUTH, tx = db) => {
  const [row] = await tx
    .select()
    .from(customerOtps)
    .where(
      and(
        eq(customerOtps.customerId, customerId),
        eq(customerOtps.purpose, purpose),
        isNull(customerOtps.consumedAt),
        gt(customerOtps.expiresAt, sql`now()`)
      )
    )
    .orderBy(desc(customerOtps.createdAt))
    .limit(1);
  return row || null;
};

const recordFailedAttempt = async (id, tx = db) => {
  const [row] = await tx
    .update(customerOtps)
    .set({ attempts: sql`${customerOtps.attempts} + 1` })
    .where(eq(customerOtps.id, id))
    .returning();
  return row || null;
};

/**
 * Guarded consume — `consumed_at IS NULL` makes it single-use even if two
 * requests arrive with the correct code at the same moment. Exactly one wins.
 */
const consume = async (id, tx = db) => {
  const [row] = await tx
    .update(customerOtps)
    .set({ consumedAt: sql`now()` })
    .where(and(eq(customerOtps.id, id), isNull(customerOtps.consumedAt)))
    .returning();
  return row || null;
};

/**
 * Rate-limit counters, computed from the table rather than an in-process
 * limiter. A per-process limiter resets on every deploy and multiplies by
 * worker count, so it does not bound anything.
 */
const countSince = async ({ customerId = null, requestIp = null, sinceMinutes }) => {
  const predicates = [sql`${customerOtps.createdAt} > now() - make_interval(mins => ${sinceMinutes})`];
  if (customerId !== null) predicates.push(eq(customerOtps.customerId, customerId));
  if (requestIp !== null) predicates.push(eq(customerOtps.requestIp, requestIp));

  const [row] = await db.select({ n: count() }).from(customerOtps).where(and(...predicates));
  return Number(row?.n ?? 0);
};

/**
 * Sends since midnight, for the daily SMS spend cap. Every send already writes
 * a row here, so the cap needs no separate counter.
 */
const countToday = async () => {
  const [row] = await db
    .select({ n: count() })
    .from(customerOtps)
    .where(sql`${customerOtps.createdAt} >= date_trunc('day', now())`);
  return Number(row?.n ?? 0);
};

const deleteExpiredBefore = async (cutoff) => {
  return db
    .delete(customerOtps)
    .where(sql`${customerOtps.expiresAt} < ${cutoff}`)
    .returning({ id: customerOtps.id });
};

module.exports = {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  PURPOSE_AUTH,
  PURPOSE_ACCOUNT_DELETION,
  hashCode,
  generateCode,
  invalidateLive,
  issue,
  findLive,
  recordFailedAttempt,
  consume,
  countSince,
  countToday,
  deleteExpiredBefore,
};
