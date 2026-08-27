const { eq, and, or, ilike, desc, count, sql, lte, asc } = require("drizzle-orm");
const { db } = require("../config/db");
const { dangoteOrderRequests, customers, staff, customerLicenses } = require("../db/schema");
const { generateOrderReference, parseOrderReference } = require("../utils/helpers");

const formatDangoteOrderRow = (row) => {
  if (!row) return null;
  const company = row.companyName || row.licenseCompanyName || row.customerCompanyName || row.customerName || "";
  const ref = generateOrderReference(company, row.id);
  return {
    ...row,
    requestNumber: ref,
    reference: ref,
    bankName: row.bankName || row.virtualAccountBank || "",
    accountName: row.accountName || row.virtualAccountName || "",
    accountNumber: row.accountNumber || row.virtualAccountNumber || "",
  };
};

const findById = async (id) => {
  const [row] = await db.select().from(dangoteOrderRequests).where(eq(dangoteOrderRequests.id, id)).limit(1);
  return formatDangoteOrderRow(row);
};

const findByIdFull = async (id) => {
  const [row] = await db
    .select({
      id: dangoteOrderRequests.id,
      requestNumber: dangoteOrderRequests.requestNumber,
      customerId: dangoteOrderRequests.customerId,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerBalance: customers.balance,
      companyName: customers.companyName,
      licenseId: dangoteOrderRequests.licenseId,
      licenseCompanyName: dangoteOrderRequests.companyName,
      licenseStatus: customerLicenses.status,
      licenseUrl: customerLicenses.licenseUrl,
      product: dangoteOrderRequests.product,
      quantity: dangoteOrderRequests.quantity,
      quantityUnit: dangoteOrderRequests.quantityUnit,
      deliveryAddress: dangoteOrderRequests.deliveryAddress,
      deliveryState: dangoteOrderRequests.deliveryState,
      deliveryLga: dangoteOrderRequests.deliveryLga,
      status: dangoteOrderRequests.status,
      paymentStatus: dangoteOrderRequests.paymentStatus,
      collectionStatus: dangoteOrderRequests.collectionStatus,
      pricePerUnit: dangoteOrderRequests.pricePerUnit,
      deliveryPrice: dangoteOrderRequests.deliveryPrice,
      totalAmount: dangoteOrderRequests.totalAmount,
      expectedArrivalDate: dangoteOrderRequests.expectedArrivalDate,
      paymentReference: dangoteOrderRequests.paymentReference,
      paymentMode: dangoteOrderRequests.paymentMode,
      virtualAccountNumber: dangoteOrderRequests.virtualAccountNumber,
      virtualAccountBank: dangoteOrderRequests.virtualAccountBank,
      virtualAccountName: dangoteOrderRequests.virtualAccountName,
      reviewedBy: dangoteOrderRequests.reviewedBy,
      reviewerFirstName: staff.firstName,
      reviewerSurname: staff.surname,
      reviewedAt: dangoteOrderRequests.reviewedAt,
      createdAt: dangoteOrderRequests.createdAt,
      updatedAt: dangoteOrderRequests.updatedAt,
    })
    .from(dangoteOrderRequests)
    .leftJoin(customers, eq(dangoteOrderRequests.customerId, customers.id))
    .leftJoin(staff, eq(dangoteOrderRequests.reviewedBy, staff.id))
    .leftJoin(customerLicenses, eq(dangoteOrderRequests.licenseId, customerLicenses.id))
    .where(eq(dangoteOrderRequests.id, id))
    .limit(1);
  return formatDangoteOrderRow(row);
};

const findAll = async ({
  search,
  status,
  paymentStatus,
  payable,
  customerId,
  page = 1,
  limit = 50,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  // Portal scoping: the customer sees only their own requests.
  if (customerId) {
    conditions.push(eq(dangoteOrderRequests.customerId, customerId));
  }

  if (status && status !== "all") {
    conditions.push(eq(dangoteOrderRequests.status, status));
  }

  if (paymentStatus) {
    conditions.push(eq(dangoteOrderRequests.paymentStatus, paymentStatus));
  }

  if (payable === true || payable === "true" || payable === "1") {
    conditions.push(eq(dangoteOrderRequests.paymentStatus, "Unpaid"));
    conditions.push(eq(dangoteOrderRequests.status, "Approved"));
    conditions.push(
      sql`${dangoteOrderRequests.totalAmount} IS NOT NULL AND ${dangoteOrderRequests.totalAmount} > 0 AND ${dangoteOrderRequests.totalAmount} <= (SELECT c.balance FROM customers c WHERE c.id = ${dangoteOrderRequests.customerId})`
    );
  }

  if (search) {
    const pattern = `%${search}%`;
    // Reference-shaped input ("SO600", or the legacy "SO/600") also matches id.
    const possibleId = parseOrderReference(search);
    if (possibleId) {
      conditions.push(
        or(
          ilike(dangoteOrderRequests.requestNumber, pattern),
          ilike(dangoteOrderRequests.product, pattern),
          ilike(customers.name, pattern),
          eq(dangoteOrderRequests.id, possibleId)
        )
      );
    } else {
      conditions.push(
        or(
          ilike(dangoteOrderRequests.requestNumber, pattern),
          ilike(dangoteOrderRequests.product, pattern),
          ilike(customers.name, pattern)
        )
      );
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: dangoteOrderRequests.id,
        requestNumber: dangoteOrderRequests.requestNumber,
        customerId: dangoteOrderRequests.customerId,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerBalance: customers.balance,
        companyName: dangoteOrderRequests.companyName,
        customerCompanyName: customers.companyName,
        product: dangoteOrderRequests.product,
        quantity: dangoteOrderRequests.quantity,
        quantityUnit: dangoteOrderRequests.quantityUnit,
        deliveryAddress: dangoteOrderRequests.deliveryAddress,
        deliveryState: dangoteOrderRequests.deliveryState,
        status: dangoteOrderRequests.status,
        paymentStatus: dangoteOrderRequests.paymentStatus,
        collectionStatus: dangoteOrderRequests.collectionStatus,
        pricePerUnit: dangoteOrderRequests.pricePerUnit,
        totalAmount: dangoteOrderRequests.totalAmount,
        expectedArrivalDate: dangoteOrderRequests.expectedArrivalDate,
        virtualAccountNumber: dangoteOrderRequests.virtualAccountNumber,
        virtualAccountBank: dangoteOrderRequests.virtualAccountBank,
        createdAt: dangoteOrderRequests.createdAt,
      })
      .from(dangoteOrderRequests)
      .leftJoin(customers, eq(dangoteOrderRequests.customerId, customers.id))
      .where(whereClause)
      .orderBy(desc(dangoteOrderRequests.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(dangoteOrderRequests)
      .leftJoin(customers, eq(dangoteOrderRequests.customerId, customers.id))
      .where(whereClause),
  ]);

  return {
    requests: rows.map(formatDangoteOrderRow),
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
    .insert(dangoteOrderRequests)
    .values({ ...data, requestNumber: data.requestNumber || `TMP-${Date.now()}` })
    .returning();
  const company = data.companyName || "";
  const ref = generateOrderReference(company, row.id);
  if (row.requestNumber !== ref) {
    await db.update(dangoteOrderRequests).set({ requestNumber: ref }).where(eq(dangoteOrderRequests.id, row.id));
    row.requestNumber = ref;
  }
  return formatDangoteOrderRow(row);
};

const update = async (id, data) => {
  const updateData = { ...data, updatedAt: new Date() };
  const [row] = await db
    .update(dangoteOrderRequests)
    .set(updateData)
    .where(eq(dangoteOrderRequests.id, id))
    .returning();
  return formatDangoteOrderRow(row);
};

// Atomically move a request to Cancelled ONLY while it is still withdrawable:
// owned by this customer, under review or approved, and not yet paid. The guard
// lives in the WHERE clause so a concurrent pay (a plain wallet debit that flips
// paymentStatus to Paid, with no row lock of its own) can't be raced past — the
// UPDATE matches zero rows instead of stranding a Paid request as Cancelled.
// Returns the updated row, or null when nothing was cancellable.
const cancelIfWithdrawable = async (id, customerId) => {
  const [row] = await db
    .update(dangoteOrderRequests)
    .set({ status: "Cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(dangoteOrderRequests.id, id),
        eq(dangoteOrderRequests.customerId, customerId),
        or(
          eq(dangoteOrderRequests.status, "Pending Review"),
          eq(dangoteOrderRequests.status, "Approved")
        ),
        sql`${dangoteOrderRequests.paymentStatus} <> 'Paid'`
      )
    )
    .returning();
  return row || null;
};

// How many of a customer's Dangote requests still point at this license, not
// counting Rejected or Cancelled ones. Used to block a license delete while an
// active or approved request depends on the document that backed it.
const countActiveByLicenseId = async (licenseId) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(dangoteOrderRequests)
    .where(
      and(
        eq(dangoteOrderRequests.licenseId, licenseId),
        sql`${dangoteOrderRequests.status} NOT IN ('Rejected', 'Cancelled')`
      )
    );
  return total;
};

const generateRequestNumber = async () => {
  const [{ total }] = await db.select({ total: count() }).from(dangoteOrderRequests);
  const num = total + 1;
  const year = new Date().getFullYear();
  return `DNG-REQ-${year}-${String(num).padStart(3, "0")}`;
};

const findPayableDangoteOrders = async () => {
  const rows = await db
    .select({
      id: dangoteOrderRequests.id,
      requestNumber: dangoteOrderRequests.requestNumber,
      customerId: dangoteOrderRequests.customerId,
      customerName: customers.name,
      companyName: dangoteOrderRequests.companyName,
      customerCompanyName: customers.companyName,
      customerBalance: customers.balance,
      product: dangoteOrderRequests.product,
      quantity: dangoteOrderRequests.quantity,
      quantityUnit: dangoteOrderRequests.quantityUnit,
      totalAmount: dangoteOrderRequests.totalAmount,
      paymentStatus: dangoteOrderRequests.paymentStatus,
      status: dangoteOrderRequests.status,
      createdAt: dangoteOrderRequests.createdAt,
      deliveryAddress: dangoteOrderRequests.deliveryAddress,
      deliveryState: dangoteOrderRequests.deliveryState,
    })
    .from(dangoteOrderRequests)
    .innerJoin(customers, eq(dangoteOrderRequests.customerId, customers.id))
    .where(
      and(
        eq(dangoteOrderRequests.paymentStatus, "Unpaid"),
        eq(dangoteOrderRequests.status, "Approved"),
        sql`${dangoteOrderRequests.totalAmount} IS NOT NULL`,
        sql`${dangoteOrderRequests.totalAmount} > 0`,
        sql`${customers.balance} >= ${dangoteOrderRequests.totalAmount}`
      )
    )
    .orderBy(dangoteOrderRequests.createdAt);
  return rows.map(formatDangoteOrderRow);
};

/**
 * Approved, unpaid Dangote requests whose review timestamp is on or before
 * `cutoff` — the expiry sweep's work list. Oldest first.
 */
const findStaleApproved = async (cutoff) => {
  return db
    .select({ id: dangoteOrderRequests.id, requestNumber: dangoteOrderRequests.requestNumber, reviewedAt: dangoteOrderRequests.reviewedAt })
    .from(dangoteOrderRequests)
    .where(
      and(
        eq(dangoteOrderRequests.status, "Approved"),
        eq(dangoteOrderRequests.paymentStatus, "Unpaid"),
        lte(dangoteOrderRequests.reviewedAt, cutoff)
      )
    )
    .orderBy(asc(dangoteOrderRequests.reviewedAt));
};

module.exports = {
  findById,
  findByIdFull,
  findAll,
  create,
  update,
  cancelIfWithdrawable,
  countActiveByLicenseId,
  generateRequestNumber,
  findPayableDangoteOrders,
  findStaleApproved,
};
