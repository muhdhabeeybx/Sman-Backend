const { pgTable, index, bigint, varchar, timestamp, text, foreignKey, numeric, date } = require("drizzle-orm/pg-core");
const { consumerFleettruck } = require("./consumerFleettruck");

const consumerFleetledgerentry = pgTable("consumer_fleetledgerentry", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_fleetledgerentry_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	entryType: varchar("entry_type", { length: 10 }).notNull(),
	category: varchar({ length: 100 }).notNull(),
	amount: numeric({ precision: 14, scale:  2 }).notNull(),
	date: date().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	truckId: bigint("truck_id", { mode: "number" }).notNull(),
	enteredBy: varchar("entered_by", { length: 255 }),
}, (table) => [
	index("consumer_fleetledgerentry_truck_id_b9b435d2").using("btree", table.truckId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.truckId],
			foreignColumns: [consumerFleettruck.id],
			name: "consumer_fleetledger_truck_id_b9b435d2_fk_consumer_"
		}),
]);

module.exports = { consumerFleetledgerentry };
