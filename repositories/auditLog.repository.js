const { eq, and, asc } = require("drizzle-orm");
const { db } = require("../config/db");
const { auditLogs } = require("../db/schema");

const ACTOR_TYPES = Object.freeze(["staff", "customer", "system"]);

/**
 * Normalise an actor descriptor to the exclusive-arc columns the CHECK
 * enforces. Throwing here (rather than letting the DB reject it) turns a
 * caller mistake into a clear message instead of a 23514.
 *
 * @param {{type: "staff"|"customer"|"system", staffId?: number, customerId?: number}} actor
 */
function actorColumns(actor) {
  if (!actor || !ACTOR_TYPES.includes(actor.type)) {
    throw new TypeError(`auditLog: actor.type must be one of ${ACTOR_TYPES.join("|")}`);
  }
  if (actor.type === "staff") {
    if (!actor.staffId) throw new TypeError("auditLog: staff actor requires staffId");
    return { actorType: "staff", actorStaffId: actor.staffId, actorCustomerId: null };
  }
  if (actor.type === "customer") {
    if (!actor.customerId) throw new TypeError("auditLog: customer actor requires customerId");
    return { actorType: "customer", actorStaffId: null, actorCustomerId: actor.customerId };
  }
  return { actorType: "system", actorStaffId: null, actorCustomerId: null };
}

/**
 * Append one audit event. Takes a tx so it commits atomically with the state
 * change it records — a transition that persisted without its audit row would
 * make the log a liar.
 *
 * @param {object} event
 * @param {string} event.entityType   'order' | 'customer' | …
 * @param {number} event.entityId
 * @param {string} event.action       human label, e.g. 'order.released'
 * @param {string|null} [event.prevState]
 * @param {string|null} [event.newState]  the single source of a timeline entry
 * @param {object} event.actor        { type, staffId?, customerId? }
 * @param {object} [event.metadata]
 * @param {string|null} [event.ipAddress]
 * @param {string|null} [event.userAgent]
 */
const record = async (event, tx = db) => {
  const [row] = await tx
    .insert(auditLogs)
    .values({
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      prevState: event.prevState ?? null,
      newState: event.newState ?? null,
      ...actorColumns(event.actor),
      metadata: event.metadata ?? null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
    })
    .returning();
  return row;
};

/**
 * Append many audit events in one round trip — the batched sibling of
 * `record`, for a loop that would otherwise write one row per iteration
 * (e.g. a ticket generated per truck in a multi-truck request).
 */
const recordMany = async (events, tx = db) => {
  if (!events.length) return [];
  return tx
    .insert(auditLogs)
    .values(
      events.map((event) => ({
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        prevState: event.prevState ?? null,
        newState: event.newState ?? null,
        ...actorColumns(event.actor),
        metadata: event.metadata ?? null,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      })),
    )
    .returning();
};

/** Every event for one entity, oldest first — the raw material for a timeline. */
const findByEntity = async (entityType, entityId) => {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(asc(auditLogs.createdAt));
};

/** State-changing events only — the projected pipeline timeline. */
const findStateTimeline = async (entityType, entityId) => {
  const rows = await findByEntity(entityType, entityId);
  return rows.filter((r) => r.newState !== null);
};

module.exports = { ACTOR_TYPES, actorColumns, record, recordMany, findByEntity, findStateTimeline };
