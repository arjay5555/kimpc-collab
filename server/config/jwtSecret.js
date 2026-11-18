/**
 * Single source of truth for the JWT signing secret.
 * There is deliberately NO hardcoded fallback: a publicly known fallback lets anyone
 * forge admin tokens if the env var is ever missing in a deployment.
 */
const secret = String(process.env.JWT_SECRET || "").trim();

if (secret.length < 32) {
  throw new Error(
    "[Config] JWT_SECRET is missing or too short (min 32 chars). " +
      "Set a long random value in server/.env, e.g. node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

module.exports = secret;
