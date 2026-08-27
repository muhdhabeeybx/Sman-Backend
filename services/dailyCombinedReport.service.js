const { client } = require("../db");
const { generateOrderReference } = require("../utils/helpers");

/**
 * Assembles the data behind the daily HTML report email — the Node
 * equivalent of Django's `_build_combined_html_report()` query side. The
 * catalog template (`reports.daily` in notifications/catalog.js) is a pure
 * function of what this returns; nothing here touches HTML.
 *
 * Locations are depots, not free text: a PFI's `location_id` and an order's
 * `depot_id` are real foreign keys, so grouping by depot is exact. Only
 * `daily_reports.location` is free text (staff type it on the form), so a
 * report row is matched to a depot by substring — the depot name appears
 * inside what staff typed ("Port Harcourt — Avidor Depot" contains "Avidor
 * Depot") — with any report whose location matches no depot kept under its
 * own literal text rather than silently dropped.
 *
 * Which depots appear: any depot with an active PFI, unioned with any depot a
 * daily report matched to for this date — mirroring the Django rule ("PFIs
 * with status=active, unioned with any location that has a staff entry").
 */

const ROLE_TAGS = [
  { type: "sales_manager", label: "SALES_MANAGER" },
  { type: "product_manager", label: "PRODUCT_MANAGER" },
  { type: "security_gate", label: "SECURITY" },
  { type: "commissions", label: "COMMISSIONS" },
  { type: "it_compliance", label: "IT_COMPLIANCE" },
];

const dayBounds = (date) => {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const num = (v) => Number(v || 0);

const buildCombinedDailyReportData = async (date = new Date()) => {
  const { start, end } = dayBounds(date);
  const reportDateStr = start.toISOString().slice(0, 10);

  const [depots, activePfis, reports, ordersToday, pfiLifetimeRevenue] = await Promise.all([
    client`SELECT id, name, city, state FROM depots ORDER BY city ASC`,
    client`
      SELECT id, pfi_number, location_id, starting_qty_litres, sold_qty_litres, status
      FROM pfis WHERE status = 'active'
    `,
    client`
      SELECT id, report_type, location, pfi_number, submitted_by_name,
             opening_stock, litres_sold, truck_count, loading_left_over,
             amount_paid, total_sales_amount, differentials, bank_name, remarks
      FROM daily_reports WHERE report_date = ${reportDateStr}
    `,
    client`
      SELECT o.id, o.order_number, o.company_name, o.pfi_id, o.depot_id,
             o.quantity, o.price, o.total_amount, o.status, o.payment_status,
             c.name AS customer_name, pr.name AS product_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN products pr ON pr.id = o.product_id
      WHERE o.created_at >= ${start.toISOString()} AND o.created_at < ${end.toISOString()}
      ORDER BY o.created_at ASC
    `,
    client`
      SELECT pfi_id, COALESCE(SUM(total_amount), 0)::text AS total
      FROM orders WHERE payment_status = 'Paid' AND pfi_id IS NOT NULL
      GROUP BY pfi_id
    `,
  ]);

  const lifetimeRevenueByPfi = new Map(pfiLifetimeRevenue.map((r) => [r.pfi_id, num(r.total)]));

  // Match a daily_reports free-text location to a depot by substring, in
  // either direction, longest depot name first so "Avidor Depot" doesn't
  // lose to a shorter false match.
  const depotsByNameLength = [...depots].sort((a, b) => b.name.length - a.name.length);
  const matchDepot = (locationText) => {
    const t = String(locationText || "").toLowerCase();
    if (!t) return null;
    return depotsByNameLength.find((d) => t.includes(d.name.toLowerCase())) || null;
  };

  // ── Group everything by depot id (or a synthetic key for unmatched free text) ──
  const groups = new Map(); // key -> { name, depotId, staffEntries: Map(type->row), pfis: [...], orders: [...] }
  const ensureGroup = (key, name) => {
    if (!groups.has(key)) groups.set(key, { name, staffEntries: new Map(), pfiIds: new Set(), orders: [] });
    return groups.get(key);
  };

  for (const d of depots) {
    if (activePfis.some((p) => p.location_id === d.id)) {
      ensureGroup(`depot:${d.id}`, d.city.toUpperCase());
    }
  }

  for (const r of reports) {
    const depot = matchDepot(r.location);
    const key = depot ? `depot:${depot.id}` : `text:${r.location}`;
    const name = depot ? depot.city.toUpperCase() : String(r.location || "UNKNOWN").toUpperCase();
    const group = ensureGroup(key, name);
    // Last one in wins if a role was somehow submitted twice for one location/day —
    // the unique index on (report_type, report_date, location, pfi_number,
    // submitted_by) allows that across different submitters or PFIs.
    group.staffEntries.set(r.report_type, r);
  }

  for (const p of activePfis) {
    const depot = depots.find((d) => d.id === p.location_id);
    if (!depot) continue;
    ensureGroup(`depot:${depot.id}`, depot.city.toUpperCase()).pfiIds.add(p.id);
  }

  for (const o of ordersToday) {
    const depot = depots.find((d) => d.id === o.depot_id);
    const key = depot ? `depot:${depot.id}` : `depot-orphan:${o.depot_id}`;
    const name = depot ? depot.city.toUpperCase() : "OTHER";
    const group = ensureGroup(key, name);
    group.orders.push(o);
    if (o.pfi_id) group.pfiIds.add(o.pfi_id);
  }

  const locations = [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const staffEntries = ROLE_TAGS.map(({ type, label }) => {
        const r = g.staffEntries.get(type);
        if (!r) return { role: label, entry: null };
        return {
          role: label,
          entry: {
            submittedBy: r.submitted_by_name || "",
            pfiNumber: r.pfi_number || "",
            opening: num(r.opening_stock),
            sold: num(r.litres_sold),
            trucks: num(r.truck_count),
            leftOver: num(r.loading_left_over),
            amountPaid: num(r.amount_paid),
            totalSales: num(r.total_sales_amount),
            diff: num(r.differentials),
            bank: r.bank_name || "",
            remarks: r.remarks || "",
          },
        };
      });

      const pfiStock = [...g.pfiIds]
        .map((pfiId) => {
          const pfi = activePfis.find((p) => p.id === pfiId);
          const ordersForPfi = g.orders.filter((o) => o.pfi_id === pfiId);
          const orderedToday = ordersForPfi.reduce((s, o) => s + num(o.quantity), 0);
          const paidToday = ordersForPfi.filter((o) => o.payment_status === "Paid");
          const confirmed = paidToday.reduce((s, o) => s + num(o.quantity), 0);
          const revenueToday = paidToday.reduce((s, o) => s + num(o.total_amount), 0);
          return {
            pfiNumber: pfi?.pfi_number || `PFI #${pfiId}`,
            orderedToday,
            confirmed,
            balance: pfi ? num(pfi.starting_qty_litres) - num(pfi.sold_qty_litres) : 0,
            revenueToday,
            totalRevenue: lifetimeRevenueByPfi.get(pfiId) || 0,
          };
        })
        .filter((row) => row.orderedToday > 0 || row.confirmed > 0)
        .sort((a, b) => a.pfiNumber.localeCompare(b.pfiNumber));

      const orders = g.orders
        .slice(0, 60)
        .map((o) => ({
          reference: generateOrderReference(o.company_name, o.id),
          customer: o.customer_name || "",
          product: o.product_name || "",
          quantity: num(o.quantity),
          rate: num(o.price),
          amount: num(o.total_amount),
          status: o.status,
        }));

      return { name: g.name, staffEntries, pfiStock, orders };
    });

  const totals = locations.reduce(
    (acc, loc) => {
      acc.staffEntries += loc.staffEntries.filter((s) => s.entry).length;
      acc.orderCount += loc.orders.length;
      acc.qtyLitres += loc.orders.reduce((s, o) => s + o.quantity, 0);
      acc.amountNaira += loc.orders.reduce((s, o) => s + o.amount, 0);
      return acc;
    },
    { staffEntries: 0, orderCount: 0, qtyLitres: 0, amountNaira: 0 }
  );

  return { reportDate: reportDateStr, totals, locations };
};

module.exports = { buildCombinedDailyReportData, ROLE_TAGS };
