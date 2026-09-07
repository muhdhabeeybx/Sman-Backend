const { sendReply } = require("../whatsapp/client");
const { REPLY } = require("../whatsapp/constants");
const { buildCombinedDailyReportData } = require("./dailyCombinedReport.service");

/**
 * The day's trading, as a WhatsApp message.
 *
 * Deliberately text and nothing else. The email carries a workbook because it
 * is read at a desk; this is read on a phone, one-handed, usually while the
 * person is somewhere else. A spreadsheet attachment on WhatsApp is a file
 * somebody has to download, open in another app, and pinch-zoom through — so
 * it goes unread, and an unread report is worse than a short one.
 *
 * What survives the cut is what a manager actually asks at the end of a day:
 * how much moved, what it was worth, where, and whether that is better or
 * worse than yesterday. Everything else stays in the workbook.
 *
 * There is no schedule here on purpose. The nightly email is automatic because
 * it lands in an inbox and waits; a WhatsApp message interrupts, so it is sent
 * when somebody decides to send it — the button in the Reports Hub.
 */

/** Naira, rounded to whole units. Kobo on a phone is noise. */
const money = (n) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;

/** Litres, with a thousands separator and no decimal tail. */
const litres = (n) => `${Math.round(Number(n) || 0).toLocaleString("en-NG")}L`;

/**
 * Yesterday, for the comparison line — but only a day that actually traded.
 *
 * A depot that was closed is not a 100% fall, and reporting it as one trains
 * people to ignore the comparison entirely.
 */
const lastTradingDay = (history, reportDate) =>
  history
    .filter((d) => d.date < reportDate && d.orderCount > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;

const movement = (today, prior) => {
  if (!prior || !prior.amountNaira) return null;
  const change = ((today - prior.amountNaira) / prior.amountNaira) * 100;
  if (!Number.isFinite(change) || Math.abs(change) < 0.5) return "level with";
  return `${Math.abs(change).toFixed(0)}% ${change > 0 ? "up on" : "down on"}`;
};

/**
 * Build the message body.
 *
 * WhatsApp renders *bold* and _italic_ from asterisks and underscores, so the
 * structure is carried by those rather than by spacing that collapses on a
 * narrow screen. Kept under roughly 1,500 characters: past that the client
 * truncates behind a "Read more" and the locations — the part people scroll
 * for — are the half that gets hidden.
 *
 * @param {Awaited<ReturnType<typeof buildCombinedDailyReportData>>} data
 */
const buildReportMessage = (data) => {
  const { reportDate, totals, locations, history } = data;

  const pretty = new Date(`${reportDate}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lines = [`*Soroman — daily report*`, `_${pretty}_`, ""];

  // The headline, in the order the questions get asked.
  lines.push(`*${litres(totals.qtyLitres)}* sold · *${money(totals.amountNaira)}*`);
  lines.push(`${totals.orderCount} order${totals.orderCount === 1 ? "" : "s"} across ${locations.length} location${locations.length === 1 ? "" : "s"}`);

  const prior = lastTradingDay(history || [], reportDate);
  const change = movement(totals.amountNaira, prior);
  if (change) {
    const when = prior.date === reportDate ? "yesterday" : `${prior.date}`;
    lines.push(`_${change} ${when} (${money(prior.amountNaira)})_`);
  }

  // Locations, biggest first — a manager scanning this wants the one that
  // moved most, not the one that happens to sort first alphabetically.
  const traded = [...locations]
    .filter((l) => l.orderCount > 0 || l.orderValue > 0)
    .sort((a, b) => b.orderValue - a.orderValue);

  if (traded.length) {
    lines.push("", "*By location*");
    for (const loc of traded) {
      lines.push(`• ${loc.name} — ${litres(loc.orderLitres)} · ${money(loc.orderValue)}`);
    }
  }

  // Sites that filed nothing are the actionable half of the report: it is the
  // one thing on here somebody has to chase tonight rather than read tomorrow.
  const silent = locations.filter((l) => l.orderCount === 0 && l.orderValue === 0);
  if (silent.length) {
    lines.push("", `_No trading filed: ${silent.map((l) => l.name).join(", ")}_`);
  }

  if (totals.staffEntries === 0) {
    lines.push("", "_No staff report sheets were filed today._");
  }

  return lines.join("\n");
};

/**
 * The report as named pieces, for binding into a template's {{1}}, {{2}}, …
 *
 * Separate from buildReportMessage because a template is not free text: Meta
 * REJECTS any parameter containing a newline, a tab, or five or more
 * consecutive spaces, so the multi-line summary cannot be passed as one
 * variable. Every value here is a single line by construction.
 */
const buildReportFields = (data) => {
  const { reportDate, totals, locations, history } = data;

  const pretty = new Date(`${reportDate}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const traded = [...locations]
    .filter((l) => l.orderCount > 0 || l.orderValue > 0)
    .sort((a, b) => b.orderValue - a.orderValue);

  const prior = lastTradingDay(history || [], reportDate);
  const change = movement(totals.amountNaira, prior);

  return {
    date: pretty,
    litres: litres(totals.qtyLitres),
    value: money(totals.amountNaira),
    orders: String(totals.orderCount),
    locationCount: String(traded.length),
    /** Every trading location on one line, since a template cannot take many. */
    locations: traded.length
      ? traded.map((l) => `${l.name}: ${litres(l.orderLitres)} / ${money(l.orderValue)}`).join(" · ")
      : "No trading recorded",
    /** The comparison, or a dash when there is no earlier day to compare to. */
    trend: change && prior ? `${change} ${prior.date} (${money(prior.amountNaira)})` : "no prior day to compare",
    /** The whole summary, flattened to one line as a catch-all binding. */
    summary: buildReportMessage(data),
  };
};

/**
 * Meta's rule for template parameters, applied rather than hoped for.
 *
 * A newline, a tab or a run of spaces in any parameter fails the whole send
 * with a 132000-series error and no partial delivery. Collapsing them here is
 * the difference between a report that arrives and one that silently does not.
 */
const oneLine = (value) =>
  String(value === null || value === undefined ? "" : value)
    .replace(/[\r\n\t]+/g, " · ")
    .replace(/\s{4,}/g, " ")
    .trim();

/**
 * Which field fills which numbered placeholder.
 *
 * A template's shape is decided in Meta's console, not here, so the binding is
 * configuration: set WHATSAPP_REPORT_TEMPLATE_PARAMS to a comma-separated list
 * of the field names above, in placeholder order. The default suits a body
 * reading roughly:
 *
 *   Soroman daily report for {{1}}.
 *   {{2}} sold, worth {{3}}, across {{4}} orders.
 *   {{5}}
 *
 * Getting the count wrong is the one failure Meta will not forgive — it
 * rejects the send outright — so the resolved parameters are returned to the
 * caller, and the endpoint's preview mode shows them before anything is sent.
 */
const DEFAULT_TEMPLATE_PARAMS = ["date", "litres", "value", "orders", "locations"];

const templateParameters = (fields) => {
  const configured = String(process.env.WHATSAPP_REPORT_TEMPLATE_PARAMS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const keys = configured.length ? configured : DEFAULT_TEMPLATE_PARAMS;
  return keys.map((key) => oneLine(fields[key] ?? ""));
};

/**
 * A Nigerian mobile number as WhatsApp wants it: digits, country code, no +.
 *
 * Accepts what people actually type — 0803…, +234803…, 234 803 … — because the
 * numbers come from a text box and a report that silently fails to send to a
 * mistyped number is the worst outcome available.
 */
const normaliseNumber = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("234")) return digits.length === 13 ? digits : null;
  if (digits.startsWith("0")) return digits.length === 11 ? `234${digits.slice(1)}` : null;
  // A bare 10-digit local number, missing its leading zero.
  if (digits.length === 10) return `234${digits}`;
  // Anything else is assumed already international — this is not Nigeria-only,
  // it just knows Nigeria's shapes.
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

/**
 * Send the day's summary to a list of numbers.
 *
 * Every recipient is attempted even when an earlier one fails, and the result
 * says which succeeded — a partial send that reports success is how the desk
 * ends up believing a manager was told something they never saw.
 *
 * @param {{ date?: Date | string, recipients: string[] }} opts
 */
const sendDailyReportToWhatsApp = async ({ date, recipients, preview = false }) => {
  const list = (Array.isArray(recipients) ? recipients : [])
    .map((r) => ({ raw: r, to: normaliseNumber(r) }))
    .filter((r, i, all) => all.findIndex((x) => x.to && x.to === r.to) === i);

  const invalid = list.filter((r) => !r.to).map((r) => r.raw);
  const valid = list.filter((r) => r.to);

  if (!valid.length) {
    const err = new Error(
      invalid.length
        ? `No usable phone numbers — check ${invalid.join(", ")}`
        : "Add at least one phone number",
    );
    err.status = 400;
    throw err;
  }

  const data = await buildCombinedDailyReportData(date ? new Date(date) : new Date());
  const body = buildReportMessage(data);

  /**
   * A template by default, plain text only if the template is switched off.
   *
   * Meta permits free-form text only inside 24 hours of the recipient's last
   * message to the business. A report sent at the end of a day is business-
   * initiated, so outside that window it MUST be an approved template — which
   * is now `daily_sales_report`. Setting WHATSAPP_REPORT_TEMPLATE to an empty
   * string falls back to plain text, useful for testing against a number that
   * has just messaged the bot.
   */
  const templateName = process.env.WHATSAPP_REPORT_TEMPLATE === undefined
    ? "daily_sales_report"
    : String(process.env.WHATSAPP_REPORT_TEMPLATE).trim();

  const fields = buildReportFields(data);
  const parameters = templateName ? templateParameters(fields) : [];

  const reply = templateName
    ? {
        kind: REPLY.TEMPLATE,
        name: templateName,
        language: process.env.WHATSAPP_REPORT_TEMPLATE_LANG || "en",
        variables: parameters,
      }
    : { kind: REPLY.TEXT, body };

  /**
   * Preview sends nothing.
   *
   * A template rejects the whole send when the parameter count does not match
   * the body approved in Meta's console, and the error comes back as an opaque
   * code per recipient. Being able to see the exact parameters first turns that
   * from a guessing game into a comparison.
   */
  if (preview) {
    return {
      reportDate: data.reportDate,
      preview: true,
      channel: templateName ? "template" : "text",
      templateName: templateName || null,
      parameters,
      fields,
      body,
      recipients: valid.map((r) => r.raw),
      skipped: invalid,
      sent: [],
      failed: [],
    };
  }

  const results = await Promise.all(
    valid.map(async ({ to, raw }) => {
      try {
        const res = await sendReply(to, reply);
        if (res?.skipped) return { to: raw, ok: false, error: res.reason };
        return { to: raw, ok: true };
      } catch (err) {
        return {
          to: raw,
          ok: false,
          error: err?.response?.data?.error?.message || err.message || "Send failed",
        };
      }
    }),
  );

  const sent = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  return {
    reportDate: data.reportDate,
    channel: templateName ? "template" : "text",
    templateName: templateName || null,
    parameters,
    body,
    sent: sent.map((r) => r.to),
    failed,
    skipped: invalid,
  };
};

module.exports = {
  sendDailyReportToWhatsApp,
  buildReportMessage,
  buildReportFields,
  templateParameters,
  normaliseNumber,
};
