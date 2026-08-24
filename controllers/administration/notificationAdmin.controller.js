const asyncHandler = require("express-async-handler");
const { notificationDeliveryRepo, notificationRepo } = require("../../repositories");
const { notifyAndWait } = require("../../notifications");
const { emitEvent } = require("../../services/events");
const { staffActor } = require("../../utils/actor");
const catalog = require("../../notifications/catalog");
const fcm = require("../../notifications/fcm");
const sse = require("../../notifications/sse");
const { runMaintenance } = require("../../notifications/worker");

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
  const { title, body, audience, roles, customerIds, staffIds, contacts, channels, priority, actionUrl, imageUrl } =
    req.body;

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
  });

  emitEvent("notification.broadcast", {
    actor: staffActor(req),
    entityType: "notification",
    entityId: "broadcast",
    audience,
    title,
    channels: channels || null,
    recipients: result.recipients,
  });

  res.json({
    success: true,
    message: `Broadcast sent to ${result.recipients} recipient(s)`,
    data: {
      recipients: result.recipients,
      delivered: result.delivered,
      duplicates: result.duplicates,
    },
  });
});

/** GET /api/notifications/deliveries — the outbound log, filterable. */
const listDeliveries = asyncHandler(async (req, res) => {
  const { channel, status, type, page, limit } = req.query;
  const { rows, pagination } = await notificationDeliveryRepo.findAll({
    channel,
    status,
    type,
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
  listDeliveries,
  deliveriesForNotification,
  health,
  forEntity,
  runMaintenanceNow,
};
