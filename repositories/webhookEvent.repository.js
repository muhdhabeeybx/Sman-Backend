const { eq, and, desc, count } = require("drizzle-orm");
const { db } = require("../config/db");
const { webhookEvents } = require("../db/schema");

const findById = async (id) => {
  const [row] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, id))
    .limit(1);
  return row || null;
};

const findAll = async ({ status, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const whereClause = status
    ? eq(webhookEvents.status, status)
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(webhookEvents)
      .where(whereClause)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(webhookEvents)
      .where(whereClause),
  ]);

  return {
    events: rows,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const create = async (data) => {
  const [row] = await db.insert(webhookEvents).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const [row] = await db
    .update(webhookEvents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(webhookEvents.id, id))
    .returning();
  return row || null;
};

module.exports = {
  findById,
  findAll,
  create,
  update,
};
