const { pgTable, index, bigint, varchar, timestamp, text, foreignKey, numeric, date } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { consumerExpensecategory } = require("./consumerExpensecategory");
const { consumerPfi } = require("./consumerPfi");

const consumerPfiexpense = pgTable("consumer_pfiexpense", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "consumer_pfiexpense_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	description: varchar({ length: 255 }).notNull(),
	amount: numeric({ precision: 16, scale:  2 }).notNull(),
	date: date().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	addedById: bigint("added_by_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pfiId: bigint("pfi_id", { mode: "number" }),
	bankPaidFrom: varchar("bank_paid_from", { length: 200 }).notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	editedById: bigint("edited_by_id", { mode: "number" }),
	receiptReference: varchar("receipt_reference", { length: 100 }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	vendor: varchar({ length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	categoryId: bigint("category_id", { mode: "number" }),
	reviewNote: text("review_note").notNull(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	reviewedById: bigint("reviewed_by_id", { mode: "number" }),
	status: varchar({ length: 24 }).notNull(),
	adminApprovedAt: timestamp("admin_approved_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	adminApprovedById: bigint("admin_approved_by_id", { mode: "number" }),
	auditApprovedAt: timestamp("audit_approved_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	auditApprovedById: bigint("audit_approved_by_id", { mode: "number" }),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	paidById: bigint("paid_by_id", { mode: "number" }),
	payeeAccountName: varchar("payee_account_name", { length: 255 }).notNull(),
	payeeAccountNumber: varchar("payee_account_number", { length: 50 }).notNull(),
	payeeBankName: varchar("payee_bank_name", { length: 200 }).notNull(),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	verifiedById: bigint("verified_by_id", { mode: "number" }),
}, (table) => [
	index("consumer_pf_deleted_3e38b3_idx").using("btree", table.deletedAt.asc().nullsLast().op("timestamptz_ops")),
	index("consumer_pf_pfi_id_2f1400_idx").using("btree", table.pfiId.asc().nullsLast().op("int8_ops"), table.date.asc().nullsLast().op("int8_ops")),
	index("consumer_pf_pfi_id_688b26_idx").using("btree", table.pfiId.asc().nullsLast().op("int8_ops"), table.categoryId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_added_by_id_f696ea64").using("btree", table.addedById.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_admin_approved_by_id_ddaea4f9").using("btree", table.adminApprovedById.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_audit_approved_by_id_03b97dd5").using("btree", table.auditApprovedById.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_category_id_9a9007f2").using("btree", table.categoryId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_edited_by_id_31e459f0").using("btree", table.editedById.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_paid_by_id_8c44101d").using("btree", table.paidById.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_pfi_id_398caccb").using("btree", table.pfiId.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_reviewed_by_id_0cdae3e9").using("btree", table.reviewedById.asc().nullsLast().op("int8_ops")),
	index("consumer_pfiexpense_status_b6f290c2").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("consumer_pfiexpense_status_b6f290c2_like").using("btree", table.status.asc().nullsLast().op("varchar_pattern_ops")),
	index("consumer_pfiexpense_verified_by_id_fb7c8e9a").using("btree", table.verifiedById.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.addedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpense_added_by_id_f696ea64_fk_administr"
		}),
	foreignKey({
			columns: [table.editedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpense_edited_by_id_31e459f0_fk_administr"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [consumerExpensecategory.id],
			name: "consumer_pfiexpense_category_id_9a9007f2_fk_consumer_"
		}),
	foreignKey({
			columns: [table.pfiId],
			foreignColumns: [consumerPfi.id],
			name: "consumer_pfiexpense_pfi_id_398caccb_fk_consumer_pfi_id"
		}),
	foreignKey({
			columns: [table.reviewedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpense_reviewed_by_id_0cdae3e9_fk_administr"
		}),
	foreignKey({
			columns: [table.adminApprovedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpense_admin_approved_by_id_ddaea4f9_fk_administr"
		}),
	foreignKey({
			columns: [table.auditApprovedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpense_audit_approved_by_id_03b97dd5_fk_administr"
		}),
	foreignKey({
			columns: [table.paidById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpense_paid_by_id_8c44101d_fk_administr"
		}),
	foreignKey({
			columns: [table.verifiedById],
			foreignColumns: [administrationUser.id],
			name: "consumer_pfiexpense_verified_by_id_fb7c8e9a_fk_administr"
		}),
]);

module.exports = { consumerPfiexpense };
