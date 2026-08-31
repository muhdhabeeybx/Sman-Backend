/**
 * Every customer-facing string the engine can say, in one reviewable module.
 * The wording IS the product on this channel, so: functions of their
 * variables, no logic beyond formatting, and a snapshot test pins each one —
 * an accidental rewording shows up as a diff in review, not in a customer's
 * chat.
 *
 * Tone (agreed): formal and professional. No emojis, no dashes. Every
 * message should read clearly regardless of the reader's background.
 *
 * Support contact arrives as a variable (from SUPPORT_PHONE config) so no
 * real phone number lives in code.
 */

const naira = (amount) =>
  "₦" + Number(amount || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });

const litres = (qty) => `${Number(qty || 0).toLocaleString("en-NG")} L`;

/** Absolute pay-by time for WhatsApp copy, e.g. "Tue, 12 Aug, 16:42". Always WAT. */
const formatPayBy = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

/** One line telling the customer how long the price is held. */
const paymentDeadlineLine = ({ expiresAt, expiryHours } = {}) => {
  const until = formatPayBy(expiresAt);
  if (until) {
    return `Please pay by *${until}* — after that this price is no longer held.`;
  }
  const hours = Number(expiryHours);
  if (Number.isFinite(hours) && hours > 0) {
    const unit = hours === 1 ? "hour" : "hours";
    return `Please pay within *${hours} ${unit}* — after that this price is no longer held.`;
  }
  return null;
};

// ---------------------------------------------------------------- identify

const identifyPrompt = () =>
  "Welcome to Soroman Energy.\n\nPlease provide the name to be used on your orders.";

const identifyGreeting = () =>
  "Hello. Before we proceed, please provide the name to be used on your orders.";

const identifyInvalidName = () =>
  "This does not appear to be a valid name. Please provide your full name using letters only, between 2 and 60 characters.";

const welcome = (name) =>
  `Thank you, ${name}. Your account has been set up.\n\nWhat would you like to do?`;

// -------------------------------------------------------------------- menu

const menuGreeting = (name) =>
  name ? `Hello ${name}. What would you like to do?` : "Hello. What would you like to do?";

const menuButtons = () => ({
  order: "Place depot order",
  prices: "Check prices",
  track: "Track my order",
});

const reorderRow = (lastOrder) => ({
  title: "Reorder last order",
  description: `${litres(lastOrder.quantity)} ${lastOrder.productName}, ${lastOrder.depotName}`,
});

const payLastRow = (lastOrder) => ({
  title: "Finish payment",
  description: `${lastOrder.orderNumber} is awaiting your transfer`,
});

// Menu rows that open a link. A row only renders when its URL is configured
// (context decides); titles ≤24 chars, CTA button text ≤20 — WhatsApp limits.
const linkRows = () => ({
  website: { title: "Visit our website", description: "Products, depots and news" },
  community: { title: "Join our community", description: "Updates and offers on WhatsApp" },
  support: { title: "Chat with support", description: "We are happy to help" },
  app: { title: "Download mobile app", description: "Order and track on the go" },
});

const linkCtas = () => ({
  website: { body: "You may find all Soroman products, depots and updates on our website.", button: "Visit website" },
  community: { body: "Join the Soroman community on WhatsApp for updates, offers and tips.", button: "Join community" },
  support: { body: "If you have any questions, our support team is available to assist you.", button: "Chat with support" },
  app: { body: "Download the Soroman mobile application to place orders and track deliveries.", button: "Download the app" },
});

const noStockAnywhere = () =>
  "We regret that all depots are currently out of stock. Please check back later, as stock is updated throughout the day.";

const inactiveCustomer = (supportPhone) =>
  `Your account is not currently active, so we are unable to process an order at this time. Please contact us on ${supportPhone} for assistance.`;

const helpText = () =>
  "The following commands are available at any time:\n\n" +
  "• *menu*: return to the main menu\n" +
  "• *track*: check the status of your orders\n" +
  "• *cancel*: cancel the order currently in progress\n" +
  "• *help*: display this message\n\n" +
  "To place a depot order, select *Place depot order* from the menu.";

// -------------------------------------------------------------------- track

// Customer-facing names for order statuses. Keys are the order_status enum.
const trackStatusLabel = (status) =>
  ({
    Pending: "Awaiting payment",
    Paid: "Payment received",
    Released: "Released",
    Loading: "Loading",
    Completed: "Completed",
    Cancelled: "Cancelled",
    Expired: "Expired",
  }[status] || String(status || "In progress"));

// What happens next, per status. The status line answers "where is it";
// this line answers "what should I expect or do".
const trackNextStep = (order) => {
  switch (order.status) {
    case "Pending":
      return `We are awaiting payment of ${naira(order.totalAmount)}. Transfer to ${order.virtualAccountBank} ${order.virtualAccountNumber}, then choose *Finish payment* from the menu to confirm this order.`;
    case "Paid":
      return "Your payment has been received and your loading ticket is being prepared. We will notify you here when your order is released.";
    case "Released":
      return order.deliveryType === "delivery"
        ? "Your order has been released and is being prepared for delivery."
        : "Your order has been released. Your truck may proceed to the depot for loading.";
    case "Loading":
      return order.deliveryType === "delivery"
        ? "Your order is currently being loaded for delivery."
        : "Your order is currently being loaded at the depot.";
    case "Completed":
      return "This order has been completed. Thank you for choosing Soroman.";
    case "Cancelled":
      return "This order was cancelled. Nothing was charged.";
    case "Expired":
      return "Payment was not received in time, so this order has expired. Place a new order at current prices whenever you are ready.";
    default:
      return "We will notify you here as your order progresses.";
  }
};

const trackStatus = (order) =>
  `Order *${order.orderNumber}*: ${litres(order.quantity)} ${order.productName}, ${order.depotName}.\n\n` +
  `Status: *${trackStatusLabel(order.status)}*\n\n` +
  trackNextStep(order);

const trackPortalButton = () => "View full timeline";

const trackListPrompt = () =>
  "You have more than one order in progress. Please select the order you would like to check.";

const trackListButton = () => "Choose an order";

const trackRow = (order) => ({
  title: order.orderNumber,
  description: `${litres(order.quantity)} ${order.productName}, ${order.depotName}. ${trackStatusLabel(order.status)}`,
});

const trackOrderGone = () =>
  "We could not find that order. It may have been completed. Please type *track* to see your current orders.";

const trackNoOrder = () =>
  "You do not have any orders with us yet. Please select *Place depot order* from the menu to begin.";

// ------------------------------------------------------------------- prices

const pricesHeader = () => "Today's Prices";

const pricesStateHeader = (stateName) => `\n\n*${stateName}*`;

const pricesDepotLine = (depotName, productParts) => `\n${depotName}: ${productParts.join(", ")}`;

const pricesProductPart = (productName, price) => `${productName} ${naira(price)}/L`;

const pricesFooter = () => "\n\nSelect *Place depot order* from the menu when you are ready.";

// -------------------------------------------------------------------- depot

const stateListPrompt = () => "Please select the state you would like to order from.";

const stateListButton = () => "Choose a state";

const stateRowDescription = (count) => `${count} depot${count === 1 ? "" : "s"}`;

const changeStateRow = () => ({ title: "Change state" });

const depotPrompt = (stateName) =>
  stateName ? `Please select a depot in ${stateName}.` : "Please select the depot you would like to order from.";

const depotListButton = () => "Choose a depot";

const moreRow = () => ({ title: "More", description: "View the next page" });

const depotUnavailable = () =>
  "That depot is not currently available. Please select from the depots listed below.";

// ------------------------------------------------------------------ product

const productPrompt = (depotName) => `Please select the product you would like to purchase at ${depotName}.`;

const productListButton = () => "Choose a product";

const productRowDescription = (price) => `${naira(price)}/L`;

const productUnavailable = (depotName) =>
  `That product is not currently available at ${depotName}. Please select from the products listed below.`;

// ----------------------------------------------------------------- quantity

const quantityPrompt = (productName, depotName) =>
  `Please enter the number of litres of ${productName} you would like at ${depotName}.`;

const quantityInvalid = () =>
  "Please enter the quantity in litres, for example, *30000* or *30,000*.";

const quantityBelowMin = (min) =>
  `The minimum order quantity is ${litres(min)}. Please enter the number of litres you would like.`;

const quantityAboveCap = (cap) =>
  `This quantity appears to be incorrect. The maximum order quantity is ${litres(cap)}. Please enter the number of litres you would like.`;

const quantityOverStock = (depotName) =>
  `We are unable to supply that quantity at ${depotName} at this time. Please try a smaller amount or select another depot.`;

const overStockButtons = () => ({
  changeDepot: "Change depot",
  menu: "Back to menu",
});

// ------------------------------------------------------------------ company

const companyPrompt = () =>
  "Please enter the name of the company this order is for.";

const companyInvalid = () =>
  "Please enter a valid company name, between 2 and 100 characters.";

// ------------------------------------------------------------------ collect

const collectPrompt = () => "How would you like to receive your order?";

const collectButtons = () => ({ pickup: "Loading by my truck", delivery: "Delivery by Soroman truck" });

// ---------------------------------------------------------------- logistics

// Pickup trucks are optional: declare now, or leave plates for security at
// the gate. Button titles stay ≤20 chars (Cloud API limit).
const truckDeclarePrompt = () =>
  "Would you like to declare your trucks now, or leave the plates for security at the gate?";

const truckDeclareButtons = () => ({
  declare_trucks: "Declare trucks now",
  defer_trucks: "Skip now",
});

// Shown on every declare-now prompt so a half-finished split can be abandoned.
const truckDeferEscapeButtons = () => ({ defer_trucks: "Skip now" });

const truckCountPrompt = (quantity, minTrucks, maxTrucks) =>
  `You have selected ${litres(quantity)} for loading. Please enter the number of trucks you will be sending.\n\nEach truck can carry up to ${litres(60000)}. For this quantity, you will require ${minTrucks === maxTrucks ? minTrucks : `between ${minTrucks} and ${maxTrucks}`} truck${maxTrucks === 1 ? "" : "s"}.`;

const truckCountInvalid = (minTrucks, maxTrucks) =>
  `Please enter a number of trucks between ${minTrucks} and ${maxTrucks} for this quantity.`;

const truckLitresPrompt = (index, count, remaining) =>
  `Truck ${index} of ${count}. Please enter the number of litres this truck will carry.\n\n${litres(remaining)} remain to be assigned. Each truck can carry up to ${litres(60000)}.`;

const truckLitresInvalid = (remaining) =>
  `This quantity is not valid. Each truck can carry at most ${litres(60000)}, and the remaining trucks must also be assigned an amount. ${litres(remaining)} remain to be assigned.`;

const lastTruckPrompt = (count, remaining) =>
  `Truck ${count} of ${count} will carry the remaining ${litres(remaining)}. Please provide its plate number.`;

const platePrompt = (index, count, litresForTruck) =>
  count > 1
    ? `Truck ${index} of ${count} (${litres(litresForTruck)}). Please provide its plate number.`
    : "Please provide the plate number of the truck coming to load.";

const plateInvalid = () =>
  "That plate number does not appear to be valid. Please enter it using letters and numbers only, for example *ABC123XY*.";

const addressPrompt = () => "Please provide the full delivery address.";

const addressInvalid = () =>
  "This address appears to be incomplete. Please provide the full delivery address, including the area and state.";

// ------------------------------------------------------------------ confirm

const confirmSummary = ({ productName, quantity, depotName, companyName, deliveryType, unitPrice, total, trucks = [], address }) => {
  const truckLine = trucks
    .map((t) => (trucks.length > 1 ? `${t.plate} (${litres(t.quantity)})` : t.plate))
    .join(", ");
  const collect =
    deliveryType === "delivery"
      ? `Delivery by Soroman truck to: ${address}`
      : trucks.length === 0
        ? "Loading by my truck — plates captured at the gate"
        : `Loading by my truck${trucks.length > 1 ? "s" : ""}: ${truckLine}`;
  return (
    "Please review your order details.\n\n" +
    `Product: ${litres(quantity)} ${productName}\n` +
    `Depot: ${depotName}\n` +
    `Company: ${companyName}\n` +
    `${collect}\n` +
    `Price: ${naira(unitPrice)}/L\n` +
    `*Total: ${naira(total)}*\n\n` +
    "Select Confirm to receive your invoice and payment details."
  );
};

const confirmWalletHint = (balance) =>
  `Your wallet balance is ${naira(balance)}, which covers this order. After you confirm, you can pay from your wallet in one tap — no transfer needed.`;

const confirmOutdated = () =>
  "Your order has changed since this summary was provided, so the previous button is no longer valid. Please review the updated summary below.";

const confirmButtons = () => ({ confirm: "Confirm", edit: "Edit", cancel: "Cancel" });

const editPrompt = () => "What would you like to change?";

const editListButton = () => "Change something";

const editRows = () => ({
  depot: { title: "Depot" },
  product: { title: "Product" },
  quantity: { title: "Quantity" },
  company: { title: "Company" },
  collect: { title: "Collection" },
});

const orderPending = () =>
  "Please wait while your order is being created.";

// ----------------------------------------------------- order outcome & payment

const orderCreated = (order) => {
  const deadline = paymentDeadlineLine(order);
  return (
    `Your order *${order.orderNumber}* has been created.\n\n` +
    `*Total: ${naira(order.totalAmount)}*\n\n` +
    (deadline ? `${deadline}\n\n` : "") +
    `To pay by bank transfer, send to the account for this order:\n` +
    `Bank: ${order.virtualAccountBank}\n` +
    `Account Number: *${order.virtualAccountNumber}*\n` +
    `Account Name: ${order.virtualAccountName}`
    // Dropped: "Once Soroman confirms your transfer, tap *Pay now* below to
    // confirm your order." The trailing \n\n above went with it — it existed
    // only to separate the account block from that sentence, and left in place
    // it would end every one of these messages on two blank lines.
  );
};

/**
 * The wallet payment couldn't go through — either the transfer hasn't landed
 * yet (a Pay now tapped early) or the balance fell short. Either way the order
 * still stands; point back at the transfer and the same Pay now button.
 */
const payFailed = (message) =>
  message && /balance/i.test(message)
    ? "Not yet — there isn't enough in your wallet to cover this order. Please transfer to the account above; once Soroman confirms it, tap *Pay now* again."
    : "We couldn't take the payment. Please try again, or transfer to the account above.";

/**
 * Pay now after the payment window closed. The order is Expired; offer reorder
 * rather than pointing at a transfer that can no longer settle this order.
 */
const orderExpired = () =>
  "This order has expired. Payment was not received in time, so the price is no longer held. Please place a new order at current prices.";

const orderExpiredButtons = () => ({
  reorder: "Reorder",
  order: "Place new order",
});

const orderPaidWallet = (order) =>
  `Your order *${order.orderNumber}* has been created and has been paid in full.\n\n` +
  `${naira(order.totalAmount)} was paid from your wallet balance, so no transfer is required. ` +
  "Your loading ticket is being prepared, and you will be kept informed at each step.";

const portalManageHint = (portalUrl) =>
  `To change a truck or plate number at a later time, please manage this order at ${portalUrl}`;

const invoiceCaption = (orderNumber) => `Invoice for order ${orderNumber}`;

const orderFailedStock = (hasSome, depotName) =>
  hasSome
    ? `We regret that part of the requested stock at ${depotName} is no longer available. Please try a smaller quantity.`
    : `We regret that this product is no longer available at ${depotName}. Please select another depot.`;

const orderFailedGeneric = (supportPhone) =>
  `An error occurred while creating your order. Please note that no amount has been charged. Please try again shortly, or contact us on ${supportPhone}.`;

const awaitPaymentNudge = (order) => {
  const deadline = paymentDeadlineLine(order);
  return (
    `We are still awaiting your transfer for order *${order.orderNumber}*. Amount: ${naira(order.totalAmount)}. Bank: ${order.virtualAccountBank}. Account Number: *${order.virtualAccountNumber}*.` +
    (deadline ? `\n\n${deadline}` : "")
  );
};

const awaitPaymentCancelButton = () => "Cancel this order";
const payNowButton = () => "Pay now";

const cancelOrderConfirm = (orderNumber) =>
  `Do you wish to cancel ${orderNumber ? `order *${orderNumber}*` : "this order"}? This order has not been paid. No amount will be charged, and the stock will be released.`;

const cancelOrderButtons = () => ({ "cancelorder:yes": "Yes, cancel it", keeporder: "Keep my order" });

const orderCancelled = (order) =>
  `Order ${order?.orderNumber ? `*${order.orderNumber}* ` : ""}has been cancelled. No amount was charged.\n\nWhat would you like to do?`;

const cancelFailed = (supportPhone) =>
  `We were unable to cancel that order, as it may already be processing. Please contact us on ${supportPhone} for assistance.`;

const paymentConfirmed = (order) =>
  `Payment received. Order *${order.orderNumber}* is confirmed.\n\nYou will be kept informed at each stage, including release, loading and completion.`;

// ---------------------------------------------------------- session & misc

const cancelled = () =>
  "That order has been discarded. No amount was charged.\n\nWhat would you like to do?";

const expiredResume = ({ productName, quantity, depotName }) => {
  const summary = [quantity && litres(quantity), productName, depotName && `from ${depotName}`]
    .filter(Boolean)
    .join(" ");
  return `Welcome back. Your previous order has expired${summary ? `. You were ordering ${summary}` : ""}. Would you like to continue where you left off?`;
};

const resumeButtons = () => ({ resume: "Continue order", startover: "Start over" });

const unsupportedType = () =>
  "At this time, we are only able to process text messages and menu selections. Voice notes and photos are not supported.";

const threeStrikes = () =>
  "Let us begin again. Please select an option below.";

const threeStrikesButtons = () => ({ menu: "Back to menu", retry: "Try again" });

module.exports = {
  naira,
  litres,
  identifyPrompt,
  identifyGreeting,
  identifyInvalidName,
  welcome,
  menuGreeting,
  menuButtons,
  reorderRow,
  payLastRow,
  linkRows,
  linkCtas,
  noStockAnywhere,
  inactiveCustomer,
  helpText,
  trackStatus,
  trackStatusLabel,
  trackPortalButton,
  trackListPrompt,
  trackListButton,
  trackRow,
  trackOrderGone,
  trackNoOrder,
  pricesHeader,
  pricesStateHeader,
  pricesDepotLine,
  pricesProductPart,
  pricesFooter,
  stateListPrompt,
  stateListButton,
  stateRowDescription,
  changeStateRow,
  depotPrompt,
  depotListButton,
  moreRow,
  depotUnavailable,
  productPrompt,
  productListButton,
  productRowDescription,
  productUnavailable,
  quantityPrompt,
  quantityInvalid,
  quantityBelowMin,
  quantityAboveCap,
  quantityOverStock,
  overStockButtons,
  companyPrompt,
  companyInvalid,
  collectPrompt,
  collectButtons,
  truckDeclarePrompt,
  truckDeclareButtons,
  truckDeferEscapeButtons,
  truckCountPrompt,
  truckCountInvalid,
  truckLitresPrompt,
  truckLitresInvalid,
  lastTruckPrompt,
  platePrompt,
  plateInvalid,
  addressPrompt,
  addressInvalid,
  confirmSummary,
  confirmWalletHint,
  confirmOutdated,
  confirmButtons,
  orderPaidWallet,
  editPrompt,
  editListButton,
  editRows,
  orderPending,
  orderCreated,
  payFailed,
  orderExpired,
  orderExpiredButtons,
  portalManageHint,
  invoiceCaption,
  orderFailedStock,
  orderFailedGeneric,
  awaitPaymentNudge,
  awaitPaymentCancelButton,
  payNowButton,
  cancelOrderConfirm,
  cancelOrderButtons,
  orderCancelled,
  cancelFailed,
  paymentConfirmed,
  cancelled,
  expiredResume,
  resumeButtons,
  unsupportedType,
  threeStrikes,
  threeStrikesButtons,
};
