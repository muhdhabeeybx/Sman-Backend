const { eq, and, or, ilike, desc, asc, count, sql, gte, lte } = require("drizzle-orm");
const { db } = require("../config/db");
const { pfis, depots, products, staff } = require("../db/schema");
const { lpgStations } = require("../db/schema/lpgStation");
const { scopeCondition } = require("../lib/scopeFilter");

/**
 * A batch's location, resolved rather than trusted.
 *
 * `pfis.location_name` is a denormalised copy written when a PFI is created,
 * and it is not reliably maintained — five active batches carry a blank one
 * against a perfectly good location_id, which left every consumer showing no
 * location at all (the daily-report form's "pick a PFI and the location
 * fills in" did nothing on exactly those batches).
 *
 * The foreign key is the truth, so this prefers the joined name and only
 * falls back to the stored copy for a row whose location was recorded as
 * free text with no id behind it.
 */
const LOCATION_NAME = sql`
  COALESCE(
    NULLIF(${depots.name}, ''),
    NULLIF(${lpgStations.name}, ''),
    NULLIF(${pfis.locationName}, ''),
    ''
  )
`;

const findById = async (id) => {
  const numericId = parseInt(id, 10) || id;
  const [row] = await db
    .select({ pfi: pfis, resolvedLocationName: LOCATION_NAME })
    .from(pfis)
    .leftJoin(depots, eq(pfis.locationId, depots.id))
    .leftJoin(lpgStations, eq(pfis.lpgStationId, lpgStations.id))
    .where(eq(pfis.id, numericId))
    .limit(1);
  if (!row) return null;
  return {
    ...row.pfi,
    locationName: row.resolvedLocationName || row.pfi.locationName || "",
    _id: String(row.pfi.id),
  };
};

const findByNumber = async (pfiNumber) => {
  const [row] = await db
    .select()
    .from(pfis)
    .where(eq(pfis.pfiNumber, pfiNumber))
    .limit(1);
  if (!row) return null;
  return { ...row, _id: String(row.id) };
};

const findAll = async ({ search, status, location, type, scopeUser, page = 1, limit = 100 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  const scope = scopeCondition(scopeUser, {
    depotColumn: pfis.locationId,
    lpgStationColumn: pfis.lpgStationId,
    pfiColumn: pfis.id,
  });
  if (scope) conditions.push(scope);

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(pfis.pfiNumber, pattern),
        ilike(pfis.description, pattern),
        ilike(pfis.locationName, pattern),
        ilike(pfis.productName, pattern)
      )
    );
  }

  if (status && status !== "all") {
    conditions.push(eq(pfis.status, status));
  }

  if (type && type !== "all") {
    conditions.push(eq(pfis.pfiType, type));
  }

  if (location) {
    const numericLocation = parseInt(location, 10) || location;
    conditions.push(eq(pfis.locationId, numericLocation));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ pfi: pfis, resolvedLocationName: LOCATION_NAME })
      .from(pfis)
      .leftJoin(depots, eq(pfis.locationId, depots.id))
      .leftJoin(lpgStations, eq(pfis.lpgStationId, lpgStations.id))
      .where(whereClause)
      .orderBy(asc(pfis.status), desc(pfis.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(pfis)
      .where(whereClause),
  ]);

  const enrichedRows = rows.map(({ pfi, resolvedLocationName }) => ({
    ...pfi,
    locationName: resolvedLocationName || pfi.locationName || "",
    _id: String(pfi.id),
  }));

  return {
    pfis: enrichedRows,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const findActiveByDepotAndProduct = async (depotId, productId) => {
  return db
    .select()
    .from(pfis)
    .where(
      and(
        eq(pfis.locationId, depotId),
        eq(pfis.productId, productId),
        eq(pfis.status, "active")
      )
    )
    .orderBy(asc(pfis.createdAt));
};

const create = async (data) => {
  const [row] = await db.insert(pfis).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const [row] = await db
    .update(pfis)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pfis.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(pfis).where(eq(pfis.id, id)).returning();
  return row || null;
};

const reserveStock = async (pfiId, quantity, tx = db) => {
  const [row] = await tx
    .update(pfis)
    .set({
      soldQtyLitres: sql`${pfis.soldQtyLitres} + ${quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pfis.id, pfiId),
        eq(pfis.status, "active"),
        sql`(${pfis.startingQtyLitres} - ${pfis.soldQtyLitres}) >= ${quantity}`
      )
    )
    .returning();
  return row || null;
};

const releaseStock = async (pfiId, quantity, tx = db) => {
  const [pfi] = await tx
    .select()
    .from(pfis)
    .where(eq(pfis.id, pfiId))
    .for("update")
    .limit(1);
  if (!pfi) return null;

  const wasFinished = pfi.status === "finished";

  const [row] = await tx
    .update(pfis)
    .set({
      soldQtyLitres: sql`GREATEST(${pfis.soldQtyLitres} - ${quantity}, 0)`,
      status: wasFinished ? "active" : pfi.status,
      updatedAt: new Date(),
    })
    .where(eq(pfis.id, pfiId))
    .returning();

  return row || null;
};

const markFinishedIfComplete = async (pfiId, tx = db) => {
  const [row] = await tx
    .update(pfis)
    .set({ status: "finished", updatedAt: new Date() })
    .where(
      and(
        eq(pfis.id, pfiId),
        sql`${pfis.soldQtyLitres} >= ${pfis.startingQtyLitres}`
      )
    )
    .returning();
  return row || null;
};

module.exports = {
  findById,
  findByNumber,
  findAll,
  findActiveByDepotAndProduct,
  create,
  update,
  deleteById,
  reserveStock,
  releaseStock,
  markFinishedIfComplete,
};
