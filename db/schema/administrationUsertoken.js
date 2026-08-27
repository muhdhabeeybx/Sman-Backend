const { pgTable, index, unique, bigint, varchar, timestamp, inet, text, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");

const administrationUsertoken = pgTable("administration_usertoken", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_usertoken_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	key: varchar({ length: 64 }).notNull(),
	created: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	userAgent: text("user_agent").notNull(),
	ipAddress: inet("ip_address"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_usertoken_key_e78d26b6_like").using("btree", table.key.asc().nullsLast().op("varchar_pattern_ops")),
	index("administration_usertoken_user_id_bec07dde").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "administration_usert_user_id_bec07dde_fk_administr"
		}),
	unique("administration_usertoken_key_key").on(table.key),
]);

module.exports = { administrationUsertoken };
