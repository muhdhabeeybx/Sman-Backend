const axios = require("axios");
const { virtualAccountName } = require("../utils/helpers");
const { toSmsRecipient } = require("../utils/phone");
// How a Soroman text is written — plain sentences, nothing in brackets, and
// N rather than ₦ so the body stays in GSM-7. Shared with the catalog
// templates so the two senders cannot drift into two voices again.
const { money, quantity: qty, rateClause, payTo, greet } = require("../notifications/templates/sms");

// Termii v3 API. Config is read at call time inside sendSMSTermii — not frozen
// at module load — so a deploy or a test can override the key, sender, or
// enabled flag per-send, and a missing key is caught on each attempt.

// Was a second hand-rolled Nigeria-only normaliser that agreed with
// utils/helpers by coincidence. Termii wants E.164 digits without the `+`,
// which is a rendering of one parse rather than a separate parser.
const formatPhoneForTermii = toSmsRecipient;

const CHANNELS = {
  GENERIC: "generic",
  DND: "dnd",
};

const sendSMSTermii = async (
  phone,
  sms,
  channel = CHANNELS.GENERIC,
  from = process.env.TERMII_SENDER_ID || "Soroman"
) => {
  if (process.env.SMS_ENABLED === "false") {
    // Reported as a distinct outcome, NOT as success. Returning { success: true }
    // here made a disabled sender indistinguishable from a delivered message:
    // the OTP path saw `sent`, told the customer a code was on its way, and
    // nothing ever arrived. Callers that legitimately want a no-op in dev can
    // branch on `disabled`; everything else now sees an honest failure.
    console.warn("[SMS] SMS_ENABLED=false — no message sent");
    return { success: false, disabled: true, message: "SMS sending is disabled (SMS_ENABLED=false)" };
  }

  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) {
    console.error(
      "[SMS] TERMII_API_KEY is not configured — set it on the deployment, not just in local .env"
    );
    return { success: false, message: "SMS API key not configured" };
  }

  const response = await axios.post(
    // Termii's send endpoint is /api/sms/send. The bare /sms/send path 404s,
    // which is what surfaced as "Termii ... channel error ... status code 404".
    //
    // Base URL defaults to v4 — Termii assigns each account its own regional
    // base URL, and this account is on v4. An account whose deployment forgot
    // to set TERMII_BASE_URL was silently posting to the stale v3 host and
    // getting 401 Unauthorized (auth, not the key), so real OTPs never sent.
    // Set TERMII_BASE_URL explicitly per environment; this default is the
    // safety net, not the source of truth.
    `${process.env.TERMII_BASE_URL || "https://v4.api.termii.com"}/api/sms/send`,
    {
      to: formatPhoneForTermii(phone),
      from,
      sms,
      type: "plain",
      channel,
      api_key: apiKey,
    },
    { headers: { "Content-Type": "application/json" } }
  );

  if (response.data.message === "Successfully Sent" || response.data.code === "ok") {
    // Termii's own id for this message, carried back so the delivery row can
    // hold it. Without it a delivery receipt has nothing to match against, and
    // "delivered" stays permanently unknowable — which is exactly how the log
    // ended up with 12,084 rows and not one of them marked delivered.
    return { success: true, messageId: response.data.message_id || "" };
  }

  return { success: false, message: response.data.message || "SMS sending failed" };
};

/**
 * The Termii wallet, read straight from the provider.
 *
 * The `balance` echoed inside a send response is unreliable — some routes
 * return 0 — so this is the authoritative figure, and it is a read that bills
 * nothing. 346 sends on the live book failed with "Insufficient balance"
 * because nobody could see the wallet from the dashboard; this is what puts it
 * in front of the person about to press Send.
 *
 * Never throws. A balance that cannot be read must not stop a broadcast — it
 * is a courtesy reading beside the compose box, not a precondition.
 *
 * @returns {Promise<{ok: boolean, balance: number|null, currency: string, error: string|null}>}
 */
const getTermiiBalance = async () => {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) {
    return { ok: false, balance: null, currency: "", error: "SMS API key not configured" };
  }

  try {
    const base = process.env.TERMII_BASE_URL || "https://v4.api.termii.com";
    const response = await axios.get(`${base}/api/get-balance`, {
      params: { api_key: apiKey },
      timeout: 10_000,
    });
    const data = response.data || {};
    return {
      ok: true,
      balance: data.balance === undefined || data.balance === null ? null : Number(data.balance),
      currency: data.currency || "",
      error: null,
    };
  } catch (error) {
    // A 401 here means the key is wrong for THIS base URL — Termii assigns
    // each account its own regional host, and the same key 401s on the others.
    const detail =
      error.response?.status === 401
        ? "Termii rejected the key — check TERMII_BASE_URL matches the account"
        : error.response?.data?.message || error.message || "Could not reach Termii";
    return { ok: false, balance: null, currency: "", error: detail };
  }
};

/**
 * OTP-only sender: try Termii's DND (transactional) route first, then generic.
 *
 * Per Termii docs, OTP/transactional traffic belongs on `dnd` — `generic` is
 * promotional, skips DND-registered numbers, and on MTN Nigeria is blocked
 * 8PM–8AM WAT. Preferring `dnd` avoids "Successfully Sent" on generic with no
 * actual delivery. Order/notification senders below keep generic → dnd so this
 * can be tested in isolation.
 *
 * `from` overrides the sender ID. The DND route additionally requires the
 * sender ID to be DND-whitelisted: our branded "Soroman" is approved for
 * general sending but NOT for DND, so a DND send under it gets a "rejected"
 * DLR despite "Successfully Sent". OTPs therefore go out under a DND-approved
 * sender (Termii's shared "N-Alert" by default), which the OTP caller passes.
 *
 * Never throws: returns { success, message } so a caller can branch on the
 * outcome instead of relying on an exception that a soft failure won't raise.
 */
const sendSMSWithFallback = async (phone, sms, { from } = {}) => {
  const attempts = [];
  for (const channel of [CHANNELS.DND, CHANNELS.GENERIC]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel, from);
      if (result.success) return { success: true, channel };
      attempts.push(`${channel}: ${result.message || "failed"}`);
    } catch (error) {
      // Termii reports the real reason in the response body, not the status —
      // a 402 is "Insufficient balance" only if you unwrap response.data.
      const detail =
        error.response?.data
          ? JSON.stringify(error.response.data)
          : error.message || "Termii error";
      attempts.push(`${channel}: ${detail}`);
    }
  }
  return { success: false, message: attempts.join(" | ") || "All Termii channels failed" };
};

/**
 * The generic → dnd walk every bespoke sender was carrying its own copy of.
 *
 * Termii's `generic` route is the cheaper transactional one; `dnd` is the only
 * route that reaches a number on Nigeria's Do-Not-Disturb register. Trying
 * generic first keeps the cheap route as the default and still gets the
 * message to a DND-registered customer.
 */
const deliver = async (phone, sms, label) => {
  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) return { success: true, message: `${label} sent successfully` };
      console.warn(`Termii ${channel} channel failed:`, result.message);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || "Termii SMS error";
      console.warn(`Termii ${channel} channel error during ${label}:`, errMsg);
    }
  }
  return { success: false, message: "All Termii channels failed" };
};

const sendOrderSummarySMS = async (phone, orderData) => {
  const { customerName, product, quantity, unit, price, totalAmount, accountNumber, bankName, accountName } = orderData;

  const sms =
    `${greet(customerName)}we have received your order of ${qty(quantity, unit)} of ${product}` +
    `${rateClause(price, unit)}. ` +
    `Please pay ${money(totalAmount)} to ${payTo({
      accountName: accountName || virtualAccountName(customerName),
      accountNumber,
      bankName,
    })}. Thank you for your patronage.`;

  return deliver(phone, sms, "Order SMS");
};

const sendTicketSummarySMS = async (phone, ticketData) => {
  const { ticketNumber, customerName, productName, quantity, unit, depotName, deliveryType, orderNumber } = ticketData;

  // Delivery orders have nothing to "present at the depot" — the same order-level
  // ticket exists so the load can pass the gate, but the buyer isn't collecting
  // it. Telling a delivery customer to redeem a pickup QR is wrong, so the copy
  // branches on deliveryType.
  const sms =
    deliveryType === "delivery"
      ? `${greet(customerName)}your order of ${qty(quantity, unit)} of ${productName} from ${depotName || "our depot"} is confirmed and being prepared for delivery. We will keep you posted. Thank you for your patronage.`
      : `${greet(customerName)}your loading ticket for ${qty(quantity, unit)} of ${productName} at ${depotName || "our depot"} is ready. Thank you for your patronage.`;

  return deliver(phone, sms, "Ticket SMS");
};

const sendDangoteDeliveryOrderSMS = async (phone, orderData) => {
  const { requestNumber, customerName, product, quantity, quantityUnit, totalAmount, accountNumber, bankName, accountName } = orderData;

  const sms =
    `${greet(customerName)}your Dangote delivery order ${requestNumber} for ` +
    `${qty(quantity, quantityUnit)} of ${product} has been approved. ` +
    `Please pay ${money(totalAmount)} to ${payTo({
      accountName: accountName || virtualAccountName(customerName),
      accountNumber,
      bankName,
    })}. Thank you for your patronage.`;

  return deliver(phone, sms, "Dangote delivery order SMS");
};

const sendLpgOrderSMS = async (phone, orderData) => {
  const { requestNumber, customerName, cylinderSizeKg, cylinderQuantity, totalAmount, accountNumber, bankName, accountName } = orderData;

  const cylinders = `${cylinderQuantity} x ${cylinderSizeKg}Kg cylinder${Number(cylinderQuantity) === 1 ? "" : "s"}`;
  const sms =
    `${greet(customerName)}your LPG order ${requestNumber} for ${cylinders} has been approved. ` +
    `Please pay ${money(totalAmount)} to ${payTo({
      accountName: accountName || virtualAccountName(customerName),
      accountNumber,
      bankName,
    })}. Thank you for your patronage.`;

  return deliver(phone, sms, "LPG order SMS");
};

const sendOrderExpiredSMS = async (phone, { orderNumber, customerName }) => {
  const sms =
    `${greet(customerName)}your order ${orderNumber} has expired because payment was not received in time. ` +
    `The price is no longer held. Please place a new order at today's price whenever you are ready.`;

  return deliver(phone, sms, "Order expiry SMS");
};

const sendDangoteOrderExpiredSMS = async (phone, { requestNumber, customerName }) => {
  const sms =
    `${greet(customerName)}your Dangote delivery order ${requestNumber} has expired because payment was not ` +
    `received in time. The price is no longer held. Please send a new request at today's price whenever you are ready.`;

  return deliver(phone, sms, "Dangote expiry SMS");
};

const sendLpgOrderExpiredSMS = async (phone, { requestNumber, customerName }) => {
  const sms =
    `${greet(customerName)}your LPG order ${requestNumber} has expired because payment was not received in time. ` +
    `The price is no longer held. Please place a new order at today's price whenever you are ready.`;

  return deliver(phone, sms, "LPG expiry SMS");
};

module.exports = { sendSMSTermii, getTermiiBalance, sendSMSWithFallback, sendOrderSummarySMS, sendTicketSummarySMS, sendDangoteDeliveryOrderSMS, sendLpgOrderSMS, sendOrderExpiredSMS, sendDangoteOrderExpiredSMS, sendLpgOrderExpiredSMS, CHANNELS };
