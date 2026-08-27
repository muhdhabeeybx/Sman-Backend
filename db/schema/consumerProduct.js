const { pgTable, bigint, varchar, boolean, timestamp, integer, text, check } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

const consumerProduct = pgTable("consumer_product", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_product_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 200 }).notNull(),
	abbreviation: varchar({ length: 50 }).notNull(),
	description: text().notNull(),
	stockQuantity: integer("stock_quantity").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	initialStockQuantity: integer("initial_stock_quantity").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	isDeleted: boolean("is_deleted").notNull(),
	unit: varchar({ length: 10 }).notNull(),
}, (table) => [
	check("consumer_product_initial_stock_quantity_check", sql`initial_stock_quantity >= 0`),
	check("consumer_product_stock_quantity_check", sql`stock_quantity >= 0`),
]);

module.exports = { consumerProduct };
