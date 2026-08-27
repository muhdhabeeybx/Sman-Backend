const { pgTable, index, unique, bigint, varchar, timestamp, text, foreignKey, numeric, date } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerBankacct } = require("./consumerBankacct");
const { consumerOrder } = require("./consumerOrder");

const consumerOrderpaymentrecord = pgTable("consumer_orderpaymentrecord", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_orderpaymentrecord_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	amount: numeric({ precision: 14, scale:  2 }).notNull(),
	paymentDate: date("payment_date").notNull(),
	payerName: varchar("payer_name", { length: 255 }),
	bankName: varchar("bank_name", { length: 200 }),
	accountNumber: varchar("account_number", { length: 200 }),
	accountName: varchar("account_name", { length: 200 }),
	transactionReference: varchar("transaction_reference", { length: 64 }),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bankAccountId: bigint("bank_account_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdById: bigint("created_by_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_orderpaymentrecord_bank_account_id_bdb936a0").using("btree", table.bankAccountId.asc().nullsLast().op("int8_ops")),
	index("consumer_orderpaymentrecord_created_by_id_2a9cfe40").using("btree", table.createdById.asc().nullsLast().op("int8_ops")),
	index("consumer_orderpaymentrecord_order_id_0eab3d95").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	index("consumer_orderpaymentrecord_transaction_reference_23fa21d7_like").using("btree", table.transactionReference.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.bankAccountId],
			foreignColumns: [consumerBankacct.id],
			name: "consumer_orderpaymen_bank_account_id_bdb936a0_fk_consumer_"
		}),
	foreignKey({
			columns: [table.createdById],
			foreignColumns: [administrationUser.id],
			name: "consumer_orderpaymen_created_by_id_2a9cfe40_fk_administr"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_orderpaymen_order_id_0eab3d95_fk_consumer_"
		}),
	unique("consumer_orderpaymentrecord_transaction_reference_key").on(table.transactionReference),
]);

module.exports = { consumerOrderpaymentrecord };
