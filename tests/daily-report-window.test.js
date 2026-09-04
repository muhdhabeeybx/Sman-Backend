require("dotenv").config();

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { dayBounds, localDateStr } = require("../services/dailyCombinedReport.service");

/**
 * The window the daily report covers.
 *
 * This is pure date arithmetic and needs no database, which is the point: the
 * bug it pins was invisible in every other test because every other test asked
 * "did the report render", not "did it cover the right hours".
 *
 * The report is sent at 23:50 Africa/Lagos. It used to take UTC midnight either
 * side of "now", so the window for day D ran 01:00 WAT on D to 01:00 WAT on
 * D+1 — meaning the last 1h10m of each window had not happened yet when the
 * email went out, and the NEXT night's window began after it. Every order
 * placed between 23:50 and 01:00 appeared in no report at all.
 */

const LAGOS = "Africa/Lagos";
const lagos = (d) => d.toLocaleString("en-GB", { timeZone: LAGOS, hour12: false });

describe("daily report — the window it covers", () => {
  test("a Lagos day runs from local midnight to local midnight", () => {
    // 23:50 WAT on 4 Sep is 22:50 UTC on 4 Sep.
    const sendTime = new Date("2026-09-04T22:50:00Z");
    const { start, end, dayStr } = dayBounds(sendTime);

    assert.equal(dayStr, "2026-09-04", "the report is dated by the Lagos calendar day");
    assert.equal(start.toISOString(), "2026-09-03T23:00:00.000Z", "starts at 00:00 WAT");
    assert.equal(end.toISOString(), "2026-09-04T23:00:00.000Z", "ends at 00:00 WAT next day");
    assert.equal(end - start, 24 * 60 * 60 * 1000, "exactly one day long");
  });

  test("the first hour after Lagos midnight belongs to the new day, not the old one", () => {
    // 00:30 WAT on 4 Sep is 23:30 UTC on the 3rd. Under the old UTC-midnight
    // rule this fell in the 3rd's window — and the 3rd's report had already
    // been sent at 23:50 the night before, so nothing ever reported it.
    const justAfterMidnight = new Date("2026-09-03T23:30:00Z");

    assert.equal(localDateStr(justAfterMidnight), "2026-09-04");
    const { dayStr, start, end } = dayBounds(justAfterMidnight);
    assert.equal(dayStr, "2026-09-04");
    assert.ok(justAfterMidnight >= start && justAfterMidnight < end, "falls inside its own day");
  });

  test("consecutive days abut exactly — no gap, no overlap", () => {
    const d4 = dayBounds(new Date("2026-09-04T22:50:00Z"));
    const d5 = dayBounds(new Date("2026-09-05T22:50:00Z"));

    assert.equal(d4.dayStr, "2026-09-04");
    assert.equal(d5.dayStr, "2026-09-05");
    assert.equal(
      d4.end.toISOString(),
      d5.start.toISOString(),
      "one day ends exactly where the next begins — this is what closed the 70-minute hole"
    );
  });

  test("every instant of a Lagos day lands in that day's window", () => {
    // Walk the whole day in 10-minute steps, including the 23:50 send time and
    // the midnight boundary either side.
    const { start, end, dayStr } = dayBounds(new Date("2026-09-04T22:50:00Z"));
    for (let t = start.getTime(); t < end.getTime(); t += 10 * 60 * 1000) {
      const at = new Date(t);
      assert.equal(
        dayBounds(at).dayStr,
        dayStr,
        `${at.toISOString()} (${lagos(at)} WAT) should belong to ${dayStr}`
      );
    }
  });

  test("month and year boundaries hold", () => {
    // 00:30 WAT on 1 Jan 2027 = 23:30 UTC on 31 Dec 2026.
    const newYear = new Date("2026-12-31T23:30:00Z");
    assert.equal(dayBounds(newYear).dayStr, "2027-01-01");

    // 23:50 WAT on 30 Sep = 22:50 UTC on 30 Sep — still September.
    const monthEnd = new Date("2026-09-30T22:50:00Z");
    assert.equal(dayBounds(monthEnd).dayStr, "2026-09-30");
    assert.equal(dayBounds(monthEnd).end.toISOString(), "2026-09-30T23:00:00.000Z");
  });

  test("the send time sits inside the day it reports on", () => {
    // The report goes out at 23:50 WAT and covers up to 00:00 WAT, so it is
    // missing the final 10 minutes by design — an accepted, stated trade for
    // sending before midnight rather than after it.
    const sendTime = new Date("2026-09-04T22:50:00Z");
    const { start, end } = dayBounds(sendTime);
    assert.ok(sendTime > start && sendTime < end, "sent within its own window");
    assert.equal((end - sendTime) / 60000, 10, "exactly 10 minutes of the day remain unreported");
  });
});
