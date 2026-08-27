const { pgTable, index, bigint, varchar, timestamp, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerPfiexpense } = require("./consumerPfiexpense");

const consumerPfiexpenseattachment = pgTable("consumer_pfiexpenseattachment", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pfiexpenseattachment_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	file: varchar({ length: 100 }).notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	contentType: varchar("content_type", { length: 120 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expenseId: bigint("expense_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	uploadedById: bigint("uploaded_by_id", { mode: "number" }),
}, (table) => [
	index("consumer_pf_expense_2ea477_idx").using("btree", table.expenseId.asc().nullsLast().op("int8_ops"), table.uploadedAt.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpenseattachment_expense_id_a4da6eae").using("btree", table.expenseId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpenseattachment_uploaded_by_id_a1f0da1d").using("btree", table.uploadedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.expenseId],
			foreignColumns: [consumerPfiexpense.id],
			name: "consumer_pfiexpensea_expense_id_a4da6eae_fk_consumer_"
		}),
	foreignKey({
			columns: [table.uploadedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpensea_uploaded_by_id_a1f0da1d_fk_administr"
		}),
]);

module.exports = { consumerPfiexpenseattachment };
