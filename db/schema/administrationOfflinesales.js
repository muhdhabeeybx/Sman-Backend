const { pgTable, index, bigint, varchar, timestamp, text, foreignKey, numeric } = require("drizzle-orm/pg-core");
const { consumerStates } = require("./consumerStates");

const administrationOfflinesales = pgTable("administration_offlinesales", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_offlinesales_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	staff: varchar({ length: 70 }).notNull(),
	status: varchar({ length: 50 }).notNull(),
	totalPrice: numeric("total_price", { precision: 12, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	notes: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	stateId: bigint("state_id", { mode: "number" }),
}, (table) => [
	index("administrat_id_16afc1_idx").using("btree", table.id.asc().nullsLast().op("int8_ops")),
	index("administration_offlinesales_state_id_1e65a692").using("btree", table.stateId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.stateId],
			foreignColumns: [consumerStates.id],
			name: "administration_offli_state_id_1e65a692_fk_consumer_"
		}),
]);

module.exports = { administrationOfflinesales };
