const { pgTable, bigint, varchar, text } = require("drizzle-orm/pg-core");

const consumerPaymentchannels = pgTable("consumer_paymentchannels", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_paymentchannels_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 200 }).notNull(),
	status: varchar({ length: 200 }).notNull(),
	publicKey: varchar("public_key", { length: 200 }),
	initUrl: varchar("init_url", { length: 200 }),
	description: text().notNull(),
	cName: varchar("c_name", { length: 200 }),
});

module.exports = { consumerPaymentchannels };
