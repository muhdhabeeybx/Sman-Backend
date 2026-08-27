const { pgTable, index, bigint, foreignKey, date, time } = require("drizzle-orm/pg-core");
const { consumerOrder } = require("./consumerOrder");
const { consumerStates } = require("./consumerStates");

const consumerPickuporders = pgTable("consumer_pickuporders", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pickuporders_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	pickupDate: date("pickup_date"),
	pickupTime: time("pickup_time"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	stateId: bigint("state_id", { mode: "number" }),
}, (table) => [
	index("consumer_pickuporders_order_id_56c89f68").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	index("consumer_pickuporders_state_id_e6380670").using("btree", table.stateId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_pickuporders_order_id_56c89f68_fk_consumer_order_id"
		}),
	foreignKey({
			columns: [table.stateId],
			foreignColumns: [consumerStates.id],
			name: "consumer_pickuporders_state_id_e6380670_fk_consumer_states_id"
		}),
]);

module.exports = { consumerPickuporders };
