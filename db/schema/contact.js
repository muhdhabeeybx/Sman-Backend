const {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { contactStageEnum, contactSourceEnum } = require("./enums");
const { depots } = require("./depot");
const { staff } = require("./staff");

/**
 * Someone we hold a number for who is not a customer.
 *
 * Deliberately its own table rather than a status on `customers` — see
 * db/migrations/0005_contacts_and_leads.sql for why, and for why there is no
 * stored "converted" flag: whether a contact has become a customer is derived
 * from a phone match at read time, so it cannot go stale.
 */
const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 30 }).notNull(),
    /** Last 10 digits, generated and stored. The identity a person is deduped on. */
    phoneNormalized: varchar("phone_normalized", { length: 20 }).generatedAlwaysAs(
      sql`RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10)`
    ),
    email: varchar("email", { length: 255 }).default("").notNull(),
    companyName: varchar("company_name", { length: 255 }).default("").notNull(),
    stage: contactStageEnum("stage").default("lead").notNull(),
    source: contactSourceEnum("source").default("manual").notNull(),
    locationId: integer("location_id").references(() => depots.id, { onDelete: "set null" }),
    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
    notes: text("notes").default("").notNull(),
    marketingOptOut: boolean("marketing_opt_out").default(false).notNull(),
    createdBy: integer("created_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contacts_phone_normalized_idx").on(table.phoneNormalized),
    index("contacts_stage_idx").on(table.stage),
    index("contacts_location_idx").on(table.locationId),
    index("contacts_created_at_idx").on(table.createdAt),
  ]
);

module.exports = { contacts };
