const { eq, and, asc, count, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { orderTrucks } = require("../db/schema");

/**
 * order_trucks — one row per truck LOAD on an order (distinct from the fleet
 * `trucks` vehicle master). Every function threads an optional `tx` so a load
 * can be created/updated inside the same transaction as the order transition
 * that owns it (release, gate-in, gate-out).
 */

const create = async (data, tx = db) => {
  const [row] = await tx.insert(orderTrucks).values(data).returning();
  return row;
};

const findById = async (id, tx = db) => {
  const [row] = await tx.select().from(orderTrucks).where(eq(orderTrucks.id, id)).limit(1);
  return row || null;
};

/** All loads on an order, in allocation order (truck 1, 2, 3 …). */
const findByOrder = async (orderId, tx = db) => {
  return tx
    .select()
    .from(orderTrucks)
    .where(eq(orderTrucks.orderId, orderId))
    .orderBy(asc(orderTrucks.truckIndex));
};

const update = async (id, data, tx = db) => {
  const [row] = await tx
    .update(orderTrucks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orderTrucks.id, id))
    .returning();
  return row || null;
};

/** How many loads on an order sit in a given status — drives the gate transitions. */
const countByOrderAndStatus = async (orderId, status, tx = db) => {
  const [row] = await tx
    .select({ n: count() })
    .from(orderTrucks)
    .where(and(eq(orderTrucks.orderId, orderId), eq(orderTrucks.status, status)));
  return Number(row?.n || 0);
};

const countByOrder = async (orderId, tx = db) => {
  const [row] = await tx
    .select({ n: count() })
    .from(orderTrucks)
    .where(eq(orderTrucks.orderId, orderId));
  return Number(row?.n || 0);
};

/**
 * How many loads on an order are still in the depot — i.e. have NOT gated out.
 * The order completes only when this hits zero (the last truck has physically
 * left). A `loaded` truck still counts: it is loaded but has not departed, so a
 * multi-truck order must not complete the moment the first truck exits.
 */
const countRemainingByOrder = async (orderId, tx = db) => {
  const [row] = await tx
    .select({ n: count() })
    .from(orderTrucks)
    .where(
      and(
        eq(orderTrucks.orderId, orderId),
        sql`${orderTrucks.status} <> 'gated_out'`
      )
    );
  return Number(row?.n || 0);
};

const deleteByOrder = async (orderId, tx = db) => {
  await tx.delete(orderTrucks).where(eq(orderTrucks.orderId, orderId));
};

/** Total quantity across every load on the order, ticketed or not. */
const sumQuantityByOrder = async (orderId, tx = db) => {
  const [row] = await tx
    .select({ total: sql`COALESCE(SUM(${orderTrucks.quantity}), 0)` })
    .from(orderTrucks)
    .where(eq(orderTrucks.orderId, orderId));
  return Number(row?.total || 0);
};

module.exports = {
  create,
  findById,
  findByOrder,
  update,
  deleteByOrder,
  countByOrderAndStatus,
  countByOrder,
  countRemainingByOrder,
  sumQuantityByOrder,
};
