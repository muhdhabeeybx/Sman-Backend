const { pgTable, index, bigint, varchar, foreignKey, date, time } = require("drizzle-orm/pg-core");
const { consumerOrder } = require("./consumerOrder");
const { consumerStates } = require("./consumerStates");

const consumerDeliveryorders = pgTable("consumer_deliveryorders", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_deliveryorders_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	deliveryAddress: varchar("delivery_address", { length: 200 }).notNull(),
	deliveryDate: date("delivery_date"),
	deliveryTime: time("delivery_time"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	deliveryStateId: bigint("delivery_state_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_deliveryorders_delivery_state_id_44ba3748").using("btree", table.deliveryStateId.asc().nullsLast().op("int8_ops")),
	index("consumer_deliveryorders_order_id_b9c187e7").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.deliveryStateId],
			foreignColumns: [consumerStates.id],
			name: "consumer_deliveryord_delivery_state_id_44ba3748_fk_consumer_"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_deliveryorders_order_id_b9c187e7_fk_consumer_order_id"
		}),
]);

module.exports = { consumerDeliveryorders };
