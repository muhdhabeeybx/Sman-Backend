const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { webhookEventRepo } = require("../repositories");
const { processPaystackPayment, processUnpaidOrdersForCustomer } = require("../services/payment.service");

const HANDLED_EVENTS = [
  "charge.success",
  "dedicated_account.payment",
  "transfer.success",
];

// POST /api/webhooks/paystack
router.post(
  "/paystack",
  express.raw({ type: "application/json", verify: verifyPaystackSignature }),
  async (req, res) => {
    let event;
    try {
      event = JSON.parse(req.body);
    } catch (parseErr) {
      console.error("Webhook payload JSON parse error:", parseErr.message);
      return res.sendStatus(400);
    }

    const eventName = event.event || "unknown";

    // 1. Audit log event entry in DB
    let webhookRecord;
    try {
      webhookRecord = await webhookEventRepo.create({
        event: eventName,
        payload: event,
        status: "pending",
      });
    } catch (dbErr) {
      console.error("Failed to log webhook event to DB:", dbErr.message);
    }

    // 2. Filter non-payment events
    if (!HANDLED_EVENTS.includes(eventName)) {
      if (webhookRecord) {
        await webhookEventRepo.update(webhookRecord.id, {
          status: "processed",
          error: `Ignored event: ${eventName}`,
          processedAt: new Date(),
        });
      }
      return res.sendStatus(200);
    }

    // 3. Process payment event
    //
    // Disabled — manual deposit only. Wallets no longer get funded by a
    // Paystack DVA credit, so there is nothing for this webhook to settle;
    // processPaystackPayment() is a stub (see payment.service.js) that
    // always returns { success: false, disabled: true }. The event is still
    // logged above for audit purposes. To reinstate, restore the block below
    // and un-stub processPaystackPayment / processUnpaidOrdersForCustomer.
    //
    // try {
    //   const result = await processPaystackPayment(event.data, eventName);
    //
    //   // Auto-settle: credit landed in the customer's wallet — try to pay
    //   // their oldest Pending order immediately so they don't wait for the
    //   // batch settlement sweep.
    //   if (result.success && result.customer?.id) {
    //     processUnpaidOrdersForCustomer(result.customer.id).catch((err) =>
    //       console.error("[webhook] auto-settle failed:", err.message)
    //     );
    //   }
    //
    //   if (webhookRecord) {
    //     if (result.success) {
    //       await webhookEventRepo.update(webhookRecord.id, {
    //         status: "processed",
    //         error: result.alreadyProcessed ? result.message : "",
    //         processedAt: new Date(),
    //       });
    //       console.log(`Webhook ${eventName} processed:`, result.reference || result.message);
    //     } else {
    //       await webhookEventRepo.update(webhookRecord.id, {
    //         status: "failed",
    //         error: result.message,
    //         processedAt: new Date(),
    //       });
    //       console.error(`Webhook ${eventName} failed:`, result.message);
    //     }
    //   }
    // } catch (procErr) {
    //   console.error("Webhook processing error:", procErr.message);
    //   if (webhookRecord) {
    //     await webhookEventRepo.update(webhookRecord.id, {
    //       status: "failed",
    //       error: procErr.message,
    //       processedAt: new Date(),
    //     });
    //   }
    // }
    if (webhookRecord) {
      await webhookEventRepo.update(webhookRecord.id, {
        status: "processed",
        error: "Ignored: Paystack payments are disabled (manual deposit only)",
        processedAt: new Date(),
      });
    }

    res.sendStatus(200);
  }
);

function verifyPaystackSignature(req, res, buf) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("PAYSTACK_SECRET_KEY not set – rejecting webhook");
    throw new Error("Webhook signing key not configured");
  }

  const hash = crypto
    .createHmac("sha512", secret)
    .update(buf)
    .digest("hex");

  const a = Buffer.from(hash);
  const b = Buffer.from(req.headers["x-paystack-signature"] || "");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid Paystack signature");
  }
}

module.exports = router;
