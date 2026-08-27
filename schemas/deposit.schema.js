const z = require("zod");
const { id, money, requiredString, optionalString, enumOf, searchTerm, pagination, typeError, numberLike } = require("./fields");

/**
 * `amount` must be strictly positive: a zero-value ledger entry is noise, and
 * a negative one is a debit wearing a credit's clothing. Direction belongs in
 * `type`, not in the sign.
 */
const createDeposit = z.object({
  customer: id("Customer"),
  // Optional here, not required: the statement-line path (lineIds below)
  // recomputes each deposit's amount from the claimed line itself and never
  // reads this field — the controller is what actually enforces "amount or
  // lineIds, one of the two" for the plain-entry path.
  amount: money("Amount", { min: 0.01 }).optional(),
  type: enumOf("Type", ["credit", "debit"]).optional().default("credit"),
  description: optionalString("Description", 500),
  // The `reference` column is varchar(255) — this is the real ceiling, not
  // an arbitrary one, so it's the cap actually enforced here.
  reference: optionalString("Reference", 255),
  bankAccountId: z.union([id("Bank Account"), z.string()]).optional().nullable(),
  bankName: optionalString("Bank Name", 100),
  accountName: optionalString("Account Name", 100),
  accountNumber: optionalString("Account Number", 50),
  // Lives in paystackDetails (jsonb), not a fixed-width column, and a bulk
  // deposit's depositor name is several comma-joined names — genuinely
  // unbounded, so no .max() here.
  depositorName: z
    .string({ error: typeError("Depositor Name", "text") })
    .trim()
    .optional()
    .transform((v) => v ?? ""),
  paymentDate: optionalString("Payment Date", 100),
  paystackDetails: z.record(z.unknown()).optional().nullable(),
  // Unmatched bank-statement rows this deposit claims — see
  // wallet.service.js#creditFromStatementLines. Schemas strip unknown keys
  // by default (middleware/validate.js), so leaving this out silently
  // dropped it from every request; the statement-line picker in the UI
  // never actually reached the controller's lineIds branch.
  lineIds: z.array(id("Statement line")).optional(),
  // Set when this deposit is being recorded to confirm payment on a
  // specific pending order (the Pending Orders → Confirm Payment flow) —
  // stamps bank_statement_lines.matchedOrderId (when claiming lines) and
  // rides along in paystackDetails either way, so the funding trail names
  // the order explicitly rather than relying on FIFO timing to land on the
  // right one. Absent for an ordinary top-up with no order in mind.
  orderId: id("Order").optional(),
});

const syncPaystack = z.object({
  reference: requiredString("Payment reference", 100),
});

const listDeposits = pagination.extend({
  // The shared pagination cap (500) is tuned for paged UI lists; the
  // deposits page wants everything in one request. depositRepo.findAll
  // already clamps to 5000 at the query level — this just lets a caller
  // actually reach that ceiling instead of being turned back at 500.
  limit: numberLike("Limit")
    .pipe(
      z.number().int("Limit must be a whole number").positive("Limit must be 1 or greater").max(5000, "Limit cannot exceed 5000")
    )
    .optional()
    .default(50),
  search: searchTerm,
  type: enumOf("Type", ["credit", "debit"]).optional(),
  customer: id("Customer").optional(),
  // For the My Report "Total Inflow" auto-fill — deposits unambiguously
  // attributed to one PFI (see the depositRepo.findAll comment on why most
  // rows are null here).
  pfiId: id("PFI").optional(),
});

const idParam = z.object({ id: id("Deposit id") });

const transferBalance = z.object({
  fromCustomer: id("Source customer"),
  toCustomer: id("Destination customer"),
  amount: money("Amount", { min: 0.01 }),
  description: optionalString("Description", 500),
});

const reverseDeposit = z.object({
  description: optionalString("Description", 500),
});

module.exports = { createDeposit, syncPaystack, listDeposits, idParam, transferBalance, reverseDeposit };
