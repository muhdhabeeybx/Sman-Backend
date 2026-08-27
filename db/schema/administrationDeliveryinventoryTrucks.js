const { pgTable, index, unique, bigint, foreignKey } = require("drizzle-orm/pg-core");
const { administrationDeliveryinventory } = require("./administrationDeliveryinventory");
const { consumerFleettruck } = require("./consumerFleettruck");

const administrationDeliveryinventoryTrucks = pgTable("administration_deliveryinventory_trucks", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_deliveryinventory_trucks_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	deliveryinventoryId: bigint("deliveryinventory_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fleettruckId: bigint("fleettruck_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_deliveryinv_deliveryinventory_id_919898f4").using("btree", table.deliveryinventoryId.asc().nullsLast().op("int8_ops")),
	index("administration_deliveryinventory_trucks_fleettruck_id_f102cd04").using("btree", table.fleettruckId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.deliveryinventoryId],
			foreignColumns: [administrationDeliveryinventory.id],
			name: "administration_deliv_deliveryinventory_id_919898f4_fk_administr"
		}),
	foreignKey({
			columns: [table.fleettruckId],
			foreignColumns: [consumerFleettruck.id],
			name: "administration_deliv_fleettruck_id_f102cd04_fk_consumer_"
		}),
	unique("administration_deliveryi_deliveryinventory_id_fle_48f19848_uniq").on(table.deliveryinventoryId, table.fleettruckId),
]);

module.exports = { administrationDeliveryinventoryTrucks };
