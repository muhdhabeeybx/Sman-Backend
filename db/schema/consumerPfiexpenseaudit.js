const { pgTable, index, bigint, varchar, timestamp, foreignKey, jsonb } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerPfiexpense } = require("./consumerPfiexpense");

const consumerPfiexpenseaudit = pgTable("consumer_pfiexpenseaudit", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pfiexpenseaudit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	action: varchar({ length: 20 }).notNull(),
	changedFields: jsonb("changed_fields").notNull(),
	performedAt: timestamp("performed_at", { withTimezone: true, mode: 'string' }).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expenseId: bigint("expense_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	performedById: bigint("performed_by_id", { mode: "number" }),
}, (table) => [
	index("consumer_pf_action_4855c9_idx").using("btree", table.action.asc().nullsLast().op("timestamptz_ops"), table.performedAt.asc().nullsLast().op("text_ops")),
	index("consumer_pf_expense_bb88ea_idx").using("btree", table.expenseId.asc().nullsLast().op("int8_ops"), table.performedAt.asc().nullsLast().op("timestamptz_ops")),
	index("consumer_pfiexpenseaudit_expense_id_11474495").using("btree", table.expenseId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpenseaudit_performed_by_id_52a514fe").using("btree", table.performedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.expenseId],
			foreignColumns: [consumerPfiexpense.id],
			name: "consumer_pfiexpensea_expense_id_11474495_fk_consumer_"
		}),
	foreignKey({
			columns: [table.performedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpensea_performed_by_id_52a514fe_fk_administr"
		}),
]);

module.exports = { consumerPfiexpenseaudit };
