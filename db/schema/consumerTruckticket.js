const { pgTable, index, unique, bigint, varchar, timestamp, integer, foreignKey, check, numeric } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { administrationUser } = require("./administrationUser");
const { consumerOrder } = require("./consumerOrder");

const consumerTruckticket = pgTable("consumer_truckticket", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_truckticket_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	truckNumber: integer("truck_number").notNull(),
	quantityLitres: numeric("quantity_litres", { precision: 12, scale:  2 }).notNull(),
	driverName: varchar("driver_name", { length: 255 }),
	driverPhone: varchar("driver_phone", { length: 50 }),
	plateNumber: varchar("plate_number", { length: 100 }),
	ticketStatus: varchar("ticket_status", { length: 20 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
	exitedAt: timestamp("exited_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	exitedById: bigint("exited_by_id", { mode: "number" }),
	gantry: varchar({ length: 20 }),
	loaderName: varchar("loader_name", { length: 255 }),
	enteredAt: timestamp("entered_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	enteredById: bigint("entered_by_id", { mode: "number" }),
	entryDriverName: varchar("entry_driver_name", { length: 255 }),
	entryDriverPhone: varchar("entry_driver_phone", { length: 50 }),
}, (table) => [
	index("consumer_truckticket_entered_by_id_cdaa061c").using("btree", table.enteredById.asc().nullsLast().op("int8_ops")),
	index("consumer_truckticket_exited_by_id_78440475").using("btree", table.exitedById.asc().nullsLast().op("int8_ops")),
	index("consumer_truckticket_order_id_5ef9cb8d").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_truckticket_order_id_5ef9cb8d_fk_consumer_order_id"
		}),
	foreignKey({
			columns: [table.exitedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_truckticket_exited_by_id_78440475_fk_administr"
		}),
	foreignKey({
			columns: [table.enteredById],
			foreignColumns: [administrationUser.id],
			name: "consumer_truckticket_entered_by_id_cdaa061c_fk_administr"
		}),
	unique("consumer_truckticket_order_id_truck_number_f2ddbd4c_uniq").on(table.truckNumber, table.orderId),
	check("consumer_truckticket_truck_number_check", sql`truck_number >= 0`),
]);

module.exports = { consumerTruckticket };
