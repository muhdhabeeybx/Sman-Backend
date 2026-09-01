const axios = require("axios");

/**
 * Expo push, for tokens the mobile app mints with `getExpoPushTokenAsync()`.
 *
 * Why this exists alongside fcm.js: the app is an Expo project and registers
 * `ExponentPushToken[…]`, which is NOT an FCM registration token — FCM v1
 * rejects it outright. Delivering those needs Expo's own service, which then
 * fans out to APNs and FCM using the credentials held against the EAS project.
 *
 * Notably this is what keeps iOS working without pulling the Firebase iOS SDK
 * into the app: `getDevicePushTokenAsync()` returns a raw APNs token on iOS,
 * which FCM v1 also will not accept, so an all-FCM path would require
 * @react-native-firebase/messaging purely to mint an iOS FCM token.
 *
 * Credentials: none here. Expo authenticates the *project*, not the caller, so
 * no secret is needed by default. Set EXPO_ACCESS_TOKEN only if you enable
 * Expo's enhanced push security, which requires it on every send.
 *
 * The return shape deliberately mirrors fcm.sendToTokens so channels/push.js
 * can treat the two senders identically — same per-token verdicts, so the same
 * token-retirement logic applies to both.
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const TIMEOUT_MS = 10_000;

/** Expo caps a single request at 100 messages. */
const BATCH_SIZE = 100;

/** Both spellings are live in the wild; the modern SDK mints the `Expo…` one. */
const TOKEN_RE = /^Ex(po|ponent)PushToken\[[^\]]+\]$/;

const isExpoToken = (token) => TOKEN_RE.test(String(token || "").trim());

/** No configuration to be missing — only the same master switch FCM honours. */
const isEnabled = () => process.env.PUSH_ENABLED !== "false";

const authHeaders = () => {
  const token = (process.env.EXPO_ACCESS_TOKEN || "").trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Expo reports failures per ticket. Only `DeviceNotRegistered` proves the token
 * is dead — everything else is the service or the payload, and must not retire
 * a handset that is still perfectly reachable.
 */
const classifyTicket = (ticket) => {
  const code = ticket?.details?.error || "ERR";
  const message = ticket?.message || "Push failed";

  if (code === "DeviceNotRegistered") {
    return { code: "UNREGISTERED", error: message, permanent: true, retryable: false };
  }
  // MessageTooBig / MismatchSenderId are our bug or our credentials, not the
  // device's fault: surfaced, but never retried and never fatal to the token.
  if (code === "MessageTooBig" || code === "MismatchSenderId" || code === "InvalidCredentials") {
    return { code, error: message, permanent: false, retryable: false };
  }
  // MessageRateExceeded and anything unrecognised: worth another attempt later.
  return { code, error: message, permanent: false, retryable: true };
};

const buildMessage = (token, payload) => {
  const msg = {
    to: token,
    title: payload.title,
    body: payload.body,
    // Expo requires string-ish data; the deep link travels here exactly as it
    // does over FCM so the app's tap routing is identical on both paths.
    data: payload.data || {},
    sound: "default",
    priority: payload.priority === "high" ? "high" : "default",
  };
  // iOS shows whatever integer arrives, so only send a real count.
  if (typeof payload.badge === "number") msg.badge = payload.badge;
  if (payload.channelId) msg.channelId = payload.channelId;
  if (payload.ttl) msg.ttl = payload.ttl;
  return msg;
};

/**
 * @returns {Promise<{sent:number, failed:number, results:Array}>} one result per
 *   token, shaped like fcm.sendToTokens': { token, success, messageId, code,
 *   error, permanent, retryable }.
 */
const sendToTokens = async (tokens, payload) => {
  const list = (tokens || []).filter(Boolean);
  const results = [];

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    const messages = batch.map((t) => buildMessage(t, payload));

    let tickets;
    try {
      const res = await axios.post(SEND_URL, messages, {
        timeout: TIMEOUT_MS,
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      const data = res.data?.data;
      tickets = Array.isArray(data) ? data : [data];
    } catch (err) {
      // The whole batch never landed. Transient by default — a timeout or a
      // 5xx says nothing about any individual handset, so no token is retired.
      const message = err.response?.data?.errors?.[0]?.message || err.message;
      const status = err.response?.status;
      const permanent = status === 400;
      for (const token of batch) {
        results.push({
          token,
          success: false,
          code: permanent ? "BAD_REQUEST" : "TRANSPORT",
          error: message,
          permanent,
          retryable: !permanent,
        });
      }
      continue;
    }

    batch.forEach((token, idx) => {
      const ticket = tickets[idx];
      if (ticket?.status === "ok") {
        results.push({ token, success: true, messageId: ticket.id || "" });
        return;
      }
      results.push({ token, success: false, ...classifyTicket(ticket) });
    });
  }

  return {
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
};

module.exports = {
  isExpoToken,
  isEnabled,
  classifyTicket,
  buildMessage,
  sendToTokens,
};
