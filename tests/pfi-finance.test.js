const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { computeFinancials, explainFinancials } = require("../lib/pfiFinance");

/**
 * Pure arithmetic — no database, no app, no token. Every figure on a PFI is
 * derived from its inputs by computeFinancials and nothing is stored, so these
 * tests are the whole contract.
 */

/** A coastal batch: BL 1,000,000 L at ₦300, tank short by 5,000 L. */
const coastal = (over = {}) => ({
  pfiType: "coastal",
  productUnit: "Litres",
  startingQtyLitres: 995_000,
  blQtyLitres: 1_000_000,
  unitPrice: "300",
  creditBalance: "0",
  ...over,
});

describe("landing cost per litre — Total Cost ÷ BL Quantity, always", () => {
  test("divides the SAME Total Cost the report prints beside it", () => {
    const f = computeFinancials(coastal(), { expenses: 20_000_000 });

    // ₦300 × 1,000,000 = ₦300,000,000 cargo, + ₦20,000,000 expenses.
    assert.equal(f.pfiValue, 300_000_000);
    assert.equal(f.totalCost, 320_000_000);
    assert.equal(f.landingCostPerLitre, 320);
    // The property that matters: the two figures on the page reconcile.
    assert.equal(f.landingCostPerLitre, f.totalCost / f.costQtyLitres);
  });

  test("a credit note does NOT move the headline figure", () => {
    // This is the change. It used to divide the credit-adjusted total, so on a
    // batch carrying a credit the landing cost did not divide out against the
    // Total Cost printed one line above it, and nothing on the page said why.
    const f = computeFinancials(coastal({ creditBalance: "10000000" }), { expenses: 20_000_000 });

    assert.equal(f.totalCost, 320_000_000);
    assert.equal(f.grandTotalCost, 310_000_000);
    assert.equal(f.landingCostPerLitre, 320, "headline still divides Total Cost");
    assert.equal(f.landingCostPerLitreAfterCredit, 310, "the credit-adjusted view is kept alongside");
  });

  test("with no credit the two views coincide, as they should", () => {
    const f = computeFinancials(coastal(), { expenses: 20_000_000 });
    assert.equal(f.landingCostPerLitre, f.landingCostPerLitreAfterCredit);
  });

  test("it moves the moment any input moves — nothing is stored", () => {
    const before = computeFinancials(coastal(), { expenses: 20_000_000 });
    // One more expense lands. Total cost rises, so landing cost must rise.
    const after = computeFinancials(coastal(), { expenses: 25_000_000 });

    assert.equal(before.landingCostPerLitre, 320);
    assert.equal(after.landingCostPerLitre, 325);

    // And correcting the unit price moves it too.
    const repriced = computeFinancials(coastal({ unitPrice: "310" }), { expenses: 20_000_000 });
    assert.equal(repriced.landingCostPerLitre, 330);
  });

  test("pending expenses are OUTSIDE it until they are actually paid", () => {
    const f = computeFinancials(coastal(), { expenses: 20_000_000, pendingExpenses: 9_000_000 });
    assert.equal(f.landingCostPerLitre, 320, "an unpaid expense has not been spent");
    assert.equal(f.pendingExpenses, 9_000_000, "but it is reported so nobody is surprised later");
  });

  test("the tank figure is higher when product went missing on discharge", () => {
    const f = computeFinancials(coastal(), { expenses: 20_000_000 });
    // Billed for 1,000,000 L, only 995,000 L landed — the same money bought
    // less product, so the per-litre cost of what you can actually sell is up.
    assert.equal(f.surplusDeficitLitres, -5_000);
    assert.ok(f.landingCostPerLitreTank > f.landingCostPerLitre);
    assert.equal(f.landingCostPerLitreTank, 321.61);
    assert.equal(f.deficitCost, 1_500_000, "5,000 L at ₦300 that never arrived");
  });

  test("a gantry batch is costed on the quantity bought, not a BL it never had", () => {
    const f = computeFinancials(
      { pfiType: "gantry", productUnit: "Litres", startingQtyLitres: 500_000, unitPrice: "300", creditBalance: "0" },
      { expenses: 10_000_000 }
    );
    assert.equal(f.isGantry, true);
    assert.equal(f.blQtyLitres, null, "there are no shipping papers");
    assert.equal(f.costQtyLitres, 500_000);
    assert.equal(f.landingCostPerLitre, 320);
    assert.equal(f.surplusDeficitLitres, null, "no second figure to differ from");
  });

  test("an uncosted batch reads null, never ₦0", () => {
    // A batch nobody has priced yet is not a batch worth nothing, and a false
    // ₦0 landing cost would say it costs nothing to sell.
    const f = computeFinancials(coastal({ unitPrice: "0" }), { expenses: 20_000_000 });
    assert.equal(f.pfiValue, null);
    assert.equal(f.totalCost, null);
    assert.equal(f.landingCostPerLitre, null);

    const noBl = computeFinancials(coastal({ blQtyLitres: null }), { expenses: 20_000_000 });
    assert.equal(noBl.landingCostPerLitre, null, "no BL means no basis to divide by");
  });
});

describe("explaining the figures", () => {
  test("the workings show the actual sum, not the formula in the abstract", () => {
    const pfi = coastal();
    const f = computeFinancials(pfi, { expenses: 20_000_000 });
    const explain = explainFinancials(pfi, f);

    const landing = explain.find((e) => e.key === "landingCostPerLitre");
    assert.ok(landing);
    assert.equal(landing.formula, "Total Cost ÷ BL Quantity");
    // The number on the page, checkable by eye without a calculator.
    assert.match(landing.workings, /₦320,000,000\.00 ÷ 1,000,000 Litres = ₦320\.00/);
  });

  test("the explanation agrees with the arithmetic it describes", () => {
    // The whole reason these live in the same file: a formula that drifted
    // from the sum would be worse than no formula at all.
    const pfi = coastal({ creditBalance: "10000000" });
    const f = computeFinancials(pfi, { expenses: 20_000_000 });
    const explain = explainFinancials(pfi, f);

    const byKey = Object.fromEntries(explain.map((e) => [e.key, e]));
    assert.equal(byKey.totalCost.value, "₦320,000,000.00");
    assert.equal(byKey.landingCostPerLitre.value, "₦320.00");
    assert.equal(byKey.grandTotalCost.value, "₦310,000,000.00");
    assert.equal(byKey.landingCostPerLitreAfterCredit.value, "₦310.00");
  });

  test("a part-sold batch is told, in words, not to trust its profit figure", () => {
    const pfi = coastal();
    // A third sold: the full cargo cost charged against a third of the revenue
    // makes a healthy batch look catastrophic.
    const f = computeFinancials(pfi, { expenses: 20_000_000, revenue: 110_000_000, soldQty: 331_667 });
    const explain = explainFinancials(pfi, f);

    assert.equal(f.profitIsMeaningful, false);
    const profit = explain.find((e) => e.key === "profitLoss");
    assert.match(profit.meaning, /^READ WITH CARE/);
    assert.match(profit.meaning, /Margin on Sold/);

    // And the honest alternative is offered right beneath it.
    assert.ok(explain.find((e) => e.key === "marginOnSold"));
  });

  test("a finished batch is not hedged — the profit figure is the real one", () => {
    const pfi = coastal();
    const f = computeFinancials(pfi, { expenses: 20_000_000, revenue: 400_000_000, soldQty: 995_000 });
    const explain = explainFinancials(pfi, f);

    assert.equal(f.profitIsMeaningful, true);
    const profit = explain.find((e) => e.key === "profitLoss");
    assert.doesNotMatch(profit.meaning, /READ WITH CARE/);
  });

  test("sections that do not apply are left out rather than dashed", () => {
    const gantryPfi = {
      pfiType: "gantry", productUnit: "Litres", startingQtyLitres: 500_000,
      unitPrice: "300", creditBalance: "0",
    };
    const f = computeFinancials(gantryPfi, { expenses: 10_000_000 });
    const keys = explainFinancials(gantryPfi, f).map((e) => e.key);

    // A gantry batch has no discharge, so a surplus/deficit line would be
    // answering a question nobody asked.
    assert.ok(!keys.includes("surplusDeficit"));
    assert.ok(!keys.includes("landingCostPerLitreTank"));
    assert.ok(!keys.includes("creditBalance"), "no credit on this batch");
    assert.ok(keys.includes("landingCostPerLitre"));
  });
});
