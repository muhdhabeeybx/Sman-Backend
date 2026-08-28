const { parsePhoneNumberFromString } = require("libphonenumber-js/max");

/**
 * The single phone-normalisation implementation.
 *
 * Two divergent hand-rolled copies exist today — utils/helpers.js
 * `normalizePhone` and services/sms.service.js `formatPhoneForTermii`. Both
 * assumed every number was Nigerian and both silently produced garbage for
 * anything else. Customers buying fuel in Nigeria do not necessarily hold
 * Nigerian numbers, so parsing is delegated to libphonenumber (Google's
 * metadata, the same rules carriers use) rather than to regexes we maintain.
 *
 * Canonical storage form is E.164 (`+2348012345678`, `+447400123456`).
 *
 * The `/max` metadata bundle is required for getType(); the default bundle
 * cannot distinguish mobile from landline. Size is irrelevant server-side.
 */

/**
 * Country assumed when a number arrives without a country code.
 *
 * A bare `08012345678` is Nigerian; a Ghanaian customer's bare `0201234567`
 * would be misread, so international customers must supply `+<country code>`.
 * That is the standard convention and it is documented at the API boundary
 * rather than guessed at.
 */
const DEFAULT_COUNTRY = (process.env.DEFAULT_PHONE_COUNTRY || "NG").toUpperCase();

/**
 * Number types that can actually receive an SMS.
 *
 * Many countries (the US among them) cannot distinguish mobile from landline
 * and report FIXED_LINE_OR_MOBILE, so it has to be accepted. VOIP is excluded
 * deliberately: it is the cheapest number class to acquire in bulk and the
 * usual vehicle for SMS pumping, where an attacker farms revenue share by
 * driving OTP traffic at numbers they control.
 */
const SMS_CAPABLE_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

/**
 * ISO-3166 alpha-2 codes permitted to receive an OTP.
 *
 * Unset means every country is allowed, which is the correct default for a
 * business whose customers may hold any passport. Set it to the markets
 * actually served before launch: unrestricted international OTP is the classic
 * toll-fraud surface, and the daily spend cap bounds the damage but does not
 * prevent it.
 */
function allowedCountries() {
  const raw = process.env.OTP_ALLOWED_COUNTRIES;
  if (!raw || !raw.trim()) return null; // null = no restriction
  return new Set(
    raw
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
  );
}

/**
 * Parse to a structured result, or null if the number is not valid anywhere.
 *
 * Returns null rather than a best-effort string. Silently passing unparseable
 * input through is how a phone column ends up holding three formats, and an
 * invalid number consumes an SMS send that can never arrive.
 *
 * @param {string} input
 * @param {string} [defaultCountry]
 * @returns {{e164: string, country: string|null, type: string|null, smsCapable: boolean}|null}
 */
function parsePhone(input, defaultCountry = DEFAULT_COUNTRY) {
  if (input === null || input === undefined) return null;

  const parsed = parsePhoneNumberFromString(String(input).trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return null;

  const type = parsed.getType() || null;
  return {
    e164: parsed.number,
    country: parsed.country || null,
    type,
    smsCapable: SMS_CAPABLE_TYPES.has(type),
  };
}

/**
 * Canonical storage form, or null if unparseable.
 * @param {string} input
 * @param {string} [defaultCountry]
 * @returns {string|null}
 */
function toE164(input, defaultCountry = DEFAULT_COUNTRY) {
  const parsed = parsePhone(input, defaultCountry);
  return parsed ? parsed.e164 : null;
}

/**
 * Termii's expected form — E.164 digits with the leading `+` stripped.
 *
 * Empty string on failure rather than "null": the SMS client treats an empty
 * recipient as a no-op, whereas the string "null" would be dispatched.
 * @param {string} input
 * @returns {string}
 */
function toSmsRecipient(input) {
  const e164 = toE164(input);
  return e164 ? e164.slice(1) : "";
}

/**
 * Can we send this number an OTP? Valid, SMS-capable, and in an allowed
 * country. Returns a reason so the caller can log why without leaking it to
 * the response, which must stay enumeration-safe.
 *
 * @param {string} input
 * @returns {{ok: boolean, reason: string|null, phone: object|null}}
 */
function checkSmsEligibility(input) {
  const parsed = parsePhone(input);
  if (!parsed) return { ok: false, reason: "unparseable", phone: null };
  if (!parsed.smsCapable) return { ok: false, reason: `not_sms_capable:${parsed.type}`, phone: parsed };

  const allowed = allowedCountries();
  if (allowed && parsed.country && !allowed.has(parsed.country)) {
    return { ok: false, reason: `country_not_allowed:${parsed.country}`, phone: parsed };
  }
  return { ok: true, reason: null, phone: parsed };
}

/**
 * The last ten digits — what actually identifies a subscriber however the
 * number was typed, and the key both `contacts.phone_normalized` and
 * `customers.phone_normalized` are generated from.
 *
 * Kept here so the JS and the SQL cannot drift: two hand-rolled copies of this
 * rule already existed once (see the note at the top of this file), and the
 * import path needs to dedupe a spreadsheet in memory before it ever reaches
 * a generated column.
 *
 * @param {string} input
 * @returns {string} up to 10 digits, or "" for input with none
 */
function normalizedKey(input) {
  return String(input ?? "").replace(/[^0-9]/g, "").slice(-10);
}

/**
 * Hygiene verdict for a number already on the book.
 *
 * `checkSmsEligibility` answers "may we send an OTP here?", which folds the
 * country allow-list into its answer and is deliberately terse about why. This
 * answers a different question — "is this row's number worth keeping?" — for
 * the review panel and the import preflight, where a human is going to read
 * the reason and decide.
 *
 * The three verdicts are separated because they call for different actions:
 *
 *   ok           valid and can receive an SMS. Nothing to do.
 *   unreachable  a real number, but a landline or a VOIP line. Worth keeping
 *                as a contact detail; must never be counted as a messaging
 *                recipient, because every send to one is billed and lost.
 *   invalid      not a phone number anywhere in the world — "0802121",
 *                "0000000000", a 12-digit mistype. 115 of 1,380 customer rows
 *                on the live book are this.
 *
 * @param {string} input
 * @returns {{verdict: "ok"|"unreachable"|"invalid", reason: string, e164: string|null, country: string|null, type: string|null}}
 */
function classifyPhone(input) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return { verdict: "invalid", reason: "No number on file", e164: null, country: null, type: null };
  }

  const parsed = parsePhone(raw);
  if (!parsed) {
    const digits = raw.replace(/[^0-9]/g, "");
    // The specific complaint, not just "invalid". Someone fixing 115 rows by
    // hand needs to see at a glance which are truncated and which are typos.
    const reason =
      digits.length === 0
        ? "No digits in this number"
        : digits.length < 10
          ? `Too short — only ${digits.length} digit${digits.length === 1 ? "" : "s"}`
          : /^(\d)\1+$/.test(digits)
            ? "Placeholder number — the same digit repeated"
            : digits.length > 14
              ? `Too long — ${digits.length} digits`
              : "Not a valid number in any country";
    return { verdict: "invalid", reason, e164: null, country: null, type: null };
  }

  if (!parsed.smsCapable) {
    const kind = parsed.type === "VOIP" ? "a VOIP line" : "a landline";
    return {
      verdict: "unreachable",
      reason: `Valid, but ${kind} — an SMS to it is billed and never arrives`,
      e164: parsed.e164,
      country: parsed.country,
      type: parsed.type,
    };
  }

  return {
    verdict: "ok",
    reason: "",
    e164: parsed.e164,
    country: parsed.country,
    type: parsed.type,
  };
}

module.exports = {
  DEFAULT_COUNTRY,
  SMS_CAPABLE_TYPES,
  allowedCountries,
  parsePhone,
  toE164,
  toSmsRecipient,
  checkSmsEligibility,
  normalizedKey,
  classifyPhone,
};
