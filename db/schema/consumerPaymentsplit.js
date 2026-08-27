const { pgTable, index, bigint, varchar, timestamp, foreignKey, numeric } = require("drizzle-orm/pg-core");
const { consumerOrder } = require("./consumerOrder");

const consumerPaymentsplit = pgTable("consumer_paymentsplit", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_paymentsplit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	amount: numeric({ precision: 100, scale:  2 }).notNull(),
	depositorName: varchar("depositor_name", { length: 200 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_pa_order_i_262730_idx").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	index("consumer_paymentsplit_order_id_7a2d67d1").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_paymentsplit_order_id_7a2d67d1_fk_consumer_order_id"
		}),
]);

module.exports = { consumerPaymentsplit };
