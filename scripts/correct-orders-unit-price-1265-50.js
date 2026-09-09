#!/usr/bin/env node
/**
 * Re-rate four 2026-09-08 orders from ₦1,266.00/L to ₦1,265.50/L.
 *
 * ── What is wrong ─────────────────────────────────────────────────────────
 *
 * All four were placed at ₦1,266.00. The agreed rate is ₦1,265.50, so every
 * money figure derived from the unit price is 50 kobo per litre too high:
 *
 *     GP11843  Galaxy Petroleum       60,000 L   Pending   Unpaid
 *     FO11844  Fortis Oil and Gas    120,000 L   Pending   Unpaid
 *     SI11853  S I B Global          60,000 L    Pending   Unpaid
 *     MJ11872  Muhammad Jami'u        80,000 L   Released  Part Paid
 *
 * The price is the only wrong figure. Quantity is right on all four, so the
 * PFI reservation behind them (PFI/43/26/DANGOTE/PMS/3ML/AUG, 80,000 +
 * 60,000 + 60,000 + 120,000 L on order_pfi_allocations) is right too and is
 * deliberately left alone — this script moves no stock.
 *
 * What it does move, per order:
 *
 *   Sales value   total_amount = price x quantity. SUM(orders.total_amount)
 *                 is what the finance report calls sales, so this is the
 *                 figure the correction exists for.
 *
 *   Payment       amount_paid and payment_status are a cache of the
 *                 order_payments rows measured against total_amount, so a
 *                 changed total can change whether an order reads Paid. They
 *                 are re-derived here exactly as recomputeOrder does, and the
 *                 payment rows themselves are never touched — no money moved,
 *                 only what it is being measured against.
 *
 *   Commission    only MJ11872 has a commission row. Its basis for a
 *                 part-paid order is the quantity actually paid for,
 *                 floor(amount_paid / price) — a price change moves it. See
 *                 commission.service.commissionQuantity.
 *
 * ── Why this bypasses updateOrder ─────────────────────────────────────────
 *
 * order.service.updateOrder would handle the price edit correctly on all four
 * — price stays editable right up to Completed, so MJ11872 being Released is
 * no obstacle, and it derives total_amount and calls recomputeOrder itself.
 *
 * It is bypassed for two reasons. It re-snapshots the commission on a
 * quantity change but not on a price change, which would leave MJ11872's
 * commission on a basis derived from the old rate; and it takes one
 * transaction per order, where a single re-rating that half-applies is worse
 * than one that does not apply at all. Everything updateOrder would have
 * done is done below, by the same rules, for all four orders at once.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * The depot's configured product price is not touched — this corrects four
 * orders, not the price list, and nothing here should change what the next
 * order is placed at.
 *
 * MJ11872 stays Part Paid: ₦100,240,000 received against a corrected
 * ₦101,240,000 is ₦1,000,000 short, where it was ₦1,040,000 short before.
 * The correction shrinks the shortfall, it does not settle it.
 *
 * Submitted daily_reports are left as filed. They are a record of what was
 * reported on the day, not a live view of these orders.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/correct-orders-unit-price-1265-50.js           dry run
 *   node scripts/correct-orders-unit-price-1265-50.js --apply   commits
 *
 * --apply writes scripts/rollback-unit-price-<stamp>.json and refuses to
 * commit unless every post-write invariant below holds, for every order.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");

const ORDER_IDS = [11843, 11844, 11853, 11872];
const EXPECTED_PRICE = "1266.00";
const NEW_PRICE = "1265.50";

/** updateOrder's EDIT_LOCKED_STATUSES — an order past these is never re-rated. */
const EDIT_LOCKED = new Set(["Completed", "Cancelled", "Expired"]);

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
    const newPriceK = K(NEW_PRICE);
    const plans = [];

    for (const orderId of ORDER_IDS) {
      // ── Read and assert the starting state ──────────────────────────────
      const [order] = (
        await client.query(
          `SELECT id, order_number, company_name, customer_id, depot_id, product_id, pfi_id,
                  quantity, price::numeric AS price, total_amount::numeric AS total,
                  amount_paid::numeric AS paid, payment_status::text AS payment_status,
                  status::text AS status, payment_confirmed_at
             FROM orders WHERE id = $1 FOR UPDATE`,
          [orderId]
        )
      ).rows;
      if (!order) throw new Error(`order ${orderId} not found`);

      if (Number(order.price).toFixed(2) !== EXPECTED_PRICE) {
        throw new Error(
          `order ${orderId} price is ${order.price}, expected ${EXPECTED_PRICE} — already corrected, or changed since this script was written`
        );
      }
      if (EDIT_LOCKED.has(order.status)) {
        throw new Error(`order ${orderId} is ${order.status} — a ${order.status.toLowerCase()} order is not re-rated`);
      }
      // The sales value is price x quantity, so a total that does not already
      // agree with the old price is a second problem this script cannot see.
      if (K(order.total) !== K(order.price) * order.quantity) {
        throw new Error(
          `order ${orderId} total ${order.total} is not ${order.price} x ${order.quantity} — refusing to overwrite a total that was set deliberately`
        );
      }

      const newTotalK = newPriceK * order.quantity;

      // ── Money, re-derived exactly as orderPayment.recomputeOrder does ────
      const payments = (
        await client.query(`SELECT amount::numeric AS amount FROM order_payments WHERE order_id = $1`, [orderId])
      ).rows;
      const receivedK = payments.reduce((sum, p) => sum + K(p.amount), 0);
      const fullyPaid = receivedK >= newTotalK;
      const newPaymentStatus = receivedK <= 0 ? "Unpaid" : fullyPaid ? "Paid" : "Part Paid";
      // Stamped on the first payment and never moved by a later one; cleared
      // only when the last payment goes. Neither happens here.
      const newConfirmedAt = receivedK <= 0 ? null : order.payment_confirmed_at || new Date();

      // ── Commission, re-derived exactly as commission.commissionQuantity ──
      const [commission] = (
        await client.query(
          `SELECT id, quantity, commission_rate::numeric AS rate, commission_amount::numeric AS amount, status
             FROM commissions WHERE order_id = $1 FOR UPDATE`,
          [orderId]
        )
      ).rows;

      let commissionPlan = null;
      if (commission) {
        if (commission.status === "paid") {
          throw new Error(`order ${orderId} commission is already paid — a snapshot of money that has left is never rewritten`);
        }
        const [rateRow] = (
          await client.query(
            `SELECT commission_rate::numeric AS rate FROM depot_product_commissions WHERE depot_id = $1 AND product_id = $2 LIMIT 1`,
            [order.depot_id, order.product_id]
          )
        ).rows;
        // createForOrder falls back to rate 0 when no rate is configured. Doing
        // that here would silently zero a commission that already carries a real
        // rate, so an existing rate wins when the table has nothing to say.
        const newRate = rateRow ? Number(rateRow.rate) : Number(commission.rate);

        let newQty;
        if (fullyPaid) {
          const truckSum = Number(
            (await client.query(`SELECT COALESCE(SUM(quantity), 0)::numeric AS q FROM order_trucks WHERE order_id = $1`, [orderId]))
              .rows[0].q
          );
          newQty = truckSum > 0 ? Math.floor(truckSum) : Math.floor(order.quantity);
        } else {
          // Kobo both sides, so this is exact rather than a float quotient.
          newQty = Math.floor(receivedK / newPriceK);
        }
        commissionPlan = { row: commission, newRate, newQty, newAmountK: Math.round(newQty * newRate * 100) };
      }

      plans.push({ order, newTotalK, receivedK, newPaymentStatus, newConfirmedAt, commissionPlan, payments });
    }

    // ── Report ──────────────────────────────────────────────────────────────
    console.log(`\nunit price  ${naira(K(EXPECTED_PRICE))}/L  →  ${naira(newPriceK)}/L\n`);
    let salesBeforeK = 0;
    let salesAfterK = 0;

    for (const p of plans) {
      const { order } = p;
      salesBeforeK += K(order.total);
      salesAfterK += p.newTotalK;

      console.log(`${order.order_number}  (AS${order.id} — ${order.company_name})`);
      console.log(`  quantity        ${litres(order.quantity)} L  (unchanged)`);
      console.log(`  sales value     ${naira(K(order.total))}  →  ${naira(p.newTotalK)}   (−${naira(K(order.total) - p.newTotalK)})`);
      console.log(`  amount paid     ${naira(p.receivedK)}  (unchanged — ${p.payments.length} payment${p.payments.length === 1 ? "" : "s"})`);
      console.log(
        `  payment status  ${order.payment_status}${order.payment_status === p.newPaymentStatus ? "  (unchanged)" : `  →  ${p.newPaymentStatus}`}`
      );
      const shortBeforeK = Math.max(0, K(order.total) - p.receivedK);
      const shortAfterK = Math.max(0, p.newTotalK - p.receivedK);
      const surplusAfterK = Math.max(0, p.receivedK - p.newTotalK);
      console.log(
        `  balance         ${shortBeforeK ? `${naira(shortBeforeK)} short` : "settled"}  →  ${
          surplusAfterK ? `${naira(surplusAfterK)} SURPLUS` : shortAfterK ? `${naira(shortAfterK)} short` : "settled"
        }`
      );
      if (p.commissionPlan) {
        const c = p.commissionPlan;
        console.log(
          `  commission      ${litres(c.row.quantity)} L @ ${naira(K(c.row.rate))} = ${naira(K(c.row.amount))}  →  ${litres(
            c.newQty
          )} L @ ${naira(K(c.newRate))} = ${naira(c.newAmountK)}`
        );
      }
      console.log(`  pfi allocation  unchanged — quantity is not moving, so no stock is released or reserved`);
      console.log("");
    }

    console.log(`total sales value  ${naira(salesBeforeK)}  →  ${naira(salesAfterK)}   (−${naira(salesBeforeK - salesAfterK)})`);

    if (!APPLY) {
      await client.query("ROLLBACK");
      console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
      await client.end();
      return;
    }

    // ── Rollback capture ────────────────────────────────────────────────────
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rollbackPath = path.join(__dirname, `rollback-unit-price-${stamp}.json`);
    fs.writeFileSync(
      rollbackPath,
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          orders: plans.map((p) => ({
            id: p.order.id,
            order_number: p.order.order_number,
            price: Number(p.order.price).toFixed(2),
            total_amount: Number(p.order.total).toFixed(2),
            amount_paid: Number(p.order.paid).toFixed(2),
            payment_status: p.order.payment_status,
            payment_confirmed_at: p.order.payment_confirmed_at,
            commission: p.commissionPlan
              ? {
                  id: p.commissionPlan.row.id,
                  quantity: p.commissionPlan.row.quantity,
                  commission_rate: Number(p.commissionPlan.row.rate).toFixed(2),
                  commission_amount: Number(p.commissionPlan.row.amount).toFixed(2),
                }
              : null,
          })),
        },
        null,
        2
      )
    );
    console.log(`\nRollback written to ${rollbackPath}`);

    // ── Write ───────────────────────────────────────────────────────────────
    for (const p of plans) {
      const { order } = p;

      await client.query(
        `UPDATE orders
            SET price = $1, total_amount = $2, amount_paid = $3, payment_status = $4,
                payment_confirmed_at = $5, updated_at = NOW()
          WHERE id = $6`,
        [NEW_PRICE, dec(p.newTotalK), dec(p.receivedK), p.newPaymentStatus, p.newConfirmedAt, order.id]
      );

      if (p.commissionPlan) {
        const c = p.commissionPlan;
        await client.query(
          `UPDATE commissions SET quantity = $1, commission_rate = $2, commission_amount = $3, updated_at = NOW() WHERE id = $4`,
          [c.newQty, c.newRate.toFixed(2), dec(c.newAmountK), c.row.id]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, action, actor_type, metadata)
         VALUES ('order', $1, 'order.updated', 'system', $2::jsonb)`,
        [
          order.id,
          JSON.stringify({
            changes: {
              price: [Number(order.price).toFixed(2), NEW_PRICE],
              totalAmount: [Number(order.total).toFixed(2), dec(p.newTotalK)],
              ...(order.payment_status !== p.newPaymentStatus
                ? { paymentStatus: [order.payment_status, p.newPaymentStatus] }
                : {}),
              ...(p.commissionPlan
                ? { commissionQuantity: [p.commissionPlan.row.quantity, p.commissionPlan.newQty] }
                : {}),
            },
            reason: `Re-rated from ₦${EXPECTED_PRICE} to ₦${NEW_PRICE} per litre — placed at the wrong unit price. Quantity and PFI stock unchanged.`,
            via: "scripts/correct-orders-unit-price-1265-50.js",
          }),
        ]
      );
    }

    // ── Post-write invariants ───────────────────────────────────────────────
    const problems = [];
    for (const p of plans) {
      const { order } = p;
      const [after] = (
        await client.query(
          `SELECT o.quantity, o.price::numeric AS price, o.total_amount::numeric AS total,
                  o.amount_paid::numeric AS paid, o.payment_status::text AS payment_status,
                  o.status::text AS status,
                  (SELECT COALESCE(SUM(quantity), 0) FROM order_pfi_allocations WHERE order_id = o.id)::int AS alloc,
                  (SELECT COALESCE(SUM(amount), 0) FROM order_payments WHERE order_id = o.id)::numeric AS payments,
                  (SELECT quantity FROM commissions WHERE order_id = o.id)::int AS comm_qty,
                  (SELECT commission_amount FROM commissions WHERE order_id = o.id)::numeric AS comm_amt
             FROM orders o WHERE o.id = $1`,
          [order.id]
        )
      ).rows;

      const tag = `AS${order.id}`;
      if (K(after.price) !== newPriceK) problems.push(`${tag} price is ${after.price}`);
      if (K(after.total) !== p.newTotalK) problems.push(`${tag} total_amount is ${after.total}`);
      // The whole point: the sales value is the corrected rate times the quantity.
      if (K(after.total) !== K(after.price) * after.quantity) problems.push(`${tag} total_amount is not price x quantity`);
      if (after.quantity !== order.quantity) problems.push(`${tag} quantity moved to ${after.quantity}`);
      if (after.status !== order.status) problems.push(`${tag} status moved to ${after.status}`);
      if (K(after.paid) !== p.receivedK) problems.push(`${tag} amount_paid drifted to ${after.paid}`);
      // No money moved — amount_paid must still be exactly the payment rows.
      if (K(after.payments) !== p.receivedK) problems.push(`${tag} order_payments changed to ${after.payments}`);
      if (after.payment_status !== p.newPaymentStatus) problems.push(`${tag} payment_status is ${after.payment_status}`);
      // No stock moved either.
      if (after.alloc !== order.quantity) problems.push(`${tag} pfi allocation is ${after.alloc}, expected ${order.quantity}`);
      if (p.commissionPlan) {
        if (after.comm_qty !== p.commissionPlan.newQty) problems.push(`${tag} commission quantity is ${after.comm_qty}`);
        if (K(after.comm_amt) !== p.commissionPlan.newAmountK) problems.push(`${tag} commission amount is ${after.comm_amt}`);
      }
    }

    // The PFI backing all four must not have moved a litre.
    const [pfi] = (await client.query(`SELECT sold_qty_litres FROM pfis WHERE id = 46`)).rows;
    if (Number(pfi.sold_qty_litres) !== 2800000) {
      problems.push(`PFI 46 sold_qty_litres moved to ${pfi.sold_qty_litres}, expected 2800000`);
    }

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
