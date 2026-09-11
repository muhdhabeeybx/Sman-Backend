const { eq, inArray } = require("drizzle-orm");
const { db } = require("../config/db");
const { deliveryBatches, deliveryCycleClosures } = require("../db/schema");

/**
 * Closing and reopening a delivery batch.
 *
 * A batch is every `delivery_inventory` row sharing an `allocation_code` —
 * there is no batch row to update, so the code itself is the key here, and the
 * absence of a row means the batch is active. See
 * db/migrations/0028_delivery_batch_status.sql.
 */

/**
 * The register groups by the trimmed, upper-cased code, so this table is keyed
 * the same way. "pfi-40b" and "PFI-40B " have always been one batch on screen
 * and must not become two rows here.
 */
const normalise = (code) => String(code || "").trim().toUpperCase();

/** Every batch that is not active, as { CODE: row }. */
const findStatuses = async () => {
  const rows = await db.select().from(deliveryBatches);
  const byCode = {};
  for (const row of rows) byCode[row.code] = row;
  return byCode;
};

const findByCode = async (code) => {
  const [row] = await db
    .select()
    .from(deliveryBatches)
    .where(eq(deliveryBatches.code, normalise(code)))
    .limit(1);
  return row || null;
};

/**
 * Close a batch, or reopen it.
 *
 * Reopening clears who closed it and when rather than keeping the last close
 * around: the batch is running again, and a closed_by on an active batch reads
 * as though somebody closed it and it came back on its own. The audit trail
 * for who did what lives in audit events, not in the current-state row.
 *
 * Upserts, because a batch has no row until the first time it is closed.
 */
const setStatus = async (code, { status, staffName = "", note = "" }) => {
  const key = normalise(code);
  const closing = status === "completed";
  const values = {
    code: key,
    status,
    closedAt: closing ? new Date() : null,
    closedBy: closing ? staffName || "" : "",
    note: closing ? note || "" : "",
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(deliveryBatches)
    .values(values)
    .onConflictDoUpdate({
      target: deliveryBatches.code,
      set: {
        status: values.status,
        closedAt: values.closedAt,
        closedBy: values.closedBy,
        note: values.note,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return row;
};

/** Used when a batch is deleted outright — its status has nothing left to describe. */
const removeByCodes = async (codes) => {
  const keys = [...new Set((codes || []).map(normalise).filter(Boolean))];
  if (!keys.length) return 0;
  const rows = await db
    .delete(deliveryBatches)
    .where(inArray(deliveryBatches.code, keys))
    .returning();
  return rows.length;
};

// ── Filling-station delivery cycles ─────────────────────────────────────────
//
// The same act on the row the filling stations register is about: a loading
// with the sales that answer to it. Kept in this file because "closing a thing
// in delivery" is one idea; kept in its own table because a cycle and a batch
// are identified by different keys. See migration 0029.

/**
 * A cycle key is the register's own group key and is used verbatim — not
 * normalised the way a batch code is. It is machine-made ("loading:412"), and
 * upper-casing it would break the "sale:" keys, which carry a location the
 * user typed.
 */
const findCycleClosures = async () => {
  const rows = await db.select().from(deliveryCycleClosures);
  const byKey = {};
  for (const row of rows) byKey[row.cycleKey] = row;
  return byKey;
};

const setCycleStatus = async (cycleKey, { status, staffName = "", note = "" }) => {
  const key = String(cycleKey || "").trim();
  const closing = status === "completed";
  const values = {
    cycleKey: key,
    status,
    closedAt: closing ? new Date() : null,
    closedBy: closing ? staffName || "" : "",
    note: closing ? note || "" : "",
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(deliveryCycleClosures)
    .values(values)
    .onConflictDoUpdate({
      target: deliveryCycleClosures.cycleKey,
      set: {
        status: values.status,
        closedAt: values.closedAt,
        closedBy: values.closedBy,
        note: values.note,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return row;
};

module.exports = {
  normalise,
  findStatuses,
  findByCode,
  setStatus,
  removeByCodes,
  findCycleClosures,
  setCycleStatus,
};
