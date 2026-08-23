const { eq, and, or, ilike, desc, count, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { tickets, orders, customers, depots, products, staff, pfis } = require("../db/schema");
const { generateOrderReference } = require("../utils/helpers");

const formatTicket = (row) => {
  if (!row) return null;
  const {
    orderNumber,
    orderCompanyName,
    orderStatus,
    orderQuantity,
    orderPrice,
    orderTotalAmount,
    orderDeliveryType,
    orderState,
    orderVirtualAccountNumber,
    orderVirtualAccountBank,
    orderVirtualAccountName,
    orderCreatedAt,
    customerName,
    customerEmail,
    customerPhone,
    customerCompanyName,
    depotName,
    depotCode,
    depotAddress,
    productName,
    productSku,
    productUnit,
    pfiNumber,
    redeemerFirstName,
    redeemerSurname,
    redeemerEmail,
    ...ticket
  } = row;

  const priceNum = orderPrice ? parseFloat(orderPrice) : 0;
  const totalAmountNum = orderTotalAmount ? parseFloat(orderTotalAmount) : 0;
  const company = orderCompanyName || customerCompanyName || "";
  const ref = ticket.orderId ? generateOrderReference(company, ticket.orderId) : orderNumber;

  return {
    ...ticket,
    order: ticket.orderId || orderNumber
      ? {
          _id: ticket.orderId,
          id: ticket.orderId,
          orderNumber: ref,
          reference: ref,
          status: orderStatus,
          quantity: orderQuantity ? parseInt(orderQuantity, 10) : 0,
          price: priceNum,
          totalAmount: totalAmountNum,
          deliveryType: orderDeliveryType,
          state: orderState,
          virtualAccountNumber: orderVirtualAccountNumber || "",
          virtualAccountBank: orderVirtualAccountBank || "",
          virtualAccountName: orderVirtualAccountName || "",
          pfiNumber: pfiNumber || "",
          createdAt: orderCreatedAt,
          product: productName
            ? {
                name: productName,
                sku: productSku || "",
                unit: productUnit || "Liters",
              }
            : null,
          customer: customerName
            ? {
                name: customerName,
                email: customerEmail || "",
                phone: customerPhone || "",
                companyName: customerCompanyName || "",
              }
            : null,
          depot: depotName
            ? {
                name: depotName,
                code: depotCode || "",
                address: depotAddress || "",
              }
            : null,
        }
      : null,
    redeemedBy: redeemerFirstName
      ? {
          firstName: redeemerFirstName,
          surname: redeemerSurname,
          email: redeemerEmail || "",
        }
      : null,
  };
};

const findById = async (id) => {
  const [row] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return row || null;
};

const findByNumber = async (ticketNumber) => {
  const [row] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.ticketNumber, ticketNumber))
    .limit(1);
  return row || null;
};

const findByIdOrCode = async (idOrCode) => {
  if (!idOrCode) return null;
  const str = String(idOrCode);

  // If integer ID
  if (/^\d+$/.test(str)) {
    const t = await findById(parseInt(str, 10));
    if (t) return t;
  }

  // Try as ticket number
  const tNum = await findByNumber(str);
  if (tNum) return tNum;

  // Try as UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  if (isUuid) {
    return findById(idOrCode);
  }

  return null;
};

const findByIdFull = async (id) => {
  const [row] = await db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      orderId: tickets.orderId,
      status: tickets.status,
      qrCodeDataUrl: tickets.qrCodeDataUrl,
      redeemedAt: tickets.redeemedAt,
      redeemedBy: tickets.redeemedBy,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      orderNumber: orders.orderNumber,
      orderCompanyName: orders.companyName,
      orderStatus: orders.status,
      orderQuantity: orders.quantity,
      orderPrice: orders.price,
      orderTotalAmount: orders.totalAmount,
      orderDeliveryType: orders.deliveryType,
      orderState: orders.state,
      orderVirtualAccountNumber: orders.virtualAccountNumber,
      orderVirtualAccountBank: orders.virtualAccountBank,
      orderVirtualAccountName: orders.virtualAccountName,
      orderCreatedAt: orders.createdAt,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerCompanyName: customers.companyName,
      depotName: depots.name,
      depotCode: depots.code,
      depotAddress: depots.address,
      productName: products.name,
      productSku: products.sku,
      productUnit: products.unit,
      pfiNumber: pfis.pfiNumber,
      redeemerFirstName: staff.firstName,
      redeemerSurname: staff.surname,
      redeemerEmail: staff.email,
    })
    .from(tickets)
    .leftJoin(orders, eq(tickets.orderId, orders.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(depots, eq(orders.depotId, depots.id))
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(pfis, eq(orders.pfiId, pfis.id))
    .leftJoin(staff, eq(tickets.redeemedBy, staff.id))
    .where(eq(tickets.id, id))
    .limit(1);
  return formatTicket(row);
};

const findByIdOrCodeFull = async (idOrCode) => {
  if (!idOrCode) return null;
  const str = String(idOrCode);

  // If integer ID
  if (/^\d+$/.test(str)) {
    const full = await findByIdFull(parseInt(str, 10));
    if (full) return full;
  }

  // Try as ticket number
  const tNum = await findByNumber(str);
  if (tNum) {
    return findByIdFull(tNum.id);
  }

  // Try as UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  if (isUuid) {
    return findByIdFull(idOrCode);
  }

  return null;
};

const findByOrder = async (orderId, tx = db) => {
  const [row] = await tx
    .select()
    .from(tickets)
    .where(eq(tickets.orderId, orderId))
    .limit(1);
  return row || null;
};

/** The one ticket belonging to a specific truck load, if it has been issued. */
const findByOrderTruck = async (orderTruckId, tx = db) => {
  const [row] = await tx
    .select()
    .from(tickets)
    .where(eq(tickets.orderTruckId, orderTruckId))
    .limit(1);
  return row || null;
};

const findAll = async ({ search, status, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  if (status) {
    conditions.push(eq(tickets.status, status));
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(tickets.ticketNumber, pattern),
        ilike(orders.orderNumber, pattern),
        ilike(customers.name, pattern)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: tickets.id,
        ticketNumber: tickets.ticketNumber,
        orderId: tickets.orderId,
        status: tickets.status,
        qrCodeDataUrl: tickets.qrCodeDataUrl,
        redeemedAt: tickets.redeemedAt,
        redeemedBy: tickets.redeemedBy,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        orderQuantity: orders.quantity,
        orderPrice: orders.price,
        orderTotalAmount: orders.totalAmount,
        orderDeliveryType: orders.deliveryType,
        orderState: orders.state,
        orderVirtualAccountNumber: orders.virtualAccountNumber,
        orderVirtualAccountBank: orders.virtualAccountBank,
        orderVirtualAccountName: orders.virtualAccountName,
        orderCreatedAt: orders.createdAt,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerCompanyName: customers.companyName,
        depotName: depots.name,
        depotCode: depots.code,
        depotAddress: depots.address,
        productName: products.name,
        productSku: products.sku,
        productUnit: products.unit,
        pfiNumber: pfis.pfiNumber,
        redeemerFirstName: staff.firstName,
        redeemerSurname: staff.surname,
        redeemerEmail: staff.email,
      })
      .from(tickets)
      .leftJoin(orders, eq(tickets.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(depots, eq(orders.depotId, depots.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .leftJoin(pfis, eq(orders.pfiId, pfis.id))
      .leftJoin(staff, eq(tickets.redeemedBy, staff.id))
      .where(whereClause)
      .orderBy(desc(tickets.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(tickets)
      .leftJoin(orders, eq(tickets.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(whereClause),
  ]);

  return {
    tickets: rows.map(formatTicket),
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const create = async (data, tx = db) => {
  const [row] = await tx.insert(tickets).values(data).returning();
  return row;
};

const update = async (id, data, tx = db) => {
  const [row] = await tx
    .update(tickets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tickets.id, id))
    .returning();
  return row || null;
};

module.exports = {
  findById,
  findByNumber,
  findByIdOrCode,
  findByIdFull,
  findByIdOrCodeFull,
  findByOrder,
  findByOrderTruck,
  findAll,
  create,
  update,
};

