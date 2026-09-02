const { and, eq, inArray, notInArray, count } = require("drizzle-orm");
const { db } = require("../config/db");
const { orders, orderTrucks, pfiExpenses } = require("../db/schema");
const { scopeCondition } = require("../lib/scopeFilter");

/**
 * How much work is waiting, per desk.
 *
 * One query set feeding two things: the number badges in the sidebar, and the
 * "what is waiting on me" landing page. They are the same question asked twice,
 * so they are answered once — a badge that disagrees with the page it links to
 * is worse than no badge.
 *
 * Every queue is keyed by the NAV PATH it belongs to. The sidebar is then a
 * dumb lookup (`counts[item.path]`) and adding a queue is a change in one
 * place rather than a change here plus a mapping table over there.
 *
 * Scoped the same way every other list is: a user assigned to two depots
 * counts those two depots' work, not the company's. See lib/scopeFilter.
 * Without that the badge would promise a queue the page then shows as empty.
 */

/**
 * Build a WHERE from conditions, dropping the empty ones.
 *
 * `scopeCondition` returns NULL for a full-access user, and Drizzle's `and()`
 * strips `undefined` but NOT `null` — a null is bound as a parameter, so
 * `and(a, b, null)` compiles to `a AND b AND $3` with $3 = NULL, and the whole
 * predicate evaluates to NULL. Every count silently came back 0.
 *
 * The rest of this codebase avoids it by pushing into a conditions array and
 * only pushing the scope `if (scope)`. This is that, as a one-liner.
 */
const where = (...conditions) => and(...conditions.filter(Boolean));

/** Orders that have taken money and are on their way — not finished, not dead. */
const AWAITING_TICKETING = ["Paid", "Released"];
/** Order lifecycle states where a payment can still be confirmed. */
const PAYABLE_STATUSES = ["Pending", "Paid", "Released", "Loading"];
/** An order whose trucks the gate should still expect to see. */
const GATE_LIVE_STATUSES = ["Released", "Loading"];
/** An order that is over — its trucks are history, not a queue. */
const ORDER_DEAD_STATUSES = ["Cancelled", "Expired"];

/**
 * The queues, declared once.
 *
 * `label` is what the landing page calls it — deliberately a sentence about
 * work ("Orders awaiting payment"), not a page name, because the page's job is
 * to tell somebody what to do next.
 *
 * `emptyLabel` is what it says when the count is zero, and it is not "0 orders
 * awaiting payment" — an empty queue is good news and should read as such.
 */
const QUEUES = [
  {
    key: "payableOrders",
    path: "/payable-orders",
    label: "Orders awaiting payment",
    emptyLabel: "No orders waiting on payment",
    action: "Confirm against the bank statement",
    count: (user) =>
      db
        .select({ n: count() })
        .from(orders)
        .where(
          where(
            inArray(orders.paymentStatus, ["Unpaid", "Part Paid"]),
            inArray(orders.status, PAYABLE_STATUSES),
            scopeCondition(user, { depotColumn: orders.depotId, pfiColumn: orders.pfiId }),
          ),
        ),
  },
  {
    key: "awaitingTicketing",
    path: "/ticket",
    label: "Orders awaiting loading tickets",
    emptyLabel: "Every paid order has been ticketed",
    action: "Generate tickets for the loading desk",
    count: (user) =>
      db
        .select({ n: count() })
        .from(orders)
        .where(
          where(
            inArray(orders.status, AWAITING_TICKETING),
            scopeCondition(user, { depotColumn: orders.depotId, pfiColumn: orders.pfiId }),
          ),
        ),
  },
  {
    key: "awaitingGateIn",
    path: "/security/entry",
    label: "Trucks expected at the gate",
    emptyLabel: "No trucks expected at the gate",
    action: "Gate them in as they arrive",
    /**
     * Only trucks on a LIVE order. 5,236 truck rows sit at 'pending' against
     * orders that were cancelled, expired or long since completed — they are
     * never coming, and counting them would put a permanent four-figure badge
     * on a page whose real queue is a couple of hundred.
     */
    count: (user) =>
      db
        .select({ n: count() })
        .from(orderTrucks)
        .innerJoin(orders, eq(orders.id, orderTrucks.orderId))
        .where(
          where(
            eq(orderTrucks.status, "pending"),
            inArray(orders.status, GATE_LIVE_STATUSES),
            scopeCondition(user, { depotColumn: orders.depotId, pfiColumn: orders.pfiId }),
          ),
        ),
  },
  {
    key: "awaitingGateOut",
    path: "/security/exit",
    label: "Trucks on the yard",
    emptyLabel: "The yard is clear",
    action: "Clear them out once loaded",
    // Gated in or loaded: physically inside, and somebody has to let them
    // out. Excludes dead orders only — a truck on the yard is on the yard
    // whatever happened to the paperwork behind it.
    count: (user) =>
      db
        .select({ n: count() })
        .from(orderTrucks)
        .innerJoin(orders, eq(orders.id, orderTrucks.orderId))
        .where(
          where(
            inArray(orderTrucks.status, ["gated_in", "loaded"]),
            notInArray(orders.status, ORDER_DEAD_STATUSES),
            scopeCondition(user, { depotColumn: orders.depotId, pfiColumn: orders.pfiId }),
          ),
        ),
  },
  {
    key: "pendingExpenses",
    path: "/expenses",
    label: "Expenses awaiting approval",
    emptyLabel: "No expenses waiting on a decision",
    action: "Review and approve or decline",
    /**
     * Final approval genuinely rests with admin and super admin — nobody else
     * can clear this queue. It is therefore the one queue that is personally
     * theirs, and the landing page words it that way for them while wording
     * every other queue as something the business is waiting on rather than
     * something they are personally holding up.
     */
    approverRoles: [0, 1],
    count: (user) =>
      db
        .select({ n: count() })
        .from(pfiExpenses)
        .where(
          where(
            eq(pfiExpenses.status, "pending"),
            scopeCondition(user, { pfiColumn: pfiExpenses.pfiId }),
          ),
        ),
  },
];

/**
 * Every queue's depth for this user.
 *
 * Runs the counts concurrently — three cheap COUNTs, and the sidebar asks for
 * them on every page load, so serialising them would put three round trips in
 * front of the nav rendering.
 *
 * A failing queue yields 0 rather than taking the whole response down with it:
 * this feeds decoration and a landing page, and a badge that cannot be
 * computed is a badge that should not appear, not a 500 on every screen.
 */
const getWorkQueues = async (user) => {
  const results = await Promise.all(
    QUEUES.map(async (q) => {
      try {
        const [row] = await q.count(user);
        return { ...q, n: Number(row?.n ?? 0) };
      } catch (err) {
        console.error(`[work-queues] ${q.key} failed:`, err.message);
        return { ...q, n: 0, failed: true };
      }
    }),
  );

  /** Keyed by nav path, for the sidebar's lookup. Zero counts are omitted. */
  const counts = {};
  for (const q of results) {
    if (q.n > 0) counts[q.path] = q.n;
  }

  return {
    counts,
    queues: results.map(({ key, path, label, emptyLabel, action, approverRoles, n, failed }) => ({
      key,
      path,
      label,
      emptyLabel,
      action,
      /** Roles that personally clear this queue; absent where nobody owns it. */
      approverRoles: approverRoles ?? null,
      count: n,
      failed: Boolean(failed),
    })),
  };
};

module.exports = { getWorkQueues, QUEUES };
