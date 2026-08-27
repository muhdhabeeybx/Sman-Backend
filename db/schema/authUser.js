const { pgTable, index, unique, varchar, boolean, timestamp, integer } = require("drizzle-orm/pg-core");

const authUser = pgTable("auth_user", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "auth_user_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	password: varchar({ length: 128 }).notNull(),
	lastLogin: timestamp("last_login", { withTimezone: true, mode: 'string' }),
	isSuperuser: boolean("is_superuser").notNull(),
	username: varchar({ length: 150 }).notNull(),
	firstName: varchar("first_name", { length: 150 }).notNull(),
	lastName: varchar("last_name", { length: 150 }).notNull(),
	email: varchar({ length: 254 }).notNull(),
	isStaff: boolean("is_staff").notNull(),
	isActive: boolean("is_active").notNull(),
	dateJoined: timestamp("date_joined", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("auth_user_username_6821ab7c_like").using("btree", table.username.asc().nullsLast().op("varchar_pattern_ops")),
	unique("auth_user_username_key").on(table.username),
]);

module.exports = { authUser };
