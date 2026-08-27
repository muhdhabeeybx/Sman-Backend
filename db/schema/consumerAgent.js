const { pgTable, index, unique, bigint, varchar, boolean, timestamp, foreignKey } = require("drizzle-orm/pg-core");
const { consumerStates } = require("./consumerStates");

const consumerAgent = pgTable("consumer_agent", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_agent_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 128 }).notNull(),
	phone: varchar({ length: 32 }).notNull(),
	type: varchar({ length: 16 }).notNull(),
	isActive: boolean("is_active").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	locationId: bigint("location_id", { mode: "number" }),
}, (table) => [
	index("consumer_agent_location_id_81f36b58").using("btree", table.locationId.asc().nullsLast().op("int8_ops")),
	index("consumer_agent_phone_9cf6c3c3_like").using("btree", table.phone.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [consumerStates.id],
			name: "consumer_agent_location_id_81f36b58_fk_consumer_states_id"
		}),
	unique("consumer_agent_phone_key").on(table.phone),
]);

module.exports = { consumerAgent };
