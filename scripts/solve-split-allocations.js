/**
 * Re-solve the deposit allocations so no order is a pass-through.
 *
 * A pass-through is an order that RECEIVES a remainder off another order's
 * credit and also GIVES one away — money visibly flowing through it rather
 * than settling. The book has 16 of them, strung along one chain of 250,000
 * tails. An earlier attempt minimised the NUMBER of split credits instead and
 * reached 5, at the cost of 4-way splits of large amounts. Both optimise the
 * wrong thing.
 *
 * ── The idea ─────────────────────────────────────────────────────────────
 *
 * Give every credit one of two roles:
 *
 *   whole   spent entire, against exactly one order
 *   donor   never an order's main funding; only ever tops orders up
 *
 * If every split credit is a donor then no order can both receive and give:
 * the topped-up orders are sinks, the donors are the sources, and a donor is
 * not an order. Pass-throughs become structurally impossible rather than
 * merely rare.
 *
 * ── Invariants, enforced before commit ───────────────────────────────────
 *
 *   - every order funded by EXACTLY its total, unchanged from now
 *   - every credit spends EXACTLY what it spends today, so the 737m of
 *     deliberate wallet remainders is never touched
 *   - money never crosses customers
 *   - nothing negative
 *
 *   node scripts/solve-split-allocations.js            dry run
 *   node scripts/solve-split-allocations.js --apply    commits
 */
require("dotenv").config();
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const C = (v) => Math.round(Number(v) * 100);
const n = (k) => (k / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Orders that both receive a non-largest slice and hold a largest one. */
function shape(assign) {
  const byDep = new Map();
  for (const [dep, ord, amt] of assign) {
    if (!byDep.has(dep)) byDep.set(dep, []);
    byDep.get(dep).push([ord, amt]);
  }
  const gives = new Set();
  const receives = new Set();
  let splits = 0;
  let widest = 0;
  for (const [, list] of byDep) {
    if (list.length < 2) continue;
    splits++;
    widest = Math.max(widest, list.length);
    const sorted = [...list].sort((a, b) => b[1] - a[1]);
    gives.add(sorted[0][0]);
    for (const [o] of sorted.slice(1)) receives.add(o);
  }
  return { splits, widest, through: [...receives].filter((o) => gives.has(o)) };
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("BEGIN");
  try {
    const rows = (
      await c.query(`
        WITH split AS (
          SELECT deposit_id FROM order_deposit_allocations GROUP BY deposit_id HAVING COUNT(*) > 1
        ),
        touched AS (
          SELECT DISTINCT order_id FROM order_deposit_allocations
          WHERE deposit_id IN (SELECT deposit_id FROM split)
        )
        SELECT a.id alloc_id, a.order_id, a.deposit_id, a.amount::numeric slice,
               d.customer_id dep_cust, o.total_amount::numeric tot, o.customer_id ord_cust
        FROM order_deposit_allocations a
        JOIN deposits d ON d.id = a.deposit_id
        JOIN orders o ON o.id = a.order_id
        WHERE a.order_id IN (SELECT order_id FROM touched)`)
    ).rows;

    const orderIds = new Set(rows.map((r) => r.order_id));
    const depIds = [...new Set(rows.map((r) => r.deposit_id))];
    // A credit also feeding an order outside this set cannot be moved without
    // disturbing that order, so it is left exactly as it is.
    const outside = new Set(
      (
        await c.query(
          `SELECT DISTINCT deposit_id FROM order_deposit_allocations
           WHERE deposit_id = ANY($1::int[]) AND order_id <> ALL($2::int[])`,
          [depIds, [...orderIds]]
        )
      ).rows.map((r) => r.deposit_id)
    );
    const usable = rows.filter((r) => !outside.has(r.deposit_id));

    const before = shape(usable.map((r) => [r.deposit_id, r.order_id, C(r.slice)]));
    console.log(
      `now      : ${before.splits} split credits, widest ${before.widest}-way, ${before.through.length} pass-through orders`
    );

    const need = new Map();
    const budget = new Map();
    const custOf = new Map();
    const depCust = new Map();
    for (const r of usable) {
      if (!need.has(r.order_id)) need.set(r.order_id, C(r.tot));
      budget.set(r.deposit_id, (budget.get(r.deposit_id) || 0) + C(r.slice));
      custOf.set(r.order_id, r.ord_cust);
      depCust.set(r.deposit_id, r.dep_cust);
    }
    const canPay = (d, o) => depCust.get(d) === custOf.get(o);

    const left = new Map(budget);
    const want = new Map(need);
    const assign = [];
    const take = (d, o, amt) => {
      if (amt <= 0) return;
      assign.push([d, o, amt]);
      left.set(d, left.get(d) - amt);
      want.set(o, want.get(o) - amt);
    };

    // 1. Exact fits: a credit that is precisely an order's whole need.
    let moved = true;
    while (moved) {
      moved = false;
      for (const [d, sup] of left) {
        if (sup <= 0) continue;
        for (const [o, req] of want) {
          if (req !== sup || !canPay(d, o)) continue;
          take(d, o, sup);
          moved = true;
          break;
        }
        if (moved) break;
      }
    }

    // 2. Whole credits that fit inside what an order still needs. Largest
    //    order first, largest credit first, so the big orders soak up the big
    //    credits and what is left over is small enough to be a top-up.
    for (const [o] of [...want].sort((a, b) => b[1] - a[1])) {
      for (;;) {
        const req = want.get(o);
        if (req <= 0) break;
        let best = null;
        for (const [d, sup] of left) {
          if (sup <= 0 || sup > req || !canPay(d, o)) continue;
          if (best === null || sup > left.get(best)) best = d;
        }
        if (best === null) break;
        take(best, o, left.get(best));
      }
    }

    // 3. Whatever is still short is topped up from the credits left over —
    //    the donors. None of them funded an order on its own above, so no
    //    order topped up here is the largest taker of a split credit.
    for (const [o] of [...want].sort((a, b) => b[1] - a[1])) {
      while (want.get(o) > 0) {
        let best = null;
        for (const [d, sup] of left) {
          if (sup <= 0 || !canPay(d, o)) continue;
          if (best === null || sup > left.get(best)) best = d;
        }
        if (best === null) break;
        take(best, o, Math.min(left.get(best), want.get(o)));
      }
    }

    const unfunded = [...want].filter(([, v]) => v !== 0);
    const unspent = [...left].filter(([, v]) => v !== 0);
    if (unfunded.length || unspent.length) {
      for (const [o, v] of unfunded) console.log(`   order ${o} off by ${n(v)}`);
      for (const [d, v] of unspent) console.log(`   credit ${d} left with ${n(v)}`);
      throw new Error("did not balance — nothing written");
    }

    const after = shape(assign);
    console.log(
      `proposed : ${after.splits} split credits, widest ${after.widest}-way, ${after.through.length} pass-through orders`
    );
    if (after.through.length) console.log(`   still passing through: ${after.through.join(", ")}`);
    console.log(`allocation rows: ${usable.length} -> ${assign.length}`);

    if (!APPLY) {
      await c.query("ROLLBACK");
      console.log("\nDRY RUN — nothing written.");
      await c.end();
      return;
    }

    const del = (
      await c.query(`DELETE FROM order_deposit_allocations WHERE id = ANY($1::int[])`, [
        usable.map((r) => r.alloc_id),
      ])
    ).rowCount;
    for (const [d, o, amt] of assign) {
      await c.query(
        `INSERT INTO order_deposit_allocations (order_id, deposit_id, amount) VALUES ($1,$2,$3)`,
        [o, d, (amt / 100).toFixed(2)]
      );
    }
    console.log(`deleted ${del} | inserted ${assign.length}`);

    const bad = (
      await c.query(
        `SELECT COUNT(*)::int n FROM (
           SELECT o.id FROM orders o JOIN order_deposit_allocations a ON a.order_id = o.id
           WHERE o.id = ANY($1::int[]) GROUP BY o.id, o.total_amount
           HAVING ABS(SUM(a.amount::numeric) - o.total_amount::numeric) > 0.005) t`,
        [[...orderIds]]
      )
    ).rows[0].n;
    const over = (
      await c.query(`SELECT COUNT(*)::int n FROM (
        SELECT d.id FROM deposits d JOIN order_deposit_allocations a ON a.deposit_id = d.id
        GROUP BY d.id, d.amount HAVING SUM(a.amount::numeric) > d.amount::numeric + 0.005) t`)
    ).rows[0].n;
    console.log(`orders not exact: ${bad} | credits overspent: ${over}`);
    if (bad || over) throw new Error("invariant broken");

    await c.query("COMMIT");
    console.log("COMMITTED");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("ROLLED BACK:", e.message);
    process.exitCode = 1;
  }
  await c.end();
})();
