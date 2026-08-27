const { pgTable, index, unique, bigint, varchar } = require("drizzle-orm/pg-core");

const administrationCategory = pgTable("administration_category", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_category_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 30 }).notNull(),
	description: varchar({ length: 500 }),
}, (table) => [
	index("administration_category_name_6b6f3a73_like").using("btree", table.name.asc().nullsLast().op("varchar_pattern_ops")),
	unique("administration_category_name_key").on(table.name),
]);

module.exports = { administrationCategory };
