const { pgTable, index, bigint, varchar, timestamp, foreignKey, jsonb } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerOrder } = require("./consumerOrder");

const consumerOrderauditevent = pgTable("consumer_orderauditevent", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_orderauditevent_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	action: varchar({ length: 64 }).notNull(),
	actorEmail: varchar("actor_email", { length: 255 }).notNull(),
	actorName: varchar("actor_name", { length: 255 }).notNull(),
	actorRole: varchar("actor_role", { length: 64 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	metadata: jsonb(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	actorUserId: bigint("actor_user_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_orderauditevent_actor_user_id_76dca81c").using("btree", table.actorUserId.asc().nullsLast().op("int8_ops")),
	index("consumer_orderauditevent_order_id_89c778f0").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	index("oae_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("oae_actor_idx").using("btree", table.actorUserId.asc().nullsLast().op("int8_ops")),
	index("oae_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("oae_order_idx").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_orderauditevent_order_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [administrationUser.id],
			name: "consumer_orderaudite_actor_user_id_76dca81c_fk_administr"
		}),
]);

module.exports = { consumerOrderauditevent };
