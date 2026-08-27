const { pgTable, index, unique, bigint, varchar, boolean, timestamp, integer, foreignKey, check, numeric } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { consumerStates } = require("./consumerStates");

const consumerLpgplant = pgTable("consumer_lpgplant", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_lpgplant_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 200 }).notNull(),
	capacityKg: numeric("capacity_kg", { precision: 14, scale:  2 }),
	lowStockThresholdKg: numeric("low_stock_threshold_kg", { precision: 14, scale:  2 }).notNull(),
	isActive: boolean("is_active").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	locationId: bigint("location_id", { mode: "number" }),
	bulkThresholdKg: numeric("bulk_threshold_kg", { precision: 14, scale:  2 }).notNull(),
	nextReceiptSeq: integer("next_receipt_seq").notNull(),
	pricePerKg: numeric("price_per_kg", { precision: 14, scale:  2 }),
	code: varchar({ length: 10 }).notNull(),
}, (table) => [
	index("consumer_lpgplant_code_11df6dd8_like").using("btree", table.code.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_lpgplant_location_id_28f59289").using("btree", table.locationId.asc().nullsLast().op("int8_ops")),
	index("consumer_lpgplant_name_a73c3732_like").using("btree", table.name.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [consumerStates.id],
			name: "consumer_lpgplant_location_id_28f59289_fk_consumer_states_id"
		}),
	unique("consumer_lpgplant_name_key").on(table.name),
	unique("consumer_lpgplant_code_11df6dd8_uniq").on(table.code),
	check("consumer_lpgplant_next_receipt_seq_check", sql`next_receipt_seq >= 0`),
]);

module.exports = { consumerLpgplant };
