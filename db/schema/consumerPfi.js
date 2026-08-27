const { pgTable, index, unique, bigint, varchar, timestamp, text, foreignKey, numeric, date } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerProduct } = require("./consumerProduct");
const { consumerStates } = require("./consumerStates");

const consumerPfi = pgTable("consumer_pfi", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pfi_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	pfiNumber: varchar("pfi_number", { length: 100 }).notNull(),
	startingQtyLitres: numeric("starting_qty_litres", { precision: 14, scale:  2 }).notNull(),
	notes: text(),
	status: varchar({ length: 20 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdById: bigint("created_by_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	locationId: bigint("location_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	productId: bigint("product_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	financePersonId: bigint("finance_person_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	marketingPersonId: bigint("marketing_person_id", { mode: "number" }),
	aggregateExpenses: numeric("aggregate_expenses", { precision: 16, scale:  2 }),
	closureBank: varchar("closure_bank", { length: 200 }),
	closureDate: date("closure_date"),
	closureHandler: varchar("closure_handler", { length: 200 }),
	closureRemarks: text("closure_remarks"),
	purchaseCost: numeric("purchase_cost", { precision: 16, scale:  2 }),
	salesManagerLegacy: varchar("sales_manager_legacy", { length: 200 }),
	totalInflow: numeric("total_inflow", { precision: 16, scale:  2 }),
	pfiDate: date("pfi_date"),
	qtyVolumeMt: numeric("qty_volume_mt", { precision: 14, scale:  2 }),
	vesselBroker: varchar("vessel_broker", { length: 200 }),
	vesselName: varchar("vessel_name", { length: 200 }),
	surveyorName: varchar("surveyor_name", { length: 200 }),
	surveyorPhone: varchar("surveyor_phone", { length: 20 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	auditOfficerId: bigint("audit_officer_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	productOfficerId: bigint("product_officer_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	itComplianceOfficerId: bigint("it_compliance_officer_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	securityExitOfficerId: bigint("security_exit_officer_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	commissionOfficerId: bigint("commission_officer_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	salesManagerId: bigint("sales_manager_id", { mode: "number" }),
	blQtyLitres: numeric("bl_qty_litres", { precision: 14, scale:  2 }),
	pricePerLitre: numeric("price_per_litre", { precision: 14, scale:  2 }),
	blQtyMt: numeric("bl_qty_mt", { precision: 14, scale:  2 }),
	creditBalance: numeric("credit_balance", { precision: 16, scale:  2 }),
}, (table) => [
	index("consumer_pf_created_61ea80_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("consumer_pf_status_48f26b_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.locationId.asc().nullsLast().op("int8_ops"), table.productId.asc().nullsLast().op("text_ops")),
	index("consumer_pfi_audit_officer_id_92963914").using("btree", table.auditOfficerId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_commission_officer_id_b955bccd").using("btree", table.commissionOfficerId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_created_by_id_a9ca7415").using("btree", table.createdById.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_finance_person_id_9c92e0d5").using("btree", table.financePersonId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_it_compliance_officer_id_adacca23").using("btree", table.itComplianceOfficerId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_location_id_53c8a6ed").using("btree", table.locationId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_marketing_person_id_ca514db6").using("btree", table.marketingPersonId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_pfi_number_a1742690_like").using("btree", table.pfiNumber.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_pfi_product_id_bad0bf45").using("btree", table.productId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_product_officer_id_8fb6de1d").using("btree", table.productOfficerId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_sales_manager_id_49b824fc").using("btree", table.salesManagerId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfi_security_exit_officer_id_55bcda50").using("btree", table.securityExitOfficerId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.createdById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_created_by_id_a9ca7415_fk_administration_user_id"
		}),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [consumerStates.id],
			name: "consumer_pfi_location_id_53c8a6ed_fk_consumer_states_id"
		}),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [consumerProduct.id],
			name: "consumer_pfi_product_id_bad0bf45_fk_consumer_product_id"
		}),
	foreignKey({
			columns: [table.financePersonId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_finance_person_id_9c92e0d5_fk_administr"
		}),
	foreignKey({
			columns: [table.marketingPersonId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_marketing_person_id_ca514db6_fk_administr"
		}),
	foreignKey({
			columns: [table.auditOfficerId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_audit_officer_id_92963914_fk_administr"
		}),
	foreignKey({
			columns: [table.productOfficerId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_product_officer_id_8fb6de1d_fk_administr"
		}),
	foreignKey({
			columns: [table.itComplianceOfficerId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_it_compliance_office_adacca23_fk_administr"
		}),
	foreignKey({
			columns: [table.securityExitOfficerId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_security_exit_office_55bcda50_fk_administr"
		}),
	foreignKey({
			columns: [table.commissionOfficerId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_commission_officer_i_b955bccd_fk_administr"
		}),
	foreignKey({
			columns: [table.salesManagerId],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfi_sales_manager_id_49b824fc_fk_administr"
		}),
	unique("consumer_pfi_pfi_number_key").on(table.pfiNumber),
]);

module.exports = { consumerPfi };
