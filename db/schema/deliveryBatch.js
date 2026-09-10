const { pgTable, varchar, text, timestamp, index } = require("drizzle-orm/pg-core");

/**
 * A delivery batch that has been closed.
 *
 * A batch is not otherwise a row anywhere: it is every `delivery_inventory`
 * row sharing an `allocation_code`, grouped on the way to the screen. That
 * stays true — this table holds one fact the grouping has nowhere to put, and
 * only for the batches somebody has actually closed.
 *
 * Absence of a row means active, so nothing needed backfilling and a batch
 * that is never closed never appears here.
 *
 * See db/migrations/0028_delivery_batch_status.sql, including why closing a
 * batch deliberately does not touch `pfis.status` on the PFI behind it.
 */
const deliveryBatches = pgTable(
  "delivery_batches",
  {
    /** The allocation code, trimmed and upper-cased — the register's own key. */
    code: varchar("code", { length: 100 }).primaryKey(),
    /** 'active' | 'completed'. Checked in the database, see the migration. */
    status: varchar("status", { length: 20 }).default("active").notNull(),
    /**
     * When and by whom. Cleared on reopen: the batch is running again, and
     * the last close is not a fact about its present state.
     */
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: varchar("closed_by", { length: 255 }).default("").notNull(),
    /** Why, where somebody says so. Optional. */
    note: text("note").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("delivery_batches_status_idx").on(table.status)]
);

module.exports = { deliveryBatches };
