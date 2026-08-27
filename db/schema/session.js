const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  char,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  check,
} = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { principalTypeEnum } = require("./enums");
const { staff } = require("./staff");
const { customers } = require("./customer");

/**
 * One sessions table for both realms, using an exclusive arc: exactly one of
 * staff_id / customer_id is set, enforced by a CHECK rather than by convention.
 *
 * Two tables were considered and rejected — every query, index and rotation
 * routine would have been written twice, and "revoke every session for this
 * principal" is one code path, not two. Divergent TTLs (7 d staff, 30 d
 * customer) are a value in expires_at, not a reason for a second table.
 */
const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    principalType: principalTypeEnum("principal_type").notNull(),
    staffId: integer("staff_id").references(() => staff.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "cascade" }),

    // sha256(principal_type + ":" + token), lowercase hex — always 64 chars.
    // Domain-separated so a token minted for one realm cannot match a row in
    // the other even if a query forgets its realm predicate.
    refreshTokenHash: char("refresh_token_hash", { length: 64 }).notNull(),

    familyId: uuid("family_id").notNull(),
    // Successor session after rotation. Plain integer, deliberately not a
    // self-FK: the row it points at is created in the same statement, and a
    // self-referencing FK would order the writes for no gain.
    replacedById: integer("replaced_by_id"),
    // rotated | logout | logout_all | reuse_detected
    // | password_change | principal_deactivated | phone_changed
    // | account_deleted
    revokedReason: varchar("revoked_reason", { length: 32 }),

    deviceName: varchar("device_name", { length: 255 }).default(""),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "sessions_principal_arc_check",
      sql`(${table.principalType} = 'staff'    AND ${table.staffId}    IS NOT NULL AND ${table.customerId} IS NULL)
       OR (${table.principalType} = 'customer' AND ${table.customerId} IS NOT NULL AND ${table.staffId}    IS NULL)`
    ),
    uniqueIndex("sessions_refresh_token_hash_idx").on(table.refreshTokenHash),
    index("sessions_staff_idx")
      .on(table.staffId, table.createdAt)
      .where(sql`${table.staffId} IS NOT NULL`),
    index("sessions_customer_idx")
      .on(table.customerId, table.createdAt)
      .where(sql`${table.customerId} IS NOT NULL`),
    index("sessions_family_idx").on(table.familyId),
    index("sessions_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL`),
  ]
);

module.exports = { sessions };
