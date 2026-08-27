const {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
} = require("drizzle-orm/pg-core");

const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  accountNumber: varchar("account_number", { length: 50 }).notNull(),
  bankCode: varchar("bank_code", { length: 50 }).default(""),
  branchName: varchar("branch_name", { length: 150 }).default(""),
  currency: varchar("currency", { length: 10 }).default("NGN").notNull(),
  status: varchar("status", { length: 20 }).default("Active").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  depotIds: jsonb("depot_ids").default([]).notNull(),
  lpgStationIds: jsonb("lpg_station_ids").default([]).notNull(),
  /** Which areas may collect into this account: "truck_sales", "expenses". */
  usage: jsonb("usage").default([]).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

module.exports = { bankAccounts };
