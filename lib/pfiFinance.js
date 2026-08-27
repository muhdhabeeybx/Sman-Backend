/**
 * Every PFI money figure, in one place.
 *
 * Nothing here is stored. Change an input and every downstream figure moves —
 * that is deliberate, and it is why a PFI can never drift out of step with its
 * own expense lines.
 *
 * The null discipline matters as much as the arithmetic. An uncosted PFI must
 * read "—" everywhere, not ₦0: a batch nobody has priced yet is not a batch
 * worth nothing. Only `totalExpenses` is always a number, because zero expense
 * lines legitimately means ₦0.
 */

/** Two-decimal rounding that does not drift on .005 the way toFixed can. */
const money = (n) => (n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100);

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A quantity or price of zero means "not entered". The columns default to 0
 * rather than null, so there is no way to tell an unset price from a free
 * cargo — and treating 0 as free would silently report a 100% margin.
 */
const positive = (v) => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};

/**
 * Order lifecycle states that imply a committed sale.
 *
 * No longer what drives revenue or sold litres — both now key off
 * payment_status = 'Paid', so a batch agrees with the finance report by
 * construction. Kept because it still names the set for anything reasoning
 * about order lifecycle rather than payment.
 */
const REVENUE_STATUSES = ["Paid", "Released", "Loading", "Completed"];

/**
 * @param pfi      the PFI row
 * @param agg      { expenses, revenue, movementQty, allocationQty } — all
 *                 pre-summed in SQL so this function stays pure arithmetic.
 */
function computeFinancials(pfi, agg = {}) {
  // A gantry batch is an allocation bought at the loading gantry: one
  // quantity, no shipping papers, no discharge. Every figure below that reads
  // a BL is therefore coastal-only, and forcing a gantry batch through the BL
  // path would leave it permanently uncosted — a batch with a real price and a
  // real quantity reporting "—" for its own value.
  const isGantry = pfi.pfiType === "gantry";

  const blQty = isGantry ? null : positive(pfi.blQtyLitres);
  const tankQty = num(pfi.startingQtyLitres) ?? 0;
  const pricePerLitre = positive(pfi.unitPrice);

  // Tank minus BL. Null — not zero — until BL is entered, because "no gap"
  // and "we don't know the gap" are different answers. Always null on gantry:
  // there is no second figure to differ from, so there is no gap to report.
  const surplusDeficitLitres = blQty == null ? null : tankQty - blQty;

  // What the batch is billed on. Coastal is billed for the documented BL
  // figure whatever actually made it into the tank; gantry is billed for the
  // quantity bought, which is the only quantity there is.
  const costQty = isGantry ? positive(tankQty) : blQty;

  const pfiValue = costQty != null && pricePerLitre != null ? money(costQty * pricePerLitre) : null;

  // PAID only. Anything still walking the approval chain is reported beside
  // the cost, never inside it — see pendingExpenses below.
  const totalExpenses = money(num(agg.expenses) ?? 0);
  const pendingExpenses = money(num(agg.pendingExpenses) ?? 0);
  const totalCost = pfiValue == null ? null : money(pfiValue + totalExpenses);

  // A rebate, discount or claim credited back against the cargo — money that
  // reduces what the batch actually cost, without touching pfiValue (what you
  // were billed) or totalCost (what you were billed plus what you spent).
  const creditBalance = money(num(pfi.creditBalance) ?? 0) ?? 0;
  const grandTotalCost = totalCost == null ? null : money(totalCost - creditBalance);

  const revenue = money(num(agg.revenue) ?? 0);
  // Profit is read against the grand total, not the gross total — a credit
  // that lowers what the cargo really cost has to lower the loss it can show.
  const profitLoss = grandTotalCost == null ? null : money(revenue - grandTotalCost);

  // Sold is driven by confirmed-paid orders, resolved per order to the most
  // accurate quantity available (see aggregatesFor's `sold` query). It is
  // deliberately NOT movementQty + allocationQty: neither ledger is
  // guaranteed to hold a row — an order moved onto a batch by the bulk
  // assign action writes to neither — and summing only the ledgers reported
  // batches with millions of litres of confirmed sales as completely
  // untouched. movementQty/allocationQty stay exposed below for reference,
  // but nothing is computed from them.
  const movementQty = num(agg.movementQty) ?? 0;
  const allocationQty = num(agg.allocationQty) ?? 0;
  const sold = num(agg.soldQty) ?? 0;
  const remaining = tankQty - sold;

  // The deficit priced at what you paid for it. The system charges you for the
  // BL quantity but you can only ever sell the tank quantity, so a deficit is
  // money spent on product that never arrived. It is already inside the loss
  // via pfiValue; this names it so it can be read rather than inferred.
  const deficitCost =
    surplusDeficitLitres != null && surplusDeficitLitres < 0 && pricePerLitre != null
      ? money(Math.abs(surplusDeficitLitres) * pricePerLitre)
      : null;

  // Share of the batch actually sold. This is what tells you whether the
  // profit figure means anything yet.
  const sellThrough = tankQty > 0 ? Math.min(1, Math.max(0, sold / tankQty)) : null;

  // Profit is only meaningful on a fully-sold batch. Below that the full cargo
  // cost is charged against partial revenue, so a healthy batch mid-flight
  // still shows a large paper loss.
  const profitIsMeaningful = sellThrough != null && sellThrough >= 0.995;

  // What the sold portion actually cost, so an in-flight batch can be read
  // honestly. Deliberately NOT called profit — it is a recovery indicator.
  const costOfSold =
    grandTotalCost != null && sellThrough != null ? money(grandTotalCost * sellThrough) : null;
  const marginOnSold =
    costOfSold != null && revenue > 0 ? money(((revenue - costOfSold) / revenue) * 100) : null;

  // Landing cost is reported against the quantity billed: for coastal, the BL
  // figure the papers say was purchased — the number the PFI report prints and
  // the business quotes. On gantry that is the bought quantity, so the two
  // landing-cost figures below coincide, which is correct: with no discharge
  // there is no shortage to open a gap between them.
  const landingCostPerLitre =
    grandTotalCost != null && costQty > 0 ? money(grandTotalCost / costQty) : null;

  // The same cost spread over what actually measured into the tank. Kept
  // alongside rather than instead of: a discharge shortage pushes this above
  // the BL figure, because the same grand total bought less product than the
  // papers promised, and the gap between the two IS the cost of the deficit.
  const landingCostPerLitreTank =
    grandTotalCost != null && tankQty > 0 ? money(grandTotalCost / tankQty) : null;

  return {
    isGantry,
    blQtyLitres: blQty,
    blQtyMt: isGantry ? null : num(pfi.blQtyMt),
    tankQtyLitres: tankQty,
    // The quantity every money figure above was computed against, so a reader
    // never has to work out which of the two it was.
    costQtyLitres: costQty,
    surplusDeficitLitres,
    pricePerLitre,
    pfiValue,
    totalExpenses,
    pendingExpenses,
    pendingExpenseCount: agg.pendingExpenseCount || 0,
    totalCost,
    creditBalance,
    grandTotalCost,
    landingCostPerLitre,
    landingCostPerLitreTank,
    revenue,
    profitLoss,
    margin: revenue > 0 && profitLoss != null ? money((profitLoss / revenue) * 100) : null,
    sold,
    remaining,
    movementQty,
    allocationQty,
    // Read-it-right helpers.
    deficitCost,
    sellThrough,
    profitIsMeaningful,
    costOfSold,
    marginOnSold,
  };
}

module.exports = { computeFinancials, REVENUE_STATUSES, money };
