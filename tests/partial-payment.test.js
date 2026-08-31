// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { eq, inArray } = require("drizzle-orm");

const { db } = require("../config/db");
const {
  customers,
  depots,
  products,
  orders,
  walletHolds,
  deposits,
  orderDepositAllocations,
  commissions,
  orderTrucks,
  tickets,
  auditLogs,
} = require("../db/schema");
const orderService = require("../services/order.service");
const walletService = require("../services/wallet.service");
const { closeDb } = require("./helpers");

/**
 * Paying for part of an order.
 *
 * The desk's case: 100,000 litres ordered, the customer pays for 50,000 now.
 * That payment has to be confirmable, the order has to become ticketable for
 * 50,000 litres and no more, the balance has to read as still expected, and
 * paying the rest later has to unlock the remainder — with the money never
 * once double-counted along the way.
 */
describe("part payment", () => {
  const suffix = Date.now().toString(36);
  const PRICE = 241; //  ₦/litre
  const QUANTITY = 100000; //  litres
  const TOTAL = PRICE * QUANTITY; //  ₦24,100,000
  const HALF = TOTAL / 2; //  ₦12,050,000 — exactly 50,000 litres

  let customer;
  let depot;
  let product;
  let orderSeq = 0;

  const makeOrder = async (quantity = QUANTITY) => {
    orderSeq += 1;
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-PARTPAY-${suffix}-${orderSeq}`,
        customerId: customer.id,
        state: "Lagos",
        depotId: depot.id,
        productId: product.id,
        quantity,
        price: String(PRICE),
        totalAmount: String(PRICE * quantity),
        deliveryType: "pickup",
      })
      .returning();
    return order;
  };

  const fund = (amount) =>
    walletService.credit({
      customerId: customer.id,
      amount,
      description: "part-payment test funding",
      reference: `partpay-${suffix}-${Math.random().toString(36).slice(2)}`,
    });

  const reload = async (id) => {
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    return row;
  };

  // A system actor rather than a staff one: the audit log requires a real
  // staffId for a staff actor, and who pressed the button is not what any of
  // these tests are about.
  const staffActor = { type: "system" };

  before(async () => {
    [customer] = await db
      .insert(customers)
      .values({
        name: "Part Payment Test",
        phone: `+23482${String(Date.now()).slice(-8)}`,
        balance: "0",
      })
      .returning();

    [depot] = await db
      .insert(depots)
      .values({
        name: `Part Pay Depot ${suffix}`,
        code: `PPD-${suffix}`,
        address: "1 Test Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        postcode: "100001",
        maxCapacity: 10000000,
        establishedYear: "2020",
      })
      .returning();

    [product] = await db
      .insert(products)
      .values({
        name: `Part Pay Product ${suffix}`,
        sku: `PPP-${suffix}`,
        category: "PMS",
      })
      .returning();
  });

  after(async () => {
    const orderIds = (
      await db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, customer.id))
    ).map((r) => r.id);
    if (orderIds.length) {
      await db.delete(orderDepositAllocations).where(inArray(orderDepositAllocations.orderId, orderIds));
      await db.delete(tickets).where(inArray(tickets.orderId, orderIds));
      await db.delete(orderTrucks).where(inArray(orderTrucks.orderId, orderIds));
      await db.delete(commissions).where(inArray(commissions.orderId, orderIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, orderIds));
    }
    await db.delete(walletHolds).where(eq(walletHolds.customerId, customer.id));
    await db.delete(deposits).where(eq(deposits.customerId, customer.id));
    await db.delete(orders).where(eq(orders.customerId, customer.id));
    await db.delete(customers).where(eq(customers.id, customer.id));
    await db.delete(products).where(eq(products.id, product.id));
    await db.delete(depots).where(eq(depots.id, depot.id));
    await closeDb();
  });

  // ── The releasable-quantity rule, in isolation ──────────────────────────

  test("releasable quantity is what the money paid actually covers", () => {
    const order = { quantity: QUANTITY, price: String(PRICE), totalAmount: String(TOTAL) };

    assert.equal(orderService.releasableQuantity({ ...order, amountPaid: "0" }), 0);
    assert.equal(orderService.releasableQuantity({ ...order, amountPaid: String(HALF) }), 50000);
    assert.equal(orderService.releasableQuantity({ ...order, amountPaid: String(TOTAL) }), QUANTITY);
  });

  test("a fully-paid order releases its whole quantity, never a hair less", () => {
    // A total that does not divide cleanly by the price: the division lands
    // fractionally under the ordered quantity, and returning that would leave
    // the last few litres of a PAID order permanently unticketable.
    const awkward = {
      quantity: 33333,
      price: "241.37",
      totalAmount: "8046000.00", // deliberately not 33333 × 241.37
      amountPaid: "8046000.00",
    };
    assert.equal(orderService.releasableQuantity(awkward), 33333);
  });

  test("an order marked Paid releases in full even if amount_paid was never set", () => {
    // The regression this exists for: releasableQuantity originally read only
    // the arithmetic, so any writer that marks an order Paid WITHOUT also
    // setting amount_paid produced a ceiling of zero — a fully-paid order that
    // could not be ticketed at all. The settlement sweep in payment.service.js
    // was exactly that writer, and it would have bricked the ticketing desk for
    // every order it settled.
    const order = {
      quantity: QUANTITY,
      price: String(PRICE),
      totalAmount: String(TOTAL),
      amountPaid: "0",
      paymentStatus: "Paid",
    };
    assert.equal(orderService.releasableQuantity(order), QUANTITY);
  });

  test("part-paid litres are floored, never rounded up", () => {
    // ₦12,000,000 at ₦241/litre is 49,792.531... litres. Rounding up would
    // authorise a litre nobody paid for.
    const order = {
      quantity: QUANTITY,
      price: String(PRICE),
      totalAmount: String(TOTAL),
      amountPaid: "12000000",
    };
    assert.equal(orderService.releasableQuantity(order), 49792.53);
  });

  // ── The payment flow ────────────────────────────────────────────────────

  test("paying half marks the order Part Paid and holds only that half", async () => {
    const order = await makeOrder();
    await fund(HALF);

    const paid = await orderService.payOrder({
      orderId: order.id,
      amount: HALF,
      actor: staffActor,
      notifyWhatsApp: false,
    });

    assert.equal(paid.paymentStatus, "Part Paid");
    assert.equal(Number(paid.amountPaid), HALF);

    const row = await reload(order.id);
    assert.equal(row.paymentStatus, "Part Paid");
    assert.equal(Number(row.amountPaid), HALF);
    // The pipeline opens on the first instalment, exactly as a full payment
    // does — otherwise the order could never reach the ticketing desk.
    assert.equal(row.status, "Released");
    assert.ok(row.paymentConfirmedAt, "payment confirmed timestamp is stamped");

    // Only the half was taken. The wallet, and the hold, agree.
    const [hold] = await db.select().from(walletHolds).where(eq(walletHolds.orderId, order.id));
    assert.equal(Number(hold.amount), HALF);
    assert.equal(hold.status, "active");

    const ledger = await walletService.getLedgerBalance(customer.id);
    const [c] = await db.select().from(customers).where(eq(customers.id, customer.id));
    assert.equal(ledger, Number(c.balance), "ledger and balance still agree");
    assert.equal(Number(c.balance), 0, "the whole funded half is committed to the order");

    assert.equal(orderService.releasableQuantity(row), 50000);
  });

  test("the balance is refused if it exceeds what is still owed", async () => {
    const order = await makeOrder();
    await fund(TOTAL);
    await orderService.payOrder({ orderId: order.id, amount: HALF, actor: staffActor, notifyWhatsApp: false });

    await assert.rejects(
      () =>
        orderService.payOrder({
          orderId: order.id,
          amount: HALF + 1000,
          actor: staffActor,
          notifyWhatsApp: false,
        }),
      (err) => err.status === 400 && /more than this order still owes/i.test(err.message),
      "over-paying an order must be refused, not silently over-held",
    );

    // Refused cleanly: nothing moved.
    const row = await reload(order.id);
    assert.equal(Number(row.amountPaid), HALF);
    const [hold] = await db.select().from(walletHolds).where(eq(walletHolds.orderId, order.id));
    assert.equal(Number(hold.amount), HALF);
  });

  test("paying the balance tops up the same hold and completes the order", async () => {
    const order = await makeOrder();
    await fund(TOTAL);

    await orderService.payOrder({ orderId: order.id, amount: HALF, actor: staffActor, notifyWhatsApp: false });
    const settled = await orderService.payOrder({
      orderId: order.id,
      amount: HALF,
      actor: staffActor,
      notifyWhatsApp: false,
    });

    assert.equal(settled.paymentStatus, "Paid");

    const row = await reload(order.id);
    assert.equal(row.paymentStatus, "Paid");
    assert.equal(Number(row.amountPaid), TOTAL);
    assert.equal(orderService.releasableQuantity(row), QUANTITY);

    // ONE hold, grown to the full total — not two. wallet_holds is uniquely
    // indexed on order_id, and topping up is what keeps that true.
    const holds = await db.select().from(walletHolds).where(eq(walletHolds.orderId, order.id));
    assert.equal(holds.length, 1, "an instalment must top up the hold, never place a second");
    assert.equal(Number(holds[0].amount), TOTAL);

    const ledger = await walletService.getLedgerBalance(customer.id);
    const [c] = await db.select().from(customers).where(eq(customers.id, customer.id));
    assert.equal(ledger, Number(c.balance), "ledger and balance still agree after both instalments");
  });

  test("a fully-paid order refuses further payment", async () => {
    const order = await makeOrder();
    await fund(TOTAL);
    await orderService.payOrder({ orderId: order.id, actor: staffActor, notifyWhatsApp: false });

    await assert.rejects(
      () => orderService.payOrder({ orderId: order.id, amount: 1000, actor: staffActor, notifyWhatsApp: false }),
      (err) => err.status === 409,
    );
  });

  test("paying with no amount still settles the order in full, as it always did", async () => {
    const order = await makeOrder();
    await fund(TOTAL);

    const paid = await orderService.payOrder({ orderId: order.id, actor: staffActor, notifyWhatsApp: false });

    assert.equal(paid.paymentStatus, "Paid");
    const row = await reload(order.id);
    assert.equal(Number(row.amountPaid), TOTAL);
    assert.equal(row.status, "Released");
  });

  test("an omitted amount on a part-paid order settles just the remainder", async () => {
    const order = await makeOrder();
    await fund(TOTAL);
    await orderService.payOrder({ orderId: order.id, amount: HALF, actor: staffActor, notifyWhatsApp: false });

    // No amount named: "settle it" means the outstanding balance, not the
    // order total — which would try to take another ₦24.1m.
    await orderService.payOrder({ orderId: order.id, actor: staffActor, notifyWhatsApp: false });

    const row = await reload(order.id);
    assert.equal(row.paymentStatus, "Paid");
    assert.equal(Number(row.amountPaid), TOTAL);
  });

  // ── Consequences ────────────────────────────────────────────────────────

  test("a part-paid order cannot lapse", async () => {
    const order = await makeOrder();
    await fund(HALF);
    await orderService.payOrder({ orderId: order.id, amount: HALF, actor: staffActor, notifyWhatsApp: false });

    const row = await reload(order.id);
    // Backdated well past any expiry window: an unfunded order this old would
    // lapse. This one has money held against it and must not.
    const ancient = { ...row, status: "Pending", createdAt: new Date("2020-01-01") };
    assert.equal(
      orderService.isOrderExpired(ancient),
      false,
      "a Part Paid order has been funded and must never expire",
    );

    const stillUnpaid = { ...ancient, paymentStatus: "Unpaid" };
    assert.equal(orderService.isOrderExpired(stillUnpaid), true, "an Unpaid one still lapses");
  });

  test("commission is pro-rata, and grows as the balance is paid", async () => {
    const commissionService = require("../services/commission.service");
    const order = await makeOrder();
    await fund(TOTAL);

    await orderService.payOrder({ orderId: order.id, amount: HALF, actor: staffActor, notifyWhatsApp: false });
    await commissionService.createForOrder(order.id);

    const [half] = await db.select().from(commissions).where(eq(commissions.orderId, order.id));
    assert.ok(half, "a part payment creates a commission");
    assert.equal(Number(half.quantity), 50000, "commission is due on the litres paid for, not the order");

    await orderService.payOrder({ orderId: order.id, amount: HALF, actor: staffActor, notifyWhatsApp: false });
    await commissionService.createForOrder(order.id);

    const [full] = await db.select().from(commissions).where(eq(commissions.orderId, order.id));
    assert.equal(Number(full.quantity), QUANTITY, "settling the balance enlarges it to the whole order");

    const rows = await db.select().from(commissions).where(eq(commissions.orderId, order.id));
    assert.equal(rows.length, 1, "one commission row per order, re-snapshotted — not one per instalment");
  });

  test("the finance report shows sales value, amount paid and the differential", async () => {
    const { orderRepo } = require("../repositories");
    const order = await makeOrder();
    await fund(HALF);
    await orderService.payOrder({ orderId: order.id, amount: HALF, actor: staffActor, notifyWhatsApp: false });

    // Searched by the fixture's own unique order number, not by id. An id
    // search also runs an ILIKE '%<id>%' over every order number, so under the
    // full suite it pulls in unrelated orders and the totals below stop
    // describing this one — the assertions passed alone and failed in a full
    // run, which is the least useful way for a test to fail.
    const report = await orderRepo.findFinanceReport({ search: order.orderNumber });
    const row = report.orders.find((r) => r.id === order.id);

    assert.ok(row, "a part-paid order appears on the report by default, not only once fully paid");
    assert.equal(Number(row.totalAmount), TOTAL, "sales value");
    assert.equal(Number(row.amountPaid), HALF, "amount paid");
    assert.equal(row.outstandingAmount, TOTAL - HALF, "differential still expected");
    assert.equal(row.partPaid, true);

    assert.equal(report.totals.totalPaid, HALF);
    assert.equal(report.totals.totalOutstanding, TOTAL - HALF);
    assert.equal(report.totals.partPaidCount, 1);
  });
});
