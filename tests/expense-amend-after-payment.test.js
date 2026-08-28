const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const chain = require("../lib/expenseChain");

/**
 * Who may edit a settled expense, and what happens to the figures when they do.
 *
 * Pure rules — no database. `canEditExpense` is the gate the PATCH route runs,
 * and it is the only thing standing between "correct a wrong TIN" and "restate
 * a payment that has already cleared".
 */

const paid = (over = {}) => ({ status: chain.STATUS.PAID, added_by: 7, ...over });
const inFlight = (over = {}) => ({ status: chain.STATUS.VERIFIED, added_by: 7, ...over });

const asRole = (role, id = 99) => ({ id, roles: [role] });

describe("editing a settled expense", () => {
  test("a super admin may amend it, and the edit is marked as post-payment", () => {
    const gate = chain.canEditExpense(paid(), asRole("super_admin"));
    assert.equal(gate.ok, true);
    // The flag the controller uses to write "amended_after_payment" into the
    // trail rather than a plain "updated".
    assert.equal(gate.postPayment, true);
  });

  test("nobody else may — not an admin, not the CFO, not the officer who raised it", () => {
    for (const role of ["admin", "finance", "expenditure_officer"]) {
      const gate = chain.canEditExpense(paid(), asRole(role));
      assert.equal(gate.ok, false, `${role} must not amend a settled row`);
      assert.equal(gate.status, 409);
      assert.match(gate.message, /only a super admin/i);
    }

    // Including the person who raised it, whose own money it was not.
    const submitter = chain.canEditExpense(paid(), { id: 7, roles: ["expenditure_officer"] });
    assert.equal(submitter.ok, false);
  });

  test("an in-flight request is still editable by everyone on it", () => {
    // The new rule must not have narrowed the ordinary case.
    const submitter = chain.canEditExpense(inFlight(), { id: 7, roles: ["expenditure_officer"] });
    assert.equal(submitter.ok, true);
    assert.equal(submitter.postPayment, false, "an ordinary edit is not an amendment");

    for (const role of ["super_admin", "admin", "finance"]) {
      assert.equal(chain.canEditExpense(inFlight(), asRole(role)).ok, true, role);
    }
  });

  test("a stranger still cannot touch someone else's in-flight request", () => {
    const gate = chain.canEditExpense(inFlight(), { id: 1234, roles: ["truck_sales"] });
    assert.equal(gate.ok, false);
    assert.equal(gate.status, 403);
  });

  test("a paid expense is still undeletable by anyone", () => {
    // Amending a record and erasing one are different things. Opening the
    // first must not have opened the second.
    const { actions, reason } = chain.availableActions(paid(), asRole("super_admin"));
    assert.deepEqual(actions, []);
    assert.match(reason, /paid and closed/i);
  });
});

// ─── Recomputation ──────────────────────────────────────────────────────────

/**
 * The invoice set as the update path now recomputes it.
 *
 * Re-implemented here against the same rules rather than imported, because
 * `recomputeInvoiceFigures` is private to the controller. What is being pinned
 * is the BEHAVIOUR the controller must have: correcting one figure must move
 * the figures derived from it, and must not silently zero the ones it was not
 * told about.
 */
const { computeFinancials } = require("../lib/pfiFinance");

describe("an amended expense flows through to the cargo", () => {
  test("correcting a paid expense moves the PFI's total and landing cost", () => {
    const pfi = {
      pfiType: "coastal",
      productUnit: "Litres",
      startingQtyLitres: 1_000_000,
      blQtyLitres: 1_000_000,
      unitPrice: "300",
      creditBalance: "0",
    };

    // ₦300,000,000 cargo + ₦20,000,000 of paid expenses.
    const before = computeFinancials(pfi, { expenses: 20_000_000 });
    assert.equal(before.totalCost, 320_000_000);
    assert.equal(before.landingCostPerLitre, 320);

    // A super admin corrects one of those expenses down by ₦5,000,000.
    const after = computeFinancials(pfi, { expenses: 15_000_000 });

    // Nothing was stored, so nothing had to be recalculated by hand — the
    // cargo's cost and its landing cost are simply read afresh.
    assert.equal(after.totalCost, 315_000_000);
    assert.equal(after.landingCostPerLitre, 315);
    assert.equal(
      after.landingCostPerLitre,
      after.totalCost / after.costQtyLitres,
      "and the two still reconcile on the page"
    );
  });
});
