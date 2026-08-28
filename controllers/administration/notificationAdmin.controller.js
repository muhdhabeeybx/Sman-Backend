const asyncHandler = require("express-async-handler");
const { notificationDeliveryRepo, notificationRepo, messageCampaignRepo } = require("../../repositories");
const smsService = require("../../services/sms.service");
const { notifyAndWait } = require("../../notifications");
const { emitEvent } = require("../../services/events");
const { staffActor } = require("../../utils/actor");
const catalog = require("../../notifications/catalog");
const fcm = require("../../notifications/fcm");
const sse = require("../../notifications/sse");
const { runMaintenance } = require("../../notifications/worker");
const priceList = require("../../services/priceList.service");

/**
 * Admin-only notification operations: broadcasting, and seeing what the engine
 * actually did. Mounted behind verifyStaff (admin / super_admin), unlike the
 * per-principal endpoints in controllers/notification.controller.js which
 * every authenticated user reaches.
 */

/**
 * POST /api/notifications/broadcast — send an announcement.
 *
 * Audited through the event bus rather than by writing an audit row here: the
 * bus already feeds services/audit.service.js, so a broadcast is recorded on
 * the same trail as every other business action, with the actor attached.
 */
const broadcast = asyncHandler(async (req, res) => {
  const {
    title, audience, roles, customerIds, staffIds, contacts, channels, priority,
    actionUrl, imageUrl, depotIds, campaignId: existingCampaignId, audienceLabel,
  } = req.body;

  // Shortcodes resolve HERE, at send time, not when the template was written.
  // That is the whole point of a saved price template: "{{prices}}" typed once
  // in June has to carry August's prices, and a composer that resolved them on
  // save would send June's forever. A body with no "{{" is returned untouched,
  // so a message someone already resolved in the composer is not re-processed.
  const body = await priceList.render(req.body.body, { depotIds });

  // The closed set the schema validated. `customers` has no "all customers"
  // form on purpose — an unbounded blast to every customer on the platform is
  // not something one mistyped request should be able to do; it must be an
  // explicit list.
  let to;
  if (audience === "staff") to = { allStaff: true };
  else if (audience === "roles") to = { roles };
  else if (audience === "customers") to = (customerIds || []).map((id) => ({ customerId: id }));
  // Leads and other non-customers. No principal exists to address, so the
  // contact details go through directly — recipients.js resolves a bare
  // {name, email, phone} as "a contact with no account behind it", which is
  // exactly what these are.
  else if (audience === "contacts")
    to = (contacts || []).map((c) => ({ name: c.name, email: c.email, phone: c.phone }));
  else
    to = [
      ...(customerIds || []).map((id) => ({ customerId: id })),
      ...(staffIds || []).map((id) => ({ staffId: id })),
    ];

  const wantsSms = !channels || channels.includes("sms");

  /**
   * One campaign row for the whole press of Send — including the second call.
   *
   * "Everyone" is two audiences and the composer sends it as two requests
   * (customers by id, contacts by their details, resolved differently by the
   * engine). Both must land under ONE campaign or the log would show a single
   * blast as two, so the client passes the id back on the second call and only
   * the first opens a row.
   */
  let campaign = null;
  if (existingCampaignId) {
    campaign = { id: Number(existingCampaignId) };
  } else {
    // Read before anything is sent. Never blocking: getTermiiBalance swallows
    // its own failures, and a wallet we cannot read is not a reason to refuse
    // a broadcast — it is a reason to show a dash beside the compose box.
    const balance = wantsSms ? await smsService.getTermiiBalance() : { balance: null, currency: "" };
    campaign = await messageCampaignRepo.start({
      title,
      // The RESOLVED body: what recipients actually received. A campaign is a
      // record of what went out, and "{{prices}}" is not what went out.
      body,
      channels: channels || [],
      audience: audience || "",
      audienceLabel: audienceLabel || "",
      recipientCount: recipientTotal(to),
      smsSegments: Math.max(1, Math.ceil(String(body || "").length / 160)),
      balanceBefore: balance.balance === null ? null : String(balance.balance),
      balanceCurrency: balance.currency || "",
      sentBy: req.user?.id ?? null,
    });
  }

  const result = await notifyAndWait("system.announcement", {
    to,
    data: {
      title,
      body,
      priority,
      actionUrl,
      imageUrl,
      // Scopes the dedupe key to THIS broadcast, so two announcements with the
      // same wording both go out while a retried job does not double-send.
      announcementId: `${Date.now()}-${req.user.id}`,
    },
    channels,
    // Stamped onto every delivery row the fan-out produces, which is what
    // makes "show me this campaign's recipients" a query rather than a guess.
    campaignId: campaign?.id || null,
  });

  // Re-read after the fan-out. The difference is what this blast actually cost
  // according to Termii's own wallet, rather than an estimate that would drift
  // from the invoice.
  if (campaign?.id && !existingCampaignId) {
    const after = wantsSms ? await smsService.getTermiiBalance() : { balance: null };
    await messageCampaignRepo.complete(campaign.id, {
      balanceAfter: after.balance === null ? null : String(after.balance),
      recipientCount: result.recipients,
    });
  }

  emitEvent("notification.broadcast", {
    actor: staffActor(req),
    entityType: "notification",
    entityId: campaign?.id ? String(campaign.id) : "broadcast",
    audience,
    title,
    channels: channels || null,
    recipients: result.recipients,
  });

  res.json({
    success: true,
    message: `Broadcast sent to ${result.recipients} recipient(s)`,
    data: {
      campaignId: campaign?.id || null,
      recipients: result.recipients,
      delivered: result.delivered,
      duplicates: result.duplicates,
    },
  });
});

/** How many recipients a resolved `to` spec stands for. */
const recipientTotal = (to) => (Array.isArray(to) ? to.length : 1);

/**
 * GET /api/notifications/sms-balance — what is left in the Termii wallet.
 *
 * Cached for a minute. The messaging page reads this on load and again after
 * every send, and a live provider call per render would be both slow and rude
 * to an endpoint that exists to be a courtesy reading.
 *
 * 346 sends on the live book failed with "Insufficient balance" while the
 * dashboard showed nothing at all. This is the fix for that.
 */
let balanceCache = { at: 0, value: null };
const BALANCE_TTL_MS = 60_000;

const smsBalance = asyncHandler(async (req, res) => {
  const fresh = req.query.refresh === "true";
  if (!fresh && balanceCache.value && Date.now() - balanceCache.at < BALANCE_TTL_MS) {
    return res.json({ success: true, data: { ...balanceCache.value, cached: true } });
  }

  const result = await smsService.getTermiiBalance();
  balanceCache = { at: Date.now(), value: result };
  res.json({ success: true, data: { ...result, cached: false } });
});

/** GET /api/notifications/campaigns — every broadcast, newest first. */
const listCampaigns = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  res.json({ success: true, data: await messageCampaignRepo.findAll({ page, limit }) });
});

/** GET /api/notifications/campaigns/:id — one broadcast and how it landed. */
const getCampaign = asyncHandler(async (req, res) => {
  const campaign = await messageCampaignRepo.findById(req.params.id);
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }
  res.json({ success: true, data: { campaign } });
});

/** GET /api/notifications/deliveries — the outbound log, filterable. */
const listDeliveries = asyncHandler(async (req, res) => {
  const { channel, status, type, campaignId, from, to, search, page, limit } = req.query;
  const { rows, pagination } = await notificationDeliveryRepo.findAll({
    channel,
    status,
    type,
    campaignId,
    from,
    to,
    search,
    page,
    limit,
  });
  res.json({ success: true, data: { data: rows, pagination } });
});

/** GET /api/notifications/:id/deliveries — every channel attempt for one row. */
const deliveriesForNotification = asyncHandler(async (req, res) => {
  const rows = await notificationDeliveryRepo.findForNotification(req.params.id);
  res.json({ success: true, data: rows });
});

/**
 * GET /api/notifications/health — is the engine actually delivering?
 *
 * The per-channel success rates are the number worth alerting on: a Termii
 * outage shows up here as an SMS success rate collapsing, hours before anyone
 * files a support ticket about a missing confirmation.
 */
const health = asyncHandler(async (req, res) => {
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours) || 24));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const stats = await notificationDeliveryRepo.statsSince(since);

  res.json({
    success: true,
    data: {
      windowHours: hours,
      channels: stats,
      providers: {
        push: { configured: fcm.isConfigured(), enabled: fcm.isEnabled() },
        email: { configured: Boolean(process.env.RESEND_API_KEY), enabled: process.env.EMAIL_ENABLED !== "false" },
        sms: { configured: Boolean(process.env.TERMII_API_KEY), enabled: process.env.SMS_ENABLED !== "false" },
      },
      engine: {
        enabled: process.env.NOTIFICATIONS_ENABLED !== "false",
        queued: process.env.NOTIFY_QUEUE_ENABLED === "true",
        types: catalog.listTypes().length,
      },
      stream: sse.stats(),
    },
  });
});

/** GET /api/notifications/entity/:type/:id — everything ever sent about one order. */
const forEntity = asyncHandler(async (req, res) => {
  const rows = await notificationRepo.findByEntity(req.params.type, req.params.id, {
    limit: req.query.limit,
  });
  res.json({ success: true, data: rows });
});

/**
 * POST /api/notifications/maintenance/run — run the retention sweep now.
 *
 * The same code the nightly cron runs. Exposed manually because a deployment
 * that never enables the scheduler still needs a way to keep the tables in
 * check — the settlement and order-expiry routes follow the same pattern.
 */
const runMaintenanceNow = asyncHandler(async (req, res) => {
  const result = await runMaintenance();
  emitEvent("notification.maintenance_run", {
    actor: staffActor(req),
    entityType: "notification",
    entityId: "maintenance",
    ...result,
  });
  res.json({ success: true, message: "Maintenance sweep complete", data: result });
});

module.exports = {
  broadcast,
  smsBalance,
  listCampaigns,
  getCampaign,
  listDeliveries,
  deliveriesForNotification,
  health,
  forEntity,
  runMaintenanceNow,
};
