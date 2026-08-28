const express = require("express");
const router = express.Router();
const { notificationDeliveryRepo } = require("../repositories");

/**
 * Termii delivery reports.
 *
 * `sent` only ever meant "Termii accepted the request". Whether the handset
 * actually received anything is a separate fact that arrives later, over this
 * callback — which is why the delivery log held 12,084 rows and not one of
 * them marked `delivered`. Termii posts here once per message as the carrier
 * reports back.
 *
 * Configure the URL in the Termii dashboard under Settings → Callback /
 * Delivery Report:  https://<api-host>/api/webhooks/termii
 *
 * ── On authentication ──────────────────────────────────────────────────────
 *
 * Termii does not sign its delivery reports, so there is no HMAC to check the
 * way routes/webhook.route.js checks Paystack's. Two things bound what a
 * forged POST can do instead:
 *
 *   1. The only rows it can touch are ones already holding the exact provider
 *      message id it names, and those ids are Termii's to mint.
 *   2. It can only move a row from pending/sent to delivered/failed. It cannot
 *      create a delivery, cannot address a customer, and cannot un-fail a send
 *      we already know was refused.
 *
 * Set TERMII_WEBHOOK_SECRET and append `?token=…` to the callback URL for a
 * shared-secret check on top. Unset, the endpoint is open — which is the
 * documented default because a delivery report that is silently rejected is
 * worse than none at all: the log would look permanently stuck at "sent".
 */

/**
 * Termii's vocabulary, mapped onto ours.
 *
 * Everything not named here is left alone rather than guessed at. An unknown
 * status is recorded verbatim in `provider_status` while `status` keeps
 * whatever it held, so a new Termii state shows up in the log as itself
 * instead of being silently rounded to "failed".
 */
const TERMINAL = {
  DELIVERED: "delivered",
  // The carrier accepted it but never confirmed handset receipt inside the
  // validity window. Not a delivery.
  EXPIRED: "failed",
  UNDELIVERABLE: "failed",
  REJECTED: "failed",
  FAILED: "failed",
  "DND ACTIVE ON PHONE NUMBER": "failed",
};

router.post("/", express.json(), async (req, res) => {
  // Answer first, always. A webhook that a provider cannot get a 200 from is
  // one the provider starts retrying, and Termii's retries would arrive while
  // the database work from the first attempt is still running.
  res.sendStatus(200);

  try {
    const secret = process.env.TERMII_WEBHOOK_SECRET;
    if (secret && req.query.token !== secret) {
      console.warn("[termii] delivery report rejected — bad or missing token");
      return;
    }

    // Termii has shipped this payload flat and wrapped in `data` at different
    // times; accept both rather than depending on which one this account gets.
    const payload = req.body?.data || req.body || {};
    const messageId = payload.message_id || payload.id || "";
    const raw = String(payload.status || payload.dnd_status || "").trim();
    if (!messageId || !raw) return;

    const mapped = TERMINAL[raw.toUpperCase()];
    if (!mapped) {
      console.warn(`[termii] unmapped delivery status "${raw}" for ${messageId}`);
      return;
    }

    const updated = await notificationDeliveryRepo.recordReceipt(
      messageId,
      mapped,
      raw,
      mapped === "failed" ? `Carrier reported: ${raw}` : ""
    );

    // A receipt for a message we have no record of is normal, not an error:
    // a sender id can be shared, and the log is purged on a retention sweep
    // long before Termii stops referring to old ids.
    if (!updated) console.warn(`[termii] delivery report for unknown message ${messageId}`);
  } catch (err) {
    console.error("[termii] delivery report failed:", err.message);
  }
});

module.exports = router;
