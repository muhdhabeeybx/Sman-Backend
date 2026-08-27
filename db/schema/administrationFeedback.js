const { pgTable, bigint, varchar, timestamp, text, check, smallint } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");

const administrationFeedback = pgTable("administration_feedback", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_feedback_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 254 }).notNull(),
	phone: varchar({ length: 50 }),
	company: varchar({ length: 255 }),
	category: varchar({ length: 100 }).notNull(),
	rating: smallint().notNull(),
	message: text().notNull(),
	status: varchar({ length: 20 }).notNull(),
	staffResponse: text("staff_response"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	check("administration_feedback_rating_check", sql`rating >= 0`),
]);

module.exports = { administrationFeedback };
