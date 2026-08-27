const { pgTable, index, unique, varchar, boolean, timestamp, integer, text, foreignKey, check } = require("drizzle-orm/pg-core");
const { sql } = require("drizzle-orm");
const { djangoCeleryBeatClockedschedule } = require("./djangoCeleryBeatClockedschedule");
const { djangoCeleryBeatCrontabschedule } = require("./djangoCeleryBeatCrontabschedule");
const { djangoCeleryBeatIntervalschedule } = require("./djangoCeleryBeatIntervalschedule");
const { djangoCeleryBeatSolarschedule } = require("./djangoCeleryBeatSolarschedule");

const djangoCeleryBeatPeriodictask = pgTable("django_celery_beat_periodictask", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_celery_beat_periodictask_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: varchar({ length: 200 }).notNull(),
	task: varchar({ length: 200 }).notNull(),
	args: text().notNull(),
	kwargs: text().notNull(),
	queue: varchar({ length: 200 }),
	exchange: varchar({ length: 200 }),
	routingKey: varchar("routing_key", { length: 200 }),
	expires: timestamp({ withTimezone: true, mode: 'string' }),
	enabled: boolean().notNull(),
	lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: 'string' }),
	totalRunCount: integer("total_run_count").notNull(),
	dateChanged: timestamp("date_changed", { withTimezone: true, mode: 'string' }).notNull(),
	description: text().notNull(),
	crontabId: integer("crontab_id"),
	intervalId: integer("interval_id"),
	solarId: integer("solar_id"),
	oneOff: boolean("one_off").notNull(),
	startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }),
	priority: integer(),
	headers: text().notNull(),
	clockedId: integer("clocked_id"),
	expireSeconds: integer("expire_seconds"),
}, (table) => [
	index("django_celery_beat_periodictask_clocked_id_47a69f82").using("btree", table.clockedId.asc().nullsLast().op("int4_ops")),
	index("django_celery_beat_periodictask_crontab_id_d3cba168").using("btree", table.crontabId.asc().nullsLast().op("int4_ops")),
	index("django_celery_beat_periodictask_interval_id_a8ca27da").using("btree", table.intervalId.asc().nullsLast().op("int4_ops")),
	index("django_celery_beat_periodictask_name_265a36b7_like").using("btree", table.name.asc().nullsLast().op("varchar_pattern_ops")),
	index("django_celery_beat_periodictask_solar_id_a87ce72c").using("btree", table.solarId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.crontabId],
			foreignColumns: [djangoCeleryBeatCrontabschedule.id],
			name: "django_celery_beat_p_crontab_id_d3cba168_fk_django_ce"
		}),
	foreignKey({
			columns: [table.intervalId],
			foreignColumns: [djangoCeleryBeatIntervalschedule.id],
			name: "django_celery_beat_p_interval_id_a8ca27da_fk_django_ce"
		}),
	foreignKey({
			columns: [table.solarId],
			foreignColumns: [djangoCeleryBeatSolarschedule.id],
			name: "django_celery_beat_p_solar_id_a87ce72c_fk_django_ce"
		}),
	foreignKey({
			columns: [table.clockedId],
			foreignColumns: [djangoCeleryBeatClockedschedule.id],
			name: "django_celery_beat_p_clocked_id_47a69f82_fk_django_ce"
		}),
	unique("django_celery_beat_periodictask_name_key").on(table.name),
	check("django_celery_beat_periodictask_total_run_count_check", sql`total_run_count >= 0`),
	check("django_celery_beat_periodictask_priority_check", sql`priority >= 0`),
	check("django_celery_beat_periodictask_expire_seconds_check", sql`expire_seconds >= 0`),
]);

module.exports = { djangoCeleryBeatPeriodictask };
