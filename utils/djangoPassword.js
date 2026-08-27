const crypto = require("crypto");

/**
 * Verifies Django's default password hash format against soroman_db's
 * administration_user.password. Django's AUTH_PASSWORD_HASHERS is unset
 * (soroman_backend/settings.py), so it falls back to the default list, whose
 * first entry — PBKDF2PasswordHasher — is what encodes every real password.
 *
 * Encoded format: `pbkdf2_sha256$<iterations>$<salt>$<base64 hash>`. The
 * iteration count is read from the hash itself, not hardcoded, since it can
 * differ across users hashed under different Django versions/settings.
 *
 * bcrypt.compare() can never match this format — the algorithm and encoding
 * are both different — so staff login must go through this instead.
 */
async function verifyDjangoPassword(password, encoded) {
  if (typeof encoded !== "string") return false;

  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  const [algorithm, iterationsRaw, salt, hashB64] = parts;
  if (algorithm !== "pbkdf2_sha256") return false;

  const iterations = parseInt(iterationsRaw, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const expected = Buffer.from(hashB64, "base64");
  if (expected.length === 0) return false;

  const derived = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, expected.length, "sha256", (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// 600000 matches every hash sampled from administration_user in soroman_db
// at cutover time (Django's PBKDF2PasswordHasher.iterations as of Django 4.2+).
// Reads still parse whatever count is embedded in the target hash, so this
// only affects hashes THIS app creates going forward.
const DEFAULT_ITERATIONS = 600000;

/**
 * Produces a hash in Django's own format, so a password set through this app
 * verifies correctly via Django's check_password() too — both systems read
 * the same administration_user.password column.
 */
async function hashDjangoPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, "sha256", (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `pbkdf2_sha256$${iterations}$${salt}$${derived.toString("base64")}`;
}

module.exports = { verifyDjangoPassword, hashDjangoPassword };
