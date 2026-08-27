/**
 * Which roles may reach which API resource.
 *
 * Role-based gating is off dashboard-wide: any signed-in staff member may
 * read and write every listed resource, regardless of role. Location/PFI
 * scope (see lib/scopeFilter.js) still narrows *which rows* a non-super_admin
 * sees or can act on — that check is independent of this file and stays
 * fully in force. This file only ever decided whether the endpoint was
 * reachable at all, and now it says yes to everyone who's logged in.
 *
 * An unlisted mount is still closed by default (see checkApiAccess) — that's
 * not a role restriction, it's a new-route safety net so an endpoint has to
 * be added here deliberately rather than opening by omission.
 *
 * super_admin is implicit everywhere and never listed.
 */

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * mount path -> { read: [...roles] | null, write: [...roles] | null }
 *
 * A missing `write` means the read list governs both. `null` means any
 * signed-in staff member — every entry below is `null`.
 */
const API_PERMISSIONS = {
  "/api/dashboard": { read: null },
  "/api/notifications": { read: null },
  "/api/uploads": { read: null },
  "/api/orders": { read: null },
  "/api/tickets": { read: null },
  "/api/customers": { read: null },
  "/api/customer-licenses": { read: null },
  "/api/depots": { read: null },
  "/api/products": { read: null },
  "/api/trucks": { read: null },
  "/api/fleet": { read: null },
  "/api/drivers": { read: null },
  "/api/expenses": { read: null },
  "/api/vendors": { read: null },
  "/api/finance-report": { read: null },
  "/api/pfis": { read: null },
  "/api/deposits": { read: null },
  "/api/expected-payments": { read: null },
  "/api/bank-accounts": { read: null },
  "/api/bank-statements": { read: null },
  "/api/settlements": { read: null },
  "/api/commissions": { read: null },
  "/api/lpg-stations": { read: null },
  "/api/filing-stations": { read: null },
  "/api/delivery-customers": { read: null },
  "/api/delivery-inventory": { read: null },
  "/api/delivery-sales": { read: null },
  "/api/offline-sales": { read: null },
  "/api/incidents": { read: null },
  "/api/daily-reports": { read: null },
  "/api/reports": { read: null },
  "/api/order-expiry": { read: null },

  // These three sit on routers mounted at bare /api, so they are matched on
  // the full request path rather than the mount — see resolveRule.
  "/api/dangote-order-requests": { read: null },
  "/api/dangote-products": { read: null },
  "/api/lpg-order-requests": { read: null },

  "/api/admin": { read: null },
  "/api/message-templates": { read: null },
};

/**
 * Longest-prefix match on the full path.
 *
 * Most routers mount at their own path, so `req.baseUrl` identifies them. A
 * few (Dangote, LPG) mount at bare /api and carry their resource in the
 * sub-path, which would otherwise resolve to an /api rule that does not
 * exist and lock everyone out. Matching the full path covers both, and
 * longest-first means /api/dangote-products wins over any shorter prefix.
 */
const SORTED_PATHS = Object.keys(API_PERMISSIONS).sort((a, b) => b.length - a.length);

function resolveRule(fullPath) {
  for (const key of SORTED_PATHS) {
    if (fullPath === key || fullPath.startsWith(key + "/")) return API_PERMISSIONS[key];
  }
  return null;
}

/** Roles the caller holds, from both the singular field and the array. */
function rolesOf(user) {
  const list = Array.isArray(user?.roles) ? user.roles : [];
  return new Set([...list, user?.role].filter(Boolean));
}

/**
 * @returns {{allowed: boolean, reason?: string}}
 */
function checkApiAccess(fullPath, method, user) {
  const rule = resolveRule(fullPath);
  // An unlisted mount is closed to everyone but super_admin — a new route
  // should have to opt in rather than default to open.
  const mine = rolesOf(user);
  if (mine.has("super_admin")) return { allowed: true };
  if (!rule) return { allowed: false, reason: "This area is restricted" };

  const readList = rule.read;
  // null means "any signed-in staff".
  if (readList === null && READ_ONLY_METHODS.has(method)) return { allowed: true };

  const writeList = rule.write === undefined ? readList : rule.write;
  const required = READ_ONLY_METHODS.has(method) ? readList : writeList;

  if (required === null) return { allowed: true };
  if (Array.isArray(required) && required.some((r) => mine.has(r))) return { allowed: true };

  return {
    allowed: false,
    reason: READ_ONLY_METHODS.has(method)
      ? "Your role does not have access to this area"
      : "Your role cannot make changes here",
  };
}

module.exports = { API_PERMISSIONS, checkApiAccess, resolveRule, rolesOf, READ_ONLY_METHODS };
