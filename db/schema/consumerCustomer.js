const { pgTable, index, bigint, varchar, timestamp } = require("drizzle-orm/pg-core");

const consumerCustomer = pgTable("consumer_customer", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_customer_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	firstName: varchar("first_name", { length: 200 }).notNull(),
	lastName: varchar("last_name", { length: 200 }).notNull(),
	companyName: varchar("company_name", { length: 200 }),
	email: varchar({ length: 150 }),
	phoneNumber: varchar("phone_number", { length: 25 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("consumer_cu_id_5634de_idx").using("btree", table.id.asc().nullsLast().op("int8_ops"), table.email.asc().nullsLast().op("int8_ops")),
]);

module.exports = { consumerCustomer };
