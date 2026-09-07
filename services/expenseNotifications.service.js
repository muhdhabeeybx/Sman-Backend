const { client } = require("../db");
const { notify } = require("../notifications");
const chain = require("../lib/expenseChain");

/**
 * Who hears about each stage, by role rather than by name — adding a second
 * officer needs no code change here.
 *
 * The role lists are READ OFF THE TRANSITIONS rather than repeated here. A
 * stage notification answers exactly one question — "who has to act next?" —
 * and lib/expenseChain.js already holds that answer; keeping a second copy of
 * it meant the two could disagree, and they did: `verify` was widened to admit
 * an admin while `pending` went on naming the Expenditure Officer alone, so
 * the role that could clear the queue was never told a queue existed. Derived,
 * a role added to a transition starts being notified in the same commit that
 * grants it the power to act.
 *
 * `includeSubmitter` adds the person who raised the request on top of the
 * role, for the three middle stages where they would otherwise hear nothing
 * between submitting it and it being paid or rejected — PAID/REJECTED
 * already reach them via `participants`, and PENDING doesn't need it because
 * they are the one who just acted (see the actor filter below).
 */

/**
 * A stage's role recipients: whoever may perform the transition that leaves it,
 * minus the super admin.
 *
 * The subtraction is the whole point and has to be deliberate. Super admin can
 * perform EVERY transition in the chain, so deriving verbatim would put every
 * super admin on every stage of every request — an override role paged about
 * work that is not its own, four times per expense. They stay reachable as
 * `participants` on anything they actually touched, which is the difference
 * between "you may step in" and "this is yours to do".
 *
 * This is also why an empty result is a real possibility and not a defect to
 * code around: `expense.pending` resolved to nobody for the whole life of the
 * system because ROLE.OFFICER was assigned to no staff member, and
 * notifyExpenseStage returned before notify() was ever reached. That is a
 * staffing gap to fix in the roles table, not here — the code correctly says
 * "no one holds this job".
 */
const stageRoles = (action) =>
  chain.TRANSITIONS[action].roles.filter((role) => role !== chain.ROLE.SUPER);

/**
 * `actionNeeded` marks a stage that is somebody's turn.
 *
 * It is what decides who is worth a text. At these four the chain is stopped
 * until a named role does something — the officer verifies, the CFO approves,
 * the admin signs off, the officer pays — and a request sitting unnoticed is
 * money not moving. The role holders are the point of the SMS, not a side
 * effect of it.
 *
 * The stages without it are announcements. Paid and rejected have already
 * happened and nobody is waiting on anybody, so they reach the people who
 * touched the request in the app and by email, and buzz only the person whose
 * request it was.
 */
const STAGE_RECIPIENTS = {
  [chain.STATUS.PENDING]: {
    roles: stageRoles("verify"),
    actionNeeded: true,
    title: "New expense awaiting verification",
  },
  [chain.STATUS.VERIFIED]: {
    roles: stageRoles("audit_approve"),
    includeSubmitter: true,
    actionNeeded: true,
    title: "Expense verified — your approval needed",
  },
  [chain.STATUS.AUDIT_APPROVED]: {
    roles: stageRoles("admin_approve"),
    includeSubmitter: true,
    actionNeeded: true,
    title: "Expense approved — final sign-off needed",
  },
  [chain.STATUS.ADMIN_APPROVED]: {
    roles: stageRoles("mark_paid"),
    includeSubmitter: true,
    actionNeeded: true,
    title: "Expense authorised — ready to pay",
  },
  // These two go to everyone who touched the request, not to a role.
  [chain.STATUS.PAID]: { participants: true, title: "Expense paid" },
  [chain.STATUS.REJECTED]: { participants: true, title: "Expense rejected" },
  [chain.STATUS.CHANGES_REQUESTED]: { submitterOnly: true, title: "Expense sent back for changes" },
};

const naira = (v) =>
  `₦${Number(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Told, not interrupted: the app, a push and an email, but no SMS.
 *
 * Deliberately not app-only. Email is how somebody who does not open the
 * dashboard still finds out, which was half of what the blanket SMS was doing.
 */
const QUIET_CHANNELS = ["in_app", "push", "email"];

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
   * Who gets a text, as against who gets told.
   *
   * A text is for the two people it can actually move: whoever has to act now,
   * and whoever the request belongs to. Everything else is an announcement and
   * belongs in the app and the inbox.
   *
   * So on a stage that is somebody's turn, the role holders ARE the audience —
   * the officer waiting to verify, the CFO waiting to approve — because an
   * unnoticed request is money that has stopped moving. On a stage that has
   * already happened, only the submitter is buzzed; the others who touched it
   * are told without being interrupted.
   */
  const submitterId = expense.added_by ?? expense.recorded_by;
  const isSubmitter = (id) => Number(id) === Number(submitterId);

  const texted = spec.actionNeeded ? recipients : recipients.filter(isSubmitter);
  const quiet = recipients.filter((id) => !texted.includes(id));

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

  const data = {
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
  };

  // Same message, same moment, two audiences — separated only by whether a
  // phone should buzz. Channels are restricted rather than the catalog being
  // changed, so a stage's copy stays defined in exactly one place.
  await Promise.all([
    quiet.length
      ? notify(`expense.${stage}`, {
          to: quiet.map((staffId) => ({ staffId })),
          channels: QUIET_CHANNELS,
          data,
        })
      : null,
    texted.length
      ? notify(`expense.${stage}`, { to: texted.map((staffId) => ({ staffId })), data })
      : null,
  ]);
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
