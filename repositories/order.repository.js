const { eq, and, or, ilike, inArray, desc, asc, count, sql, gte, lte } = require("drizzle-orm");
const { db } = require("../config/db");
const {
  orders, customers, depots, products, pfis, orderTrucks,
  deposits, orderDepositAllocations, staff, walletHolds,
} = require("../db/schema");
const { generateOrderReference, parseOrderReference } = require("../utils/helpers");
const { scopeCondition } = require("../lib/scopeFilter");

const formatOrderRow = (row) => {
  if (!row) return null;
  const company = row.companyName || row.customerCompanyName || "";
  const ref = generateOrderReference(company, row.id);
  return {
    ...row,
    orderNumber: ref,
    reference: ref,
  };
};

const findById = async (id, tx = db) => {
  const [row] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
  return formatOrderRow(row);
};

/**
 * Row-lock an order for the caller's transaction. The gate flow uses this to
 * serialise concurrent truck actions on one order: two trucks gating in (or
 * out) at the same moment each take this lock in turn, so exactly one observes
 * the "first in" / "last out" edge and drives the Released→Loading / Loading→
 * Completed transition — the other sees the already-moved status and skips it.
 */
const lockById = async (id, tx = db) => {
  const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for("update").limit(1);
  return formatOrderRow(row);
};

/**
 * The idempotent-replay lookup: a caller retrying with the same key (e.g. a
 * redelivered WhatsApp webhook re-running CONFIRM) finds the order the first
 * attempt created.
 */
const findByIdempotencyKey = async (idempotencyKey, tx = db) => {
  const [row] = await tx
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);
  return formatOrderRow(row);
};

const findByNumber = async (orderNumber) => {
  const normalized = String(orderNumber || "").trim().toUpperCase();
  if (!normalized) return null;

  // Resolves "SO600" and the legacy "SO/600" alike — see parseOrderReference.
  const possibleId = parseOrderReference(normalized);

  let row = null;
  if (possibleId) {
    [row] = await db.select().from(orders).where(eq(orders.id, possibleId)).limit(1);
  }
  if (!row) {
    [row] = await db.select().from(orders).where(eq(orders.orderNumber, normalized)).limit(1);
  }
  return formatOrderRow(row);
};

// The joined columns a full order detail carries. Includes the per-stage
// lifecycle timestamps and cancellation reason so callers can render the
// order's own timeline without the public tracking endpoint — those columns
// (order.js) are the source of truth for tracking, reused here behind auth.
const FULL_ORDER_COLUMNS = {
  id: orders.id,
  orderNumber: orders.orderNumber,
  customerId: orders.customerId,
  state: orders.state,
  depotId: orders.depotId,
  productId: orders.productId,
  quantity: orders.quantity,
  price: orders.price,
  totalAmount: orders.totalAmount,
  deliveryType: orders.deliveryType,
  deliveryAddress: orders.deliveryAddress,
  companyName: orders.companyName,
  pfiId: orders.pfiId,
  virtualAccountNumber: orders.virtualAccountNumber,
  virtualAccountBank: orders.virtualAccountBank,
  virtualAccountName: orders.virtualAccountName,
  paymentStatus: orders.paymentStatus,
  status: orders.status,
  // Per-stage lifecycle stamps — one timestamp per stage, reached at most once.
  paymentConfirmedAt: orders.paymentConfirmedAt,
  releasedAt: orders.releasedAt,
  loadingStartedAt: orders.loadingStartedAt,
  completedAt: orders.completedAt,
  cancelledAt: orders.cancelledAt,
  cancellationReason: orders.cancellationReason,
  expiredAt: orders.expiredAt,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
  // Customer fields
  customerName: customers.name,
  customerEmail: customers.email,
  customerPhone: customers.phone,
  customerCompanyName: customers.companyName,
  customerBalance: customers.balance,
  customerVirtualAccountName: customers.virtualAccountName,
  // Depot fields
  depotName: depots.name,
  depotCode: depots.code,
  depotAddress: depots.address,
  // Product fields
  productName: products.name,
  productSku: products.sku,
  productUnit: products.unit,
  productCategory: products.category,
  // PFI fields
  pfiNumber: pfis.pfiNumber,
};

const fullOrderQuery = (tx = db) =>
  tx
    .select(FULL_ORDER_COLUMNS)
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(depots, eq(orders.depotId, depots.id))
    .leftJoin(products, eq(orders.productId, products.id))
    .leftJoin(pfis, eq(orders.pfiId, pfis.id));

const findByIdFull = async (id, tx = db) => {
  const [row] = await fullOrderQuery(tx).where(eq(orders.id, id)).limit(1);
  return formatOrderRow(row);
};

/**
 * The same full detail keyed by order number rather than numeric id. Serves
 * the customer portal's by-reference lookup: the reference (order number) is
 * the id every screen and SMS shows, so the customer can open an order by the
 * value they hold without first resolving it to a database id. Normalised the
 * same way tracking does — trimmed and upper-cased.
 */
const findByNumberFull = async (orderNumber, tx = db) => {
  const normalized = String(orderNumber || "").trim().toUpperCase();
  if (!normalized) return null;

  const possibleId = parseOrderReference(normalized);

  let row = null;
  if (possibleId) {
    [row] = await fullOrderQuery(tx).where(eq(orders.id, possibleId)).limit(1);
  }
  if (!row) {
    [row] = await fullOrderQuery(tx)
      .where(eq(orders.orderNumber, normalized))
      .limit(1);
  }
  return formatOrderRow(row);
};

/**
 * The truck loads on an order, oldest ordinal first. Carries the plate, the
 * per-load quantity, movement status and gate stamps, plus driver contact —
 * safe here because this is the order owner's own view behind auth (unlike the
 * public tracking feed, which withholds driver details).
 */
const findTrucksByOrderId = async (orderId, tx = db) => {
  return tx
    .select({
      truckIndex: orderTrucks.truckIndex,
      truckNumber: orderTrucks.truckNumber,
      quantity: orderTrucks.quantity,
      status: orderTrucks.status,
      driverName: orderTrucks.driverName,
      driverPhone: orderTrucks.driverPhone,
      securityEnteredAt: orderTrucks.securityEnteredAt,
      loadedAt: orderTrucks.loadedAt,
      securityExitedAt: orderTrucks.securityExitedAt,
    })
    .from(orderTrucks)
    .where(eq(orderTrucks.orderId, orderId))
    .orderBy(asc(orderTrucks.truckIndex));
};

const findAll = async ({
  search,
  status,
  customer,
  depot,
  dateFrom,
  dateTo,
  /** Same rule findPayableOrders uses — see the condition below. */
  payable,
  /** The authenticated caller, for location/PFI scoping. Omitted = unfiltered (internal callers). */
  scopeUser,
  page = 1,
  limit = 50,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  const scope = scopeCondition(scopeUser, { depotColumn: orders.depotId, pfiColumn: orders.pfiId });
  if (scope) conditions.push(scope);

  if (search) {
    // A reference-shaped search ("SO600", or the legacy "SO/600") also matches
    // on id, since the reference is computed and not a column to search.
    const possibleId = parseOrderReference(search);
    if (possibleId) {
      conditions.push(or(ilike(orders.orderNumber, `%${search}%`), eq(orders.id, possibleId)));
    } else {
      conditions.push(ilike(orders.orderNumber, `%${search}%`));
    }
  }

  if (status) {
    conditions.push(eq(orders.status, status));
  }

  if (customer) {
    conditions.push(eq(orders.customerId, Number(customer)));
  }

  if (depot) {
    conditions.push(eq(orders.depotId, Number(depot)));
  }

  if (dateFrom) {
    conditions.push(gte(orders.createdAt, new Date(dateFrom)));
  }

  // "Payable" is not a status — it is an unpaid pending order whose customer
  // already holds enough wallet balance to cover it. Expressed here so the
  // main list can show them alongside everything else rather than needing a
  // separate page.
  if (payable === true || payable === "true" || payable === "1") {
    conditions.push(eq(orders.paymentStatus, "Unpaid"));
    conditions.push(eq(orders.status, "Pending"));
    // A correlated subquery rather than customers.balance directly: the
    // count query alongside this one selects from orders with no join, so a
    // bare column reference breaks it.
    conditions.push(
      sql`${orders.totalAmount} <= (SELECT c.balance FROM customers c WHERE c.id = ${orders.customerId})`
    );
  }

  if (dateTo) {
    // Inclusive of the whole day: a bare "2026-08-06" parses as that date's
    // UTC midnight, so comparing createdAt against it as-is excluded every
    // order placed later that same day — a caller asking for "today" got
    // nothing. Built as an explicit UTC string, same as dateFrom above, so
    // the two boundaries don't drift against each other by the server's
    // local timezone.
    const end = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? `${dateTo}T23:59:59.999Z` : dateTo;
    conditions.push(lte(orders.createdAt, new Date(end)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        state: orders.state,
        depotId: orders.depotId,
        productId: orders.productId,
        quantity: orders.quantity,
        price: orders.price,
        totalAmount: orders.totalAmount,
        deliveryType: orders.deliveryType,
        deliveryAddress: orders.deliveryAddress,
        companyName: orders.companyName,
        pfiId: orders.pfiId,
        virtualAccountNumber: orders.virtualAccountNumber,
        virtualAccountBank: orders.virtualAccountBank,
        virtualAccountName: orders.virtualAccountName,
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        expiredAt: orders.expiredAt,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        customerName: customers.name,
        customerCompanyName: customers.companyName,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerBalance: customers.balance,
        depotName: depots.name,
        depotCode: depots.code,
        productName: products.name,
        productSku: products.sku,
        productCategory: products.category,
        productUnit: products.unit,
        pfiNumber: pfis.pfiNumber,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(depots, eq(orders.depotId, depots.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .leftJoin(pfis, eq(orders.pfiId, pfis.id))
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limitNum)
      .offset(offset),
    db
      .select({ total: count() })
      .from(orders)
      .where(whereClause),
  ]);

  return {
    orders: rows.map(formatOrderRow),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * Every confirmed payment, order by order, with exactly where the money for
 * each one is understood to have come from — and, since the wallet is how
 * every order is actually paid for, the customer's wallet balance immediately
 * before and after that payment was taken.
 *
 * Unbounded and newest-first by design: this report is read a day at a time
 * (see the default date filter the frontend applies), so there is no
 * pagination to reconcile against the stat cards — one filtered set, fetched
 * whole, drives both.
 *
 * `funding` is built from a second, batched query rather than a join on the
 * main select — a LEFT JOIN against order_deposit_allocations would multiply
 * order rows by however many deposits funded them. An order with zero funding
 * rows genuinely predates the allocation ledger (see wallet.service.js) —
 * that's surfaced as fundingTracked: false, not an error.
 */
/**
 * Where a wallet-funded order's money came from, when the allocation ledger
 * has nothing to say.
 *
 * An order paid out of wallet balance writes a wallet_holds row and no
 * order_deposit_allocations row, so the finance report had no payment source
 * for it at all — the dialog fell through to "paid before detailed payment
 * tracking began" on orders raised last week, and the table and the export
 * printed empty depositor and reference columns.
 *
 * The money is recoverable, just one hop further back: the credits sitting in
 * the wallet when the hold was placed. This walks them newest-first until the
 * hold is covered, which is what the wallet ledger itself did — deposit 4558,
 * the one case in the data, is marked remaining_amount = 0 by exactly that
 * consumption.
 *
 * ── Why every line is flagged `traced` ────────────────────────────────────
 *
 * None of this is a recorded link. An allocation row says "this deposit paid
 * this order" as a fact; this says "these are the credits that must have
 * covered it, by amount and date". The two must never look alike on screen,
 * so the flag rides along with the data and the views mark it.
 *
 * ── The transfer hop ──────────────────────────────────────────────────────
 *
 * A wallet credit can itself be an internal transfer ("Wallet transfer from
 * customer #1533"), which has no statement line of its own because no bank
 * payment happened — the bank detail is on the SOURCE customer's credits.
 * Those are pulled in too, but only when they sum to the transfer amount
 * exactly. An inexact set is a guess, so it is dropped and the trail stops at
 * the source customer's name, which is recorded fact.
 */
const traceWalletSources = async (rows, walletRows, fundingByOrder) => {
  const byOrder = new Map();

  // Only orders the allocation ledger has nothing for: where it does, that is
  // the answer and this must not compete with it.
  const holds = walletRows.filter((w) => !(fundingByOrder.get(w.orderId) || []).length);
  if (!holds.length) return byOrder;

  const customerByOrder = new Map(rows.map((r) => [r.id, r.customerId]));
  const customerIds = [...new Set(holds.map((w) => customerByOrder.get(w.orderId)).filter(Boolean))];
  if (!customerIds.length) return byOrder;

  /** Every credit on these wallets, newest first, with its statement line. */
  const creditsFor = async (ids) => {
    if (!ids.length) return [];
    const result = await db.execute(sql`
      SELECT
        d.id AS "depositId",
        d.customer_id AS "customerId",
        d.amount,
        d.created_at AS "createdAt",
        d.description,
        d.reference,
        l.depositor AS "statementDepositor",
        l.narration AS "statementNarration",
        l.txn_date AS "statementTxnDate"
      FROM deposits d
      LEFT JOIN LATERAL (
        SELECT depositor, narration, txn_date
        FROM bank_statement_lines
        WHERE matched_deposit_id = d.id
        ORDER BY id LIMIT 1
      ) l ON TRUE
      WHERE d.type = 'credit'
        AND d.customer_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      ORDER BY d.created_at DESC, d.id DESC
    `);
    return result.rows ?? result;
  };

  const credits = await creditsFor(customerIds);
  const creditsByCustomer = new Map();
  for (const c of credits) {
    if (!creditsByCustomer.has(c.customerId)) creditsByCustomer.set(c.customerId, []);
    creditsByCustomer.get(c.customerId).push(c);
  }

  /** Newest first until `target` is covered; `[]` if the wallet cannot cover it. */
  const cover = (list, target, exact = false) => {
    const taken = [];
    let running = 0;
    for (const c of list) {
      taken.push(c);
      running += Number(c.amount || 0);
      // Fractions of a naira are rounding noise from decimal columns, not a
      // real shortfall.
      if (running >= target - 0.01) return exact && running > target + 0.01 ? [] : taken;
    }
    return [];
  };

  // ── Second hop: the source wallets behind any internal transfer ──────────
  const TRANSFER = /wallet transfer from customer #(\d+)/i;
  const picked = new Map();
  const sourceIds = new Set();

  for (const hold of holds) {
    const customerId = customerByOrder.get(hold.orderId);
    const list = creditsByCustomer.get(customerId) || [];
    // Only what was already in the wallet when the hold was placed.
    const available = list.filter((c) => new Date(c.createdAt) <= new Date(hold.createdAt ?? Date.now()));
    const chosen = cover(available.length ? available : list, Number(hold.holdAmount || 0));
    picked.set(hold.orderId, chosen);
    for (const c of chosen) {
      const match = TRANSFER.exec(c.description || "");
      if (match) sourceIds.add(Number(match[1]));
    }
  }

  const sourceCredits = await creditsFor([...sourceIds]);
  const sourceByCustomer = new Map();
  for (const c of sourceCredits) {
    if (!sourceByCustomer.has(c.customerId)) sourceByCustomer.set(c.customerId, []);
    sourceByCustomer.get(c.customerId).push(c);
  }

  const sourceNames = sourceIds.size
    ? await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, [...sourceIds]))
    : [];
  const nameById = new Map(sourceNames.map((c) => [c.id, c.name]));

  for (const hold of holds) {
    const chosen = picked.get(hold.orderId) || [];
    if (!chosen.length) continue;

    byOrder.set(
      hold.orderId,
      chosen.map((c) => {
        const match = TRANSFER.exec(c.description || "");
        const fromId = match ? Number(match[1]) : null;
        // Exact, or not at all — see the note above.
        const behind = fromId
          ? cover(sourceByCustomer.get(fromId) || [], Number(c.amount || 0), true)
          : [];

        return {
          depositId: c.depositId,
          amount: Number(c.amount || 0),
          createdAt: c.createdAt,
          description: c.description || "",
          reference: c.reference || "",
          statementDepositor: c.statementDepositor || "",
          statementNarration: c.statementNarration || "",
          statementTxnDate: c.statementTxnDate || null,
          transferFromCustomerId: fromId,
          transferFromCustomerName: fromId ? nameById.get(fromId) || "" : "",
          // The bank credits behind an internal transfer, when they reconcile.
          statementSources: behind.map((b) => ({
            depositId: b.depositId,
            amount: Number(b.amount || 0),
            depositor: b.statementDepositor || "",
            narration: b.statementNarration || "",
            txnDate: b.statementTxnDate || b.createdAt,
            reference: b.reference || "",
          })),
          reconciled: behind.length > 0,
        };
      }),
    );
  }

  return byOrder;
};

const findFinanceReport = async ({
  search,
  paymentStatus = "Paid",
  dateFrom,
  dateTo,
  depotId,
  pfiId,
  productId,
  scopeUser,
} = {}) => {
  const conditions = [];
  const scope = scopeCondition(scopeUser, { depotColumn: orders.depotId, pfiColumn: orders.pfiId });
  if (scope) conditions.push(scope);
  if (paymentStatus && paymentStatus !== "all") {
    conditions.push(eq(orders.paymentStatus, paymentStatus));
  }
  if (depotId) conditions.push(eq(orders.depotId, Number(depotId)));
  if (pfiId) conditions.push(eq(orders.pfiId, Number(pfiId)));
  if (productId) conditions.push(eq(orders.productId, Number(productId)));
  if (search) {
    const possibleId = parseOrderReference(search);
    const term = `%${search}%`;
    // Reference, customer, company (either side — an order can carry its
    // own companyName distinct from the customer's), location, PFI, and the
    // payment reference on whichever deposit(s) actually funded this order
    // — the same field the finance report's own funding sub-rows show, so a
    // teller reference typed here finds the order it paid for.
    const textMatch = or(
      ilike(orders.orderNumber, term),
      ilike(customers.name, term),
      ilike(customers.phone, term),
      ilike(orders.companyName, term),
      ilike(customers.companyName, term),
      ilike(depots.name, term),
      ilike(pfis.pfiNumber, term),
      sql`EXISTS (
        SELECT 1 FROM order_deposit_allocations oda
        JOIN deposits d ON d.id = oda.deposit_id
        WHERE oda.order_id = ${orders.id} AND d.reference ILIKE ${term}
      )`,
    );
    conditions.push(possibleId ? or(eq(orders.id, possibleId), textMatch) : textMatch);
  }
  // A bare "2026-08-20" from a date input parses as that day's UTC midnight —
  // compared as-is, dateTo would exclude every order confirmed later that
  // same day. Widened to the last instant of the day so "today" means today.
  if (dateFrom) {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? `${dateFrom}T00:00:00.000Z` : dateFrom;
    conditions.push(gte(orders.paymentConfirmedAt, new Date(start)));
  }
  if (dateTo) {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? `${dateTo}T23:59:59.999Z` : dateTo;
    conditions.push(lte(orders.paymentConfirmedAt, new Date(end)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const columns = {
    ...FULL_ORDER_COLUMNS,
    customerVirtualAccountNumber: customers.virtualAccountNumber,
    customerVirtualAccountBank: customers.virtualAccountBank,
    pfiLocationName: pfis.locationName,
  };

  const [rows, [{ total, totalAmount, totalQuantity }], [{ trackedCount }]] = await Promise.all([
    db
      .select(columns)
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(depots, eq(orders.depotId, depots.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .leftJoin(pfis, eq(orders.pfiId, pfis.id))
      .where(whereClause)
      // Newest first, by when the money was actually confirmed. COALESCE'd to
      // the order date so an unpaid order (null paymentConfirmedAt, included
      // when the status filter is Unpaid/All) sorts by its own date instead
      // of being dumped at the very top — Postgres sorts NULLs first on DESC.
      .orderBy(
        desc(sql`COALESCE(${orders.paymentConfirmedAt}, ${orders.createdAt})`),
        desc(orders.id),
      ),
    // Over the same filtered set as the rows above, so the stat cards can
    // never disagree with what a filter/search actually shows. Joined the
    // same way as the rows query — the search condition above can reference
    // depots/pfis columns, so every query sharing whereClause needs them in
    // scope too, or a search hits a missing-FROM-clause error.
    db
      .select({
        total: count(),
        totalAmount: sql`COALESCE(SUM(${orders.totalAmount}), 0)`,
        totalQuantity: sql`COALESCE(SUM(${orders.quantity}), 0)`,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(depots, eq(orders.depotId, depots.id))
      .leftJoin(pfis, eq(orders.pfiId, pfis.id))
      .where(whereClause),
    db
      .select({ trackedCount: sql`COUNT(DISTINCT ${orders.id})` })
      .from(orders)
      .innerJoin(orderDepositAllocations, eq(orders.id, orderDepositAllocations.orderId))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(depots, eq(orders.depotId, depots.id))
      .leftJoin(pfis, eq(orders.pfiId, pfis.id))
      .where(whereClause),
  ]);

  const orderIds = rows.map((r) => r.id);

  const [funding, walletRows] = await Promise.all([
    orderIds.length
      ? db
          .select({
            orderId: orderDepositAllocations.orderId,
            depositId: orderDepositAllocations.depositId,
            amount: orderDepositAllocations.amount,
            depositReference: deposits.reference,
            depositCreatedAt: deposits.createdAt,
            // What actually landed, as distinct from `amount` above — which
            // is only the slice of this deposit that FIFO attributed to this
            // order. Where a payment covered more than one order, or a
            // surplus went to the wallet, the two differ, and the report
            // wants the real figure so the differential against sales value
            // is visible rather than pre-netted away.
            depositAmount: deposits.amount,
            paystackDetails: deposits.paystackDetails,
            recorderFirstName: staff.firstName,
            recorderSurname: staff.surname,
            // Who paid and when, taken from the bank statement line itself
            // rather than the deposit's paystackDetails JSON. The JSON only
            // started carrying senderName/paidAt recently, so 2,351 of the
            // 2,434 statement-backed deposits have neither — while the line
            // they were matched from has had the depositor and txn date all
            // along. Reading the line makes every historical match show its
            // payer and date, with no backfill of the JSON needed.
            statementDepositor: sql`(
              SELECT l.depositor FROM bank_statement_lines l
              WHERE l.matched_deposit_id = ${deposits.id}
              ORDER BY l.id LIMIT 1
            )`,
            statementTxnDate: sql`(
              SELECT l.txn_date FROM bank_statement_lines l
              WHERE l.matched_deposit_id = ${deposits.id}
              ORDER BY l.id LIMIT 1
            )`,
            // Internal wallet movements — a transfer between customers, or an
            // overpayment carried over from another order — have no statement
            // line and no reference, because no bank payment happened. Their
            // source lives only in the description ("Wallet transfer from
            // customer #1533"), so it goes out with the row and the customer
            // id in it is resolved to a name here rather than leaving the
            // report showing a bare dash for where the money came from.
            depositDescription: deposits.description,
            transferFromCustomerName: sql`(
              SELECT c.name FROM customers c
              WHERE c.id = NULLIF(substring(${deposits.description} from 'customer #([0-9]+)'), '')::int
            )`,
          })
          .from(orderDepositAllocations)
          .innerJoin(deposits, eq(orderDepositAllocations.depositId, deposits.id))
          .leftJoin(staff, eq(deposits.recordedBy, staff.id))
          .where(inArray(orderDepositAllocations.orderId, orderIds))
          .orderBy(asc(orderDepositAllocations.createdAt))
      : [],
    // The wallet hold placed for each order — this is the payment, since a
    // wallet-funded order is only ever placed once placeHold() has already
    // taken the money. Its own balanceAfter is only booked once the hold
    // *converts* (order fully completed, see order.controller.js), which
    // most just-paid orders haven't reached yet — so instead of reading a
    // number that mostly isn't there, this replays the customer's own
    // ledger up to the instant the hold was placed:
    //
    //   balance(t) = credits(t) - debits(t) - holds still active at t
    //
    // A debit deposit row only exists once its hold has converted, and an
    // active-hold row only counts while unresolved as of t — so a hold that
    // converted before t is counted exactly once, via the debit sum, and one
    // still open at t is counted exactly once, via the active-holds sum.
    // `t` is this hold's own createdAt, so the sum already includes its own
    // −amount effect; adding the hold amount back recovers the balance the
    // instant before it was placed.
    orderIds.length
      ? db.execute(sql`
          SELECT
            wh.order_id AS "orderId",
            wh.amount AS "holdAmount",
            wh.status AS "holdStatus",
            -- The instant the money was taken: the wallet source trace only
            -- counts credits that were already in the wallet by then.
            wh.created_at AS "createdAt",
            (
              COALESCE((
                SELECT SUM(d.amount) FROM deposits d
                WHERE d.customer_id = wh.customer_id AND d.type = 'credit' AND d.created_at <= wh.created_at
              ), 0)
              - COALESCE((
                SELECT SUM(d.amount) FROM deposits d
                WHERE d.customer_id = wh.customer_id AND d.type = 'debit' AND d.created_at <= wh.created_at
              ), 0)
              - COALESCE((
                SELECT SUM(wh2.amount) FROM wallet_holds wh2
                WHERE wh2.customer_id = wh.customer_id AND wh2.created_at <= wh.created_at
                  AND (wh2.resolved_at IS NULL OR wh2.resolved_at > wh.created_at)
              ), 0)
            ) AS "balanceAfter"
          FROM wallet_holds wh
          WHERE wh.order_id IN (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})
        `)
      : [],
  ]);

  const fundingByOrder = new Map();
  for (const f of funding) {
    if (!fundingByOrder.has(f.orderId)) fundingByOrder.set(f.orderId, []);
    fundingByOrder.get(f.orderId).push(f);
  }
  const walletByOrder = new Map(walletRows.map((w) => [w.orderId, w]));

  const walletSourceByOrder = await traceWalletSources(rows, walletRows, fundingByOrder);

  const decorated = rows.map((row) => {
    const orderFunding = fundingByOrder.get(row.id) || [];
    const allocated = orderFunding.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const fundingTracked = orderFunding.length > 0;

    const wallet = walletByOrder.get(row.id);
    const walletBalanceAfter = wallet?.balanceAfter != null ? Number(wallet.balanceAfter) : null;
    const walletBalanceBefore =
      walletBalanceAfter != null && wallet?.holdAmount != null
        ? walletBalanceAfter + Number(wallet.holdAmount)
        : null;

    // Where the wallet money came from, for orders the allocation ledger has
    // nothing for. Every line is inferred, never a recorded link — see
    // traceWalletSources — so it travels under its own name rather than being
    // mixed into `funding`, which the views present as fact.
    const walletSource = walletSourceByOrder.get(row.id) || [];

    return {
      ...row,
      funding: orderFunding,
      fundingTracked,
      walletSource,
      /** A hold exists, so this was paid from wallet balance, tracked or not. */
      walletFunded: wallet != null,
      unattributedAmount: fundingTracked ? Math.max(0, Number(row.totalAmount || 0) - allocated) : 0,
      walletBalanceBefore,
      walletBalanceAfter,
    };
  });

  return {
    orders: decorated.map(formatOrderRow),
    totals: {
      count: total,
      totalAmount: Number(totalAmount),
      totalQuantity: Number(totalQuantity),
      trackedCount: Number(trackedCount),
      notTrackedCount: total - Number(trackedCount),
    },
  };
};

const create = async (data, tx = db) => {
  const [row] = await tx.insert(orders).values(data).returning();
  return formatOrderRow(row);
};

const update = async (id, data, tx = db) => {
  const [row] = await tx
    .update(orders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();
  return formatOrderRow(row);
};

const findUnpaidByCustomer = async (customerId) => {
  // Pending only: a cancelled order must never be auto-paid, and a completed
  // one can't legally be unpaid.
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.customerId, customerId),
        eq(orders.paymentStatus, "Unpaid"),
        eq(orders.status, "Pending")
      )
    )
    .orderBy(asc(orders.createdAt));
  return rows.map(formatOrderRow);
};

// Everything before Completed/Cancelled — what a customer can still track.
const OPEN_STATUSES = ["Pending", "Paid", "Released", "Loading"];

/**
 * The customer's in-flight orders with the display names joined in, newest
 * first. Capped for the WhatsApp list (9 rows + reserve); the portal is the
 * home of unbounded history.
 */
const findOpenByCustomer = async (customerId, limit = 9) => {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      companyName: orders.companyName,
      customerCompanyName: customers.companyName,
      status: orders.status,
      quantity: orders.quantity,
      totalAmount: orders.totalAmount,
      deliveryType: orders.deliveryType,
      virtualAccountBank: orders.virtualAccountBank,
      virtualAccountNumber: orders.virtualAccountNumber,
      productName: products.name,
      depotName: depots.name,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(depots, eq(orders.depotId, depots.id))
    .leftJoin(products, eq(orders.productId, products.id))
    .where(and(eq(orders.customerId, customerId), inArray(orders.status, OPEN_STATUSES)))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  return rows.map(formatOrderRow);
};

const countByPfi = async (pfiId) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(orders)
    .where(eq(orders.pfiId, pfiId));
  return total;
};

const findPayableOrders = async (scopeUser) => {
  const conditions = [
    eq(orders.paymentStatus, "Unpaid"),
    eq(orders.status, "Pending"),
    sql`${customers.balance} >= ${orders.totalAmount}`,
  ];
  const scope = scopeCondition(scopeUser, { depotColumn: orders.depotId, pfiColumn: orders.pfiId });
  if (scope) conditions.push(scope);

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerId: orders.customerId,
      customerName: customers.name,
      companyName: orders.companyName,
      customerCompanyName: customers.companyName,
      customerBalance: customers.balance,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      quantity: orders.quantity,
      totalAmount: orders.totalAmount,
      deliveryType: orders.deliveryType,
      createdAt: orders.createdAt,
      depotName: depots.name,
      productName: products.name,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(depots, eq(orders.depotId, depots.id))
    .leftJoin(products, eq(orders.productId, products.id))
    .where(and(...conditions))
    .orderBy(asc(orders.createdAt));
  return rows.map(formatOrderRow);
};

/**
 * Pending, unpaid orders created on or before `cutoff` — the expiry sweep's
 * work list. Oldest first, so the log reads in the order they lapsed.
 */
const findStalePending = async (cutoff) => {
  return db
    .select({ id: orders.id, orderNumber: orders.orderNumber, createdAt: orders.createdAt })
    .from(orders)
    .where(
      and(
        eq(orders.status, "Pending"),
        eq(orders.paymentStatus, "Unpaid"),
        lte(orders.createdAt, cutoff)
      )
    )
    .orderBy(asc(orders.createdAt));
};

module.exports = {
  findById,
  lockById,
  findByNumber,
  findByIdempotencyKey,
  findByIdFull,
  findByNumberFull,
  findTrucksByOrderId,
  findAll,
  findFinanceReport,
  create,
  update,
  findUnpaidByCustomer,
  findOpenByCustomer,
  countByPfi,
  findPayableOrders,
  findStalePending,
};
