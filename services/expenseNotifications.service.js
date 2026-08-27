const { client } = require("../db");
const { notify } = require("../notifications");
const chain = require("../lib/expenseChain");

/**
 * Who hears about each stage, by role rather than by name — adding a second
 * officer needs no code change here.
 *
 * `includeSubmitter` adds the person who raised the request on top of the
 * role, for the three middle stages where they would otherwise hear nothing
 * between submitting it and it being paid or rejected — PAID/REJECTED
 * already reach them via `participants`, and PENDING doesn't need it because
 * they are the one who just acted (see the actor filter below).
 */
const STAGE_RECIPIENTS = {
  [chain.STATUS.PENDING]: { roles: [chain.ROLE.OFFICER], title: "New expense awaiting verification" },
  [chain.STATUS.VERIFIED]: {
    roles: [chain.ROLE.CFO],
    includeSubmitter: true,
    title: "Expense verified — your approval needed",
  },
  [chain.STATUS.AUDIT_APPROVED]: {
    roles: [chain.ROLE.ADMIN],
    includeSubmitter: true,
    title: "Expense approved — final sign-off needed",
  },
  [chain.STATUS.ADMIN_APPROVED]: {
    roles: [chain.ROLE.OFFICER],
    includeSubmitter: true,
    title: "Expense authorised — ready to pay",
  },
  // These two go to everyone who touched the request, not to a role.
  [chain.STATUS.PAID]: { participants: true, title: "Expense paid" },
  [chain.STATUS.REJECTED]: { participants: true, title: "Expense rejected" },
  [chain.STATUS.CHANGES_REQUESTED]: { submitterOnly: true, title: "Expense sent back for changes" },
};

const naira = (v) =>
  `₦${Number(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Staff holding any of these roles, active only. */
const staffWithRoles = async (roles) => {
  if (!roles?.length) return [];
  const rows = await client`
    SELECT id FROM staff
    WHERE is_active = true AND roles && ${roles}
  `;
  return rows.map((r) => r.id);
};

/**
 * The two display names the copy quotes that are not on the expense row.
 *
 * `pfi_expenses` stores `category_id` and `added_by`, not their names, so
 * reading `expense.category_name` off the row — as an earlier pass here did —
 * yields undefined and renders a blank "Category:" line in the mail. One small
 * read is cheaper than a silently empty email.
 */
const labelsFor = async (expense) => {
  const [category, submitter] = await Promise.all([
    expense.category_id
      ? client`SELECT name FROM expense_categories WHERE id = ${Number(expense.category_id)}`
      : Promise.resolve([]),
    expense.added_by ?? expense.recorded_by
      ? client`SELECT first_name, surname FROM staff WHERE id = ${Number(expense.added_by ?? expense.recorded_by)}`
      : Promise.resolve([]),
  ]);
  return {
    categoryName: category[0]?.name || "",
    submitterName: submitter[0]
      ? [submitter[0].first_name, submitter[0].surname].filter(Boolean).join(" ")
      : "",
  };
};

/** Everyone who has signed or raised this request. */
const participantsOf = (e) =>
  [e.added_by, e.recorded_by, e.verified_by, e.audit_approved_by, e.admin_approved_by, e.paid_by]
    .filter((v) => v != null)
    .map(Number);

/**
 * Announce a stage change.
 *
 * Recipients are resolved here (cheap DB reads) and the write is a single
 * bulk insert. Nothing in this function is awaited by the request handler —
 * see the call site — because sending inline once cost a production outage:
 * an SMTP connect plus one HTTP call per SMS recipient, sequentially inside
 * the POST, outran the worker timeout. The worker was killed, the browser saw
 * a bare network failure, and users retried an expense that had already
 * committed.
 */
async function notifyExpenseStage({ expense, stage, note, actorId, actorName }) {
  const spec = STAGE_RECIPIENTS[stage];
  if (!spec) return;

  let recipients = [];
  if (spec.participants) recipients = participantsOf(expense);
  else if (spec.submitterOnly) recipients = [expense.added_by ?? expense.recorded_by].filter(Boolean).map(Number);
  else {
    recipients = await staffWithRoles(spec.roles);
    if (spec.includeSubmitter) {
      const submitterId = expense.added_by ?? expense.recorded_by;
      if (submitterId != null) recipients.push(Number(submitterId));
    }
  }

  // Whoever just acted already knows.
  recipients = [...new Set(recipients)].filter((id) => Number(id) !== Number(actorId));
  if (recipients.length === 0) return;

  /**
   * Routed through notify() rather than written straight to the inbox.
   *
   * This used to call notificationRepo.createMany, which meant an approver only
   * ever saw the request if they happened to open the dashboard — the chain
   * could sit for a day on someone who was in the field. The Django system it
   * replaces mailed each stage AND sent a one-line SMS, and going through the
   * engine restores both while adding what the direct write never had: a row in
   * notification_deliveries, per-officer preference and quiet-hours gating, and
   * push to the mobile app. The copy for all seven stages lives in
   * notifications/catalog.js under `expense.*`.
   */
  const { categoryName, submitterName } = await labelsFor(expense);

  await notify(`expense.${stage}`, {
    to: recipients.map((staffId) => ({ staffId })),
    data: {
      expenseId: expense.id,
      status: stage,
      label: chain.STATUS_LABELS[stage] || stage,
      amount: expense.amount,
      // `description` is what the SMS quotes in brackets; fall back through the
      // fields most likely to identify the request to someone reading a text.
      description: expense.description || categoryName || expense.vendor || "",
      category: categoryName,
      vendor: expense.vendor || "",
      payeeAccountName: expense.payee_account_name || "",
      payeeBankName: expense.payee_bank_name || "",
      payeeAccountNumber: expense.payee_account_number || "",
      submitterName,
      note: note ? String(note).trim() : "",
      actorName: actorName || "",
    },
  });
}

/**
 * Announce a comment to everyone already involved.
 *
 * Role-based recipients would be wrong here: a question about one request
 * concerns the people on that request, not every officer in the company. The
 * submitter is always in `participantsOf`, which is what makes an answer
 * possible at all.
 */
async function notifyExpenseComment({ expense, body, actorId, actorName }) {
  const recipients = [...new Set(participantsOf(expense))]
    .filter((id) => Number(id) !== Number(actorId));
  if (recipients.length === 0) return;

  const { categoryName, submitterName } = await labelsFor(expense);

  await notify("expense.comment", {
    to: recipients.map((staffId) => ({ staffId })),
    data: {
      expenseId: expense.id,
      status: expense.status,
      label: chain.STATUS_LABELS[expense.status] || expense.status,
      amount: expense.amount,
      description: expense.description || categoryName || expense.vendor || "",
      category: categoryName,
      vendor: expense.vendor || "",
      submitterName,
      note: String(body || "").trim(),
      actorName: actorName || "",
    },
  });
}

module.exports = { notifyExpenseStage, notifyExpenseComment, STAGE_RECIPIENTS };
