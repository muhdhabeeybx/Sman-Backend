const asyncHandler = require("express-async-handler");
const priceList = require("../../services/priceList.service");

/**
 * The price advisory the messaging composer builds its SMS from.
 *
 * Two endpoints, because the composer needs two different things: the depot
 * picker needs the rows to tick, and the message needs the rendered block. Both
 * come off the same service, so what the picker shows and what the SMS says
 * cannot drift apart.
 */

/**
 * GET /api/price-list — what is quotable right now.
 *
 * `depotIds` (comma-separated) narrows it to the depots the sender has ticked,
 * which is also what decides whether a location can be labelled by its city:
 * two Port Harcourt depots ticked means both are named in full.
 */
const getPriceList = asyncHandler(async (req, res) => {
  const depotIds = String(req.query.depotIds || "")
    .split(",")
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isFinite(v) && v > 0);

  // Every quotable depot, so the picker can offer the ones not currently
  // ticked; the groups reflect only the ticked ones.
  const [allRows, selectedRows] = await Promise.all([
    priceList.quotableRows({}),
    priceList.quotableRows({ depotIds }),
  ]);

  const groups = priceList.groupRows(selectedRows);

  const depotMap = new Map();
  for (const r of allRows) {
    if (!depotMap.has(r.depotId)) {
      depotMap.set(r.depotId, { id: r.depotId, name: r.depotName, city: r.city, state: r.state, products: [] });
    }
    depotMap.get(r.depotId).products.push({
      code: r.code, name: r.product, price: r.price, unitSuffix: r.unitSuffix,
    });
  }

  res.json({
    success: true,
    data: {
      depots: [...depotMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      groups,
      /** Exactly what {{prices}} resolves to for this selection. */
      text: priceList.renderAll(groups),
      greeting: priceList.greeting(),
      shortcodes: priceList.SHORTCODES,
    },
  });
});

/**
 * POST /api/price-list/preview — a message body with its shortcodes resolved.
 *
 * The composer previews through here rather than resolving client-side, so the
 * text shown before sending is produced by the same code that will produce the
 * text actually sent.
 */
const previewBody = asyncHandler(async (req, res) => {
  const { body, depotIds } = req.body;
  const text = await priceList.render(body, { depotIds });
  res.json({ success: true, data: { text } });
});

module.exports = { getPriceList, previewBody };
