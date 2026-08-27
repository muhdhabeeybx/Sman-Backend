const { pgTable, index, bigint, varchar, timestamp, integer, text, foreignKey, jsonb, numeric } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");

const administrationRecord = pgTable("administration_record", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_record_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	category: varchar({ length: 30 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text().notNull(),
	amount: numeric({ precision: 15, scale:  2 }),
	status: varchar({ length: 10 }).notNull(),
	extra: jsonb().notNull(),
	file: varchar({ length: 100 }),
	submittedByName: varchar("submitted_by_name", { length: 255 }).notNull(),
	pfiId: integer("pfi_id"),
	pfiNumber: varchar("pfi_number", { length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	submittedById: bigint("submitted_by_id", { mode: "number" }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	reviewedById: bigint("reviewed_by_id", { mode: "number" }),
	reviewedByName: varchar("reviewed_by_name", { length: 255 }).notNull(),
	statusNote: text("status_note").notNull(),
}, (table) => [
	index("administration_record_reviewed_by_id_21c842b0").using("btree", table.reviewedById.asc().nullsLast().op("int8_ops")),
	index("administration_record_submitted_by_id_bf85d70b").using("btree", table.submittedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.submittedById],
			foreignColumns: [administrationUser.id],
			name: "administration_recor_submitted_by_id_bf85d70b_fk_administr"
		}),
	foreignKey({
			columns: [table.reviewedById],
			foreignColumns: [administrationUser.id],
			name: "administration_recor_reviewed_by_id_21c842b0_fk_administr"
		}),
]);

module.exports = { administrationRecord };
