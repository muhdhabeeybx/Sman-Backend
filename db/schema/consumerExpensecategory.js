const { pgTable, index, unique, bigint, varchar, boolean, timestamp, text, foreignKey } = require("drizzle-orm/pg-core");
const { consumerPfi } = require("./consumerPfi");

const consumerExpensecategory = pgTable("consumer_expensecategory", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_expensecategory_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 100 }).notNull(),
	description: text().notNull(),
	isSystemCategory: boolean("is_system_category").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }),
}, (table) => [
	index("consumer_ex_is_syst_9fd317_idx").using("btree", table.isSystemCategory.asc().nullsLast().op("bool_ops")),
	index("consumer_ex_name_9709e8_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("consumer_expensecategory_name_3331ece2_like").using("btree", table.name.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_expensecategory_pfi_id_7ce97f76").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "consumer_expensecategory_pfi_id_7ce97f76_fk_consumer_pfi_id"
		}),
	unique("consumer_expensecategory_name_key").on(table.name),
]);

module.exports = { consumerExpensecategory };
