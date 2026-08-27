const { pgTable, varchar, integer } = require("drizzle-orm/pg-core");

const djangoCeleryBeatIntervalschedule = pgTable("django_celery_beat_intervalschedule", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_celery_beat_intervalschedule_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	every: integer().notNull(),
	period: varchar({ length: 24 }).notNull(),
});

module.exports = { djangoCeleryBeatIntervalschedule };
