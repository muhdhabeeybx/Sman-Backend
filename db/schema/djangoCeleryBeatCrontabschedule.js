const { pgTable, varchar, integer } = require("drizzle-orm/pg-core");

const djangoCeleryBeatCrontabschedule = pgTable("django_celery_beat_crontabschedule", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_celery_beat_crontabschedule_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	minute: varchar({ length: 240 }).notNull(),
	hour: varchar({ length: 96 }).notNull(),
	dayOfWeek: varchar("day_of_week", { length: 64 }).notNull(),
	dayOfMonth: varchar("day_of_month", { length: 124 }).notNull(),
	monthOfYear: varchar("month_of_year", { length: 64 }).notNull(),
	timezone: varchar({ length: 63 }).notNull(),
});

module.exports = { djangoCeleryBeatCrontabschedule };
