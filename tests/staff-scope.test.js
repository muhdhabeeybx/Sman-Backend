// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");

const { db } = require("../config/db");
const { depots } = require("../db/schema");
const { staffRepo, staffScopeRepo } = require("../repositories");
const { closeDb } = require("./helpers");

const RUN = Date.now();

describe("staff auth-context scoping", () => {
  after(async () => {
    await closeDb();
  });

  test("a super_admin sees all locations even with the flag off and no assignments", async () => {
    // The exact real-world case a data migration surfaced: a super_admin whose
    // can_view_all_locations was false and who held no depot/PFI scope was
    // filtered down to zero rows on every scoped resource.
    const s = await staffRepo.create({
      firstName: "Super",
      surname: `NoFlag ${RUN}`,
      email: `super-noflag-${RUN}@soroman.test`,
      roles: ["super_admin"],
      canViewAllLocations: false,
      isActive: true,
    });

    const ctx = await staffScopeRepo.getAuthContext(s.id);
    assert.equal(ctx.canViewAllLocations, true, "super_admin is all-access by role");
    assert.deepEqual(ctx.scope.depotIds, [], "and carries no narrowing scope");
  });

  test("an ordinary scoped staffer keeps their exact depot scope", async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: `Scope Depot ${RUN}`,
        code: `SCP${String(RUN).slice(-5)}`,
        address: "1 Rd",
        city: "Lagos",
        state: "Lagos",
        country: "NG",
        postcode: "100001",
        maxCapacity: 1000000,
        establishedYear: "2020",
      })
      .returning();

    const s = await staffRepo.create({
      firstName: "Sales",
      surname: `Scoped ${RUN}`,
      email: `sales-scoped-${RUN}@soroman.test`,
      roles: ["sales_manager"],
      canViewAllLocations: false,
      isActive: true,
    });
    await staffScopeRepo.setScope(s.id, { depotIds: [depot.id] });

    const ctx = await staffScopeRepo.getAuthContext(s.id);
    assert.equal(ctx.canViewAllLocations, false, "non-super_admin stays scoped");
    assert.deepEqual(ctx.scope.depotIds, [depot.id], "to exactly their assigned depot");
  });

  test("a super_admin who also holds scope still sees everything", async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: `Super Scope Depot ${RUN}`,
        code: `SSD${String(RUN).slice(-5)}`,
        address: "1 Rd",
        city: "Lagos",
        state: "Lagos",
        country: "NG",
        postcode: "100001",
        maxCapacity: 1000000,
        establishedYear: "2020",
      })
      .returning();

    const s = await staffRepo.create({
      firstName: "Super",
      surname: `Scoped ${RUN}`,
      email: `super-scoped-${RUN}@soroman.test`,
      roles: ["super_admin", "sales_manager"],
      canViewAllLocations: false,
      isActive: true,
    });
    await staffScopeRepo.setScope(s.id, { depotIds: [depot.id] });

    const ctx = await staffScopeRepo.getAuthContext(s.id);
    assert.equal(ctx.canViewAllLocations, true, "role wins over a present-but-narrow scope");
  });
});
