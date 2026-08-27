const { pgTable, serial, varchar, text, integer, timestamp, uniqueIndex } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { staff } = require("./staff");

/**
 * Vendor master data.
 *
 * `pfi_expenses.vendor` remains a free-text snapshot of the vendor's name at
 * the time the expense was raised — renaming a vendor here never rewrites
 * past requests. `pfi_expenses.vendor_id` is the live link, set only when the
 * requester picked an existing vendor (or chose to save a new one).
 */
const vendors = pgTable(
  "vendors",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    contactPerson: varchar("contact_person", { length: 255 }).default(""),
    phone: varchar("phone", { length: 50 }).default(""),
    email: varchar("email", { length: 255 }).default(""),
    address: text("address").default(""),
    bankName: varchar("bank_name", { length: 200 }).default(""),
    accountNumber: varchar("account_number", { length: 50 }).default(""),
    accountName: varchar("account_name", { length: 255 }).default(""),
    taxId: varchar("tax_id", { length: 50 }).default(""),
    status: varchar("status", { length: 20 }).default("Active").notNull(),
    createdBy: integer("created_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("vendors_name_idx").on(sql`lower(${table.name})`)]
);

module.exports = { vendors };
