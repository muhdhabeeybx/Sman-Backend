const { pgTable, index, unique, bigint, varchar, timestamp, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");

const authtokenToken = pgTable("authtoken_token", {
	key: varchar({ length: 40 }).primaryKey().notNull(),
	created: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	index("authtoken_token_key_10f0b77e_like").using("btree", table.key.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "authtoken_token_user_id_35299eff_fk_administration_user_id"
		}),
	unique("authtoken_token_user_id_key").on(table.userId),
]);

module.exports = { authtokenToken };
