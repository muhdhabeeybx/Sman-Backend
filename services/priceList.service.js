const { loadCatalog } = require("./catalog.service");
const { db } = require("../config/db");
const { depots } = require("../db/schema");
const { eq } = require("drizzle-orm");

/**
 * The price advisory that goes out by SMS, and the shortcodes that build it.
 *
 * The message the desk sends every morning is a price list grouped by product,
 * with one line per location:
 *
 *     PMS
 *     Calabar N1,220/L
 *     Port Harcourt N1,220/L
 *
 * It was typed by hand each day off whatever the current prices were, which is
 * exactly the job a shortcode should do — and exactly the thing that goes wrong
 * quietly when a depot's price moves and the template does not.
 *
 * ── What is quoted ──────────────────────────────────────────────────────
 *
 * Active depots, with a price, holding sellable stock. Stock comes free with
 * loadCatalog (it is already the "orderable" definition every sales channel
 * shares), so a location that cannot fill an order is never advertised — the
 * portal and the SMS cannot disagree about where you can buy. Depot status is
 * filtered here because loadCatalog does not look at it: a depot in
 * Maintenance is still perfectly orderable as far as the catalog is concerned,
 * and there are six of them.
 *
 * ── Why the label is the city ───────────────────────────────────────────
 *
 * The trade quotes "Port Harcourt", not "Liquid Bulk Depot, Port Harcourt" —
 * and an SMS is billed by the segment, so the depot's full name is real money
 * spread over a few thousand recipients.
 *
 * The catch is that three separate depots sit in Port Harcourt at three
 * different prices. A city label would print the same location twice with two
 * prices, which is worse than being verbose. So the label collapses to the
 * city ONLY where that is unambiguous among the depots actually being quoted;
 * where two survive in one city, both fall back to their depot name. Which
 * depots are quoted is the sender's choice — see `depotIds`.
 */

/**
 * How a location is quoted: "Calabar", "Port Harcourt" — or "Dangote Refinery".
 *
 * Not simply the city. Two kinds of depot name exist here and they want
 * opposite treatment:
 *
 *   "Soroman Depot Calabar"   the city IS the identity; the operator prefix is
 *   "TSL Depot Port Harcourt" noise, and the trade says Calabar, Port Harcourt
 *
 *   "Dangote Refinery"        the name IS the identity. Its city is
 *                             Ibeju-Lekki, which nobody quotes and few would
 *                             recognise as the place they buy from.
 *
 * The test that separates them is whether the depot name already mentions its
 * own city — if it does, the city is the part carrying the meaning and the
 * rest is the operator. If it does not, the name is a landmark and shortening
 * it to a city would rename a place the customer knows.
 *
 * State is tried next for the same reason: "AIPEC Depot Lagos" sits in Apapa,
 * and "Lagos" is both in the name and what the trade says.
 */
const shortenCity = (city) =>
  // "Calabar Municipal" and "Warri North" are LGAs; the trade says Calabar and
  // Warri. Dropping the administrative suffix is what makes the label read the
  // way the desk already writes it.
  String(city || "").replace(/\s+(Municipal|North|South|East|West|Central|L\.?G\.?A\.?)$/i, "").trim();

const cityLabel = (depot) => {
  const name = String(depot.name || "").trim();
  const haystack = name.toLowerCase();

  const city = shortenCity(depot.city);
  if (city && haystack.includes(city.toLowerCase())) return city;

  const state = String(depot.state || "").trim();
  if (state && haystack.includes(state.toLowerCase())) return state;

  return name || city || state;
};

const money = (n) => Math.round(Number(n) || 0).toLocaleString("en-NG");

/**
 * The unit as it is written after a price: /L, /kg, /MT.
 *
 * Products carry "Liters", "Kilograms", "Metric Tonnes" — none of which anyone
 * would put in a text message.
 */
const unitSuffix = (unit) => {
  const u = String(unit || "").trim().toLowerCase();
  if (!u || u.startsWith("lit")) return "L";
  if (u.startsWith("kilo") || u === "kg") return "kg";
  if (u.startsWith("metric") || u === "mt" || u.includes("ton")) return "MT";
  if (u.startsWith("barrel")) return "bbl";
  if (u.includes("gallon")) return "gal";
  return unit;
};

/**
 * Every quotable price, flattened to one row per depot × product.
 *
 * @param depotIds  restrict to these depots; omit for every quotable one.
 */
const quotableRows = async ({ depotIds } = {}) => {
  const [catalog, activeDepots] = await Promise.all([
    loadCatalog(),
    db.select({ id: depots.id, name: depots.name, city: depots.city, state: depots.state })
      .from(depots)
      .where(eq(depots.status, "Active")),
  ]);

  const activeById = new Map(activeDepots.map((d) => [Number(d.id), d]));
  const wanted = Array.isArray(depotIds) && depotIds.length > 0
    ? new Set(depotIds.map(Number))
    : null;

  const rows = [];
  for (const depot of catalog) {
    const active = activeById.get(Number(depot.id));
    if (!active) continue;
    if (wanted && !wanted.has(Number(depot.id))) continue;
    for (const product of depot.products) {
      rows.push({
        depotId: Number(depot.id),
        depotName: active.name,
        city: cityLabel(active),
        state: active.state,
        productId: product.id,
        product: product.name,
        code: product.code,
        unit: product.unit,
        unitSuffix: unitSuffix(product.unit),
        price: Number(product.price),
      });
    }
  }
  return rows;
};

/**
 * The rows grouped for rendering: product first, then its locations.
 *
 * Products come out in the order their trade code first appears, and locations
 * within a product are cheapest first — the number a customer scans for.
 */
const groupRows = (rows) => {
  const byCode = new Map();
  for (const r of rows) {
    if (!byCode.has(r.code)) byCode.set(r.code, { code: r.code, product: r.product, unitSuffix: r.unitSuffix, locations: [] });
    byCode.get(r.code).locations.push(r);
  }

  for (const group of byCode.values()) {
    // Two depots left in one city would print the same label against two
    // different prices, so both take their depot name instead. Decided per
    // product: a city can be unambiguous for LPG and contested for PMS.
    const cityCounts = new Map();
    for (const l of group.locations) cityCounts.set(l.city, (cityCounts.get(l.city) || 0) + 1);
    for (const l of group.locations) l.label = cityCounts.get(l.city) > 1 ? l.depotName : l.city;
    group.locations.sort((a, b) => a.price - b.price || a.label.localeCompare(b.label));
  }

  return [...byCode.values()];
};

/** "PMS\nCalabar N1,210/L\nWarri N1,220/L" — one product's block. */
const renderGroup = (group) =>
  [group.code, ...group.locations.map((l) => `${l.label} N${money(l.price)}/${l.unitSuffix}`)].join("\n");

/** Every product's block, blank line between. What {{prices}} becomes. */
const renderAll = (groups) => groups.map(renderGroup).join("\n\n");

/**
 * Time-of-day greeting, in the sender's timezone rather than the server's.
 *
 * "Good Morning" on a message that lands at 4pm is the tell that a blast was
 * automated, which is the one thing a price advisory should not look like.
 */
const greeting = (now = new Date(), timeZone = "Africa/Lagos") => {
  const hour = Number(
    new Intl.DateTimeFormat("en-NG", { hour: "numeric", hour12: false, timeZone }).format(now)
  );
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
};

/**
 * Resolve the shortcodes in a message body.
 *
 * Applied both when "Insert current prices" is clicked (so the sender sees
 * exactly what will go out) and again at send time, so a SAVED template stays
 * correct: the whole point is that yesterday's template carries today's price.
 *
 * Unknown shortcodes are left alone rather than blanked — a typo should be
 * visible in the preview, not silently swallowed.
 */
const SHORTCODES = [
  { token: "prices", label: "All prices", hint: "Every product, grouped, with its locations" },
  { token: "prices:CODE", label: "One product", hint: "e.g. {{prices:PMS}} — just that product's block" },
  { token: "greeting", label: "Greeting", hint: "Good Morning / Afternoon / Evening, by the time it sends" },
  { token: "date", label: "Today's date", hint: "e.g. 27 August 2026" },
];

const render = async (body, { depotIds, now = new Date() } = {}) => {
  const text = String(body || "");
  if (!text.includes("{{")) return text;

  const rows = await quotableRows({ depotIds });
  const groups = groupRows(rows);

  return text.replace(/\{\{\s*([a-zA-Z]+)(?::([^}]+))?\s*\}\}/g, (whole, name, arg) => {
    const key = name.toLowerCase();
    if (key === "prices") {
      if (!arg) return renderAll(groups);
      const wanted = String(arg).trim().toUpperCase();
      const group = groups.find((g) => g.code.toUpperCase() === wanted);
      // A product with no quotable price today renders as nothing rather than
      // as a bare heading with no lines under it.
      return group ? renderGroup(group) : "";
    }
    if (key === "greeting") return greeting(now);
    if (key === "date") {
      return new Intl.DateTimeFormat("en-NG", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos",
      }).format(now);
    }
    return whole;
  });
};

module.exports = {
  quotableRows,
  groupRows,
  renderGroup,
  renderAll,
  render,
  greeting,
  cityLabel,
  unitSuffix,
  SHORTCODES,
};
