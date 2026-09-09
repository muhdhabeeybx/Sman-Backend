const axios = require("axios");
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
 * The approved template, read from Meta rather than assumed.
 *
 * Cloud API error 132000 — "Number of parameters does not match the expected
 * number of params" — rejects the whole send and says nothing about what the
 * expected number IS. That leaves an operator guessing at a number only Meta
 * knows, which is not a debugging position anybody should be put in.
 *
 * So the body is fetched and its {{n}} placeholders counted. Cached for a few
 * minutes: a template changes when somebody edits it in the console, which is
 * rare, and this must not add a Graph round trip to every send.
 *
 * Failure to read it is not fatal. The send proceeds and Meta remains the
 * authority — this only ever improves the error message.
 */
let templateCache = { at: 0, name: null, value: null };
const TEMPLATE_TTL_MS = 5 * 60 * 1000;

const fetchTemplate = async (name) => {
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim().replace(/^["']|["']$/g, "");
  const waba = String(process.env.WHATSAPP_WABA_ID || "").trim().replace(/^["']|["']$/g, "");
  if (!token || !waba || !name) return null;

  if (templateCache.name === name && Date.now() - templateCache.at < TEMPLATE_TTL_MS) {
    return templateCache.value;
  }

  const version = String(process.env.WHATSAPP_GRAPH_VERSION || "v25.0").replace(/^v?/, "v");
  try {
    const res = await axios.get(`https://graph.facebook.com/${version}/${waba}/message_templates`, {
      params: { name, limit: 5 },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
    const tpl = (res.data?.data || []).find((t) => t.name === name);
    if (!tpl) return null;

    const body = (tpl.components || []).find((c) => String(c.type).toUpperCase() === "BODY");
    const text = body?.text || "";
    // Distinct placeholders, because {{1}} may legitimately appear twice and
    // Meta still expects one parameter for it.
    const placeholders = new Set((text.match(/\{\{\s*\d+\s*\}\}/g) || []).map((m) => m.replace(/\D/g, "")));
    const value = {
      name: tpl.name,
      language: tpl.language,
      status: tpl.status,
      body: text,
      expects: placeholders.size,
      // A header can carry its own variable, and a mismatch there produces the
      // same 132000 — worth naming so it is not hunted for in the body.
      hasVariableHeader: (tpl.components || []).some(
        (c) => String(c.type).toUpperCase() === "HEADER" && /\{\{\s*\d+\s*\}\}/.test(c.text || ""),
      ),
    };
    templateCache = { at: Date.now(), name, value };
    return value;
  } catch {
    return null;
  }
};

/**
 * How long the whole send may take before the endpoint answers anyway.
 *
 * This is an interactive request — somebody pressed a button and is watching a
 * spinner — and it sits behind a proxy that gives up on a slow upstream and
 * returns 502 itself. A 502 from the proxy carries no CORS headers, so the
 * browser reports a CORS failure and the real cause never reaches anyone.
 *
 * whatsapp/client retries a send three times at a fifteen-second timeout, so
 * one unreachable number can occupy forty-five seconds on its own. Rather than
 * change the bot's retry policy — that policy is right for a queued worker,
 * which is what it was written for — this path stops WAITING at its own
 * deadline and reports what had not finished. The underlying request may still
 * complete; what it may not do is hold the response open past the proxy.
 */
const SEND_DEADLINE_MS = Number(process.env.WHATSAPP_REPORT_DEADLINE_MS) || 20000;

/** Resolve with a marker rather than reject, so one slow number is not fatal. */
const withDeadline = (promise, ms) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ __timedOut: true }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
  const template = templateName ? await fetchTemplate(templateName) : null;

  if (preview) {
    return {
      reportDate: data.reportDate,
      preview: true,
      channel: templateName ? "template" : "text",
      templateName: templateName || null,
      parameters,
      // What Meta actually approved, so the two can be read side by side
      // rather than one being inferred from an error code.
      template,
      fields,
      body,
      recipients: valid.map((r) => r.raw),
      skipped: invalid,
      sent: [],
      failed: [],
    };
  }

  /**
   * A parameter count that cannot match is refused before any send.
   *
   * Meta rejects the whole message with 132000 and never says what it expected,
   * so attempting it once per recipient produces a column of identical, useless
   * errors. Having read the template, the mismatch is knowable in advance — and
   * the fix is named in the message, because it is a setting rather than code.
   */
  if (template && template.expects !== parameters.length) {
    const fieldNames = Object.keys(fields).join(", ");
    return {
      reportDate: data.reportDate,
      channel: "template",
      templateName,
      template,
      parameters,
      body,
      sent: [],
      failed: valid.map(({ raw }) => ({
        to: raw,
        error: `Template "${templateName}" expects ${template.expects} parameter${template.expects === 1 ? "" : "s"}, this is sending ${parameters.length}`,
      })),
      configHint:
        `Set WHATSAPP_REPORT_TEMPLATE_PARAMS to ${template.expects} of: ${fieldNames} — in the order the template uses them.`,
      skipped: invalid,
    };
  }

  /**
   * WhatsApp being switched off is one fact about the system, not a failure of
   * each number in turn.
   *
   * Reported per recipient it read as five separate delivery problems, and the
   * one thing that would fix all of them — a setting — was never named as a
   * setting. Answered up front instead, so the message says what to change.
   */
  if (String(process.env.WHATSAPP_ENABLED || "").trim() !== "true") {
    return {
      reportDate: data.reportDate,
      channel: templateName ? "template" : "text",
      templateName: templateName || null,
      parameters,
      body,
      disabled: true,
      sent: [],
      failed: valid.map(({ raw }) => ({ to: raw, error: "WhatsApp sending is switched off" })),
      skipped: invalid,
    };
  }

  const deadline = Date.now() + SEND_DEADLINE_MS;
  const results = await Promise.all(
    valid.map(async ({ to, raw }) => {
      try {
        const remaining = Math.max(1000, deadline - Date.now());
        const res = await withDeadline(sendReply(to, reply), remaining);
        if (res?.__timedOut) {
          return {
            to: raw,
            ok: false,
            error: "WhatsApp did not answer in time — it may still arrive. Check the delivery log.",
          };
        }
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

  /**
   * A template we could not read is the likeliest reason we are here.
   *
   * fetchTemplate returns null rather than throwing, on purpose — Meta stays
   * the authority and an unreadable template must not block a send that would
   * otherwise work. But null also skips the parameter pre-check above, so the
   * one error that check exists to pre-empt (132000, "number of parameters
   * does not match") comes back per recipient as an opaque code instead.
   *
   * That is a missing WHATSAPP_WABA_ID or an access token without
   * whatsapp_business_management scope far more often than it is a real
   * template problem, and neither is guessable from Meta's reply. Say which
   * it is, but only when the send actually failed — a working send does not
   * need to explain itself.
   */
  const couldNotReadTemplate = Boolean(templateName) && !template;

  return {
    reportDate: data.reportDate,
    channel: templateName ? "template" : "text",
    templateName: templateName || null,
    parameters,
    body,
    sent: sent.map((r) => r.to),
    failed,
    skipped: invalid,
    ...(couldNotReadTemplate && failed.length && !sent.length
      ? {
          configHint:
            `Could not read template "${templateName}" from Meta, so its parameter count was not checked ` +
            `before sending — set WHATSAPP_WABA_ID and give WHATSAPP_ACCESS_TOKEN the ` +
            `whatsapp_business_management scope, then use Preview to compare the approved body ` +
            `against the ${parameters.length} parameter${parameters.length === 1 ? "" : "s"} being sent.`,
        }
      : {}),
  };
};

module.exports = {
  sendDailyReportToWhatsApp,
  buildReportMessage,
  buildReportFields,
  templateParameters,
  normaliseNumber,
};
