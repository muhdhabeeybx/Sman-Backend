const { eq, and, inArray, sql, count } = require("drizzle-orm");
const { db } = require("../config/db");
const {
  customers,
  customerIdentities,
  customerTrustedDevices,
  customerPasskeys,
  webauthnChallenges,
  customerOtps,
  walletHolds,
  orders,
  lpgOrderRequests,
  dangoteOrderRequests,
  notifications,
  notificationPreferences,
  notificationSettings,
  deviceTokens,
} = require("../db/schema");
const { sessionRepo } = require("../repositories");
const { principalWhere } = require("../utils/principal");
const { generateOrderReference } = require("../utils/helpers");

/**
 * Apple App Store Guideline 5.1.1(v): apps that create accounts must let the
 * user delete the account and associated personal data from inside the app.
 *
 * Pure soft-delete (Inactive + keep PII) fails review. Pure hard-delete of the
 * customers row fails here too — orders, deposits, commissions and licenses
 * reference customers with ON DELETE RESTRICT.
 *
 * So we anonymize the customer tombstone (keep the id for ledger FKs), wipe
 * every auth/identity surface, and refuse when open money or open work would
 * leave ops without a reachable principal.
 */

const OPEN_ORDER_STATUSES = ["Pending", "Paid", "Released", "Loading"];
const OPEN_REQUEST_STATUSES = ["Pending Review", "Approved"];
const REVOKE_REASON = "account_deleted";
const REF_LIST_LIMIT = 5;

const money = (value) => Number(value || 0);

const formatNaira = (value) =>
  `₦${money(value).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** "ORD-A, ORD-B, and 2 more" — keeps toasts readable when many refs pile up. */
function formatRefs(refs, limit = REF_LIST_LIMIT) {
  const clean = refs.filter(Boolean);
  if (clean.length === 0) return "";
  const shown = clean.slice(0, limit);
  const extra = clean.length - shown.length;
  const list = shown.join(", ");
  return extra > 0 ? `${list}, and ${extra} more` : list;
}

/** Single toast/API message from the structured blocker list. */
function formatBlockerMessage(blockers) {
  return blockers.filter(Boolean).join(" ");
}

/**
 * Reasons the account cannot be deleted yet. Empty array means clear.
 * Evaluated against a fresh row so a concurrent top-up cannot sneak past.
 */
async function collectBlockers(customerId, tx = db) {
  const [customer] = await tx
    .select({
      id: customers.id,
      balance: customers.balance,
      status: customers.status,
      companyName: customers.companyName,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    return { customer: null, blockers: ["Account not found"] };
  }

  const blockers = [];

  if (money(customer.balance) > 0) {
    blockers.push(
      `Your wallet still has ${formatNaira(customer.balance)}. Spend it on an order (or ask the desk to clear it) before deleting.`
    );
  }

  const [[{ holds }], openOrderRows, openLpgRows, openDangoteRows] = await Promise.all([
    tx
      .select({ holds: count() })
      .from(walletHolds)
      .where(and(eq(walletHolds.customerId, customerId), eq(walletHolds.status, "active"))),
    tx
      .select({
        id: orders.id,
        companyName: orders.companyName,
        status: orders.status,
      })
      .from(orders)
      .where(and(eq(orders.customerId, customerId), inArray(orders.status, OPEN_ORDER_STATUSES))),
    tx
      .select({
        id: lpgOrderRequests.id,
      })
      .from(lpgOrderRequests)
      .where(
        and(
          eq(lpgOrderRequests.customerId, customerId),
          inArray(lpgOrderRequests.status, OPEN_REQUEST_STATUSES)
        )
      ),
    tx
      .select({
        id: dangoteOrderRequests.id,
        companyName: dangoteOrderRequests.companyName,
      })
      .from(dangoteOrderRequests)
      .where(
        and(
          eq(dangoteOrderRequests.customerId, customerId),
          inArray(dangoteOrderRequests.status, OPEN_REQUEST_STATUSES)
        )
      ),
  ]);

  // Same customer-facing ref the portal overwrites onto orderNumber (HA10831),
  // never the staff ORD-… column — that is what the invoice/SMS/dashboard show.
  const orderRef = (row) =>
    generateOrderReference(row.companyName || customer.companyName || "", row.id);
  const requestRef = (row) =>
    generateOrderReference(row.companyName || customer.companyName || "", row.id);

  const unpaid = openOrderRows.filter((o) => o.status === "Pending");
  const inProgress = openOrderRows.filter((o) => o.status !== "Pending");

  if (unpaid.length === 1) {
    blockers.push(`Cancel unpaid order ${orderRef(unpaid[0])} before deleting.`);
  } else if (unpaid.length > 1) {
    blockers.push(
      `Cancel unpaid orders (${formatRefs(unpaid.map(orderRef))}) before deleting.`
    );
  }

  if (inProgress.length === 1) {
    const o = inProgress[0];
    blockers.push(
      `Order ${orderRef(o)} is still ${o.status.toLowerCase()}. It must complete at the depot before you can delete — paid orders can't be cancelled.`
    );
  } else if (inProgress.length > 1) {
    blockers.push(
      `You still have ${inProgress.length} orders in progress (${formatRefs(
        inProgress.map(orderRef)
      )}). They must complete at the depot before you can delete — paid orders can't be cancelled.`
    );
  }

  // Holds normally ride with Paid/in-progress orders (already explained above).
  // Only call them out alone when something is stranded without an open order.
  if (Number(holds) > 0 && openOrderRows.length === 0) {
    blockers.push(
      "An order still has funds on hold. Contact the desk if this persists after all orders are finished."
    );
  }

  if (openLpgRows.length === 1) {
    blockers.push(
      `You have an open LPG request (${requestRef(openLpgRows[0])}). Cancel it before deleting.`
    );
  } else if (openLpgRows.length > 1) {
    blockers.push(
      `You have open LPG requests (${formatRefs(openLpgRows.map(requestRef))}). Cancel them before deleting.`
    );
  }

  if (openDangoteRows.length === 1) {
    blockers.push(
      `You have an open Dangote request (${requestRef(openDangoteRows[0])}). Cancel it before deleting.`
    );
  } else if (openDangoteRows.length > 1) {
    blockers.push(
      `You have open Dangote requests (${formatRefs(
        openDangoteRows.map(requestRef)
      )}). Cancel them before deleting.`
    );
  }

  return { customer, blockers };
}

/** Scrub every personal field; free the unique phone for a future registration. */
function anonymizedFields(customerId) {
  return {
    name: "Deleted User",
    email: "",
    phone: `deleted_${customerId}`,
    companyName: "",
    address: "",
    commissionBankName: "",
    commissionAccountName: "",
    commissionAccountNumber: "",
    paystackCustomerId: "",
    virtualAccountNumber: "",
    virtualAccountBank: "",
    virtualAccountName: "",
    dvaSubaccountCode: "",
    phoneVerifiedAt: null,
    status: "Inactive",
    updatedAt: new Date(),
  };
}

async function wipeAuthSurfaces(customerId, tx) {
  const principal = { type: "customer", id: customerId };

  await sessionRepo.revokeAllForPrincipal("customer", customerId, REVOKE_REASON, tx);

  await tx
    .update(deviceTokens)
    .set({
      disabledAt: new Date(),
      disabledReason: REVOKE_REASON,
      updatedAt: new Date(),
    })
    .where(and(principalWhere(deviceTokens, principal), sql`${deviceTokens.disabledAt} IS NULL`));

  await Promise.all([
    tx.delete(customerIdentities).where(eq(customerIdentities.customerId, customerId)),
    tx.delete(customerTrustedDevices).where(eq(customerTrustedDevices.customerId, customerId)),
    tx.delete(customerPasskeys).where(eq(customerPasskeys.customerId, customerId)),
    tx.delete(webauthnChallenges).where(eq(webauthnChallenges.customerId, customerId)),
    tx.delete(customerOtps).where(eq(customerOtps.customerId, customerId)),
    tx.delete(notificationPreferences).where(principalWhere(notificationPreferences, principal)),
    tx.delete(notificationSettings).where(principalWhere(notificationSettings, principal)),
    tx.delete(notifications).where(principalWhere(notifications, principal)),
  ]);
}

/**
 * Delete the customer's account for App Store compliance.
 *
 * @returns {{ ok: true, deletedAt: Date } | { ok: false, status: number, message: string, blockers?: string[] }}
 */
async function deleteCustomerAccount(customerId) {
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, message: "Invalid account" };
  }

  return db.transaction(async (tx) => {
    const { customer, blockers } = await collectBlockers(id, tx);
    if (!customer) {
      return { ok: false, status: 404, message: "Account not found" };
    }
    if (blockers.length > 0) {
      return {
        ok: false,
        status: 409,
        message: formatBlockerMessage(blockers),
        blockers,
      };
    }

    await wipeAuthSurfaces(id, tx);

    const [updated] = await tx
      .update(customers)
      .set(anonymizedFields(id))
      .where(eq(customers.id, id))
      .returning({ id: customers.id, updatedAt: customers.updatedAt });

    if (!updated) {
      return { ok: false, status: 404, message: "Account not found" };
    }

    return { ok: true, deletedAt: updated.updatedAt };
  });
}

module.exports = {
  deleteCustomerAccount,
  collectBlockers,
  formatBlockerMessage,
  formatRefs,
  anonymizedFields,
  OPEN_ORDER_STATUSES,
  OPEN_REQUEST_STATUSES,
  REVOKE_REASON,
};
