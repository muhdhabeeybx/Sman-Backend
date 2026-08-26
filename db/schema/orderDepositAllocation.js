const { pgTable, serial, integer, decimal, varchar, timestamp, index, uniqueIndex } = require("drizzle-orm/pg-core");
const { orders } = require("./order");
const { deposits } = require("./deposit");

/**
 * Which credit deposit(s) paid for which order, how much of each, and how it
 * got there.
 *
 * Written by walletService.allocateOrderFunding() the moment an order's hold
 * is placed, reversed by deallocateOrderFunding() if the hold is released.
 * Purely additive bookkeeping alongside the real balance debit — a row here
 * is never the source of truth for whether an order is paid, only a record
 * of where the money is understood to have come from.
 *
 * `amount` and `appliedAmount` answer two different questions and are equal
 * on most rows. See db/migrations/0011 for why they had to come apart:
 *
 *   amount         what was RECEIVED against this order. For a bank row this
 *                  is the statement line at face value, so the column
 *                  reconciles against the statement one line at a time.
 *   appliedAmount  what the order actually CONSUMED of it, never more than
 *                  the order's own value. This is what draws the deposit's
 *                  remainingAmount down, so a surplus stays spendable and
 *                  keeps naming the reference it arrived under.
 */
const orderDepositAllocations = pgTable(
  "order_deposit_allocations",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    depositId: integer("deposit_id")
      .notNull()
      .references(() => deposits.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    appliedAmount: decimal("applied_amount", { precision: 15, scale: 2 }).notNull(),
    /** 'bank' | 'wallet' | 'legacy' — see ALLOCATION_SOURCE in wallet.service. */
    source: varchar("source", { length: 16 }).notNull().default("legacy"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("order_deposit_allocations_order_deposit_idx").on(table.orderId, table.depositId),
    index("order_deposit_allocations_deposit_idx").on(table.depositId),
    index("order_deposit_allocations_source_idx").on(table.source),
  ]
);

module.exports = { orderDepositAllocations };
