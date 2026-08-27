const { pgTable, unique, varchar, integer, numeric } = require("drizzle-orm/pg-core");

const djangoCeleryBeatSolarschedule = pgTable("django_celery_beat_solarschedule", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_celery_beat_solarschedule_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	event: varchar({ length: 24 }).notNull(),
	latitude: numeric({ precision: 9, scale:  6 }).notNull(),
	longitude: numeric({ precision: 9, scale:  6 }).notNull(),
}, (table) => [
	unique("django_celery_beat_solar_event_latitude_longitude_ba64999a_uniq").on(table.event, table.latitude, table.longitude),
]);

module.exports = { djangoCeleryBeatSolarschedule };
