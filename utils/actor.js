/**
 * The acting principal for audit/event attribution, from verifyStaff's
 * req.user.
 *
 * The name, falling back to the email. This used to be the email outright,
 * on the grounds that it was "what the token has" — but verifyStaff loads the
 * whole staff row to check the session, so the name was there all along and
 * simply was not carried onto req.user. Everything written through here
 * recorded an address where a person's name belonged, and a daily report puts
 * that straight on screen in its Staff column.
 *
 * The email stays as the fallback: an actor with no name recorded is better
 * attributed by address than by an empty string.
 */
const staffActor = (req) => ({
  type: "staff",
  id: req.user?.id || null,
  name: req.user?.name || req.user?.email || "",
});

module.exports = { staffActor };
