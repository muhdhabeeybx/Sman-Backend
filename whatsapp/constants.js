/**
 * Shared vocabulary of the conversation engine. Everything here is a persisted
 * or wire-visible name — states live in wa_sessions.state, effect and inbound
 * types cross the engine boundary — so treat additions as schema changes and
 * never rename casually.
 */

// wa_sessions.state enum values. QUANTITY, not QTY: it outlives the demo's
// abbreviation. TRACK is deliberately absent — it is an action, not a state.
const STATES = Object.freeze({
  IDENTIFY: "IDENTIFY",
  MENU: "MENU",
  DEPOT: "DEPOT",
  PRODUCT: "PRODUCT",
  QUANTITY: "QUANTITY",
  // The company this order is placed for — required, like the web flow. Asked
  // once the quantity is known, before the collection choice.
  COMPANY: "COMPANY",
  COLLECT: "COLLECT",
  LOGISTICS: "LOGISTICS",
  CONFIRM: "CONFIRM",
  AWAIT_PAYMENT: "AWAIT_PAYMENT",
});

/**
 * WhatsApp Cloud API hard limits, enforced by the engine rather than the
 * client: the API rejects an oversized message at send time — after the queue,
 * in a worker, where nobody is looking. A property test asserts every reply
 * the engine can produce stays inside these.
 */
const LIMITS = Object.freeze({
  MAX_BUTTONS: 3,
  MAX_BUTTON_TITLE: 20,
  MAX_LIST_ROWS: 10, // total across all sections
  MAX_ROW_TITLE: 24,
  MAX_ROW_DESCRIPTION: 72,
  MAX_SECTION_TITLE: 24,
  MAX_LIST_BUTTON: 20,
  MAX_BODY: 1024, // interactive-message body; we hold text bodies to it too
});

// List paging: 9 real rows leaves the 10th for the "More ▸" row.
const PAGE_SIZE = 9;

// Inputs that beat the state switch, from anywhere.
const COMMANDS = Object.freeze({
  MENU: ["menu", "hi", "hello", "start"],
  CANCEL: ["cancel"],
  HELP: ["help"],
  TRACK: ["track"],
});

const INBOUND = Object.freeze({
  TEXT: "text",
  BUTTON: "button",
  LIST: "list",
  UNSUPPORTED: "unsupported",
  // System re-entries: the caller performed an effect (or observed a payment)
  // and feeds the outcome back in as an ordinary input.
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_FAILED: "ORDER_FAILED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  CUSTOMER_CREATED: "CUSTOMER_CREATED",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
});

const REPLY = Object.freeze({
  TEXT: "text",
  BUTTONS: "buttons",
  LIST: "list",
  CTA: "cta", // interactive cta_url — one tappable URL button per message
  DOCUMENT: "document",
  TEMPLATE: "template",
});

const EFFECTS = Object.freeze({
  CREATE_ORDER: "CREATE_ORDER",
  CREATE_CUSTOMER: "CREATE_CUSTOMER",
  CANCEL_ORDER: "CANCEL_ORDER",
  // Pay an unpaid order from the customer's wallet balance (the "Pay now"
  // button). Orders are always created Unpaid now, so this is how a
  // wallet-funded customer settles without a bank transfer.
  PAY_ORDER: "PAY_ORDER",
});

// Approved-template names (submitted to Meta in Phase C). Outside the 24-hour
// service window these are the only replies allowed out.
const TEMPLATES = Object.freeze({
  ORDER_UPDATE: "order_update",
  PAYMENT_RECEIVED: "payment_received",
});

// Business bounds — named so changing them is a one-line, reviewable edit.
const MIN_ORDER_LITRES = 1_000;
const MAX_ORDER_LITRES = 1_000_000; // above this is a typo, not an order
const TRUCK_CAPACITY_LITRES = 60_000; // max litres one truck may carry
const MAX_TRUCKS = 10; // sanity ceiling on trucks per chat order

// Third unparseable input in one state offers the menu instead of repeating.
const MAX_FAILURES = 3;

module.exports = {
  STATES,
  LIMITS,
  PAGE_SIZE,
  COMMANDS,
  INBOUND,
  REPLY,
  EFFECTS,
  TEMPLATES,
  MIN_ORDER_LITRES,
  MAX_ORDER_LITRES,
  TRUCK_CAPACITY_LITRES,
  MAX_TRUCKS,
  MAX_FAILURES,
};
