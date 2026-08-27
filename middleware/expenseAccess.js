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
  if (!chain.canOversee(req.user)) {
    return res.status(403).json({
      success: false,
      message: "Your role does not take part in expense approvals",
    });
  }
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
  const allowed = [chain.ROLE.SUPER, chain.ROLE.ADMIN, chain.ROLE.CFO, "audit"];
  const mine = chain.rolesOf(req.user);
  if (!allowed.some((r) => mine.has(r))) {
    return res.status(403).json({
      success: false,
      message: "Only an administrator or the CFO can change the chart of accounts",
    });
  }
  next();
}

module.exports = { requireExpenseRole, requireChartRole };
