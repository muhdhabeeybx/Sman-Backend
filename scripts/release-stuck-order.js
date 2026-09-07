/**
 * One-off: move an order that was fully paid but never released onto the
 * ticketing desk.
 *
 * Order 11790 (BG11790) committed as payment_status=Paid with status=Pending,
 * because a ₦587k transfer-in landed before its statement-line payment and
 * spent the `isFirstPayment` flag the release used to be guarded on. Both holes
 * are fixed in services/order.service.js and services/orderPayment.service.js;
 * this repairs the row those bugs left behind.
 *
 * Driven through orderStatus.transition() rather than an UPDATE, so the move
 * writes its audit rows and announces itself exactly as it would have on the
 * day. It is therefore NOT silent: the customer is told their payment was
 * confirmed and their order released.
 *
 * Refuses anything that is not Pending-and-Paid, so a re-run is a no-op and a
 * mistyped id does nothing.
 *
 *   node scripts/release-stuck-order.js --order=11790            # dry run
 *   node scripts/release-stuck-order.js --order=11790 --commit
 */
require("dotenv").config();
const { eq } = require("drizzle-orm");
const { db } = require("../config/db");
const { orders } = require("../db/schema");
const orderStatus = require("../services/orderStatus.service");

const arg = (n, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

(async () => {
  const orderId = Number(arg("order"));
  const commit = process.argv.includes("--commit");
  if (!Number.isInteger(orderId) || orderId <= 0) {
    console.error("Missing --order=<id>");
    process.exit(1);
  }

  const [before] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!before) {
    console.error(`Order ${orderId} not found`);
    process.exit(1);
  }

  console.log("── before ────────────────────────────────");
  for (const k of ["id", "status", "paymentStatus", "amountPaid", "totalAmount", "paymentConfirmedAt", "releasedAt"]) {
    console.log(`  ${k.padEnd(20)} ${JSON.stringify(before[k])}`);
  }

  if (before.status !== "Pending" || before.paymentStatus !== "Paid") {
    console.error(
      `\nRefusing: this repairs a Pending order whose money is fully in. ` +
        `${orderId} is ${before.status} / ${before.paymentStatus}.`
    );
    process.exit(1);
  }

  const plan = ["Pending → Paid", "Paid → Released (releaseOnPayment, stamps released_at)"];
  console.log("\n── plan ──────────────────────────────────");
  plan.forEach((p) => console.log(`  ${p}`));
  console.log("  audit rows written; order.paid and order.released announced to the customer");

  if (!commit) {
    console.log("\nDRY RUN — nothing written. Re-run with --commit.");
    process.exit(0);
  }

  const actor = { type: "system", note: "backfill: release skipped by isFirstPayment guard" };
  const meta = { trigger: "backfill", reason: "release skipped when a transfer-in preceded the statement payment" };

  await orderStatus.transition(orderId, "Paid", { actor, action: "order.paid", set: {}, metadata: meta });
  await orderStatus.releaseOnPayment(orderId, { actor, metadata: meta });

  const [after] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  console.log("\n── after ─────────────────────────────────");
  for (const k of ["id", "status", "paymentStatus", "amountPaid", "releasedAt"]) {
    console.log(`  ${k.padEnd(20)} ${JSON.stringify(after[k])}`);
  }

  // announce() is fire-and-forget by design, so give the sends a moment to
  // finish rather than killing them with the process.
  await new Promise((r) => setTimeout(r, 8000));
  console.log("\nDone.");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
