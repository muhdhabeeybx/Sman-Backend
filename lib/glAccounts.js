/**
 * The expense chart of accounts, as the UI needs to see it.
 *
 * The accounts themselves live in `expense_categories` (seeded by migration
 * 0007) — this file only holds what cannot go in a table: the order the groups
 * are offered in, their labels, and which of them may be booked to.
 */

/**
 * Group codes, in the order the first dropdown offers them.
 *
 * Two, because a cost either belongs to a cargo or it does not, and that one
 * question decides everything that follows: whether a PFI must be named, and
 * whether the amount lands in a batch's cost or in the company's overhead.
 * Splitting the overhead side further — administrative, depot, sales — only
 * asked the requester to classify their own spending before they were allowed
 * to describe it, and got a guess.
 */
const GL_GROUPS = [
  {
    code: "general",
    label: "General Expenses",
    hint: "The cost of running the company. Not tied to any cargo.",
  },
  {
    code: "pfi_direct",
    label: "PFI Attached Expenses",
    hint: "Booked to a cargo batch and rolled into its cost.",
    /** The only group that may name a PFI — and it must. */
    requiresPfi: true,
  },
];

const GROUP_BY_CODE = new Map(GL_GROUPS.map((g) => [g.code, g]));

/** Everything but income. What the expense form is allowed to offer. */
const EXPENSE_GROUPS = GL_GROUPS.filter((g) => !g.isIncome);

const groupFor = (code) => GROUP_BY_CODE.get(code) || null;

/** Nigerian standard rate, applied to the ex-VAT figure on the form. */
const VAT_RATE = 0.075;

/**
 * The withholding rates the form offers, as percentages.
 *
 * Deliberately unlabelled by transaction type. Which rate a given invoice
 * attracts is a judgement Finance makes — printing "5% — professional fees"
 * beside the option would be this app quietly giving tax advice, and would be
 * wrong the moment the schedule changes. Anything not on the list is entered as
 * a plain amount instead.
 *
 * WHT is computed on the ex-VAT value, never on the VAT-inclusive total.
 */
const WHT_RATES = [0, 2, 2.5, 5, 10];

module.exports = { GL_GROUPS, EXPENSE_GROUPS, groupFor, VAT_RATE, WHT_RATES };
