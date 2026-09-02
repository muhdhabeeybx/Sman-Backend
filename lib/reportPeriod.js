/**
 * The window a report covers, resolved once.
 *
 * Every dashboard figure has to agree about which days it is describing, and
 * the page has to be able to say so on its face — "this is August", "this is
 * 3–17 September" — rather than leaving the reader to remember what they
 * picked. So the window and its label are produced together, here, and the
 * label travels with the data.
 *
 * Accepts either a named preset or an explicit from/to pair. A custom range
 * wins whenever both ends parse, which is what lets the UI offer a date picker
 * without the server needing a preset for every possible span.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** A valid Date, or null for empty/garbage — never an Invalid Date. */
const parseDate = (value) => {
  if (!value) return null;
  // A bare "2026-08-20" parses as UTC midnight; read it as a local calendar
  // day instead, so a range picked in Lagos covers the days it names.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dayLabel = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

/**
 * Name a window the way somebody would say it out loud.
 *
 * One day is "20 Aug 2026", a whole calendar month is "August 2026", and
 * anything else is its two ends. A range that happens to be a month is worth
 * recognising, because "1 Aug 2026 – 31 Aug 2026" is a clumsy way to write
 * August and this label ends up in exported file names and report headers.
 */
const describe = (from, to) => {
  const sameDay = from.toDateString() === to.toDateString();
  if (sameDay) return dayLabel(from);

  const isWholeMonth =
    from.getDate() === 1 &&
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear() &&
    to.getDate() === new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  if (isWholeMonth) return `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;

  const isWholeYear =
    from.getMonth() === 0 && from.getDate() === 1 &&
    to.getMonth() === 11 && to.getDate() === 31 &&
    from.getFullYear() === to.getFullYear();
  if (isWholeYear) return String(from.getFullYear());

  return `${dayLabel(from)} – ${dayLabel(to)}`;
};

/** Whole calendar days the window covers, both ends inclusive. */
const daysBetween = (from, to) =>
  Math.round((startOfDay(to) - startOfDay(from)) / MS_DAY) + 1;

/**
 * How to bucket a trend line over this window.
 *
 * A year plotted by day is 365 unreadable points; a single day plotted by day
 * is one. The granularity follows the span so a chart is legible whatever was
 * picked.
 */
const granularityFor = (from, to) => {
  const days = daysBetween(from, to);
  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 400) return "week";
  return "month";
};

/**
 * @param {object} query
 * @param {string} [query.period] a preset name
 * @param {string} [query.from]   explicit range start (wins over the preset)
 * @param {string} [query.to]     explicit range end
 * @returns {{from: string, to: string, label: string, granularity: string,
 *            days: number, preset: string}}
 */
function resolvePeriod({ period = "month", from: rawFrom, to: rawTo } = {}) {
  const now = new Date();

  // An explicit range wins, and a single date given as `from` alone means
  // that one day — which is how a date picker behaves before you pick a second.
  const customFrom = parseDate(rawFrom);
  const customTo = parseDate(rawTo);
  let from;
  let to;
  let preset = period;

  if (customFrom) {
    from = startOfDay(customFrom);
    to = endOfDay(customTo || customFrom);
    preset = "custom";
  } else {
    switch (period) {
      case "today":
        from = startOfDay(now);
        to = endOfDay(now);
        break;
      case "yesterday": {
        const y = new Date(now.getTime() - MS_DAY);
        from = startOfDay(y);
        to = endOfDay(y);
        break;
      }
      case "week":
        from = startOfDay(new Date(now.getTime() - 6 * MS_DAY));
        to = endOfDay(now);
        break;
      case "last-month": {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        from = startOfDay(first);
        to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
        break;
      }
      case "quarter": {
        const q = Math.floor(now.getMonth() / 3);
        from = startOfDay(new Date(now.getFullYear(), q * 3, 1));
        to = endOfDay(now);
        break;
      }
      case "year":
        from = startOfDay(new Date(now.getFullYear(), 0, 1));
        to = endOfDay(now);
        break;
      case "all":
        // Far enough back to predate the business; the label says so rather
        // than printing a fictional start date.
        from = new Date(2000, 0, 1);
        to = endOfDay(now);
        break;
      case "month":
      default:
        from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
        to = endOfDay(now);
        preset = "month";
        break;
    }
  }

  // A range picked backwards is a slip, not a request for no data.
  if (from > to) [from, to] = [to, from];

  const label =
    preset === "all"
      ? "All time"
      : preset === "month" && from.getDate() === 1 && to.toDateString() === endOfDay(now).toDateString()
        ? `${MONTHS[from.getMonth()]} ${from.getFullYear()} to date`
        : describe(from, to);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label,
    granularity: granularityFor(from, to),
    days: daysBetween(from, to),
    preset,
  };
}

module.exports = { resolvePeriod, describe, granularityFor };
