const { z } = require("zod");

const phoneSchema = z.string().min(1, "Phone number is required").max(20);
const emailSchema = z.string().email("Invalid email").max(320);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);
const pinSchema = z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits");

const setPasswordSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const passwordLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  deviceToken: z.string().max(200).optional(),
});

const passwordStepUpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().min(1).max(10),
  trustDevice: z.boolean().optional(),
  deviceName: z.string().max(255).optional(),
});

const setPinSchema = z.object({ pin: pinSchema });

// Mobile's OTP-free sign-up: the PIN is set at registration and is what
// activates the account, so every field the customer row needs is required here
// (an account created this way must be immediately usable for ordering).
const pinRegisterSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(255),
  phone: phoneSchema,
  email: emailSchema,
  companyName: z.string().trim().max(255).optional(),
  pin: pinSchema,
  turnstileToken: z.string().max(5000).optional(),
});

const pinLoginSchema = z
  .object({
    // Either identifier resolves the same account. Both optional at the field
    // level so the refine below can emit one clear message instead of two.
    phone: phoneSchema.optional(),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255).optional(),
    pin: z.string().min(1).max(6),
    // Optional since the mobile app signs in with a PIN alone (no OTP step to
    // mint a trusted-device token). The web still sends one and still gets the
    // stronger device-bound check — see handlePinLogin.
    deviceToken: z.string().min(1).max(200).optional(),
  })
  .refine((v) => Boolean(v.phone || v.email), {
    message: "Enter your phone number or email address",
    path: ["phone"],
  });

const providerParamSchema = z.object({
  provider: z.enum(["google", "apple"]),
});

const providerLoginSchema = z.object({
  idToken: z.string().min(1, "idToken is required").max(8000),
});

const providerRegisterSchema = z.object({
  registrationToken: z.string().min(1).max(8000),
  phone: phoneSchema,
  name: z.string().max(200).optional(),
});

const deviceIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const passkeyRegisterVerifySchema = z.object({
  credential: z.record(z.any()),
  deviceName: z.string().max(255).optional(),
});

const passkeyLoginVerifySchema = z.object({
  credential: z.record(z.any()),
});

module.exports = {
  setPasswordSchema,
  passwordLoginSchema,
  passwordStepUpVerifySchema,
  setPinSchema,
  pinRegisterSchema,
  pinLoginSchema,
  providerParamSchema,
  providerLoginSchema,
  providerRegisterSchema,
  deviceIdParamSchema,
  passkeyRegisterVerifySchema,
  passkeyLoginVerifySchema,
};
