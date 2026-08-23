const { eq, and, or, ilike, desc, count } = require("drizzle-orm");
const { db } = require("../config/db");
const { dangoteProducts } = require("../db/schema");

const findById = async (id) => {
  const [row] = await db.select().from(dangoteProducts).where(eq(dangoteProducts.id, id)).limit(1);
  return row || null;
};

const findAll = async ({ search, status, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  if (status && status !== "all") {
    conditions.push(eq(dangoteProducts.status, status));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(dangoteProducts.name, pattern),
        ilike(dangoteProducts.sku, pattern),
        ilike(dangoteProducts.category, pattern)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(dangoteProducts)
      .where(whereClause)
      .orderBy(desc(dangoteProducts.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(dangoteProducts)
      .where(whereClause),
  ]);

  return {
    products: rows,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const findAllActive = async () => {
  const rows = await db
    .select()
    .from(dangoteProducts)
    .where(eq(dangoteProducts.status, "Active"))
    .orderBy(dangoteProducts.name);
  return rows;
};

const create = async (data) => {
  const [row] = await db.insert(dangoteProducts).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const updateData = { ...data, updatedAt: new Date() };
  const [row] = await db
    .update(dangoteProducts)
    .set(updateData)
    .where(eq(dangoteProducts.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(dangoteProducts).where(eq(dangoteProducts.id, id)).returning();
  return row || null;
};

module.exports = {
  findById,
  findAll,
  findAllActive,
  create,
  update,
  deleteById,
};
