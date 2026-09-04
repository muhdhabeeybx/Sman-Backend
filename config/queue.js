const { PgBoss } = require("pg-boss");

/**
 * The durable job queue — pg-boss, jobs as Postgres rows in the `pgboss`
 * schema. Chosen over Redis/BullMQ deliberately: no second datastore, the
 * existing backups cover the queue, and at fuel-order volume (hundreds of
 * messages a day) a dedicated broker is capacity nobody would use. pg-boss
 * polls — it never needs LISTEN/NOTIFY — so it runs fine through Neon's
 * pooled connection; set PGBOSS_DATABASE_URL to a direct (non-pooled) string
 * if maintenance chatter should bypass the pooler.
 *
 * Why a queue at all: a Meta webhook payload that isn't persisted is
 * unrecoverable (no replay API — retries stop after ~7 days), and Cloud API
 * sends need retry with backoff somewhere a failure is visible. Both are
 * durability problems, and durability lives in the database here.
 */

const QUEUES = Object.freeze({
  // Inbound conversation steps. Processed strictly one at a time (see
  // registerWorker below): a customer's messages must apply to their session
  // in order, and at this volume global serialization is the simplest
  // correct answer.
  WA_INBOUND: "wa-inbound",
  // Outbound Cloud API sends: more retries, spaced out — Meta hiccups and
  // rate limits are transient; a still-failing send lands in the dead-letter
  // queue where it is a queryable row, not a lost message. A turn's replies
  // share one job (waMessageIds) so delivery stays in order.
  WA_SEND: "wa-send",
  // Business events entering a conversation from the OUTSIDE — a payment
  // confirmed by the settlement sweep re-enters the customer's session here.
  WA_EVENTS: "wa-events",
  // Notification fan-out: one job per notify() call, expanded by the worker
  // into per-recipient, per-channel sends. Durable because the alternative is
  // an in-process promise — and a deploy mid-flight would lose the payment
  // confirmation the customer is waiting on. Idempotent on redelivery: the
  // inbox row's dedupe key means a retried job re-sends nothing.
  NOTIFY_DISPATCH: "notify-dispatch",
  // Retention sweeps for notifications, delivery logs and dead device tokens.
  NOTIFY_MAINTENANCE: "notify-maintenance",
});

const DEAD_LETTER = Object.freeze({
  [QUEUES.WA_INBOUND]: "wa-inbound-dead",
  [QUEUES.WA_SEND]: "wa-send-dead",
  [QUEUES.WA_EVENTS]: "wa-events-dead",
  [QUEUES.NOTIFY_DISPATCH]: "notify-dispatch-dead",
});

// Per-queue policy, applied at createQueue time.
const QUEUE_OPTIONS = {
  [QUEUES.WA_INBOUND]: {
    retryLimit: 3,
    retryDelay: 5, // seconds; the customer is mid-conversation
    retryBackoff: true,
    expireInSeconds: 60,
    deadLetter: DEAD_LETTER[QUEUES.WA_INBOUND],
  },
  [QUEUES.WA_SEND]: {
    retryLimit: 8,
    retryDelay: 10,
    retryBackoff: true, // 10s, 20s, 40s … transient API trouble self-heals
    expireInSeconds: 60,
    deadLetter: DEAD_LETTER[QUEUES.WA_SEND],
  },
  [QUEUES.WA_EVENTS]: {
    retryLimit: 5,
    retryDelay: 30, // nobody is mid-conversation waiting on these
    retryBackoff: true,
    expireInSeconds: 60,
    deadLetter: DEAD_LETTER[QUEUES.WA_EVENTS],
  },
  [QUEUES.NOTIFY_DISPATCH]: {
    retryLimit: 5,
    retryDelay: 15, // a payment confirmation should not wait minutes
    retryBackoff: true,
    // Generous: one job may fan out to every admin across four channels, and
    // an expiry mid-fan-out would re-run the whole job. The dedupe key makes
    // that safe, but it is still wasted provider calls.
    expireInSeconds: 300,
    deadLetter: DEAD_LETTER[QUEUES.NOTIFY_DISPATCH],
  },
  [QUEUES.NOTIFY_MAINTENANCE]: {
    // Housekeeping. If a sweep is missed the next one covers the same ground,
    // so there is nothing to retry and nothing to dead-letter.
    retryLimit: 1,
    expireInSeconds: 600,
  },
};

let boss = null;
let started = null;

// One flaky network minute used to print dozens of identical lines. Log the
// first occurrence immediately, then swallow repeats and report the count
// when the message changes or 30 s pass — errors stay visible, not deafening.
let lastError = { message: null, at: 0, suppressed: 0 };
const logQueueError = (err) => {
  const message = err?.message || String(err);
  const now = Date.now();
  if (message === lastError.message && now - lastError.at < 30_000) {
    lastError.suppressed += 1;
    return;
  }
  if (lastError.suppressed > 0) {
    console.error(`[queue] (previous error repeated ${lastError.suppressed} more times)`);
  }
  console.error("[queue] pg-boss error:", message);
  lastError = { message, at: now, suppressed: 0 };
};

const getBoss = () => {
  if (!boss) {
    const connectionString = process.env.PGBOSS_DATABASE_URL || process.env.DATABASE_URL;
    // Workers poll every 2 s by default (pollingIntervalSeconds is a WORKER
    // option, not a constructor one) — Neon-friendly as-is.
    //
    // Tests get their own schema: the suite runs against the same database as
    // a developer's live server, and without isolation the server's workers
    // consume the tests' jobs (and vice versa) — real sends fired at fixture
    // phone numbers, assertions racing a foreign worker.
    const schema =
      process.env.PGBOSS_SCHEMA || (process.env.NODE_ENV === "test" ? "pgboss_test" : "pgboss");
    boss = new PgBoss({
      connectionString,
      schema,
      // pg-boss v12 passes these directly to the underlying pg.Pool.
      // Neon's pooler kills idle connections aggressively; TCP keepalive
      // nudges the socket so the load balancer knows it is alive, and the
      // short idle/connection timeouts mirror db/index.js.
      max: 3,                              // pg-boss needs very few connections
      idleTimeoutMillis: 20_000,           // release idle connections after 20 s
      connectionTimeoutMillis: 10_000,     // give up connecting after 10 s
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });
    boss.on("error", (err) => logQueueError(err));
  }
  return boss;
};

/** Start pg-boss and ensure every queue (and its dead-letter twin) exists. Idempotent. */
const startQueue = async () => {
  if (!started) {
    started = (async () => {
      const b = getBoss();
      await b.start();
      for (const name of Object.values(DEAD_LETTER)) {
        await b.createQueue(name).catch(() => {}); // exists already — fine
      }
      for (const [name, options] of Object.entries(QUEUE_OPTIONS)) {
        await b.createQueue(name, options).catch(() => {});
      }
      return b;
    })();
  }
  return started;
};

/** Enqueue a job. The queue's retry policy applies; data must be jsonb-safe. */
const enqueue = async (queue, data, options = {}) => {
  const b = await startQueue();
  return b.send(queue, data, options);
};

/**
 * Register a worker. batchSize 1 — one job at a time per worker — is the
 * ordering guarantee the conversation needs, not an oversight.
 */
const registerWorker = async (queue, handler) => {
  const b = await startQueue();
  return b.work(queue, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      await handler(job.data, job);
    }
  });
};

/**
 * Schedule a cron job (the session sweep, template sync). Idempotent per name.
 *
 * `options` reaches pg-boss verbatim. The one that matters here is `tz`:
 * pg-boss evaluates a cron expression in UTC unless told otherwise, so a job
 * meant for 23:50 in Lagos written as "50 23 * * *" would fire at 00:50 WAT —
 * an hour late, and on the wrong calendar day. Passing tz keeps the expression
 * readable as the time somebody actually asked for.
 */
const scheduleCron = async (queue, cron, data = {}, options = {}) => {
  const b = await startQueue();
  await b.createQueue(queue).catch(() => {});
  return b.schedule(queue, cron, data, options);
};

const stopQueue = async () => {
  if (boss) {
    // Valid StopOptions are {close, graceful, timeout} — `wait` is not one.
    await boss.stop({ graceful: true, timeout: 5000 }).catch(() => {});
    boss = null;
    started = null;
  }
};

module.exports = { QUEUES, DEAD_LETTER, getBoss, startQueue, enqueue, registerWorker, scheduleCron, stopQueue };
