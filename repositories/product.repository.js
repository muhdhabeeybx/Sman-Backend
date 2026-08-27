const { eq, and, or, ilike, desc, count, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { products } = require("../db/schema");

const findById = async (id) => {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row || null;
};

const findBySku = async (sku) => {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.sku, sku.toUpperCase()))
    .limit(1);
  return row || null;
};

const findAll = async ({ search, productType, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  if (productType) {
    conditions.push(eq(products.productType, productType));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(products.name, pattern),
        ilike(products.sku, pattern),
        ilike(products.category, pattern)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(desc(products.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(products)
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

const create = async (data) => {
  const insertData = { ...data };
  if (insertData.sku) insertData.sku = insertData.sku.toUpperCase();
  const [row] = await db.insert(products).values(insertData).returning();
  return row;
};

const update = async (id, data) => {
  const updateData = { ...data, updatedAt: new Date() };
  if (updateData.sku) updateData.sku = updateData.sku.toUpperCase();
  const [row] = await db
    .update(products)
    .set(updateData)
    .where(eq(products.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(products).where(eq(products.id, id)).returning();
  return row || null;
};

const countCategories = async () => {
  const [{ count: total }] = await db
    .select({ count: sql`COUNT(DISTINCT ${products.category})` })
    .from(products);
  return total;
};

module.exports = {
  findById,
  findBySku,
  findAll,
  create,
  update,
  deleteById,
  countCategories,
};
