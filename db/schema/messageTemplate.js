const {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { staff } = require("./staff");

/**
 * A saved message an admin can reload into the messaging composer instead of
 * retyping — e.g. "Frequent buyer thank-you" or "Inactive customer reminder".
 * Deliberately just the copy, not the audience: who it goes to is chosen
 * fresh each send, since a template written for "frequent buyers" is equally
 * useful pointed at "specific customers" later.
 */
const messageTemplates = pgTable(
  "message_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    subject: varchar("subject", { length: 200 }).default(""),
    body: text("body").notNull(),
    // Which channels this template was composed for — a hint the composer
    // pre-checks on load, not an enforced constraint.
    channels: text("channels").array().default(sql`ARRAY[]::text[]`).notNull(),
    createdBy: integer("created_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("message_templates_name_idx").on(sql`lower(${table.name})`),
  ]
);

module.exports = { messageTemplates };
