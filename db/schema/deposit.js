const {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  decimal,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { depositTypeEnum } = require("./enums");
const { customers } = require("./customer");
const { staff } = require("./staff");
const { depots } = require("./depot");
const { pfis } = require("./pfi");

const deposits = pgTable(
  "deposits",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    // Set when the deposit is attributable to a depot/PFI (e.g. matched to an
    // order at that depot) — null for a deposit that predates this or was
    // never allocated. Drives location/PFI scoping; a null value is only
    // visible to a full-access (canViewAllLocations) user.
    depotId: integer("depot_id").references(() => depots.id, { onDelete: "set null" }),
    pfiId: integer("pfi_id").references(() => pfis.id, { onDelete: "set null" }),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    type: depositTypeEnum("type").notNull(),
    description: text("description").default(""),
    reference: varchar("reference", { length: 255 }).default(""),
    recordedBy: integer("recorded_by").references(() => staff.id, { onDelete: "set null" }),
    balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).default("0"),
    paystackDetails: jsonb("paystack_details"),
    // How much of this credit deposit hasn't yet been claimed by an order,
    // via order_deposit_allocations. NULL means "predates that tracking" —
    // deliberately distinct from 0 ("tracked, and now fully spent"). Never
    // set on debit rows.
    remainingAmount: decimal("remaining_amount", { precision: 15, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("deposits_customer_created_idx").on(table.customerId, table.createdAt),
    uniqueIndex("deposits_reference_unique_idx")
      .on(table.reference)
      .where(sql`${table.reference} IS NOT NULL AND ${table.reference} != ''`),
    check("deposits_amount_check", sql`${table.amount} > 0`),
  ]
);

module.exports = { deposits };
