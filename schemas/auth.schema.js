const z = require("zod");
const { id, requiredString, optionalString } = require("./fields");

/**
 * Auth schemas — staff and customer realms.
 *
 * These endpoints are unauthenticated, so they are the most exposed surface in
 * the API and the one place where validation is not merely hygiene.
 *
 * Two deliberate restraints, because tightening the wrong thing here breaks a
 * security property rather than improving one:
 *
 * 1. NO email-format check on login. `/auth/login` must answer identically for
 *    a wrong password and an unknown account. If a malformed address returned
 *    400 while a well-formed unknown one returned 401, the difference between
 *    those responses would be a signal. Presence and length only.
 *
 * 2. NO phone-format check on the OTP endpoints. `request-otp` answers with the
 *    same generic 200 whether the number is registered, unregistered or
 *    unparseable, and that uniformity is the whole enumeration defence. A
 *    schema rejecting a malformed number with 400 would carve a third response
 *    out of it. `toE164` in the controller stays the single authority on what a
 *    phone number is.
 */

// --- staff ---------------------------------------------------------------

const login = z.object({
  email: requiredString("Email address", 255),
  password: requiredString("Password", 200),
});

const refresh = z.object({
  // Optional: with cookie transport the token arrives in an httpOnly cookie
  // and the body is legitimately empty. The controller resolves which.
  refreshToken: z
    .string({ error: "Refresh token must be text" })
    .trim()
    .min(1, "Refresh token cannot be empty")
    .max(200, "Refresh token is not valid")
    .optional(),
});

const setPassword = z.object({
  token: requiredString("Reset token", 200),
  password: z
    .string({ error: (iss) => (iss.input === undefined ? "Password is required" : "Password must be text") })
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password must be 200 characters or fewer"),
});

const forgotPassword = z.object({
  email: requiredString("Email address", 255),
});

const sessionIdParam = z.object({ id: id("Session id") });

// --- customer portal -----------------------------------------------------

const register = z.object({
  phone: requiredString("Phone number", 30),
  name: requiredString("Name", 255),
  // Optional at the schema so existing clients keep working; the mobile app
  // requires it at the form. Stored on the customer so email + PIN sign-in has
  // an identifier to resolve against.
  email: z
    .string({ error: "Email must be text" })
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(255, "Email must be 255 characters or fewer")
    .optional(),
  companyName: z
    .string({ error: "Company name must be text" })
    .trim()
    .max(255, "Company name must be 255 characters or fewer")
    .optional(),
  turnstileToken: z.string().max(4096, "Verification token is not valid").optional(),
});

const requestOtp = z.object({
  phone: requiredString("Phone number", 30),
});

const verifyOtp = z.object({
  phone: requiredString("Phone number", 30),
  // Length-bounded but not format-checked: a wrong-shaped code must fail the
  // same way a wrong code does, through the attempt-capped comparison, not
  // with a distinguishable 400.
  code: z
    .string({ error: (iss) => (iss.input === undefined ? "Verification code is required" : "Verification code must be text") })
    .trim()
    .min(1, "Verification code is required")
    .max(10, "Verification code is not valid"),
  // Optional: remember this device so a later PIN login can skip the OTP. The
  // OTP just proved phone possession, which is the same factor a trusted
  // device stands in for — so trusting off a verified OTP is sound.
  trustDevice: z.boolean().optional(),
  deviceName: optionalString("Device name", 255),
});

// Account deletion re-proves phone control with a purpose-scoped OTP (not a
// typed "DELETE" string). Same length bounds as verifyOtp.code.
const deleteAccount = z.object({
  code: z
    .string({ error: (iss) => (iss.input === undefined ? "Verification code is required" : "Verification code must be text") })
    .trim()
    .min(1, "Verification code is required")
    .max(10, "Verification code is not valid"),
});

module.exports = {
  login, refresh, setPassword, forgotPassword, sessionIdParam,
  register, requestOtp, verifyOtp, deleteAccount,
};
