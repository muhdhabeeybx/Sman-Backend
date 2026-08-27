const { pgTable, index, unique, bigint, timestamp, integer, foreignKey, check, numeric } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { consumerProduct } = require("./consumerProduct");
const { consumerStates } = require("./consumerStates");

const consumerProductprice = pgTable("consumer_productprice", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_productprice_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	price: numeric({ precision: 10, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	productId: bigint("product_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	stateId: bigint("state_id", { mode: "number" }).notNull(),
	initialStockQuantity: integer("initial_stock_quantity").notNull(),
	stockQuantity: integer("stock_quantity").notNull(),
}, (table) => [
	index("consumer_productprice_product_id_af686dda").using("btree", table.productId.asc().nullsLast().op("int8_ops")),
	index("consumer_productprice_state_id_38860880").using("btree", table.stateId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [consumerProduct.id],
			name: "consumer_productpric_product_id_af686dda_fk_consumer_"
		}),
	foreignKey({
			columns: [table.stateId],
			foreignColumns: [consumerStates.id],
			name: "consumer_productprice_state_id_38860880_fk_consumer_states_id"
		}),
	unique("consumer_productprice_product_id_state_id_819d2e1d_uniq").on(table.productId, table.stateId),
	check("consumer_productprice_initial_stock_quantity_check", sql`initial_stock_quantity >= 0`),
	check("consumer_productprice_stock_quantity_check", sql`stock_quantity >= 0`),
]);

module.exports = { consumerProductprice };
