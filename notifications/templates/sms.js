/**
 * How a Soroman text message is written, in one module.
 *
 * The parallel of templates/email.js, and it exists for the same reason
 * config/brand.js does: the platform sends order texts from TWO places — the
 * bespoke senders in services/sms.service.js and the `sms` templates in
 * notifications/catalog.js — and they had drifted into two different voices.
 * One said "your order for 30,000 Liters of PMS (₦36,000,000) has been
 * received. Pay to: Fidelity Bank - 0123456789 (Account Name: ...)"; the other
 * said "Your order for 30,000 Litres of PMS has been received.\nPlease pay
 * ₦36,000,000 to:\n0123456789\nFidelity Bank". Same event, same customer, two
 * products.
 *
 * The house style, agreed: plain sentences, nothing in brackets, in the order
 * a person reads it — what we received, at what rate, what to pay, where to
 * pay it, thank you. The information is identical to what the bracketed
 * versions carried; only the shape changed.
 */

/**
 * Money in a text message: "N36,000,000", never "₦36,000,000".
 *
 * The naira sign is U+20A6, which is not in the GSM-7 alphabet. One of them
 * anywhere in the body forces the WHOLE message to UCS-2 encoding — 70
 * characters per billed part instead of 160. An order text carries two
 * amounts, so that single character was more than doubling Termii's bill on
 * the highest-volume message the platform sends. Plain N is also what the desk
 * writes.
 *
 * Email is unaffected and keeps ₦ — see formatMoney in templates/email.js.
 */
const money = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return `N${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
};

/**
 * "30,000 Litres" — the house spelling, whatever `products.unit` happens to
 * say. The records carry "Liters", "Litres" and "litres" interchangeably, and
 * a customer should not be able to tell which row his message was built from.
 */
const UNIT_SPELLING = {
  liter: "Litres", liters: "Litres", litre: "Litres", litres: "Litres",
  kg: "Kg", kilogram: "Kg", kilograms: "Kg",
  tonne: "Tonnes", tonnes: "Tonnes", mt: "MT",
};
const quantity = (value, unit) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const word = UNIT_SPELLING[String(unit || "").toLowerCase()] || String(unit || "").trim();
  return `${n.toLocaleString("en-NG")}${word ? ` ${word}` : ""}`;
};

/** The denominator in "at N1,200 per litre". */
const RATE_UNIT = {
  liter: "litre", liters: "litre", litre: "litre", litres: "litre",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  tonne: "tonne", tonnes: "tonne", mt: "MT",
};

/**
 * " at N1,200 per litre" — or nothing at all when no rate was supplied.
 *
 * The rate is the first figure a customer checks, and the texts used to name a
 * quantity and a total and leave him to divide one by the other.
 */
const rateClause = (price, unit) => {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "";
  return ` at ${money(n)} per ${RATE_UNIT[String(unit || "").toLowerCase()] || "litre"}`;
};

/**
 * "Soroman Calabar 0123456789 - Fidelity Bank".
 *
 * Name, number, then bank — the order the customer types them into his
 * banking app. Missing parts drop out rather than leaving a dangling dash.
 */
const payTo = ({ accountName, accountNumber, bankName } = {}) =>
  [[accountName, accountNumber].filter(Boolean).join(" ").trim(), bankName]
    .filter(Boolean)
    .join(" - ");

/** "Dear Ada, " — never "Dear undefined, ". */
const greet = (name) => {
  const n = String(name || "").trim();
  return n ? `Dear ${n}, ` : "";
};

/** The sign-off on a customer text. */
const thanks = () => "Thank you for your patronage.";

module.exports = { money, quantity, rateClause, payTo, greet, thanks };
