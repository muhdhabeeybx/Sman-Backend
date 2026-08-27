const { pgTable, index, bigint, varchar, boolean, timestamp, text, foreignKey, jsonb, numeric, date } = require("drizzle-orm/pg-core");
const { administrationDeliverycustomer } = require("./administrationDeliverycustomer");
const { consumerFleettruck } = require("./consumerFleettruck");
const { consumerPfi } = require("./consumerPfi");

const administrationDeliveryinventory = pgTable("administration_deliveryinventory", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_deliveryinventory_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	quantityAllocated: numeric("quantity_allocated", { precision: 15, scale:  2 }).notNull(),
	dateAllocated: date("date_allocated"),
	notes: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }),
	createdBy: varchar("created_by", { length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	customerId: bigint("customer_id", { mode: "number" }),
	customerName: varchar("customer_name", { length: 255 }).notNull(),
	dateOffloaded: date("date_offloaded"),
	depot: varchar({ length: 255 }).notNull(),
	loadingStatus: varchar("loading_status", { length: 20 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	truckId: bigint("truck_id", { mode: "number" }),
	truckNumber: varchar("truck_number", { length: 100 }).notNull(),
	location: varchar({ length: 255 }).notNull(),
	offloadedBy: varchar("offloaded_by", { length: 255 }).notNull(),
	releaseStatus: varchar("release_status", { length: 20 }).notNull(),
	ticketGeneratedAt: timestamp("ticket_generated_at", { withTimezone: true, mode: 'string' }),
	ticketNumber: varchar("ticket_number", { length: 100 }).notNull(),
	ticketGeneratedBy: varchar("ticket_generated_by", { length: 255 }).notNull(),
	isFullyPaid: boolean("is_fully_paid").notNull(),
	allocationCode: varchar("allocation_code", { length: 64 }),
	pfiNumber: varchar("pfi_number", { length: 50 }),
	pfiProduct: varchar("pfi_product", { length: 100 }),
	collectionAccounts: jsonb("collection_accounts"),
	remittanceAccounts: jsonb("remittance_accounts"),
}, (table) => [
	index("administration_deliveryinventory_allocation_code_290755b7").using("btree", table.allocationCode.asc().nullsLast().op("text_ops")),
	index("administration_deliveryinventory_allocation_code_290755b7_like").using("btree", table.allocationCode.asc().nullsLast().op("varchar_pattern_ops")),
	index("administration_deliveryinventory_customer_id_395575a8").using("btree", table.customerId.asc().nullsLast().op("int8_ops")),
	index("administration_deliveryinventory_pfi_id_932b9bd6").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	index("administration_deliveryinventory_truck_id_4a27f975").using("btree", table.truckId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [administrationDeliverycustomer.id],
			name: "administration_deliv_customer_id_395575a8_fk_administr"
		}),
	foreignKey({
			columns: [table.truckId],
			foreignColumns: [consumerFleettruck.id],
			name: "administration_deliv_truck_id_4a27f975_fk_consumer_"
		}),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "administration_deliv_pfi_id_932b9bd6_fk_consumer_"
		}),
]);

module.exports = { administrationDeliveryinventory };
