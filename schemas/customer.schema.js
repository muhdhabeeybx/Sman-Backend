const z = require("zod");
const { id, money, numberLike, requiredString, optionalString, optionalEmail, enumOf, searchTerm, pagination } = require("./fields");

/**
 * Replaces a Mongo-era schema that validated ids with an ObjectId regex
 * (/^[0-9a-fA-F]{24}$/) — against a Postgres serial column, that would have
 * rejected every request had it ever been wired up.
 *
 * Phone is checked for presence only; `toE164` in the controller does the real
 * parsing, because valid-phone-ness is a libphonenumber question, not a regex
 * one, and duplicating it here would create a second source of truth.
 */
const createCustomer = z.object({
  name: requiredString("Name", 255),
  phone: requiredString("Phone number", 30),
  email: optionalEmail(),
  companyName: optionalString("Company name", 255),
  address: optionalString("Address", 1000),
  status: enumOf("Status", ["Active", "Inactive", "Pending"]).optional(),
  balance: money("Balance").optional(),
  deposit: money("Deposit").optional(),
  previousDeposit: money("Previous deposit").optional(),
  marketingOptOut: z.boolean({ error: "marketingOptOut must be true or false" }).optional(),
});

/**
 * Update is the same shape with everything optional — and still a whitelist.
 * `virtualAccountNumber` is absent on purpose: overwriting it would redirect
 * another customer's incoming payments, since the webhook matches on account
 * number.
 */
const updateCustomer = createCustomer.partial();

/**
 * The extra numbers a customer signs in on.
 *
 * `phone` is presence-checked only, exactly as createCustomer's is and for the
 * same reason: valid-phone-ness is a libphonenumber question that `toE164` in
 * the controller already answers, and a regex here would be a second source of
 * truth free to disagree with it.
 */
const addCustomerPhone = z.object({
  phone: requiredString("Phone number", 30),
  // The desk's own word for the number — "Warehouse", "Director". Free text
  // because the useful labels belong to the customer, not to a list we can
  // write out in advance.
  label: optionalString("Label", 60),
});

const phoneIdParam = z.object({ id: id("Customer id"), phoneId: id("Phone id") });

const listCustomers = pagination.extend({
  // The shared pagination cap (500) is tuned for paged UI lists; customer
  // pickers (manual deposit, messaging) want the whole book in one request.
  // customerRepo.findAll already clamps to 5000 at the query level — this
  // just lets a caller actually reach that ceiling instead of being turned
  // back at 500.
  limit: numberLike("Limit")
    .pipe(
      z.number().int("Limit must be a whole number").positive("Limit must be 1 or greater").max(5000, "Limit cannot exceed 5000")
    )
    .optional()
    .default(50),
  search: searchTerm,
  searchType: enumOf("Search type", ["name", "email", "phone", "companyName"]).optional(),
  status: enumOf("Status", ["Active", "Inactive", "Pending", "all"]).optional(),
  // How a customer trades, not who they are — the list sorts and filters on
  // these. `sort` is an enum rather than a free string because the repository
  // puts it into an ORDER BY; see SORTS there.
  depotId: numberLike("Depot id").optional(),
  activity: enumOf("Activity", ["frequent", "occasional", "dormant", "never"]).optional(),
  hasBalance: enumOf("Has balance", ["yes", "no"]).optional(),
  optedOut: enumOf("Opted out", ["yes", "no"]).optional(),
  sort: enumOf("Sort", ["active", "recent", "spend", "balance", "name", "newest"]).optional(),
});

const idParam = z.object({ id: id("Customer id") });

/**
 * The messaging page's audience resolver. Every filter is optional and
 * independent — see customer.repository.js#findForSegment for how they
 * combine. `minOrders`/`sinceDays` are a pair: one without the other is
 * ignored by the repo rather than rejected here, since a half-filled
 * "frequent buyers" toggle in the UI is a normal in-progress state, not
 * a request error.
 */
const segmentCustomers = z.object({
  depotId: numberLike("Depot id").optional(),
  minOrders: numberLike("Minimum orders").optional(),
  sinceDays: numberLike("Since days").optional(),
  inactiveSinceDays: numberLike("Inactive since days").optional(),
  limit: numberLike("Limit").optional(),
});

module.exports = { createCustomer, updateCustomer, listCustomers, idParam, segmentCustomers,
  addCustomerPhone,
  phoneIdParam,
};
