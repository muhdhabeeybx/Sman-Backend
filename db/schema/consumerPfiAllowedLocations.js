const { pgTable, index, unique, bigint, foreignKey } = require("drizzle-orm/pg-core");
const { consumerPfi } = require("./consumerPfi");
const { consumerStates } = require("./consumerStates");

const consumerPfiAllowedLocations = pgTable("consumer_pfi_allowed_locations", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pfi_allowed_locations_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	statesId: bigint("states_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_pfi_allowed_locations_pfi_id_1b1283ab").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_allowed_locations_states_id_e5116c02").using("btree", table.statesId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "consumer_pfi_allowed_pfi_id_1b1283ab_fk_consumer_"
		}),
	foreignKey({
			columns: [table.statesId],
			foreignColumns: [consumerStates.id],
			name: "consumer_pfi_allowed_states_id_e5116c02_fk_consumer_"
		}),
	unique("consumer_pfi_allowed_locations_pfi_id_states_id_55c44755_uniq").on(table.pfiId, table.statesId),
]);

module.exports = { consumerPfiAllowedLocations };
