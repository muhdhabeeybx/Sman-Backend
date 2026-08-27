const { pgTable, index, unique, bigint, varchar, boolean, timestamp, foreignKey } = require("drizzle-orm/pg-core");
const { consumerPfi } = require("./consumerPfi");
const { consumerStates } = require("./consumerStates");

const consumerBankacct = pgTable("consumer_bankacct", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_bankacct_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 200 }).notNull(),
	acctNo: varchar("acct_no", { length: 200 }),
	bankName: varchar("bank_name", { length: 200 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	suspended: boolean().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	locationId: bigint("location_id", { mode: "number" }),
	isActive: boolean("is_active").notNull(),
	isPrimary: boolean("is_primary").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }),
}, (table) => [
	index("consumer_bankacct_acct_no_6a4701a1_like").using("btree", table.acctNo.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_bankacct_location_id_9cc0b835").using("btree", table.locationId.asc().nullsLast().op("int8_ops")),
	index("consumer_bankacct_pfi_id_386c609a").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [consumerStates.id],
			name: "consumer_bankacct_location_id_9cc0b835_fk_consumer_states_id"
		}),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "consumer_bankacct_pfi_id_386c609a_fk_consumer_pfi_id"
		}),
	unique("consumer_bankacct_acct_no_key").on(table.acctNo),
]);

module.exports = { consumerBankacct };
