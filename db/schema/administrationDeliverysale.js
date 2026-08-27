const { pgTable, index, bigint, varchar, timestamp, text, foreignKey, jsonb, numeric, date } = require("drizzle-orm/pg-core");
const { administrationDeliverycustomer } = require("./administrationDeliverycustomer");

const administrationDeliverysale = pgTable("administration_deliverysale", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_deliverysale_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	truckNumber: varchar("truck_number", { length: 100 }).notNull(),
	dateLoaded: date("date_loaded").notNull(),
	depotLoaded: varchar("depot_loaded", { length: 255 }).notNull(),
	location: varchar({ length: 255 }).notNull(),
	quantity: numeric({ precision: 12, scale:  2 }).notNull(),
	rate: numeric({ precision: 12, scale:  2 }).notNull(),
	salesValue: numeric("sales_value", { precision: 14, scale:  2 }).notNull(),
	paymentAmount: numeric("payment_amount", { precision: 14, scale:  2 }).notNull(),
	payerName: varchar("payer_name", { length: 255 }).notNull(),
	bank: varchar({ length: 500 }).notNull(),
	dateOfPayment: date("date_of_payment"),
	phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
	remarks: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	customerId: bigint("customer_id", { mode: "number" }),
	customerName: varchar("customer_name", { length: 255 }).notNull(),
	enteredBy: varchar("entered_by", { length: 255 }).notNull(),
	rates: jsonb(),
	allocationCode: varchar("allocation_code", { length: 64 }),
	expensesAmount: numeric("expenses_amount", { precision: 14, scale:  2 }).notNull(),
	depositStatus: varchar("deposit_status", { length: 20 }).notNull(),
	collectionAccounts: jsonb("collection_accounts"),
	remittanceAccounts: jsonb("remittance_accounts"),
}, (table) => [
	index("administration_deliverysale_allocation_code_eab3ed2f").using("btree", table.allocationCode.asc().nullsLast().op("text_ops")),
	index("administration_deliverysale_allocation_code_eab3ed2f_like").using("btree", table.allocationCode.asc().nullsLast().op("varchar_pattern_ops")),
	index("administration_deliverysale_customer_id_235d2c38").using("btree", table.customerId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [administrationDeliverycustomer.id],
			name: "administration_deliv_customer_id_235d2c38_fk_administr"
		}),
]);

module.exports = { administrationDeliverysale };
