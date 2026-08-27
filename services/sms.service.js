const axios = require("axios");
const { virtualAccountName } = require("../utils/helpers");
const { toSmsRecipient } = require("../utils/phone");

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
    return { success: true };
  }

  return { success: false, message: response.data.message || "SMS sending failed" };
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

const sendOrderSummarySMS = async (phone, orderData) => {
  const { orderNumber, customerName, product, quantity, unit, totalAmount, accountNumber, bankName, accountName } = orderData;

  const formattedAmount = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(totalAmount);

  const formattedAccountName = accountName || virtualAccountName(customerName);
  const sms = `Dear ${customerName}, your order for ${quantity?.toLocaleString()}${unit ? ` ${unit}` : ""} of ${product} (${formattedAmount}) has been received. Pay to: ${bankName} - ${accountNumber} (Account Name: ${formattedAccountName}). Thank you for choosing Soroman!`;
  // const sms = `Dear ${customerName}, your order ${orderNumber} for ${quantity?.toLocaleString()}${unit ? ` ${unit}` : ""} of ${product} (${formattedAmount}) has been received. Pay to: ${bankName} - ${accountNumber} (Account Name: ${formattedAccountName}). Thank you for choosing Soroman!`;
  // Try generic (transactional) channel first, fall back to dnd
  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) {
        return { success: true, message: "SMS sent successfully" };
      }
      console.warn(`Termii ${channel} channel failed:`, result.message);
    } catch (error) {
      const errMsg =
        error.response?.data?.message || error.message || "Termii SMS error";
      console.warn(`Termii ${channel} channel error:`, errMsg);
    }
  }

  return { success: false, message: "All Termii channels failed" };
};

const sendTicketSummarySMS = async (phone, ticketData) => {
  const { ticketNumber, customerName, productName, quantity, unit, depotName, deliveryType, orderNumber } = ticketData;

  // Delivery orders have nothing to "present at the depot" — the same order-level
  // ticket exists so the load can pass the gate, but the buyer isn't collecting
  // it. Telling a delivery customer to redeem a pickup QR is wrong, so the copy
  // branches on deliveryType.
  const sms =
    deliveryType === "delivery"
      ? `Dear ${customerName}, your order for ${quantity?.toLocaleString()} ${unit} of ${productName} from ${depotName || "Soroman depot"} is confirmed and being prepared for delivery. We'll keep you updated. Thank you for choosing Soroman!`
      : `Dear ${customerName}, your loading ticket for ${quantity?.toLocaleString()} ${unit} of ${productName} at ${depotName || "Soroman depot"} has been generated. Thank you for choosing Soroman!`;

  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) {
        return { success: true, message: "Ticket SMS sent successfully" };
      }
    } catch (error) {
      console.warn(`Termii ${channel} channel error during ticket SMS:`, error.message);
    }
  }
  return { success: false, message: "All Termii channels failed for ticket SMS" };
};

const sendDangoteDeliveryOrderSMS = async (phone, orderData) => {
  const { requestNumber, customerName, product, quantity, quantityUnit, totalAmount, accountNumber, bankName, accountName } = orderData;

  const formattedAmount = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(totalAmount);

  const formattedAccountName = accountName || virtualAccountName(customerName);

  const sms = `Dear ${customerName}, your Dangote delivery order ${requestNumber} for ${quantity?.toLocaleString()} ${quantityUnit} of ${product} (${formattedAmount}) has been approved. Pay to: ${bankName} - ${accountNumber} (${formattedAccountName}). Thank you for choosing Soroman!`;

  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) {
        return { success: true, message: "Dangote delivery order SMS sent successfully" };
      }
      console.warn(`Termii ${channel} channel failed:`, result.message);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || "Termii SMS error";
      console.warn(`Termii ${channel} channel error:`, errMsg);
    }
  }

  return { success: false, message: "All Termii channels failed" };
};

const sendLpgOrderSMS = async (phone, orderData) => {
  const { requestNumber, customerName, cylinderSizeKg, cylinderQuantity, totalAmount, accountNumber, bankName, accountName } = orderData;

  const formattedAmount = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(totalAmount);

  const formattedAccountName = accountName || virtualAccountName(customerName);

  const sms = `Dear ${customerName}, your LPG order ${requestNumber} for ${cylinderQuantity}x ${cylinderSizeKg}Kg cylinders (${formattedAmount}) has been approved. Pay to: ${bankName} - ${accountNumber} (${formattedAccountName}). Thank you for choosing Soroman!`;

  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) {
        return { success: true, message: "LPG order SMS sent successfully" };
      }
      console.warn(`Termii ${channel} channel failed:`, result.message);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || "Termii SMS error";
      console.warn(`Termii ${channel} channel error:`, errMsg);
    }
  }

  return { success: false, message: "All Termii channels failed" };
};

const sendOrderExpiredSMS = async (phone, { orderNumber, customerName }) => {
  const name = customerName ? `Dear ${customerName}, ` : "";
  const sms = `${name}your order ${orderNumber} has expired because payment wasn't received in time. The price is no longer valid, place a new order at current price whenever you're ready.`;

  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) return { success: true, message: "SMS sent successfully" };
      console.warn(`Termii ${channel} channel failed:`, result.message);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || "Termii SMS error";
      console.warn(`Termii ${channel} channel error:`, errMsg);
    }
  }
  return { success: false, message: "All Termii channels failed" };
};

const sendDangoteOrderExpiredSMS = async (phone, { requestNumber, customerName }) => {
  const name = customerName ? `Hi ${customerName}, ` : "";
  const sms = `${name}your Dangote delivery order ${requestNumber} has expired because payment wasn't received in time. The price is no longer held — submit a new request at today's prices whenever you're ready.`;

  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) return { success: true, message: "SMS sent successfully" };
      console.warn(`Termii ${channel} channel failed:`, result.message);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || "Termii SMS error";
      console.warn(`Termii ${channel} channel error:`, errMsg);
    }
  }
  return { success: false, message: "All Termii channels failed" };
};

const sendLpgOrderExpiredSMS = async (phone, { requestNumber, customerName }) => {
  const name = customerName ? `Hi ${customerName}, ` : "";
  const sms = `${name}your LPG cooking gas order ${requestNumber} has expired because payment wasn't received in time. The price is no longer held — submit a new order at today's prices whenever you're ready.`;

  for (const channel of [CHANNELS.GENERIC, CHANNELS.DND]) {
    try {
      const result = await sendSMSTermii(phone, sms, channel);
      if (result.success) return { success: true, message: "SMS sent successfully" };
      console.warn(`Termii ${channel} channel failed:`, result.message);
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || "Termii SMS error";
      console.warn(`Termii ${channel} channel error:`, errMsg);
    }
  }
  return { success: false, message: "All Termii channels failed" };
};

module.exports = { sendSMSTermii, sendSMSWithFallback, sendOrderSummarySMS, sendTicketSummarySMS, sendDangoteDeliveryOrderSMS, sendLpgOrderSMS, sendOrderExpiredSMS, sendDangoteOrderExpiredSMS, sendLpgOrderExpiredSMS, CHANNELS };
