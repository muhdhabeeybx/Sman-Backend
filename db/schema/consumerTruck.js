const { pgTable, index, unique, bigint, varchar, timestamp } = require("drizzle-orm/pg-core");

const consumerTruck = pgTable("consumer_truck", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_truck_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	no: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("consumer_truck_no_fff21c6f_like").using("btree", table.no.asc().nullsLast().op("varchar_pattern_ops")),
	unique("consumer_truck_no_key").on(table.no),
]);

module.exports = { consumerTruck };
