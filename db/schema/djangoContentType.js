const { pgTable, unique, varchar, integer } = require("drizzle-orm/pg-core");

const djangoContentType = pgTable("django_content_type", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_content_type_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	appLabel: varchar("app_label", { length: 100 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
}, (table) => [
	unique("django_content_type_app_label_model_76bd3d3b_uniq").on(table.appLabel, table.model),
]);

module.exports = { djangoContentType };
