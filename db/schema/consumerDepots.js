const { pgTable, bigint, varchar } = require("drizzle-orm/pg-core");

const consumerDepots = pgTable("consumer_depots", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_depots_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 200 }).notNull(),
	location: varchar({ length: 200 }).notNull(),
});

module.exports = { consumerDepots };
