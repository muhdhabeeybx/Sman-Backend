const { pgTable, index, bigint, varchar, foreignKey } = require("drizzle-orm/pg-core");
const { consumerPickuporders } = require("./consumerPickuporders");

const consumerPickuptruck = pgTable("consumer_pickuptruck", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pickuptruck_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	truckNo: varchar("truck_no", { length: 200 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pickupOrderId: bigint("pickup_order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_pickuptruck_pickup_order_id_65bbd981").using("btree", table.pickupOrderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.pickupOrderId],
			foreignColumns: [consumerPickuporders.id],
			name: "consumer_pickuptruck_pickup_order_id_65bbd981_fk_consumer_"
		}),
]);

module.exports = { consumerPickuptruck };
