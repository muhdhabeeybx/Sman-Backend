/**
 * How long an unpaid depot order (or approved Dangote/LPG request) may sit
 * before the expiry sweep lapses it. One knob for sweep, computed `expiresAt`,
 * and the public catalog's `orderExpiryHours` — read lazily so env overrides
 * and tests apply without restarting the process.
 */
const orderExpiryHours = () => {
  const n = Number(process.env.ORDER_EXPIRY_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 24;
};

const orderExpiryMs = () => orderExpiryHours() * 60 * 60 * 1000;

/**
 * Kill switch for the whole expiry mechanism — both the sweep and the
 * lazy per-request check. A temporary business call, not a config tune, so
 * it's an explicit flag rather than an implausibly large ORDER_EXPIRY_HOURS:
 * intent ("expiry is off") should be readable in the env, not inferred from
 * a magic number.
 */
const orderExpiryDisabled = () => String(process.env.ORDER_EXPIRY_DISABLED || "").toLowerCase() === "true";

module.exports = { orderExpiryHours, orderExpiryMs, orderExpiryDisabled };
