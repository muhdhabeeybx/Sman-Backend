const { eq, and, or, ilike, desc, asc, count, inArray } = require("drizzle-orm");
const { db } = require("../config/db");
const {
  depots,
  depotStaff,
  depotProductCapacities,
  depotProductPrices,
  depotPriceHistory,
  products,
  staff,
} = require("../db/schema");
const { scopeCondition } = require("../lib/scopeFilter");

const findById = async (id, tx = db) => {
  const [row] = await tx.select().from(depots).where(eq(depots.id, id)).limit(1);
  return row || null;
};

const findByCode = async (code) => {
  const [row] = await db
    .select()
    .from(depots)
    .where(eq(depots.code, code))
    .limit(1);
  return row || null;
};

const findAll = async ({ search, status, scopeUser, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  // A location-scoped user only sees the depots they're assigned to — same
  // fail-closed rule already applied to /pfis.
  const scope = scopeCondition(scopeUser, { depotColumn: depots.id });
  if (scope) conditions.push(scope);

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(depots.name, pattern),
        ilike(depots.code, pattern),
        ilike(depots.city, pattern),
        ilike(depots.state, pattern)
      )
    );
  }

  if (status && status !== "all") {
    conditions.push(eq(depots.status, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(depots)
      .where(whereClause)
      // createdAt alone ties for depots seeded/created at the same instant,
      // and Postgres doesn't preserve tie order across queries — especially
      // after an UPDATE rewrites a row. id is a strictly increasing tiebreaker
      // that keeps the list order stable regardless of what gets edited.
      .orderBy(desc(depots.createdAt), asc(depots.id))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(depots)
      .where(whereClause),
  ]);

  return {
    depots: rows,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const create = async (data) => {
  const [row] = await db.insert(depots).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const [row] = await db
    .update(depots)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(depots.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(depots).where(eq(depots.id, id)).returning();
  return row || null;
};

// ─── Staff ───────────────────────────────────────────────────────────────────

const getStaff = async (depotId) => {
  const numericDepotId = parseInt(depotId, 10) || depotId;
  const rows = await db
    .select({
      id: depotStaff.id,
      adminId: depotStaff.staffId,
      firstName: staff.firstName,
      surname: staff.surname,
      email: staff.email,
    })
    .from(depotStaff)
    .leftJoin(staff, eq(depotStaff.staffId, staff.id))
    .where(eq(depotStaff.depotId, numericDepotId));

  return rows.map((r) => ({
    ...r,
    _id: String(r.adminId),
  }));
};

const setStaff = async (depotId, adminIds) => {
  const numericDepotId = parseInt(depotId, 10) || depotId;
  await db.delete(depotStaff).where(eq(depotStaff.depotId, numericDepotId));
  if (adminIds && adminIds.length > 0) {
    // Column is `staffId`, not `adminId`: an `adminId` key is silently dropped
    // by Drizzle, leaving the NOT NULL `staff_id` unset and the insert failing.
    await db
      .insert(depotStaff)
      .values(adminIds.map((adminId) => ({ depotId: numericDepotId, staffId: parseInt(adminId, 10) || adminId })));
  }
};

// ─── Product Capacities ──────────────────────────────────────────────────────

const getProductCapacities = async (depotId) => {
  const numericDepotId = parseInt(depotId, 10) || depotId;
  const rows = await db
    .select({
      id: depotProductCapacities.id,
      productId: depotProductCapacities.productId,
      capacity: depotProductCapacities.capacity,
      productName: products.name,
      productSku: products.sku,
      productCategory: products.category,
      productUnit: products.unit,
    })
    .from(depotProductCapacities)
    .leftJoin(products, eq(depotProductCapacities.productId, products.id))
    .where(eq(depotProductCapacities.depotId, numericDepotId));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    capacity: r.capacity,
    productName: r.productName,
    productSku: r.productSku,
    productCategory: r.productCategory,
    product: {
      _id: String(r.productId),
      id: String(r.productId),
      name: r.productName || "Unknown Product",
      sku: r.productSku || "",
      category: r.productCategory || "",
      unit: r.productUnit || "Liters",
    },
  }));
};

const upsertProductCapacity = async (depotId, productId, capacity) => {
  const numericProductId = parseInt(productId, 10) || productId;
  const [existing] = await db
    .select()
    .from(depotProductCapacities)
    .where(
      and(
        eq(depotProductCapacities.depotId, depotId),
        eq(depotProductCapacities.productId, numericProductId)
      )
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(depotProductCapacities)
      .set({ capacity, updatedAt: new Date() })
      .where(eq(depotProductCapacities.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(depotProductCapacities)
    .values({ depotId, productId: numericProductId, capacity })
    .returning();
  return row;
};

const setProductCapacities = async (depotId, capacitiesList) => {
  const numericDepotId = parseInt(depotId, 10) || depotId;
  if (!Array.isArray(capacitiesList)) return;

  const validProductIds = capacitiesList.map((pc) => parseInt(pc.product, 10) || pc.product);

  const existingCapacities = await db
    .select()
    .from(depotProductCapacities)
    .where(eq(depotProductCapacities.depotId, numericDepotId));

  for (const existing of existingCapacities) {
    if (!validProductIds.includes(existing.productId) && !validProductIds.includes(String(existing.productId))) {
      await db
        .delete(depotProductCapacities)
        .where(eq(depotProductCapacities.id, existing.id));
    }
  }

  for (const pc of capacitiesList) {
    await upsertProductCapacity(numericDepotId, pc.product, pc.capacity);
  }
};

// ─── Product Prices ──────────────────────────────────────────────────────────

const getProductPrices = async (depotId) => {
  const rows = await db
    .select({
      id: depotProductPrices.id,
      productId: depotProductPrices.productId,
      currentPrice: depotProductPrices.currentPrice,
      productName: products.name,
      productSku: products.sku,
      productCategory: products.category,
      productUnit: products.unit,
    })
    .from(depotProductPrices)
    .leftJoin(products, eq(depotProductPrices.productId, products.id))
    .where(eq(depotProductPrices.depotId, depotId));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    currentPrice: parseFloat(r.currentPrice),
    productName: r.productName,
    productSku: r.productSku,
    productCategory: r.productCategory,
    product: {
      _id: String(r.productId),
      id: String(r.productId),
      name: r.productName || "Unknown Product",
      sku: r.productSku || "",
      category: r.productCategory || "",
      unit: r.productUnit || "Liters",
    },
  }));
};

const getProductPrice = async (depotId, productId, tx = db) => {
  const [row] = await tx
    .select()
    .from(depotProductPrices)
    .where(
      and(
        eq(depotProductPrices.depotId, depotId),
        eq(depotProductPrices.productId, productId)
      )
    )
    .limit(1);
  return row || null;
};

const upsertProductPrice = async (depotId, productId, price) => {
  const [existing] = await db
    .select()
    .from(depotProductPrices)
    .where(
      and(
        eq(depotProductPrices.depotId, depotId),
        eq(depotProductPrices.productId, productId)
      )
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(depotProductPrices)
      .set({ currentPrice: price, updatedAt: new Date() })
      .where(eq(depotProductPrices.id, existing.id))
      .returning();
    // Add price history
    await db.insert(depotPriceHistory).values({
      depotProductPriceId: existing.id,
      price,
    });
    return row;
  }

  const [row] = await db
    .insert(depotProductPrices)
    .values({ depotId, productId, currentPrice: price })
    .returning();
  // Add price history
  await db.insert(depotPriceHistory).values({
    depotProductPriceId: row.id,
    price,
  });
  return row;
};

/**
 * Take every product off sale, everywhere: set all depot prices to 0.
 *
 * Zero is how this system records "we do not sell this here" — see
 * schemas/depot.schema.js. Doing it one depot at a time is thirteen dialogs
 * and thirteen chances to miss one, and a missed one leaves that depot quietly
 * still trading, which is exactly the state this action exists to prevent.
 *
 * One transaction, and every row keeps its history: the price it held before
 * is written to depot_price_history alongside the zero, so "what was PMS at
 * Calabar before we closed everything" is still answerable afterwards. A bulk
 * action that erased that would be worse than doing it by hand.
 *
 * Rows already at 0 are skipped — they are already off sale, and re-writing
 * them would put a meaningless 0-to-0 entry in the history of every one.
 *
 * @returns {{updated: number, skipped: number, before: Array}} what moved
 */
const zeroAllProductPrices = async () => {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: depotProductPrices.id,
        depotId: depotProductPrices.depotId,
        productId: depotProductPrices.productId,
        currentPrice: depotProductPrices.currentPrice,
      })
      .from(depotProductPrices)
      .for("update");

    const toZero = rows.filter((r) => Number(r.currentPrice) !== 0);
    if (!toZero.length) {
      return { updated: 0, skipped: rows.length, before: [] };
    }

    await tx
      .update(depotProductPrices)
      .set({ currentPrice: "0.00", updatedAt: new Date() })
      .where(inArray(depotProductPrices.id, toZero.map((r) => r.id)));

    await tx.insert(depotPriceHistory).values(
      toZero.map((r) => ({ depotProductPriceId: r.id, price: "0.00" })),
    );

    return {
      updated: toZero.length,
      skipped: rows.length - toZero.length,
      // What each one was, so the response and the audit row can say.
      before: toZero.map((r) => ({
        depotId: r.depotId,
        productId: r.productId,
        price: r.currentPrice,
      })),
    };
  });
};

const getPriceHistory = async (depotProductPriceId) => {
  return db
    .select()
    .from(depotPriceHistory)
    .where(eq(depotPriceHistory.depotProductPriceId, depotProductPriceId))
    .orderBy(desc(depotPriceHistory.setAt));
};

const updateSubaccountFields = async (id, data) => {
  const [row] = await db
    .update(depots)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(depots.id, id))
    .returning();
  return row || null;
};

module.exports = {
  findById,
  findByCode,
  findAll,
  create,
  update,
  deleteById,
  getStaff,
  setStaff,
  getProductCapacities,
  setProductCapacities,
  upsertProductCapacity,
  getProductPrices,
  getProductPrice,
  upsertProductPrice,
  zeroAllProductPrices,
  getPriceHistory,
  updateSubaccountFields,
};
