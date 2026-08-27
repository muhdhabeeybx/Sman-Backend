const { pgTable, index, unique, bigint, integer, foreignKey } = require("drizzle-orm/pg-core");
const { authGroup } = require("./authGroup");
const { authUser } = require("./authUser");

const authUserGroups = pgTable("auth_user_groups", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "auth_user_groups_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	userId: integer("user_id").notNull(),
	groupId: integer("group_id").notNull(),
}, (table) => [
	index("auth_user_groups_group_id_97559544").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
	index("auth_user_groups_user_id_6a12ed8b").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [authGroup.id],
			name: "auth_user_groups_group_id_97559544_fk_auth_group_id"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [authUser.id],
			name: "auth_user_groups_user_id_6a12ed8b_fk_auth_user_id"
		}),
	unique("auth_user_groups_user_id_group_id_94350c0c_uniq").on(table.userId, table.groupId),
]);

module.exports = { authUserGroups };
