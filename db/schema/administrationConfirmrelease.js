const { pgTable, index, unique, bigint, varchar, timestamp, text, foreignKey } = require("drizzle-orm/pg-core");
const { administrationDeliveryinventory } = require("./administrationDeliveryinventory");
const { consumerOrder } = require("./consumerOrder");

const administrationConfirmrelease = pgTable("administration_confirmrelease", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_confirmrelease_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	status: varchar({ length: 20 }).notNull(),
	confirmedBy: varchar("confirmed_by", { length: 255 }).notNull(),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
	rejectionReason: text("rejection_reason").notNull(),
	notes: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	inventoryId: bigint("inventory_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }),
	sourceType: varchar("source_type", { length: 20 }).notNull(),
}, (table) => [
	index("administration_confirmrelease_order_id_4846adfb").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "administration_confi_order_id_4846adfb_fk_consumer_"
		}),
	foreignKey({
			columns: [table.inventoryId],
			foreignColumns: [administrationDeliveryinventory.id],
			name: "administration_confi_inventory_id_ec5e9266_fk_administr"
		}),
	unique("administration_confirmrelease_inventory_id_key").on(table.inventoryId),
]);

module.exports = { administrationConfirmrelease };
