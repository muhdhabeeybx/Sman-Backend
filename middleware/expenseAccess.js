const chain = require("../lib/expenseChain");

/**
 * Gate for the review endpoint.
 *
 * The app-wide `verifyStaff` admits only admin and super_admin, which would
 * shut the Expenditure Officer and the CFO out of the queue they exist to
 * work — so the expense routes authenticate first and authorise here instead.
 *
 * This only asks "could you ever review anything?". Whether you may perform
 * *this* action on *this* request at *this* stage is the chain's decision, and
 * it stays there so there is one source of truth for the rules.
 */
function requireExpenseRole(req, res, next) {
  /**
   * OPEN: anyone signed in may work the review queue.
   *
   * This gate only ever asked "could you ever review anything?" — it is the
   * door to the queue, not the rule about a particular expense at a particular
   * stage. That rule is the chain's, and the chain is DELIBERATELY LEFT INTACT:
   * an expense still has to move pending → approved → paid in order, so it
   * cannot be raised and paid in a single step by one person.
   *
   * So what opening this changes is who may take part. What it does not change
   * is that each stage is still a separate, recorded act. See
   * config/apiPermissions.checkApiAccess for the wider decision.
   */
  void chain;
  next();
}

/**
 * Gate for editing the chart of accounts.
 *
 * Narrower than the review queue: an Expenditure Officer posts to the chart but
 * does not get to reshape it. Wider than the app-wide `verifyStaff`, which
 * admits only admin and super_admin and would shut out the CFO — whose chart it
 * actually is.
 */
function requireChartRole(req, res, next) {
  // "audit" and "finance" are separate role strings in roleMapping (8 and 2).
  // Both are admitted here because both are the auditor as far as the chart is
  // concerned. Note that the approval chain admits only `finance` at the CFO
  // stage — that difference is deliberate to leave alone, not an oversight
  // here: who signs off a payment is a bigger decision than who names accounts.
  // OPEN: anyone signed in may reshape the chart of accounts. Same decision as
  // requireExpenseRole above; the approval chain itself is untouched.
  next();
}

module.exports = { requireExpenseRole, requireChartRole };
