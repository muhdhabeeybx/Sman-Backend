/**
 * Why a message did or did not arrive, in words a person can act on.
 *
 * The delivery log stores what the provider said, verbatim and untruncated —
 * `dnd: Successfully Sent | generic: {"code":402,"message":"Insufficient
 * balance"}` is a real row from the live book. That is the right thing to
 * STORE: it is the evidence, and rounding it off at write time would destroy
 * the only copy. It is the wrong thing to put in a table column, because
 * nobody scanning 300 failures can see the shape of the problem through it.
 *
 * So the raw text stays exactly where it is and this maps it, at READ time, to
 * one short reason. Read time matters: every row already in the table gets the
 * benefit, including the 852 failures that were logged before anyone thought
 * to classify them, and a mapping that turns out to be wrong is a redeploy
 * rather than a backfill.
 *
 * ── Why these categories ───────────────────────────────────────────────────
 *
 * They are the ones that lead somewhere different. "Termii wallet empty" is
 * fixed by topping up, "on DND" by sending transactional instead of
 * promotional, "not a real number" by correcting the book, "network refused
 * it" by nothing at all. A single "failed" bucket hides all four behind each
 * other — which is how 346 sends died on an empty wallet without anyone
 * noticing there was a wallet.
 */

/**
 * Ordered, because the raw text can satisfy more than one pattern and the
 * first match wins. A DND rejection on a send that also reported a low balance
 * is a DND problem: the money is not what stopped it.
 *
 * `tone` is what the reason MEANS for the desk, not how bad it sounds:
 *   fixable   we can act on it — top up, correct the number, change route
 *   external  the network or the handset refused; nothing our end to change
 *   expected  working as intended (opted out, nothing to send to)
 */
const RULES = [
  {
    code: "no_credit",
    label: "Termii wallet empty",
    tone: "fixable",
    test: /insufficient\s*balance|low\s*balance|"?code"?\s*:\s*402|\b402\b/i,
  },
  {
    code: "quota_exceeded",
    label: "Daily sending quota reached",
    tone: "fixable",
    // The email side's version of an empty wallet. Distinct from a rate limit:
    // a quota resets tomorrow and means the plan is too small, a rate limit
    // resets in a second and means the fan-out is too fast.
    test: /quota|daily (email )?sending limit|monthly limit/i,
  },
  {
    code: "rate_limited",
    label: "Sent too fast for the provider",
    tone: "fixable",
    test: /too many requests|rate limit|429/i,
  },
  {
    code: "dnd",
    label: "Number on DND",
    tone: "fixable",
    // Deliberately NOT a bare /dnd/. sendSMSWithFallback labels each attempt
    // with the channel it used, so a failure that never involved DND at all
    // still reads "dnd: … | generic: …" — matching the bare word would file
    // every fallback failure on the book as a DND problem. Only Termii's
    // actual DND vocabulary counts.
    //
    // The promotional (`generic`) route is blocked for DND-registered numbers
    // while transactional traffic on `dnd` gets through, which is why the fix
    // is a route change rather than a retry.
    test: /dnd\s*(is\s*)?active|do\s*not\s*disturb|dnd[\s_-]*(rejected|blocked|reject)/i,
  },
  {
    code: "sender_id",
    label: "Sender ID not approved",
    tone: "fixable",
    test: /sender\s*id|senderid|not\s*approved|unregistered\s*sender/i,
  },
  {
    code: "not_configured",
    label: "SMS not configured",
    tone: "fixable",
    test: /api\s*key|not\s*configured|unauthori[sz]ed|"?code"?\s*:\s*401|\b401\b/i,
  },
  {
    code: "disabled",
    label: "SMS sending switched off",
    tone: "fixable",
    test: /sms_enabled\s*=\s*false|sending is disabled/i,
  },
  {
    code: "bad_number",
    label: "Not a reachable number",
    tone: "fixable",
    test: /invalid\s*(phone|number|msisdn|recipient)|undeliverable|unknown\s*subscriber|absent\s*subscriber|not\s*a\s*valid/i,
  },
  {
    code: "expired",
    label: "Handset never came online",
    tone: "external",
    // The carrier held it for its validity window and gave up. The number is
    // real and the route was fine — the phone was off or out of coverage.
    test: /expired|validity\s*period/i,
  },
  {
    code: "rejected",
    label: "Network refused it",
    tone: "external",
    test: /rejected|blocked|blacklist|spam/i,
  },
  {
    code: "provider_unreachable",
    label: "Could not reach Termii",
    tone: "external",
    test: /timeout|etimedout|econnreset|enotfound|socket hang up|network error|getaddrinfo/i,
  },
];

/**
 * One reason for one delivery row.
 *
 * Non-failures get a reason too, and deliberately: "why has this said `sent`
 * for two days?" is asked as often as "why did this fail", and the answer —
 * Termii took it and no carrier receipt has ever come back — is a real state
 * of the world, not an absence of one.
 *
 * @param {{status:string, channel?:string, error?:string|null, providerStatus?:string}} row
 * @returns {{code:string, label:string, tone:"good"|"fixable"|"external"|"expected"|"pending"}}
 */
function deliveryReason(row = {}) {
  const status = String(row.status || "");

  if (status === "delivered") {
    return { code: "delivered", label: "Delivered", tone: "good" };
  }
  if (status === "sent") {
    return { code: "awaiting_receipt", label: "No receipt back yet", tone: "pending" };
  }
  if (status === "pending") {
    return { code: "pending", label: "Not sent yet", tone: "pending" };
  }
  if (status === "suppressed") {
    return { code: "opted_out", label: "Opted out of messages", tone: "expected" };
  }
  if (status === "skipped") {
    // The one distinction worth drawing inside "skipped": nothing to send TO
    // is a gap in the book, whereas a deliberate skip is the engine working.
    const text = `${row.error || ""}`;
    if (/no (email|phone|number|address)|missing (email|phone|number)/i.test(text)) {
      return { code: "no_address", label: "No number on file", tone: "fixable" };
    }
    return { code: "skipped", label: "Skipped", tone: "expected" };
  }

  // Failures: the provider's own word first — it is the carrier's verdict and
  // more specific than our wrapper's — then the error text behind it.
  const haystack = `${row.providerStatus || ""} ${row.error || ""}`;
  for (const rule of RULES) {
    if (rule.test.test(haystack)) {
      return { code: rule.code, label: rule.label, tone: rule.tone };
    }
  }

  return { code: "other", label: "Refused by the provider", tone: "external" };
}

/**
 * The same mapping as a SQL expression, for grouping without loading rows.
 *
 * A summary over a month of sends is hundreds of thousands of rows; counting
 * them in Postgres and classifying in JS would mean shipping every one of them
 * to do it. The rules are duplicated here, which is a real cost — the two can
 * drift — so they are kept in the same file, in the same order, and the test
 * in tests/delivery-log.test.js asserts the two agree on every code.
 */
const REASON_SQL = `
  CASE
    WHEN nd.status = 'delivered' THEN 'delivered'
    WHEN nd.status = 'sent' THEN 'awaiting_receipt'
    WHEN nd.status = 'pending' THEN 'pending'
    WHEN nd.status = 'suppressed' THEN 'opted_out'
    WHEN nd.status = 'skipped' THEN
      CASE WHEN COALESCE(nd.error, '') ~* '(no (email|phone|number|address)|missing (email|phone|number))'
           THEN 'no_address' ELSE 'skipped' END
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(insufficient\\s*balance|low\\s*balance|"?code"?\\s*:\\s*402|\\m402\\M)' THEN 'no_credit'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(quota|daily (email )?sending limit|monthly limit)' THEN 'quota_exceeded'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(too many requests|rate limit|429)' THEN 'rate_limited'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(dnd\\s*(is\\s*)?active|do\\s*not\\s*disturb|dnd[\\s_-]*(rejected|blocked|reject))' THEN 'dnd'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(sender\\s*id|senderid|not\\s*approved|unregistered\\s*sender)' THEN 'sender_id'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(api\\s*key|not\\s*configured|unauthori[sz]ed|"?code"?\\s*:\\s*401|\\m401\\M)' THEN 'not_configured'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(sms_enabled\\s*=\\s*false|sending is disabled)' THEN 'disabled'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(invalid\\s*(phone|number|msisdn|recipient)|undeliverable|unknown\\s*subscriber|absent\\s*subscriber|not\\s*a\\s*valid)' THEN 'bad_number'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(expired|validity\\s*period)' THEN 'expired'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(rejected|blocked|blacklist|spam)' THEN 'rejected'
    WHEN COALESCE(nd.provider_status,'') || ' ' || COALESCE(nd.error,'') ~* '(timeout|etimedout|econnreset|enotfound|socket hang up|network error|getaddrinfo)' THEN 'provider_unreachable'
    ELSE 'other'
  END
`;

/** Every code this module can produce, with its label and tone. */
const REASON_CATALOG = {
  delivered: { label: "Delivered", tone: "good" },
  awaiting_receipt: { label: "No receipt back yet", tone: "pending" },
  pending: { label: "Not sent yet", tone: "pending" },
  opted_out: { label: "Opted out of messages", tone: "expected" },
  no_address: { label: "No number on file", tone: "fixable" },
  skipped: { label: "Skipped", tone: "expected" },
  ...Object.fromEntries(RULES.map((r) => [r.code, { label: r.label, tone: r.tone }])),
  other: { label: "Refused by the provider", tone: "external" },
};

module.exports = { deliveryReason, REASON_SQL, REASON_CATALOG, RULES };
