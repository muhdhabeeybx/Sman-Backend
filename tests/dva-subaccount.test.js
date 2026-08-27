const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
process.env.NODE_ENV = "test";
process.env.ALLOW_TESTS_ON_DEV_DB = "true";
process.env.SMS_ENABLED = "false";

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const { customerRepo, depotRepo } = require("../repositories");
const orderService = require("../services/order.service");
const paymentService = require("../services/payment.service");
const { closeDb } = require("./helpers");

const RUN = Date.now();

// Skipped: Paystack DVA funding is disabled — placeOrder no longer creates
// or switches a customer DVA, it pays into the depot's own bank account
// instead (see order.service.js). switchCustomerDvaToSubaccount is now a
// disabled stub. Re-enable (describe, not describe.skip) if DVA funding is
// reinstated.
describe.skip("DVA Subaccount Auto-Switch on Order Placement", () => {
  let depotId;
  let productId;
  let customer;
  const subaccountCode = `ACCT_test_${RUN}`;

  before(async () => {
    // 1. Create a test depot with a paystack subaccount code
    const [depot] = await db
      .insert(depots)
      .values({
        name: `DVA Test Depot ${RUN}`,
        code: `DVA${String(RUN).slice(-4)}`,
        address: "123 Test Street",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        postcode: "100001",
        maxCapacity: 500000,
        establishedYear: "2024",
        paystackSubaccountCode: subaccountCode,
        subaccountActive: true,
      })
      .returning();
    depotId = depot.id;

    // 2. Create a test product + price
    const [product] = await db
      .insert(products)
      .values({
        name: `DVA Product ${RUN}`,
        sku: `DVA-PROD-${RUN}`,
        category: "PMS",
        unit: "Liters",
      })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({
      depotId,
      productId,
      currentPrice: "100.00",
    });

    // 3. Create a PFI with stock
    await db.insert(pfis).values({
      pfiNumber: `PFI-DVA-${RUN}`,
      status: "active",
      locationId: depotId,
      productId,
      startingQtyLitres: 100000,
      soldQtyLitres: 0,
    });

    // 4. Create a test customer with DVA
    const phone = `+234812${String(RUN).slice(-7)}`;
    customer = await customerRepo.create({
      name: `DVA Test Customer ${RUN}`,
      phone,
      email: `dva-test-${RUN}@soroman.com`,
      virtualAccountNumber: `99${String(RUN).slice(-8)}`,
      virtualAccountBank: "Wema Bank",
      virtualAccountName: "SOROMANNIGERI/ DVA TEST",
    });
  });

  after(async () => {
    await closeDb();
  });

  test("switchCustomerDvaToSubaccount helper exists and returns result structure", async () => {
    assert.equal(typeof paymentService.switchCustomerDvaToSubaccount, "function");
    const res = await paymentService.switchCustomerDvaToSubaccount({
      accountNumber: "1234567890",
      subaccountCode: "ACCT_invalid_test",
    });
    assert.equal(typeof res.success, "boolean");
  });

  test("placeOrder automatically updates customer.dvaSubaccountCode to match depot subaccount", async () => {
    const { order } = await orderService.placeOrder({
      customerId: customer.id,
      state: "Lagos",
      depotId,
      productId,
      quantity: 1000,
      deliveryType: "pickup",
      actor: { type: "system" },
    });

    assert.ok(order);
    assert.equal(order.customerId, customer.id);
    assert.equal(order.depotId, depotId);

    // Verify customer DB record has been updated with dvaSubaccountCode
    const updatedCustomer = await customerRepo.findById(customer.id);
    assert.equal(updatedCustomer.dvaSubaccountCode, subaccountCode);
  });
});
