const z = require("zod");
const { id, enumOf, searchTerm, pagination, numberLike } = require("./fields");
const { MAX_SOURCES: MAX_MERGE_SOURCES } = require("../services/peopleMerge.service");

/**
 * The merged customers-and-contacts book.
 *
 * `kind` is the filter that replaced two separate pages:
 *   customer  has an account — orders, a wallet, a balance
 *   lead      a contact marked as a sales prospect, no account
 *   contact   everyone else worth holding a number for
 *   prospect  lead + contact, i.e. "everyone who is not a customer yet"
 */
const KINDS = ["customer", "lead", "contact", "prospect"];

/** How a row's phone number stands up, per utils/phone.js#classifyPhone. */
const NUMBER_STATUSES = ["all", "ok", "invalid", "unreachable", "duplicate"];

const listPeople = pagination.extend({
  limit: numberLike("Limit")
    .pipe(
      z
        .number()
        .int("Limit must be a whole number")
        .positive("Limit must be 1 or greater")
        .max(5000, "Limit cannot exceed 5000")
    )
    .optional()
    .default(50),
  search: searchTerm,
  kind: enumOf("Type", KINDS).optional(),
  // Whether this person arrived as a lead before they signed up. Derived from
  // the phone match at read time, never stored.
  converted: enumOf("Converted", ["yes", "no"]).optional(),
  locationId: numberLike("Location id").optional(),
  tag: z.string().trim().max(40, "Tag is too long").optional(),
  optedOut: enumOf("Opted out", ["yes", "no"]).optional(),
  status: z.string().trim().max(30).optional(),
  activity: enumOf("Activity", ["all", "frequent", "occasional", "dormant", "never"]).optional(),
  hasBalance: enumOf("Has balance", ["yes", "no"]).optional(),
  numberStatus: enumOf("Number status", NUMBER_STATUSES).optional(),
  /**
   * "Show me the rows that look like the same person twice."
   *
   * Separate from `numberStatus` on purpose. That filter answers "is this
   * number usable?", and a name held by two records is not a problem with a
   * number — it is the commonest duplicate there is, one man opened twice
   * under two different lines, and it was previously unfindable.
   */
  duplicates: enumOf("Duplicates", ["name", "number", "any"]).optional(),
  sort: enumOf("Sort", ["top", "active", "newest", "oldest", "name", "company", "value"]).optional(),
});

const listHygiene = z.object({
  issue: enumOf("Issue", ["all", "invalid", "unreachable", "duplicate"]).optional(),
  limit: numberLike("Limit")
    .pipe(z.number().int().positive().max(2000, "Limit cannot exceed 2000"))
    .optional(),
});

/**
 * Records the reviewer has decided to remove.
 *
 * Capped at 200 a request. This is a destructive endpoint reached from a
 * review screen where a human has looked at each row — an unbounded delete
 * list is not something that flow should be able to express, and the server
 * re-checks every customer's guard individually anyway.
 */
const deleteReviewed = z.object({
  records: z
    .array(
      z.object({
        kind: enumOf("Record type", ["customer", "contact"]),
        id: id("Record id"),
      })
    )
    .min(1, "Select at least one record")
    .max(200, "Remove at most 200 records at a time"),
});

/**
 * Two rows that are one person, folded together.
 *
 * `target` is the record that survives and `sources` are the ones absorbed
 * into it — named that way round on purpose, because "merge A and B" leaves
 * open which one keeps the customer id every order in the ledger points at,
 * and that is the only part of this operation that cannot be undone.
 *
 * Capped at the service's own limit rather than the delete endpoint's 200:
 * merging is a per-person judgement made in front of a list of records, not a
 * batch, and a request asking to fold twenty accounts into one is far more
 * likely to be a mistake than an intention.
 */
const personRef = z.object({
  kind: enumOf("Record type", ["customer", "contact"]),
  id: id("Record id"),
});

const mergePeople = z.object({
  target: personRef,
  sources: z
    .array(personRef)
    .min(1, "Choose at least one record to merge in")
    .max(MAX_MERGE_SOURCES, `Merge at most ${MAX_MERGE_SOURCES} records at a time`),
});

module.exports = {
  listPeople,
  listHygiene,
  deleteReviewed,
  mergePeople,
  KINDS,
  NUMBER_STATUSES,
};
