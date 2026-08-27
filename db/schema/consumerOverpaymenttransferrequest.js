const { pgTable, index, bigint, varchar, timestamp, text, foreignKey, numeric } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerOrder } = require("./consumerOrder");

const consumerOverpaymenttransferrequest = pgTable("consumer_overpaymenttransferrequest", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_overpaymenttransferrequest_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	amount: numeric({ precision: 14, scale:  2 }).notNull(),
	narration: text(),
	status: varchar({ length: 20 }).notNull(),
	requestedByName: varchar("requested_by_name", { length: 200 }).notNull(),
	reviewedByName: varchar("reviewed_by_name", { length: 200 }).notNull(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	requestedById: bigint("requested_by_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	reviewedById: bigint("reviewed_by_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceOrderId: bigint("source_order_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	targetOrderId: bigint("target_order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_overpaymenttransferrequest_requested_by_id_25e75012").using("btree", table.requestedById.asc().nullsLast().op("int8_ops")),
	index("consumer_overpaymenttransferrequest_reviewed_by_id_59c5c526").using("btree", table.reviewedById.asc().nullsLast().op("int8_ops")),
	index("consumer_overpaymenttransferrequest_source_order_id_19f1a44c").using("btree", table.sourceOrderId.asc().nullsLast().op("int8_ops")),
	index("consumer_overpaymenttransferrequest_target_order_id_2a3a55f2").using("btree", table.targetOrderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.requestedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_overpayment_requested_by_id_25e75012_fk_administr"
		}),
	foreignKey({
			columns: [table.reviewedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_overpayment_reviewed_by_id_59c5c526_fk_administr"
		}),
	foreignKey({
			columns: [table.sourceOrderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_overpayment_source_order_id_19f1a44c_fk_consumer_"
		}),
	foreignKey({
			columns: [table.targetOrderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_overpayment_target_order_id_2a3a55f2_fk_consumer_"
		}),
]);

module.exports = { consumerOverpaymenttransferrequest };
