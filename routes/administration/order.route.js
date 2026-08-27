const express = require("express");
const router = express.Router();
const verifyStaff = require("../../middleware/verifyStaff");
const { authenticateStaff, requireRole } = verifyStaff;
const validate = require("../../middleware/validate");
const orderSchemas = require("../../schemas/order.schema");
const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  rematchOrderFunding,
  releaseOrder,
  cancelOrder,
  deleteOrder,
  generateOrderTickets,
  getTruckTicketPrintData,
  getOrderTrucks,
  gateInTruck,
  markTruckLoaded,
  updateTruckLoad,
  gateOutTruck,
  getPayableOrders,
  payOrder,
  reconcileOrderEffects,
} = require("../../controllers/administration/order.controller");

// Payable orders (must be before /:id to avoid param conflict)
// Hard delete, paid orders included. super_admin only: it destroys the payment
// trail along with the order, leaving only the audit row behind.
router.delete(
  "/:id",
  verifyStaff,
  requireRole("super_admin", { message: "Only a super admin can delete an order" }),
  validate({ params: orderSchemas.idParam }),
  deleteOrder
);

router.get("/payable", verifyStaff, getPayableOrders);

// Reads and creation stay behind the admin gate (verifyStaff).
router.get("/", verifyStaff, validate({ query: orderSchemas.listOrders }), getOrders);
router.get("/:id", verifyStaff, validate({ params: orderSchemas.idParam }), getOrderById);
router.post("/", verifyStaff, validate({ body: orderSchemas.createOrder }), createOrder);

// Edit anything about an order short of its status — customer, PFI, date,
// quantity, price, logistics text. Open to any signed-in staff, same as the
// reads/create above; the handler itself gates a PFI reassignment against
// the caller's own PFI scope (see orderService.updateOrder).
router.patch(
  "/:id",
  verifyStaff,
  validate({ params: orderSchemas.idParam, body: orderSchemas.updateOrder }),
  updateOrder
);

// Correcting which statement line is recorded against a paid order. Not a
// lifecycle transition — the order stays paid and its hold is untouched.
router.post(
  "/:id/rematch-funding",
  verifyStaff,
  validate({ params: orderSchemas.idParam, body: orderSchemas.rematchFunding }),
  rematchOrderFunding
);

// Lifecycle transitions are role-gated to the desk that owns the action, and
// each flows through the state machine (see services/orderStatus.service.js).
// The raw `PUT /:id` status setter and `POST /:id/complete` are removed (H1):
// Released is a "release"-desk action; Loading/Completed are driven by truck
// gate actions in a later commit; cancel + refund belongs to finance.
router.post(
  "/:id/release",
  authenticateStaff,
  requireRole("release", "super_admin", { message: "Release desk access required" }),
  validate({ params: orderSchemas.idParam, body: orderSchemas.releaseOrder }),
  releaseOrder
);
router.post(
  "/:id/cancel",
  authenticateStaff,
  requireRole("finance", "super_admin", { message: "Finance access required to cancel" }),
  validate({ params: orderSchemas.idParam, body: orderSchemas.cancelOrder }),
  cancelOrder
);

router.post(
  "/:id/pay",
  authenticateStaff,
  requireRole("finance", "super_admin", { message: "Finance access required to pay" }),
  validate({ params: orderSchemas.idParam }),
  payOrder
);

// Re-run post-payment effects for a paid order whose ticket/commission failed.
router.post(
  "/:id/reconcile",
  authenticateStaff,
  requireRole("finance", "super_admin", { message: "Finance access required" }),
  validate({ params: orderSchemas.idParam }),
  reconcileOrderEffects
);

// The truck gate flow — each checkpoint gated to its security/ticketing post.
router.post(
  "/:id/generate-tickets",
  authenticateStaff,
  requireRole("ticketing", "super_admin", { message: "Ticketing access required" }),
  validate({ params: orderSchemas.idParam }),
  generateOrderTickets
);
router.get("/:id/trucks/:loadId/print", verifyStaff, getTruckTicketPrintData);
router.get("/:id/trucks", verifyStaff, getOrderTrucks);

router.post(
  "/:id/gate-in",
  authenticateStaff,
  requireRole("security_entry", "super_admin", { message: "Entry-gate security access required" }),
  validate({ params: orderSchemas.idParam, body: orderSchemas.gateIn }),
  gateInTruck
);
router.post(
  "/:id/trucks/:loadId/load",
  authenticateStaff,
  requireRole("ticketing", "super_admin", { message: "Ticketing access required" }),
  validate({ params: orderSchemas.loadParam, body: orderSchemas.loadTruck }),
  markTruckLoaded
);
// Correct a load's own details after the fact — quantity, plate, driver.
// Open to any signed-in staff, same as the order-edit route above; refused
// once the truck has gated out (see updateTruckLoad).
router.patch(
  "/:id/trucks/:loadId",
  verifyStaff,
  validate({ params: orderSchemas.loadParam, body: orderSchemas.updateTruckLoad }),
  updateTruckLoad
);
router.post(
  "/:id/trucks/:loadId/gate-out",
  authenticateStaff,
  requireRole("security_exit", "super_admin", { message: "Exit-gate security access required" }),
  validate({ params: orderSchemas.loadParam }),
  gateOutTruck
);

module.exports = router;
