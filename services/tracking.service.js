const { eq, or, asc } = require("drizzle-orm");
const { db } = require("../config/db");
const { orders, depots, products, orderTrucks } = require("../db/schema");

/**
 * Public order tracking — what anyone holding the reference may see.
 *
 * The order number is the shared secret, so this is unauthenticated; but it is
 * deliberately sanitised to movement only. It NEVER carries price, total, the
 * buyer's name/company, or their account — those stay behind sign-in. Volumes,
 * the depot, the stage timeline, and (once assigned) the truck plate are the
 * whole surface, because that is all a driver at a gate needs.
 *
 * The six public stages map onto the order's lifecycle timestamps:
 *   received          ← created_at (always)
 *   payment_confirmed ← payment_confirmed_at
 *   processing        ← payment_confirmed_at (paid, depot preparing the load)
 *   released          ← released_at
 *   loading           ← loading_started_at
 *   completed         ← completed_at
 * A cancelled order is not publicly trackable (returns null → 404); its state
 * is the customer's business, surfaced to them behind sign-in.
 */

// Per-truck movement, in words. Driver details are deliberately absent — a
// plate is on a public road, a driver's name and phone are not.
const TRUCK_STATUS_LABEL = {
  pending: "Assigned",
  // A ticketed truck is cleared to load but has not reached the gate yet, so
  // this names the paperwork rather than claiming work already done.
  loaded: "Ticket issued",
  gated_in: "At the depot",
  gated_out: "Departed",
};

// Counted off the gate, not off the ticket: a truck that has driven back out is
// the only one certainly carrying product.
const loadedCount = (trucks) => trucks.filter((t) => t.status === "gated_out").length;

const NOTE = {
  received: () => "Order received — awaiting payment.",
  payment_confirmed: () => "Payment confirmed.",
  processing: (o) => `Payment confirmed — ${o.depotName} is preparing your load.`,
  released: (o) =>
    o.trucks.length
      ? `Released — ${o.trucks.length} truck${o.trucks.length > 1 ? "s" : ""} assigned, waiting to load.`
      : "Released — waiting for a truck to load.",
  loading: (o) => {
    if (!o.trucks.length) return `Loading at ${o.depotName}.`;
    const done = loadedCount(o.trucks);
    return done < o.trucks.length
      ? `Loading at ${o.depotName} — ${done} of ${o.trucks.length} trucks loaded.`
      : `All ${o.trucks.length} trucks loaded at ${o.depotName}.`;
  },
  completed: () => "Loaded and signed out at the depot gate.",
  cancelled: () => "This order has been cancelled.",
};

const currentStage = (o) => {
  if (o.completedAt) return "completed";
  if (o.loadingStartedAt) return "loading";
  if (o.releasedAt) return "released";
  if (o.paymentConfirmedAt) return "processing";
  return "received";
};

/**
 * Build the `reached` map from an order's lifecycle stamps. Shared by the
 * public tracking feed and the owner's own detail so both surfaces stamp the
 * same stages from the same columns. `cancelled` is only set when the order
 * was cancelled — the public feed never returns cancelled orders, but the
 * owner's detail does.
 */
const buildReached = (row) => {
  const reached = { received: row.createdAt };
  if (row.paymentConfirmedAt) {
    reached.payment_confirmed = row.paymentConfirmedAt;
    reached.processing = row.paymentConfirmedAt;
  }
  if (row.releasedAt) reached.released = row.releasedAt;
  if (row.loadingStartedAt) reached.loading = row.loadingStartedAt;
  if (row.completedAt) reached.completed = row.completedAt;
  if (row.cancelledAt) reached.cancelled = row.cancelledAt;
  return reached;
};

/** One-line situation report for the current stage. Needs `depotName` + `trucks`. */
const stageNote = (stage, row) => (NOTE[stage] ? NOTE[stage](row) : null);

const { customers } = require("../db/schema/customer");
const { generateOrderReference, parseOrderReference } = require("../utils/helpers");

const trackByRef = async (ref) => {
  const normalized = String(ref || "").trim().toUpperCase();
  if (!normalized) return null;

  // Accepts "SO600", the legacy "SO/600", and the raw ORD-… column value, so a
  // reference printed on any invoice or SMS ever sent still tracks.
  const possibleId = parseOrderReference(normalized);

  let whereCond;
  if (possibleId) {
    whereCond = or(eq(orders.id, possibleId), eq(orders.orderNumber, normalized));
  } else {
    whereCond = eq(orders.orderNumber, normalized);
  }

  const [row] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      companyName: orders.companyName,
      customerCompanyName: customers.companyName,
      status: orders.status,
      quantity: orders.quantity,
      deliveryType: orders.deliveryType,
      deliveryAddress: orders.deliveryAddress,
      state: orders.state,
      createdAt: orders.createdAt,
      paymentConfirmedAt: orders.paymentConfirmedAt,
      releasedAt: orders.releasedAt,
      loadingStartedAt: orders.loadingStartedAt,
      completedAt: orders.completedAt,
      cancelledAt: orders.cancelledAt,
      depotName: depots.name,
      depotState: depots.state,
      productName: products.name,
      productCategory: products.category,
      productUnit: products.unit,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(depots, eq(orders.depotId, depots.id))
    .leftJoin(products, eq(orders.productId, products.id))
    .where(whereCond)
    .limit(1);

  if (!row) return null;

  const displayRef = generateOrderReference(row.companyName || row.customerCompanyName, row.id);

  if (row.status === "Cancelled") {
    return {
      ref: displayRef,
      placedAt: row.createdAt,
      depotName: row.depotName,
      depotState: row.depotState,
      lines: [
        {
          category: row.productCategory || null,
          name: row.productName,
          quantity: row.quantity,
          unit: row.productUnit || "Liters",
        },
      ],
      stage: "cancelled",
      reached: { received: row.createdAt, cancelled: row.cancelledAt || row.updatedAt || row.createdAt },
      note: "This order has been cancelled.",
      trucks: [],
    };
  }

  // Every allocated truck and where it is, once trucks have been assigned at
  // release. Plate + status only — never the driver's name or phone.
  const truckRows = await db
    .select({
      truckIndex: orderTrucks.truckIndex,
      truckNumber: orderTrucks.truckNumber,
      status: orderTrucks.status,
    })
    .from(orderTrucks)
    .where(eq(orderTrucks.orderId, row.id))
    .orderBy(asc(orderTrucks.truckIndex));
  row.trucks = truckRows.map((t) => ({
    index: t.truckIndex,
    plate: t.truckNumber || null,
    status: t.status,
    statusLabel: TRUCK_STATUS_LABEL[t.status] || t.status,
  }));

  const stage = currentStage(row);
  // Public feed never returns Cancelled, so cancelled is never set here.
  const reached = buildReached(row);

  return {
    ref: displayRef,
    placedAt: row.createdAt,
    depotName: row.depotName,
    depotState: row.depotState,
    lines: [
      {
        category: row.productCategory || null,
        name: row.productName,
        quantity: row.quantity,
        unit: row.productUnit || "Liters",
      },
    ],
    delivery:
      row.deliveryType === "delivery"
        ? { type: "delivery", state: row.state, address: row.deliveryAddress || "" }
        : { type: "pickup" },
    stage,
    reached,
    note: stageNote(stage, row),
    // Present once trucks are assigned at release; empty before then.
    trucks: row.trucks,
  };
};

module.exports = { trackByRef, currentStage, buildReached, stageNote };
