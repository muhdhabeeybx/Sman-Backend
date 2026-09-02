#!/usr/bin/env node
/**
 * Correct order AS11578 (#11578) to the 330,000 litres it actually loaded.
 *
 * ── What is wrong ─────────────────────────────────────────────────────────
 *
 * The order was placed for 700,000 litres at ₦1,270.00/L and billed
 * ₦889,000,000. What it is actually loading is 330,000 litres — the seven
 * trucks on it sum to exactly that:
 *
 *     T 25928 LA   60,000      GME 736 XD   45,000
 *     YLA 209 XM   50,000      JMT 644 XB   45,000
 *     T 28152 LA   45,000      FKJ 243 XB   40,000
 *     JMT 34 YA    45,000      ─────────────────────
 *                              total       330,000
 *
 * The ticket-generation ledger agrees: pfi_movements carries one RELEASE row
 * for this order at 330,000. So the 700,000 exists in exactly two places —
 * the order's own quantity, and the PFI reservation behind it — and every
 * money figure derived from it is wrong by 370,000 litres.
 *
 * Three consequences, all of which this fixes:
 *
 *   Sales value   SUM(orders.total_amount) is what the finance report calls
 *                 sales, so the report overstates this order by ₦469,900,000.
 *
 *   Payment       ₦442,602,000 has been received. Against ₦889,000,000 that
 *                 reads "Part Paid" with a ₦446,398,000 shortfall. Against
 *                 the real ₦419,100,000 it is paid in full.
 *
 *   Completion    gate-out only completes an order once the ticketed quantity
 *                 reaches order.quantity (order.controller gateOut). At
 *                 700,000 that can never happen — the order would sit in
 *                 Loading forever with three trucks still to roll.
 *
 * ── Why this bypasses updateOrder ─────────────────────────────────────────
 *
 * order.service.updateOrder refuses a quantity change outside Pending/Paid,
 * and this order is Loading. That guard is there so a quantity cannot drift
 * away from tickets already cut against real gate actions. Here the change
 * moves the order *onto* its tickets rather than away from them — 330,000 is
 * the ticketed figure — so the guard's reason does not apply. Everything
 * updateOrder would have done is done below, in the same order and by the
 * same rules.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * Two things are left for the desk, because both are judgement calls about
 * where real money goes, not arithmetic:
 *
 *   Surplus       once the order is worth ₦419,100,000, the ₦442,602,000 on
 *                 it is ₦23,502,000 over. It stays on the order, which is
 *                 where orderPayment.transferSurplus expects to find it.
 *                 Nothing here moves or refunds it.
 *
 *   Wallet hold   hold #182 (₦442,602,000, active) is a legacy hold from
 *                 before order-first payments. It is left at the amount
 *                 actually received. It is coupled to the surplus decision —
 *                 convertHold books a debit for the full hold amount on
 *                 completion — so the two should be settled together.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/correct-order-11578-quantity.js           dry run
 *   node scripts/correct-order-11578-quantity.js --apply   commits
 *
 * --apply writes scripts/rollback-order-11578-<stamp>.json and refuses to
 * commit unless every post-write invariant below holds.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");

const ORDER_ID = 11578;
const NEW_QUANTITY = 330000;
/** What we expect to find. Anything else and the order has moved under us. */
const EXPECTED = { quantity: 700000, price: "1270.00", status: "Loading", pfiId: 45 };

const K = (v) => Math.round(Number(v || 0) * 100);
const naira = (k) =>
  `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dec = (k) => (k / 100).toFixed(2);
const litres = (n) => Number(n).toLocaleString("en-NG");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");

  try {
    // ── Read and assert the starting state ────────────────────────────────
    const [order] = (
      await client.query(
        `SELECT id, order_number, customer_id, depot_id, product_id, pfi_id, quantity,
                price::numeric AS price, total_amount::numeric AS total,
                amount_paid::numeric AS paid, payment_status::text AS payment_status,
                status::text AS status
           FROM orders WHERE id = $1 FOR UPDATE`,
        [ORDER_ID]
      )
    ).rows;
    if (!order) throw new Error(`order ${ORDER_ID} not found`);

    if (order.quantity !== EXPECTED.quantity) {
      throw new Error(
        `quantity is ${order.quantity}, expected ${EXPECTED.quantity} — already corrected, or changed since this script was written`
      );
    }
    if (Number(order.price).toFixed(2) !== EXPECTED.price) {
      throw new Error(`price is ${order.price}, expected ${EXPECTED.price} — the sales value below would be wrong`);
    }
    if (order.status !== EXPECTED.status) {
      throw new Error(`status is ${order.status}, expected ${EXPECTED.status}`);
    }
    if (Number(order.pfi_id) !== EXPECTED.pfiId) {
      throw new Error(`pfi is ${order.pfi_id}, expected ${EXPECTED.pfiId}`);
    }

    // The trucks are the whole justification for 330,000 — verify, never assume.
    const truckSum = Number(
      (await client.query(`SELECT COALESCE(SUM(quantity), 0)::numeric AS q FROM order_trucks WHERE order_id = $1`, [ORDER_ID]))
        .rows[0].q
    );
    if (truckSum !== NEW_QUANTITY) {
      throw new Error(`trucks sum to ${litres(truckSum)} L, not ${litres(NEW_QUANTITY)} — refusing to guess`);
    }

    // Kobo throughout, so the sales value is exact rather than a float product.
    const priceK = K(order.price);
    const newTotalK = priceK * NEW_QUANTITY;

    // ── Money, re-derived exactly as orderPayment.recomputeOrder does ─────
    const receivedK = K(
      (await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS a FROM order_payments WHERE order_id = $1`, [ORDER_ID]))
        .rows[0].a
    );
    const fullyPaid = receivedK >= newTotalK;
    const newPaymentStatus = receivedK <= 0 ? "Unpaid" : fullyPaid ? "Paid" : "Part Paid";
    const surplusK = Math.max(0, receivedK - newTotalK);

    // ── Commission, re-derived exactly as commission.commissionQuantity ───
    // Fully paid, and trucks exist, so the basis is the truck sum.
    const [rateRow] = (
      await client.query(
        `SELECT commission_rate::numeric AS rate FROM depot_product_commissions WHERE depot_id = $1 AND product_id = $2 LIMIT 1`,
        [order.depot_id, order.product_id]
      )
    ).rows;
    const [commission] = (
      await client.query(
        `SELECT id, quantity, commission_rate::numeric AS rate, commission_amount::numeric AS amount, status
           FROM commissions WHERE order_id = $1 FOR UPDATE`,
        [ORDER_ID]
      )
    ).rows;

    // createForOrder falls back to rate 0 when no rate is configured. Doing
    // that here would silently zero a commission that already carries a real
    // rate, so an existing rate wins when the table has nothing to say.
    const newRate = rateRow ? Number(rateRow.rate) : commission ? Number(commission.rate) : 0;
    const newCommissionQty = fullyPaid ? Math.floor(truckSum) : Math.floor(receivedK / priceK);
    const newCommissionAmountK = Math.round(newCommissionQty * newRate * 100);

    // ── PFI stock: releaseStock(old) then reserveStock(new) ───────────────
    const [pfi] = (
      await client.query(
        `SELECT id, pfi_number, status, starting_qty_litres, sold_qty_litres
           FROM pfis WHERE id = $1 FOR UPDATE`,
        [order.pfi_id]
      )
    ).rows;
    const allocations = (
      await client.query(`SELECT id, pfi_id, quantity FROM order_pfi_allocations WHERE order_id = $1`, [ORDER_ID])
    ).rows;
    if (allocations.length > 1) {
      throw new Error("more than one PFI allocation — this script only handles the single-PFI case");
    }

    const reservedNow = allocations.length
      ? allocations.reduce((s, a) => s + Number(a.quantity), 0)
      : Number(order.quantity);
    const soldAfterRelease = Math.max(Number(pfi.sold_qty_litres) - reservedNow, 0);
    const soldAfterReserve = soldAfterRelease + NEW_QUANTITY;

    if (pfi.status !== "active") throw new Error(`PFI ${pfi.pfi_number} is ${pfi.status}, not active — reserveStock would refuse`);
    if (Number(pfi.starting_qty_litres) - soldAfterRelease < NEW_QUANTITY) {
      throw new Error(`PFI ${pfi.pfi_number} cannot cover ${litres(NEW_QUANTITY)} L`);
    }

    // ── Report ────────────────────────────────────────────────────────────
    console.log(`\n${order.order_number}  (AS${ORDER_ID})`);
    console.log(`  quantity        ${litres(order.quantity)} L  →  ${litres(NEW_QUANTITY)} L`);
    console.log(`  sales value     ${naira(K(order.total))}  →  ${naira(newTotalK)}   (@ ${naira(priceK)}/L)`);
    console.log(`  amount paid     ${naira(K(order.paid))}  (unchanged — ${naira(receivedK)} across ${
      (await client.query(`SELECT COUNT(*)::int n FROM order_payments WHERE order_id = $1`, [ORDER_ID])).rows[0].n
    } payments)`);
    console.log(`  payment status  ${order.payment_status}  →  ${newPaymentStatus}`);
    console.log(
      `  balance         ${naira(Math.max(0, K(order.total) - receivedK))} short  →  ${
        surplusK ? `${naira(surplusK)} SURPLUS` : "settled"
      }`
    );
    if (commission) {
      console.log(
        `  commission      ${litres(commission.quantity)} L @ ${naira(K(commission.rate))} = ${naira(K(commission.amount))}  →  ${litres(
          newCommissionQty
        )} L @ ${naira(K(newRate))} = ${naira(newCommissionAmountK)}`
      );
    }
    console.log(`  pfi allocation  ${allocations.map((a) => `#${a.id} ${litres(a.quantity)} L`).join(", ")}  →  ${litres(NEW_QUANTITY)} L`);
    console.log(
      `  ${pfi.pfi_number}`
    );
    console.log(
      `                  sold ${litres(pfi.sold_qty_litres)} L  →  ${litres(soldAfterReserve)} L   (release ${litres(
        reservedNow
      )}, reserve ${litres(NEW_QUANTITY)})`
    );
    console.log(`\n  trucks ticketed ${litres(truckSum)} L across ${
      (await client.query(`SELECT COUNT(*)::int n FROM order_trucks WHERE order_id = $1`, [ORDER_ID])).rows[0].n
    } — order can complete once the last one gates out`);
    if (surplusK) {
      console.log(`\n  ⚠ leaves ${naira(surplusK)} surplus on the order, and wallet hold #182 untouched — both left for the desk`);
    }

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
      await client.end();
      return;
    }

    // ── Rollback capture ──────────────────────────────────────────────────
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rollbackPath = path.join(__dirname, `rollback-order-11578-${stamp}.json`);
    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          order: {
            id: order.id,
            quantity: order.quantity,
            total_amount: Number(order.total).toFixed(2),
            amount_paid: Number(order.paid).toFixed(2),
            payment_status: order.payment_status,
          },
          orderPfiAllocations: allocations,
          pfi: { id: pfi.id, sold_qty_litres: Number(pfi.sold_qty_litres) },
          commission: commission
            ? {
                id: commission.id,
                quantity: commission.quantity,
                commission_rate: Number(commission.rate).toFixed(2),
                commission_amount: Number(commission.amount).toFixed(2),
              }
            : null,
        },
        null,
        2
      )
    );
    console.log(`\nRollback written to ${rollbackPath}`);

    // ── Write ─────────────────────────────────────────────────────────────
    await client.query(
      `UPDATE orders
          SET quantity = $1, total_amount = $2, amount_paid = $3, payment_status = $4, updated_at = NOW()
        WHERE id = $5`,
      [NEW_QUANTITY, dec(newTotalK), dec(receivedK), newPaymentStatus, ORDER_ID]
    );

    if (allocations.length) {
      // One PFI on this order, so the whole corrected quantity sits on its row.
      await client.query(`UPDATE order_pfi_allocations SET quantity = $1 WHERE id = $2`, [
        NEW_QUANTITY,
        allocations[0].id,
      ]);
    }

    await client.query(`UPDATE pfis SET sold_qty_litres = $1, updated_at = NOW() WHERE id = $2`, [
      soldAfterReserve,
      pfi.id,
    ]);

    if (commission) {
      if (commission.status === "paid") {
        throw new Error("commission already paid — a snapshot of money that has left is never rewritten");
      }
      await client.query(
        `UPDATE commissions SET quantity = $1, commission_rate = $2, commission_amount = $3, updated_at = NOW() WHERE id = $4`,
        [newCommissionQty, newRate.toFixed(2), dec(newCommissionAmountK), commission.id]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor_type, metadata)
       VALUES ('order', $1, 'order.updated', 'system', $2::jsonb)`,
      [
        ORDER_ID,
        JSON.stringify({
          changes: {
            quantity: [order.quantity, NEW_QUANTITY],
            totalAmount: [Number(order.total).toFixed(2), dec(newTotalK)],
            paymentStatus: [order.payment_status, newPaymentStatus],
            ...(commission
              ? { commissionQuantity: [commission.quantity, newCommissionQty] }
              : {}),
            pfiSoldQtyLitres: [Number(pfi.sold_qty_litres), soldAfterReserve],
          },
          reason:
            "Corrected to the 330,000 L actually ticketed and loaded (7 trucks; pfi_movements RELEASE agrees). Placed for 700,000 L in error.",
          via: "scripts/correct-order-11578-quantity.js",
        }),
      ]
    );

    // ── Post-write invariants ─────────────────────────────────────────────
    const [after] = (
      await client.query(
        `SELECT o.quantity, o.total_amount::numeric AS total, o.amount_paid::numeric AS paid,
                o.payment_status::text AS payment_status,
                (SELECT COALESCE(SUM(quantity), 0) FROM order_pfi_allocations WHERE order_id = o.id)::int AS alloc,
                (SELECT COALESCE(SUM(quantity), 0) FROM order_trucks WHERE order_id = o.id)::numeric AS trucks,
                (SELECT COALESCE(SUM(qty_litres), 0) FROM pfi_movements WHERE order_id = o.id)::int AS released,
                (SELECT sold_qty_litres FROM pfis WHERE id = o.pfi_id)::int AS pfi_sold,
                (SELECT starting_qty_litres FROM pfis WHERE id = o.pfi_id)::int AS pfi_start,
                (SELECT quantity FROM commissions WHERE order_id = o.id)::int AS comm_qty,
                (SELECT commission_amount FROM commissions WHERE order_id = o.id)::numeric AS comm_amt
           FROM orders o WHERE o.id = $1`,
        [ORDER_ID]
      )
    ).rows;

    const problems = [];
    if (after.quantity !== NEW_QUANTITY) problems.push(`quantity is ${after.quantity}`);
    if (K(after.total) !== newTotalK) problems.push(`total_amount is ${after.total}`);
    if (K(after.paid) !== receivedK) problems.push(`amount_paid drifted to ${after.paid}`);
    if (after.payment_status !== newPaymentStatus) problems.push(`payment_status is ${after.payment_status}`);
    if (after.alloc !== NEW_QUANTITY) problems.push(`pfi allocation is ${after.alloc}`);
    // The point of the exercise: the order is now completable.
    if (Number(after.trucks) < after.quantity) problems.push(`trucks (${after.trucks}) still short of quantity`);
    if (after.released !== NEW_QUANTITY) problems.push(`pfi_movements RELEASE is ${after.released}`);
    if (after.pfi_sold !== soldAfterReserve) problems.push(`pfi sold_qty_litres is ${after.pfi_sold}`);
    if (after.pfi_sold < 0 || after.pfi_sold > after.pfi_start) problems.push(`pfi sold_qty_litres out of range`);
    if (commission && after.comm_qty !== newCommissionQty) problems.push(`commission quantity is ${after.comm_qty}`);
    if (commission && K(after.comm_amt) !== newCommissionAmountK) problems.push(`commission amount is ${after.comm_amt}`);

    if (problems.length) {
      console.log(`\nPOST-WRITE CHECKS FAILED:\n  ${problems.join("\n  ")}`);
      throw new Error("post-write invariant broken");
    }
    console.log("\npost-write checks: all clear");

    await client.query("COMMIT");
    console.log("COMMITTED");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK:", err.message);
    process.exitCode = 1;
  }

  await client.end();
}

main();
