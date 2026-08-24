const z = require("zod");
const { pagination, id, enumOf, requiredString, optionalString } = require("./fields");

/**
 * Validation for the notification API.
 *
 * The category and channel lists are derived from the database enums rather
 * than retyped, so adding a category is one edit in db/schema/enums.js and not
 * a hunt for the copy that drifted.
 */
const { notificationCategoryEnum, deviceTokenPlatformEnum } = require("../db/schema/enums");

const CATEGORIES = notificationCategoryEnum.enumValues;
const PLATFORMS = deviceTokenPlatformEnum.enumValues;

/** Zod coerces "true"/"false" query strings; JSON bodies send real booleans. */
const booleanish = (label) =>
  z
    .union([z.boolean(), z.enum(["true", "false"])], {
      error: (iss) => (iss.input === undefined ? `${label} is required` : `${label} must be true or false`),
    })
    .transform((v) => v === true || v === "true");

// ─── Inbox ──────────────────────────────────────────────────────────────────

const listNotifications = pagination.extend({
  // `limit` is tightened from the shared default of 500: an inbox page is a
  // scrolling list, and 500 rows of jsonb is a slow response nobody reads.
  limit: z
    .union([z.number(), z.string()])
    .optional()
    .default(20)
    .transform((v) => Math.min(100, Math.max(1, parseInt(v) || 20))),
  category: z.enum([...CATEGORIES, "all"], {
    error: () => `Category must be one of: ${[...CATEGORIES, "all"].join(", ")}`,
  }).optional(),
  type: z.string().trim().max(64, "Type is too long").optional(),
  unreadOnly: booleanish("unreadOnly").optional().default(false),
  includeArchived: booleanish("includeArchived").optional().default(false),
});

const notificationIdParam = z.object({ id: id("Notification id") });

const markAllRead = z.object({
  category: z.enum([...CATEGORIES, "all"]).optional(),
  ids: z.array(id("Notification id")).max(500, "Too many ids in one request").optional(),
});

// ─── Preferences ────────────────────────────────────────────────────────────

const categoryPreference = z.object({
  category: enumOf("Category", CATEGORIES),
  inApp: z.boolean().optional(),
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
});

const updatePreferences = z
  .object({
    preferences: z.array(categoryPreference).max(CATEGORIES.length, "Too many categories").optional(),
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    quietHoursEnabled: z.boolean().optional(),
    // Minutes past midnight. 1439 is 23:59 — 1440 would be the next day.
    quietHoursStart: z.number().int().min(0).max(1439, "Quiet hours start must be between 0 and 1439").optional(),
    quietHoursEnd: z.number().int().min(0).max(1439, "Quiet hours end must be between 0 and 1439").optional(),
    timezone: z
      .string()
      .trim()
      .max(64, "Timezone is too long")
      // Validated against the runtime's own tz database rather than a regex:
      // a plausible-looking but unknown zone would otherwise be stored and
      // then silently disable quiet hours at send time.
      .refine((tz) => {
        if (!tz) return true;
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "Timezone must be a valid IANA timezone, e.g. Africa/Lagos")
      .optional(),
    locale: optionalString("Locale", 16).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No changes supplied");

const resetPreferences = z.object({
  category: enumOf("Category", CATEGORIES).optional(),
});

// ─── Device tokens ──────────────────────────────────────────────────────────

const registerDevice = z.object({
  // FCM tokens run ~163 chars today but the length is not contractual, so the
  // bound is generous rather than exact.
  token: requiredString("Device token", 4096),
  platform: enumOf("Platform", PLATFORMS),
  provider: z.enum(["fcm"], { error: () => "Provider must be fcm" }).optional().default("fcm"),
  deviceId: optionalString("Device id", 128),
  deviceName: optionalString("Device name", 255),
  appVersion: optionalString("App version", 32),
  locale: optionalString("Locale", 16),
  timezone: optionalString("Timezone", 64),
});

const unregisterDevice = z.object({
  token: requiredString("Device token", 4096),
});

// ─── Admin ──────────────────────────────────────────────────────────────────

const listDeliveries = pagination.extend({
  channel: z.enum(["in_app", "push", "email", "sms", "whatsapp", "all"]).optional(),
  status: z.enum(["pending", "sent", "delivered", "failed", "skipped", "suppressed", "all"]).optional(),
  type: z.string().trim().max(64, "Type is too long").optional(),
});

/**
 * The admin broadcast. Recipients are an explicit, closed union — an operator
 * must say who they mean, and "everyone" has to be typed out rather than
 * arrived at by omitting a filter.
 */
const broadcast = z
  .object({
    title: requiredString("Title", 200),
    body: requiredString("Message", 2000),
    audience: enumOf("Audience", ["staff", "customers", "roles", "specific", "contacts"]),
    roles: z.array(z.string().trim().max(50)).max(30, "Too many roles").optional(),
    customerIds: z.array(id("Customer id")).max(1000, "Too many recipients in one broadcast").optional(),
    staffIds: z.array(id("Staff id")).max(1000, "Too many recipients in one broadcast").optional(),
    // Leads and other non-customers. They have no principal to address, so
    // the recipient is the contact details themselves — a shape the engine
    // already resolves (see notifications/recipients.js, "a contact with no
    // account behind it"). Sent as values rather than ids so the broadcast
    // path does not have to grow a second database lookup, and so a recipient
    // list assembled on the page is exactly what goes out.
    contacts: z
      .array(
        z.object({
          name: optionalString("Name", 255),
          email: optionalString("Email", 255),
          phone: optionalString("Phone", 30),
        })
      )
      .max(1000, "Too many recipients in one broadcast")
      .optional(),
    channels: z
      .array(z.enum(["in_app", "push", "email", "sms"]))
      .min(1, "Choose at least one channel")
      .optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
    actionUrl: z.string().trim().url("Action URL must be a valid URL").max(2000).optional(),
    imageUrl: z.string().trim().url("Image URL must be a valid URL").max(2000).optional(),
  })
  .refine(
    (v) => v.audience !== "roles" || (v.roles?.length ?? 0) > 0,
    { message: "Select at least one role", path: ["roles"] }
  )
  .refine(
    (v) => v.audience !== "specific" || (v.customerIds?.length ?? 0) + (v.staffIds?.length ?? 0) > 0,
    { message: "Select at least one recipient", path: ["customerIds"] }
  )
  .refine(
    (v) => v.audience !== "contacts" || (v.contacts?.length ?? 0) > 0,
    { message: "Select at least one contact", path: ["contacts"] }
  )
  .refine(
    // A contact with neither an email nor a phone cannot be reached on any
    // channel; letting it through would report a recipient that was never
    // addressed.
    (v) => v.audience !== "contacts" || (v.contacts ?? []).every((c) => c.email || c.phone),
    { message: "Every contact needs an email address or a phone number", path: ["contacts"] }
  );

/** The "does push actually work on my handset" button. */
const sendTest = z.object({
  channels: z.array(z.enum(["in_app", "push", "email", "sms"])).min(1).optional(),
  title: optionalString("Title", 200),
  body: optionalString("Message", 2000),
});

module.exports = {
  CATEGORIES,
  PLATFORMS,
  listNotifications,
  notificationIdParam,
  markAllRead,
  updatePreferences,
  resetPreferences,
  registerDevice,
  unregisterDevice,
  listDeliveries,
  broadcast,
  sendTest,
};
