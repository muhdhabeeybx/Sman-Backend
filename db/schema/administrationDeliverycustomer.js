const { pgTable, bigint, varchar, timestamp, text, numeric, date } = require("drizzle-orm/pg-core");

const administrationDeliverycustomer = pgTable("administration_deliverycustomer", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_deliverycustomer_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	customerName: varchar("customer_name", { length: 255 }).notNull(),
	phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
	status: varchar({ length: 20 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	outstandingLimit: numeric("outstanding_limit", { precision: 15, scale:  2 }).notNull(),
	accountName: varchar("account_name", { length: 255 }).notNull(),
	accountNumber: varchar("account_number", { length: 50 }).notNull(),
	altPhoneNumber: varchar("alt_phone_number", { length: 30 }).notNull(),
	bankName: varchar("bank_name", { length: 255 }).notNull(),
	contactPerson: varchar("contact_person", { length: 255 }).notNull(),
	email: varchar({ length: 254 }).notNull(),
	homeAddress: text("home_address").notNull(),
	notes: text().notNull(),
	officeAddress: text("office_address").notNull(),
	passportPhoto: varchar("passport_photo", { length: 100 }),
	contactPersonPhone: varchar("contact_person_phone", { length: 50 }).notNull(),
	lastOrderDate: date("last_order_date"),
	customerType: varchar("customer_type", { length: 20 }).notNull(),
});

module.exports = { administrationDeliverycustomer };
