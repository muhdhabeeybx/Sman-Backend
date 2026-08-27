const { pgTable, index, unique, bigint, boolean, timestamp, text, foreignKey, date } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");

const administrationDailyreportapproval = pgTable("administration_dailyreportapproval", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_dailyreportapproval_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	date: date().notNull(),
	approved: boolean().notNull(),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	sent: boolean().notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	sentLog: text("sent_log"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	approvedById: bigint("approved_by_id", { mode: "number" }),
}, (table) => [
	index("administration_dailyreportapproval_approved_by_id_1330bc97").using("btree", table.approvedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.approvedById],
			foreignColumns: [administrationUser.id],
			name: "administration_daily_approved_by_id_1330bc97_fk_administr"
		}),
	unique("administration_dailyreportapproval_date_key").on(table.date),
]);

module.exports = { administrationDailyreportapproval };
