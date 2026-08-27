const { pgTable, index, bigint, integer, foreignKey, check, numeric } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { consumerOrder } = require("./consumerOrder");
const { consumerProduct } = require("./consumerProduct");

const consumerOrderproduct = pgTable("consumer_orderproduct", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_orderproduct_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	quantity: integer().notNull(),
	price: numeric({ precision: 100, scale:  2 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	productId: bigint("product_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_orderproduct_order_id_1e96a268").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	index("consumer_orderproduct_product_id_0491d358").using("btree", table.productId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [consumerProduct.id],
			name: "consumer_orderproduc_product_id_0491d358_fk_consumer_"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_orderproduct_order_id_1e96a268_fk_consumer_order_id"
		}),
	check("consumer_orderproduct_quantity_check", sql`quantity >= 0`),
]);

module.exports = { consumerOrderproduct };
