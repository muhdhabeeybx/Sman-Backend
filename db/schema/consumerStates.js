const { pgTable, bigint, varchar, timestamp } = require("drizzle-orm/pg-core");

const consumerStates = pgTable("consumer_states", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_states_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 200 }).notNull(),
	abbreviation: varchar({ length: 200 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	status: varchar({ length: 200 }).notNull(),
	classifier: varchar({ length: 20 }).notNull(),
});

module.exports = { consumerStates };
