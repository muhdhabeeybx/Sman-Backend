const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  numeric,
  timestamp,
  index,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { staff } = require("./staff");

/**
 * One row per press of Send on the messaging page.
 *
 * `notification_deliveries` already recorded every individual attempt, but a
 * broadcast fanned out into hundreds of rows with nothing tying them together
 * — so "what did we send on Tuesday, to whom, and what did it cost?" had no
 * query behind it. This is that missing parent.
 *
 * The body is stored RESOLVED: what recipients actually received, not the
 * "{{prices}}" that was typed into the composer. A campaign is a record of
 * what went out; the shortcode belongs in the template it came from.
 */
const messageCampaigns = pgTable(
  "message_campaigns",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).default("").notNull(),
    body: text("body").default("").notNull(),
    channels: text("channels").array().default(sql`'{}'::text[]`).notNull(),

    // The preset id the sender chose, plus the sentence describing what it
    // meant AT THE TIME. "Frequent customers" is tunable on the page, so the
    // id alone would leave a campaign whose audience cannot be reconstructed.
    audience: varchar("audience", { length: 64 }).default("").notNull(),
    audienceLabel: varchar("audience_label", { length: 255 }).default("").notNull(),

    recipientCount: integer("recipient_count").default(0).notNull(),
    /** Per recipient, on the resolved text — × recipientCount is the bill. */
    smsSegments: integer("sms_segments").default(0).notNull(),

    // Read from Termii either side of the send rather than computed. Termii is
    // the authority on its own billing, and an estimate would drift from the
    // invoice. 346 sends on the live book failed for an empty wallet nobody
    // could see; this is the record that makes that visible after the fact.
    balanceBefore: numeric("balance_before", { precision: 15, scale: 2 }),
    balanceAfter: numeric("balance_after", { precision: 15, scale: 2 }),
    balanceCurrency: varchar("balance_currency", { length: 10 }).default("").notNull(),

    sentBy: integer("sent_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("message_campaigns_created_at_idx").on(table.createdAt)]
);

module.exports = { messageCampaigns };
