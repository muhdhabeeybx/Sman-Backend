const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
process.env.NODE_ENV = "test";
process.env.ALLOW_TESTS_ON_DEV_DB = "true";

const { test, describe, before, beforeEach, afterEach, after } = require("node:test");
const assert = require("node:assert/strict");
const nock = require("nock");

const { db } = require("../config/db");
const { depots, products, depotProductPrices, pfis } = require("../db/schema");
const { customerRepo, deliveryCustomerRepo, orderRepo, depositRepo } = require("../repositories");
const orderService = require("../services/order.service");
const paymentService = require("../services/payment.service");
const { generateDeliveryCustomerDva } = require("../services/deliveryCustomerDva.service");
const { virtualAccountName } = require("../utils/helpers");
const { closeDb } = require("./helpers");

const PAYSTACK_HOST = "https://api.paystack.co";
const RUN = Date.now();

// Skipped: Paystack DVA funding is disabled — wallets are now funded by
// manual deposit only, and orders pay into the depot's own bank account
// (see order.service.js placeOrder, payment.service.js createDedicatedAccount).
// createDedicatedAccount/generateDeliveryCustomerDva are now disabled stubs
// that never call Paystack, so these assertions no longer hold. Re-enable
// (describe, not describe.skip) if DVA funding is reinstated.
describe.skip("Dedicated Virtual Account (DVA) Creation & Settlement", () => {
  let depotId;
  let productId;

  before(async () => {
    // 1. Create a test depot
    const [depot] = await db
      .insert(depots)
      .values({
        name: `DVA Creation Depot ${RUN}`,
        code: `DVAC${String(RUN).slice(-4)}`,
        address: "456 Test Blvd",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        postcode: "100001",
        maxCapacity: 500000,
        establishedYear: "2024",
      })
      .returning();
    depotId = depot.id;

    // 2. Create a test product + price
    const [product] = await db
      .insert(products)
      .values({
        name: `DVA Creation Product ${RUN}`,
        sku: `DVAC-PROD-${RUN}`,
        category: "PMS",
        unit: "Liters",
      })
      .returning();
    productId = product.id;

    await db.insert(depotProductPrices).values({
      depotId,
      productId,
      currentPrice: "150.00",
    });

    // 3. Create a PFI with stock
    await db.insert(pfis).values({
      pfiNumber: `PFI-DVAC-${RUN}`,
      status: "active",
      locationId: depotId,
      productId,
      startingQtyLitres: 100000,
      soldQtyLitres: 0,
    });
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  after(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    await closeDb();
  });

  test("virtualAccountName utility formats prefix and customer initials correctly", () => {
    const formatted = virtualAccountName("Ahmad Soroman");
    assert.equal(formatted, "SOROMAN-AS");
    assert.equal(virtualAccountName(""), "SOROMAN");
  });

  test("createDedicatedAccount calls Paystack customer and dedicated_account endpoints", async () => {
    const customerCode = `CUS_test_${RUN}`;
    const testAccNumber = `99${String(RUN).slice(-8)}`;

    nock(PAYSTACK_HOST)
      .post("/customer")
      .reply(200, {
        status: true,
        data: { customer_code: customerCode },
      });

    nock(PAYSTACK_HOST)
      .post("/dedicated_account")
      .reply(200, {
        status: true,
        data: {
          account_number: testAccNumber,
          bank: { name: "Wema Bank" },
          account_name: "SOROMAN - AHMAD S",
          customer: { customer_code: customerCode },
        },
      });

    const result = await paymentService.createDedicatedAccount({
      id: 999901,
      name: "Ahmad Soroman",
      phone: "+2348120000001",
      email: "ahmad.dva@test.com",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.accountNumber, testAccNumber);
    assert.equal(result.data.bankName, "Wema Bank");
    assert.equal(result.data.accountName, "SOROMAN - AHMAD S");
    assert.equal(result.data.paystackCustomerId, customerCode);
  });

  test("placeOrder auto-creates DVA when customer has no virtual account (and uses helper fallback without error)", async () => {
    const freshPhone = `+234814${String(RUN).slice(-7)}`;
    const freshCustomer = await customerRepo.create({
      name: "Fresh Order Customer",
      phone: freshPhone,
      email: `fresh-order-${RUN}@soroman.com`,
      virtualAccountNumber: "",
      virtualAccountBank: "",
      virtualAccountName: "",
    });

    const customerCode = `CUS_fresh_${RUN}`;
    const freshAccNumber = `98${String(RUN).slice(-8)}`;

    // Mock Paystack responses - note account_name is empty to trigger formatVirtualAccountName fallback
    nock(PAYSTACK_HOST)
      .post("/customer")
      .reply(200, {
        status: true,
        data: { customer_code: customerCode },
      });

    nock(PAYSTACK_HOST)
      .post("/dedicated_account")
      .reply(200, {
        status: true,
        data: {
          account_number: freshAccNumber,
          bank: { name: "Wema Bank" },
          account_name: "", // triggers fallback formatVirtualAccountName
          customer: { customer_code: customerCode },
        },
      });

    const { order } = await orderService.placeOrder({
      customerId: freshCustomer.id,
      state: "Lagos",
      depotId,
      productId,
      quantity: 500,
      deliveryType: "pickup",
      actor: { type: "customer", customerId: freshCustomer.id },
    });

    assert.ok(order, "Order successfully placed");
    assert.equal(order.virtualAccountNumber, freshAccNumber);
    assert.equal(order.virtualAccountBank, "Wema Bank");
    assert.ok(order.virtualAccountName.includes("FOC"), "Fallback formatted virtual account name is set");

    // Verify DB update on customer
    const updated = await customerRepo.findById(freshCustomer.id);
    assert.equal(updated.virtualAccountNumber, freshAccNumber);
    assert.equal(updated.virtualAccountBank, "Wema Bank");
    assert.equal(updated.paystackCustomerId, customerCode);
  });

  test("generateDeliveryCustomerDva creates DVA for delivery customer and updates record", async () => {
    const deliveryCustPhone = `+234815${String(RUN).slice(-7)}`;
    const deliveryCust = await deliveryCustomerRepo.create({
      name: "Delivery Station Client",
      customerType: "filling_station",
      phoneNumber: deliveryCustPhone,
      email: `delivery-cust-${RUN}@soroman.com`,
      virtualAccountNumber: "",
      virtualAccountBank: "",
      virtualAccountName: "",
    });

    const custCode = `CUS_del_${RUN}`;
    const delAccNumber = `97${String(RUN).slice(-8)}`;

    nock(PAYSTACK_HOST)
      .post("/customer")
      .reply(200, {
        status: true,
        data: { customer_code: custCode },
      });

    nock(PAYSTACK_HOST)
      .post("/dedicated_account")
      .reply(200, {
        status: true,
        data: {
          account_number: delAccNumber,
          bank: { name: "Wema Bank" },
          account_name: "SOROMAN - DELIV",
          customer: { customer_code: custCode },
        },
      });

    const res = await generateDeliveryCustomerDva(deliveryCust);
    assert.equal(res.success, true);
    assert.equal(res.data.accountNumber, delAccNumber);

    const updated = await deliveryCustomerRepo.findById(deliveryCust.id);
    assert.equal(updated.virtualAccountNumber, delAccNumber);
    assert.equal(updated.virtualAccountBank, "Wema Bank");
    assert.equal(updated.virtualAccountName, "SOROMAN - DELIV");
  });
});
