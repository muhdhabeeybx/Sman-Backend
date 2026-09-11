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
 * ── Stations are customers, not places ────────────────────────────────────
 *
 * A filling station is a row in `delivery_customers` with
 * customer_type = 'filling_station', reached through the sale's customer_id.
 *
 * It was briefly grouped on `location` instead — free text on the sale row —
 * which listed DAMATURU and KADUNA as stations. They are cities. Grouping on
 * the customer also retired a whole class of spelling problem (JOS/JOSE,
 * KADUNA/KADUAN) that the location text had, along with the fuzzy matching
 * written to cope with it: a station is now a row with an id.
 */
const { client } = require("../db");
const { dayBounds, REPORT_TZ } = require("./dailyCombinedReport.service");

const num = (v) => Number(v || 0);

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

  /**
   * Commission, per PFI, through the order that earned it.
   *
   * `commissions` carries no pfi_id — it hangs off an order, and the order
   * knows its batch. Pending and paid are kept apart because they answer
   * different questions: what is owed to agents, and what has already gone.
   */
  const commissionRows = await client`
    SELECT o.pfi_id,
           COUNT(*)                                                                     AS entries,
           COALESCE(SUM(c.commission_amount::numeric) FILTER (WHERE c.status <> 'paid'), 0) AS due,
           COALESCE(SUM(c.commission_amount::numeric) FILTER (WHERE c.status =  'paid'), 0) AS paid,
           COALESCE(SUM(c.quantity), 0)                                                 AS litres
      FROM commissions c
      JOIN orders o ON o.id = c.order_id
     WHERE o.pfi_id IS NOT NULL
       AND o.status NOT IN ('Cancelled', 'Expired')
     GROUP BY o.pfi_id`;

  /**
   * Expenses that belong to no batch.
   *
   * 68 rows and N187m of them: administrative and general costs that are real
   * money out and were invisible while this report only asked about pfi_id.
   * Grouped by category, because "General Expenses" as one number answers
   * nothing.
   */
  const generalExpenseRows = await client`
    SELECT COALESCE(NULLIF(TRIM(c.name), ''), 'Uncategorised') AS category,
           COUNT(*)                               AS entries_all,
           COALESCE(SUM(e.amount::numeric), 0)    AS amount_all,
           COALESCE(SUM(e.amount_paid::numeric), 0) AS paid_all,
           COUNT(*)                            FILTER (WHERE e.expense_date >= ${startIso} AND e.expense_date < ${endIso}) AS entries_today,
           COALESCE(SUM(e.amount::numeric)     FILTER (WHERE e.expense_date >= ${startIso} AND e.expense_date < ${endIso}), 0) AS amount_today
      FROM pfi_expenses e
      LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.pfi_id IS NULL
       AND e.deleted_at IS NULL
     GROUP BY 1
     ORDER BY 1`;

  const byPfi = (rows) => new Map(rows.map((r) => [Number(r.pfi_id), r]));
  const orders = byPfi(orderRows);
  const collections = byPfi(collectionRows);
  const trucks = byPfi(truckRows);
  const expenses = byPfi(expenseRows);
  const commissions = byPfi(commissionRows);

  const pfis = pfiRows.map((p) => {
    const o = orders.get(Number(p.id)) || {};
    const collected = num((collections.get(Number(p.id)) || {}).paid_today);
    const t = trucks.get(Number(p.id)) || {};
    const e = expenses.get(Number(p.id)) || {};
    const cm = commissions.get(Number(p.id)) || {};

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

      commission: {
        entries: Number(cm.entries || 0),
        due: num(cm.due),
        paid: num(cm.paid),
        litres: num(cm.litres),
      },
    };
  });

  /**
   * Delivery trading splits in two, by who bought.
   *
   * `delivery_customers.customer_type` is either 'customer' or
   * 'filling_station', and the two are different businesses wearing the same
   * table. A customer buys a truck; a filling station holds stock and sells it
   * down. So a truck sale is counted in TRUCKS — how many went out, what they
   * were worth, what is still owed — and a station is counted in LITRES, because
   * the question there is how much is left in the ground.
   *
   * An earlier cut grouped both by `location`, which is a free-text town on the
   * sale row. That listed DAMATURU and KADUNA as "stations". They are cities;
   * the station is the customer. Grouping on the customer removes the whole
   * class of spelling problems with it — a station is a row with an id.
   */
  const loadRows = await client`
    WITH loads AS (
      SELECT DISTINCT ON (allocation_code, truck_number, date_loaded, quantity, sales_value)
             COALESCE(NULLIF(TRIM(allocation_code), ''), '(unassigned)') AS code,
             customer_id,
             customer_name,
             truck_number,
             date_loaded,
             quantity,
             sales_value::numeric     AS sales_value,
             expenses_amount::numeric AS expenses_amount
        FROM delivery_sales
    )
    SELECT l.code,
           COALESCE(dc.customer_type, 'customer')                  AS customer_type,
           COALESCE(NULLIF(TRIM(dc.name), ''), NULLIF(TRIM(l.customer_name), ''), '(unnamed)') AS party,
           COUNT(*)                                                AS loads_all,
           COALESCE(SUM(l.quantity), 0)                            AS litres_all,
           COALESCE(SUM(l.sales_value), 0)                         AS value_all,
           COALESCE(SUM(l.expenses_amount), 0)                     AS expenses_all,
           COUNT(*)                  FILTER (WHERE l.date_loaded = ${dayStr}) AS loads_today,
           COALESCE(SUM(l.quantity)  FILTER (WHERE l.date_loaded = ${dayStr}), 0) AS litres_today,
           COALESCE(SUM(l.sales_value) FILTER (WHERE l.date_loaded = ${dayStr}), 0) AS value_today,
           MAX(l.date_loaded)                                      AS last_load
      FROM loads l
      LEFT JOIN delivery_customers dc ON dc.id = l.customer_id
     GROUP BY l.code, COALESCE(dc.customer_type, 'customer'),
              COALESCE(NULLIF(TRIM(dc.name), ''), NULLIF(TRIM(l.customer_name), ''), '(unnamed)')`;

  /** Money, summed across every instalment row. See the header. */
  const paymentRows = await client`
    SELECT COALESCE(NULLIF(TRIM(ds.allocation_code), ''), '(unassigned)') AS code,
           COALESCE(dc.customer_type, 'customer') AS customer_type,
           COALESCE(NULLIF(TRIM(dc.name), ''), NULLIF(TRIM(ds.customer_name), ''), '(unnamed)') AS party,
           COALESCE(SUM(ds.payment_amount::numeric), 0) AS paid_all,
           COALESCE(SUM(ds.payment_amount::numeric) FILTER (
             WHERE COALESCE(NULLIF(ds.date_of_payment, ''),
                            to_char(ds.created_at AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM-DD')) = ${dayStr}), 0) AS paid_today
      FROM delivery_sales ds
      LEFT JOIN delivery_customers dc ON dc.id = ds.customer_id
     GROUP BY 1, 2, 3`;

  /** Stock put on the ground, per station. Stations only — see above. */
  const stockRows = await client`
    SELECT COALESCE(NULLIF(TRIM(di.allocation_code), ''), '(unassigned)') AS code,
           COALESCE(NULLIF(TRIM(dc.name), ''), NULLIF(TRIM(di.customer_name), ''), '(unnamed)') AS party,
           COUNT(*)                             AS trucks,
           COALESCE(SUM(di.quantity_allocated), 0) AS allocated
      FROM delivery_inventory di
      LEFT JOIN delivery_customers dc ON dc.id = di.customer_id
     WHERE dc.customer_type = 'filling_station'
     GROUP BY 1, 2`;

  const key = (code, party) => `${code}\u0000${party}`;
  const rowsBy = new Map();
  const at = (code, party, type) => {
    const k = key(code, party);
    if (!rowsBy.has(k)) {
      rowsBy.set(k, {
        code, party, customerType: type,
        loads: 0, loadsToday: 0,
        litres: 0, litresToday: 0,
        salesValue: 0, salesValueToday: 0,
        fundsReceived: 0, fundsReceivedToday: 0,
        expenses: 0,
        allocatedLitres: 0, trucksAllocated: 0,
        lastLoad: null,
      });
    }
    const row = rowsBy.get(k);
    if (type && row.customerType !== type) row.customerType = type;
    return row;
  };

  for (const r of loadRows) {
    const row = at(r.code, r.party, r.customer_type);
    row.loads += Number(r.loads_all || 0);
    row.loadsToday += Number(r.loads_today || 0);
    row.litres += num(r.litres_all);
    row.litresToday += num(r.litres_today);
    row.salesValue += num(r.value_all);
    row.salesValueToday += num(r.value_today);
    row.expenses += num(r.expenses_all);
    if (r.last_load && (!row.lastLoad || r.last_load > row.lastLoad)) row.lastLoad = r.last_load;
  }
  for (const r of paymentRows) {
    const row = at(r.code, r.party, r.customer_type);
    row.fundsReceived += num(r.paid_all);
    row.fundsReceivedToday += num(r.paid_today);
  }
  for (const r of stockRows) {
    const row = at(r.code, r.party, "filling_station");
    row.allocatedLitres += num(r.allocated);
    row.trucksAllocated += Number(r.trucks || 0);
  }

  const all = [...rowsBy.values()].map((r) => ({
    ...r,
    // Never negative: an overpayment is a real thing, but it is not a debt,
    // and summing it against other lines would understate what is owed.
    balance: Math.max(0, r.salesValue - r.fundsReceived),
    remainingLitres: r.allocatedLitres - r.litres,
    stockKnown: r.allocatedLitres > 0 && r.allocatedLitres >= r.litres,
  }));

  /**
   * Live, or finished.
   *
   * Until an allocation carries a state of its own, this is derived: a batch
   * or station is live if it moved today, took money today, or still has stock
   * on the ground. Everything else is finished business and is left out, which
   * is the point — a report carrying nine dormant batches buries the two that
   * matter.
   *
   * A finished line that still owes money is NOT dropped silently; it is
   * summarised in `settled` so the debt stays visible without the detail.
   */
  const isLive = (r) =>
    r.loadsToday > 0 ||
    r.fundsReceivedToday > 0 ||
    (r.stockKnown && r.remainingLitres > 0) ||
    // Sold out but still owed is not finished — it is the line somebody has to
    // chase. Dropping it would hide N1.6bn of debt to tidy the page up.
    r.balance > 0;

  const byValue = (a, b) => b.salesValue - a.salesValue;
  const liveRows = all.filter(isLive);
  const dormant = all.filter((r) => !isLive(r));

  /** Truck sales roll up to the batch: the customer is not the unit here. */
  const batches = new Map();
  for (const r of liveRows.filter((x) => x.customerType !== "filling_station")) {
    if (!batches.has(r.code)) {
      batches.set(r.code, {
        code: r.code, customers: 0,
        trucksSoldToday: 0, trucksSold: 0,
        salesValue: 0, salesValueToday: 0,
        fundsReceived: 0, fundsReceivedToday: 0, expenses: 0,
      });
    }
    const b = batches.get(r.code);
    b.customers += 1;
    b.trucksSoldToday += r.loadsToday;
    b.trucksSold += r.loads;
    b.salesValue += r.salesValue;
    b.salesValueToday += r.salesValueToday;
    b.fundsReceived += r.fundsReceived;
    b.fundsReceivedToday += r.fundsReceivedToday;
    b.expenses += r.expenses;
  }

  const truckSales = [...batches.values()]
    // '(unassigned)' is sales whose allocation_code was never filled in. It is
    // a data gap wearing the costume of a batch, and listing it invites the
    // reader to treat it as one.
    .filter((b) => b.code !== "(unassigned)")
    .map((b) => ({ ...b, balance: b.salesValue - b.fundsReceived }))
    .sort(byValue);

  const stations = liveRows
    .filter((r) => r.customerType === "filling_station")
    // Batch first, then station alphabetically: the batch is what a reader
    // scans for, and within it the name is the only stable order there is.
    .sort((a, b) => a.code.localeCompare(b.code) || a.party.localeCompare(b.party));

  const settled = dormant.reduce(
    (acc, r) => {
      acc.lines += 1;
      acc.salesValue += r.salesValue;
      acc.fundsReceived += r.fundsReceived;
      acc.balance += r.balance;
      return acc;
    },
    { lines: 0, salesValue: 0, fundsReceived: 0, balance: 0 }
  );

  /**
   * The sheets each desk filed today.
   *
   * daily_reports carries pfi_number, so a sheet can be read against the batch
   * it was filed for rather than only against a location.
   */
  const staffEntries = await client`
    SELECT report_type::text AS role, location, pfi_number, product_name,
           submitted_by_name, litres_sold::numeric AS litres_sold,
           total_sales_amount::numeric AS sales_value,
           amount_paid::numeric AS amount_paid,
           opening_stock::numeric AS opening_stock,
           tank_balance::numeric AS tank_balance,
           trucks_entered, truck_count, status::text AS status, remarks
      FROM daily_reports
     WHERE report_date = ${dayStr}
     -- report_type::text, not report_type: it is an enum, and a bare enum sorts
     -- by declaration order, which put SECURITY GATE above IT COMPLIANCE and
     -- looked like no order at all.
     ORDER BY COALESCE(NULLIF(TRIM(pfi_number), ''), 'ZZZZ') ASC,
              report_type::text ASC,
              location ASC`;

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

  /**
   * The delivery half, split the way the report shows it.
   *
   * Kept apart so the summary's FUNDS RECEIVED can be checked against the
   * tables underneath it rather than taken on trust: it is exactly depot
   * collections + truck-sales payments + filling-station payments, all for
   * this day only. A headline figure that cannot be reconciled with the rows
   * below it is the fastest way to lose a reader.
   *
   * '(unassigned)' is excluded here as it is in the table — money against a
   * batch nobody recorded is carried in `unassignedReceivedToday` instead of
   * being quietly folded into a total it cannot be traced to.
   */
  const tally = (rows) =>
    rows.reduce(
      (acc, r) => {
        acc.litresToday += r.litresToday;
        acc.valueToday += r.salesValueToday;
        acc.receivedToday += r.fundsReceivedToday;
        acc.balance += r.balance;
        acc.trucksToday += r.loadsToday;
        return acc;
      },
      { litresToday: 0, valueToday: 0, receivedToday: 0, balance: 0, trucksToday: 0 }
    );

  const truckSaleRows = liveRows.filter((r) => r.customerType !== "filling_station" && r.code !== "(unassigned)");
  const stationSaleRows = liveRows.filter((r) => r.customerType === "filling_station");
  const unassignedRows = liveRows.filter((r) => r.code === "(unassigned)" && r.customerType !== "filling_station");

  const truckTotals = tally(truckSaleRows);
  const stationTotals = tally(stationSaleRows);
  const saleTotals = tally([...truckSaleRows, ...stationSaleRows]);
  const unassignedReceivedToday = tally(unassignedRows).receivedToday;

  return {
    reportDate: dayStr,
    generatedAt: new Date().toISOString(),
    summary: {
      activePfis: pfis.length,
      activeBatches: truckSales.length,
      activeStations: stations.length,
      litresSold: depotTotals.litresToday + saleTotals.litresToday,
      salesValue: depotTotals.valueToday + saleTotals.valueToday,
      fundsReceived: depotTotals.paidToday + saleTotals.receivedToday,
      balance: depotTotals.outstanding + saleTotals.balance,
      depot: depotTotals,
      delivery: saleTotals,
      /** The three parts of FUNDS RECEIVED, so the headline can be checked. */
      received: {
        depot: depotTotals.paidToday,
        truckSales: truckTotals.receivedToday,
        stations: stationTotals.receivedToday,
        unassigned: unassignedReceivedToday,
      },
      settled,
    },
    pfis,
    generalExpenses: generalExpenseRows.map((g) => ({
      category: g.category,
      today: { count: Number(g.entries_today || 0), amount: num(g.amount_today) },
      toDate: { count: Number(g.entries_all || 0), amount: num(g.amount_all), paid: num(g.paid_all) },
    })),
    truckSales,
    stations,
    staffEntries,
  };
};

module.exports = { buildPfiDailyReportData };
