const { pgTable, index, unique, bigint, integer, foreignKey } = require("drizzle-orm/pg-core");
const { administrationUser } = require("./administrationUser");
const { authGroup } = require("./authGroup");

const administrationUserGroups = pgTable("administration_user_groups", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "administration_user_groups_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	groupId: integer("group_id").notNull(),
}, (table) => [
	index("administration_user_groups_group_id_43b1e17e").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
	index("administration_user_groups_user_id_fcbab611").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [administrationUser.id],
			name: "administration_user__user_id_fcbab611_fk_administr"
		}),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [authGroup.id],
			name: "administration_user_groups_group_id_43b1e17e_fk_auth_group_id"
		}),
	unique("administration_user_groups_user_id_group_id_97943ac2_uniq").on(table.userId, table.groupId),
]);

module.exports = { administrationUserGroups };
