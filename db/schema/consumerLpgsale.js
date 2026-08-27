const { pgTable, index, unique, bigint, varchar, boolean, timestamp, foreignKey, numeric, date } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerLpgplant } = require("./consumerLpgplant");

const consumerLpgsale = pgTable("consumer_lpgsale", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_lpgsale_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	date: date().notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	kg: numeric({ precision: 14, scale:  2 }).notNull(),
	pricePerKg: numeric("price_per_kg", { precision: 14, scale:  2 }).notNull(),
	amount: numeric({ precision: 14, scale:  2 }).notNull(),
	paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
	invoiceNumber: varchar("invoice_number", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	cashierId: bigint("cashier_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	plantId: bigint("plant_id", { mode: "number" }).notNull(),
	bulkDiscountPerKg: numeric("bulk_discount_per_kg", { precision: 14, scale:  2 }),
	isBulk: boolean("is_bulk").notNull(),
}, (table) => [
	index("consumer_lpgsale_cashier_id_309419be").using("btree", table.cashierId.asc().nullsLast().op("int8_ops")),
	index("consumer_lpgsale_invoice_number_5db198f8_like").using("btree", table.invoiceNumber.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_lpgsale_plant_id_d1f1981c").using("btree", table.plantId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.cashierId],
			foreignColumns: [administrationUser.id],
			name: "consumer_lpgsale_cashier_id_309419be_fk_administration_user_id"
		}),
	foreignKey({
			columns: [table.plantId],
			foreignColumns: [consumerLpgplant.id],
			name: "consumer_lpgsale_plant_id_d1f1981c_fk_consumer_lpgplant_id"
		}),
	unique("consumer_lpgsale_invoice_number_5db198f8_uniq").on(table.invoiceNumber),
]);

module.exports = { consumerLpgsale };
