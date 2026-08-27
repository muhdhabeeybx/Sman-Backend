const { pgTable, index, unique, bigint, varchar, timestamp, text, foreignKey, jsonb, numeric, date } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerBankacct } = require("./consumerBankacct");
const { consumerBankstatement } = require("./consumerBankstatement");
const { consumerOrder } = require("./consumerOrder");
const { consumerOrderpaymentrecord } = require("./consumerOrderpaymentrecord");

const consumerBankstatementline = pgTable("consumer_bankstatementline", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_bankstatementline_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	transactionDate: date("transaction_date").notNull(),
	depositorName: varchar("depositor_name", { length: 255 }),
	bankRef: varchar("bank_ref", { length: 255 }),
	amount: numeric({ precision: 14, scale:  2 }).notNull(),
	narration: text(),
	rawRow: jsonb("raw_row"),
	dedupKey: varchar("dedup_key", { length: 64 }).notNull(),
	status: varchar({ length: 20 }).notNull(),
	matchedAt: timestamp("matched_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bankAccountId: bigint("bank_account_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	matchedById: bigint("matched_by_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	matchedOrderId: bigint("matched_order_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	matchedPaymentRecordId: bigint("matched_payment_record_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	statementId: bigint("statement_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_bankstatementline_bank_account_id_2f7ac500").using("btree", table.bankAccountId.asc().nullsLast().op("int8_ops")),
	index("consumer_bankstatementline_dedup_key_160f79ec").using("btree", table.dedupKey.asc().nullsLast().op("text_ops")),
	index("consumer_bankstatementline_dedup_key_160f79ec_like").using("btree", table.dedupKey.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_bankstatementline_matched_by_id_605ad10f").using("btree", table.matchedById.asc().nullsLast().op("int8_ops")),
	index("consumer_bankstatementline_matched_order_id_b2520e81").using("btree", table.matchedOrderId.asc().nullsLast().op("int8_ops")),
	index("consumer_bankstatementline_matched_payment_record_id_b2f56ecb").using("btree", table.matchedPaymentRecordId.asc().nullsLast().op("int8_ops")),
	index("consumer_bankstatementline_statement_id_13b4c42e").using("btree", table.statementId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.bankAccountId],
			foreignColumns: [consumerBankacct.id],
			name: "consumer_bankstateme_bank_account_id_2f7ac500_fk_consumer_"
		}),
	foreignKey({
			columns: [table.matchedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_bankstateme_matched_by_id_605ad10f_fk_administr"
		}),
	foreignKey({
			columns: [table.matchedOrderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_bankstateme_matched_order_id_b2520e81_fk_consumer_"
		}),
	foreignKey({
			columns: [table.matchedPaymentRecordId],
			foreignColumns: [consumerOrderpaymentrecord.id],
			name: "consumer_bankstateme_matched_payment_reco_b2f56ecb_fk_consumer_"
		}),
	foreignKey({
			columns: [table.statementId],
			foreignColumns: [consumerBankstatement.id],
			name: "consumer_bankstateme_statement_id_13b4c42e_fk_consumer_"
		}),
	unique("unique_bank_statement_line_per_account").on(table.dedupKey, table.bankAccountId),
]);

module.exports = { consumerBankstatementline };
