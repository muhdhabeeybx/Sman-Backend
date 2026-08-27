// Scoped config for the `sman` schema ONLY — the 12 tables with no live
// counterpart in soroman_db (docs/LIVE_DB_CUTOVER.md §4). The schema glob
// deliberately lists only these definition files, not the 81 introspected
// Django tables, so drizzle-kit only ever manages what Sman-Backend owns.
// FK references into public.* (e.g. -> consumer_customer.id) resolve via
// plain `require()` and are emitted as bare REFERENCES clauses — the
// referenced tables are never "managed" or recreated by this config.
const { defineConfig } = require("drizzle-kit");

if (!process.env.LIVE_DATABASE_URL) {
  throw new Error("LIVE_DATABASE_URL is not set — see .env.example");
}

module.exports = defineConfig({
  schema: [
    "./db/schema/sman/enums.js",
    "./db/schema/sman/customerIdentity.js",
    "./db/schema/sman/customerOtp.js",
    "./db/schema/sman/driver.js",
    "./db/schema/sman/driverTruckHistory.js",
    "./db/schema/sman/customerCredit.js",
    "./db/schema/sman/truckExtras.js",
    "./db/schema/sman/dailyReportExtras.js",
    "./db/schema/sman/session.js",
    "./db/schema/sman/deliveryNote.js",
    "./db/schema/sman/auditLog.js",
    "./db/schema/sman/auditEvent.js",
    "./db/schema/sman/depotStaff.js",
    "./db/schema/sman/depotExtras.js",
    "./db/schema/sman/lpgStationStaff.js",
    "./db/schema/sman/pfiStaff.js",
    "./db/schema/sman/depotPriceHistory.js",
    "./db/schema/sman/depotProductCapacities.js",
    "./db/schema/sman/depotProductCommission.js",
    "./db/schema/sman/walletHold.js",
    "./db/schema/sman/webhookEvent.js",
    "./db/schema/sman/expectedPayment.js",
    "./db/schema/sman/orderDepositAllocation.js",
    "./db/schema/sman/orderIdempotency.js",
    "./db/schema/sman/commission.js",
    "./db/schema/sman/vendor.js",
    "./db/schema/sman/pfiExpenseExtras.js",
    "./db/schema/sman/pfiExpenseComment.js",
    "./db/schema/sman/expenseCategoryExtras.js",
    "./db/schema/sman/bankAccountExtras.js",
    "./db/schema/sman/lpgStationCylinder.js",
    "./db/schema/sman/lpgPriceHistory.js",
    "./db/schema/sman/lpgStationExtras.js",
    "./db/schema/sman/customerLicense.js",
    "./db/schema/sman/dangoteProduct.js",
    "./db/schema/sman/dangoteOrderRequest.js",
    "./db/schema/sman/lpgOrderRequest.js",
    "./db/schema/sman/staffPageOverride.js",
    "./db/schema/sman/staffPasswordReset.js",
    "./db/schema/sman/deviceToken.js",
    "./db/schema/sman/notification.js",
    "./db/schema/sman/notificationDelivery.js",
    "./db/schema/sman/notificationPreference.js",
    "./db/schema/sman/messageTemplate.js",
    "./db/schema/sman/waSession.js",
    "./db/schema/sman/waMessage.js",
    "./db/schema/sman/waTemplate.js",
  ],
  out: "./db/migrations.sman",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.LIVE_DATABASE_URL,
  },
});
