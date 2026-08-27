// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { db } = require("../config/db");
const { orders, depots, products, dangoteOrderRequests } = require("../db/schema");
const { customerRepo } = require("../repositories");
const accountDeletion = require("../services/accountDeletion.service");
const { generateOrderReference } = require("../utils/helpers");
const { closeDb } = require("./helpers");

const RUN = Date.now();
let seq = 0;

async function depotFixture() {
  const [existing] = await db.select().from(depots).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(depots)
    .values({
      name: "Delete Depot",
      code: `DEL${String(RUN).slice(-4)}`,
      address: "1 Test Rd",
      city: "Lagos",
      state: "Lagos",
      country: "NG",
      postcode: "100001",
      maxCapacity: 1000000,
      establishedYear: "2020",
    })
    .returning();
  return row.id;
}

async function productFixture() {
  const [existing] = await db.select().from(products).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(products)
    .values({ name: "Delete Product", sku: `DEL-${RUN}`, category: "PMS" })
    .returning();
  return row.id;
}

async function makeOrder(customerId, depotId, productId, status) {
  const orderNumber = `ORD-DEL-${RUN}-${seq++}`;
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber,
      customerId,
      state: "Lagos",
      depotId,
      productId,
      quantity: 33000,
      price: "100.00",
      totalAmount: "3300000.00",
      deliveryType: "pickup",
      status,
      paymentStatus: status === "Pending" ? "Unpaid" : "Paid",
      ...(status !== "Pending"
        ? { paymentConfirmedAt: new Date() }
        : {}),
    })
    .returning();
  return row;
}

describe("account deletion blockers", () => {
  let depotId;
  let productId;

  before(async () => {
    depotId = await depotFixture();
    productId = await productFixture();
  });

  after(async () => {
    await closeDb();
  });

  test("Paid in-progress orders name the refs and say they cannot be cancelled", async () => {
    const customer = await customerRepo.create({
      name: "Delete Blocker",
      phone: `+23483${String(RUN).slice(-8)}`,
      companyName: "Honeywell Adada",
      status: "Active",
      balance: "0.00",
    });
    const a = await makeOrder(customer.id, depotId, productId, "Paid");
    const b = await makeOrder(customer.id, depotId, productId, "Released");
    const refA = generateOrderReference("Honeywell Adada", a.id);
    const refB = generateOrderReference("Honeywell Adada", b.id);

    const { blockers } = await accountDeletion.collectBlockers(customer.id);
    const message = accountDeletion.formatBlockerMessage(blockers);

    assert.equal(blockers.length, 1);
    assert.match(message, /2 orders in progress/i);
    assert.match(message, new RegExp(refA));
    assert.match(message, new RegExp(refB));
    assert.match(message, /can't be cancelled/i);
    assert.doesNotMatch(message, /ORD-/i);
    assert.doesNotMatch(message, /funds on hold/i);
  });

  test("unpaid Pending orders ask the customer to cancel them by ref", async () => {
    const customer = await customerRepo.create({
      name: "Delete Unpaid",
      phone: `+23484${String(RUN).slice(-8)}`,
      companyName: "Shell Petroleum",
      status: "Active",
      balance: "0.00",
    });
    const order = await makeOrder(customer.id, depotId, productId, "Pending");
    const ref = generateOrderReference("Shell Petroleum", order.id);

    const { blockers } = await accountDeletion.collectBlockers(customer.id);
    const message = accountDeletion.formatBlockerMessage(blockers);

    assert.equal(blockers.length, 1);
    assert.match(message, new RegExp(`Cancel unpaid order ${ref}`));
    assert.doesNotMatch(message, /ORD-/i);
  });

  test("open Dangote requests name the customer-facing reference", async () => {
    const customer = await customerRepo.create({
      name: "Delete Dangote",
      phone: `+23485${String(RUN).slice(-8)}`,
      companyName: "Samcode Oil",
      status: "Active",
      balance: "0.00",
    });
    const [req] = await db
      .insert(dangoteOrderRequests)
      .values({
        requestNumber: `GW-DEL-${RUN}`,
        customerId: customer.id,
        product: "Cement",
        quantity: 10,
        quantityUnit: "Tons",
        deliveryAddress: "Somewhere",
        companyName: "Samcode Oil",
        status: "Approved",
        paymentStatus: "Unpaid",
      })
      .returning();
    const ref = generateOrderReference("Samcode Oil", req.id);

    const { blockers } = await accountDeletion.collectBlockers(customer.id);
    const message = accountDeletion.formatBlockerMessage(blockers);

    assert.equal(blockers.length, 1);
    assert.match(message, new RegExp(ref));
    assert.match(message, /Dangote/i);
    assert.doesNotMatch(message, new RegExp(`GW-DEL-${RUN}`));
  });

  test("formatRefs truncates long lists", () => {
    assert.equal(
      accountDeletion.formatRefs(["A", "B", "C", "D", "E", "F"], 5),
      "A, B, C, D, E, and 1 more"
    );
  });

  test("wallet balance names the amount and does not invent a withdraw path", async () => {
    const customer = await customerRepo.create({
      name: "Delete Balance",
      phone: `+23486${String(RUN).slice(-8)}`,
      status: "Active",
      balance: "15000.50",
    });

    const { blockers } = await accountDeletion.collectBlockers(customer.id);
    const message = accountDeletion.formatBlockerMessage(blockers);

    assert.equal(blockers.length, 1);
    assert.match(message, /₦15,000\.50/);
    assert.match(message, /wallet/i);
    assert.match(message, /Spend it on an order/i);
    assert.doesNotMatch(message, /Withdraw/i);
  });
});
