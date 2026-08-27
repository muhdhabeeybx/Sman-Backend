const { pgTable, timestamp, smallint } = require("drizzle-orm/pg-core");

const djangoCeleryBeatPeriodictasks = pgTable("django_celery_beat_periodictasks", {
	ident: smallint().primaryKey().notNull(),
	lastUpdate: timestamp("last_update", { withTimezone: true, mode: 'string' }).notNull(),
});

module.exports = { djangoCeleryBeatPeriodictasks };
