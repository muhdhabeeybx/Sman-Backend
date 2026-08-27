const { pgTable, index, bigint, varchar, timestamp, integer, foreignKey, check } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { administrationUser } = require("./administrationUser");
const { consumerBankacct } = require("./consumerBankacct");

const consumerBankstatement = pgTable("consumer_bankstatement", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_bankstatement_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	file: varchar({ length: 100 }).notNull(),
	originalFileName: varchar("original_file_name", { length: 255 }),
	rowCount: integer("row_count").notNull(),
	newLineCount: integer("new_line_count").notNull(),
	duplicateLineCount: integer("duplicate_line_count").notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bankAccountId: bigint("bank_account_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	uploadedById: bigint("uploaded_by_id", { mode: "number" }),
}, (table) => [
	index("consumer_bankstatement_bank_account_id_2c8407c0").using("btree", table.bankAccountId.asc().nullsLast().op("int8_ops")),
	index("consumer_bankstatement_uploaded_by_id_ebed2fb2").using("btree", table.uploadedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.bankAccountId],
			foreignColumns: [consumerBankacct.id],
			name: "consumer_bankstateme_bank_account_id_2c8407c0_fk_consumer_"
		}),
	foreignKey({
			columns: [table.uploadedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_bankstateme_uploaded_by_id_ebed2fb2_fk_administr"
		}),
	check("consumer_bankstatement_row_count_check", sql`row_count >= 0`),
	check("consumer_bankstatement_new_line_count_check", sql`new_line_count >= 0`),
	check("consumer_bankstatement_duplicate_line_count_check", sql`duplicate_line_count >= 0`),
]);

module.exports = { consumerBankstatement };
