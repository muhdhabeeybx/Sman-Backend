const z = require("zod");
const {
  id, requiredString, optionalString, optionalEmail,
  enumOf, searchTerm, pagination, numberLike,
} = require("./fields");

const STAGES = ["lead", "contact"];
const SOURCES = ["manual", "csv", "referral", "event", "other"];

/**
 * Tags are free-form, so they are bounded here instead: a handful of short
 * labels, not an essay and not an unbounded list. Trimmed and emptied-out
 * entries are dropped rather than rejected — a trailing comma in a CSV tag
 * column is a typo, not a request error.
 */
const tags = z
  .array(z.string().trim().min(1, "A tag cannot be empty").max(40, "Tag is too long"))
  .max(20, "A contact cannot carry more than 20 tags")
  .optional();

const base = {
  name: requiredString("Name", 255),
  phone: requiredString("Phone", 30),
  email: optionalEmail(),
  companyName: optionalString("Company name", 255),
  stage: enumOf("Stage", STAGES).optional(),
  source: enumOf("Source", SOURCES).optional(),
  locationId: id("Location").optional().nullable(),
  tags,
  notes: optionalString("Notes", 2000),
  marketingOptOut: z.boolean().optional(),
};

const createContact = z.object(base);
const updateContact = z.object(base).partial();

const listContacts = pagination.extend({
  limit: numberLike("Limit")
    .pipe(z.number().int("Limit must be a whole number").positive("Limit must be 1 or greater").max(5000, "Limit cannot exceed 5000"))
    .optional()
    .default(50),
  search: searchTerm,
  stage: enumOf("Stage", STAGES).optional(),
  source: enumOf("Source", SOURCES).optional(),
  locationId: numberLike("Location id").optional(),
  // Whether a customer already exists on this number. Derived at read time,
  // never stored — see contact.repository.js#findAll.
  converted: enumOf("Converted", ["yes", "no"]).optional(),
  optedOut: enumOf("Opted out", ["yes", "no"]).optional(),
  tag: z.string().trim().max(40, "Tag is too long").optional(),
  sort: enumOf("Sort", ["newest", "oldest", "name", "company"]).optional(),
});

/**
 * A parsed spreadsheet, not a file.
 *
 * The CSV is parsed in the browser and posted as rows, so this endpoint never
 * has to deal with encodings, delimiters, BOMs or Excel's several dialects —
 * and a malformed file fails in front of the person who chose it, where they
 * can see which line is wrong, rather than as a 400 from the server.
 *
 * 5,000 rows a request. A larger book is uploaded in batches by the client;
 * the upsert is keyed on the phone number, so batching cannot double anyone.
 */
const importContacts = z.object({
  source: enumOf("Source", SOURCES).optional(),
  rows: z
    .array(
      z.object({
        name: optionalString("Name", 255),
        phone: optionalString("Phone", 30),
        email: optionalString("Email", 255),
        companyName: optionalString("Company name", 255),
        stage: enumOf("Stage", STAGES).optional(),
        locationId: numberLike("Location id").optional().nullable(),
        tags,
        notes: optionalString("Notes", 2000),
      })
    )
    .min(1, "There are no rows to import")
    .max(5000, "Import at most 5,000 rows at a time"),
});

const idParam = z.object({ id: id("Contact id") });

module.exports = {
  createContact,
  updateContact,
  listContacts,
  importContacts,
  idParam,
};
