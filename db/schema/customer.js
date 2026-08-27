const {
  pgTable,
  serial,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} = require("drizzle-orm/pg-core");
const { customerStatusEnum, customerCreatedViaEnum } = require("./enums");

const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).default(""),
    phone: varchar("phone", { length: 30 }).notNull(),
    companyName: varchar("company_name", { length: 255 }).default(""),
    address: text("address").default(""),
    status: customerStatusEnum("status").default("Active").notNull(),
    // Staff-managed suppression for the messaging feature — set from the
    // customer record, respected by segment resolution. Not a self-service
    // unsubscribe; there's no inbound SMS/email loop wired up for that.
    marketingOptOut: boolean("marketing_opt_out").default(false).notNull(),
    // Which surface created this customer. WhatsApp-created customers are
    // Active with phone_verified_at set on creation — the message itself
    // proved phone control, so no OTP was sent.
    createdVia: customerCreatedViaEnum("created_via").default("desk").notNull(),
    balance: decimal("balance", { precision: 15, scale: 2 }).default("0").notNull(),
    deposit: decimal("deposit", { precision: 15, scale: 2 }).default("0").notNull(),
    previousDeposit: decimal("previous_deposit", { precision: 15, scale: 2 }).default("0").notNull(),
    paystackCustomerId: varchar("paystack_customer_id", { length: 100 }).default(""),
    virtualAccountNumber: varchar("virtual_account_number", { length: 30 }).default(""),
    virtualAccountBank: varchar("virtual_account_bank", { length: 100 }).default(""),
    virtualAccountName: varchar("virtual_account_name", { length: 255 }).default(""),
    dvaSubaccountCode: varchar("dva_subaccount_code", { length: 100 }).default(""),
    // Commission payout bank details — where the company sends commission payments.
    commissionBankName: varchar("commission_bank_name", { length: 255 }).default(""),
    commissionAccountName: varchar("commission_account_name", { length: 255 }).default(""),
    commissionAccountNumber: varchar("commission_account_number", { length: 30 }).default(""),
    // Written by verify-otp; cleared by any phone change, which also revokes
    // every session for the customer.
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("customers_phone_idx").on(table.phone),
    index("customers_email_idx").on(table.email),
    index("customers_virtual_account_idx").on(table.virtualAccountNumber),
  ]
);

module.exports = { customers };
