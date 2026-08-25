const asyncHandler = require("express-async-handler");
const { pfiExpenseRepo, pfiRepo, staffRepo, notificationRepo, vendorRepo } = require("../../repositories");
const { client } = require("../../db");
const chain = require("../../lib/expenseChain");
const gl = require("../../lib/glAccounts");
const {
  notifyExpenseStage, notifyExpenseComment,
} = require("../../services/expenseNotifications.service");
const { deleteFile, generateSignature } = require("../../services/upload.service");

function httpErr(status, message) {
  return Object.assign(new Error(message), { status });
}

const parseDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/** Display name for the audit trail; the FK is what actually identifies them. */
const actorFor = async (req) => {
  const id = req.user?.id ?? null;
  if (!id) return { actorId: null, actorName: "" };
  try {
    const s = await staffRepo.findById(id);
    const name = s ? `${s.firstName || ""} ${s.surname || ""}`.trim() : "";
    return { actorId: id, actorName: name || req.user?.email || "" };
  } catch {
    return { actorId: id, actorName: req.user?.email || "" };
  }
};

/**
 * The whole PFI linkage, in one function.
 *
 * An expense names a GL account, and — when that account is a direct product
 * cost — the cargo the cost belongs to. Those are two independent choices, so
 * both are checked here and nowhere else:
 *
 *   · a `pfi_direct` account must name a PFI, or the cost lands nowhere;
 *   · every other account must not, so a general overhead can never quietly
 *     inflate one batch's cost;
 *   · an `income` account is refused outright — it is not an expense.
 *
 * Legacy per-PFI categories predate the chart and have no GL group. They keep
 * their old behaviour exactly: the category carries the link and the body's
 * `pfi_id` is ignored, so historical rows still edit cleanly.
 */
const resolveBooking = async (categoryId, rawPfiId) => {
  const category = await pfiExpenseRepo.findCategoryById(categoryId);
  if (!category) throw httpErr(400, "Category not found");

  const group = gl.groupFor(category.gl_group);
  if (group?.isIncome) {
    throw httpErr(400, `${category.name} is an income account — it cannot carry an expense`);
  }
  if (!group) return { category, pfiId: category.pfi_id || null };
  if (!group.requiresPfi) return { category, pfiId: null };

  const pfiId = Number(rawPfiId);
  if (!Number.isFinite(pfiId) || pfiId <= 0) {
    throw httpErr(400, `${category.name} must name the PFI the cost belongs to`);
  }
  const pfi = await pfiRepo.findById(pfiId);
  if (!pfi) throw httpErr(400, "PFI not found");

  return { category, pfiId };
};

/**
 * The invoice arithmetic, filled in where the caller left it out.
 *
 * Nothing here is forced: a figure that arrives is trusted, because an invoice
 * can carry a VAT that is not exactly 7.5% and refusing it would just mean the
 * line never gets recorded. Only the blanks are computed.
 *
 * `null` is preserved rather than zeroed — a payment with no invoice behind it
 * must not read as an invoice worth ₦0.
 */
const money = (val) => {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const invoiceFigures = (body) => {
  const exVat = money(body.amount_ex_vat ?? body.amountExVat);
  let vat = money(body.vat_amount ?? body.vatAmount);
  let invoice = money(body.invoice_amount ?? body.invoiceAmount);
  const rate = money(body.wht_rate ?? body.whtRate);
  let wht = money(body.wht_deduction ?? body.whtDeduction);

  if (exVat !== null && vat === null) vat = Math.round(exVat * gl.VAT_RATE * 100) / 100;
  if (exVat !== null && invoice === null) invoice = Math.round((exVat + (vat || 0)) * 100) / 100;
  // A rate with no amount is resolved here so the two can never disagree.
  // Withholding is computed on the ex-VAT value, never the gross.
  if (rate !== null && wht === null && exVat !== null) {
    wht = Math.round(exVat * (rate / 100) * 100) / 100;
  }

  return {
    amount_ex_vat: exVat === null ? null : String(exVat),
    vat_amount: vat === null ? null : String(vat),
    invoice_amount: invoice === null ? null : String(invoice),
    wht_deduction: String(wht ?? 0),
    wht_rate: rate === null ? null : String(rate),
  };
};

/** The plain text fields, read in either casing. */
const pick = (body, snake, camel) => body[snake] ?? body[camel];

// ─── Categories ─────────────────────────────────────────────────────────────

/**
 * The chart, shaped for the two-step picker: group first, then the account.
 *
 * Subgroups come out in GL-code order rather than as a lookup, so the headings
 * a group shows are exactly the runs its codes already form.
 */
const buildGroups = (rows) =>
  gl.GL_GROUPS.map((group) => {
    const accounts = rows.filter((r) => r.gl_group === group.code);
    const subgroups = [];
    for (const account of accounts) {
      const label = account.gl_subgroup || "";
      const last = subgroups[subgroups.length - 1];
      if (last && last.label === label) last.accounts.push(account);
      else subgroups.push({ label, accounts: [account] });
    }
    return { ...group, accounts, subgroups };
  }).filter((g) => g.accounts.length > 0);

const listCategories = asyncHandler(async (req, res) => {
  const rows = await pfiExpenseRepo.listCategories();

  // `general` and `pfi` are the original split, kept as they were. `groups` is
  // the chart, and what the picker actually reads.
  const general = rows.filter((r) => !r.pfi_id);
  const pfi = rows.filter((r) => r.pfi_id);

  res.json({
    success: true,
    data: {
      categories: rows,
      general,
      pfi,
      groups: buildGroups(rows),
      /** The withholding rates the form offers; see lib/glAccounts.js. */
      wht_rates: gl.WHT_RATES,
      /** Pre-chart categories still attached to historical rows. */
      unmapped: rows.filter((r) => !r.pfi_id && !r.gl_group),
      vat_rate: gl.VAT_RATE,
    },
  });
});

const createCategory = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) throw httpErr(400, "Category name is required");

  const rows = await pfiExpenseRepo.listCategories();
  if (rows.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    throw httpErr(409, "A category with this name already exists");
  }

  const glCode = String(pick(req.body, "gl_code", "glCode") || "").trim();
  const glGroup = String(pick(req.body, "gl_group", "glGroup") || "").trim();
  if (glGroup && !gl.groupFor(glGroup)) throw httpErr(400, "Unknown GL group");
  if (glCode && rows.some((c) => c.gl_code === glCode)) {
    throw httpErr(409, `GL code ${glCode} is already in use`);
  }

  const category = await pfiExpenseRepo.createCategory(name, {
    glCode,
    glGroup,
    glSubgroup: String(pick(req.body, "gl_subgroup", "glSubgroup") || "").trim(),
  });
  res.status(201).json({ success: true, message: "Category created", data: { category } });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await pfiExpenseRepo.findCategoryById(req.params.id);
  if (!category) throw httpErr(404, "Category not found");
  // A PFI-backed category takes its name from the PFI. Renaming it here would
  // put the two out of step on the next PFI edit.
  if (category.is_system_category) {
    throw httpErr(400, "This category belongs to a PFI — rename the PFI instead");
  }

  // Omitted means "leave it alone", not "clear it".
  const name = req.body.name !== undefined ? String(req.body.name).trim() : category.name;
  if (!name) throw httpErr(400, "Category name is required");

  const rows = await pfiExpenseRepo.listCategories();
  if (rows.some((c) => c.id !== category.id && c.name.toLowerCase() === name.toLowerCase())) {
    throw httpErr(409, "A category with this name already exists");
  }

  const patch = { name };

  // The code is a label on the account and can be corrected freely — expense
  // lines reference the account by id, so renumbering re-files nothing.
  const glCode = pick(req.body, "gl_code", "glCode");
  if (glCode !== undefined) {
    const code = String(glCode).trim();
    if (code && rows.some((c) => c.id !== category.id && c.gl_code === code)) {
      throw httpErr(409, `GL code ${code} is already in use`);
    }
    patch.gl_code = code || null;
  }

  const glSubgroup = pick(req.body, "gl_subgroup", "glSubgroup");
  if (glSubgroup !== undefined) patch.gl_subgroup = String(glSubgroup).trim();

  // The group is different. It decides whether the account takes a PFI, so
  // moving a live account between groups would leave every line already posted
  // to it on the wrong side of that rule — a cargo cost with no cargo, or an
  // overhead sitting inside a batch. Allowed only while the account is unused.
  const glGroup = pick(req.body, "gl_group", "glGroup");
  if (glGroup !== undefined) {
    const next = String(glGroup).trim() || null;
    if (next && !gl.groupFor(next)) throw httpErr(400, "Unknown GL group");
    if (next !== (category.gl_group || null)) {
      const inUse = await pfiExpenseRepo.countExpensesInCategory(category.id);
      if (inUse > 0) {
        throw httpErr(
          400,
          `${inUse} expense line(s) are already posted to this account — ` +
            "create a new account instead of moving this one",
        );
      }
      patch.gl_group = next;
    }
  }

  const updated = await pfiExpenseRepo.updateCategory(category.id, patch);
  res.json({ success: true, message: "Account updated", data: { category: updated } });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await pfiExpenseRepo.findCategoryById(req.params.id);
  if (!category) throw httpErr(404, "Category not found");
  if (category.is_system_category) {
    throw httpErr(400, "This category belongs to a PFI and cannot be deleted");
  }
  // A used account is never deleted, GL or not: the lines posted to it would
  // lose the only record of where they were booked. The in-use check below is
  // the whole rule — an unused account created by mistake is just a mistake.
  const inUse = await pfiExpenseRepo.countExpensesInCategory(category.id);
  if (inUse > 0) {
    throw httpErr(400, `Cannot delete: ${inUse} expense line(s) still use this category`);
  }

  await pfiExpenseRepo.deleteCategory(category.id);
  res.json({ success: true, message: "Category deleted" });
});

/** Repair pass for PFIs that predate the category table. */
const autoPopulateCategories = asyncHandler(async (req, res) => {
  const created = await pfiExpenseRepo.autoPopulateCategories();
  res.json({
    success: true,
    message: created.length
      ? `Created ${created.length} missing PFI categor${created.length === 1 ? "y" : "ies"}`
      : "Every PFI already has a category",
    data: { created },
  });
});

// ─── Expenses ───────────────────────────────────────────────────────────────

const listExpenses = asyncHandler(async (req, res) => {
  // Outside the visibility roles you see only what you raised. Applied here so
  // every count, total, page and the bank list all inherit it.
  const oversight = chain.canSeeAllExpenses(req.user);
  // The "My Requests" page asks for this explicitly, so even an oversight
  // role — who can otherwise see everyone's spend — gets just their own.
  const mine = req.query.mine === "true" || req.query.mine === "1";

  const result = await pfiExpenseRepo.listExpenses({
    search: req.query.search,
    categoryId: req.query.category,
    glGroup: req.query.group,
    pfiId: req.query.pfi,
    vendorId: req.query.vendor,
    bank: req.query.bank,
    submitterId: req.query.submitter,
    type: req.query.type,
    status: req.query.status,
    month: req.query.month,
    dateFrom: parseDate(req.query.dateFrom),
    dateTo: parseDate(req.query.dateTo),
    page: req.query.page,
    limit: req.query.limit,
    onlySubmitterId: oversight && !mine ? null : req.user?.id ?? -1,
    scopeUser: req.user,
  });

  res.json({
    success: true,
    data: {
      ...result,
      expenses: decorate(result.expenses, req.user),
      // Tells the page whose entries are on screen, rather than leaving someone
      // wondering why a colleague's row is missing.
      scope: oversight && !mine ? "all" : "own",
      // Seeing everyone's requests and being able to action them are separate
      // questions — `audit` reads the queue without acting on it.
      can_review: chain.canOversee(req.user),
      statuses: Object.entries(chain.STATUS_LABELS).map(([value, label]) => ({ value, label })),
    },
  });
});

/**
 * Resolves a vendor_id (if given) to the name that gets snapshotted onto the
 * expense row. `vendor` never becomes a live lookup — renaming a vendor later
 * must not rewrite an expense raised against the old name.
 */
const vendorFor = async (body) => {
  const vendorId = pick(body, "vendor_id", "vendorId");
  if (!vendorId) return { vendorId: null, vendorName: body.vendor || "" };
  const vendor = await vendorRepo.findById(vendorId);
  if (!vendor) throw httpErr(400, "Vendor not found");
  return { vendorId: vendor.id, vendorName: vendor.name };
};

const createExpense = asyncHandler(async (req, res) => {
  const categoryId = req.body.category_id ?? req.body.categoryId ?? req.body.category;
  if (!categoryId) throw httpErr(400, "Category is required");

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < 0) throw httpErr(400, "Amount must be a positive number");

  const { pfiId } = await resolveBooking(categoryId, req.body.pfi_id ?? req.body.pfiId);
  const { actorId, actorName } = await actorFor(req);
  const { vendorId, vendorName } = await vendorFor(req.body);

  const expense = await pfiExpenseRepo.createExpense({
    pfi_id: pfiId,
    category_id: Number(categoryId),
    expense_date: parseDate(req.body.expense_date ?? req.body.expenseDate) || new Date().toISOString(),
    vendor: vendorName,
    vendor_id: vendorId,
    tin_number: pick(req.body, "tin_number", "tinNumber") ?? "",
    invoice_number: pick(req.body, "invoice_number", "invoiceNumber") ?? "",
    description: req.body.description || "",
    // The money that leaves the bank. The invoice columns document it; they
    // never replace it.
    amount: String(amount),
    ...invoiceFigures(req.body),
    bank_paid_from: req.body.bank_paid_from ?? req.body.bankPaidFrom ?? "",
    receipt_reference: req.body.receipt_reference ?? req.body.receiptReference ?? "",
    payee_bank_name: req.body.payee_bank_name ?? req.body.payeeBankName ?? "",
    bank_code: pick(req.body, "bank_code", "bankCode") ?? "",
    payee_account_number: req.body.payee_account_number ?? req.body.payeeAccountNumber ?? "",
    payee_account_name: req.body.payee_account_name ?? req.body.payeeAccountName ?? "",
    // A new request always enters at the start of the chain.
    status: chain.STATUS.PENDING,
    entered_by: actorName,
    recorded_by: actorId,
    added_by: actorId,
  });

  await pfiExpenseRepo.writeAudit({
    expenseId: expense.id,
    action: "created",
    changes: expense,
    actorId,
    actorName,
  });

  notifyExpenseStage({
    expense, stage: chain.STATUS.PENDING, note: "", actorId, actorName,
  }).catch(() => {});

  res.status(201).json({
    success: true,
    message: "Payment request raised",
    data: { expense: decorate([expense], req.user)[0] },
  });
});

const updateExpense = asyncHandler(async (req, res) => {
  const existing = await pfiExpenseRepo.findExpenseById(req.params.id);
  if (!existing) throw httpErr(404, "Expense not found");
  if (existing.deleted_at) throw httpErr(400, "This expense has been deleted");

  // Anyone on the request may edit it; a paid one is closed to everybody.
  // See chain.canEditExpense — the rule lives there with the rest of them.
  const gate = chain.canEditExpense(existing, req.user);
  if (!gate.ok) throw httpErr(gate.status, gate.message);

  const data = {};

  // The account and the cargo are re-resolved together: moving a line onto an
  // administrative account has to clear its PFI, and moving it onto a direct
  // cost has to be given one. Touching either field runs the same check the
  // create path runs.
  const categoryId = req.body.category_id ?? req.body.categoryId ?? req.body.category;
  const bodyPfiId = req.body.pfi_id ?? req.body.pfiId;
  if (categoryId !== undefined || bodyPfiId !== undefined) {
    const effectiveCategory = categoryId !== undefined ? categoryId : existing.category_id;
    const effectivePfi = bodyPfiId !== undefined ? bodyPfiId : existing.pfi_id;
    const { pfiId } = await resolveBooking(effectiveCategory, effectivePfi);
    data.category_id = Number(effectiveCategory);
    data.pfi_id = pfiId;
  }

  if (req.body.amount !== undefined) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw httpErr(400, "Amount must be a positive number");
    }
    data.amount = String(amount);
  }

  const date = req.body.expense_date ?? req.body.expenseDate;
  if (date !== undefined) data.expense_date = parseDate(date);

  // vendor_id and vendor move together — resolving one from the other here,
  // rather than in the pass-through list below, keeps a stale `vendor` string
  // in the same request body from ever winning over a freshly picked vendor_id.
  if (pick(req.body, "vendor_id", "vendorId") !== undefined || req.body.vendor !== undefined) {
    const { vendorId, vendorName } = await vendorFor(req.body);
    data.vendor_id = vendorId;
    data.vendor = vendorName;
  }

  // Everything else is a straight pass-through, in either casing. The invoice
  // figures move as a set — recomputing one from a stale sibling is how a
  // schedule ends up not adding up.
  const TEXT_FIELDS = [
    ["tin_number", "tinNumber"],
    ["invoice_number", "invoiceNumber"],
    ["description", "description"],
    ["bank_paid_from", "bankPaidFrom"],
    ["receipt_reference", "receiptReference"],
    ["payee_bank_name", "payeeBankName"],
    ["bank_code", "bankCode"],
    ["payee_account_number", "payeeAccountNumber"],
    ["payee_account_name", "payeeAccountName"],
  ];
  for (const [snake, camel] of TEXT_FIELDS) {
    const value = pick(req.body, snake, camel);
    if (value !== undefined) data[snake] = value;
  }

  const touchesInvoice = [
    "amount_ex_vat", "amountExVat", "vat_amount", "vatAmount",
    "invoice_amount", "invoiceAmount", "wht_deduction", "whtDeduction",
    "wht_rate", "whtRate",
  ].some((k) => req.body[k] !== undefined);
  if (touchesInvoice) Object.assign(data, invoiceFigures(req.body));

  if (Object.keys(data).length === 0) {
    return res.json({ success: true, message: "Nothing to update", data: { expense: existing } });
  }

  const { actorId, actorName } = await actorFor(req);
  data.edited_by = actorId;

  // Correcting a rejected or sent-back request resubmits it. Without this the
  // entry either sits in a dead state forever, or — worse — a corrected amount
  // slides back into cost without anyone signing it off a second time.
  const resubmitting =
    existing.status === chain.STATUS.REJECTED ||
    existing.status === chain.STATUS.CHANGES_REQUESTED;
  if (resubmitting) {
    data.status = chain.STATUS.PENDING;
    data.review_note = "";
    data.reviewed_by = null;
    data.reviewed_at = null;
  }

  const updated = await pfiExpenseRepo.updateExpense(existing.id, data);

  // Only these fields are worth a diff; the rest is noise in the trail.
  const TRACKED = [
    "expense_date", "category_id", "pfi_id", "vendor", "vendor_id", "description",
    "amount", "bank_paid_from", "receipt_reference",
    "tin_number", "invoice_number", "amount_ex_vat", "vat_amount",
    "invoice_amount", "wht_deduction", "wht_rate",
  ];
  const diff = {};
  for (const f of TRACKED) {
    if (data[f] !== undefined && String(existing[f] ?? "") !== String(updated[f] ?? "")) {
      diff[f] = [existing[f], updated[f]];
    }
  }

  await pfiExpenseRepo.writeAudit({
    expenseId: existing.id,
    action: "updated",
    changes: diff,
    actorId,
    actorName,
  });

  if (resubmitting) {
    await pfiExpenseRepo.writeAudit({
      expenseId: existing.id,
      action: "submitted",
      changes: { status: [existing.status, chain.STATUS.PENDING], note: "Corrected and resubmitted" },
      actorId,
      actorName,
    });
    notifyExpenseStage({
      expense: updated, stage: chain.STATUS.PENDING, note: "Corrected and resubmitted", actorId, actorName,
    }).catch(() => {});
  }

  res.json({
    success: true,
    message: resubmitting ? "Corrected and resubmitted for verification" : "Expense updated",
    data: { expense: decorate([updated], req.user)[0] },
  });
});

// Deletable up to "with CFO" — past that the chain has already spent effort
// approving it, and a reject/send-back is the honest way to unwind it so the
// paperwork remembers why, rather than the row just vanishing.
/**
 * Deletable until the money leaves.
 *
 * This was pending / changes_requested / verified, on the reasoning that past
 * "With CFO" the chain has spent effort and a reject records why. In practice
 * that left the officer who raised a request unable to withdraw their own
 * mistake — a duplicate, a wrong payee — once anyone had approved it, and
 * "reject" is the reviewer's verb, not the raiser's; it reads as a judgement
 * on the request rather than as taking it back.
 *
 * A paid expense stays undeletable: once the bank has moved, the row is a
 * record of what happened, not a proposal. Same line edit already draws, so
 * the two rules now agree.
 */
const isDeletableStatus = (status) => status !== chain.STATUS.PAID;

const deleteExpense = asyncHandler(async (req, res) => {
  const existing = await pfiExpenseRepo.findExpenseById(req.params.id);
  if (!existing) throw httpErr(404, "Expense not found");
  if (existing.deleted_at) {
    return res.json({ success: true, message: "Expense already deleted" });
  }

  const isOwner =
    req.user?.id != null &&
    Number(existing.added_by ?? existing.recorded_by) === Number(req.user.id);
  if (!isOwner && !chain.canOversee(req.user)) {
    throw httpErr(403, "You can only delete a request you raised");
  }
  if (!isDeletableStatus(existing.status)) {
    throw httpErr(
      400,
      "This expense is paid and closed — it can no longer be deleted.",
    );
  }

  const deleted = await pfiExpenseRepo.softDeleteExpense(existing.id);
  const { actorId, actorName } = await actorFor(req);

  await pfiExpenseRepo.writeAudit({
    expenseId: existing.id,
    action: "delete",
    changes: existing,
    actorId,
    actorName,
  });

  res.json({ success: true, message: "Expense deleted", data: { expense: deleted } });
});



// ─── The approval chain ──────────────────────────────────────────────────────

/** Decorate rows with what this viewer may do, and why not when they can't. */
const decorate = (rows, user) =>
  rows.map((e) => {
    const { actions, reason } = chain.availableActions(
      { status: e.status, addedBy: e.added_by, recordedBy: e.recorded_by },
      user,
    );
    return {
      ...e,
      // Whoever raised it — a clean id the client can compare against its own
      // user without duplicating the added_by/recorded_by fallback rule.
      submitted_by_id: e.added_by ?? e.recorded_by ?? null,
      status_label: chain.STATUS_LABELS[e.status] || e.status,
      status_step: chain.STATUS_STEP[e.status] ?? 0,
      total_steps: chain.TOTAL_STEPS,
      available_actions: actions,
      action_blocked_reason: reason,
    };
  });

const getExpense = asyncHandler(async (req, res) => {
  const expense = await pfiExpenseRepo.findExpenseFull(req.params.id);
  if (!expense || expense.deleted_at) throw httpErr(404, "Expense not found");
  // Salaries and settlements pass through here, so the detail view is the chain
  // plus the person who raised it — not every authenticated member of staff.
  if (!chain.canSeeExpense(expense, req.user)) throw httpErr(403, "This request is not yours to view");

  res.json({
    success: true,
    data: {
      expense: decorate([expense], req.user)[0],
      /** Anyone who can see it can join the conversation. */
      can_comment: true,
    },
  });
});

// ─── The conversation ───────────────────────────────────────────────────────

/**
 * A reviewer's query and the requester's answer, on the request itself.
 *
 * Kept out of `review_note`, which holds only the newest reason and is cleared
 * when a sent-back request is resubmitted — precisely when the exchange that
 * caused it matters most.
 */
const listComments = asyncHandler(async (req, res) => {
  const expense = await pfiExpenseRepo.findExpenseById(req.params.id);
  if (!expense || expense.deleted_at) throw httpErr(404, "Expense not found");
  if (!chain.canSeeExpense(expense, req.user)) throw httpErr(403, "This request is not yours to view");

  const comments = await pfiExpenseRepo.listComments(expense.id);
  res.json({ success: true, data: { comments } });
});

const addComment = asyncHandler(async (req, res) => {
  const expense = await pfiExpenseRepo.findExpenseById(req.params.id);
  if (!expense || expense.deleted_at) throw httpErr(404, "Expense not found");
  if (!chain.canSeeExpense(expense, req.user)) throw httpErr(403, "This request is not yours to comment on");

  const body = String(req.body.body ?? req.body.comment ?? "").trim();
  if (!body) throw httpErr(400, "Write something first");
  if (body.length > 2000) throw httpErr(400, "Keep a comment under 2000 characters");

  const { actorId, actorName } = await actorFor(req);
  const comment = await pfiExpenseRepo.addComment({
    expenseId: expense.id, body, authorId: actorId, authorName: actorName,
  });

  // Everyone who has touched the request hears about it — including the person
  // who raised it, which is the only way a query ever gets answered.
  notifyExpenseComment({ expense, body, actorId, actorName }).catch(() => {});

  res.status(201).json({ success: true, message: "Comment added", data: { comment } });
});

/**
 * The single path by which status moves. It is read-only on every other
 * endpoint — one writer, or the audit trail is fiction.
 */
/**
 * What the Expenditure Officer supplies when the money actually moves.
 *
 * Both are required, and for the same reason: a payment nobody can trace to an
 * account, for an amount nobody recorded, is not a payment — it is a rumour.
 * The amount is captured separately from `amount` rather than overwriting it,
 * so the request and the settlement can be compared afterwards.
 */
const paymentFor = (body, existing) => {
  const bank = String(pick(body, "bank_paid_from", "bankPaidFrom") ?? "").trim();
  if (!bank) throw httpErr(400, "Say which account this was paid from");

  const raw = pick(body, "amount_paid", "amountPaid");
  const paid = money(raw ?? existing.amount);
  if (paid === null || paid <= 0) throw httpErr(400, "Enter the amount actually paid");

  const paymentNotes = String(pick(body, "payment_notes", "paymentNotes") ?? "").trim();
  // A payment that settles for something other than what was approved needs a
  // reason on the record — otherwise the variance is just a number nobody
  // ever explained.
  if (paid !== money(existing.amount) && !paymentNotes) {
    throw httpErr(400, "Amount paid differs from the approved amount — explain why");
  }

  const paymentDate = parseDate(pick(body, "payment_date", "paymentDate")) || new Date().toISOString();

  return {
    bank_paid_from: bank,
    amount_paid: String(paid),
    payment_reference: String(pick(body, "payment_reference", "paymentReference") ?? "").trim(),
    payment_date: paymentDate,
    payment_method: String(pick(body, "payment_method", "paymentMethod") ?? "").trim(),
    payment_notes: paymentNotes,
  };
};

const reviewExpense = asyncHandler(async (req, res) => {
  const action = String(req.body.action || "");
  const note = String(req.body.note || "");

  const existing = await pfiExpenseRepo.findExpenseById(req.params.id);
  if (!existing || existing.deleted_at) throw httpErr(404, "Expense not found");

  const check = chain.checkTransition(
    { status: existing.status, addedBy: existing.added_by, recordedBy: existing.recorded_by },
    action,
    req.user,
    note,
  );
  if (!check.ok) {
    return res.status(check.status).json({
      success: false,
      message: check.message,
      ...(check.currentStatus ? { current_status: check.currentStatus } : {}),
    });
  }

  const { actorId, actorName } = await actorFor(req);
  const to = check.transition.to;
  const stamp = chain.STAGE_STAMPS[to];
  const now = new Date().toISOString();

  // Validated before the transaction opens, so a missing bank or amount is a
  // 400 that changes nothing rather than a rolled-back approval.
  const payment = check.transition.capturesPayment ? paymentFor(req.body, existing) : null;

  // Status, stamps and the audit row are one unit: a transition that is not
  // recorded may as well not have happened.
  const updated = await client.begin(async (tx) => {
    const set = {
      status: to,
      reviewed_by: actorId,
      reviewed_at: now,
      review_note: note || "",
      updated_at: now,
      ...(payment || {}),
    };
    if (stamp) {
      const [byCol, atCol] = stamp;
      const snake = (c) => c.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
      set[snake(byCol)] = actorId;
      set[snake(atCol)] = now;
    }
    const [row] = await tx`UPDATE pfi_expenses SET ${tx(set)} WHERE id = ${existing.id} RETURNING *`;
    // The settlement figures go into the trail too — "paid ₦96,250 of ₦100,000
    // requested, from Zenith" is the fact anyone auditing this will want, and
    // the row itself only ever holds the latest state.
    const changes = { status: [existing.status, to], note };
    if (payment) {
      changes.amount_requested = existing.amount;
      changes.amount_paid = payment.amount_paid;
      changes.bank_paid_from = payment.bank_paid_from;
      changes.payment_date = payment.payment_date;
      if (payment.payment_reference) changes.payment_reference = payment.payment_reference;
      if (payment.payment_method) changes.payment_method = payment.payment_method;
      if (payment.payment_notes) changes.payment_notes = payment.payment_notes;
    }
    await tx`
      INSERT INTO pfi_expense_audits (expense_id, action, changes, actor_id, actor_name)
      VALUES (${existing.id}, ${to}, ${JSON.stringify(changes)}, ${actorId}, ${actorName})
    `;
    return row;
  });

  // After the transaction, and never allowed to undo it: a message that fails
  // to send must not roll back an approval that already happened.
  notifyExpenseStage({ expense: updated, stage: to, note, actorId, actorName }).catch(() => {});

  const full = await pfiExpenseRepo.findExpenseFull(updated.id);
  res.json({
    success: true,
    message: `Expense ${chain.STATUS_LABELS[to].toLowerCase()}`,
    data: { expense: decorate([full], req.user)[0] },
  });
});

// ─── Attachments ─────────────────────────────────────────────────────────────
//
// Files go straight from the browser to Cloudinary with a signed upload — the
// app never proxies the bytes. These endpoints only record and remove the
// metadata, so a receipt lives behind Cloudinary's URL rather than a public
// MEDIA_URL path that 404s in production.

/**
 * A signed Cloudinary upload, scoped to expenses.
 *
 * The general `/uploads/signature` route sits behind `verifyStaff`, which
 * admits only admin and super_admin — so the person actually holding the
 * receipt could not upload it. This is the same signature under the same rule
 * as raising a request: if you can raise one, you can attach its paperwork.
 */
const attachmentSignature = asyncHandler(async (req, res) => {
  // `auto` so Cloudinary takes whatever it is handed — a PDF, a photo of a
  // teller slip, a spreadsheet. Nothing here restricts type or size; a receipt
  // is whatever the vendor gave them, and refusing it at upload just means it
  // never gets attached at all.
  const params = generateSignature({ folder: "soroman/expenses", resourceType: "auto" });
  res.json({ success: true, data: params });
});

const listAttachments = asyncHandler(async (req, res) => {
  const expense = await pfiExpenseRepo.findExpenseById(req.params.id);
  if (!expense) throw httpErr(404, "Expense not found");
  if (!chain.canSeeExpense(expense, req.user)) throw httpErr(403, "This request is not yours to view");

  const rows = await client`
    SELECT a.*, s.first_name || ' ' || s.surname AS uploaded_by_name
    FROM pfi_expense_attachments a
    LEFT JOIN staff s ON s.id = a.uploaded_by
    WHERE a.expense_id = ${expense.id}
    ORDER BY a.uploaded_at
  `;
  res.json({ success: true, data: { attachments: rows } });
});

const addAttachments = asyncHandler(async (req, res) => {
  const expense = await pfiExpenseRepo.findExpenseById(req.params.id);
  if (!expense || expense.deleted_at) throw httpErr(404, "Expense not found");
  if (!chain.canSeeExpense(expense, req.user)) {
    throw httpErr(403, "This request is not yours to add files to");
  }

  // Accepts one or many; the client uploads first, then registers here.
  const incoming = Array.isArray(req.body.files) ? req.body.files : [req.body].filter((f) => f?.url);
  if (incoming.length === 0) throw httpErr(400, "No files supplied");

  const { actorId } = await actorFor(req);
  const rows = [];
  for (const f of incoming) {
    const [row] = await client`
      INSERT INTO pfi_expense_attachments
        (expense_id, storage_key, file_name, content_type, size_bytes, type, uploaded_by)
      VALUES (${expense.id}, ${f.url || f.secure_url || f.storageKey},
              ${f.fileName || f.original_filename || ""},
              ${f.contentType || f.resource_type || ""},
              ${Number(f.sizeBytes || f.bytes || 0)}, ${f.type || null}, ${actorId})
      RETURNING *
    `;
    rows.push(row);
  }
  res.status(201).json({
    success: true,
    message: `${rows.length} file${rows.length === 1 ? "" : "s"} attached`,
    data: { attachments: rows },
  });
});

const deleteAttachment = asyncHandler(async (req, res) => {
  // Read before deleting: the file belongs to an expense, and not everyone who
  // can call this route is on that expense.
  const [existing] = await client`
    SELECT * FROM pfi_expense_attachments WHERE id = ${Number(req.params.id)}
  `;
  if (!existing) throw httpErr(404, "Attachment not found");

  const expense = await pfiExpenseRepo.findExpenseById(existing.expense_id);
  if (expense && !chain.canSeeExpense(expense, req.user)) {
    throw httpErr(403, "This request is not yours to remove files from");
  }

  const [row] = await client`
    DELETE FROM pfi_expense_attachments WHERE id = ${existing.id} RETURNING *
  `;
  if (!row) throw httpErr(404, "Attachment not found");

  // Drop the blob too — removing only the row orphans the file in storage.
  // Best-effort: the row is already gone and a failed cleanup must not 500.
  const publicId = row.public_id || row.storage_key;
  if (publicId) deleteFile(publicId).catch(() => {});

  res.json({ success: true, message: "Attachment removed" });
});

module.exports = {
  attachmentSignature,
  listAttachments,
  addAttachments,
  deleteAttachment,
  getExpense,
  reviewExpense,
  decorate,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  autoPopulateCategories,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  listComments,
  addComment,
  // Shared with the PFI controller's quick-add.
  resolveBooking,
  actorFor,
  vendorFor,
};
