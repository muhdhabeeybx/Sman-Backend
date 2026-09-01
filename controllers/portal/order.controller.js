const asyncHandler = require("express-async-handler");
const { orderRepo, customerRepo } = require("../../repositories");
const botCheck = require("../../services/botCheck.service");
const { toE164 } = require("../../utils/phone");
const { placeOrder, updatePickupTrucks, cancelOrder, withExpiresAt } = require("../../services/order.service");
const {
  buildReached,
  currentStage,
  stageNote,
} = require("../../services/tracking.service");

// Per-truck movement in words, for the order owner's own detail view. Mirrors
// the public tracking labels (tracking.service.js) so the two surfaces read
// the same, but the owner's view additionally carries driver contact and gate
// stamps — details the public feed withholds.
const TRUCK_STATUS_LABEL = {
  pending: "Assigned",
  loaded: "Ticket issued",
  gated_in: "At the depot",
  gated_out: "Departed",
};

const toOwnerTruck = (t) => ({
  index: t.truckIndex,
  plate: t.truckNumber || null,
  quantity: Number(t.quantity),
  status: t.status,
  statusLabel: TRUCK_STATUS_LABEL[t.status] || t.status,
  driverName: t.driverName || null,
  driverPhone: t.driverPhone || null,
  enteredAt: t.securityEnteredAt || null,
  loadedAt: t.loadedAt || null,
  exitedAt: t.securityExitedAt || null,
});

/**
 * Enrich an order the owner is reading: truck loads, the stage timeline
 * (`reached` / `stage` / `note`), so the signed-in detail page can render
 * progress without a second hop to the public tracking endpoint. Cancelled
 * orders still carry `reached.cancelled` but leave `stage`/`note` null —
 * there is no public stage for a cancellation.
 */
const withOwnerDetail = async (order) => {
  const trucks = (await orderRepo.findTrucksByOrderId(order.id)).map(toOwnerTruck);
  order.trucks = trucks;
  order.reached = buildReached(order);
  if (order.status === "Cancelled") {
    order.stage = null;
    order.note = null;
  } else {
    order.stage = currentStage(order);
    order.note = stageNote(order.stage, { ...order, trucks });
  }
  return order;
};

/**
 * POST /api/customer/orders — the signed-in customer places their OWN order.
 *
 * The customer id comes from the token (req.customer), never the body: a
 * customer can only order for themselves. The heavy lifting — pricing, stock,
 * the atomic transaction, notifications — is the shared placeOrder service, the
 * same one the desk uses. Orders are always created Unpaid; the response carries
 * the virtual account to pay into. Payment then arrives one of three ways: a
 * bank transfer the Paystack webhook confirms, the customer paying from wallet
 * balance (POST /:id/pay), or staff settling it from finance.
 */
/**
 * POST /api/customer/orders/guest — place an order with just a phone number,
 * no session. The OTP stays where the stakes are: seeing history or spending
 * a wallet still requires a verified sign-in; creating an unpaid order that
 * only becomes real when money arrives in the depot's account does not.
 *
 * The phone find-or-creates a customer the same way /register does
 * (findByAnyPhone, so a desk-recorded second line lands on the right
 * account). When the person later registers with this phone and passes OTP,
 * they sign into that same row and these orders are already in their history.
 *
 * Deliberately narrow:
 *  - The response is hand-built. The full order row joins the customer's
 *    stored name/email/balance — returning that would let anyone read another
 *    customer's details by typing their phone. A guest gets back only what
 *    they themselves submitted plus the order/payment facts.
 *  - No wallet involvement. placeOrder never touches balances, and the
 *    wallet-pay endpoint stays behind authentication.
 *  - Turnstile (same bot check as /register) + a route rate limit, because an
 *    unauthenticated order-creating endpoint must not be scriptable for free.
 */
const createGuestOrder = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    email,
    state,
    depot: depotId,
    product: productId,
    quantity,
    deliveryType,
    deliveryAddress,
    companyName,
    trucks,
    turnstileToken,
  } = req.body;

  const bot = await botCheck.verify(turnstileToken, req.ip);
  if (!bot.ok) {
    return res.status(400).json({ success: false, message: "Verification failed. Please try again." });
  }

  const e164 = toE164(phone);
  if (!e164) {
    return res.status(400).json({
      success: false,
      message:
        "Enter a valid phone number. International numbers must include a country code, e.g. +447400123456",
    });
  }

  const match = await customerRepo.findByAnyPhone(e164);
  let customer = match?.customer || null;
  if (customer && customer.status === "Inactive") {
    // Same closed door the signed-in flow shows an Inactive account.
    return res.status(403).json({
      success: false,
      message: "This account cannot place orders at the moment. Please contact support.",
    });
  }
  if (!customer) {
    // Pending, like /register: the phone hasn't been proven. Ordering doesn't
    // need it proven; signing in later does, and that OTP flips them Active.
    customer = await customerRepo.create({
      name: name.trim(),
      phone: e164,
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
      companyName: companyName.trim(),
      status: "Pending",
      createdVia: "portal",
    });
  }

  const { order, payment } = await placeOrder({
    customerId: customer.id,
    state,
    depotId,
    productId,
    quantity,
    deliveryType,
    deliveryAddress,
    companyName,
    trucks,
    actor: { type: "customer", customerId: customer.id },
  });

  const withDeadline = await withExpiresAt(order);
  res.status(201).json({
    success: true,
    message: "Order placed. Transfer the total to the account shown to have it released.",
    data: {
      // Only the order's own facts — never the joined customer columns.
      order: {
        id: withDeadline.id,
        orderNumber: withDeadline.orderNumber,
        quantity: withDeadline.quantity,
        price: withDeadline.price,
        totalAmount: withDeadline.totalAmount,
        status: withDeadline.status,
        paymentStatus: withDeadline.paymentStatus,
        deliveryType: withDeadline.deliveryType,
        state: withDeadline.state,
        deliveryAddress: withDeadline.deliveryAddress,
        companyName: withDeadline.companyName,
        depotId: withDeadline.depotId,
        depotName: withDeadline.depotName,
        productName: withDeadline.productName,
        productUnit: withDeadline.productUnit,
        productCategory: withDeadline.productCategory,
        createdAt: withDeadline.createdAt,
        expiresAt: withDeadline.expiresAt ?? null,
        virtualAccountNumber: withDeadline.virtualAccountNumber,
        virtualAccountBank: withDeadline.virtualAccountBank,
        virtualAccountName: withDeadline.virtualAccountName,
      },
      payment,
    },
  });
});

const createMyOrder = asyncHandler(async (req, res) => {
  const {
    state,
    depot: depotId,
    product: productId,
    quantity,
    deliveryType,
    deliveryAddress,
    companyName,
    trucks,
  } = req.body;

  const { order, payment } = await placeOrder({
    customerId: req.customer.id,
    state,
    depotId,
    productId,
    quantity,
    deliveryType,
    deliveryAddress,
    companyName,
    trucks,
    actor: { type: "customer", customerId: req.customer.id },
  });

  res.status(201).json({
    success: true,
    message:
      order.paymentStatus === "Paid"
        ? "Order placed and paid from your wallet balance."
        : "Order placed. Transfer the total to the account shown to have it released.",
    data: { order: await withExpiresAt(order), payment },
  });
});

/**
 * GET /api/customer/orders — the customer's own orders, newest first.
 * Accepts the same filters as the admin list (search by order number, status,
 * date range) plus pagination; `customer` is always forced from the token, so
 * the filters can only ever narrow the caller's OWN history.
 */
const listMyOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search, status, dateFrom, dateTo } = req.query;
  const result = await orderRepo.findAll({
    customer: req.customer.id,
    search,
    status,
    dateFrom,
    dateTo,
    page,
    limit,
  });
  res.json({ success: true, data: { ...result, orders: await withExpiresAt(result.orders) } });
});

/**
 * GET /api/customer/orders/:id — one of the customer's own orders, scoped by
 * ownership. Another customer's order reads as 404 — it never confirms the row
 * exists, let alone leaks it. Carries the lifecycle timestamps, the stage
 * timeline (`reached` / `stage` / `note`), and the order's truck loads, so the
 * owner sees the full timeline behind auth without the public tracking hop.
 */
const getMyOrder = asyncHandler(async (req, res) => {
  const order = await orderRepo.findByIdFull(req.params.id);
  if (!order || order.customerId !== req.customer.id) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  res.json({ success: true, data: { order: await withExpiresAt(await withOwnerDetail(order)) } });
});

/**
 * GET /api/customer/orders/by-ref/:ref — the same detail as :id, but keyed by
 * the order NUMBER (the reference the customer actually holds — on the invoice,
 * the SMS, the dashboard). Ownership-scoped identically: an unknown reference,
 * or one belonging to another customer, is a flat 404.
 */
const getMyOrderByRef = asyncHandler(async (req, res) => {
  const order = await orderRepo.findByNumberFull(req.params.ref);
  if (!order || order.customerId !== req.customer.id) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  res.json({ success: true, data: { order: await withExpiresAt(await withOwnerDetail(order)) } });
});

/**
 * Self-service "Pay from wallet" — withdrawn.
 *
 * Both of these (by id and by order reference) settled a customer's order out
 * of their wallet balance. That is exactly the automatic draw the finance desk
 * asked to be rid of: it confirmed an order against money whose origin nothing
 * recorded, and the finance report then had to guess which bank credit had
 * paid for it. An order is now paid by naming the bank statement line that
 * paid for it, which only the desk can do (see db/migrations/0021).
 *
 * Kept as an explicit 410 rather than deleted, so an app still holding the old
 * button gets an answer it can show a human instead of a 404 that reads like a
 * bug. The audit log records no customer ever having used either endpoint.
 */
const SELF_PAY_WITHDRAWN =
  "Orders are now confirmed by our finance desk against the bank transfer you sent. Send your payment to the account on your order and it will be confirmed against that order — no wallet balance is drawn.";

const payMyOrder = asyncHandler(async (req, res) => {
  res.status(410).json({ success: false, message: SELF_PAY_WITHDRAWN });
});

const payMyOrderByRef = asyncHandler(async (req, res) => {
  res.status(410).json({ success: false, message: SELF_PAY_WITHDRAWN });
});

/**
 * Cancel the caller's own still-Pending order. Shared by the numeric-id and
 * by-ref routes — same Pending/ownership guards either way.
 */
async function cancelOwnedPendingOrder(order, req) {
  if (order.status !== "Pending") {
    const err = new Error(
      `Only an unpaid, pending order can be cancelled here — this one is ${order.status}. Contact support.`
    );
    err.status = 409;
    throw err;
  }

  await cancelOrder({
    orderId: order.id,
    actor: { type: "customer", customerId: req.customer.id },
    reason: "Cancelled by customer",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return orderRepo.findByIdFull(order.id);
}

/**
 * POST /api/customer/orders/:id/cancel — the customer cancels their OWN order
 * while it is still Pending/unpaid. Reuses the shared cancelOrder service, which
 * releases the reserved stock. A Paid or further-along order
 * can't be self-cancelled here — that's a support/finance action.
 */
const cancelMyOrder = asyncHandler(async (req, res) => {
  const order = await orderRepo.findById(req.params.id);
  if (!order || order.customerId !== req.customer.id) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  try {
    const fresh = await cancelOwnedPendingOrder(order, req);
    res.json({
      success: true,
      message: "Order cancelled",
      data: { order: await withExpiresAt(await withOwnerDetail(fresh)) },
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ success: false, message: err.message });
    }
    throw err;
  }
});

/**
 * POST /api/customer/orders/by-ref/:ref/cancel — same cancel, keyed by order
 * NUMBER so the dashboard (which holds refs, not numeric ids) can cancel
 * without a second lookup.
 */
const cancelMyOrderByRef = asyncHandler(async (req, res) => {
  const order = await orderRepo.findByNumber(req.params.ref);
  if (!order || order.customerId !== req.customer.id) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  try {
    const fresh = await cancelOwnedPendingOrder(order, req);
    res.json({
      success: true,
      message: "Order cancelled",
      data: { order: await withExpiresAt(await withOwnerDetail(fresh)) },
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ success: false, message: err.message });
    }
    throw err;
  }
});

/**
 * PATCH /api/customer/orders/by-ref/:ref/trucks — replace the pickup truck
 * declaration on the caller's own order. Plate/driver may be blank (filled at
 * the gate); quantities must still sum to the order. Refuses once any load
 * has gated in, or if the order has moved past Released.
 */
const updateMyOrderTrucks = asyncHandler(async (req, res) => {
  const order = await orderRepo.findByNumberFull(req.params.ref);
  if (!order || order.customerId !== req.customer.id) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  await updatePickupTrucks({
    orderId: order.id,
    customerId: req.customer.id,
    trucks: req.body.trucks,
    actor: { type: "customer", customerId: req.customer.id },
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  const fresh = await orderRepo.findByNumberFull(req.params.ref);
  res.json({
    success: true,
    message: "Truck details saved",
    data: { order: await withExpiresAt(await withOwnerDetail(fresh)) },
  });
});

module.exports = {
  createGuestOrder,
  createMyOrder,
  listMyOrders,
  getMyOrder,
  getMyOrderByRef,
  payMyOrder,
  payMyOrderByRef,
  cancelMyOrder,
  cancelMyOrderByRef,
  updateMyOrderTrucks,
};
