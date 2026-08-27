#!/usr/bin/env node
/**
 * Put expired orders back to Pending, stock and all.
 *
 *   node scripts/unexpire-orders.js 11477 11484 11487 11490
 *   node scripts/unexpire-orders.js 11477 11484 11487 11490 --apply
 *
 * ── Why this is not just a status flip ────────────────────────────────────
 *
 * Expiring an order does three things beyond the status (see
 * order.service.js releaseOrderResources): it hands the reserved litres back
 * to the PFI, deletes the order_pfi_allocations rows that recorded the
 * reservation, and releases any wallet hold.
 *
 * So an order flipped straight back to Pending would be Pending with no
 * reservation behind it — the PFI would show that stock as available while an
 * order was waiting to load it, and the first person to place another order
 * would be sold the same litres. Re-reserving is the whole job; the status is
 * the easy part.
 *
 * Refuses rather than half-does it: if the PFI can no longer cover the order,
 * or is no longer active, that order is skipped and reported. Re-reserving
 * uses the same guarded UPDATE placeOrder uses, so it cannot oversell even if
 * this runs against a moving target.
 *
 * Wallet holds are deliberately NOT restored. An expired order's hold was
 * released and its money returned; taking it again here would be paying for
 * an order nobody has confirmed. The order goes back to Pending unpaid, and
 * payment is confirmed the normal way.
 */
require("dotenv").config();
const { db } = require("./../config/db");
const { orders, pfis, orderPfiAllocations } = require("../db/schema");
const { eq, and, sql } = require("drizzle-orm");

const APPLY = process.argv.includes("--apply");
const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);

const litres = (v) => `${Number(v).toLocaleString()} L`;

async function main() {
  if (!ids.length) {
    console.error("Give at least one order id:\n  node scripts/unexpire-orders.js 11477 11484 [--apply]");
    process.exit(1);
  }

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      quantity: orders.quantity,
      pfiId: orders.pfiId,
      pfiNumber: pfis.pfiNumber,
      pfiStatus: pfis.status,
      available: sql`${pfis.startingQtyLitres} - ${pfis.soldQtyLitres}`,
    })
    .from(orders)
    .leftJoin(pfis, eq(orders.pfiId, pfis.id))
    .where(sql`${orders.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);

  const found = new Set(rows.map((r) => r.id));
  for (const id of ids) if (!found.has(id)) console.log(`  order ${id}: not found — skipped`);

  const plan = [];
  for (const o of rows) {
    if (o.status !== "Expired") {
      console.log(`  ${o.orderNumber}: is ${o.status}, not Expired — skipped`);
      continue;
    }
    if (!o.pfiId) {
      // No PFI to reserve against; the status flip alone is the whole job.
      plan.push({ ...o, reserve: false });
      continue;
    }
    if (o.pfiStatus !== "active") {
      console.log(`  ${o.orderNumber}: ${o.pfiNumber} is ${o.pfiStatus} — skipped, it cannot take a reservation`);
      continue;
    }
    if (Number(o.available) < Number(o.quantity)) {
      console.log(
        `  ${o.orderNumber}: ${o.pfiNumber} has ${litres(o.available)} left, order needs ${litres(o.quantity)} — skipped`
      );
      continue;
    }
    plan.push({ ...o, reserve: true });
  }

  console.log(`\nOrders to restore: ${plan.length}`);
  for (const o of plan) {
    console.log(
      `  ${o.orderNumber} (#${o.id}) · ${litres(o.quantity)} · ${o.paymentStatus}` +
        (o.reserve ? ` · re-reserving from ${o.pfiNumber}` : " · no PFI to reserve")
    );
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Add --apply to commit.");
    process.exit(0);
  }

  const done = [];
  await db.transaction(async (tx) => {
    for (const o of plan) {
      if (o.reserve) {
        // The same guarded UPDATE placeOrder uses: it matches only while the
        // PFI is active and still has the litres, so a concurrent order
        // cannot be oversold from under this.
        const [reserved] = await tx
          .update(pfis)
          .set({ soldQtyLitres: sql`${pfis.soldQtyLitres} + ${o.quantity}`, updatedAt: new Date() })
          .where(
            and(
              eq(pfis.id, o.pfiId),
              eq(pfis.status, "active"),
              sql`(${pfis.startingQtyLitres} - ${pfis.soldQtyLitres}) >= ${o.quantity}`
            )
          )
          .returning();
        if (!reserved) throw new Error(`${o.orderNumber}: ${o.pfiNumber} could not take the reservation`);

        await tx.insert(orderPfiAllocations).values({
          orderId: o.id,
          pfiId: o.pfiId,
          quantity: o.quantity,
        });
      }

      await tx
        .update(orders)
        .set({ status: "Pending", expiredAt: null, updatedAt: new Date() })
        .where(and(eq(orders.id, o.id), eq(orders.status, "Expired")));

      done.push(o.orderNumber);
    }
  });

  console.log(`\nRestored to Pending: ${done.join(", ")}`);
  console.log("COMMITTED");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED (nothing committed):", err.message);
  process.exit(1);
});
