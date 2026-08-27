const { pgTable, index, unique, bigint, varchar, timestamp, foreignKey, jsonb } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");

const deliveryLedgerSettings = pgTable("delivery_ledger_settings", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "delivery_ledger_settings_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	key: varchar({ length: 100 }).notNull(),
	tripCodes: jsonb("trip_codes").notNull(),
	pfiCodeMap: jsonb("pfi_code_map").notNull(),
	loadingCodeMap: jsonb("loading_code_map").notNull(),
	saleTripMap: jsonb("sale_trip_map").notNull(),
	cycleAliasMap: jsonb("cycle_alias_map").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedById: bigint("updated_by_id", { mode: "number" }),
}, (table) => [
	index("delivery_ledger_settings_key_5f5e4c7b_like").using("btree", table.key.asc().nullsLast().op("varchar_pattern_ops")),
	index("delivery_ledger_settings_updated_by_id_1239fc6a").using("btree", table.updatedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [administrationUser.id],
			name: "delivery_ledger_sett_updated_by_id_1239fc6a_fk_administr"
		}),
	unique("delivery_ledger_settings_key_key").on(table.key),
]);

module.exports = { deliveryLedgerSettings };
