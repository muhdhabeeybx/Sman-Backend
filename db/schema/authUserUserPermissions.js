const { pgTable, index, unique, bigint, integer, foreignKey } = require("drizzle-orm/pg-core");
const { authPermission } = require("./authPermission");
const { authUser } = require("./authUser");

const authUserUserPermissions = pgTable("auth_user_user_permissions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "auth_user_user_permissions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	userId: integer("user_id").notNull(),
	permissionId: integer("permission_id").notNull(),
}, (table) => [
	index("auth_user_user_permissions_permission_id_1fbb5f2c").using("btree", table.permissionId.asc().nullsLast().op("int4_ops")),
	index("auth_user_user_permissions_user_id_a95ead1b").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.permissionId],
			foreignColumns: [authPermission.id],
			name: "auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [authUser.id],
			name: "auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id"
		}),
	unique("auth_user_user_permissions_user_id_permission_id_14a6b632_uniq").on(table.userId, table.permissionId),
]);

module.exports = { authUserUserPermissions };
