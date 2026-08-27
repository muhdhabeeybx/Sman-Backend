const { pgTable, index, unique, bigint, varchar, timestamp, foreignKey } = require("drizzle-orm/pg-core");
const { consumerBankacct } = require("./consumerBankacct");
const { consumerOrder } = require("./consumerOrder");
const { consumerPaymentchannels } = require("./consumerPaymentchannels");

const consumerOrderpaymentinfo = pgTable("consumer_orderpaymentinfo", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_orderpaymentinfo_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	acct: varchar({ length: 200 }),
	status: varchar({ length: 200 }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	paymentChannelId: bigint("payment_channel_id", { mode: "number" }),
	reference: varchar({ length: 64 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bankAccountId: bigint("bank_account_id", { mode: "number" }),
	paidToAccountName: varchar("paid_to_account_name", { length: 200 }),
	paidToAccountNumber: varchar("paid_to_account_number", { length: 200 }),
	paidToBankName: varchar("paid_to_bank_name", { length: 200 }),
}, (table) => [
	index("consumer_orderpaymentinfo_bank_account_id_faab00d8").using("btree", table.bankAccountId.asc().nullsLast().op("int8_ops")),
	index("consumer_orderpaymentinfo_payment_channel_id_f3fe2953").using("btree", table.paymentChannelId.asc().nullsLast().op("int8_ops")),
	index("consumer_orderpaymentinfo_reference_0d72d9af_like").using("btree", table.reference.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.bankAccountId],
			foreignColumns: [consumerBankacct.id],
			name: "consumer_orderpaymen_bank_account_id_faab00d8_fk_consumer_"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_orderpaymen_order_id_3803ba7a_fk_consumer_"
		}),
	foreignKey({
			columns: [table.paymentChannelId],
			foreignColumns: [consumerPaymentchannels.id],
			name: "consumer_orderpaymen_payment_channel_id_f3fe2953_fk_consumer_"
		}),
	unique("consumer_orderpaymentinfo_order_id_key").on(table.orderId),
	unique("consumer_orderpaymentinfo_reference_key").on(table.reference),
]);

module.exports = { consumerOrderpaymentinfo };
