const { pgTable, index, bigint, varchar, timestamp, integer, foreignKey, check, numeric } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { consumerOrder } = require("./consumerOrder");

const consumerTruckbreakdown = pgTable("consumer_truckbreakdown", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_truckbreakdown_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	trucks: integer().notNull(),
	litresPerTruck: numeric("litres_per_truck", { precision: 14, scale:  2 }).notNull(),
	notes: varchar({ length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_tr_order_i_7bf677_idx").using("btree", table.orderId.asc().nullsLast().op("int8_ops"), table.id.asc().nullsLast().op("int8_ops")),
	index("consumer_truckbreakdown_order_id_32028343").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_truckbreakdown_order_id_32028343_fk_consumer_order_id"
		}),
	check("consumer_truckbreakdown_trucks_check", sql`trucks >= 0`),
]);

module.exports = { consumerTruckbreakdown };
