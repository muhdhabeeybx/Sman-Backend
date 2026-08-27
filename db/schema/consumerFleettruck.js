const { pgTable, index, unique, bigint, varchar, boolean, timestamp, integer, text, check, date, doublePrecision } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

const consumerFleettruck = pgTable("consumer_fleettruck", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_fleettruck_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	plateNumber: varchar("plate_number", { length: 50 }).notNull(),
	driverName: varchar("driver_name", { length: 255 }).notNull(),
	driverPhone: varchar("driver_phone", { length: 50 }),
	notes: text(),
	isActive: boolean("is_active").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	maxCapacity: integer("max_capacity"),
	chassisNumber: varchar("chassis_number", { length: 255 }).notNull(),
	driverAltPhone: varchar("driver_alt_phone", { length: 50 }).notNull(),
	motorBoyName: varchar("motor_boy_name", { length: 255 }).notNull(),
	motorBoyPhone1: varchar("motor_boy_phone1", { length: 50 }).notNull(),
	motorBoyPhone2: varchar("motor_boy_phone2", { length: 50 }).notNull(),
	passportPhoto: text("passport_photo").notNull(),
	spareDriverName: varchar("spare_driver_name", { length: 255 }).notNull(),
	spareDriverPhone: varchar("spare_driver_phone", { length: 50 }).notNull(),
	truckMake: varchar("truck_make", { length: 255 }).notNull(),
	truckStatus: varchar("truck_status", { length: 500 }).notNull(),
	avgLitresPerTrip: doublePrecision("avg_litres_per_trip"),
	driversLicenseDoc: text("drivers_license_doc").notNull(),
	fuelCapacity: doublePrecision("fuel_capacity"),
	incidents: text().notNull(),
	insuranceCertDoc: text("insurance_cert_doc").notNull(),
	insuranceExpiry: date("insurance_expiry"),
	lastServiceDate: date("last_service_date"),
	mileage: integer(),
	nextServiceDate: date("next_service_date"),
	roadWorthinessExpiry: date("road_worthiness_expiry"),
	vehiclePapersDoc: text("vehicle_papers_doc").notNull(),
}, (table) => [
	index("consumer_fleettruck_plate_number_a8e711b1_like").using("btree", table.plateNumber.asc().nullsLast().op("varchar_pattern_ops")),
	unique("consumer_fleettruck_plate_number_key").on(table.plateNumber),
	check("consumer_fleettruck_max_capacity_check", sql`max_capacity >= 0`),
]);

module.exports = { consumerFleettruck };
