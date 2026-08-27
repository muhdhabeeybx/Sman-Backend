const { pgTable, index, unique, bigint, varchar, timestamp, integer, foreignKey, check } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { administrationUser } = require("./administrationUser");
const { consumerBankacct } = require("./consumerBankacct");

const consumerBankstatementcolumnmapping = pgTable("consumer_bankstatementcolumnmapping", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_bankstatementcolumnmapping_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	headerRow: integer("header_row").notNull(),
	dateColumn: varchar("date_column", { length: 200 }).notNull(),
	amountColumn: varchar("amount_column", { length: 200 }).notNull(),
	depositorColumn: varchar("depositor_column", { length: 200 }),
	referenceColumn: varchar("reference_column", { length: 200 }),
	narrationColumn: varchar("narration_column", { length: 200 }),
	creditColumn: varchar("credit_column", { length: 200 }),
	sampleFileName: varchar("sample_file_name", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bankAccountId: bigint("bank_account_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdById: bigint("created_by_id", { mode: "number" }),
}, (table) => [
	index("consumer_bankstatementcolumnmapping_created_by_id_5146d134").using("btree", table.createdById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.bankAccountId],
			foreignColumns: [consumerBankacct.id],
			name: "consumer_bankstateme_bank_account_id_7a1aebf2_fk_consumer_"
		}),
	foreignKey({
			columns: [table.createdById],
			foreignColumns: [administrationUser.id],
			name: "consumer_bankstateme_created_by_id_5146d134_fk_administr"
		}),
	unique("consumer_bankstatementcolumnmapping_bank_account_id_key").on(table.bankAccountId),
	check("consumer_bankstatementcolumnmapping_header_row_check", sql`header_row >= 0`),
]);

module.exports = { consumerBankstatementcolumnmapping };
