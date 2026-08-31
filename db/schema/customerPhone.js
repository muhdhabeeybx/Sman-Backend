const {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { customers } = require("./customer");
const { staff } = require("./staff");

/**
 * The alternate numbers a customer can also be reached — and sign in — on.
 *
 * The PRIMARY number is not in here; it stays on `customers.phone`, which is
 * what every SMS sender, the DVA name and three order flows already read.
 * See db/migrations/0019_customer_phone_numbers.sql for why the primary was
 * deliberately not moved, and why the cross-table uniqueness check lives in
 * the repository rather than in a constraint.
 */
const customerPhones = pgTable(
  "customer_phones",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 30 }).notNull(),
    /** Last 10 digits, generated and stored — the key a login is resolved on. */
    phoneNormalized: varchar("phone_normalized", { length: 20 }).generatedAlwaysAs(
      sql`RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10)`
    ),
    label: varchar("label", { length: 60 }).default("").notNull(),
    /** Stamped the first time an OTP is passed on this number. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("customer_phones_normalized_idx").on(table.phoneNormalized),
    index("customer_phones_customer_idx").on(table.customerId),
  ]
);

module.exports = { customerPhones };
