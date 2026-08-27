const { and, eq, gte, sql } = require("drizzle-orm");
const { db } = require("../config/db");
const { orders } = require("../db/schema");
const { orderRepo } = require("../repositories");
const { withExpiresAt } = require("./order.service");

/**
 * The signed-in customer's home screen, in one payload. Everything here is
 * scoped to the one customer — the dashboard never sees another account's
 * numbers.
 *
 * Three things the flat orders list can't give the frontend on its own:
 *   - month aggregates computed across ALL of the month's orders, not just
 *     the page that happens to be shown (a paginated list would undercount
 *     "spent this month" the moment a customer crosses one page);
 *   - a dense daily spend series for the sparkline;
 *   - the wallet balance, which lives on the customer row and is otherwise
 *     stripped by publicCustomer.
 */

const RECENT_LIMIT = 20;

/** First instant of the current calendar month, server-local. */
const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

// Local calendar date (YYYY-MM-DD), NOT toISOString — the latter shifts to
// UTC and would label local July 1st as June 30th for any timezone east of
// Greenwich, dropping the sparkline a day out of step with the month.
const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Month totals + a zero-filled day-by-day spend series from the 1st to today.
 * "Cancelled" and "Expired" orders are excluded from the order/litre counts
 * (withdrawn or lapsed without payment); "spent" only ever counts orders
 * whose payment actually confirmed.
 *
 * Bucketing is done in JS, not with SQL date_trunc, on purpose: the densify
 * loop below builds its day keys from JS Dates in the server's local zone, so
 * the aggregation must use the SAME zone or "today" lands in a different
 * bucket than the loop's last key (an off-by-one for any non-UTC server). One
 * query, bucketed once, keeps both sides on one clock.
 */
const loadMonth = async (customerId) => {
  const monthStart = startOfMonth();

  const rows = await db
    .select({
      createdAt: orders.createdAt,
      quantity: orders.quantity,
      amount: sql`${orders.totalAmount}`.mapWith(Number),
      status: orders.status,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), gte(orders.createdAt, monthStart)));

  const month = { orders: 0, litres: 0, spent: 0 };
  const spentByDay = new Map();
  for (const r of rows) {
    if (r.status !== "Cancelled" && r.status !== "Expired") {
      month.orders += 1;
      month.litres += Number(r.quantity);
    }
    if (r.paymentStatus === "Paid") {
      month.spent += r.amount;
      const key = toISODate(new Date(r.createdAt));
      spentByDay.set(key, (spentByDay.get(key) ?? 0) + r.amount);
    }
  }

  // Densify: the sparkline wants one point per day, including the zero days.
  const trend = [];
  const today = new Date();
  for (let d = new Date(monthStart); d <= today; d.setDate(d.getDate() + 1)) {
    const key = toISODate(d);
    trend.push({ date: key, spent: spentByDay.get(key) ?? 0 });
  }

  return { month, trend };
};

/**
 * @param {{id: number, balance?: string, deposit?: string}} customer
 *        The authenticated customer row (req.customer) — already carries the
 *        wallet columns publicCustomer hides.
 */
const getDashboard = async (customer) => {
  const [{ month, trend }, recent] = await Promise.all([
    loadMonth(customer.id),
    orderRepo.findAll({ customer: customer.id, page: 1, limit: RECENT_LIMIT }),
  ]);

  // Same expiresAt enrichment the order list/detail endpoints attach — the
  // portal hero needs the payment deadline to show "valid till …" (without it
  // the frontend used to mislabel unpaid invoices as price-expired).
  return {
    wallet: {
      balance: Number(customer.balance || 0),
      deposit: Number(customer.deposit || 0),
    },
    month,
    trend,
    orders: await withExpiresAt(recent.orders),
  };
};

module.exports = { getDashboard, loadMonth };
