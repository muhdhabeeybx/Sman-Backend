const { pgTable, index, bigint, varchar, timestamp, foreignKey } = require("drizzle-orm/pg-core");
const { consumerOrder } = require("./consumerOrder");

const consumerPaymentfile = pgTable("consumer_paymentfile", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_paymentfile_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	file: varchar({ length: 100 }).notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	orderId: bigint("order_id", { mode: "number" }).notNull(),
}, (table) => [
	index("consumer_paymentfile_order_id_cdd06dcb").using("btree", table.orderId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [consumerOrder.id],
			name: "consumer_paymentfile_order_id_cdd06dcb_fk_consumer_order_id"
		}),
]);

module.exports = { consumerPaymentfile };
