const { pgTable, index, bigint, varchar, timestamp, integer, text, foreignKey, jsonb } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerOrder } = require("./consumerOrder");

const consumerAuditlog = pgTable("consumer_auditlog", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_auditlog_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	action: varchar({ length: 64 }).notNull(),
	actorRole: integer("actor_role"),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	ipAddress: varchar("ip_address", { length: 64 }),
	userAgent: text("user_agent"),
	metadata: jsonb(),
	prevState: varchar("prev_state", { length: 64 }),
	newState: varchar("new_state", { length: 64 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	actorId: bigint("actor_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("audit_ord_act_ts").using("btree", table.orderId.asc().nullsLast().op("timestamptz_ops"), table.action.asc().nullsLast().op("int8_ops"), table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("consumer_auditlog_actor_id_fa079501").using("btree", table.actorId.asc().nullsLast().op("int8_ops")),
	index("consumer_auditlog_order_id_dc6c79ae").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [administrationUser.id],
			name: "consumer_auditlog_actor_id_fa079501_fk_administration_user_id"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_auditlog_order_id_dc6c79ae_fk_consumer_order_id"
		}),
]);

module.exports = { consumerAuditlog };
