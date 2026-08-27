const { pgTable, index, unique, bigint, foreignKey } = require("drizzle-orm/pg-core");
const { administrationOfflinesales } = require("./administrationOfflinesales");
const { consumerTruck } = require("./consumerTruck");

const administrationOfflinesalesTrucks = pgTable("administration_offlinesales_trucks", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_offlinesales_trucks_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	offlinesalesId: bigint("offlinesales_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	truckId: bigint("truck_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_offlinesales_trucks_offlinesales_id_3680edb5").using("btree", table.offlinesalesId.asc().nullsLast().op("int8_ops")),
	index("administration_offlinesales_trucks_truck_id_b7951bfa").using("btree", table.truckId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.offlinesalesId],
			foreignColumns: [administrationOfflinesales.id],
			name: "administration_offli_offlinesales_id_3680edb5_fk_administr"
		}),
	foreignKey({
			columns: [table.truckId],
			foreignColumns: [consumerTruck.id],
			name: "administration_offli_truck_id_b7951bfa_fk_consumer_"
		}),
	unique("administration_offlinesa_offlinesales_id_truck_id_ec9ed983_uniq").on(table.offlinesalesId, table.truckId),
]);

module.exports = { administrationOfflinesalesTrucks };
