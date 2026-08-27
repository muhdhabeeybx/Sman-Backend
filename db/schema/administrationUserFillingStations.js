const { pgTable, index, unique, bigint, foreignKey } = require("drizzle-orm/pg-core");
const { administrationDeliverycustomer } = require("./administrationDeliverycustomer");
const { administrationUser } = require("./administrationUser");

const administrationUserFillingStations = pgTable("administration_user_filling_stations", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_user_filling_stations_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	deliverycustomerId: bigint("deliverycustomer_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_user_fillin_deliverycustomer_id_9b285a15").using("btree", table.deliverycustomerId.asc().nullsLast().op("int8_ops")),
	index("administration_user_filling_stations_user_id_93c3fbe9").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "administration_user__user_id_93c3fbe9_fk_administr"
		}),
	foreignKey({
			columns: [table.deliverycustomerId],
			foreignColumns: [administrationDeliverycustomer.id],
			name: "administration_user__deliverycustomer_id_9b285a15_fk_administr"
		}),
	unique("administration_user_fill_user_id_deliverycustomer_4b750c4a_uniq").on(table.userId, table.deliverycustomerId),
]);

module.exports = { administrationUserFillingStations };
