const { eq, and, or, ilike, desc, count, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { fleetTrucks: trucks, drivers, driverTruckHistory } = require("../db/schema");

const findById = async (id) => {
  const [row] = await db.select().from(trucks).where(eq(trucks.id, id)).limit(1);
  return row || null;
};

const findByIdWithDriver = async (id) => {
  const [row] = await db
    .select({
      id: trucks.id,
      plateNumber: trucks.plateNumber,
      model: trucks.model,
      capacity: trucks.maxCapacity,
      status: trucks.truckStatus,
      currentDriverId: trucks.driverId,
      fuelLevel: trucks.fuelLevel,
      mileage: trucks.mileage,
      vin: trucks.vin,
      year: trucks.year,
      make: trucks.truckMake,
      type: trucks.truckType,
      insuranceExpiry: trucks.insuranceExpiry,
      registrationExpiry: trucks.registrationExpiry,
      nextServiceMileage: trucks.nextServiceMileage,
      createdAt: trucks.createdAt,
      updatedAt: trucks.updatedAt,
      driverName: drivers.name,
      driverPhone: drivers.phone,
      driverLicense: drivers.licenseNumber,
    })
    .from(trucks)
    .leftJoin(drivers, eq(trucks.driverId, drivers.id))
    .where(eq(trucks.id, id))
    .limit(1);
  return row || null;
};

const findByPlateNumber = async (plateNumber) => {
  const [row] = await db
    .select()
    .from(trucks)
    .where(eq(trucks.plateNumber, plateNumber.toUpperCase()))
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
        ilike(trucks.plateNumber, pattern),
        ilike(trucks.model, pattern)
      )
    );
  }

  if (status && status !== "all") {
    conditions.push(eq(trucks.truckStatus, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: trucks.id,
        plateNumber: trucks.plateNumber,
        model: trucks.model,
        capacity: trucks.maxCapacity,
        status: trucks.truckStatus,
        currentDriverId: trucks.driverId,
        fuelLevel: trucks.fuelLevel,
        mileage: trucks.mileage,
        vin: trucks.vin,
        year: trucks.year,
        make: trucks.truckMake,
        type: trucks.truckType,
        insuranceExpiry: trucks.insuranceExpiry,
        registrationExpiry: trucks.registrationExpiry,
        nextServiceMileage: trucks.nextServiceMileage,
        createdAt: trucks.createdAt,
        updatedAt: trucks.updatedAt,
        driverName: drivers.name,
        driverPhone: drivers.phone,
      })
      .from(trucks)
      .leftJoin(drivers, eq(trucks.driverId, drivers.id))
      .where(whereClause)
      .orderBy(desc(trucks.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(trucks)
      .where(whereClause),
  ]);

  return {
    trucks: rows,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

const create = async (data) => {
  const [row] = await db.insert(trucks).values(data).returning();
  return row;
};

const update = async (id, data) => {
  const [row] = await db
    .update(trucks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(trucks.id, id))
    .returning();
  return row || null;
};

const deleteById = async (id) => {
  const [row] = await db.delete(trucks).where(eq(trucks.id, id)).returning();
  return row || null;
};

const getDriverHistory = async (truckId) => {
  return db
    .select({
      id: driverTruckHistory.id,
      driverId: driverTruckHistory.driverId,
      driverName: drivers.name,
      assignedAt: driverTruckHistory.assignedAt,
    })
    .from(driverTruckHistory)
    .leftJoin(drivers, eq(driverTruckHistory.driverId, drivers.id))
    .where(eq(driverTruckHistory.truckId, truckId))
    .orderBy(desc(driverTruckHistory.assignedAt));
};

const addDriverHistory = async (truckId, driverId) => {
  const [row] = await db
    .insert(driverTruckHistory)
    .values({ truckId, driverId })
    .returning();
  return row;
};

module.exports = {
  findById,
  findByIdWithDriver,
  findByPlateNumber,
  findAll,
  create,
  update,
  deleteById,
  getDriverHistory,
  addDriverHistory,
};
