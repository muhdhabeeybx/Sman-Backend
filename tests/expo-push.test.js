// Must precede any require that reaches config/db.
require("dotenv").config();

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const expoPush = require("../notifications/expoPush");

/**
 * The bug these guard against: the mobile app registers `ExponentPushToken[…]`
 * and every one of them used to be handed to FCM v1, which cannot parse them.
 * Nothing errored loudly — the pushes simply never arrived.
 */
describe("expo push — token recognition", () => {
  test("recognises both Expo token spellings", () => {
    assert.ok(expoPush.isExpoToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"));
    assert.ok(expoPush.isExpoToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]"));
  });

  test("does not claim FCM or APNs tokens", () => {
    // A real FCM registration token: colon-separated, no brackets.
    assert.equal(
      expoPush.isExpoToken(
        "fH7Qw2ZkTZm9:APA91bH8_x1yZq0kK3nR5tYu7Iv2Op4As6Df8Gh0Jk2Lm4Nq6Rt8Uw"
      ),
      false
    );
    // A raw APNs token: 64 hex characters.
    assert.equal(expoPush.isExpoToken("a".repeat(64)), false);
    assert.equal(expoPush.isExpoToken(""), false);
    assert.equal(expoPush.isExpoToken(null), false);
  });

  test("a bracketless lookalike is not an Expo token", () => {
    assert.equal(expoPush.isExpoToken("ExponentPushToken"), false);
    assert.equal(expoPush.isExpoToken("ExponentPushToken[]"), false);
  });
});

describe("expo push — ticket classification", () => {
  test("only DeviceNotRegistered retires the token", () => {
    const dead = expoPush.classifyTicket({
      status: "error",
      message: "…is not a registered push notification recipient",
      details: { error: "DeviceNotRegistered" },
    });
    assert.equal(dead.permanent, true);
    assert.equal(dead.retryable, false);
    assert.equal(dead.code, "UNREGISTERED");
  });

  test("a rate limit is retryable and never retires the token", () => {
    const busy = expoPush.classifyTicket({
      status: "error",
      message: "Too many messages",
      details: { error: "MessageRateExceeded" },
    });
    assert.equal(busy.permanent, false, "a busy afternoon must not unregister a live handset");
    assert.equal(busy.retryable, true);
  });

  test("our own bad payload is surfaced but not retried, and not fatal to the token", () => {
    const tooBig = expoPush.classifyTicket({
      status: "error",
      message: "Message too big",
      details: { error: "MessageTooBig" },
    });
    assert.equal(tooBig.permanent, false);
    assert.equal(tooBig.retryable, false);
  });

  test("an unrecognised error defaults to retryable, not fatal", () => {
    const odd = expoPush.classifyTicket({ status: "error", message: "?", details: {} });
    assert.equal(odd.permanent, false);
    assert.equal(odd.retryable, true);
  });
});

describe("expo push — message shape", () => {
  const TOKEN = "ExponentPushToken[abcdefghijklmnopqrst]";

  test("carries the deep-link data through unchanged", () => {
    const msg = expoPush.buildMessage(TOKEN, {
      title: "Order released",
      body: "Truck loaded",
      data: { event: "order_released", orderId: "42", actionUrl: "/App/orders/42" },
      priority: "high",
      badge: 3,
    });
    assert.equal(msg.to, TOKEN);
    assert.equal(msg.title, "Order released");
    assert.deepEqual(msg.data, {
      event: "order_released",
      orderId: "42",
      actionUrl: "/App/orders/42",
    });
    assert.equal(msg.priority, "high");
    assert.equal(msg.badge, 3);
  });

  test("omits the badge entirely when there is no real count", () => {
    // iOS displays whatever integer arrives, so a placeholder would pin the
    // icon at a wrong number rather than leave it untouched.
    const msg = expoPush.buildMessage(TOKEN, { title: "t", body: "b" });
    assert.equal("badge" in msg, false);
  });

  test("a non-high priority is sent as Expo's 'default', not passed through", () => {
    const msg = expoPush.buildMessage(TOKEN, { title: "t", body: "b", priority: "normal" });
    assert.equal(msg.priority, "default");
  });
});
