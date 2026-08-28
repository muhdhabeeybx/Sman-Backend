const { eq, and, or, ilike, desc, count, gte, lte, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { deposits, customers, staff } = require("../db/schema");
const { scopeCondition } = require("../lib/scopeFilter");

const findById = async (id) => {
  const [row] = await db.select().from(deposits).where(eq(deposits.id, id)).limit(1);
  return row || null;
};

const findByIdFull = async (id) => {
  const [row] = await db
    .select({
      id: deposits.id,
      customerId: deposits.customerId,
      amount: deposits.amount,
      type: deposits.type,
      description: deposits.description,
      reference: deposits.reference,
      recordedBy: deposits.recordedBy,
      balanceAfter: deposits.balanceAfter,
      paystackDetails: deposits.paystackDetails,
      createdAt: deposits.createdAt,
      // When the money actually reached the bank, per the statement. Null where
      // no statement backs the credit — see migration 0017.
      depositDate: deposits.depositDate,
      updatedAt: deposits.updatedAt,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerCompanyName: customers.companyName,
      recorderFirstName: staff.firstName,
      recorderSurname: staff.surname,
      recorderEmail: staff.email,
    })
    .from(deposits)
    .leftJoin(customers, eq(deposits.customerId, customers.id))
    .leftJoin(staff, eq(deposits.recordedBy, staff.id))
    .where(eq(deposits.id, id))
    .limit(1);
  return row || null;
};

const findByReference = async (reference) => {
  const [row] = await db
    .select()
    .from(deposits)
    .where(eq(deposits.reference, reference))
    .limit(1);
  return row || null;
};

const findAll = async ({ customer, pfiId, page = 1, limit = 50, type = "credit", scopeUser } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(5000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  // depotId/pfiId are only set where a deposit is unambiguously attributable
  // (see db/schema/deposit.js) — a deposit split across several orders via
  // order_deposit_allocations can't be pinned to one depot/PFI, so most rows
  // stay null and are invisible to a scoped user until attributed some other
  // way. Known v1 gap, not a bug.
  const scope = scopeCondition(scopeUser, { depotColumn: deposits.depotId, pfiColumn: deposits.pfiId });
  if (scope) conditions.push(scope);
  if (customer) conditions.push(eq(deposits.customerId, customer));
  if (pfiId) conditions.push(eq(deposits.pfiId, pfiId));
  if (type) conditions.push(eq(deposits.type, type));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: deposits.id,
        customerId: deposits.customerId,
        amount: deposits.amount,
        type: deposits.type,
        description: deposits.description,
        reference: deposits.reference,
        recordedBy: deposits.recordedBy,
        balanceAfter: deposits.balanceAfter,
        paystackDetails: deposits.paystackDetails,
        createdAt: deposits.createdAt,
        // When the money actually reached the bank, per the statement. Null where
        // no statement backs the credit — see migration 0017.
        depositDate: deposits.depositDate,
        updatedAt: deposits.updatedAt,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerCompanyName: customers.companyName,
        recorderFirstName: staff.firstName,
        recorderSurname: staff.surname,
      })
      .from(deposits)
      .leftJoin(customers, eq(deposits.customerId, customers.id))
      .leftJoin(staff, eq(deposits.recordedBy, staff.id))
      .where(whereClause)
      .orderBy(desc(deposits.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(deposits)
      .where(whereClause),
  ]);

  return {
    deposits: rows,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * One customer's wallet ledger — both credits and debits, newest first, with an
 * optional created-at window. Powers the portal's transaction-history screen.
 * Scoped to the caller by customerId; only the columns the app renders are
 * projected (no staff recorder, no paystack payload).
 */
const findCustomerHistory = async ({ customerId, page = 1, limit = 50, dateFrom, dateTo } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(deposits.customerId, customerId)];
  if (dateFrom) conditions.push(gte(deposits.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(deposits.createdAt, dateTo));
  const whereClause = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: deposits.id,
        type: deposits.type,
        amount: deposits.amount,
        reference: deposits.reference,
        description: deposits.description,
        balanceAfter: deposits.balanceAfter,
        createdAt: deposits.createdAt,
        // When the money actually reached the bank, per the statement. Null where
        // no statement backs the credit — see migration 0017.
        depositDate: deposits.depositDate,
      })
      .from(deposits)
      .where(whereClause)
      .orderBy(desc(deposits.createdAt))
      .limit(limitNum)
      .offset(offset),
    db.select({ total: count() }).from(deposits).where(whereClause),
  ]);

  return {
    rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const create = async (data, tx = db) => {
  const [row] = await tx.insert(deposits).values(data).returning();
  return row;
};

const countByCustomer = async (customerId) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(deposits)
    .where(eq(deposits.customerId, customerId));
  return total;
};

module.exports = {
  findById,
  findByIdFull,
  findByReference,
  findAll,
  findCustomerHistory,
  create,
  countByCustomer,
};
