const { pgTable, index, unique, bigint, integer, foreignKey, check } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { administrationOfflinesales } = require("./administrationOfflinesales");
const { consumerProduct } = require("./consumerProduct");

const administrationOfflinesalesproduct = pgTable("administration_offlinesalesproduct", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_offlinesalesproduct_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	quantity: integer().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	offlineId: bigint("offline_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	productId: bigint("product_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_offlinesalesproduct_offline_id_8f4058e0").using("btree", table.offlineId.asc().nullsLast().op("int8_ops")),
	index("administration_offlinesalesproduct_product_id_56de22b3").using("btree", table.productId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.offlineId],
			foreignColumns: [administrationOfflinesales.id],
			name: "administration_offli_offline_id_8f4058e0_fk_administr"
		}),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [consumerProduct.id],
			name: "administration_offli_product_id_56de22b3_fk_consumer_"
		}),
	unique("administration_offlinesa_offline_id_product_id_d88292d1_uniq").on(table.offlineId, table.productId),
	check("administration_offlinesalesproduct_quantity_check", sql`quantity >= 0`),
]);

module.exports = { administrationOfflinesalesproduct };
