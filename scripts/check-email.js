#!/usr/bin/env node
/**
 * Does this environment's email configuration actually work?
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Every report send for a week failed with:
 *
 *   "The soromannl.com domain is not verified. Please, add and verify your
 *    domain on https://resend.com/domains"
 *
 * The domain WAS verified. The message was true for the key that sent it and
 * false for the account anybody checked, because production and local were
 * carrying different RESEND_API_KEYs — and the error names the domain, which
 * is the one thing that was fine, so it sent everyone to the wrong page.
 *
 * The failing pair is (key, sender domain), and neither half is wrong on its
 * own. Nothing checked them TOGETHER, so the answer sat in
 * notification_deliveries where nobody was looking. This checks them together,
 * against the live account, without sending anything.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   node scripts/check-email.js        this machine's .env
 *
 * Run it on the box you doubt. It reads the same process.env the app does, so
 * on Railway (`railway run node scripts/check-email.js`, or a one-off shell)
 * it reports on production rather than on your laptop — which is the whole
 * point, since the two disagreeing is what caused this.
 *
 * Exits non-zero if mail cannot go out, so it can gate a deploy.
 */
require("dotenv").config();

/** Never print a credential. Enough to compare two environments, and no more. */
const fingerprint = (key) => {
  const k = String(key || "").trim();
  if (!k) return "(unset)";
  return `${k.slice(0, 9)}…${k.slice(-4)}  (${k.length} chars)`;
};

/** "Soroman Energy <orders@soromannl.com>" → "soromannl.com" */
const senderDomain = (from) => {
  const m = String(from || "").match(/<?([^\s<>@]+)@([^\s<>]+?)>?$/);
  return m ? m[2].toLowerCase() : null;
};

const results = [];
const ok = (name, detail) => results.push({ level: "ok", name, detail });
const warn = (name, detail, fix) => results.push({ level: "warn", name, detail, fix });
const fail = (name, detail, fix) => results.push({ level: "fail", name, detail, fix });

async function main() {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.EMAIL_FROM || "").trim();
  const enabled = process.env.EMAIL_ENABLED;

  console.log(`\nemail preflight — NODE_ENV=${process.env.NODE_ENV || "(unset)"}\n`);
  console.log(`  RESEND_API_KEY  ${fingerprint(key)}`);
  console.log(`  EMAIL_FROM      ${from || "(unset)"}`);
  console.log(`  EMAIL_ENABLED   ${enabled === undefined ? "(unset — sending is ON)" : enabled}\n`);

  // ── The kill switch, checked first: everything below is moot if it is off ──
  if (enabled === "false") {
    warn(
      "sending is switched off",
      "EMAIL_ENABLED=false — email.service and the notification engine will log and skip every send.",
      "Unset EMAIL_ENABLED (or set it to true) on any environment that should actually send."
    );
  }

  if (!key) {
    fail(
      "no API key",
      "RESEND_API_KEY is unset, so emailEnabled() is false and every send is skipped silently.",
      "Set RESEND_API_KEY to the key for the Resend account that owns your sending domain."
    );
    return report();
  }

  // ── What this key's account can actually send as ─────────────────────────
  let domains;
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401 || res.status === 403) {
      fail(
        "the API key is rejected",
        `Resend answered ${res.status} — the key is revoked, mistyped, or from a deleted account.`,
        "Issue a fresh key at https://resend.com/api-keys and set RESEND_API_KEY to it."
      );
      return report();
    }
    if (!res.ok) {
      fail("cannot reach Resend", `GET /domains answered ${res.status}.`, "Retry; if it persists check https://resend-status.com.");
      return report();
    }
    domains = (await res.json()).data || [];
    ok("the API key works", `Resend accepted it.`);
  } catch (err) {
    fail("cannot reach Resend", err.message, "Check outbound network access from this environment.");
    return report();
  }

  const verified = domains.filter((d) => d.status === "verified");
  console.log(`  this key's account owns ${domains.length} domain${domains.length === 1 ? "" : "s"}:`);
  for (const d of domains) {
    const sending = d.capabilities?.sending || "unknown";
    console.log(`    ${d.name}  —  ${d.status}, sending ${sending}${d.region ? `, ${d.region}` : ""}`);
  }
  console.log("");

  // ── The check that was missing: the sender against THIS key's account ─────
  if (!from) {
    warn(
      "no sender configured",
      "EMAIL_FROM is unset, so sends fall back to 'Soroman Dashboard <onboarding@resend.dev>'. " +
        "That address works without any domain, but Resend only delivers it to the account owner's " +
        "own address — so it looks fine in testing and reaches no customer.",
      "Set EMAIL_FROM to an address on a verified domain before this environment mails anyone real."
    );
    return report();
  }

  const domain = senderDomain(from);
  if (!domain) {
    fail("EMAIL_FROM is not a valid address", `Could not read a domain out of ${from}.`, 'Use the form: Name <user@domain.com>');
    return report();
  }

  if (domain === "resend.dev") {
    warn(
      "sending as resend.dev",
      "onboarding@resend.dev only delivers to the Resend account owner's own address.",
      "Set EMAIL_FROM to an address on a verified domain."
    );
    return report();
  }

  const match = domains.find((d) => d.name.toLowerCase() === domain);
  if (!match) {
    fail(
      "the sender domain is not on this key's account",
      `EMAIL_FROM sends as @${domain}, but this key's account owns ${
        domains.length ? domains.map((d) => d.name).join(", ") : "no domains at all"
      }. Every send fails with "The ${domain} domain is not verified" — which is misleading: the domain may well be verified, just on a DIFFERENT Resend account. This is the production-vs-local key mismatch that hid for a week.`,
      `Either point RESEND_API_KEY at the account that owns ${domain}, or add ${domain} to this one. Compare the key fingerprint above between environments — they should match.`
    );
    return report();
  }

  if (match.status !== "verified") {
    fail(
      "the sender domain is not verified",
      `${domain} is on this account but its status is "${match.status}".`,
      `Finish DNS verification at https://resend.com/domains — then re-run this.`
    );
    return report();
  }

  if (match.capabilities && match.capabilities.sending !== "enabled") {
    fail(
      "sending is disabled for the domain",
      `${domain} is verified but sending is "${match.capabilities.sending}".`,
      "Re-enable sending for the domain in the Resend dashboard."
    );
    return report();
  }

  ok("the sender matches the key", `${from} sends as @${domain}, verified on this key's account.`);
  return report();
}

function report() {
  const failed = results.filter((r) => r.level === "fail");
  const warned = results.filter((r) => r.level === "warn");

  for (const r of results) {
    const mark = r.level === "ok" ? "PASS" : r.level === "warn" ? "WARN" : "FAIL";
    console.log(`  [${mark}] ${r.name}`);
    if (r.detail) console.log(`         ${r.detail}`);
    if (r.fix) console.log(`         fix: ${r.fix}`);
  }

  console.log("");
  if (failed.length) {
    console.log(`email CANNOT go out of this environment — ${failed.length} blocking problem${failed.length === 1 ? "" : "s"}.`);
    process.exitCode = 1;
  } else if (warned.length) {
    console.log("email can go out, with caveats above.");
  } else {
    console.log("email configuration is sound.");
  }
}

main();
