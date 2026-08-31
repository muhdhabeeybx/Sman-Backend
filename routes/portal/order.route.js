const express = require("express");
const router = express.Router();
const { authenticateCustomer, requireActiveCustomer } = require("../../middleware/verifyCustomer");
const { requireCsrfForCookieAuth } = require("../../middleware/csrf");
const validate = require("../../middleware/validate");
const orderSchemas = require("../../schemas/order.schema");
const {
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
} = require("../../controllers/portal/order.controller");
const generateLimiter = require("../../middleware/generateLimiter");

// Guest checkout — the one unauthenticated route in this file. Identity is a
// phone number in the body (find-or-create, like /register); the controller
// runs the Turnstile bot check and returns only what the guest submitted plus
// the order/payment facts. Rate-limited because it creates rows with no
// session to anchor abuse to.
const guestOrderLimiter = generateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many orders from this connection. Please try again later.",
});
router.post(
  "/guest",
  guestOrderLimiter,
  validate({ body: orderSchemas.createGuestOrder }),
  createGuestOrder
);

// Every route below is the signed-in customer acting on their OWN orders.
// authenticateCustomer populates req.customer from the token; requireActiveCustomer
// blocks a registered-but-unproven (Pending) account from ordering. Placing an
// order is a cookie-session state change, so it carries CSRF protection.
router.post(
  "/",
  authenticateCustomer,
  requireActiveCustomer,
  requireCsrfForCookieAuth("customer"),
  validate({ body: orderSchemas.createMyOrder }),
  createMyOrder
);

router.get(
  "/",
  authenticateCustomer,
  validate({ query: orderSchemas.listMyOrders }),
  listMyOrders
);

// By-reference lookup. Registered before "/:id" so the two-segment path is
// matched here rather than being mistaken for a numeric id; order numbers are
// the reference customers actually hold (invoice, SMS, dashboard).
router.get(
  "/by-ref/:ref",
  authenticateCustomer,
  validate({ params: orderSchemas.refParam }),
  getMyOrderByRef
);

// Pay an older unpaid order from wallet, keyed by its order number (the ref the
// apps hold on history/detail). Registered under /by-ref so it isn't mistaken
// for the numeric /:id/pay.
router.post(
  "/by-ref/:ref/pay",
  authenticateCustomer,
  requireActiveCustomer,
  requireCsrfForCookieAuth("customer"),
  validate({ params: orderSchemas.refParam }),
  payMyOrderByRef
);

// Replace pickup truck declaration — same by-ref key the dashboard already uses.
router.patch(
  "/by-ref/:ref/trucks",
  authenticateCustomer,
  requireActiveCustomer,
  requireCsrfForCookieAuth("customer"),
  validate({ params: orderSchemas.refParam, body: orderSchemas.updateMyTrucks }),
  updateMyOrderTrucks
);

// Cancel an unpaid pending order by its order number — same key the pay and
// trucks routes use so the dashboard never needs the numeric id.
router.post(
  "/by-ref/:ref/cancel",
  authenticateCustomer,
  requireActiveCustomer,
  requireCsrfForCookieAuth("customer"),
  validate({ params: orderSchemas.refParam }),
  cancelMyOrderByRef
);

router.get(
  "/:id",
  authenticateCustomer,
  validate({ params: orderSchemas.idParam }),
  getMyOrder
);

// Pay one of the customer's own unpaid orders from their wallet balance. A
// balance-spending state change, so it carries CSRF like order placement; the
// service scopes it to the caller and refuses a foreign order with a 404.
router.post(
  "/:id/pay",
  authenticateCustomer,
  requireActiveCustomer,
  requireCsrfForCookieAuth("customer"),
  validate({ params: orderSchemas.idParam }),
  payMyOrder
);

// Cancel one of the customer's own still-unpaid orders. Releases reserved stock
// and capacity via the shared cancelOrder service; CSRF-protected like the
// other state-changing portal actions.
router.post(
  "/:id/cancel",
  authenticateCustomer,
  requireActiveCustomer,
  requireCsrfForCookieAuth("customer"),
  validate({ params: orderSchemas.idParam }),
  cancelMyOrder
);

module.exports = router;
