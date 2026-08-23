const { eq, and, or, ilike, desc, count, sql, between } = require("drizzle-orm");
const { db } = require("../config/db");
const { generateOrderReference } = require("../utils/helpers");
const {
  commissions,
  depotProductCommissions,
  orders,
  customers,
  depots,
  products,
  orderTrucks,
  pfis,
  staff,
} = require("../db/schema");

// ─── Commission Rates (depot × product) ─────────────────────────────────────

const getRate = async (depotId, productId, tx = db) => {
  const [row] = await tx
    .select()
    .from(depotProductCommissions)
    .where(
      and(
        eq(depotProductCommissions.depotId, depotId),
        eq(depotProductCommissions.productId, productId)
      )
    )
    .limit(1);
  return row || null;
};

const getRates = async ({ depotId, page = 1, limit = 200 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (depotId) conditions.push(eq(depotProductCommissions.depotId, depotId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: depotProductCommissions.id,
      depotId: depotProductCommissions.depotId,
      depotName: depots.name,
      depotCity: depots.city,
      depotState: depots.state,
      productId: depotProductCommissions.productId,
      productName: products.name,
      productSku: products.sku,
      commissionRate: depotProductCommissions.commissionRate,
      createdAt: depotProductCommissions.createdAt,
      updatedAt: depotProductCommissions.updatedAt,
    })
    .from(depotProductCommissions)
    .leftJoin(depots, eq(depotProductCommissions.depotId, depots.id))
    .leftJoin(products, eq(depotProductCommissions.productId, products.id))
    .where(whereClause)
    .orderBy(depots.name, products.name)
    .limit(limitNum)
    .offset(offset);

  return rows.map((r) => ({
    ...r,
    commissionRate: parseFloat(r.commissionRate),
  }));
};

const upsertRate = async (depotId, productId, commissionRate) => {
  const [existing] = await db
    .select()
    .from(depotProductCommissions)
    .where(
      and(
        eq(depotProductCommissions.depotId, depotId),
        eq(depotProductCommissions.productId, productId)
      )
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(depotProductCommissions)
      .set({ commissionRate: String(commissionRate), updatedAt: new Date() })
      .where(eq(depotProductCommissions.id, existing.id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(depotProductCommissions)
    .values({ depotId, productId, commissionRate: String(commissionRate) })
    .returning();
  return row;
};

// ─── Commission Records ─────────────────────────────────────────────────────

const findAll = async ({
  search,
  status,
  depotId,
  customerId,
  dateFrom,
  dateTo,
  page = 1,
  limit = 50,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  if (status && status !== "all") {
    conditions.push(eq(commissions.status, status));
  }
  if (depotId) {
    conditions.push(eq(commissions.depotId, parseInt(depotId)));
  }
  if (customerId) {
    conditions.push(eq(commissions.customerId, parseInt(customerId)));
  }
  if (dateFrom) {
    conditions.push(sql`${commissions.createdAt} >= ${new Date(dateFrom)}`);
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(sql`${commissions.createdAt} <= ${end}`);
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(orders.orderNumber, pattern),
        ilike(customers.name, pattern),
        ilike(customers.companyName, pattern),
        ilike(depots.name, pattern),
        ilike(products.name, pattern)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: commissions.id,
        orderId: commissions.orderId,
        orderNumber: orders.orderNumber,
        orderCompanyName: orders.companyName,
        orderCreatedAt: orders.createdAt,
        customerId: commissions.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerCompanyName: customers.companyName,
        customerCommissionBankName: customers.commissionBankName,
        customerCommissionAccountName: customers.commissionAccountName,
        customerCommissionAccountNumber: customers.commissionAccountNumber,
        depotId: commissions.depotId,
        depotName: depots.name,
        depotCity: depots.city,
        depotState: depots.state,
        productId: commissions.productId,
        productName: products.name,
        productSku: products.sku,
        quantity: commissions.quantity,
        commissionRate: commissions.commissionRate,
        commissionAmount: commissions.commissionAmount,
        status: commissions.status,
        paidAt: commissions.paidAt,
        paidBy: commissions.paidBy,
        paidByName: sql`CONCAT(${staff.firstName}, ' ', ${staff.surname})`,
        createdAt: commissions.createdAt,
      })
      .from(commissions)
      .leftJoin(orders, eq(commissions.orderId, orders.id))
      .leftJoin(customers, eq(commissions.customerId, customers.id))
      .leftJoin(depots, eq(commissions.depotId, depots.id))
      .leftJoin(products, eq(commissions.productId, products.id))
      .leftJoin(staff, eq(commissions.paidBy, staff.id))
      .where(whereClause)
      .orderBy(desc(commissions.createdAt))
      .limit(limitNum)
      .offset(offset),
    db.select({ total: count() }).from(commissions).where(whereClause),
  ]);

  // Fetch trucks for each order
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const trucks = await db
        .select({
          truckNumber: orderTrucks.truckNumber,
          quantity: orderTrucks.quantity,
        })
        .from(orderTrucks)
        .where(eq(orderTrucks.orderId, row.orderId));

      const comp = row.orderCompanyName || row.customerCompanyName || "";
      const ref = row.orderId ? generateOrderReference(comp, row.orderId) : row.orderNumber;
      return {
        ...row,
        orderNumber: ref,
        reference: ref,
        quantity: Number(row.quantity),
        commissionRate: parseFloat(row.commissionRate),
        commissionAmount: parseFloat(row.commissionAmount),
        trucks: trucks.map((t) => ({
          truckNumber: t.truckNumber || "N/A",
          quantity: Number(t.quantity),
        })),
      };
    })
  );

  return {
    commissions: enriched,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const findById = async (id) => {
  const [row] = await db
    .select({
      id: commissions.id,
      orderId: commissions.orderId,
      orderNumber: orders.orderNumber,
      // Needed to derive the reference, exactly as findAll does — the order's
      // own company name wins over the customer's.
      orderCompanyName: orders.companyName,
      customerId: commissions.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerCompanyName: customers.companyName,
      customerCommissionBankName: customers.commissionBankName,
      customerCommissionAccountName: customers.commissionAccountName,
      customerCommissionAccountNumber: customers.commissionAccountNumber,
      depotId: commissions.depotId,
      depotName: depots.name,
      productId: commissions.productId,
      productName: products.name,
      quantity: commissions.quantity,
      commissionRate: commissions.commissionRate,
      commissionAmount: commissions.commissionAmount,
      status: commissions.status,
      paidAt: commissions.paidAt,
      paidBy: commissions.paidBy,
      createdAt: commissions.createdAt,
    })
    .from(commissions)
    .leftJoin(orders, eq(commissions.orderId, orders.id))
    .leftJoin(customers, eq(commissions.customerId, customers.id))
    .leftJoin(depots, eq(commissions.depotId, depots.id))
    .leftJoin(products, eq(commissions.productId, products.id))
    .where(eq(commissions.id, id))
    .limit(1);

  if (!row) return null;

  // Decorated the same way findAll decorates its rows. Without this the
  // commission DETAIL view returned the raw `ORD-…` column while the LIST
  // showed the reference, so one screen disagreed with the other about what
  // the same order is called.
  const company = row.orderCompanyName || row.customerCompanyName || "";
  const ref = row.orderId ? generateOrderReference(company, row.orderId) : row.orderNumber;
  return { ...row, orderNumber: ref, reference: ref };
};

const create = async (data, tx = db) => {
  const [row] = await tx.insert(commissions).values(data).returning();
  return row;
};

const findByOrderId = async (orderId) => {
  const [row] = await db
    .select()
    .from(commissions)
    .where(eq(commissions.orderId, orderId))
    .limit(1);
  return row || null;
};

const markAsPaid = async (id, paidBy) => {
  const [row] = await db
    .update(commissions)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidBy,
      updatedAt: new Date(),
    })
    .where(eq(commissions.id, id))
    .returning();
  return row || null;
};

const getSummary = async ({ depotId, customerId, dateFrom, dateTo } = {}) => {
  const conditions = [];
  if (depotId) conditions.push(eq(commissions.depotId, parseInt(depotId)));
  if (customerId) conditions.push(eq(commissions.customerId, parseInt(customerId)));
  if (dateFrom) conditions.push(sql`${commissions.createdAt} >= ${new Date(dateFrom)}`);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push(sql`${commissions.createdAt} <= ${end}`);
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [stats] = await db
    .select({
      totalOrders: count(),
      totalQuantity: sql`COALESCE(SUM(${commissions.quantity}), 0)`,
      pendingAmount: sql`COALESCE(SUM(CASE WHEN ${commissions.status} = 'pending' THEN ${commissions.commissionAmount} ELSE 0 END), 0)`,
      paidAmount: sql`COALESCE(SUM(CASE WHEN ${commissions.status} = 'paid' THEN ${commissions.commissionAmount} ELSE 0 END), 0)`,
    })
    .from(commissions)
    .where(whereClause);

  return {
    totalOrders: Number(stats.totalOrders) || 0,
    totalQuantity: Number(stats.totalQuantity) || 0,
    pendingAmount: parseFloat(stats.pendingAmount) || 0,
    paidAmount: parseFloat(stats.paidAmount) || 0,
  };
};

module.exports = {
  getRate,
  getRates,
  upsertRate,
  findAll,
  findById,
  findByOrderId,
  create,
  markAsPaid,
  getSummary,
};
