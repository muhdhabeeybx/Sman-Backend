const { pgTable, index, unique, bigint, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerStates } = require("./consumerStates");

const administrationUserLocations = pgTable("administration_user_locations", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_user_locations_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	statesId: bigint("states_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_user_locations_states_id_ff603b53").using("btree", table.statesId.asc().nullsLast().op("int8_ops")),
	index("administration_user_locations_user_id_89ab3271").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.statesId],
			foreignColumns: [consumerStates.id],
			name: "administration_user__states_id_ff603b53_fk_consumer_"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "administration_user__user_id_89ab3271_fk_administr"
		}).onDelete("cascade"),
	unique("administration_user_locations_user_id_states_id_1dde7470_uniq").on(table.userId, table.statesId),
]);

module.exports = { administrationUserLocations };
