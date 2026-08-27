const app = require("./app");
const { testConnection } = require("./config/db");
const { logEvents } = require("./middleware/logger");
const PORT = process.env.PORT || 5002;

// REFRESH_TOKEN_SECRET is deliberately absent: refresh tokens are opaque
// random strings looked up by hash, so there is nothing to sign.
const REQUIRED_ENV_VARS = ["DATABASE_URL", "PAYSTACK_SECRET_KEY", "NODE_ENV"];

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `Fatal: Missing required environment variables: ${missing.join(", ")}`,
  );
  console.error(
    "Please configure these in your .env file before starting the server.",
  );
  process.exit(1);
}

// NODE_ENV is required and constrained because the error handler decides
// whether to expose stack traces from it. A typo like "prodcution" would
// otherwise read as non-production and leak internals — so an unrecognised
// value is fatal rather than silently permissive.
const VALID_ENVS = ["production", "staging", "development", "test"];
if (!VALID_ENVS.includes(process.env.NODE_ENV)) {
  console.error(
    `Fatal: NODE_ENV must be one of ${VALID_ENVS.join(", ")} — got "${process.env.NODE_ENV}"`,
  );
  process.exit(1);
}

// Resolving the realm secrets asserts they exist and differ. Done at boot so a
// misconfiguration fails immediately rather than at the first login attempt.
try {
  require("./config/auth").secrets();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// The OTP development bypass must never be reachable in production. Checked
// against a live Paystack key too, because NODE_ENV is the easier of the two
// to get wrong.
if (process.env.OTP_DEV_MODE === "true") {
  const looksLive =
    process.env.NODE_ENV === "production" ||
    (process.env.PAYSTACK_SECRET_KEY || "").startsWith("sk_live_");
  if (looksLive) {
    console.error(
      "Fatal: OTP_DEV_MODE must not be enabled in a production environment.",
    );
    process.exit(1);
  }
  console.warn(
    "[otp] OTP_DEV_MODE is ON — codes are fixed and no SMS is sent.",
  );
}

// Store-review static OTP: production-safe, but only for the allowlisted
// numbers. Logged at boot so it is obvious this is still on after review.
if (process.env.OTP_DEMO_CODE && process.env.OTP_DEMO_PHONES) {
  console.warn(
    "[otp] OTP_DEMO_CODE is set — store-review numbers accept a static code and no SMS is sent to them.",
  );
}

// Turnstile is optional while the frontend catches up, but never silently off
// in production: either a secret is set, or it is explicitly disabled with
// TURNSTILE_ENABLED=false. This stops a missing secret from disabling the bot
// check by accident, while still allowing a deliberate opt-out.
if (
  process.env.NODE_ENV === "production" &&
  process.env.TURNSTILE_ENABLED !== "false" &&
  !process.env.TURNSTILE_SECRET_KEY
) {
  console.error(
    "Fatal: TURNSTILE_SECRET_KEY must be set in production, or set TURNSTILE_ENABLED=false to disable the bot check.",
  );
  process.exit(1);
}

// The settlement sweep deliberately does NOT run here.
//
// It moves money. Running it inside app.listen meant every restart — including
// a crash loop or a routine deploy — settled orders and minted loading tickets
// on a code path nobody triggered, before the app was known healthy, with its
// only error handling a console.error. It is now a scheduled job: POST
// /api/settlements/run, finance-gated, driven by cron.
testConnection()
  .then(async () => {
    app.listen(PORT, () => {
      console.log(`Dashboard server running on port ${PORT}`);
    });

    // WhatsApp workers ride the same process. A queue failure logs loudly but
    // never takes the dashboard down — the durable inbox holds messages until
    // the workers are healthy, and the janitor cron re-queues what it finds.
    if (process.env.WHATSAPP_ENABLED === "true") {
      require("./whatsapp/worker")
        .startWhatsApp()
        .catch((err) =>
          console.error(
            "Fatal for WhatsApp (dashboard unaffected):",
            err.message,
          ),
        );
    }

    // Opt-in recurring jobs (the order-expiry sweep). Off unless a deployment
    // sets SCHEDULED_JOBS_ENABLED=true; a failure here never takes the
    // dashboard down, and the manual /run endpoint works regardless.
    if (process.env.SCHEDULED_JOBS_ENABLED === "true") {
      require("./jobs/scheduler")
        .start()
        .catch((err) => console.error("[scheduler] failed to start:", err.message));
    }

    // The durable notification worker. Only needed when NOTIFY_QUEUE_ENABLED
    // is on — otherwise notify() dispatches in-process and there is no queue
    // to consume. A failure here is loud but never fatal: notifications fall
    // back to inline delivery (see notifications/index.js), so the dashboard
    // and the sends both keep working.
    if (process.env.NOTIFY_QUEUE_ENABLED === "true") {
      require("./notifications/worker")
        .start()
        .catch((err) => console.error("[notify] worker failed to start:", err.message));
    }
  })
  .catch(() => {
    console.error("Failed to connect to database. Exiting.");
    process.exit(1);
  });
