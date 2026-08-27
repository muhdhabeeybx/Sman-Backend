const { pgTable, index, bigint, timestamp, foreignKey, jsonb } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { deliveryLedgerSettings } = require("./deliveryLedgerSettings");

const administrationDeliveryledgersettingsaudit = pgTable("administration_deliveryledgersettingsaudit", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_deliveryledgersettingsaudit_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	previousData: jsonb("previous_data").notNull(),
	newData: jsonb("new_data").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	settingsObjId: bigint("settings_obj_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedById: bigint("updated_by_id", { mode: "number" }),
}, (table) => [
	index("administration_deliveryled_settings_obj_id_75295e60").using("btree", table.settingsObjId.asc().nullsLast().op("int8_ops")),
	index("administration_deliveryled_updated_by_id_d50bd58b").using("btree", table.updatedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.settingsObjId],
			foreignColumns: [deliveryLedgerSettings.id],
			name: "administration_deliv_settings_obj_id_75295e60_fk_delivery_"
		}),
	foreignKey({
			columns: [table.updatedById],
			foreignColumns: [administrationUser.id],
			name: "administration_deliv_updated_by_id_d50bd58b_fk_administr"
		}),
]);

module.exports = { administrationDeliveryledgersettingsaudit };
