const { pgTable, index, unique, bigint, varchar, timestamp, integer, foreignKey, check, numeric } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { consumerOrder } = require("./consumerOrder");
const { consumerOrderproduct } = require("./consumerOrderproduct");

const consumerTruckallocation = pgTable("consumer_truckallocation", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_truckallocation_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	truckNumber: integer("truck_number").notNull(),
	quantity: numeric({ precision: 14, scale:  2 }).notNull(),
	ticketNumber: varchar("ticket_number", { length: 64 }).notNull(),
	ticketStatus: varchar("ticket_status", { length: 20 }).notNull(),
	driverName: varchar("driver_name", { length: 255 }),
	plateNumber: varchar("plate_number", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderProductId: bigint("order_product_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_tr_order_i_06f08d_idx").using("btree", table.orderId.asc().nullsLast().op("int4_ops"), table.truckNumber.asc().nullsLast().op("int8_ops")),
	index("consumer_tr_ticket__4b889f_idx").using("btree", table.ticketStatus.asc().nullsLast().op("text_ops")),
	index("consumer_truckallocation_order_id_bfa195b5").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	index("consumer_truckallocation_order_product_id_ac4fe6c0").using("btree", table.orderProductId.asc().nullsLast().op("int8_ops")),
	index("consumer_truckallocation_ticket_number_dacd8122_like").using("btree", table.ticketNumber.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_truckallocation_order_id_bfa195b5_fk_consumer_order_id"
		}),
	foreignKey({
			columns: [table.orderProductId],
			foreignColumns: [consumerOrderproduct.id],
			name: "consumer_truckalloca_order_product_id_ac4fe6c0_fk_consumer_"
		}),
	unique("uniq_truck_per_order_product").on(table.truckNumber, table.orderProductId),
	unique("consumer_truckallocation_ticket_number_key").on(table.ticketNumber),
	check("consumer_truckallocation_truck_number_check", sql`truck_number >= 0`),
]);

module.exports = { consumerTruckallocation };
