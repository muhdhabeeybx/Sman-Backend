#!/usr/bin/env node
/**
 * Put the value back on the IT compliance reports that recorded a day at ₦0.
 *
 * The compliance sheet collected a price table on screen and then dropped it
 * on the way to the API — a `def.type === 'sales_manager'` check the sheet was
 * never added to. With no rows to read, the server fell back to
 * litres × avgPrice, and the dashboard was sending NaN for both (they lived in
 * their own state, not in the form the payload was built from). NaN becomes
 * null in JSON and 0 in the schema, so the report filed cleanly and recorded
 * nothing.
 *
 * 101 of 105 filed reports are wrong on record because of it, in two shapes:
 *
 *   nothing recorded      litres 0, value 0, price 0. Nothing was stated, so
 *                         the day's own orders are put in whole: price rows,
 *                         volume, value and weighted price.
 *   volume but no value   a real volume, value 0, price 0. The volume WAS
 *                         stated, so it is left exactly as filed and only the
 *                         value and price are worked out — at the price that
 *                         day's orders went out at, applied to the filed
 *                         volume. No price rows are written, because rows
 *                         adding up to a different volume would contradict
 *                         the figure the filer stood behind.
 *
 * A row is only ever touched where every figure being written is currently
 * zero. Nothing that anybody stated is overwritten, and a row whose day has no
 * orders to read is skipped and listed.
 *
 * Dry run unless --apply is passed. Read the summary before applying: this
 * writes to filed compliance records.
 *
 * Usage:
 *   node scripts/repair-compliance-report-totals.js              # dry run
 *   node scripts/repair-compliance-report-totals.js --apply
 *   node scripts/repair-compliance-report-totals.js --date=2026-08-26
 */
require("dotenv").config();

const { and, eq, gte, lt, sql } = require("drizzle-orm");
const { db, client } = require("../config/db");
const { dailyReports, orders, pfis } = require("../db/schema");

const APPLY = process.argv.includes("--apply");
const DATE = (process.argv.find((a) => a.startsWith("--date=")) || "").split("=")[1];

/** Reports are filed against a Lagos day; created_at is stored with a zone. */
const LAGOS = "Africa/Lagos";

const money = (v) =>
  `₦${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v) => Number(v).toLocaleString("en-NG");

async function ordersForReport(row) {
  const [pfi] = await db
    .select({ id: pfis.id })
    .from(pfis)
    .where(eq(pfis.pfiNumber, row.pfiNumber))
    .limit(1);
  if (!pfi) return null;

  return db
    .select({
      quantity: orders.quantity,
      price: orders.price,
      totalAmount: orders.totalAmount,
    })
    .from(orders)
    .where(
      and(
        eq(orders.pfiId, pfi.id),
        gte(sql`(${orders.createdAt} AT TIME ZONE ${LAGOS})::date`, row.reportDate),
        lt(
          sql`(${orders.createdAt} AT TIME ZONE ${LAGOS})::date`,
          sql`(${row.reportDate}::date + 1)`
        )
      )
    );
}

/** The day's orders as price rows, one per distinct unit price. */
function toBands(dayOrders) {
  const byPrice = new Map();
  for (const o of dayOrders) {
    const price = Math.round(Number(o.price || 0) * 100) / 100;
    byPrice.set(price, (byPrice.get(price) || 0) + Number(o.quantity || 0));
  }
  return [...byPrice.entries()]
    .map(([price, litres]) => ({ price, litres }))
    .sort((a, b) => a.price - b.price);
}

async function main() {
  const conditions = [
    eq(dailyReports.reportType, "it_compliance"),
    sql`jsonb_array_length(COALESCE(${dailyReports.priceBands}, '[]'::jsonb)) = 0`,
    eq(dailyReports.totalSalesAmount, "0.00"),
    sql`${dailyReports.pfiNumber} <> ''`,
  ];
  if (DATE) conditions.push(eq(dailyReports.reportDate, DATE));

  // Named columns, not `select()`: this has to run against a database that
  // has not had the latest migration yet — which is the state it is most
  // useful in — and a star select would ask for columns that are not there.
  const broken = await db
    .select({
      id: dailyReports.id,
      reportDate: dailyReports.reportDate,
      pfiNumber: dailyReports.pfiNumber,
      litresSold: dailyReports.litresSold,
    })
    .from(dailyReports)
    .where(and(...conditions))
    .orderBy(dailyReports.reportDate);

  console.log(
    `${broken.length} compliance report(s) recorded at ₦0 with no price rows` +
      (DATE ? ` on ${DATE}` : "") +
      `.\n${APPLY ? "APPLYING" : "Dry run — nothing will be written"}.\n`
  );

  const skipped = [];
  let repaired = 0;
  let recovered = 0;

  for (const row of broken) {
    const dayOrders = await ordersForReport(row);
    if (dayOrders === null) {
      skipped.push([row.id, row.reportDate, "no PFI matches that number"]);
      continue;
    }
    if (dayOrders.length === 0) {
      skipped.push([row.id, row.reportDate, "no orders on that day for that PFI"]);
      continue;
    }

    const bands = toBands(dayOrders);
    const dayLitres = bands.reduce((s, b) => s + b.litres, 0);
    const dayValue = bands.reduce((s, b) => s + b.litres * b.price, 0);
    if (dayLitres <= 0) {
      skipped.push([row.id, row.reportDate, "that day's orders carry no volume"]);
      continue;
    }
    const dayPrice = dayValue / dayLitres;

    const filedLitres = Number(row.litresSold || 0);
    // The filer's own volume stands where they stated one; the price rows are
    // only written where nothing was.
    const nothingStated = filedLitres === 0;
    const litres = nothingStated ? dayLitres : filedLitres;
    const value = litres * dayPrice;

    const patch = {
      litresSold: litres.toFixed(2),
      avgPrice: dayPrice.toFixed(2),
      totalSalesAmount: value.toFixed(2),
      ...(nothingStated ? { priceBands: bands } : {}),
    };

    console.log(
      `#${row.id}  ${row.reportDate}  ${row.pfiNumber}\n` +
        `    ${nothingStated ? "nothing recorded" : "volume as filed"}: ` +
        `${qty(litres)} L @ ${money(dayPrice)} = ${money(value)}` +
        `${nothingStated ? `  (+${bands.length} price row(s))` : ""}`
    );

    if (APPLY) {
      await db.update(dailyReports).set(patch).where(eq(dailyReports.id, row.id));
    }
    repaired++;
    recovered += value;
  }

  console.log(
    `\n${repaired} report(s) ${APPLY ? "repaired" : "would be repaired"}, ` +
      `${money(recovered)} of trading put back on the record.`
  );
  if (skipped.length) {
    console.log(`\n${skipped.length} left alone — nothing to work from:`);
    for (const [id, date, why] of skipped) console.log(`  #${id}  ${date}  ${why}`);
  }
  if (!APPLY && repaired > 0) console.log("\nRe-run with --apply to write these.");
}

main()
  .catch((err) => {
    console.error("repair-compliance-report-totals failed:", err);
    process.exitCode = 1;
  })
  .finally(() => client.end({ timeout: 5 }));
