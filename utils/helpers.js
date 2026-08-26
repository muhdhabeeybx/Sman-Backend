/**
 * Escapes special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `normalizePhone` lived here as a deprecated alias for utils/phone's toE164.
// Its only caller now imports toE164 directly, so the indirection is gone.

/**
 * Returns uppercase initials from a full name (e.g. "John Doe" → "J D").
 * @param {string} name
 * @returns {string}
 */
function getCustomerInitials(name) {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase())
    .join(" ");
}

/**
 * The name shown against a customer's virtual account when Paystack does not
 * return one of its own — "SOROMAN-MA" for Misbahu Ahmed.
 *
 * This is the single definition. It previously lived inline at twelve call
 * sites in two spellings — `SOROMANNIGERI/ ` in the emails and order services,
 * `SOROMAN/` in the SMS ones — so the same customer was told one account name
 * by email and a different one by text, for the same order. Both also rendered
 * the initials space-separated ("SOROMANNIGERI/ M A"), because
 * getCustomerInitials joins with a space for display purposes.
 *
 * Paystack normally supplies the real account name and this never appears. It
 * showing up on a live order means the dedicated-account call failed.
 *
 * @param {string} name  the customer's full name
 * @returns {string}
 */
function virtualAccountName(name) {
  const { companyName } = require("../config/brand");
  const prefix = companyName().toUpperCase();

  const initials = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  // A nameless customer would otherwise get a trailing dash.
  return initials ? `${prefix}-${initials}` : prefix;
}

/**
 * Generates the standardized order reference: INITIALS + ORDER_ID.
 *
 * Initials extracted from company name:
 * - Multiple words: first letter of each word ("Honeywell Adada" → "HA")
 * - Single word: first 2 letters ("Soroman" → "SO")
 * - Default: "SO" if no company name
 *
 * NO SEPARATOR. The reference used to be "HA/10831", and the slash was a
 * genuine defect rather than a style choice: the public tracking route is
 * `GET /api/tracking/:ref`, and Express matches `:ref` against ONE path
 * segment — so a customer pasting "HA/10831" from their SMS produced
 * /api/tracking/HA/10831, two segments, which matched no route and 404'd.
 * Every consumer (mobile app, web portal, admin dashboard) shows this one
 * value, so it has to survive being put in a URL.
 *
 * Old "HA/10831" references are still resolvable — see parseOrderReference.
 *
 * @param {string|null} companyName - Customer's company name
 * @param {number|string} orderId - Order ID
 * @returns {string} Order reference (e.g., "HA10831")
 */
function generateOrderReference(companyName, orderId) {
  let initials = "SO";

  if (companyName && typeof companyName === "string" && companyName.trim()) {
    const words = companyName.trim().split(/\s+/).filter(Boolean);

    if (words.length > 1) {
      initials = words.map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join("");
    } else if (words.length === 1) {
      initials = words[0].substring(0, 2).toUpperCase();
    }
  }

  return `${initials}${orderId}`;
}

/**
 * The inverse of generateOrderReference: pull the order id back out of a
 * reference a human is holding.
 *
 * Accepts BOTH the current form and the old slashed one, because references
 * are not stored — they are printed into SMS, invoices, ticket emails and QR
 * codes that customers keep. "HA10831", "HA/10831" and a bare "10831" must all
 * resolve to 10831, or every reference issued before this change stops working.
 * Case and surrounding whitespace are ignored.
 *
 * Returns null for anything that isn't reference-shaped. The pattern requires
 * the digits to be the whole trailing token after an optional short prefix, so
 * free-text search ("Dangote Cement 50") is not mistaken for a reference and
 * does not pull an unrelated order into the results.
 *
 * Anything too large to be an order id is also null — not because it is
 * unparseable, but because it cannot be an order id and callers compare the
 * result against an int4 column. Searching the finance report for a bank
 * reference ("32923089257"), which is exactly how a payment gets checked
 * against a statement, was reaching Postgres as `orders.id = 32923089257` and
 * failing the whole query with "out of range for type integer" — so the one
 * search a reconciler most needs returned an error instead of the order.
 *
 * @param {string|number|null} value
 * @returns {number|null} the order id, or null
 */
/** Postgres int4, which is what orders.id is. */
const MAX_ORDER_ID = 2147483647;

function parseOrderReference(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;

  // optional letters, optional separator, then digits — and nothing else.
  const match = s.match(/^[A-Za-z]*[\/\-]?(\d+)$/);
  if (!match) return null;

  const id = parseInt(match[1], 10);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_ORDER_ID ? id : null;
}

module.exports = {
  escapeRegex,
  getCustomerInitials,
  virtualAccountName,
  generateOrderReference,
  parseOrderReference,
};
