const { eq, and, or, ilike, desc, count, sql, lte, asc } = require("drizzle-orm");
const { db } = require("../config/db");
const {
  lpgOrderRequests,
  customers,
  staff,
  lpgStations,
  lpgStationCylinders,
} = require("../db/schema");
const { generateOrderReference, parseOrderReference } = require("../utils/helpers");

const formatLpgOrderRow = (row) => {
  if (!row) return null;
  const company = row.companyName || row.customerCompanyName || row.customerName || "";
  const ref = generateOrderReference(company, row.id);
  return {
    ...row,
    requestNumber: ref,
    reference: ref,
  };
};

const findById = async (id) => {
  const [row] = await db.select().from(lpgOrderRequests).where(eq(lpgOrderRequests.id, id)).limit(1);
  return formatLpgOrderRow(row);
};

const findByIdFull = async (id) => {
  const [row] = await db
    .select({
      id: lpgOrderRequests.id,
      requestNumber: lpgOrderRequests.requestNumber,
      customerId: lpgOrderRequests.customerId,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      companyName: customers.companyName,
      lpgStationId: lpgOrderRequests.lpgStationId,
      stationName: lpgStations.name,
      stationCode: lpgStations.code,
      stationState: lpgStations.state,
      stationCity: lpgStations.city,
      cylinderSizeKg: lpgOrderRequests.cylinderSizeKg,
      cylinderQuantity: lpgOrderRequests.cylinderQuantity,
      deliveryAddress: lpgOrderRequests.deliveryAddress,
      deliveryState: lpgOrderRequests.deliveryState,
      deliveryLga: lpgOrderRequests.deliveryLga,
      status: lpgOrderRequests.status,
      paymentStatus: lpgOrderRequests.paymentStatus,
      collectionStatus: lpgOrderRequests.collectionStatus,
      pricePerKg: lpgOrderRequests.pricePerKg,
      deliveryPrice: lpgOrderRequests.deliveryPrice,
      totalAmount: lpgOrderRequests.totalAmount,
      expectedArrivalDate: lpgOrderRequests.expectedArrivalDate,
      paymentReference: lpgOrderRequests.paymentReference,
      paymentMode: lpgOrderRequests.paymentMode,
      virtualAccountNumber: lpgOrderRequests.virtualAccountNumber,
      virtualAccountBank: lpgOrderRequests.virtualAccountBank,
      virtualAccountName: lpgOrderRequests.virtualAccountName,
      reviewedBy: lpgOrderRequests.reviewedBy,
      reviewerFirstName: staff.firstName,
      reviewerSurname: staff.surname,
      reviewedAt: lpgOrderRequests.reviewedAt,
      createdAt: lpgOrderRequests.createdAt,
      updatedAt: lpgOrderRequests.updatedAt,
    })
    .from(lpgOrderRequests)
    .leftJoin(customers, eq(lpgOrderRequests.customerId, customers.id))
    .leftJoin(lpgStations, eq(lpgOrderRequests.lpgStationId, lpgStations.id))
    .leftJoin(staff, eq(lpgOrderRequests.reviewedBy, staff.id))
    .where(eq(lpgOrderRequests.id, id))
    .limit(1);
  return formatLpgOrderRow(row);
};

const findAll = async ({ search, status, customerId, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  // Scope to one customer (the portal's own-orders list forces this).
  if (customerId) {
    conditions.push(eq(lpgOrderRequests.customerId, customerId));
  }

  if (status && status !== "all") {
    conditions.push(eq(lpgOrderRequests.status, status));
  }

  if (search) {
    const pattern = `%${search}%`;
    // Reference-shaped input ("SO600", or the legacy "SO/600") also matches id.
    const possibleId = parseOrderReference(search);
    if (possibleId) {
      conditions.push(
        or(
          ilike(lpgOrderRequests.requestNumber, pattern),
          ilike(customers.name, pattern),
          ilike(lpgStations.name, pattern),
          eq(lpgOrderRequests.id, possibleId)
        )
      );
    } else {
      conditions.push(
        or(
          ilike(lpgOrderRequests.requestNumber, pattern),
          ilike(customers.name, pattern),
          ilike(lpgStations.name, pattern)
        )
      );
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: lpgOrderRequests.id,
        requestNumber: lpgOrderRequests.requestNumber,
        customerId: lpgOrderRequests.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        companyName: customers.companyName,
        customerCompanyName: customers.companyName,
        lpgStationId: lpgOrderRequests.lpgStationId,
        stationName: lpgStations.name,
        stationState: lpgStations.state,
        cylinderSizeKg: lpgOrderRequests.cylinderSizeKg,
        cylinderQuantity: lpgOrderRequests.cylinderQuantity,
        deliveryAddress: lpgOrderRequests.deliveryAddress,
        deliveryState: lpgOrderRequests.deliveryState,
        deliveryLga: lpgOrderRequests.deliveryLga,
        status: lpgOrderRequests.status,
        paymentStatus: lpgOrderRequests.paymentStatus,
        collectionStatus: lpgOrderRequests.collectionStatus,
        pricePerKg: lpgOrderRequests.pricePerKg,
        totalAmount: lpgOrderRequests.totalAmount,
        expectedArrivalDate: lpgOrderRequests.expectedArrivalDate,
        virtualAccountNumber: lpgOrderRequests.virtualAccountNumber,
        virtualAccountBank: lpgOrderRequests.virtualAccountBank,
        createdAt: lpgOrderRequests.createdAt,
      })
      .from(lpgOrderRequests)
      .leftJoin(customers, eq(lpgOrderRequests.customerId, customers.id))
      .leftJoin(lpgStations, eq(lpgOrderRequests.lpgStationId, lpgStations.id))
      .where(whereClause)
      .orderBy(desc(lpgOrderRequests.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(lpgOrderRequests)
      .leftJoin(customers, eq(lpgOrderRequests.customerId, customers.id))
      .leftJoin(lpgStations, eq(lpgOrderRequests.lpgStationId, lpgStations.id))
      .where(whereClause),
  ]);

  return {
    requests: rows.map(formatLpgOrderRow),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const create = async (data) => {
  // request_number is NOT NULL; mint a short-lived filler until we know the
  // serial id and can write the customer-facing INITIALS+id reference.
  const [row] = await db
    .insert(lpgOrderRequests)
    .values({ ...data, requestNumber: data.requestNumber || `TMP-${Date.now()}` })
    .returning();

  // LPG rows don't store company_name — resolve it from the customer so the
  // stored/emailed ref matches what findByIdFull later recomputes on read.
  let company = data.companyName || "";
  if (!company && data.customerId) {
    const [cust] = await db
      .select({ companyName: customers.companyName, name: customers.name })
      .from(customers)
      .where(eq(customers.id, data.customerId))
      .limit(1);
    company = cust?.companyName || cust?.name || "";
  }

  const ref = generateOrderReference(company, row.id);
  if (row.requestNumber !== ref) {
    await db.update(lpgOrderRequests).set({ requestNumber: ref }).where(eq(lpgOrderRequests.id, row.id));
    row.requestNumber = ref;
  }
  return formatLpgOrderRow({ ...row, companyName: company });
};

const update = async (id, data) => {
  const updateData = { ...data, updatedAt: new Date() };
  const [row] = await db
    .update(lpgOrderRequests)
    .set(updateData)
    .where(eq(lpgOrderRequests.id, id))
    .returning();
  return formatLpgOrderRow(row);
};

const generateRequestNumber = async () => {
  const [{ total }] = await db.select({ total: count() }).from(lpgOrderRequests);
  const num = total + 1;
  const year = new Date().getFullYear();
  return `LPG-REQ-${year}-${String(num).padStart(3, "0")}`;
};

const findPayableLpgOrders = async () => {
  const rows = await db
    .select({
      id: lpgOrderRequests.id,
      requestNumber: lpgOrderRequests.requestNumber,
      customerId: lpgOrderRequests.customerId,
      customerName: customers.name,
      companyName: customers.companyName,
      customerCompanyName: customers.companyName,
      customerBalance: customers.balance,
      stationName: lpgStations.name,
      cylinderSizeKg: lpgOrderRequests.cylinderSizeKg,
      cylinderQuantity: lpgOrderRequests.cylinderQuantity,
      totalAmount: lpgOrderRequests.totalAmount,
      paymentStatus: lpgOrderRequests.paymentStatus,
      status: lpgOrderRequests.status,
      createdAt: lpgOrderRequests.createdAt,
      deliveryAddress: lpgOrderRequests.deliveryAddress,
      deliveryState: lpgOrderRequests.deliveryState,
    })
    .from(lpgOrderRequests)
    .innerJoin(customers, eq(lpgOrderRequests.customerId, customers.id))
    .leftJoin(lpgStations, eq(lpgOrderRequests.lpgStationId, lpgStations.id))
    .where(
      and(
        eq(lpgOrderRequests.paymentStatus, "Unpaid"),
        eq(lpgOrderRequests.status, "Approved"),
        sql`${lpgOrderRequests.totalAmount} IS NOT NULL`,
        sql`${lpgOrderRequests.totalAmount} > 0`,
        sql`${customers.balance} >= ${lpgOrderRequests.totalAmount}`
      )
    )
    .orderBy(lpgOrderRequests.createdAt);
  return rows.map(formatLpgOrderRow);
};

/**
 * Approved, unpaid LPG requests whose review timestamp is on or before
 * `cutoff` — the expiry sweep's work list. Oldest first.
 */
const findStaleApproved = async (cutoff) => {
  return db
    .select({ id: lpgOrderRequests.id, requestNumber: lpgOrderRequests.requestNumber, reviewedAt: lpgOrderRequests.reviewedAt })
    .from(lpgOrderRequests)
    .where(
      and(
        eq(lpgOrderRequests.status, "Approved"),
        eq(lpgOrderRequests.paymentStatus, "Unpaid"),
        lte(lpgOrderRequests.reviewedAt, cutoff)
      )
    )
    .orderBy(asc(lpgOrderRequests.reviewedAt));
};

module.exports = {
  findById,
  findByIdFull,
  findAll,
  create,
  update,
  generateRequestNumber,
  findPayableLpgOrders,
  findStaleApproved,
};
