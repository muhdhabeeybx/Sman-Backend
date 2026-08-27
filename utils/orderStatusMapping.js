/**
 * Sman-vocabulary order status <-> Django's live consumer_order.status.
 * Shared by repositories/order.repository.js (read-side decoration) and
 * services/orderStatus.service.js (the state machine) — pulled out on its
 * own so neither has to require the other. See orderStatus.service.js's
 * header comment for the full reasoning behind this mapping (verified
 * against Django's actual trigger code, not inferred from the enum labels).
 */

const STATUS_TO_LIVE = Object.freeze({
  Pending: "pending",
  Paid: "paid",
  Released: "released",
  Loading: "loaded",
  Completed: "loaded",
  Cancelled: "canceled",
  Expired: "canceled",
});

/**
 * Live (status, releaseStatus) -> Sman status. `loaded` is ambiguous on its
 * own (Loading vs Completed) — resolved by whether release_status has
 * reached its terminal value.
 */
function fromLiveStatus({ status, releaseStatus }) {
  if (status === "loaded") {
    return releaseStatus === "delivered" || releaseStatus === "picked" ? "Completed" : "Loading";
  }
  if (status === "sold") return "Completed"; // in_house special case
  return { pending: "Pending", paid: "Paid", released: "Released", canceled: "Cancelled" }[status] || status;
}

/** release_status to pair with a Completed transition — delivery vs pickup. */
function completedReleaseStatus(releaseType) {
  return releaseType === "delivery" ? "delivered" : "picked";
}

module.exports = { STATUS_TO_LIVE, fromLiveStatus, completedReleaseStatus };
