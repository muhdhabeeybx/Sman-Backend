const { pgTable, index, unique, bigint, varchar, timestamp, foreignKey, numeric } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerOrder } = require("./consumerOrder");
const { consumerPfi } = require("./consumerPfi");

const consumerPfimovement = pgTable("consumer_pfimovement", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pfimovement_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	qtyLitres: numeric("qty_litres", { precision: 14, scale:  2 }).notNull(),
	action: varchar({ length: 30 }).notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }),
}, (table) => [
	index("consumer_pf_order_i_7e31da_idx").using("btree", table.orderId.asc().nullsLast().op("int8_ops"), table.action.asc().nullsLast().op("text_ops")),
	index("consumer_pf_pfi_id_bffd45_idx").using("btree", table.pfiId.asc().nullsLast().op("int8_ops"), table.timestamp.asc().nullsLast().op("int8_ops")),
	index("consumer_pfimovement_order_id_e5c957e2").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfimovement_pfi_id_05fbfca2").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfimovement_user_id_7e293198").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_pfimovement_order_id_e5c957e2_fk_consumer_order_id"
		}),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "consumer_pfimovement_pfi_id_05fbfca2_fk_consumer_pfi_id"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfimovement_user_id_7e293198_fk_administration_user_id"
		}),
	unique("uniq_pfi_movement_per_order_action").on(table.action, table.orderId),
]);

module.exports = { consumerPfimovement };
