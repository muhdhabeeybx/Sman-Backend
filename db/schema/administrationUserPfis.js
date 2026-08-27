const { pgTable, index, unique, bigint, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerPfi } = require("./consumerPfi");

const administrationUserPfis = pgTable("administration_user_pfis", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_user_pfis_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }).notNull(),
}, (table) => [
	index("administration_user_pfis_pfi_id_de6488cf").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	index("administration_user_pfis_user_id_044ba9d7").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "administration_user__user_id_044ba9d7_fk_administr"
		}),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "administration_user_pfis_pfi_id_de6488cf_fk_consumer_pfi_id"
		}),
	unique("administration_user_pfis_user_id_pfi_id_31210bc5_uniq").on(table.userId, table.pfiId),
]);

module.exports = { administrationUserPfis };
