const { eq, and, or, ilike, desc, count, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { drivers, fleetTrucks: trucks, driverTruckHistory } = require("../db/schema");

const findById = async (id) => {
  const [row] = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
  return row || null;
};

const findByIdWithTruck = async (id) => {
  const [row] = await db
    .select({
      id: drivers.id,
      name: drivers.name,
      email: drivers.email,
      phone: drivers.phone,
      licenseNumber: drivers.licenseNumber,
      licenseClass: drivers.licenseClass,
      rating: drivers.rating,
      status: drivers.status,
      assignedTruckId: drivers.assignedTruckId,
      safetyScore: drivers.safetyScore,
      licenseExpiry: drivers.licenseExpiry,
      createdAt: drivers.createdAt,
      updatedAt: drivers.updatedAt,
      assignedTruckPlate: trucks.plateNumber,
      assignedTruckModel: trucks.model,
      assignedTruck: trucks.plateNumber,
    })
    .from(drivers)
    .leftJoin(trucks, eq(drivers.assignedTruckId, trucks.id))
    .where(eq(drivers.id, id))
    .limit(1);
  return row || null;
};

const findByLicenseNumber = async (licenseNumber) => {
  const [row] = await db
    .select()
    .from(drivers)
    .where(eq(drivers.licenseNumber, licenseNumber))
    .limit(1);
  return row || null;
};

const findAll = async ({ search, status, page = 1, limit = 50 } = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(drivers.name, pattern),
        ilike(drivers.phone, pattern),
        ilike(drivers.licenseNumber, pattern)
      )
    );
  }

  if (status && status !== "all") {
    conditions.push(eq(drivers.status, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: drivers.id,
        name: drivers.name,
        email: drivers.email,
        phone: drivers.phone,
        licenseNumber: drivers.licenseNumber,
        licenseClass: drivers.licenseClass,
        rating: drivers.rating,
        status: drivers.status,
        assignedTruckId: drivers.assignedTruckId,
        safetyScore: drivers.safetyScore,
        licenseExpiry: drivers.licenseExpiry,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
        assignedTruckPlate: trucks.plateNumber,
        assignedTruck: trucks.plateNumber,
      })
      .from(drivers)
      .leftJoin(trucks, eq(drivers.assignedTruckId, trucks.id))
      .where(whereClause)
      .orderBy(desc(drivers.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(drivers)
      .where(whereClause),
  ]);

  return {
    drivers: rows,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const create = async (data) => {
  const [row] = await db.insert(drivers).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const [row] = await db
    .update(drivers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(drivers.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(drivers).where(eq(drivers.id, id)).returning();
  return row || null;
};

const getTruckHistory = async (driverId) => {
  return db
    .select({
      id: driverTruckHistory.id,
      truckId: driverTruckHistory.truckId,
      truckPlate: trucks.plateNumber,
      assignedAt: driverTruckHistory.assignedAt,
    })
    .from(driverTruckHistory)
    .leftJoin(trucks, eq(driverTruckHistory.truckId, trucks.id))
    .where(eq(driverTruckHistory.driverId, driverId))
    .orderBy(desc(driverTruckHistory.assignedAt));
};

const addTruckHistory = async (driverId, truckId) => {
  const [row] = await db
    .insert(driverTruckHistory)
    .values({ driverId, truckId })
    .returning();
  return row;
};

module.exports = {
  findById,
  findByIdWithTruck,
  findByLicenseNumber,
  findAll,
  create,
  update,
  deleteById,
  getTruckHistory,
  addTruckHistory,
};
