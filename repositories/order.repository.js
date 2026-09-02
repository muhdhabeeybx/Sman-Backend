const { eq, and, or, ilike, inArray, desc, asc, count, sql, gte, lte } = require("drizzle-orm");
const { db } = require("../config/db");
const {
  orders, customers, depots, products, pfis, orderTrucks,
} = require("../db/schema");
const {
  CONFIRMATION_BASIS,
  CONFIRMATION_BASIS_LABEL,
  VERIFIABLE_BASES,
  SYSTEM_DECIDED_BASES,
} = require("../db/schema/orderPayment");
const { generateOrderReference, parseOrderReference } = require("../utils/helpers");
const { scopeCondition } = require("../lib/scopeFilter");

/** The two payment sources that are a movement between orders, not money in. */
const TRANSFER_SOURCES = new Set(["transfer_in", "transfer_out"]);

/**
 * Weakest-first. An order is only as auditable as its least defensible payment,
 * so the order-level basis is the worst one on it — a ₦500m order confirmed
 * from a bank statement plus one ₦20,000 row nobody can account for is not a
 * clean order, and ranking the other way round would let the good row hide the
 * bad one.
 */
const BASIS_RANK = [
  CONFIRMATION_BASIS.UNKNOWN,
  CONFIRMATION_BASIS.NO_RECORD,
  CONFIRMATION_BASIS.AUTO_ALLOCATED,
  CONFIRMATION_BASIS.TRANSFER_AUTO,
  CONFIRMATION_BASIS.BANK_INFERRED,
  CONFIRMATION_BASIS.TRANSFER_DESK,
  CONFIRMATION_BASIS.BANK_MATCHED,
];

const weakestBasis = (rows) => {
  if (!rows.length) return null;
  let worst = null;
  let worstRank = Infinity;
  for (const r of rows) {
    const rank = BASIS_RANK.indexOf(r.confirmationBasis);
    // An unrecognised value sorts worst: a basis this code does not know how
    // to vouch for must never be presented as though it were clean.
    const effective = rank === -1 ? -1 : rank;
    if (effective < worstRank) {
      worstRank = effective;
      worst = r.confirmationBasis;
    }
  }
  return worst;
};

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
  // What has actually been received against the order, across however many
  // instalments. Equal to totalAmount on a fully-paid order; the difference is
  // the balance still expected on a part-paid one.
  amountPaid: orders.amountPaid,
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

  // "Payable" is not a status — it is an unpaid, pending order, i.e. one the
  // finance desk can still confirm a payment against. Expressed here so the
  // main list can show them alongside everything else rather than needing a
  // separate page.
  //
  // It used to additionally require the customer's wallet balance to cover the
  // order. That test went with the wallet payment path (see
  // findPayableOrders): balances are frozen now, so it would have filtered
  // this down to nothing.
  if (payable === true || payable === "true" || payable === "1") {
    conditions.push(eq(orders.paymentStatus, "Unpaid"));
    conditions.push(eq(orders.status, "Pending"));
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
 * Every confirmed payment, order by order, exactly as the bank statement has
 * it.
 *
 * ── What this no longer does ───────────────────────────────────────────────
 *
 * It does not reconstruct anything. The previous version had three separate
 * mechanisms for working out where an order's money came from, because the
 * link was never recorded:
 *
 *   * a FIFO walk over the customer's wallet (`traceWalletSources`), printed
 *     in the same columns as bank-matched money with nothing to mark it as a
 *     guess;
 *   * a regular expression over deposit descriptions, to find surplus that had
 *     been moved between orders (`'received from order #([0-9]+)'`);
 *   * a replay of the customer's whole wallet ledger up to the instant a hold
 *     was placed, to recover a balance-before and balance-after.
 *
 * All three are gone. `order_payments` records the link at the moment the
 * payment is confirmed, and each row carries the statement line's own details,
 * so this function reads rows and adds them up. See db/migrations/0021.
 *
 * ── The four figures on every order ────────────────────────────────────────
 *
 *   received    what the order actually got, netting any surplus it gave away
 *   applied     what settled its value — never more than the value itself
 *   surplus     money on the order beyond its value, sitting there until moved
 *   shortfall   money still owed
 *
 * `surplus` and `shortfall` cannot both be non-zero, and `applied + shortfall`
 * is always the order's value. That is the arithmetic an auditor checks, and
 * it is the same arithmetic on the screen, in the export and in the totals.
 */
const findFinanceReport = async ({
  search,
  // Null rather than "Paid": the report is every CONFIRMED payment, and a part
  // payment is a confirmed payment — so the unfiltered view is Paid together
  // with Part Paid, and an order settling in instalments stays on the report
  // throughout instead of appearing only once the last kobo lands. An explicit
  // value still filters to exactly that status, and "all" drops the condition.
  paymentStatus = null,
  dateFrom,
  dateTo,
  depotId,
  pfiId,
  productId,
  /**
   * 'reconciled'   only orders with at least one bank statement line behind
   *                them — the set an external audit can actually verify
   * 'unreconciled' only orders with none
   */
  reconciliation,
  /**
   * Filter by how the payments were attributed:
   *   'system'   only orders carrying a payment nobody chose
   *   'staff'    only orders where every payment was a recorded human decision
   *   <a basis>  only orders carrying that exact basis
   */
  confirmationBasis,
  scopeUser,
} = {}) => {
  const conditions = [];
  const scope = scopeCondition(scopeUser, { depotColumn: orders.depotId, pfiColumn: orders.pfiId });
  if (scope) conditions.push(scope);
  if (paymentStatus && paymentStatus !== "all") {
    conditions.push(eq(orders.paymentStatus, paymentStatus));
  } else if (!paymentStatus) {
    conditions.push(inArray(orders.paymentStatus, ["Paid", "Part Paid"]));
  }
  if (depotId) conditions.push(eq(orders.depotId, Number(depotId)));
  if (pfiId) conditions.push(eq(orders.pfiId, Number(pfiId)));
  if (productId) conditions.push(eq(orders.productId, Number(productId)));

  // Bank evidence, or the absence of it. Kept as a WHERE condition rather than
  // a filter applied after the rows are built, so the stat cards and the table
  // are computed over the same set — which is the property that stops them
  // disagreeing.
  const hasStatement = sql`EXISTS (
    SELECT 1 FROM order_payments op
    WHERE op.order_id = ${orders.id} AND op.source = 'statement'
  )`;
  if (reconciliation === "reconciled") conditions.push(hasStatement);
  if (reconciliation === "unreconciled") conditions.push(sql`NOT ${hasStatement}`);

  // Same reasoning as the reconciliation filter above: applied as a WHERE
  // condition so the stat cards and the table describe the same set of orders.
  if (confirmationBasis) {
    const systemBases = sql`('bank_inferred', 'auto_allocated', 'no_record', 'transfer_auto', 'unknown')`;
    const carriesSystemBasis = sql`EXISTS (
      SELECT 1 FROM order_payments op
      WHERE op.order_id = ${orders.id} AND op.confirmation_basis IN ${systemBases}
    )`;
    if (confirmationBasis === "system") {
      conditions.push(carriesSystemBasis);
    } else if (confirmationBasis === "staff") {
      conditions.push(sql`NOT ${carriesSystemBasis}`);
    } else {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM order_payments op
        WHERE op.order_id = ${orders.id} AND op.confirmation_basis = ${confirmationBasis}
      )`);
    }
  }

  if (search) {
    const possibleId = parseOrderReference(search);
    const term = `%${search}%`;
    // Reference, customer, company (either side — an order can carry its own
    // companyName distinct from the customer's), location, PFI, and the bank
    // details on whichever payment(s) actually funded this order: the teller
    // reference and the depositor's name, both straight off the statement.
    // Those are what somebody holding a bank statement types in.
    const textMatch = or(
      ilike(orders.orderNumber, term),
      ilike(customers.name, term),
      ilike(customers.phone, term),
      ilike(orders.companyName, term),
      ilike(customers.companyName, term),
      ilike(depots.name, term),
      ilike(pfis.pfiNumber, term),
      sql`EXISTS (
        SELECT 1 FROM order_payments op
        WHERE op.order_id = ${orders.id}
          AND (op.bank_ref ILIKE ${term} OR op.depositor ILIKE ${term} OR op.narration ILIKE ${term})
      )`,
    );
    conditions.push(possibleId ? or(eq(orders.id, possibleId), textMatch) : textMatch);
  }
  /**
   * Dated by when the order was PLACED, not when finance got round to
   * confirming it.
   *
   * These were different columns and it made the two reports impossible to
   * lay side by side: salesSummary filters on orders.createdAt (see
   * reporting.service.js), this filtered on payment_confirmed_at. An order
   * placed on 24 August and confirmed on 1 September appeared in the sales
   * figures for August and the finance figures for September — same order,
   * same money, two different months, and nothing on either page explaining
   * the gap.
   *
   * It was also self-contradictory here: the Date column has always shown
   * createdAt, so an order could display "20 Aug" while only being findable
   * by filtering to the day it happened to be confirmed.
   *
   * Confirmation date is not lost — payment_confirmed_at is still on the row,
   * and each payment carries the bank's own value date. This is only about
   * which day an order counts towards.
   *
   * A bare "2026-08-20" from a date input parses as that day's UTC midnight —
   * compared as-is, dateTo would exclude every order placed later that same
   * day. Widened to the last instant of the day so "today" means today.
   */
  if (dateFrom) {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? `${dateFrom}T00:00:00.000Z` : dateFrom;
    conditions.push(gte(orders.createdAt, new Date(start)));
  }
  if (dateTo) {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? `${dateTo}T23:59:59.999Z` : dateTo;
    conditions.push(lte(orders.createdAt, new Date(end)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const columns = {
    ...FULL_ORDER_COLUMNS,
    pfiLocationName: pfis.locationName,
  };

  const [rows, [totalsRow]] = await Promise.all([
    db
      .select(columns)
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(depots, eq(orders.depotId, depots.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .leftJoin(pfis, eq(orders.pfiId, pfis.id))
      .where(whereClause)
      // Newest first by order date — the same column the report is filtered
      // and dated by, so the rows run in the order the Date column shows.
      // The COALESCE this replaced existed only to keep unpaid orders (null
      // paymentConfirmedAt, which Postgres sorts first on DESC) from being
      // dumped at the top; createdAt is never null, so there is nothing left
      // to coalesce.
      .orderBy(desc(orders.createdAt), desc(orders.id)),
    // Over the same filtered set as the rows above, so the stat cards can
    // never disagree with what a filter or search actually shows. Joined the
    // same way as the rows query — the search condition can reference
    // depots/pfis columns, so every query sharing whereClause needs them in
    // scope too, or a search hits a missing-FROM-clause error.
    //
    // Received is summed from order_payments rather than from
    // orders.amount_paid: the two are kept equal by recomputeOrder(), and
    // summing the payment rows means the total on the card is literally the
    // sum of the rows underneath it.
    db
      .select({
        total: count(),
        totalAmount: sql`COALESCE(SUM(${orders.totalAmount}), 0)`,
        totalQuantity: sql`COALESCE(SUM(${orders.quantity}), 0)`,
        // Money PAID IN at the bank's own figure — transfer legs excluded, so
        // this totals the same column the rows below it show and a
        // reconciliation against the statement adds up. See amountPaidIn.
        totalAmountPaidIn: sql`COALESCE(SUM((
          SELECT COALESCE(SUM(op.amount), 0) FROM order_payments op
          WHERE op.order_id = ${orders.id} AND op.source NOT IN ('transfer_in', 'transfer_out')
        )), 0)`,
        // Movement between orders, netted. Zero over any window holding both
        // ends of every transfer in it — which is what makes it a useful check.
        totalNetTransfers: sql`COALESCE(SUM((
          SELECT COALESCE(SUM(op.amount), 0) FROM order_payments op
          WHERE op.order_id = ${orders.id} AND op.source IN ('transfer_in', 'transfer_out')
        )), 0)`,
        // Only the outgoing side, unsigned — "how much money moved", which
        // netting to zero would hide entirely.
        totalTransferredOut: sql`COALESCE(SUM((
          SELECT COALESCE(SUM(-op.amount), 0) FROM order_payments op
          WHERE op.order_id = ${orders.id} AND op.source = 'transfer_out'
        )), 0)`,
        totalReceived: sql`COALESCE(SUM((
          SELECT COALESCE(SUM(op.amount), 0) FROM order_payments op WHERE op.order_id = ${orders.id}
        )), 0)`,
        // Surplus and shortfall are summed per order and never netted against
        // each other. An order ₦5m over and an order ₦5m under is two problems,
        // not zero problems, and netting them was hiding both.
        totalSurplus: sql`COALESCE(SUM(GREATEST(0, (
          SELECT COALESCE(SUM(op.amount), 0) FROM order_payments op WHERE op.order_id = ${orders.id}
        ) - ${orders.totalAmount}::numeric)), 0)`,
        totalShortfall: sql`COALESCE(SUM(GREATEST(0, ${orders.totalAmount}::numeric - (
          SELECT COALESCE(SUM(op.amount), 0) FROM order_payments op WHERE op.order_id = ${orders.id}
        ))), 0)`,
        reconciledCount: sql`COUNT(*) FILTER (WHERE ${hasStatement})::int`,
        partPaidCount: sql`COUNT(*) FILTER (WHERE ${orders.paymentStatus} = 'Part Paid')::int`,
        /**
         * Orders carrying at least one payment nobody chose — the system
         * allocated it, inferred it, or has no record of it at all.
         *
         * Counted in SQL over the same filtered set as everything else here,
         * rather than from the decorated rows, because the rows are only the
         * current page's worth and this figure has to describe the whole
         * filtered book.
         */
        systemDecidedCount: sql`COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM order_payments op
          WHERE op.order_id = ${orders.id}
            AND op.confirmation_basis IN ('bank_inferred', 'auto_allocated', 'no_record', 'transfer_auto', 'unknown')
        ))::int`,
        /** Money on the listed orders that an external audit can actually check. */
        totalVerifiableAmount: sql`COALESCE(SUM((
          SELECT COALESCE(SUM(op.amount), 0) FROM order_payments op
          WHERE op.order_id = ${orders.id}
            AND op.confirmation_basis IN ('bank_matched', 'bank_inferred')
        )), 0)`,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(depots, eq(orders.depotId, depots.id))
      .leftJoin(pfis, eq(orders.pfiId, pfis.id))
      .where(whereClause),
  ]);

  const orderIds = rows.map((r) => r.id);

  /**
   * Every payment row for the listed orders, in one batched query.
   *
   * Deliberately not a join on the main select: an order with three payments
   * would multiply into three order rows, which is exactly the shape that made
   * the old report double-count.
   *
   * The bank columns come off order_payments itself — the snapshot taken when
   * the line was matched — not from a join back to bank_statement_lines. A
   * line that has since been re-matched elsewhere must not silently rewrite
   * the history of the order it used to be on.
   */
  const payments = orderIds.length
    ? await db.execute(sql`
        SELECT
          p.id,
          p.order_id           AS "orderId",
          p.statement_line_id  AS "statementLineId",
          p.amount,
          p.source,
          p.txn_date           AS "txnDate",
          p.depositor,
          p.narration,
          p.bank_ref           AS "bankRef",
          p.bank_name          AS "bankName",
          p.account_name       AS "accountName",
          p.account_number     AS "accountNumber",
          -- How this payment came to be on this order. See migration 0023:
          -- until this column existed, a line a colleague matched by hand and
          -- one the old wallet walk picked on its own rendered identically.
          p.confirmation_basis AS "confirmationBasis",
          p.note,
          p.created_at         AS "createdAt",
          p.transfer_id        AS "transferId",
          st.first_name        AS "recorderFirstName",
          st.surname           AS "recorderSurname",
          -- The order at the other end of a transfer leg. Both halves of a
          -- movement therefore name each other on the face of the report,
          -- which is the question an auditor asks the moment they see a
          -- transfer: where did it go, and where did it come from.
          CASE WHEN p.source = 'transfer_out' THEN t.to_order_id
               WHEN p.source = 'transfer_in'  THEN t.from_order_id END AS "counterpartOrderId",
          CASE WHEN p.source = 'transfer_out' THEN o_to.company_name
               WHEN p.source = 'transfer_in'  THEN o_from.company_name END AS "counterpartCompany",
          t.reason AS "transferReason",
          /**
           * What the money on a transfer leg originally was, at the bank.
           *
           * A transfer leg has no statement line of its own — no date, no
           * payer, no reference — so next to real statement rows it rendered
           * as a row of blanks and read as corrupt data. It is not: the money
           * arrived on the OTHER order's bank line, and that is recoverable.
           *
           * Both legs look it up on the order the surplus came FROM (the
           * source of the money in both directions), and only when that order
           * has exactly one payer — with several, naming one of them would be
           * a guess, and the leg falls back to naming the order alone.
           */
          (
            SELECT CASE WHEN COUNT(DISTINCT sp.depositor) = 1 THEN MIN(sp.depositor) END
            FROM order_payments sp
            WHERE sp.order_id = t.from_order_id AND sp.source = 'statement' AND sp.depositor <> ''
          ) AS "originDepositor",
          /**
           * Only where the source order has exactly ONE statement line.
           *
           * This used to string_agg every reference on the source order, so
           * the three transfers out of AM11589 each printed the same four
           * references — implying each had come from all four lines, when in
           * truth nothing records which line a transfer came out of. A
           * transfer moves surplus, and surplus is not attributable to a
           * particular line. Where there is exactly one, saying so is a fact;
           * where there are several, the honest answer is nothing, and the
           * transfer is identified by its own id instead.
           */
          (
            SELECT MIN(sp.bank_ref)
            FROM order_payments sp
            WHERE sp.order_id = t.from_order_id AND sp.source = 'statement' AND sp.bank_ref <> ''
            HAVING COUNT(*) = 1
          ) AS "originBankRefs"
        FROM order_payments p
        LEFT JOIN staff st ON st.id = p.recorded_by
        LEFT JOIN order_payment_transfers t ON t.id = p.transfer_id
        LEFT JOIN orders o_to   ON o_to.id = t.to_order_id
        LEFT JOIN orders o_from ON o_from.id = t.from_order_id
        WHERE p.order_id IN (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})
        -- Banking order, then entry order. A report checked against a
        -- statement reads down the statement's own dates.
        ORDER BY p.txn_date ASC NULLS LAST, p.created_at ASC, p.id ASC
      `)
    : [];

  const paymentsByOrder = new Map();
  for (const p of payments.rows ?? payments) {
    p.amount = Number(p.amount);
    p.counterpartOrderRef =
      p.counterpartOrderId != null
        ? generateOrderReference(p.counterpartCompany, p.counterpartOrderId)
        : null;
    if (!paymentsByOrder.has(p.orderId)) paymentsByOrder.set(p.orderId, []);
    paymentsByOrder.get(p.orderId).push(p);
  }

  const decorated = rows.map((row) => {
    const rowPayments = paymentsByOrder.get(row.id) || [];
    const total = Number(row.totalAmount || 0);

    /**
     * Money PAID IN against this order, at the figure the bank statement
     * carries — never reduced by a transfer that happened afterwards.
     *
     * This is the column the report gets checked against a statement, so it
     * has to be the statement's own number and nothing else. It used to be
     * netted: an order that received ₦163,350,000 and later moved ₦54,450,000
     * to another order showed ₦108,900,000 here, a figure appearing on no
     * statement anywhere, and the person reconciling had to work backwards
     * through a transfer to find out why the two disagreed.
     *
     * A transfer is a later, separate event. It gets its own columns below.
     */
    const amountPaidIn = rowPayments
      .filter((p) => !TRANSFER_SOURCES.has(p.source))
      .reduce((sum, p) => sum + p.amount, 0);

    const transferredIn = rowPayments
      .filter((p) => p.source === "transfer_in")
      .reduce((sum, p) => sum + p.amount, 0);
    // Already negative on the row — kept negative, so `netTransfers` is a
    // plain sum and the column shows direction without a separate flag.
    const transferredOut = rowPayments
      .filter((p) => p.source === "transfer_out")
      .reduce((sum, p) => sum + p.amount, 0);
    const netTransfers = transferredIn + transferredOut;

    /** What the order actually holds now: paid in, plus what moved. */
    const received = amountPaidIn + netTransfers;

    return {
      ...row,
      payments: rowPayments,
      /**
       * The bank statement figure. What "Amount Paid" shows, and what a
       * reconciliation ticks off line by line.
       */
      amountPaidIn,
      /** Sales value against the bank figure — before any transfer. */
      differential: total - amountPaidIn,
      transferredIn,
      transferredOut,
      /** Signed: negative where this order gave money away. */
      netTransfers,
      /**
       * What is left once both are taken into account. Zero on a settled
       * order, whichever route its money took — this is the column that
       * should read as a dash all the way down a clean day.
       */
      balance: total - received,
      /** What the order holds now, after transfers. */
      received,
      /** What settled the order's value. Never more than the value. */
      applied: Math.min(received, total),
      /** Money the order still holds beyond its value — after transfers. */
      surplus: Math.max(0, received - total),
      /** Money the order still needs — after transfers. */
      shortfall: Math.max(0, total - received),
      /**
       * At least one bank statement line stands behind this order.
       *
       * The single most important flag on the report: it separates what an
       * external auditor can verify against a statement from what they cannot.
       * An order with only `legacy` rows was confirmed before payments were
       * recorded against orders, and the report says exactly that rather than
       * filling the bank columns with a plausible-looking guess.
       */
      reconciled: rowPayments.some((p) => p.source === "statement"),

      /**
       * HOW this order was confirmed — the question `reconciled` does not
       * answer and which the report was silently conflating with it.
       *
       * `reconciled` says a bank line exists somewhere on the order. It says
       * nothing about who decided that line settles THIS order, and for 22
       * rows the answer is that migration 0021 guessed. These four fields
       * separate evidence from inference on the face of the row.
       */
      confirmationBasis: weakestBasis(rowPayments),
      confirmationBasisLabel:
        CONFIRMATION_BASIS_LABEL[weakestBasis(rowPayments)] || null,
      /** Every distinct basis on the order, so a mixed order can say so. */
      confirmationBases: [...new Set(rowPayments.map((p) => p.confirmationBasis))],
      /**
       * True where no person chose how this order was funded — the system did,
       * by the oldest-credit-first walk or by a migration's tiebreak. This is
       * the flag the desk actually needs: it is the set of orders whose story
       * nobody in the building can tell.
       */
      systemDecided: rowPayments.some((p) => SYSTEM_DECIDED_BASES.has(p.confirmationBasis)),
      /** Money on this order that an external auditor can check. */
      verifiableAmount: rowPayments
        .filter((p) => VERIFIABLE_BASES.has(p.confirmationBasis))
        .reduce((sum, p) => sum + p.amount, 0),

      /** The account(s) the money was actually paid into. */
      paidInto: [
        ...new Set(
          rowPayments
            .filter((p) => p.bankName || p.accountNumber)
            .map((p) => [p.bankName, p.accountNumber].filter(Boolean).join(" · ")),
        ),
      ],
    };
  });

  const total = Number(totalsRow.total) || 0;
  const reconciledCount = Number(totalsRow.reconciledCount) || 0;

  return {
    orders: decorated.map(formatOrderRow),
    totals: {
      count: total,
      totalAmount: Number(totalsRow.totalAmount),
      totalQuantity: Number(totalsRow.totalQuantity),
      /**
       * The bank statement total — what "Amount Paid" sums to, and what a
       * reconciliation against the statement is checked against.
       */
      totalAmountPaidIn: Number(totalsRow.totalAmountPaidIn),
      /** Sales value against the bank figure, before any transfer. */
      totalDifferential: Number(totalsRow.totalAmount) - Number(totalsRow.totalAmountPaidIn),
      /** Movement between orders: netted, and the outgoing side unsigned. */
      totalNetTransfers: Number(totalsRow.totalNetTransfers),
      totalTransferredOut: Number(totalsRow.totalTransferredOut),
      /** What the listed orders hold once transfers are taken into account. */
      totalReceived: Number(totalsRow.totalReceived),
      /** What is left after both — zero on a fully settled window. */
      totalBalance: Number(totalsRow.totalAmount) - Number(totalsRow.totalReceived),
      /** Summed per order, never netted — see the SQL above. */
      totalSurplus: Number(totalsRow.totalSurplus),
      totalShortfall: Number(totalsRow.totalShortfall),
      /** How much of the book an external audit can actually check. */
      reconciledCount,
      unreconciledCount: total - reconciledCount,
      partPaidCount: Number(totalsRow.partPaidCount),
      /**
       * Orders holding at least one payment the system attributed on its own.
       * Distinct from `unreconciledCount`: an order can have a genuine bank
       * line and still have had the order chosen for it by a migration.
       */
      systemDecidedCount: Number(totalsRow.systemDecidedCount) || 0,
      /** Naira backed by a bank statement line, whoever attributed it. */
      totalVerifiableAmount: Number(totalsRow.totalVerifiableAmount) || 0,
      /** Naira with no bank line behind it at all. */
      totalUnverifiableAmount:
        Number(totalsRow.totalReceived) - (Number(totalsRow.totalVerifiableAmount) || 0),
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

/**
 * Orders still owed money — the finance desk's queue.
 *
 * This used to be "orders whose customer is holding enough wallet balance to
 * settle them right now", and that test had to go with the wallet payment
 * path. Nothing funds a wallet any more, so every balance is frozen at
 * whatever it was: the affordability test would have emptied this page and
 * left the desk with nowhere to confirm a payment from — the one screen the
 * whole change depends on.
 *
 * What is payable is now simply what is unpaid. The desk opens an order,
 * matches the bank statement line that paid for it, and the order settles;
 * whether the customer happens to have a legacy balance has nothing to do
 * with it.
 *
 * Part Paid orders belong here too: they still owe a balance, and the desk
 * finishes them off the same way.
 */
const findPayableOrders = async (scopeUser) => {
  const conditions = [
    inArray(orders.paymentStatus, ["Unpaid", "Part Paid"]),
    // A part-paid order has already been released, so restricting to Pending
    // would exclude every one of them.
    inArray(orders.status, ["Pending", "Paid", "Released", "Loading"]),
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
