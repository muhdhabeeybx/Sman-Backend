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

/**
 * The template is missing here — so where is it, and where does the bot send from?
 *
 * "No template by that name" is true and useless on its own: the next question
 * is always which WhatsApp Business Account to point at instead, and that is
 * not something anybody can read off the Meta UI without knowing where to look.
 * The token knows. debug_token lists the WABAs it was granted, so the candidates
 * are enumerable rather than guessable.
 *
 * Two facts settle it. The WABA that owns WHATSAPP_PHONE_NUMBER_ID is the one
 * the bot actually sends from; the WABA that owns the template is where the
 * template was built. They must be the SAME account — Meta will not let a
 * number send a template belonging to another WABA — so if they differ, the
 * template was built in the wrong place and no env var can fix it.
 */
const graph = async (version, path, token, params = "") => {
  const res = await fetch(`https://graph.facebook.com/${version}/${path}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return json.error ? null : json;
};

async function findTheRightWaba({ token, version, waba, phoneId, wantName }) {
  console.log("  looking for where that template and that phone number actually live…\n");

  /**
   * First, the question that needs no discovery: does the configured WABA own
   * the number the bot sends from?
   *
   * If it does, the account is right and the template simply is not on it —
   * which means it was built somewhere else, or never finished being created.
   * That is a completely different instruction from "point at another WABA",
   * and it is answerable with one call instead of an enumeration that a System
   * User token may refuse to provide.
   */
  const nums = await graph(version, `${waba}/phone_numbers`, token, "limit=50");
  if (nums) {
    const rows = nums.data || [];
    const owns = rows.some((n) => String(n.id) === String(phoneId));
    console.log(`         numbers on WABA ${waba}: ${
      rows.length ? rows.map((n) => `${n.display_phone_number || n.id}${String(n.id) === String(phoneId) ? " ←" : ""}`).join(", ") : "none"
    }`);

    if (owns) {
      console.log("");
      console.log(`  →  this IS the right account — it owns the number the bot sends from.`);
      console.log(`         So "${wantName}" was never created here. Whatever you built is on another`);
      console.log(`         account, or was not submitted. Create it on THIS WABA (${waba}):`);
      console.log("");
      console.log(`           name      ${wantName}`);
      console.log(`           category  Utility`);
      console.log(`           body      3 variables — date, the one-line summary, the breakdown`);
      console.log("");
      console.log("         A template belongs to one WABA and cannot be shared, moved, or sent");
      console.log("         by a number on a different account, so recreating it here is the fix.\n");
      return;
    }
    console.log(`         …but not ${phoneId}, the number configured to send.\n`);
  }

  /**
   * The configured WABA is not the sender's, so find the one that is.
   *
   * debug_token exposes granular scopes for user tokens; a System User token
   * often returns none, so /me/businesses is tried after it rather than
   * instead — between them they cover both token types.
   */
  const candidates = new Set();

  const dbg = await graph(version, "debug_token", token, `input_token=${encodeURIComponent(token)}`);
  for (const s of dbg?.data?.granular_scopes || []) for (const id of s.target_ids || []) candidates.add(id);

  const businesses = await graph(version, "me/businesses", token, "limit=50");
  for (const b of businesses?.data || []) {
    for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
      const owned = await graph(version, `${b.id}/${edge}`, token, "limit=50");
      for (const w of owned?.data || []) candidates.add(w.id);
    }
  }
  candidates.delete(waba);

  if (!candidates.size) {
    console.log("         The token will not list any other WABA, so the search stops here.");
    console.log("         Read the id straight from Meta instead: WhatsApp Manager → Account tools →");
    console.log("         Message templates, click the template, and the WABA id is in the URL.\n");
    return;
  }

  let ownsNumber = null;
  let ownsTemplate = null;

  for (const id of candidates) {
    const info = await graph(version, id, token, "fields=id,name");
    const tpl = await graph(version, `${id}/message_templates`, token, "limit=100");
    const n = await graph(version, `${id}/phone_numbers`, token, "limit=50");

    const names = (tpl?.data || []).map((t) => t.name);
    const hasNumber = (n?.data || []).some((x) => String(x.id) === String(phoneId));
    if (hasNumber) ownsNumber = id;
    if (names.includes(wantName)) ownsTemplate = id;

    console.log(`         WABA ${id}${info?.name ? `  (${info.name})` : ""}`);
    console.log(`           templates : ${names.length ? names.join(", ") : "none"}`);
    console.log(`           numbers   : ${(n?.data || []).map((x) => x.display_phone_number || x.id).join(", ") || "none"}${hasNumber ? "   ← the bot sends from here" : ""}`);
    console.log("");
  }

  if (ownsTemplate && ownsNumber && ownsTemplate === ownsNumber) {
    console.log(`  ✅ fix:  WHATSAPP_WABA_ID = ${ownsTemplate}`);
    console.log(`          That account owns both "${wantName}" and the sending number.\n`);
  } else if (ownsTemplate && ownsNumber) {
    console.log(`  ⚠  "${wantName}" is on WABA ${ownsTemplate}, but the bot sends from WABA ${ownsNumber}.`);
    console.log("         Meta will not let a number send a template owned by another account, so no");
    console.log(`         env var fixes this — the template has to be created on ${ownsNumber}.\n`);
  } else if (ownsNumber) {
    console.log(`  →  the bot sends from WABA ${ownsNumber}, and "${wantName}" is not on it.`);
    console.log(`         Set WHATSAPP_WABA_ID = ${ownsNumber} and create the template there.\n`);
  } else {
    console.log(`  →  no WABA the token can see owns phone number id ${phoneId}.`);
    console.log("         Read the id from WhatsApp Manager: click the template, it is in the URL.\n");
  }
}

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
    await findTheRightWaba({ token, version, waba, phoneId, wantName });
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
    await findTheRightWaba({ token, version, waba, phoneId, wantName });
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
