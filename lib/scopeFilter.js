const { inArray, or, sql } = require("drizzle-orm");

/**
 * A location/PFI-scoped user only reads/writes rows tied to their assigned
 * depots, LPG stations or PFIs — matched OR-wise, since a user can hold both
 * a location scope and a PFI scope and either should let a row through.
 *
 * Mirrors the onlySubmitterId pattern already used for expense visibility in
 * pfiExpense.repository.js: a condition to fold into the caller's own
 * `conditions` array, `null` when there is nothing to restrict.
 *
 * @param {{canViewAllLocations: boolean, scope: {depotIds: number[], lpgStationIds: number[], pfiIds: number[]}}} user
 * @param {{depotColumn?: any, lpgStationColumn?: any, pfiColumn?: any}} columns
 * @returns {import("drizzle-orm").SQL | null}
 */
function scopeCondition(user, { depotColumn, lpgStationColumn, pfiColumn } = {}) {
  if (!user || user.canViewAllLocations) return null;

  const { depotIds = [], lpgStationIds = [], pfiIds = [] } = user.scope || {};
  const clauses = [];
  if (depotColumn && depotIds.length) clauses.push(inArray(depotColumn, depotIds));
  if (lpgStationColumn && lpgStationIds.length) clauses.push(inArray(lpgStationColumn, lpgStationIds));
  if (pfiColumn && pfiIds.length) clauses.push(inArray(pfiColumn, pfiIds));

  // Scoped but assigned nothing on any of the dimensions this resource cares
  // about: fail closed rather than falling through to an unfiltered query.
  if (!clauses.length) return sql`false`;

  return or(...clauses);
}

/**
 * Write-path guard: is this id (a depotId, lpgStationId or pfiId on an
 * incoming payload) inside the user's assigned scope for that dimension?
 * `true` for a full-access user or when the id is falsy (nothing to check —
 * the field's own required-ness is validated elsewhere).
 */
function isWithinScope(user, dimension, id) {
  if (!user || user.canViewAllLocations) return true;
  if (id == null) return true;
  const ids = user.scope?.[dimension] || [];
  return ids.includes(Number(id));
}

module.exports = { scopeCondition, isWithinScope };
