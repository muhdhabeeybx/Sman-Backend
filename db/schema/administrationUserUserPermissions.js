const { pgTable, index, unique, bigint, integer, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { authPermission } = require("./authPermission");

const administrationUserUserPermissions = pgTable("administration_user_user_permissions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_user_user_permissions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	permissionId: integer("permission_id").notNull(),
}, (table) => [
	index("administration_user_user_permissions_permission_id_5b940bd2").using("btree", table.permissionId.asc().nullsLast().op("int4_ops")),
	index("administration_user_user_permissions_user_id_69e83b80").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "administration_user__user_id_69e83b80_fk_administr"
		}),
	foreignKey({
			columns: [table.permissionId],
			foreignColumns: [authPermission.id],
			name: "administration_user__permission_id_5b940bd2_fk_auth_perm"
		}),
	unique("administration_user_user_user_id_permission_id_1258dc72_uniq").on(table.userId, table.permissionId),
]);

module.exports = { administrationUserUserPermissions };
