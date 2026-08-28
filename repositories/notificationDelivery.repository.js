const { eq, and, or, desc, count, sql, lt, lte, gte, ilike, inArray } = require("drizzle-orm");
const { db } = require("../config/db");
const { notificationDeliveries } = require("../db/schema");

/**
 * The outbound audit trail. Writes here must never break a send — this is
 * bookkeeping about a side effect, and losing the bookkeeping is strictly
 * better than losing the notification. Every writer is therefore wrapped so a
 * logging failure is reported and swallowed.
 */

const safe = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    console.error(`[notify] delivery log ${label} failed:`, err.message);
    return null;
  }
};

/** Open a delivery record before the provider is called. */
const start = async ({
  notificationId = null,
  principal = null,
  type,
  channel,
  destination = "",
  campaignId = null,
  recipientName = "",
}) => {
  return safe("start", async () => {
    const [row] = await db
      .insert(notificationDeliveries)
      .values({
        notificationId,
        campaignId: campaignId ? Number(campaignId) : null,
        principalType: principal?.type || null,
        staffId: principal?.type === "staff" ? Number(principal.id) : null,
        customerId: principal?.type === "customer" ? Number(principal.id) : null,
        // The name as it stood at send time. A contact has no principal to
        // look one up from later, and a customer may be renamed afterwards —
        // an audit log should say who was actually written to.
        recipientName: String(recipientName || "").slice(0, 255),
        type,
        channel,
        destination: String(destination || "").slice(0, 255),
        status: "pending",
        attempts: 0,
      })
      .returning();
    return row;
  });
};

const markSent = async (id, { providerMessageId = "", attempts = 1 } = {}) => {
  if (!id) return null;
  return safe("markSent", async () => {
    const [row] = await db
      .update(notificationDeliveries)
      .set({
        status: "sent",
        providerMessageId: String(providerMessageId || "").slice(0, 255),
        attempts,
        error: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, id))
      .returning();
    return row;
  });
};

const markFailed = async (id, error, { attempts = 1 } = {}) => {
  if (!id) return null;
  return safe("markFailed", async () => {
    const [row] = await db
      .update(notificationDeliveries)
      .set({
        status: "failed",
        attempts,
        // Provider errors can carry an entire HTML error page; a truncated
        // message is diagnosable, an unbounded one bloats every row.
        error: String(error || "").slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, id))
      .returning();
    return row;
  });
};

/**
 * Terminal, non-error outcomes. `skipped` = nothing to send to (no email on
 * file); `suppressed` = the recipient's own preferences said no. Recorded
 * rather than dropped, so "why didn't they get it?" always has an answer.
 */
const markResolved = async (id, status, reason = "") => {
  if (!id) return null;
  return safe("markResolved", async () => {
    const [row] = await db
      .update(notificationDeliveries)
      .set({ status, error: reason ? String(reason).slice(0, 2000) : null, updatedAt: new Date() })
      .where(eq(notificationDeliveries.id, id))
      .returning();
    return row;
  });
};

/** One-shot record for an outcome already known — no provider call was made. */
const record = async (fields, status, reason = "") => {
  return safe("record", async () => {
    const opened = await start(fields);
    if (!opened) return null;
    return markResolved(opened.id, status, reason);
  });
};

/**
 * A carrier delivery receipt, matched to the send it belongs to.
 *
 * This is the other half of "delivered or not". `sent` only ever meant "Termii
 * accepted it" — the handset may have been off, the number may have been
 * dead, the network may have refused it — and the log carried 12,084 rows
 * without a single `delivered` among them because nothing ever wrote one.
 *
 * Matched on the provider's own message id, which is why sms.service.js now
 * keeps it. A receipt for a message we have no record of is ignored rather
 * than inserted: it is far more likely to be a replay or another system's
 * traffic on a shared sender id than something worth inventing a row for.
 *
 * @param {string} providerMessageId
 * @param {"delivered"|"failed"} status
 * @param {string} providerStatus  the provider's own word, kept verbatim
 * @param {string} [error]         the carrier's reason, when it failed
 */
const recordReceipt = async (providerMessageId, status, providerStatus, error = "") => {
  const id = String(providerMessageId || "").trim();
  if (!id) return null;

  return safe("recordReceipt", async () => {
    const [row] = await db
      .update(notificationDeliveries)
      .set({
        status,
        providerStatus: String(providerStatus || "").slice(0, 64),
        error: error ? String(error).slice(0, 2000) : null,
        deliveredAt: status === "delivered" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveries.providerMessageId, id),
          // A receipt must never resurrect a send we already know was refused,
          // and Termii can deliver receipts out of order. Only a row we
          // believe went out is open to being updated by one.
          inArray(notificationDeliveries.status, ["pending", "sent"])
        )
      )
      .returning();
    return row || null;
  });
};

/** Support view: every channel attempt behind one inbox row. */
const findForNotification = async (notificationId) => {
  return db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.notificationId, Number(notificationId)))
    .orderBy(desc(notificationDeliveries.createdAt));
};

/**
 * Admin log screen, newest first.
 *
 * `from`/`to` and `search` were added because the log was 12,000 rows deep
 * behind two dropdowns and a fixed limit of 50 — enough to see that SMS was
 * failing, not enough to answer "did this customer get Tuesday's price list?".
 * `campaignId` narrows it to one broadcast.
 */
const findAll = async ({
  channel,
  status,
  type,
  campaignId,
  from,
  to,
  search,
  page = 1,
  limit = 50,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (channel && channel !== "all") conditions.push(eq(notificationDeliveries.channel, channel));
  if (status && status !== "all") conditions.push(eq(notificationDeliveries.status, status));
  if (type) conditions.push(eq(notificationDeliveries.type, type));
  if (campaignId) conditions.push(eq(notificationDeliveries.campaignId, Number(campaignId)));
  if (from) conditions.push(gte(notificationDeliveries.createdAt, new Date(from)));
  // `to` is a day, and a day includes the whole of it. Comparing against
  // midnight would silently exclude everything sent on the end date, which is
  // the day someone picking a range is most often asking about.
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(notificationDeliveries.createdAt, end));
  }
  if (search) {
    // Name or destination — "who did this go to?" is asked both ways, by the
    // person's name and by the number support was given over the phone.
    const pattern = `%${String(search).trim()}%`;
    conditions.push(
      or(
        ilike(notificationDeliveries.recipientName, pattern),
        ilike(notificationDeliveries.destination, pattern)
      )
    );
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(notificationDeliveries)
      .where(whereClause)
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(limitNum)
      .offset(offset),
    db.select({ total: count() }).from(notificationDeliveries).where(whereClause),
  ]);

  return {
    rows,
    pagination: {
      total: Number(total),
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(Number(total) / limitNum) || 1,
    },
  };
};

/**
 * Channel health over a window — the number that tells an operator Termii has
 * been swallowing messages since lunchtime.
 */
const statsSince = async (since) => {
  const rows = await db
    .select({
      channel: notificationDeliveries.channel,
      status: notificationDeliveries.status,
      total: count(),
    })
    .from(notificationDeliveries)
    .where(gte(notificationDeliveries.createdAt, since))
    .groupBy(notificationDeliveries.channel, notificationDeliveries.status);

  const byChannel = {};
  for (const row of rows) {
    byChannel[row.channel] ||= { sent: 0, failed: 0, skipped: 0, suppressed: 0, pending: 0, delivered: 0 };
    byChannel[row.channel][row.status] = Number(row.total);
  }

  for (const channel of Object.keys(byChannel)) {
    const c = byChannel[channel];
    const attempted = c.sent + c.delivered + c.failed;
    // Only real attempts count: a suppressed send is an opt-out working, not
    // a delivery failure, and folding it in would hide genuine outages.
    c.attempted = attempted;
    c.successRate = attempted > 0 ? Math.round(((c.sent + c.delivered) / attempted) * 1000) / 10 : null;
  }

  return byChannel;
};

const purgeOlderThan = async (cutoff) => {
  const rows = await db
    .delete(notificationDeliveries)
    .where(lt(notificationDeliveries.createdAt, cutoff))
    .returning({ id: notificationDeliveries.id });
  return rows.length;
};

module.exports = {
  start,
  markSent,
  markFailed,
  markResolved,
  record,
  recordReceipt,
  findForNotification,
  findAll,
  statsSince,
  purgeOlderThan,
};
