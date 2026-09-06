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
const sendDailyReportToWhatsApp = async ({ date, recipients }) => {
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
   * A template when one is configured, plain text otherwise.
   *
   * Meta only permits free-form text inside 24 hours of the recipient's last
   * message to the business. A report pushed at the end of a day is business-
   * initiated, so outside that window it needs an approved template — set
   * WHATSAPP_REPORT_TEMPLATE to its name once Meta approves it and this
   * switches over. Left unset it sends plain text, which reaches anybody who
   * has messaged the bot recently and fails cleanly for anybody who has not,
   * with the reason recorded per recipient below.
   */
  const templateName = String(process.env.WHATSAPP_REPORT_TEMPLATE || "").trim();
  const reply = templateName
    ? {
        kind: REPLY.TEMPLATE,
        name: templateName,
        language: process.env.WHATSAPP_REPORT_TEMPLATE_LANG || "en",
        variables: [body],
      }
    : { kind: REPLY.TEXT, body };

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
    body,
    sent: sent.map((r) => r.to),
    failed,
    skipped: invalid,
  };
};

module.exports = { sendDailyReportToWhatsApp, buildReportMessage, normaliseNumber };
