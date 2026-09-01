const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  check,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { orders } = require("./order");
const { bankStatementLines } = require("./bankStatement");
const { bankAccounts } = require("./bankAccount");
const { deposits } = require("./deposit");
const { staff } = require("./staff");

/**
 * Moving surplus from the order that received it to the order that needs it.
 *
 * Before this table the same thing was done as a wallet debit plus a wallet
 * credit, with the destination typed into a free-text description ("From TRF
 * TO ORDER FG10800 — Overpayment transferred to order #10800"), which the
 * finance report then recovered with a regular expression. The movement had no
 * amount of its own, no reason, no approver and no way to be listed.
 *
 * Each transfer writes exactly two rows in orderPayments — a negative
 * `transfer_out` on the order it leaves, a positive `transfer_in` on the order
 * it lands on — so summing an order's payment rows already nets out anything
 * it has given away. Nothing downstream needs a special case.
 */
const orderPaymentTransfers = pgTable(
  "order_payment_transfers",
  {
    id: serial("id").primaryKey(),
    fromOrderId: integer("from_order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    toOrderId: integer("to_order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    reason: text("reason").default("").notNull(),
    recordedBy: integer("recorded_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("order_payment_transfers_from_idx").on(table.fromOrderId),
    index("order_payment_transfers_to_idx").on(table.toOrderId),
    check("order_payment_transfers_amount_check", sql`${table.amount} > 0`),
    check(
      "order_payment_transfers_distinct_check",
      sql`${table.fromOrderId} <> ${table.toOrderId}`,
    ),
  ],
);

/**
 * Money received against an ORDER. The single record of it — see migration
 * 0021 for what this replaced and why.
 *
 * The bank columns are a SNAPSHOT of the statement line, copied on at match
 * time rather than joined at read time. Three reasons, all of them things
 * that went wrong under the join:
 *
 *   * A deposit funded by several lines resolved to whichever had the lowest
 *     id — upload order, not banking order — so a column headed "Deposit
 *     Date" showed an effectively arbitrary date.
 *   * A line later re-matched elsewhere silently rewrote the history of the
 *     order it used to be on.
 *   * The report is meant to be checked against a bank statement line by
 *     line. What it prints has to be what was matched, not what the join
 *     resolves to today.
 */
const orderPayments = pgTable(
  "order_payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),

    /**
     * The bank row this payment IS.
     *
     * Null only on a transfer leg or a legacy row — that is, exactly where no
     * bank line exists. Never null as "not filled in yet".
     */
    statementLineId: integer("statement_line_id").references(() => bankStatementLines.id, {
      onDelete: "restrict",
    }),
    bankAccountId: integer("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),

    /**
     * Signed. Negative on the outgoing leg of a transfer, so what an order
     * received is a plain SUM with no case analysis anywhere above it.
     */
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),

    /** 'statement' | 'transfer_in' | 'transfer_out' | 'legacy' — see SOURCE. */
    source: varchar("source", { length: 16 }).notNull().default("statement"),

    // ── the statement line, verbatim ──
    txnDate: timestamp("txn_date", { withTimezone: true }),
    depositor: varchar("depositor", { length: 255 }).default("").notNull(),
    narration: text("narration").default("").notNull(),
    bankRef: varchar("bank_ref", { length: 255 }).default("").notNull(),
    bankName: varchar("bank_name", { length: 255 }).default("").notNull(),
    accountName: varchar("account_name", { length: 255 }).default("").notNull(),
    accountNumber: varchar("account_number", { length: 64 }).default("").notNull(),

    // ── provenance ──
    transferId: integer("transfer_id").references(() => orderPaymentTransfers.id, {
      onDelete: "restrict",
    }),
    /** The wallet row this was derived from, where the backfill had one. */
    depositId: integer("deposit_id").references(() => deposits.id, { onDelete: "set null" }),
    recordedBy: integer("recorded_by").references(() => staff.id, { onDelete: "set null" }),
    note: text("note").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    /**
     * ONE order per statement line, ever.
     *
     * This is the constraint that makes the report reconcile against the bank
     * statement: a line appears once, under one order. Where a payment
     * overshot the order it was made for, the surplus stays on that order and
     * moving it is an explicit transfer — rather than the line being split
     * across two orders, which is how the same ₦54,450,000 came to appear
     * twice on one report.
     */
    uniqueIndex("order_payments_statement_line_unique")
      .on(table.statementLineId)
      .where(sql`${table.statementLineId} IS NOT NULL`),
    index("order_payments_order_idx").on(table.orderId),
    index("order_payments_source_idx").on(table.source),
    index("order_payments_txn_date_idx").on(table.txnDate),
    index("order_payments_transfer_idx").on(table.transferId),
    check(
      "order_payments_source_check",
      sql`${table.source} IN ('statement', 'transfer_in', 'transfer_out', 'legacy')`,
    ),
    // The sign is a function of the source, not an independent field, so a
    // transfer-out can never be written positive and quietly inflate an order.
    check(
      "order_payments_sign_check",
      sql`(${table.source} = 'transfer_out' AND ${table.amount} < 0) OR (${table.source} <> 'transfer_out' AND ${table.amount} > 0)`,
    ),
    check(
      "order_payments_statement_check",
      sql`${table.statementLineId} IS NULL OR ${table.txnDate} IS NOT NULL`,
    ),
  ],
);

/**
 * How money reached an order.
 *
 *   STATEMENT     a bank statement line matched to THIS order. The only kind
 *                 an external auditor can check, and the only kind the desk
 *                 can create.
 *   TRANSFER_IN   surplus moved onto this order from another.
 *   TRANSFER_OUT  surplus moved off this order to another. Negative amount.
 *   LEGACY        recorded before payments were kept against orders. Carries
 *                 no bank evidence and is never presented as though it does.
 */
const PAYMENT_SOURCE = {
  STATEMENT: "statement",
  TRANSFER_IN: "transfer_in",
  TRANSFER_OUT: "transfer_out",
  LEGACY: "legacy",
};

module.exports = { orderPayments, orderPaymentTransfers, PAYMENT_SOURCE };
