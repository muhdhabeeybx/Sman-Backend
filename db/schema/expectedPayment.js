const { pgTable, serial, integer, decimal, varchar, text, timestamp, index } = require("drizzle-orm/pg-core");
const { customers } = require("./customer");
const { orders } = require("./order");
const { deposits } = require("./deposit");
const { staff } = require("./staff");
const { depots } = require("./depot");
const { pfis } = require("./pfi");

/**
 * What a customer said they'd pay, before the money actually shows up.
 *
 * Purely advisory — nothing here moves money or blocks a deposit. It exists
 * so a bare bank-transfer depositor name/narration has something concrete to
 * be matched against later. `orderId` is set when raised from the order
 * wizard, null when raised standalone from the customer's own page.
 */
const expectedPayments = pgTable(
  "expected_payments",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    // Same rule as deposits.depotId/pfiId — set when attributable, null
    // otherwise, and null is only visible to a full-access user.
    depotId: integer("depot_id").references(() => depots.id, { onDelete: "set null" }),
    pfiId: integer("pfi_id").references(() => pfis.id, { onDelete: "set null" }),
    expectedAmount: decimal("expected_amount", { precision: 15, scale: 2 }),
    reference: varchar("reference", { length: 255 }).default(""),
    note: text("note").default(""),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    matchedDepositId: integer("matched_deposit_id").references(() => deposits.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => staff.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("expected_payments_customer_status_idx").on(table.customerId, table.status),
    index("expected_payments_order_idx").on(table.orderId),
  ]
);

module.exports = { expectedPayments };
