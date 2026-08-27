const { pgTable, index, unique, bigint, varchar, boolean, timestamp } = require("drizzle-orm/pg-core");

const administrationReportrecipient = pgTable("administration_reportrecipient", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_reportrecipient_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	email: varchar({ length: 254 }).notNull(),
	name: varchar({ length: 150 }).notNull(),
	active: boolean().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("administration_reportrecipient_email_c2436747_like").using("btree", table.email.asc().nullsLast().op("varchar_pattern_ops")),
	unique("administration_reportrecipient_email_key").on(table.email),
]);

module.exports = { administrationReportrecipient };
