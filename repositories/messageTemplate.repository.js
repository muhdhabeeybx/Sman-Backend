const { eq, ne, and, sql, desc } = require("drizzle-orm");
const { db } = require("../config/db");
const { messageTemplates } = require("../db/schema");

const findAll = async () => {
  return db.select().from(messageTemplates).orderBy(desc(messageTemplates.updatedAt));
};

const findById = async (id) => {
  const [row] = await db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).limit(1);
  return row || null;
};

const findByName = async (name, excludeId = null) => {
  const conditions = [sql`lower(${messageTemplates.name}) = lower(${name})`];
  if (excludeId) conditions.push(ne(messageTemplates.id, excludeId));
  const [row] = await db.select().from(messageTemplates).where(and(...conditions)).limit(1);
  return row || null;
};

const create = async (data) => {
  const [row] = await db.insert(messageTemplates).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const [row] = await db
    .update(messageTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(messageTemplates.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(messageTemplates).where(eq(messageTemplates.id, id)).returning();
  return row || null;
};

module.exports = { findAll, findById, findByName, create, update, deleteById };
