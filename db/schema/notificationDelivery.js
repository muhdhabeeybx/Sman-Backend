const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  index,
} = require("drizzle-orm/pg-core");
const {
  principalTypeEnum,
  notificationChannelEnum,
  notificationDeliveryStatusEnum,
} = require("./enums");
const { notifications } = require("./notification");

/**
 * One row per (notification, channel) attempt — the answer to "did the customer
 * actually get told?".
 *
 * Before this table the answer lived in console.warn: a Termii failure printed
 * a line and vanished, and support had no way to tell a customer who swore they
 * were never notified from one who deleted the SMS. Every outbound attempt now
 * lands here with its provider id and its error.
 *
 * Deliberately NOT under the exclusive-arc CHECK the other tables use. This is
 * a log, and it must also record sends that have no principal behind them at
 * all — a password-setup email to an address that is not yet a usable account,
 * or a broadcast whose recipient row was deleted afterwards. A constraint that
 * refuses to record a failure is worse than no constraint.
 */
const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: serial("id").primaryKey(),

    // Null for channel-only sends that never produced an inbox row (a password
    // reset is an email, not something to re-read in the app).
    notificationId: integer("notification_id").references(() => notifications.id, {
      onDelete: "cascade",
    }),

    // The broadcast this attempt belongs to, when it was one. Null for every
    // transactional send — an order confirmation has no campaign behind it.
    campaignId: integer("campaign_id"),

    principalType: principalTypeEnum("principal_type"),
    staffId: integer("staff_id"),
    customerId: integer("customer_id"),

    /**
     * Who it went to, in words.
     *
     * staff_id / customer_id cover the principals, but a broadcast to leads
     * has no principal at all — a contact is addressed by their details — so
     * the log could only ever show a bare phone number. Denormalised on
     * purpose: this is an audit log, and the name as it stood when the message
     * went out is the truthful answer, not what the record was renamed to
     * afterwards.
     */
    recipientName: varchar("recipient_name", { length: 255 }).default("").notNull(),

    type: varchar("type", { length: 64 }).notNull(),
    channel: notificationChannelEnum("channel").notNull(),

    // Where it went, for support. Push stores only the token's last 12 chars —
    // a whole FCM token is a live credential for that device and this table is
    // read by anyone with dashboard access.
    destination: varchar("destination", { length: 255 }).default("").notNull(),

    status: notificationDeliveryStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }).default("").notNull(),
    error: text("error"),

    /**
     * The provider's own word for the outcome, verbatim — "DELIVERED",
     * "Rejected", "Expired".
     *
     * Kept beside `status` rather than mapped into it: Termii's vocabulary is
     * finer than our six values, and the difference between "the handset never
     * came online" and "the network refused it" is exactly what a support
     * question turns on.
     */
    providerStatus: varchar("provider_status", { length: 64 }).default("").notNull(),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** When the carrier confirmed it landed. Written by the DLR webhook only. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notification_deliveries_notification_idx").on(table.notificationId),
    // The operational query: "what is failing, on which channel, lately?"
    index("notification_deliveries_channel_status_idx").on(
      table.channel,
      table.status,
      table.createdAt
    ),
    index("notification_deliveries_type_idx").on(table.type, table.createdAt),
    index("notification_deliveries_staff_idx").on(table.staffId, table.createdAt),
    index("notification_deliveries_customer_idx").on(table.customerId, table.createdAt),
    // "Show me this campaign's recipients", the campaign detail view's query.
    index("notification_deliveries_campaign_idx").on(table.campaignId, table.createdAt),
    // The delivery-receipt lookup: a Termii callback carries only its own
    // message id and has to find the row it belongs to.
    index("notification_deliveries_provider_message_idx").on(table.providerMessageId),
  ]
);

module.exports = { notificationDeliveries };
