const {
  pgTable,
  serial,
  integer,
  timestamp,
  index,
  uniqueIndex,
} = require("drizzle-orm/pg-core");
const { pfis } = require("./pfi");
const { staff } = require("./staff");

const pfiStaff = pgTable(
  "pfi_staff",
  {
    id: serial("id").primaryKey(),
    pfiId: integer("pfi_id")
      .notNull()
      .references(() => pfis.id, { onDelete: "cascade" }),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pfi_staff_unique_idx").on(table.pfiId, table.staffId),
    index("pfi_staff_pfi_idx").on(table.pfiId),
    index("pfi_staff_staff_idx").on(table.staffId),
  ]
);

module.exports = { pfiStaff };
