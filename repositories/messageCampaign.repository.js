const { eq, desc, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { messageCampaigns } = require("../db/schema");

/**
 * Broadcasts, as things that happened rather than as loose delivery rows.
 *
 * Every write here is wrapped the way notificationDelivery.repository wraps
 * its own, and for the same reason: this is bookkeeping ABOUT a send. A
 * campaign row that fails to insert must not stop the messages going out —
 * losing the record is bad, losing the broadcast is worse.
 */

const safe = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    console.error(`[campaign] ${label} failed:`, err.message);
    return null;
  }
};

/** Opened before the first message goes out, so deliveries have a parent. */
const start = async ({
  title,
  body,
  channels = [],
  audience = "",
  audienceLabel = "",
  recipientCount = 0,
  smsSegments = 0,
  balanceBefore = null,
  balanceCurrency = "",
  sentBy = null,
}) =>
  safe("start", async () => {
    const [row] = await db
      .insert(messageCampaigns)
      .values({
        title: String(title || "").slice(0, 255),
        body: String(body || ""),
        channels,
        audience: String(audience || "").slice(0, 64),
        audienceLabel: String(audienceLabel || "").slice(0, 255),
        recipientCount,
        smsSegments,
        balanceBefore,
        balanceCurrency: String(balanceCurrency || "").slice(0, 10),
        sentBy: sentBy ? Number(sentBy) : null,
      })
      .returning();
    return row;
  });

/** Closed once the fan-out has finished and the wallet can be re-read. */
const complete = async (id, { balanceAfter = null, recipientCount } = {}) => {
  if (!id) return null;
  return safe("complete", async () => {
    const [row] = await db
      .update(messageCampaigns)
      .set({
        balanceAfter,
        // The real number of recipients the engine resolved, which can differ
        // from the estimate the composer sent — a suspended customer or a
        // deleted contact drops out between the two.
        ...(recipientCount === undefined ? {} : { recipientCount }),
        completedAt: new Date(),
      })
      .where(eq(messageCampaigns.id, Number(id)))
      .returning();
    return row || null;
  });
};

/**
 * The campaign list, each with its delivery outcomes counted.
 *
 * The counts are aggregated in SQL rather than by loading the rows: a single
 * price blast is a few thousand delivery rows, and the list shows twenty
 * campaigns at a time.
 */
const findAll = async ({ page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const [rowsResult, totalResult] = await Promise.all([
    db.execute(sql`
      SELECT
        mc.*,
        s.first_name AS "sentByFirstName",
        s.surname    AS "sentBySurname",
        COALESCE(d.total, 0)::int      AS "deliveryTotal",
        COALESCE(d.sent, 0)::int       AS "deliverySent",
        COALESCE(d.delivered, 0)::int  AS "deliveryDelivered",
        COALESCE(d.failed, 0)::int     AS "deliveryFailed",
        COALESCE(d.skipped, 0)::int    AS "deliverySkipped"
      FROM message_campaigns mc
      LEFT JOIN staff s ON s.id = mc.sent_by
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE nd.status = 'sent') AS sent,
          COUNT(*) FILTER (WHERE nd.status = 'delivered') AS delivered,
          COUNT(*) FILTER (WHERE nd.status = 'failed') AS failed,
          COUNT(*) FILTER (WHERE nd.status IN ('skipped', 'suppressed')) AS skipped
        FROM notification_deliveries nd
        WHERE nd.campaign_id = mc.id
      ) d ON TRUE
      ORDER BY mc.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `),
    db.execute(sql`SELECT COUNT(*)::int AS total FROM message_campaigns`),
  ]);

  const rows = rowsResult.rows ?? rowsResult;
  const total = Number((totalResult.rows ?? totalResult)[0]?.total || 0);

  return {
    campaigns: rows.map(shape),
    pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) || 1, limit: limitNum },
  };
};

const findById = async (id) => {
  const result = await db.execute(sql`
    SELECT
      mc.*,
      s.first_name AS "sentByFirstName",
      s.surname    AS "sentBySurname",
      COALESCE(d.total, 0)::int      AS "deliveryTotal",
      COALESCE(d.sent, 0)::int       AS "deliverySent",
      COALESCE(d.delivered, 0)::int  AS "deliveryDelivered",
      COALESCE(d.failed, 0)::int     AS "deliveryFailed",
      COALESCE(d.skipped, 0)::int    AS "deliverySkipped"
    FROM message_campaigns mc
    LEFT JOIN staff s ON s.id = mc.sent_by
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE nd.status = 'sent') AS sent,
        COUNT(*) FILTER (WHERE nd.status = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE nd.status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE nd.status IN ('skipped', 'suppressed')) AS skipped
      FROM notification_deliveries nd
      WHERE nd.campaign_id = mc.id
    ) d ON TRUE
    WHERE mc.id = ${Number(id)}
  `);
  const row = (result.rows ?? result)[0];
  return row ? shape(row) : null;
};

/**
 * Numbers out of the database and into the shape the page reads.
 *
 * `spent` is the honest figure — what Termii's own wallet moved by — and it is
 * null rather than 0 when either reading is missing, because "we could not
 * read the balance" and "this campaign cost nothing" are different facts and
 * showing the second for the first would be a lie about money.
 */
const shape = (row) => {
  const before = row.balance_before === null ? null : Number(row.balance_before);
  const after = row.balance_after === null ? null : Number(row.balance_after);
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    channels: row.channels || [],
    audience: row.audience,
    audienceLabel: row.audience_label,
    recipientCount: Number(row.recipient_count || 0),
    smsSegments: Number(row.sms_segments || 0),
    balanceBefore: before,
    balanceAfter: after,
    balanceCurrency: row.balance_currency || "",
    spent: before !== null && after !== null ? Math.round((before - after) * 100) / 100 : null,
    sentBy: [row.sentByFirstName, row.sentBySurname].filter(Boolean).join(" ") || "",
    createdAt: row.created_at,
    completedAt: row.completed_at,
    deliveries: {
      total: Number(row.deliveryTotal || 0),
      sent: Number(row.deliverySent || 0),
      delivered: Number(row.deliveryDelivered || 0),
      failed: Number(row.deliveryFailed || 0),
      skipped: Number(row.deliverySkipped || 0),
    },
  };
};

module.exports = { start, complete, findAll, findById };
