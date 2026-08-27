const { pgTable, index, unique, varchar, integer, foreignKey } = require("drizzle-orm/pg-core");
const { djangoContentType } = require("./djangoContentType");

const authPermission = pgTable("auth_permission", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "auth_permission_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: varchar({ length: 255 }).notNull(),
	contentTypeId: integer("content_type_id").notNull(),
	codename: varchar({ length: 100 }).notNull(),
}, (table) => [
	index("auth_permission_content_type_id_2f476e4b").using("btree", table.contentTypeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.contentTypeId],
			foreignColumns: [djangoContentType.id],
			name: "auth_permission_content_type_id_2f476e4b_fk_django_co"
		}),
	unique("auth_permission_content_type_id_codename_01ab375a_uniq").on(table.contentTypeId, table.codename),
]);

module.exports = { authPermission };
