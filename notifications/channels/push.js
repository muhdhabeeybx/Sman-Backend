const fcm = require("../fcm");
const expoPush = require("../expoPush");
const deviceTokenRepo = require("../../repositories/deviceToken.repository");
const notificationRepo = require("../../repositories/notification.repository");

/**
 * Mobile and web push, over FCM.
 *
 * Returns ONE result per device, not one per recipient: a customer with a
 * phone and a tablet has two independent deliveries, either of which can fail
 * on its own, and collapsing them would hide a handset that has stopped
 * receiving anything.
 */

/** Log the tail only — a whole FCM token is a live credential for that device. */
const maskToken = (token) => `…${String(token || "").slice(-12)}`;

/**
 * The iOS badge number.
 *
 * iOS does not increment badges by itself: whatever integer the payload
 * carries is what the icon shows, so sending nothing leaves a stale count and
 * sending `1` permanently pins it at one. The recipient's true unread count is
 * the only correct value, and a failure to compute it is not worth failing the
 * push over — omitting the key leaves the badge untouched.
 */
const resolveBadge = async (principal) => {
  try {
    return await notificationRepo.unreadCount(principal);
  } catch {
    return undefined;
  }
};

/**
 * @returns {Promise<Array<{destination, status, providerMessageId, error}>>}
 */
const send = async ({ principal, rendered }) => {
  // The master switch is the provider-independent one; per-provider readiness
  // is decided below, once we know which providers this recipient needs.
  if (process.env.PUSH_ENABLED === "false") {
    return [{ destination: "", status: "skipped", error: "Push disabled (PUSH_ENABLED=false)" }];
  }

  const tokens = await deviceTokenRepo.findLiveForPrincipal(principal);
  if (!tokens.length) {
    return [{ destination: "", status: "skipped", error: "No registered devices" }];
  }

  const badge = await resolveBadge(principal);
  const push = rendered.push || {};

  const payload = {
    title: push.title || rendered.title,
    body: push.body || rendered.body,
    // The deep link travels in `data`, so tapping the notification lands on
    // the right screen rather than the app's home.
    data: {
      ...rendered.data,
      type: rendered.type,
      category: rendered.category,
      ...(rendered.notificationId ? { notificationId: rendered.notificationId } : {}),
      ...(rendered.actionUrl ? { actionUrl: rendered.actionUrl } : {}),
    },
    priority: rendered.priority,
    imageUrl: push.imageUrl || rendered.imageUrl || undefined,
    badge,
  };

  /**
   * Route by the shape of the token, because the two are not interchangeable:
   * `ExponentPushToken[…]` (what the Expo mobile app registers) is meaningless
   * to FCM v1, and a raw FCM registration token is meaningless to Expo. Sending
   * either to the wrong provider is a guaranteed, silent non-delivery — which
   * is exactly the state this was in before: the app registered Expo tokens and
   * every one of them was handed to FCM.
   *
   * Both senders return identical per-token verdicts, so the retirement logic
   * below is provider-agnostic.
   */
  const expoTokens = [];
  const fcmTokens = [];
  for (const { token } of tokens) {
    (expoPush.isExpoToken(token) ? expoTokens : fcmTokens).push(token);
  }

  const results = [];

  if (expoTokens.length) {
    const expoRun = await expoPush.sendToTokens(expoTokens, payload);
    results.push(...expoRun.results);
  }

  if (fcmTokens.length) {
    if (fcm.isEnabled()) {
      const fcmRun = await fcm.sendToTokens(fcmTokens, payload);
      results.push(...fcmRun.results);
    } else {
      // Not configured is not the handset's fault — report it, retire nothing.
      for (const token of fcmTokens) {
        results.push({
          token,
          success: false,
          code: "DISABLED",
          error: "FCM is not configured",
          permanent: false,
          retryable: false,
        });
      }
    }
  }

  // Feed each verdict back to the token that earned it. Permanent verdicts
  // retire the row immediately; transient ones only count against it, so a bad
  // afternoon at Google does not unregister the fleet.
  await Promise.all(
    results.map(async (r) => {
      if (r.success) return deviceTokenRepo.recordSuccess(r.token);
      if (r.permanent) return deviceTokenRepo.disableToken(r.token, r.code === "UNREGISTERED" ? "unregistered" : "invalid");
      if (r.retryable) return deviceTokenRepo.recordFailure(r.token);
      return null;
    })
  );

  return results.map((r) => ({
    destination: maskToken(r.token),
    status: r.success ? "sent" : "failed",
    providerMessageId: r.messageId || "",
    error: r.success ? null : `${r.code || "ERR"}: ${r.error}`,
  }));
};

module.exports = { send, maskToken };
