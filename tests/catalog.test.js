// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const { closeDb } = require("./helpers");

const CATALOG = "/api/catalog";
const RUN = Date.now();

const seedDepot = async (name, code) => {
  const [depot] = await db
    .insert(depots)
    .values({
      name,
      code,
      address: "1 Rd",
      city: "Lagos",
      state: "Lagos",
      country: "NG",
      postcode: "100001",
      maxCapacity: 10000000,
      establishedYear: "2020",
    })
    .returning();
  return depot;
};

describe("public catalog — what anyone may see before signing in", () => {
  let stockedDepotId;
  let emptyDepotId;
  let productId;

  before(async () => {
    const stocked = await seedDepot("Catalog Stocked Depot", `CAT${String(RUN).slice(-5)}`);
    stockedDepotId = stocked.id;
    const empty = await seedDepot("Catalog Empty Depot", `CAE${String(RUN).slice(-5)}`);
    emptyDepotId = empty.id;

    const [product] = await db
      .insert(products)
      // `category` is a real classification, not the trade code — that is the
      // shape production has had since categories were normalised, and the
      // fixture has to match it or the badge assertion below proves nothing.
      .values({ name: "Catalog PMS", sku: `CAT-PMS-${String(RUN).slice(-5)}`, category: "Fuel" })
      .returning();
    productId = product.id;

    // Both depots carry a price; only the stocked one has an active PFI, so
    // only the stocked one is orderable.
    await db.insert(depotProductPrices).values([
      { depotId: stockedDepotId, productId, currentPrice: "150" },
      { depotId: emptyDepotId, productId, currentPrice: "150" },
    ]);
    await db.insert(pfis).values({
      pfiNumber: `PFI-CAT-${RUN}`,
      status: "active",
      locationId: stockedDepotId,
      productId,
      startingQtyLitres: 500000,
      soldQtyLitres: 0,
    });
  });

  after(async () => {
    await closeDb();
  });

  test("no authentication is required", async () => {
    const res = await request(app).get(CATALOG);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.depots));
  });

  test("exposes the payment window hours from ORDER_EXPIRY_HOURS", async () => {
    const original = process.env.ORDER_EXPIRY_HOURS;
    try {
      process.env.ORDER_EXPIRY_HOURS = "12";
      const res = await request(app).get(CATALOG);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.orderExpiryHours, 12);
    } finally {
      if (original === undefined) delete process.env.ORDER_EXPIRY_HOURS;
      else process.env.ORDER_EXPIRY_HOURS = original;
    }
  });

  test("returns null hours when expiry is switched off", async () => {
    const original = process.env.ORDER_EXPIRY_DISABLED;
    try {
      process.env.ORDER_EXPIRY_DISABLED = "true";
      const res = await request(app).get(CATALOG);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      // null, not a number: the portal and legal copy read this as "no fixed
      // window" and drop the deadline promise rather than stating one nothing
      // enforces.
      assert.equal(res.body.data.orderExpiryHours, null);
    } finally {
      if (original === undefined) delete process.env.ORDER_EXPIRY_DISABLED;
      else process.env.ORDER_EXPIRY_DISABLED = original;
    }
  });

  test("an in-stock priced depot is listed with its products and prices", async () => {
    const res = await request(app).get(CATALOG);
    const depot = res.body.data.depots.find((d) => d.id === stockedDepotId);
    assert.ok(depot, "the stocked depot is in the catalog");
    assert.equal(depot.state, "Lagos");

    const product = depot.products.find((p) => p.id === productId);
    assert.ok(product, "its priced product is listed");
    assert.equal(product.price, 150);
    assert.equal(product.unit, "Liters");
    assert.equal(product.name, "Catalog PMS");

    // The badge comes from the sku, punctuation stripped — never from the
    // category. Sending the category here is exactly the regression that made
    // the mobile app show a product called Petrol with a badge reading "Fuel".
    const expectedCode = `CATPMS${String(RUN).slice(-5)}`;
    assert.equal(product.code, expectedCode, "the trade code the portal shows as a badge");
    assert.equal(product.sku, `CAT-PMS-${String(RUN).slice(-5)}`, "the raw sku is exposed too");
    assert.notEqual(product.code, "Fuel", "the badge must never be the product's category");
    // Legacy alias kept for shipped mobile builds that still read `category`.
    assert.equal(product.category, expectedCode, "category mirrors the code for old clients");
  });

  test("stock litres never leave the process", async () => {
    const res = await request(app).get(CATALOG);
    for (const depot of res.body.data.depots) {
      for (const product of depot.products) {
        assert.ok(!("stock" in product), `stock leaked for product ${product.id} at depot ${depot.id}`);
      }
    }
  });

  test("a depot with a price but no active stock is not listed at all", async () => {
    const res = await request(app).get(CATALOG);
    const depot = res.body.data.depots.find((d) => d.id === emptyDepotId);
    assert.equal(depot, undefined, "the empty depot must not appear");
  });
});
