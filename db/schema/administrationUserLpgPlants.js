const { pgTable, index, unique, bigint, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerLpgplant } = require("./consumerLpgplant");

const administrationUserLpgPlants = pgTable("administration_user_lpg_plants", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_user_lpg_plants_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lpgplantId: bigint("lpgplant_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_user_lpg_plants_lpgplant_id_e16ceee4").using("btree", table.lpgplantId.asc().nullsLast().op("int8_ops")),
	index("administration_user_lpg_plants_user_id_18fb1020").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "administration_user__user_id_18fb1020_fk_administr"
		}),
	foreignKey({
			columns: [table.lpgplantId],
			foreignColumns: [consumerLpgplant.id],
			name: "administration_user__lpgplant_id_e16ceee4_fk_consumer_"
		}),
	unique("administration_user_lpg__user_id_lpgplant_id_3adf278f_uniq").on(table.userId, table.lpgplantId),
]);

module.exports = { administrationUserLpgPlants };
