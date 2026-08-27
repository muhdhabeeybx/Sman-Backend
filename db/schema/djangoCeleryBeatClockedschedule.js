const { pgTable, timestamp, integer } = require("drizzle-orm/pg-core");

const djangoCeleryBeatClockedschedule = pgTable("django_celery_beat_clockedschedule", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_celery_beat_clockedschedule_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	clockedTime: timestamp("clocked_time", { withTimezone: true, mode: 'string' }).notNull(),
});

module.exports = { djangoCeleryBeatClockedschedule };
