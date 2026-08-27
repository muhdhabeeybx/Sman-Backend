const { pgTable, index, unique, varchar, integer } = require("drizzle-orm/pg-core");

const authGroup = pgTable("auth_group", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "auth_group_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: varchar({ length: 150 }).notNull(),
}, (table) => [
	index("auth_group_name_a6ea08ec_like").using("btree", table.name.asc().nullsLast().op("varchar_pattern_ops")),
	unique("auth_group_name_key").on(table.name),
]);

module.exports = { authGroup };
