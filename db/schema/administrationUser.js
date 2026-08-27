const { pgTable, index, unique, bigint, varchar, boolean, timestamp, integer, inet, text } = require("drizzle-orm/pg-core");

const administrationUser = pgTable("administration_user", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_user_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	password: varchar({ length: 128 }).notNull(),
	isSuperuser: boolean("is_superuser").notNull(),
	isStaff: boolean("is_staff").notNull(),
	isActive: boolean("is_active").notNull(),
	dateJoined: timestamp("date_joined", { withTimezone: true, mode: 'string' }).notNull(),
	username: varchar({ length: 150 }),
	fullName: varchar("full_name", { length: 200 }).notNull(),
	email: varchar({ length: 150 }).notNull(),
	phoneNumber: varchar("phone_number", { length: 11 }),
	deviceToken: varchar("device_token", { length: 255 }),
	emailVerified: boolean("email_verified").notNull(),
	photo: varchar({ length: 100 }),
	suspended: boolean().notNull(),
	lastLogin: timestamp("last_login", { withTimezone: true, mode: 'string' }).notNull(),
	role: integer().notNull(),
	lastLoginIp: inet("last_login_ip"),
	lastLoginUserAgent: text("last_login_user_agent"),
	canViewAllLocations: boolean("can_view_all_locations").notNull(),
	location: varchar({ length: 50 }),
	plainPassword: varchar("plain_password", { length: 128 }),
	roles: integer().array().notNull(),
}, (table) => [
	index("administrat_id_fe5ec4_idx").using("btree", table.id.asc().nullsLast().op("text_ops"), table.email.asc().nullsLast().op("int8_ops")),
	index("administration_user_email_1d334039_like").using("btree", table.email.asc().nullsLast().op("varchar_pattern_ops")),
	index("administration_user_phone_number_45df971d_like").using("btree", table.phoneNumber.asc().nullsLast().op("varchar_pattern_ops")),
	unique("administration_user_email_key").on(table.email),
	unique("administration_user_phone_number_key").on(table.phoneNumber),
]);

module.exports = { administrationUser };
