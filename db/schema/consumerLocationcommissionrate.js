const { pgTable, index, unique, bigint, timestamp, foreignKey, numeric } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerStates } = require("./consumerStates");

const consumerLocationcommissionrate = pgTable("consumer_locationcommissionrate", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_locationcommissionrate_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	rateBelow500K: numeric("rate_below_500k", { precision: 10, scale:  2 }).notNull(),
	rate500KTo1M: numeric("rate_500k_to_1m", { precision: 10, scale:  2 }).notNull(),
	rateAbove1M: numeric("rate_above_1m", { precision: 10, scale:  2 }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	locationId: bigint("location_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedById: bigint("updated_by_id", { mode: "number" }),
}, (table) => [
	index("consumer_locationcommissionrate_updated_by_id_3f821a33").using("btree", table.updatedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [consumerStates.id],
			name: "consumer_locationcom_location_id_aef2c6fe_fk_consumer_"
		}),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_locationcom_updated_by_id_3f821a33_fk_administr"
		}),
	unique("consumer_locationcommissionrate_location_id_key").on(table.locationId),
]);

module.exports = { consumerLocationcommissionrate };
