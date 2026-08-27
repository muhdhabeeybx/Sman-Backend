const { pgTable, index, bigint, varchar, boolean, timestamp, integer, text, foreignKey, jsonb, check, numeric, date } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { administrationUser } = require("./administrationUser");
const { consumerAgent } = require("./consumerAgent");
const { consumerCustomer } = require("./consumerCustomer");
const { consumerPfi } = require("./consumerPfi");
const { consumerStates } = require("./consumerStates");

const consumerOrder = pgTable("consumer_order", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_order_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	quantity: integer().notNull(),
	totalPrice: numeric("total_price", { precision: 100, scale:  2 }).notNull(),
	status: varchar({ length: 200 }).notNull(),
	releaseStatus: varchar("release_status", { length: 200 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	releaseType: varchar("release_type", { length: 200 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	stateId: bigint("state_id", { mode: "number" }),
	customerDetails: jsonb("customer_details"),
	dprNumber: varchar("dpr_number", { length: 255 }),
	driverName: varchar("driver_name", { length: 255 }),
	driverPhone: varchar("driver_phone", { length: 50 }),
	salesRef: varchar("sales_ref", { length: 255 }),
	truckNumber: varchar("truck_number", { length: 255 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	assignedAgentId: bigint("assigned_agent_id", { mode: "number" }),
	loadingDatetime: timestamp("loading_datetime", { withTimezone: true, mode: 'string' }),
	deliveryAddress: text("delivery_address"),
	loaderName: varchar("loader_name", { length: 255 }),
	loaderPhone: varchar("loader_phone", { length: 50 }),
	compartmentDetails: text("compartment_details"),
	comp1Qty: numeric("comp1_qty", { precision: 12, scale:  2 }),
	comp1Ullage: numeric("comp1_ullage", { precision: 12, scale:  2 }),
	comp2Qty: numeric("comp2_qty", { precision: 12, scale:  2 }),
	comp2Ullage: numeric("comp2_ullage", { precision: 12, scale:  2 }),
	comp3Qty: numeric("comp3_qty", { precision: 12, scale:  2 }),
	comp3Ullage: numeric("comp3_ullage", { precision: 12, scale:  2 }),
	comp4Qty: numeric("comp4_qty", { precision: 12, scale:  2 }),
	comp4Ullage: numeric("comp4_ullage", { precision: 12, scale:  2 }),
	comp5Qty: numeric("comp5_qty", { precision: 12, scale:  2 }),
	comp5Ullage: numeric("comp5_ullage", { precision: 12, scale:  2 }),
	nmdrpaNumber: varchar("nmdrpa_number", { length: 255 }),
	paymentConfirmedAt: timestamp("payment_confirmed_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	paymentConfirmedById: bigint("payment_confirmed_by_id", { mode: "number" }),
	releasedAt: timestamp("released_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	releasedById: bigint("released_by_id", { mode: "number" }),
	securityExitedAt: timestamp("security_exited_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	securityExitedById: bigint("security_exited_by_id", { mode: "number" }),
	truckExited: boolean("truck_exited").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }),
	paymentNarration: text("payment_narration"),
	orderFingerprint: varchar("order_fingerprint", { length: 64 }),
	customerName: varchar("customer_name", { length: 255 }),
	customerPhone: varchar("customer_phone", { length: 50 }),
	notes: text(),
	orderType: varchar("order_type", { length: 20 }).notNull(),
	soldAt: timestamp("sold_at", { withTimezone: true, mode: 'string' }),
	soldToName: varchar("sold_to_name", { length: 255 }),
	soldToPhone: varchar("sold_to_phone", { length: 50 }),
	loadingDate: date("loading_date"),
	supervisedBy: varchar("supervised_by", { length: 255 }),
	destinationState: varchar("destination_state", { length: 100 }),
	destinationTown: varchar("destination_town", { length: 200 }),
	paidToAccountName: varchar("paid_to_account_name", { length: 255 }),
	paidToAccountNumber: varchar("paid_to_account_number", { length: 255 }),
	paidToBankName: varchar("paid_to_bank_name", { length: 255 }),
	securityExitGantry: varchar("security_exit_gantry", { length: 20 }),
	securityExitLoaderName: varchar("security_exit_loader_name", { length: 255 }),
	ticketGeneratedAt: timestamp("ticket_generated_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	ticketGeneratedById: bigint("ticket_generated_by_id", { mode: "number" }),
	commissionAmount: numeric("commission_amount", { precision: 14, scale:  2 }),
	commissionPaidAt: timestamp("commission_paid_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	commissionPaidById: bigint("commission_paid_by_id", { mode: "number" }),
	commissionAccountName: varchar("commission_account_name", { length: 200 }),
	commissionAccountNumber: varchar("commission_account_number", { length: 50 }),
	commissionBankName: varchar("commission_bank_name", { length: 200 }),
	overpaymentFlagged: boolean("overpayment_flagged").notNull(),
	overpaymentStatus: varchar("overpayment_status", { length: 30 }),
	entryDriverName: varchar("entry_driver_name", { length: 255 }),
	entryDriverPhone: varchar("entry_driver_phone", { length: 50 }),
	securityEnteredAt: timestamp("security_entered_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	securityEnteredById: bigint("security_entered_by_id", { mode: "number" }),
	truckEntered: boolean("truck_entered").notNull(),
}, (table) => [
	index("consumer_or_id_642470_idx").using("btree", table.id.asc().nullsLast().op("int8_ops")),
	index("consumer_or_status_b5f36a_idx").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("consumer_order_assigned_agent_id_85f408a3").using("btree", table.assignedAgentId.asc().nullsLast().op("int8_ops")),
	index("consumer_order_commission_paid_by_id_30ee53ab").using("btree", table.commissionPaidById.asc().nullsLast().op("int8_ops")),
	index("consumer_order_order_fingerprint_18d15027").using("btree", table.orderFingerprint.asc().nullsLast().op("text_ops")),
	index("consumer_order_order_fingerprint_18d15027_like").using("btree", table.orderFingerprint.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_order_payment_confirmed_by_id_36029149").using("btree", table.paymentConfirmedById.asc().nullsLast().op("int8_ops")),
	index("consumer_order_pfi_id_97a6b8c4").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	index("consumer_order_released_by_id_3906dd7b").using("btree", table.releasedById.asc().nullsLast().op("int8_ops")),
	index("consumer_order_security_entered_by_id_e0678ae8").using("btree", table.securityEnteredById.asc().nullsLast().op("int8_ops")),
	index("consumer_order_security_exited_by_id_78c96a5f").using("btree", table.securityExitedById.asc().nullsLast().op("int8_ops")),
	index("consumer_order_state_id_5cb2f2ef").using("btree", table.stateId.asc().nullsLast().op("int8_ops")),
	index("consumer_order_ticket_generated_by_id_45b2448b").using("btree", table.ticketGeneratedById.asc().nullsLast().op("int8_ops")),
	index("consumer_order_user_id_81684fac").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	index("order_created_desc_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("order_release_status_idx").using("btree", table.releaseStatus.asc().nullsLast().op("text_ops")),
	index("order_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.paymentConfirmedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_order_payment_confirmed_by_36029149_fk_administr"
		}),
	foreignKey({
			columns: [table.releasedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_order_released_by_id_3906dd7b_fk_administr"
		}),
	foreignKey({
			columns: [table.securityExitedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_order_security_exited_by_i_78c96a5f_fk_administr"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [consumerCustomer.id],
			name: "consumer_order_user_id_81684fac_fk_consumer_customer_id"
		}),
	foreignKey({
			columns: [table.stateId],
			foreignColumns: [consumerStates.id],
			name: "consumer_order_state_id_5cb2f2ef_fk_consumer_states_id"
		}),
	foreignKey({
			columns: [table.assignedAgentId],
			foreignColumns: [consumerAgent.id],
			name: "consumer_order_assigned_agent_id_85f408a3_fk"
		}),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "consumer_order_pfi_id_97a6b8c4_fk_consumer_pfi_id"
		}),
	foreignKey({
			columns: [table.ticketGeneratedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_order_ticket_generated_by__45b2448b_fk_administr"
		}),
	foreignKey({
			columns: [table.commissionPaidById],
			foreignColumns: [administrationUser.id],
			name: "consumer_order_commission_paid_by_i_30ee53ab_fk_administr"
		}),
	foreignKey({
			columns: [table.securityEnteredById],
			foreignColumns: [administrationUser.id],
			name: "consumer_order_security_entered_by__e0678ae8_fk_administr"
		}),
	check("consumer_order_quantity_check", sql`quantity >= 0`),
]);

module.exports = { consumerOrder };
