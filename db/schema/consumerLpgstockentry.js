const { pgTable, index, unique, bigint, timestamp, text, foreignKey, numeric, date } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerLpgplant } = require("./consumerLpgplant");

const consumerLpgstockentry = pgTable("consumer_lpgstockentry", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_lpgstockentry_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	date: date().notNull(),
	openingStockKg: numeric("opening_stock_kg", { precision: 14, scale:  2 }).notNull(),
	receivedKg: numeric("received_kg", { precision: 14, scale:  2 }).notNull(),
	soldKg: numeric("sold_kg", { precision: 14, scale:  2 }).notNull(),
	closingStockKg: numeric("closing_stock_kg", { precision: 14, scale:  2 }).notNull(),
	remarks: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	plantId: bigint("plant_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	recordedById: bigint("recorded_by_id", { mode: "number" }),
}, (table) => [
	index("consumer_lpgstockentry_plant_id_76489617").using("btree", table.plantId.asc().nullsLast().op("int8_ops")),
	index("consumer_lpgstockentry_recorded_by_id_8df38296").using("btree", table.recordedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.plantId],
			foreignColumns: [consumerLpgplant.id],
			name: "consumer_lpgstockent_plant_id_76489617_fk_consumer_"
		}),
	foreignKey({
			columns: [table.recordedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_lpgstockent_recorded_by_id_8df38296_fk_administr"
		}),
	unique("unique_lpg_stock_entry_per_plant_day").on(table.date, table.plantId),
]);

module.exports = { consumerLpgstockentry };
