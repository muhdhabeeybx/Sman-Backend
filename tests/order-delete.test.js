// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../app");
const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const { customerRepo, pfiRepo, bankAccountRepo, orderPfiAllocationRepo } = require("../repositories");
const { placeOrder } = require("../services/order.service");
const { staffTokenWithRoles, closeDb } = require("./helpers");

const RUN = Date.now();
const UNIT_PRICE = 100;

describe("DELETE /api/orders/:id — hard delete must give the PFI its stock back", () => {
  let customerId;
  let depotId;
  let productId;
  let pfiId;
  let superStaff;
  let plainStaff;

  before(async () => {
    const [depot] = await db
      .insert(depots)
      .values({
        name: "Delete Depot",
        code: `DEL${String(RUN).slice(-5)}`,
        address: "1 Rd",
        city: "Lagos",
        state: "Lagos",
        country: "NG",
        postcode: "100001",
        maxCapacity: 10000000,
        establishedYear: "2020",
      })
      .returning();
    depotId = depot.id;

    await bankAccountRepo.create({
      bankName: "Test Bank",
      accountName: "Delete Depot Account",
      accountNumber: `DELACC${String(RUN).slice(-6)}`,
      depotIds: [depotId],
      status: "Active",
      isDefault: true,
    });

    const [product] = await db
      .insert(products)
      .values({ name: "Delete PMS", sku: `DEL-PMS-${String(RUN).slice(-5)}`, category: "PMS" })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({ depotId, productId, currentPrice: String(UNIT_PRICE) });
    const [pfi] = await db
      .insert(pfis)
      .values({
        pfiNumber: `PFI-DEL-${RUN}`,
        status: "active",
        locationId: depotId,
        productId,
        startingQtyLitres: 2000000,
        soldQtyLitres: 0,
      })
      .returning();
    pfiId = pfi.id;

    const customer = await customerRepo.create({
      name: "Delete Customer",
      phone: `+234817${String(RUN).slice(-6)}9`,
      status: "Active",
    });
    customerId = customer.id;

    superStaff = await staffTokenWithRoles(["super_admin"], "test-delete-super@soroman.test");
    plainStaff = await staffTokenWithRoles(["ticketing"], "test-delete-plain@soroman.test");
  });

  after(async () => {
    await closeDb();
  });

  test("deleting an order releases its PFI reservation back to sold_qty_litres", async () => {
    const before = Number((await pfiRepo.findById(pfiId)).soldQtyLitres);

    const { order } = await placeOrder({
      customerId,
      state: "Lagos",
      depotId,
      productId,
      quantity: 5000,
      deliveryType: "pickup",
      trucks: [],
    });

    const afterPlace = Number((await pfiRepo.findById(pfiId)).soldQtyLitres);
    assert.equal(afterPlace, before + 5000, "placing the order reserved its quantity");

    const allocations = await orderPfiAllocationRepo.findByOrderId(order.id);
    assert.ok(allocations.length > 0, "the order carries a PFI allocation to release");

    const res = await request(app)
      .delete(`/api/orders/${order.id}`)
      .set("Authorization", `Bearer ${superStaff.accessToken}`)
      .send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const afterDelete = Number((await pfiRepo.findById(pfiId)).soldQtyLitres);
    assert.equal(afterDelete, before, "deleting the order gave the reservation back — no permanent leak");

    const remainingAllocations = await orderPfiAllocationRepo.findByOrderId(order.id);
    assert.equal(remainingAllocations.length, 0, "the allocation row is gone too");
  });

  test("a non-super-admin cannot delete an order", async () => {
    const { order } = await placeOrder({
      customerId,
      state: "Lagos",
      depotId,
      productId,
      quantity: 1000,
      deliveryType: "pickup",
      trucks: [],
    });

    const res = await request(app)
      .delete(`/api/orders/${order.id}`)
      .set("Authorization", `Bearer ${plainStaff.accessToken}`)
      .send({});
    assert.equal(res.status, 403);
  });
});
