const { client } = require("../db");
const { REVENUE_STATUSES } = require("../lib/pfiFinance");
const { OPEN_STATES } = require("../lib/expenseChain");

/**
 * The figure a total should use.
 *
 * A paid request counts for what actually cleared the bank; anything earlier
 * counts for what it asked for. `amount_paid` is null on rows settled before it
 * existed, hence the fallback — without it, historical spend would vanish.
 */
const SPEND = client`CASE WHEN e.status = 'paid' THEN COALESCE(e.amount_paid, e.amount) ELSE e.amount END`;

/**
 * Aggregates for many PFIs at once.
 *
 * The obvious shape here is one set of queries per PFI, which costs a dozen
 * round trips each and makes a 34-PFI list take seconds. These are three
 * grouped queries for the whole page instead, so the cost is flat in the
 * number of PFIs.
 *
 * @param {number[]} ids
 * @returns {Promise<Map<number, {expenses,revenue,movementQty,orderCount,expenseCount}>>}
 */
const aggregatesFor = async (ids) => {
  const out = new Map();
  const list = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  if (list.length === 0) return out;

  const blank = () => ({
    expenses: 0,
    pendingExpenses: 0,
    pendingExpenseCount: 0,
    revenue: 0,
    movementQty: 0,
    allocationQty: 0,
    soldQty: 0,
    orderCount: 0,
    expenseCount: 0,
  });
  for (const id of list) out.set(id, blank());

  const [expenses, revenue, movements, allocations, sold] = await Promise.all([
    // Soft-deleted lines are excluded from every total.
    //
    // `total` is PAID ONLY — that is the entire point of the approval chain.
    // A request that has not been paid must never move a cargo's cost, profit
    // or landing price. `open` is the committed-but-not-yet-out figure, which
    // the UI shows beside the cost and never inside it.
    client`
      SELECT e.pfi_id,
             COALESCE(SUM(${SPEND}) FILTER (WHERE e.status = 'paid'), 0)::text AS total,
             COUNT(*) FILTER (WHERE e.status = 'paid')::int AS lines,
             COALESCE(SUM(e.amount) FILTER (WHERE e.status = ANY(${OPEN_STATES})), 0)::text AS open_total,
             COUNT(*) FILTER (WHERE e.status = ANY(${OPEN_STATES}))::int AS open_lines
      FROM pfi_expenses e
      WHERE e.pfi_id = ANY(${list}) AND e.deleted_at IS NULL
      GROUP BY e.pfi_id
    `,
    client`
      SELECT pfi_id, COALESCE(SUM(total_amount), 0)::text AS total, COUNT(*)::int AS orders
      FROM orders
      WHERE pfi_id = ANY(${list}) AND status = ANY(${REVENUE_STATUSES})
      GROUP BY pfi_id
    `,
    // The append-only ledger is the source of truth for released stock.
    client`
      SELECT pfi_id, COALESCE(SUM(qty_litres), 0)::bigint AS qty
      FROM pfi_movements
      WHERE pfi_id = ANY(${list})
      GROUP BY pfi_id
    `,
    // Delivery allocations are a second way stock leaves a batch, and count
    // toward sold alongside releases — but only until a release happens.
    // placeOrder reserves the full order quantity here and never reduces it,
    // while ticket generation writes the *actual* (possibly partial,
    // cumulative) ticketed amount to pfi_movements for that same order — so
    // once a movement row exists, it is strictly more accurate than the
    // frozen original reservation, and adding both double-counts every
    // ticketed order's stock as sold twice over.
    client`
      SELECT a.pfi_id, COALESCE(SUM(a.quantity), 0)::bigint AS qty
      FROM order_pfi_allocations a
      WHERE a.pfi_id = ANY(${list})
        AND NOT EXISTS (
          SELECT 1 FROM pfi_movements m
          WHERE m.order_id = a.order_id AND m.pfi_id = a.pfi_id
        )
      GROUP BY a.pfi_id
    `,
    /**
     * What has actually been sold off each batch — the figure the stock
     * report lives on.
     *
     * Driven by the ORDER, not by the stock ledgers, because the ledgers are
     * not guaranteed to have a row: an order assigned to a PFI through the
     * bulk assign-orders action sets orders.pfi_id directly and writes
     * neither an allocation nor a movement. Summing only the ledgers made
     * every such order invisible — a batch with 20 million litres of
     * confirmed sales read as untouched, full tank, nothing sold.
     *
     * An order counts once its payment is confirmed (REVENUE_STATUSES —
     * exactly the set `revenue` above uses, so litres sold and money earned
     * can never tell different stories). A merely-placed, unpaid order does
     * NOT count as sold; it still holds its reservation against
     * pfis.sold_qty_litres, which is the capacity gate, not this.
     *
     * Per (batch, order) the most accurate figure available wins:
     *   1. the movement — what was actually ticketed out, possibly partial
     *   2. the allocation — this batch's share of a multi-PFI order
     *   3. the order quantity — single batch, no ledger row written
     */
    client`
      WITH rev AS (
        SELECT o.id, o.pfi_id, o.quantity
        FROM orders o
        WHERE o.pfi_id = ANY(${list}) AND o.status = ANY(${REVENUE_STATUSES})
      ),
      parts AS (
        SELECT m.pfi_id, SUM(m.qty_litres)::bigint AS qty
        FROM pfi_movements m
        JOIN rev ON rev.id = m.order_id
        WHERE m.pfi_id = ANY(${list})
        GROUP BY m.pfi_id

        UNION ALL

        SELECT a.pfi_id, SUM(a.quantity)::bigint AS qty
        FROM order_pfi_allocations a
        JOIN rev ON rev.id = a.order_id
        WHERE a.pfi_id = ANY(${list})
          AND NOT EXISTS (
            SELECT 1 FROM pfi_movements m
            WHERE m.order_id = a.order_id AND m.pfi_id = a.pfi_id
          )
        GROUP BY a.pfi_id

        UNION ALL

        SELECT rev.pfi_id, SUM(rev.quantity)::bigint AS qty
        FROM rev
        WHERE NOT EXISTS (
            SELECT 1 FROM pfi_movements m
            WHERE m.order_id = rev.id AND m.pfi_id = rev.pfi_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM order_pfi_allocations a
            WHERE a.order_id = rev.id AND a.pfi_id = rev.pfi_id
          )
        GROUP BY rev.pfi_id
      )
      SELECT pfi_id, COALESCE(SUM(qty), 0)::bigint AS qty
      FROM parts
      GROUP BY pfi_id
    `,
  ]);

  for (const r of expenses) {
    const row = out.get(Number(r.pfi_id));
    if (row) {
      row.expenses = Number(r.total);
      row.expenseCount = r.lines;
      row.pendingExpenses = Number(r.open_total);
      row.pendingExpenseCount = r.open_lines;
    }
  }
  for (const r of revenue) {
    const row = out.get(Number(r.pfi_id));
    if (row) {
      row.revenue = Number(r.total);
      row.orderCount = r.orders;
    }
  }
  for (const r of movements) {
    const row = out.get(Number(r.pfi_id));
    if (row) row.movementQty = Number(r.qty);
  }
  for (const r of allocations) {
    const row = out.get(Number(r.pfi_id));
    if (row) row.allocationQty = Number(r.qty);
  }
  for (const r of sold) {
    const row = out.get(Number(r.pfi_id));
    if (row) row.soldQty = Number(r.qty);
  }

  return out;
};

// ─── Categories ─────────────────────────────────────────────────────────────

/**
 * Every PFI gets a category the moment it is created. This stands in for the
 * Django post_save signal: same guarantee, but it runs inside the caller's
 * transaction so a PFI can never exist without its category.
 */
const ensureCategoryForPfi = async (pfiId, pfiNumber, tx = client) => {
  const [byPfi] = await tx`SELECT * FROM expense_categories WHERE pfi_id = ${Number(pfiId)} LIMIT 1`;
  if (byPfi) {
    if (byPfi.name !== pfiNumber) {
      const [updated] = await tx`
        UPDATE expense_categories
        SET name = ${pfiNumber}, updated_at = NOW()
        WHERE id = ${byPfi.id}
        RETURNING *
      `;
      return updated;
    }
    return byPfi;
  }
  const [byName] = await tx`SELECT * FROM expense_categories WHERE name = ${pfiNumber} LIMIT 1`;
  if (byName) {
    const [updated] = await tx`
      UPDATE expense_categories
      SET pfi_id = ${Number(pfiId)}, is_system_category = true, updated_at = NOW()
      WHERE id = ${byName.id}
      RETURNING *
    `;
    return updated;
  }
  const [row] = await tx`
    INSERT INTO expense_categories (name, pfi_id, is_system_category)
    VALUES (${pfiNumber}, ${Number(pfiId)}, true)
    RETURNING *
  `;
  return row;
};

/** Renaming a PFI renames its category, so the two never drift apart. */
const renameCategoryForPfi = async (pfiId, pfiNumber, tx = client) => {
  const [row] = await tx`
    UPDATE expense_categories
    SET name = ${pfiNumber}, updated_at = NOW()
    WHERE pfi_id = ${Number(pfiId)}
    RETURNING *
  `;
  return row || null;
};

const findCategoryById = async (id) => {
  const [row] = await client`SELECT * FROM expense_categories WHERE id = ${Number(id)}`;
  return row || null;
};

const listCategories = async () => {
  // PFI-backed categories carry their PFI's status so the picker can show
  // which batches are still open.
  //
  // Ordered by GL code, not alphabetically: the code is the order Finance reads
  // the chart in, and it keeps each subgroup's accounts together.
  //
  // The line count comes back with the row so the chart editor can say why an
  // account cannot be deleted, rather than only refusing after the click.
  return client`
    SELECT c.*, p.status AS pfi_status, p.pfi_number,
           (SELECT COUNT(*)::int FROM pfi_expenses e
            WHERE e.category_id = c.id AND e.deleted_at IS NULL) AS expense_count
    FROM expense_categories c
    LEFT JOIN pfis p ON p.id = c.pfi_id
    ORDER BY c.is_system_category ASC, c.gl_code ASC NULLS LAST, c.name ASC
  `;
};

const createCategory = async (name, { glCode = null, glGroup = null, glSubgroup = "" } = {}) => {
  const [row] = await client`
    INSERT INTO expense_categories (name, gl_code, gl_group, gl_subgroup, pfi_id, is_system_category)
    VALUES (${name}, ${glCode || null}, ${glGroup || null}, ${glSubgroup || ""}, NULL, false)
    RETURNING *
  `;
  return row;
};

/** Takes a name alone in the common case, or a patch of columns to set. */
const updateCategory = async (id, data) => {
  const patch = typeof data === "string" ? { name: data } : { ...(data || {}) };
  const [row] = await client`
    UPDATE expense_categories
    SET ${client({ ...patch, updated_at: new Date().toISOString() })}
    WHERE id = ${Number(id)} RETURNING *
  `;
  return row || null;
};

const deleteCategory = async (id) => {
  const [row] = await client`DELETE FROM expense_categories WHERE id = ${Number(id)} RETURNING id`;
  return !!row;
};

const countExpensesInCategory = async (id) => {
  const [row] = await client`
    SELECT COUNT(*)::int AS n FROM pfi_expenses
    WHERE category_id = ${Number(id)} AND deleted_at IS NULL
  `;
  return row.n;
};

/**
 * Repair pass: create categories for any PFI missing one. Needed because rows
 * predating this table have no category, and without one their expenses can
 * never be booked.
 */
const autoPopulateCategories = async () => {
  const rows = await client`
    INSERT INTO expense_categories (name, pfi_id, is_system_category)
    SELECT p.pfi_number, p.id, true
    FROM pfis p
    LEFT JOIN expense_categories c ON c.pfi_id = p.id
    WHERE c.id IS NULL
    ON CONFLICT DO NOTHING
    RETURNING id, name
  `;
  return rows;
};

// ─── Expenses ───────────────────────────────────────────────────────────────

// The GL pair travels with every expense read — joined, never copied onto the
// row, so a corrected account name can never disagree with the code.
const GL_COLS = client`c.name AS category_name, c.gl_code, c.gl_group, c.gl_subgroup`;

/**
 * Who entered the expense, as a NAME.
 *
 * `entered_by` is a free-text column and its contents are not uniform: newer
 * rows carry the actor's name (the controller writes actorName), but well
 * over half the table carries a bare staff id as a string — "1", "121", "87"
 * — from an earlier implementation. Reports were printing those ids straight
 * out, so "Added by" read as a number.
 *
 * Resolved in three steps, best first: the stored text when it is already a
 * name (it may carry other names the staff row's first+surname would drop),
 * then the staff row a numeric `entered_by` points at, and finally the staff
 * who added the record.
 */
const ENTERED_BY_NAME = client`
  COALESCE(
    NULLIF(TRIM(CASE WHEN e.entered_by ~ '^\\s*\\d+\\s*$' THEN NULL ELSE e.entered_by END), ''),
    NULLIF(TRIM(ent.first_name || ' ' || ent.surname), ''),
    NULLIF(TRIM(sub.first_name || ' ' || sub.surname), ''),
    ''
  )`;

const findExpenseById = async (id) => {
  const [row] = await client`
    SELECT e.*, ${GL_COLS}, c.is_system_category, p.pfi_number
    FROM pfi_expenses e
    JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN pfis p ON p.id = e.pfi_id
    WHERE e.id = ${Number(id)}
  `;
  return row || null;
};

const listExpensesForPfi = async (pfiId) => {
  return client`
    SELECT e.*, ${GL_COLS},
           ${ENTERED_BY_NAME} AS entered_by_name,
           sub.first_name || ' ' || sub.surname AS submitted_by_name
    FROM pfi_expenses e
    JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN staff sub ON sub.id = COALESCE(e.added_by, e.recorded_by)
    LEFT JOIN staff ent ON ent.id = NULLIF(regexp_replace(COALESCE(e.entered_by, ''), '\\D', '', 'g'), '')::int
    WHERE e.pfi_id = ${Number(pfiId)} AND e.deleted_at IS NULL
    ORDER BY e.expense_date DESC, e.id DESC
  `;
};

/**
 * The expenses page: filterable list plus the totals it shows in its cards.
 * Both come off the same WHERE so the cards can never disagree with the rows.
 */
const listExpenses = async ({
  search,
  categoryId,
  /** One of GL_GROUPS — narrows to a whole section of the chart at once. */
  glGroup,
  pfiId,
  vendorId,
  bank,
  type,
  status,
  dateFrom,
  dateTo,
  month,
  page = 1,
  limit = 25,
  /** Null means oversight — see everything. A number scopes to one submitter. */
  onlySubmitterId = null,
  /** The authenticated caller, for location/PFI scoping (undefined = unfiltered). */
  scopeUser = null,
} = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  // Scoping goes on first so every count, total, page and the bank list all
  // inherit it. Without that the bank dropdown leaks which accounts colleagues
  // pay from even when their rows are hidden.
  const base = [client`e.deleted_at IS NULL`];
  if (onlySubmitterId != null) {
    base.push(client`COALESCE(e.added_by, e.recorded_by) = ${Number(onlySubmitterId)}`);
  }
  // Location/PFI scope, applied only to the all-expenses view. When
  // onlySubmitterId is set the caller is already restricted to their own
  // requests, and those are theirs to see wherever they were booked — the
  // location rule exists to narrow OTHER people's rows, not to hide someone
  // from themselves.
  //
  // A general expense (pfi_id IS NULL) always passes: it has no location, so
  // a location test can only ever fail on it, and failing closed hid every
  // company-wide overhead from everyone outside head office.
  if (onlySubmitterId == null && scopeUser && !scopeUser.canViewAllLocations) {
    const { depotIds = [], lpgStationIds = [], pfiIds = [] } = scopeUser.scope || {};
    base.push(client`(
      e.pfi_id IS NULL
      OR e.pfi_id = ANY(${pfiIds})
      OR e.pfi_id IN (
        SELECT id FROM pfis WHERE location_id = ANY(${depotIds}) OR lpg_station_id = ANY(${lpgStationIds})
      )
    )`);
  }

  if (search) {
    const p = `%${search}%`;
    base.push(
      client`(e.description ILIKE ${p} OR e.vendor ILIKE ${p} OR c.name ILIKE ${p}
              OR e.bank_paid_from ILIKE ${p} OR e.receipt_reference ILIKE ${p}
              OR e.invoice_number ILIKE ${p} OR e.tin_number ILIKE ${p}
              OR c.gl_code ILIKE ${p})`
    );
  }
  if (categoryId === "none") base.push(client`e.category_id IS NULL`);
  else if (categoryId && categoryId !== "all") base.push(client`e.category_id = ${Number(categoryId)}`);
  if (glGroup && glGroup !== "all") base.push(client`c.gl_group = ${glGroup}`);
  if (pfiId && pfiId !== "all") base.push(client`e.pfi_id = ${Number(pfiId)}`);
  if (vendorId && vendorId !== "all") base.push(client`e.vendor_id = ${Number(vendorId)}`);
  if (bank) base.push(client`LOWER(e.bank_paid_from) = LOWER(${bank})`);
  if (type === "pfi") base.push(client`e.pfi_id IS NOT NULL`);
  if (type === "general") base.push(client`e.pfi_id IS NULL`);
  if (dateFrom) base.push(client`e.expense_date >= ${dateFrom}`);
  if (dateTo) base.push(client`e.expense_date <= ${dateTo}`);
  // A malformed month is ignored rather than erroring — it arrives from a URL.
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    base.push(client`to_char(e.expense_date, 'YYYY-MM') = ${month}`);
  }

  const join = (parts) => parts.reduce((a, c, i) => (i === 0 ? c : client`${a} AND ${c}`));
  const baseClause = join(base);

  // The status filter is applied to rows and totals, but deliberately NOT to
  // the tab counts — otherwise every other tab reads zero once you are inside
  // one, which is the single most-reported "the numbers are wrong" bug.
  const withStatus = [...base];
  if (status === "awaiting") withStatus.push(client`e.status = ANY(${OPEN_STATES})`);
  else if (status && status !== "all") withStatus.push(client`e.status = ${status}`);
  const rowClause = join(withStatus);

  const [rows, [totals], [counts], banks] = await Promise.all([
    client`
      SELECT e.*, ${GL_COLS}, c.is_system_category, p.pfi_number,
             sub.first_name || ' ' || sub.surname AS submitted_by_name,
             rev.first_name || ' ' || rev.surname AS reviewed_by_name,
             (SELECT COUNT(*)::int FROM pfi_expense_attachments a WHERE a.expense_id = e.id)
               AS attachment_count
      FROM pfi_expenses e
      JOIN expense_categories c ON c.id = e.category_id
      LEFT JOIN pfis p ON p.id = e.pfi_id
      LEFT JOIN staff sub ON sub.id = COALESCE(e.added_by, e.recorded_by)
      LEFT JOIN staff rev ON rev.id = e.reviewed_by
      WHERE ${rowClause}
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `,
    // Totals cover the whole filtered set, never just the page, so the summary
    // can never disagree with the filter above it.
    client`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(${SPEND}), 0)::text AS total,
        COALESCE(SUM(${SPEND}) FILTER (WHERE e.pfi_id IS NOT NULL), 0)::text AS pfi_total,
        COALESCE(SUM(${SPEND}) FILTER (WHERE e.pfi_id IS NULL), 0)::text AS general_total,
        COALESCE(SUM(${SPEND}) FILTER (WHERE e.status = 'paid'), 0)::text AS paid_total,
        COALESCE(SUM(e.amount) FILTER (WHERE e.status = ANY(${OPEN_STATES})), 0)::text AS open_total
      FROM pfi_expenses e
      JOIN expense_categories c ON c.id = e.category_id
      LEFT JOIN pfis p ON p.id = e.pfi_id
      WHERE ${rowClause}
    `,
    client`
      SELECT
        COUNT(*)::int AS all,
        COUNT(*) FILTER (WHERE e.status = ANY(${OPEN_STATES}))::int AS awaiting,
        COUNT(*) FILTER (WHERE e.status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE e.status = 'verified')::int AS verified,
        COUNT(*) FILTER (WHERE e.status = 'audit_approved')::int AS audit_approved,
        COUNT(*) FILTER (WHERE e.status = 'admin_approved')::int AS admin_approved,
        COUNT(*) FILTER (WHERE e.status = 'paid')::int AS paid,
        COUNT(*) FILTER (WHERE e.status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE e.status = 'changes_requested')::int AS changes_requested
      FROM pfi_expenses e
      JOIN expense_categories c ON c.id = e.category_id
      WHERE ${baseClause}
    `,
    client`
      SELECT DISTINCT e.bank_paid_from
      FROM pfi_expenses e
      JOIN expense_categories c ON c.id = e.category_id
      WHERE ${baseClause} AND e.bank_paid_from <> ''
      ORDER BY e.bank_paid_from
    `,
  ]);

  return {
    expenses: rows,
    totals: {
      count: totals.count,
      total: Number(totals.total),
      pfiTotal: Number(totals.pfi_total),
      generalTotal: Number(totals.general_total),
      paidTotal: Number(totals.paid_total),
      openTotal: Number(totals.open_total),
    },
    statusCounts: counts,
    banks: banks.map((b) => b.bank_paid_from),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totals.count,
      totalPages: Math.max(1, Math.ceil(totals.count / limitNum)),
    },
  };
};

/** One expense with everything the detail view needs, in two queries. */
const findExpenseFull = async (id) => {
  const [row] = await client`
    SELECT e.*, ${GL_COLS}, c.is_system_category, p.pfi_number,
           sub.first_name || ' ' || sub.surname AS submitted_by_name
    FROM pfi_expenses e
    JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN pfis p ON p.id = e.pfi_id
    LEFT JOIN staff sub ON sub.id = COALESCE(e.added_by, e.recorded_by)
    WHERE e.id = ${Number(id)}
  `;
  if (!row) return null;

  const [attachments, history, comments] = await Promise.all([
    client`
      SELECT a.*, s.first_name || ' ' || s.surname AS uploaded_by_name
      FROM pfi_expense_attachments a
      LEFT JOIN staff s ON s.id = a.uploaded_by
      WHERE a.expense_id = ${row.id} ORDER BY a.uploaded_at
    `,
    // Reasons are read from the audit table, never from review_note — that
    // column is overwritten on every transition, so a rejection reason would
    // vanish the moment the corrected request was approved.
    client`
      SELECT a.action, a.changes, a.created_at, a.actor_name
      FROM pfi_expense_audits a
      WHERE a.expense_id = ${row.id}
      ORDER BY a.created_at ASC, a.id ASC
    `,
    listComments(row.id),
  ]);

  return { ...row, attachments, history, comments };
};

// ─── The conversation ───────────────────────────────────────────────────────

const listComments = async (expenseId) =>
  client`
    SELECT m.id, m.body, m.author_id, m.created_at,
           COALESCE(NULLIF(TRIM(s.first_name || ' ' || s.surname), ''), m.author_name) AS author_name,
           s.roles AS author_roles
    FROM pfi_expense_comments m
    LEFT JOIN staff s ON s.id = m.author_id
    WHERE m.expense_id = ${Number(expenseId)}
    ORDER BY m.created_at ASC, m.id ASC
  `;

const addComment = async ({ expenseId, body, authorId, authorName }) => {
  const [row] = await client`
    INSERT INTO pfi_expense_comments (expense_id, body, author_id, author_name)
    VALUES (${Number(expenseId)}, ${body}, ${authorId ?? null}, ${authorName || ""})
    RETURNING *
  `;
  return row;
};

const createExpense = async (data, tx = client) => {
  const [row] = await tx`
    INSERT INTO pfi_expenses ${tx(data)} RETURNING *
  `;
  return row;
};

const updateExpense = async (id, data, tx = client) => {
  const [row] = await tx`
    UPDATE pfi_expenses SET ${tx({ ...data, updated_at: new Date().toISOString() })}
    WHERE id = ${Number(id)} AND deleted_at IS NULL
    RETURNING *
  `;
  return row || null;
};

/** Soft delete — the row stays and drops out of every total. */
const softDeleteExpense = async (id) => {
  const [row] = await client`
    UPDATE pfi_expenses SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${Number(id)} AND deleted_at IS NULL
    RETURNING *
  `;
  return row || null;
};

const writeAudit = async ({ expenseId, action, changes, actorId, actorName }, tx = client) => {
  await tx`
    INSERT INTO pfi_expense_audits (expense_id, action, changes, actor_id, actor_name)
    VALUES (${expenseId ?? null}, ${action}, ${JSON.stringify(changes || {})},
            ${actorId ?? null}, ${actorName || ""})
  `;
};

// ─── Movements ──────────────────────────────────────────────────────────────

/**
 * Deduct stock. `ON CONFLICT DO NOTHING` against the unique (order, action)
 * index is what makes this idempotent — re-running ticket generation for an
 * order can never deduct the same PFI twice.
 *
 * @returns the inserted row, or null if this order already moved.
 */
const recordMovement = async (
  { pfiId, orderId, action = "RELEASE", qtyLitres, notes, recordedBy },
  tx = client
) => {
  const [row] = await tx`
    INSERT INTO pfi_movements (pfi_id, order_id, action, qty_litres, notes, recorded_by)
    VALUES (${Number(pfiId)}, ${orderId ?? null}, ${action}, ${Number(qtyLitres)},
            ${notes || ""}, ${recordedBy ?? null})
    ON CONFLICT (order_id, action) DO NOTHING
    RETURNING *
  `;
  return row || null;
};

const listMovements = async (pfiId) => {
  return client`
    SELECT m.*, o.order_number, o.status AS order_status,
           COALESCE(NULLIF(TRIM(c.company_name), ''), c.name) AS customer_name
    FROM pfi_movements m
    LEFT JOIN orders o ON o.id = m.order_id
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE m.pfi_id = ${Number(pfiId)}
    ORDER BY m.created_at DESC
  `;
};

module.exports = {
  aggregatesFor,
  ensureCategoryForPfi,
  renameCategoryForPfi,
  findCategoryById,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  countExpensesInCategory,
  autoPopulateCategories,
  findExpenseById,
  listExpensesForPfi,
  listExpenses,
  findExpenseFull,
  createExpense,
  updateExpense,
  softDeleteExpense,
  listComments,
  addComment,
  writeAudit,
  recordMovement,
  listMovements,
};
