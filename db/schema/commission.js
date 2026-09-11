const {
  pgTable,
  serial,
  integer,
  decimal,
  text,
  timestamp,
  index,
  check,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { commissionStatusEnum } = require("./enums");
const { orders } = require("./order");
const { customers } = require("./customer");
const { depots } = require("./depot");
const { products } = require("./product");
const { staff } = require("./staff");

const commissions = pgTable(
  "commissions",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    depotId: integer("depot_id")
      .notNull()
      .references(() => depots.id, { onDelete: "restrict" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    commissionRate: decimal("commission_rate", { precision: 15, scale: 2 }).notNull(),
    commissionAmount: decimal("commission_amount", { precision: 15, scale: 2 }).notNull(),
    status: commissionStatusEnum("status").default("pending").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: integer("paid_by").references(() => staff.id, { onDelete: "set null" }),
    /**
     * The second exit: settled without paying anybody.
     *
     * Some orders carry no commission — a flat-rate deal, a correction, a
     * facilitator paid another way — and before this those rows sat pending
     * forever, so "pending" meant both "still to pay" and "never going to be"
     * with no way to tell them apart. Its own timestamp and actor rather than
     * borrowing paid_at/paid_by, because a skipped commission was never paid.
     */
    skippedAt: timestamp("skipped_at", { withTimezone: true }),
    skippedBy: integer("skipped_by").references(() => staff.id, { onDelete: "set null" }),
    skipReason: text("skip_reason").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("commissions_order_idx").on(table.orderId),
    index("commissions_customer_idx").on(table.customerId),
    index("commissions_status_idx").on(table.status),
    index("commissions_depot_product_idx").on(table.depotId, table.productId),
    check("commissions_quantity_check", sql`${table.quantity} > 0`),
    check("commissions_rate_check", sql`${table.commissionRate} >= 0`),
    check("commissions_amount_check", sql`${table.commissionAmount} >= 0`),
  ]
);

module.exports = { commissions };
