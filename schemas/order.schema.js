const z = require("zod");
const {
  id,
  money,
  quantity,
  requiredString,
  optionalString,
  numberLike,
  enumOf,
  searchTerm,
  pagination,
  typeError,
} = require("./fields");

// A customer-declared PICKUP truck: their own vehicle, so no fleet truckId. The
// plate is optional at order — they may not know it yet, and it can be filled or
// corrected at the gate and at ticketing. The per-truck quantity is what the
// customer splits across trucks; the DB caps each at 60,000 L and the
// sum === order-quantity check lives in placeOrder (it needs the order row).
const pickupTruck = z.object({
  truckNumber: optionalString("Truck number", 100),
  quantity: quantity("Truck quantity"),
  driverName: optionalString("Driver name", 255),
  driverPhone: optionalString("Driver phone", 50),
});

/**
 * Note what is absent: `price` and `totalAmount`. They are resolved server-side
 * from the depot's configured price, and stripping them here means a
 * client-supplied price cannot reach the controller at all — it is no longer
 * merely ignored, it is gone.
 *
 * `trucks` is the pickup split: for a pickup over one tanker (60,000 L) the
 * customer declares each truck and its quantity here, at order time. Delivery
 * orders leave it empty — their fleet trucks are allocated at release.
 */
const createOrder = z.object({
  customer: id("Customer"),
  depot: id("Depot"),
  product: id("Product"),
  state: requiredString("State", 100),
  quantity: quantity("Quantity"),
  deliveryType: enumOf("Delivery type", ["delivery", "pickup"]),
  deliveryAddress: optionalString("Delivery address", 2000),
  companyName: requiredString("Company name", 255),
  trucks: z.array(pickupTruck).max(20, "Too many trucks on one order").optional(),
});

const listOrders = pagination.extend({
  search: searchTerm,
  // The full lifecycle pipeline — see services/orderStatus.service.js.
  status: enumOf("Status", [
    "Pending",
    "Paid",
    "Released",
    "Loading",
    "Completed",
    "Cancelled",
    "Expired",
  ]).optional(),
  customer: id("Customer").optional(),
  dateFrom: z.string().trim().max(40, "Start date is too long").optional(),
  dateTo: z.string().trim().max(40, "End date is too long").optional(),
});

const idParam = z.object({ id: id("Order id") });

// Everything about an order a mistake can leave wrong, short of its status —
// status only ever moves through /release, /cancel, /pay (AUDIT H1: see
// order.service.js's updateOrder). pfiId is nullable (unassign a PFI); every
// other field just replaces what is there. At least one field is required —
// an empty PATCH is a caller bug, not a no-op worth accepting silently.
const updateOrder = z
  .object({
    customerId: id("Customer").optional(),
    pfiId: id("PFI").nullable().optional(),
    quantity: quantity("Quantity").optional(),
    price: money("Unit price").optional(),
    totalAmount: money("Total amount").optional(),
    companyName: requiredString("Company name", 255).optional(),
    // optionalString() turns an absent field into "" — right for create, wrong
    // for a patch, where absent has to mean "leave it" and only an explicit ""
    // means "clear it". Kept genuinely optional instead.
    deliveryAddress: z
      .string({ error: typeError("Delivery address", "text") })
      .trim()
      .max(2000, "Delivery address must be 2000 characters or fewer")
      .optional(),
    createdAt: z.coerce.date({ invalid_type_error: "Order date is invalid" }).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "Nothing to update",
  });

// The customer portal's self-order body — createOrder WITHOUT `customer`. A
// signed-in customer can only order for themselves, so the id is taken from the
// token, never accepted from the request.
const createMyOrder = z.object({
  depot: id("Depot"),
  product: id("Product"),
  state: requiredString("State", 100),
  quantity: quantity("Quantity"),
  deliveryType: enumOf("Delivery type", ["delivery", "pickup"]),
  // Delivery only — where the truck goes. The service ignores it on pickup.
  deliveryAddress: optionalString("Delivery address", 2000),
  companyName: requiredString("Company name", 255),
  trucks: z.array(pickupTruck).max(20, "Too many trucks on one order").optional(),
});

// The customer portal's own-order list filters — the admin listOrders set
// minus `customer` (the id is forced from the token, never accepted from the
// query). Search matches the order number; status/date narrow the history.
const listMyOrders = pagination.extend({
  search: searchTerm,
  status: enumOf("Status", [
    "Pending",
    "Paid",
    "Released",
    "Loading",
    "Completed",
    "Cancelled",
    "Expired",
  ]).optional(),
  dateFrom: z.string().trim().max(40, "Start date is too long").optional(),
  dateTo: z.string().trim().max(40, "End date is too long").optional(),
});

// A by-reference lookup param: the order number the customer holds. Bounded;
// the controller scopes the result to the signed-in customer, so an unknown or
// someone else's reference reads as 404.
const refParam = z.object({ ref: requiredString("Order reference", 60) });

// Cancel captures an optional human reason; it lands in cancellationReason and
// the audit row's metadata.
const cancelOrder = z.object({
  reason: z.string().trim().max(500, "Reason is too long").optional(),
});

// Confirm a payment against an order. `amount` is the naira actually received
// now; omit it to settle the whole outstanding balance, which is what every
// caller did before instalments existed and remains the default.
//
// The ceiling (not more than is still owed) is enforced in the service, not
// here: it depends on what the order has already taken, which this layer
// cannot see. Only the shape is checked here.
const payOrder = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Amount must be greater than zero")
    .optional(),
});

// Customer portal: replace the pickup truck declaration on an existing order.
// Same shape as create — plate/driver optional, quantity required per truck.
// An empty array is allowed for ≤60k pickups (clear declared loads; capture at
// the gate). Validation of sum / capacity / editable status is in the service.
const updateMyTrucks = z.object({
  trucks: z.array(pickupTruck).max(20, "Too many trucks on one order"),
});

// One truck load in a release allocation. A plate is required — either a fleet
// vehicle id (its plate is copied from the registry) or a free-form plate for
// an external haulier. The per-load quantity ≤ one tanker; the cross-load
// invariant (sum === order quantity) is enforced in the controller against the
// order row, not here.
const truckAllocation = z
  .object({
    truckId: id("Fleet truck").optional(),
    truckNumber: optionalString("Truck number", 100),
    quantity: quantity("Truck quantity"),
    driverName: optionalString("Driver name", 255),
    driverPhone: optionalString("Driver phone", 50),
    loaderName: optionalString("Loader name", 255).nullable(),
    loaderPhone: optionalString("Loader phone", 50).nullable(),
    compartments: z
      .array(
        z.object({
          qty: numberLike("Compartment quantity"),
          ullage: numberLike("Compartment ullage").optional(),
        })
      )
      .max(10, "A tanker has at most 10 compartments")
      .nullish(),
  })
  .refine((t) => t.truckId != null || (t.truckNumber && t.truckNumber.length), {
    message: "Each truck needs a plate — a fleet truckId or a truckNumber",
    path: ["truckNumber"],
  });

// Release body. Delivery orders carry the fleet-truck allocation here (captured
// at release); pickup orders carry none — their trucks are captured by security
// at gate-in. The delivery/pickup branch and the sum check live in the
// controller, which has the order row.
const releaseOrder = z.object({
  trucks: z.array(truckAllocation).max(20, "Too many trucks on one order").optional(),
});

// Gate-in body. A delivery order references the load allocated at release
// (loadId); a pickup order has no load yet, so security captures the customer's
// own truck here (truckNumber + quantity, plus optional driver/compartments).
// Which fields are required is decided in the controller from the order type.
const gateIn = z.object({
  loadId: id("Load").optional(),
  truckNumber: optionalString("Truck number", 100),
  quantity: quantity("Truck quantity").optional(),
  driverName: optionalString("Driver name", 255),
  driverPhone: optionalString("Driver phone", 50),
  compartments: z
    .array(
      z.object({
        qty: numberLike("Compartment quantity"),
        ullage: numberLike("Compartment ullage").optional(),
      })
    )
    .max(10, "A tanker has at most 10 compartments")
    .nullish(),
});

// Ticket-generation body. Optional because the truck usually loads as declared;
// but trucks get swapped at the gantry (the first one broke down, another came),
// so ticketing may record the ACTUAL plate/driver here. The change is audited
// and the ticket names the corrected truck.
const loadTruck = z.object({
  truckNumber: optionalString("Truck number", 100),
  driverName: optionalString("Driver name", 255),
  driverPhone: optionalString("Driver phone", 50),
});

// Re-matching a paid order onto the statement line(s) that really paid it.
const rematchFunding = z.object({
  bankAccountId: id("Bank account"),
  lineIds: z.array(id("Statement line")).min(1, "Pick at least one statement line"),
  description: optionalString("Description", 500),
});

// A load-scoped route: /orders/:id/trucks/:loadId/...
const loadParam = z.object({ id: id("Order id"), loadId: id("Load id") });

// Correcting a load's own details after the fact — quantity, plate, driver.
// Distinct from loadTruck (the ticketing desk's "confirm loaded" action,
// which also transitions status and issues the ticket): this only ever
// touches the four columns, refused once the truck has gated out.
const updateTruckLoad = z.object({
  truckNumber: optionalString("Truck number", 100),
  quantity: quantity("Truck quantity").optional(),
  driverName: optionalString("Driver name", 255),
  driverPhone: optionalString("Driver phone", 50),
});

module.exports = {
  createOrder,
  createMyOrder,
  listMyOrders,
  listOrders,
  idParam,
  updateOrder,
  refParam,
  cancelOrder,
  payOrder,
  updateMyTrucks,
  releaseOrder,
  gateIn,
  loadTruck,
  loadParam,
  updateTruckLoad,
  rematchFunding,
};
