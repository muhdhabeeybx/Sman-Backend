const { pgTable, index, unique, bigint, varchar, timestamp, integer, text, foreignKey, jsonb, check, numeric, date } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { administrationUser } = require("./administrationUser");

const administrationStaffdailysalesreport = pgTable("administration_staffdailysalesreport", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_staffdailysalesreport_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	date: date().notNull(),
	location: varchar({ length: 255 }).notNull(),
	submittedByName: varchar("submitted_by_name", { length: 255 }).notNull(),
	yesterdayCarriedOverLoading: numeric("yesterday_carried_over_loading", { precision: 15, scale:  2 }),
	productBroughtForward: numeric("product_brought_forward", { precision: 15, scale:  2 }),
	litresSoldToday: numeric("litres_sold_today", { precision: 15, scale:  2 }).notNull(),
	price: numeric({ precision: 12, scale:  2 }),
	tankBalance: numeric("tank_balance", { precision: 15, scale:  2 }),
	numTrucksSold: integer("num_trucks_sold").notNull(),
	amountPaid: numeric("amount_paid", { precision: 15, scale:  2 }).notNull(),
	totalSalesAmount: numeric("total_sales_amount", { precision: 15, scale:  2 }).notNull(),
	differentials: numeric({ precision: 15, scale:  2 }),
	loadingLeftOver: numeric("loading_left_over", { precision: 15, scale:  2 }),
	remarks: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	submittedById: bigint("submitted_by_id", { mode: "number" }),
	pfiNumber: varchar("pfi_number", { length: 50 }).notNull(),
	accountNumber: varchar("account_number", { length: 50 }).notNull(),
	bankName: varchar("bank_name", { length: 255 }).notNull(),
	priceBands: jsonb("price_bands").notNull(),
}, (table) => [
	index("administrat_date_2fe750_idx").using("btree", table.date.asc().nullsLast().op("date_ops"), table.location.asc().nullsLast().op("date_ops")),
	index("administration_staffdailysalesreport_date_1d30368b").using("btree", table.date.asc().nullsLast().op("date_ops")),
	index("administration_staffdailysalesreport_location_d593306d").using("btree", table.location.asc().nullsLast().op("text_ops")),
	index("administration_staffdailysalesreport_location_d593306d_like").using("btree", table.location.asc().nullsLast().op("varchar_pattern_ops")),
	index("administration_staffdailysalesreport_submitted_by_id_fdc20360").using("btree", table.submittedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.submittedById],
			foreignColumns: [administrationUser.id],
			name: "administration_staff_submitted_by_id_fdc20360_fk_administr"
		}),
	unique("administration_staffdail_date_location_pfi_number_b4528ab5_uniq").on(table.date, table.location, table.submittedById, table.pfiNumber),
	check("administration_staffdailysalesreport_num_trucks_sold_check", sql`num_trucks_sold >= 0`),
]);

module.exports = { administrationStaffdailysalesreport };
