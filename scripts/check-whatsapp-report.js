#!/usr/bin/env node
/**
 * What templates does this WABA actually have, and does the report match one?
 *
 * ── The confusion this exists to end ──────────────────────────────────────
 *
 * There are two WhatsApp flows on the same number, and they follow opposite
 * rules. Mixing them up is why "I set up a template" and "the report still
 * won't send" can both be true at once.
 *
 *   The ordering bot     replies to a customer who messaged US first. That is
 *                        inside Meta's 24-hour service window, where free-form
 *                        text is allowed. It needs NO template, and no template
 *                        you create can break it.
 *
 *   The daily report     goes to a manager who did NOT message us. It is
 *                        business-initiated and outside any window, so Meta
 *                        permits it ONLY as a template it has approved.
 *
 * So the report is the only thing that cares about templates, and it cares
 * about three things people rarely check together: the exact name, the exact
 * language code, and the number of {{n}} placeholders in the approved body.
 * Any one of them wrong rejects every recipient identically, which reads as
 * "cannot send to these numbers" and sends people off to check the numbers.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *
 *   railway run node scripts/check-whatsapp-report.js
 *
 * Run it where the credentials live — that is Railway, not your laptop.
 * Sends nothing. Exits non-zero when the report could not go out as configured.
 */
require("dotenv").config();

const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "");
const fingerprint = (v) => {
  const s = clean(v);
  return s ? `${s.slice(0, 6)}…${s.slice(-4)}  (${s.length} chars)` : "(unset)";
};

/** Mirrors services/whatsappReport.service.js — keep the two in step. */
const DEFAULT_PARAMS = ["date", "litres", "value", "orders", "locations"];

/** What each field puts in a parameter, so a body can be mapped by reading. */
const FIELDS = {
  date: "8 September 2026",
  litres: "6,287,366L",
  value: "₦7,983,674,013",
  orders: "33",
  locationCount: "5",
  headline: "6,287,366L sold · ₦7,983,674,013 · 33 orders across 5 locations",
  locations: "CALABAR: 2,131,000L / ₦2,708,440,000 · WARRI: 769,000L / ₦980,475,000 · …",
  trend: "12% up on 2026-09-07 (₦7,120,000,000)",
  summary: "the whole message on one line — do not pair it with `locations`, it already contains them",
};
const ALL_FIELDS = Object.keys(FIELDS);

/**
 * Bindings for the template shapes actually in use.
 *
 * Suggesting the first N of the five-field default instead would hand back
 * `date,litres,value` for a three-variable body — the right count and the
 * wrong meanings, which is worse than no suggestion because it looks correct.
 */
const SHAPES = {
  3: ["date", "headline", "locations"],
  4: ["date", "headline", "locations", "trend"],
  5: ["date", "litres", "value", "orders", "locations"],
};

const countPlaceholders = (text) =>
  new Set((String(text || "").match(/\{\{\s*\d+\s*\}\}/g) || []).map((m) => m.replace(/\D/g, ""))).size;

async function main() {
  const token = clean(process.env.WHATSAPP_ACCESS_TOKEN);
  const waba = clean(process.env.WHATSAPP_WABA_ID);
  const phoneId = clean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const enabled = clean(process.env.WHATSAPP_ENABLED) === "true";
  const version = String(process.env.WHATSAPP_GRAPH_VERSION || "v25.0").replace(/^v?/, "v");

  const wantName =
    process.env.WHATSAPP_REPORT_TEMPLATE === undefined
      ? "daily_sales_report"
      : clean(process.env.WHATSAPP_REPORT_TEMPLATE);
  const wantLang = clean(process.env.WHATSAPP_REPORT_TEMPLATE_LANG) || "en";
  const configuredParams = clean(process.env.WHATSAPP_REPORT_TEMPLATE_PARAMS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const params = configuredParams.length ? configuredParams : DEFAULT_PARAMS;

  console.log("\nwhatsapp report preflight\n");
  console.log(`  WHATSAPP_ENABLED                 ${enabled ? "true" : `${process.env.WHATSAPP_ENABLED || "(unset)"}  ← must be "true" to send`}`);
  console.log(`  WHATSAPP_ACCESS_TOKEN            ${fingerprint(token)}`);
  console.log(`  WHATSAPP_WABA_ID                 ${waba || "(unset)"}`);
  console.log(`  WHATSAPP_PHONE_NUMBER_ID         ${phoneId || "(unset)"}`);
  console.log(`  WHATSAPP_REPORT_TEMPLATE         ${wantName || "(empty — plain text mode)"}`);
  console.log(`  WHATSAPP_REPORT_TEMPLATE_LANG    ${wantLang}`);
  console.log(
    `  WHATSAPP_REPORT_TEMPLATE_PARAMS  ${params.join(", ")}  (${params.length})${
      configuredParams.length ? "" : "  ← default, env unset"
    }\n`
  );

  const bad = params.filter((p) => !ALL_FIELDS.includes(p));
  if (bad.length) {
    console.log(`  [FAIL] unknown field name(s) in WHATSAPP_REPORT_TEMPLATE_PARAMS: ${bad.join(", ")}`);
    console.log(`         valid fields: ${ALL_FIELDS.join(", ")}`);
    console.log("         An unknown name sends an empty parameter, which Meta rejects.\n");
    process.exitCode = 1;
  }

  if (!wantName) {
    console.log("  Plain-text mode (WHATSAPP_REPORT_TEMPLATE is empty).");
    console.log("  This only reaches somebody who messaged the bot in the last 24 hours.");
    console.log("  Fine for testing, wrong for managers who never message in.\n");
    return;
  }

  if (!token || !waba) {
    console.log("  [FAIL] cannot read templates — " + (!token ? "WHATSAPP_ACCESS_TOKEN" : "WHATSAPP_WABA_ID") + " is unset.");
    console.log("         Without this the app cannot check the template before sending, so a");
    console.log("         mismatch comes back from Meta as an opaque per-recipient error.\n");
    process.exitCode = 1;
    return;
  }

  // ── Every template on the account, not just the one we want ──────────────
  let templates;
  try {
    const url = `https://graph.facebook.com/${version}/${waba}/message_templates?limit=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();

    if (!res.ok || json.error) {
      const e = json.error || {};
      console.log(`  [FAIL] Meta refused the request: ${e.message || res.status}`);
      if (/permission|scope|OAuth/i.test(`${e.message} ${e.type}`)) {
        console.log("         This is the token's scope, not the WABA id. Reading templates needs");
        console.log("         whatsapp_business_management; sending only needs");
        console.log("         whatsapp_business_messaging, which is why the ordering bot still works.");
      }
      console.log("");
      process.exitCode = 1;
      return;
    }
    templates = json.data || [];
  } catch (err) {
    console.log(`  [FAIL] could not reach Meta: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (!templates.length) {
    console.log("  [FAIL] this WABA has no message templates at all.");
    console.log("         If you created one, it was created on a DIFFERENT WhatsApp Business");
    console.log(`         Account than ${waba}. That is the commonest version of this problem.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`  templates on WABA ${waba}:\n`);
  for (const t of templates) {
    const body = (t.components || []).find((c) => String(c.type).toUpperCase() === "BODY");
    const n = countPlaceholders(body?.text);
    const mark = t.name === wantName ? "→" : " ";
    console.log(`   ${mark} ${t.name}  [${t.language}]  ${t.status}  —  ${n} parameter${n === 1 ? "" : "s"}`);
  }
  console.log("");

  // ── The one we are configured to send ────────────────────────────────────
  const byName = templates.filter((t) => t.name === wantName);
  if (!byName.length) {
    console.log(`  [FAIL] no template named "${wantName}" on this account.`);
    console.log(`         Either rename it in Meta to "${wantName}", or set`);
    console.log(`         WHATSAPP_REPORT_TEMPLATE to one of the names listed above.\n`);
    process.exitCode = 1;
    return;
  }

  const exact = byName.find((t) => t.language === wantLang);
  if (!exact) {
    const langs = byName.map((t) => t.language);
    console.log(`  [FAIL] "${wantName}" exists, but not in language "${wantLang}".`);
    console.log(`         Meta has it as: ${langs.join(", ")}`);
    console.log(`         Meta treats name+language as the identity, so this rejects every`);
    console.log(`         recipient with error 132001 — which reads as a problem with the numbers.`);
    console.log(`\n         fix:  WHATSAPP_REPORT_TEMPLATE_LANG = ${langs[0]}\n`);
    process.exitCode = 1;
    return;
  }

  const body = (exact.components || []).find((c) => String(c.type).toUpperCase() === "BODY");
  const expects = countPlaceholders(body?.text);
  const header = (exact.components || []).find(
    (c) => String(c.type).toUpperCase() === "HEADER" && /\{\{\s*\d+\s*\}\}/.test(c.text || "")
  );

  console.log(`  approved body for ${exact.name} [${exact.language}]:\n`);
  console.log(
    String(body?.text || "(no body component)")
      .split("\n")
      .map((l) => `      ${l}`)
      .join("\n")
  );
  console.log("");

  let failed = false;

  if (exact.status !== "APPROVED") {
    console.log(`  [FAIL] status is ${exact.status}, not APPROVED. Meta will not deliver it.`);
    if (exact.status === "REJECTED") {
      console.log("         Edit and resubmit in WhatsApp Manager; rejection reasons show there.");
    }
    failed = true;
  }

  if (header) {
    console.log("  [WARN] the header carries its own {{n}} variable.");
    console.log("         This sender only fills body parameters, so Meta will reject the send.");
    console.log("         Remove the header variable, or make the header static text.");
    failed = true;
  }

  if (expects !== params.length) {
    console.log(`  [FAIL] the approved body takes ${expects} parameter${expects === 1 ? "" : "s"}, this sends ${params.length}.`);
    console.log(`         Meta rejects the whole message with error 132000 and does not say what it wanted.`);
    if (SHAPES[expects]) {
      console.log(`\n         fix:  WHATSAPP_REPORT_TEMPLATE_PARAMS = ${SHAPES[expects].join(",")}`);
    }
    console.log(`\n         Read the body above and pick ${expects} field${expects === 1 ? "" : "s"}, in the order its`);
    console.log(`         {{n}} appear. Each produces one line:\n`);
    for (const [name, sample] of Object.entries(FIELDS)) {
      console.log(`           ${name.padEnd(14)} ${sample}`);
    }
    failed = true;
  }

  if (!failed) {
    console.log(`  [PASS] "${exact.name}" [${exact.language}] is APPROVED and takes ${expects} parameters — matching what is configured.`);
    if (!enabled) {
      console.log(`  [WARN] but WHATSAPP_ENABLED is not "true", so nothing will actually send.`);
    }
  }

  console.log("");
  if (failed) process.exitCode = 1;
}

main();
