/**
 * The day's trading, assembled per PFI.
 *
 * The combined report groups by depot, which answers "how did Warri do".
 * This answers the question actually asked at the end of a day: for each
 * batch we are currently trading, what came in, what went out, what is still
 * owed, and what is left. A batch — not a depot — is the thing that gets
 * bought, drawn down and closed, so it is the thing the money hangs off.
 *
 * ── Two identity systems, on purpose ──────────────────────────────────────
 *
 * Depot trading is keyed on `pfis.id`: an order carries a real `pfi_id`, so
 * every figure on that side is exact.
 *
 * Truck sales are not. `delivery_inventory.pfi_id` is populated for the three
 * oldest allocations and NULL for every current one, and the two naming
 * systems do not meet: sales say "PFI-43B", the pfis table says
 * "PFI/43/26/DANGOTE/PMS/3ML/AUG". There is no key joining them and no safe
 * way to infer one — "43B" and "43/26" being the same batch is a business
 * fact, not a string fact.
 *
 * So the truck-sales half is grouped by `allocation_code` and reported as its
 * own set of batches. That is the only identity the data actually has, and it
 * is the one the desk uses out loud. If the link is ever backfilled, the two
 * halves can merge; until then, joining them would be inventing a fact.
 *
 * ── Station names ─────────────────────────────────────────────────────────
 *
 * `location` is free text on both sales and inventory, and the same place is
 * written several ways: "Damaturu" and "DAMATURU", "KANO" and "Kano Filling
 * Station". Case, spacing and a trailing "Filling Station" are normalised,
 * because those are certainly the same place.
 *
 * Nothing else is. "JOS" and "JOSe" are one typo apart and almost certainly
 * one station, but merging them here would silently rewrite what somebody
 * typed, and a report that quietly corrects its inputs teaches nobody to fix
 * them. They are reported separately and flagged as suspected duplicates, so
 * the fix happens in the data instead.
 */
const { client } = require("../db");
const { dayBounds, REPORT_TZ } = require("./dailyCombinedReport.service");

const num = (v) => Number(v || 0);

/**
 * The comparable form of a station name.
 *
 * Only differences that cannot be anything but noise: surrounding space,
 * internal runs of space, case, and the "Filling Station" suffix people add
 * about half the time. Spelling is left alone — see the header.
 */
const stationKey = (raw) =>
  String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*FILLING\s+STATION$/, "")
    .trim() || "(UNNAMED)";

/** Edit distance, capped — only ever asked whether two names are 1–2 apart. */
const editDistance = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      last = tmp;
    }
  }
  return prev[b.length];
};

/**
 * Station names within one batch that are probably the same place.
 *
 * Reported, never merged. The tolerance scales with length because a flat two
 * edits is most of a short word: it paired "YOLA" with "SOBA", two genuinely
 * different towns, which is exactly the kind of confident wrongness that makes
 * a reader stop trusting the rest of the report. Two edits only once a name is
 * long enough for two edits to still leave it recognisable; one otherwise.
 *
 * Still catches every real case in the data: JOS/JOSE, BAUCHI/BAUCH,
 * PATISKUM/POTISKUM, KADUNA/KADUAN.
 */
const duplicateWarnings = (keys) => {
  const out = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const tolerance = Math.min(keys[i].length, keys[j].length) >= 6 ? 2 : 1;
      const d = editDistance(keys[i], keys[j]);
      if (d > 0 && d <= tolerance) out.push([keys[i], keys[j]]);
    }
  }
  return out;
};

/**
 * Everything the per-PFI report needs, for one Lagos day.
 *
 * @param {Date} [date] any instant inside the day to report on
 */
const buildPfiDailyReportData = async (date = new Date()) => {
  const { start, end, dayStr } = dayBounds(date);
  // postgres.js takes the bound as a string, as the combined report does.
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  /**
   * The delivery tables date things as text, not as timestamps.
   *
   * `date_loaded` and `date_of_payment` are varchar 'YYYY-MM-DD' — a Lagos
   * calendar date somebody typed on a form, with no time and no zone. Both are
   * clean across all 1,460 rows.
   *
   * They are therefore compared to the report's own day string, not to the
   * UTC instants above. Comparing them to an ISO timestamp is a lexicographic
   * accident that happens to parse: '2026-09-07' < '2026-09-09T23:00:00.000Z'
   * is answering a question about alphabetical order.
   */

  // ── The batches themselves ──────────────────────────────────────────────
  const pfiRows = await client`
    SELECT id, pfi_number, pfi_type::text AS pfi_type, location_name, product_name,
           starting_qty_litres, sold_qty_litres, unit_price::numeric AS unit_price,
           ticket_count
      FROM pfis
     WHERE status = 'active'
     ORDER BY id DESC`;

  // ── Depot trading, exact because an order carries a real pfi_id ─────────
  //
  // Cancelled and expired orders are excluded from every figure: neither is
  // trading, and counting them would inflate a batch's sales with orders that
  // will never load.
  const orderRows = await client`
    SELECT o.pfi_id,
           COUNT(*)                                            AS orders_all,
           COALESCE(SUM(o.quantity), 0)                        AS litres_all,
           COALESCE(SUM(o.total_amount::numeric), 0)           AS value_all,
           COALESCE(SUM(o.amount_paid::numeric), 0)            AS paid_all,
           COUNT(*)                    FILTER (WHERE o.created_at >= ${startIso} AND o.created_at < ${endIso}) AS orders_today,
           COALESCE(SUM(o.quantity)    FILTER (WHERE o.created_at >= ${startIso} AND o.created_at < ${endIso}), 0) AS litres_today,
           COALESCE(SUM(o.total_amount::numeric) FILTER (WHERE o.created_at >= ${startIso} AND o.created_at < ${endIso}), 0) AS value_today
      FROM orders o
     WHERE o.pfi_id IS NOT NULL
       AND o.status NOT IN ('Cancelled', 'Expired')
     GROUP BY o.pfi_id`;

  /**
   * What was collected today, from the payment rows themselves.
   *
   * NOT from orders.amount_paid. That column is the cumulative total on the
   * order, and payment_confirmed_at marks only the FIRST payment and never
   * moves after it — so filtering the cached total by that timestamp counts an
   * order's entire payment history on the day its first instalment landed, and
   * counts nothing at all on the days the rest arrived.
   *
   * It read as N9.7bn collected against N3.3bn sold, which is the kind of
   * figure that makes a reader stop believing the page rather than query it.
   *
   * Dated on txn_date — when the money moved at the bank — falling back to the
   * row's own creation for a payment recorded without one.
   */
  const collectionRows = await client`
    SELECT o.pfi_id,
           COALESCE(SUM(op.amount::numeric), 0) AS paid_today
      FROM order_payments op
      JOIN orders o ON o.id = op.order_id
     WHERE o.pfi_id IS NOT NULL
       AND o.status NOT IN ('Cancelled', 'Expired')
       AND COALESCE(op.txn_date, op.created_at) >= ${startIso}
       AND COALESCE(op.txn_date, op.created_at) <  ${endIso}
     GROUP BY o.pfi_id`;

  // ── Gate and gantry movements, from the truck's own timestamps ──────────
  const truckRows = await client`
    SELECT o.pfi_id,
           COUNT(*) FILTER (WHERE t.security_entered_at >= ${startIso} AND t.security_entered_at < ${endIso}) AS entered_today,
           COUNT(*) FILTER (WHERE t.loaded_at          >= ${startIso} AND t.loaded_at          < ${endIso}) AS loaded_today,
           COUNT(*) FILTER (WHERE t.security_exited_at >= ${startIso} AND t.security_exited_at < ${endIso}) AS exited_today,
           COALESCE(SUM(t.quantity) FILTER (WHERE t.security_exited_at >= ${startIso} AND t.security_exited_at < ${endIso}), 0) AS litres_out_today,
           -- On site now: through the gate, not yet back out.
           COUNT(*) FILTER (WHERE t.security_entered_at IS NOT NULL AND t.security_exited_at IS NULL) AS on_site,
           COUNT(*)                                        AS trucks_all,
           COALESCE(SUM(t.quantity), 0)                    AS litres_ticketed_all
      FROM order_trucks t
      JOIN orders o ON o.id = t.order_id
     WHERE o.pfi_id IS NOT NULL
       AND o.status NOT IN ('Cancelled', 'Expired')
     GROUP BY o.pfi_id`;

  // ── What the batch has cost ─────────────────────────────────────────────
  //
  // `amount` is the billed figure and `amount_paid` what has actually left, so
  // both are carried: an expense approved today and paid next week is a real
  // cost of this batch on both days, differently.
  const expenseRows = await client`
    SELECT pfi_id,
           COUNT(*)                                    AS expenses_all,
           COALESCE(SUM(amount::numeric), 0)           AS amount_all,
           COALESCE(SUM(amount_paid::numeric), 0)      AS paid_all,
           COUNT(*)                              FILTER (WHERE expense_date >= ${startIso} AND expense_date < ${endIso}) AS expenses_today,
           COALESCE(SUM(amount::numeric)         FILTER (WHERE expense_date >= ${startIso} AND expense_date < ${endIso}), 0) AS amount_today
      FROM pfi_expenses
     WHERE pfi_id IS NOT NULL
       AND deleted_at IS NULL
     GROUP BY pfi_id`;

  const byPfi = (rows) => new Map(rows.map((r) => [Number(r.pfi_id), r]));
  const orders = byPfi(orderRows);
  const collections = byPfi(collectionRows);
  const trucks = byPfi(truckRows);
  const expenses = byPfi(expenseRows);

  const pfis = pfiRows.map((p) => {
    const o = orders.get(Number(p.id)) || {};
    const collected = num((collections.get(Number(p.id)) || {}).paid_today);
    const t = trucks.get(Number(p.id)) || {};
    const e = expenses.get(Number(p.id)) || {};

    const starting = num(p.starting_qty_litres);
    const sold = num(p.sold_qty_litres);
    const valueAll = num(o.value_all);
    const paidAll = num(o.paid_all);

    return {
      id: Number(p.id),
      pfiNumber: p.pfi_number,
      type: p.pfi_type,
      location: p.location_name || "",
      product: p.product_name || "",
      unitPrice: num(p.unit_price),

      stock: {
        starting,
        sold,
        remaining: Math.max(0, starting - sold),
        percentSold: starting > 0 ? (sold / starting) * 100 : 0,
      },

      orders: {
        today: { count: Number(o.orders_today || 0), litres: num(o.litres_today), value: num(o.value_today), paid: collected },
        toDate: { count: Number(o.orders_all || 0), litres: num(o.litres_all), value: valueAll, paid: paidAll },
        outstanding: Math.max(0, valueAll - paidAll),
      },

      movements: {
        enteredToday: Number(t.entered_today || 0),
        loadedToday: Number(t.loaded_today || 0),
        exitedToday: Number(t.exited_today || 0),
        litresOutToday: num(t.litres_out_today),
        onSite: Number(t.on_site || 0),
        trucksToDate: Number(t.trucks_all || 0),
        litresTicketedToDate: num(t.litres_ticketed_all),
      },

      expenses: {
        today: { count: Number(e.expenses_today || 0), amount: num(e.amount_today) },
        toDate: { count: Number(e.expenses_all || 0), amount: num(e.amount_all), paid: num(e.paid_all) },
      },
    };
  });

  // ── Truck sales, grouped by allocation_code ─────────────────────────────
  //
  // Only codes with stock allocated or sales recorded appear; a code that has
  // gone quiet is finished business and does not belong on a daily report.
  const invRows = await client`
    SELECT COALESCE(NULLIF(TRIM(allocation_code), ''), '(unassigned)') AS code,
           location,
           COUNT(*)                                   AS trucks,
           COALESCE(SUM(quantity_allocated), 0)       AS allocated,
           COUNT(*) FILTER (WHERE date_offloaded IS NOT NULL) AS offloaded,
           MAX(date_allocated)                        AS last_allocated
      FROM delivery_inventory
     GROUP BY 1, 2`;

  /**
   * Truck sales, at the grain of a truck load rather than a row.
   *
   * `delivery_sales` is not one row per sale. It is one row per PAYMENT: the
   * truck, its quantity and its sales value are repeated on every instalment,
   * so BWR802XB appears fourteen times carrying 50,000 L and ₦62,500,000 each
   * time. 1,460 rows are 483 actual truck loads.
   *
   * Summing the row as it stands therefore multiplies volume and revenue by
   * however many times a customer happened to pay — which is why an earlier
   * cut of this report had more litres sold than were ever allocated, and a
   * negative remaining stock of 38 million litres.
   *
   * So the sale figures are taken once per distinct load, and only the money
   * is summed across rows. `date_loaded` is in the key: it is never null, it
   * costs nothing today (483 either way), and it keeps two identical loads by
   * the same truck from collapsing into one if that ever happens.
   */
  const saleRows = await client`
    WITH loads AS (
      SELECT DISTINCT ON (allocation_code, truck_number, date_loaded, quantity, sales_value)
             COALESCE(NULLIF(TRIM(allocation_code), ''), '(unassigned)') AS code,
             location,
             truck_number,
             date_loaded,
             quantity,
             sales_value::numeric   AS sales_value,
             expenses_amount::numeric AS expenses_amount
        FROM delivery_sales
    )
    SELECT code, location,
           COUNT(*)                          AS loads_all,
           COALESCE(SUM(quantity), 0)        AS litres_all,
           COALESCE(SUM(sales_value), 0)     AS value_all,
           COALESCE(SUM(expenses_amount), 0) AS expenses_all,
           COUNT(*)                     FILTER (WHERE date_loaded = ${dayStr}) AS loads_today,
           COALESCE(SUM(quantity)       FILTER (WHERE date_loaded = ${dayStr}), 0) AS litres_today,
           COALESCE(SUM(sales_value)    FILTER (WHERE date_loaded = ${dayStr}), 0) AS value_today,
           MAX(date_loaded)                  AS last_load
      FROM loads
     GROUP BY code, location`;

  /**
   * The money, summed across every instalment row.
   *
   * Dated by `date_of_payment` — when the money actually arrived — falling back
   * to `created_at` for the eight rows that have none. Using created_at alone
   * would date a September instalment against a truck loaded in July as a sale
   * made in September.
   */
  const paymentRows = await client`
    SELECT COALESCE(NULLIF(TRIM(allocation_code), ''), '(unassigned)') AS code,
           location,
           COALESCE(SUM(payment_amount::numeric), 0) AS paid_all,
           COALESCE(SUM(payment_amount::numeric) FILTER (
             WHERE COALESCE(NULLIF(date_of_payment, ''),
                            to_char(created_at AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM-DD')) = ${dayStr}), 0) AS paid_today
      FROM delivery_sales
     GROUP BY code, location`;

  /** code → station key → the running figures for that station. */
  const batches = new Map();
  const stationOf = (code, rawLocation) => {
    if (!batches.has(code)) batches.set(code, { code, stations: new Map(), lastActivity: null });
    const batch = batches.get(code);
    const key = stationKey(rawLocation);
    if (!batch.stations.has(key)) {
      batch.stations.set(key, {
        key,
        // The first spelling seen is the display name; the key is what groups.
        name: String(rawLocation || "").trim() || "(unnamed)",
        allocatedLitres: 0,
        trucksAllocated: 0,
        trucksOffloaded: 0,
        soldLitres: 0,
        soldLitresToday: 0,
        trucksSold: 0,
        trucksSoldToday: 0,
        salesValue: 0,
        salesValueToday: 0,
        deposited: 0,
        depositedToday: 0,
        expenses: 0,
      });
    }
    return batch.stations.get(key);
  };

  for (const r of invRows) {
    const s = stationOf(r.code, r.location);
    s.allocatedLitres += num(r.allocated);
    s.trucksAllocated += Number(r.trucks || 0);
    s.trucksOffloaded += Number(r.offloaded || 0);
  }

  for (const r of saleRows) {
    const s = stationOf(r.code, r.location);
    s.soldLitres += num(r.litres_all);
    s.soldLitresToday += num(r.litres_today);
    s.trucksSold += Number(r.loads_all || 0);
    s.trucksSoldToday += Number(r.loads_today || 0);
    s.salesValue += num(r.value_all);
    s.salesValueToday += num(r.value_today);
    s.expenses += num(r.expenses_all);

    const batch = batches.get(r.code);
    const last = r.last_load ? new Date(r.last_load) : null;
    if (last && (!batch.lastActivity || last > batch.lastActivity)) batch.lastActivity = last;
  }

  for (const r of paymentRows) {
    const s = stationOf(r.code, r.location);
    s.deposited += num(r.paid_all);
    s.depositedToday += num(r.paid_today);
  }

  const truckSales = [...batches.values()]
    .map((b) => {
      const stations = [...b.stations.values()]
        .map((s) => ({
          ...s,
          remainingLitres: s.allocatedLitres - s.soldLitres,
          /**
           * Whether "remaining" means anything for this station.
           *
           * delivery_inventory is an allocation register, not a complete
           * history: some batches have sales for trucks it never recorded, and
           * the '(unassigned)' code has 680,000 L sold against no allocation at
           * all. Where that happens, allocated minus sold is negative — which
           * is not a stock level, it is the register being behind.
           *
           * The figure is still carried so the gap is visible, but flagged, so
           * the email can say "allocation incomplete" instead of printing a
           * negative stock that no reader could act on.
           */
          stockKnown: s.allocatedLitres > 0 && s.allocatedLitres >= s.soldLitres,
          outstanding: s.salesValue - s.deposited,
        }))
        .sort((a, b2) => b2.salesValue - a.salesValue);

      const sum = (f) => stations.reduce((n, s) => n + f(s), 0);
      const salesValue = sum((s) => s.salesValue);
      const deposited = sum((s) => s.deposited);
      const allocated = sum((s) => s.allocatedLitres);
      const sold = sum((s) => s.soldLitres);
      // Judged on the batch's own totals, not on every station agreeing: one
      // station whose allocation was never recorded should not blank out a
      // batch figure that is otherwise sound. Stations carry their own flag.
      const stockKnown = allocated > 0 && allocated >= sold;

      return {
        code: b.code,
        lastActivity: b.lastActivity ? b.lastActivity.toISOString() : null,
        stations,
        // Names one or two characters apart inside a batch: reported, not merged.
        possibleDuplicates: duplicateWarnings(stations.map((s) => s.key)),
        totals: {
          stations: stations.length,
          trucksAllocated: sum((s) => s.trucksAllocated),
          trucksSold: sum((s) => s.trucksSold),
          trucksSoldToday: sum((s) => s.trucksSoldToday),
          allocatedLitres: sum((s) => s.allocatedLitres),
          soldLitres: sum((s) => s.soldLitres),
          soldLitresToday: sum((s) => s.soldLitresToday),
          remainingLitres: allocated - sold,
          stockKnown,

          salesValue,
          salesValueToday: sum((s) => s.salesValueToday),
          deposited,
          depositedToday: sum((s) => s.depositedToday),
          outstanding: salesValue - deposited,
          expenses: sum((s) => s.expenses),
        },
      };
    })
    // A batch with nothing allocated and nothing sold is closed business.
    .filter((b) => b.totals.allocatedLitres > 0 || b.totals.soldLitres > 0)
    .sort((a, b2) => {
      // Today's activity first, then by what is still owed — the two reasons
      // somebody opens this report at all.
      const at = a.totals.soldLitresToday > 0 ? 1 : 0;
      const bt = b2.totals.soldLitresToday > 0 ? 1 : 0;
      if (at !== bt) return bt - at;
      return b2.totals.outstanding - a.totals.outstanding;
    });

  // ── One line for the top of the email ───────────────────────────────────
  const depotTotals = pfis.reduce(
    (acc, p) => {
      acc.ordersToday += p.orders.today.count;
      acc.litresToday += p.orders.today.litres;
      acc.valueToday += p.orders.today.value;
      acc.paidToday += p.orders.today.paid;
      acc.outstanding += p.orders.outstanding;
      acc.exitedToday += p.movements.exitedToday;
      acc.expensesToday += p.expenses.today.amount;
      return acc;
    },
    { ordersToday: 0, litresToday: 0, valueToday: 0, paidToday: 0, outstanding: 0, exitedToday: 0, expensesToday: 0 }
  );

  const saleTotals = truckSales.reduce(
    (acc, b) => {
      acc.litresToday += b.totals.soldLitresToday;
      acc.valueToday += b.totals.salesValueToday;
      acc.depositedToday += b.totals.depositedToday;
      acc.outstanding += b.totals.outstanding;
      acc.remainingLitres += b.totals.remainingLitres;
      return acc;
    },
    { litresToday: 0, valueToday: 0, depositedToday: 0, outstanding: 0, remainingLitres: 0 }
  );

  return {
    reportDate: dayStr,
    generatedAt: new Date().toISOString(),
    summary: {
      activePfis: pfis.length,
      activeBatches: truckSales.length,
      litresToday: depotTotals.litresToday + saleTotals.litresToday,
      valueToday: depotTotals.valueToday + saleTotals.valueToday,
      collectedToday: depotTotals.paidToday + saleTotals.depositedToday,
      outstanding: depotTotals.outstanding + saleTotals.outstanding,
      depot: depotTotals,
      truckSales: saleTotals,
    },
    pfis,
    truckSales,
  };
};

module.exports = { buildPfiDailyReportData, stationKey };
