const nodemailer = require("nodemailer");

const LIVE_CHECK_TIMEOUT_MS = 5000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_CLIENT_ID_REGEX = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const GOOGLE_SECRET_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
const FACEBOOK_APP_ID_REGEX = /^\d{8,25}$/;
const FACEBOOK_SECRET_REGEX = /^[a-fA-F0-9]{16,64}$/;
const RECAPTCHA_KEY_REGEX = /^6L[A-Za-z0-9_-]{35,45}$/;
const WEATHER_KEY_REGEX = /^[A-Za-z0-9]{20,64}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOUDINARY_NAME_REGEX = /^[a-z0-9_-]{2,64}$/;
const CLOUDINARY_API_KEY_REGEX = /^\d{10,25}$/;
const CLOUDINARY_SECRET_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

const PLACEHOLDER_TOKENS = new Set([
  "test",
  "testing",
  "invalid",
  "fake",
  "dummy",
  "placeholder",
  "changeme",
  "example",
  "sample",
  "none",
  "null",
  "undefined",
  "your_api_key",
  "your-api-key",
]);

function isPlaceholderValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (PLACEHOLDER_TOKENS.has(normalized)) return true;
  // Reject strings made of a single repeated character (e.g. "0000000000", "aaaaaaaaaa")
  if (normalized.length >= 6 && /^([a-z0-9_-])\1+$/i.test(normalized)) return true;
  return false;
}

function hasControlOrWhitespace(value) {
  return /\s/.test(String(value || ""));
}

function extractEmailFromHeader(value) {
  const raw = String(value || "").trim();
  const angleMatch = raw.match(/<([^>]+)>/);
  return (angleMatch ? angleMatch[1] : raw).trim();
}

async function fetchJsonWithTimeout(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function validateGoogleCredentials({ clientId, clientSecret }) {
  if (!clientId || !clientSecret) {
    return "Both Google Client ID and Client Secret are required.";
  }
  if (hasControlOrWhitespace(clientId) || hasControlOrWhitespace(clientSecret)) {
    return "Google OAuth credentials cannot contain spaces or line breaks.";
  }
  if (isPlaceholderValue(clientId) || isPlaceholderValue(clientSecret)) {
    return "Please enter valid Google OAuth credentials rather than placeholder text.";
  }
  if (!GOOGLE_CLIENT_ID_REGEX.test(clientId)) {
    return "Invalid Google Client ID format. Expected a value ending with .apps.googleusercontent.com.";
  }
  if (!GOOGLE_SECRET_REGEX.test(clientSecret)) {
    return "Invalid Google Client Secret format (must be 16-128 valid characters).";
  }
  return null;
}

async function validateFacebookCredentials({ appId, appSecret }) {
  if (!appId || !appSecret) {
    return "Both Facebook App ID and App Secret are required.";
  }
  if (hasControlOrWhitespace(appId) || hasControlOrWhitespace(appSecret)) {
    return "Facebook credentials cannot contain spaces or line breaks.";
  }
  if (isPlaceholderValue(appId) || isPlaceholderValue(appSecret)) {
    return "Please enter valid Facebook App credentials rather than placeholder text.";
  }
  if (!FACEBOOK_APP_ID_REGEX.test(appId)) {
    return "Invalid Facebook App ID. It must be a numeric Meta App ID (8-25 digits).";
  }
  if (!FACEBOOK_SECRET_REGEX.test(appSecret)) {
    return "Invalid Facebook App Secret format (expected a 16-64 character hexadecimal secret).";
  }

  try {
    const url =
      `https://graph.facebook.com/oauth/access_token` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&grant_type=client_credentials`;
    const { ok, status, data } = await fetchJsonWithTimeout(url);
    if (!ok && (status === 400 || status === 401 || status === 403 || data?.error)) {
      return `Invalid Facebook App ID or App Secret: ${data?.error?.message || "rejected by Facebook Graph API."}`;
    }
  } catch {
    // Allow format-validated credentials if external network is temporarily unreachable
  }

  return null;
}

async function validateRecaptchaCredentials({ siteKey, secretKey }) {
  if (!siteKey || !secretKey) {
    return "Both Google reCAPTCHA Site Key and Secret Key are required.";
  }
  if (hasControlOrWhitespace(siteKey) || hasControlOrWhitespace(secretKey)) {
    return "reCAPTCHA keys cannot contain spaces or line breaks.";
  }
  if (isPlaceholderValue(siteKey) || isPlaceholderValue(secretKey)) {
    return "Please enter valid Google reCAPTCHA keys rather than placeholder text.";
  }
  if (!RECAPTCHA_KEY_REGEX.test(siteKey)) {
    return "Invalid Google reCAPTCHA Site Key format (expected a valid key starting with 6L).";
  }
  if (!RECAPTCHA_KEY_REGEX.test(secretKey)) {
    return "Invalid Google reCAPTCHA Secret Key format (expected a valid key starting with 6L).";
  }
  if (siteKey === secretKey) {
    return "reCAPTCHA Site Key and Secret Key cannot be the same value.";
  }

  try {
    const body = new URLSearchParams({ secret: secretKey, response: "validation_probe" });
    const { data } = await fetchJsonWithTimeout("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const errorCodes = Array.isArray(data?.["error-codes"]) ? data["error-codes"] : [];
    if (errorCodes.includes("invalid-input-secret")) {
      return "Invalid Google reCAPTCHA Secret Key: rejected by Google reCAPTCHA API.";
    }
  } catch {
    // Allow format-validated keys when offline
  }

  return null;
}

async function validateWeatherCredentials({ apiKey }) {
  if (!apiKey) {
    return "WeatherAPI key is required.";
  }
  if (hasControlOrWhitespace(apiKey) || isPlaceholderValue(apiKey) || !WEATHER_KEY_REGEX.test(apiKey)) {
    return "Invalid WeatherAPI key format (expected 20-64 alphanumeric characters with no spaces).";
  }

  try {
    const url = `https://api.weatherapi.com/v1/current.json?key=${encodeURIComponent(apiKey)}&q=Kalilangan`;
    const { ok, status, data } = await fetchJsonWithTimeout(url);
    const apiErrCode = data?.error?.code;
    if (!ok && (status === 401 || status === 403 || [1002, 2006, 2007, 2008].includes(apiErrCode))) {
      return `Invalid WeatherAPI key: ${data?.error?.message || "rejected by WeatherAPI.com."}`;
    }
  } catch {
    // Allow format-validated key when offline
  }

  return null;
}

async function validateOneSignalCredentials({ appId, restApiKey }) {
  if (!appId || !restApiKey) {
    return "Both OneSignal App ID and REST API Key are required.";
  }
  if (hasControlOrWhitespace(appId) || hasControlOrWhitespace(restApiKey)) {
    return "OneSignal credentials cannot contain spaces or line breaks.";
  }
  if (isPlaceholderValue(appId) || isPlaceholderValue(restApiKey)) {
    return "Please enter valid OneSignal credentials rather than placeholder text.";
  }
  if (!UUID_REGEX.test(appId)) {
    return "Invalid OneSignal App ID format (must be a valid UUID, e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).";
  }
  if (restApiKey.length < 24 || !/^[A-Za-z0-9_=-]+$/.test(restApiKey)) {
    return "Invalid OneSignal REST API Key format (must be at least 24 valid characters).";
  }

  try {
    const authHeader = restApiKey.startsWith("os_") ? `Key ${restApiKey}` : `Basic ${restApiKey}`;
    const { ok, status, data } = await fetchJsonWithTimeout(
      `https://onesignal.com/api/v1/apps/${encodeURIComponent(appId)}`,
      { headers: { Authorization: authHeader } }
    );
    if (!ok && (status === 400 || status === 401 || status === 403 || status === 404)) {
      const msg = Array.isArray(data?.errors) ? data.errors.join("; ") : data?.errors;
      return `Invalid OneSignal App ID or REST API Key: ${msg || `HTTP ${status} from OneSignal.`}`;
    }
  } catch {
    // Allow format-validated keys when offline
  }

  return null;
}

async function validateCloudinaryCredentials({ cloudName, apiKey, apiSecret }) {
  if (!cloudName || !apiKey || !apiSecret) {
    return "Cloudinary Cloud Name, API Key, and API Secret are all required.";
  }
  if (
    hasControlOrWhitespace(cloudName) ||
    hasControlOrWhitespace(apiKey) ||
    hasControlOrWhitespace(apiSecret)
  ) {
    return "Cloudinary credentials cannot contain spaces or line breaks.";
  }
  if (
    isPlaceholderValue(cloudName) ||
    isPlaceholderValue(apiKey) ||
    isPlaceholderValue(apiSecret)
  ) {
    return "Please enter valid Cloudinary credentials rather than placeholder text.";
  }
  if (!CLOUDINARY_NAME_REGEX.test(cloudName)) {
    return "Invalid Cloudinary Cloud Name (use 2-64 lowercase letters, numbers, hyphens, or underscores).";
  }
  if (!CLOUDINARY_API_KEY_REGEX.test(apiKey)) {
    return "Invalid Cloudinary API Key (must be a 10-25 digit numeric key).";
  }
  if (!CLOUDINARY_SECRET_REGEX.test(apiSecret)) {
    return "Invalid Cloudinary API Secret format (must be 16-64 valid characters).";
  }

  try {
    const basicToken = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const { ok, status, data } = await fetchJsonWithTimeout(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/ping`,
      { headers: { Authorization: `Basic ${basicToken}` } }
    );
    if (!ok && (status === 401 || status === 403 || status === 404)) {
      return `Invalid Cloudinary credentials: ${data?.error?.message || `rejected by Cloudinary (HTTP ${status}).`}`;
    }
  } catch {
    // Allow format-validated credentials when offline
  }

  return null;
}

async function validateEmailCredentials({ user, pass, from }) {
  if (!user || !pass) {
    return "Both Gmail SMTP Username/Email and App Password are required.";
  }
  if (isPlaceholderValue(user) || isPlaceholderValue(pass)) {
    return "Please enter valid Gmail SMTP credentials rather than placeholder text.";
  }
  if (!EMAIL_REGEX.test(user)) {
    return "Invalid Gmail SMTP Username. Please enter a valid email address.";
  }
  const strippedPass = String(pass).replace(/\s+/g, "");
  if (/[\r\n]/.test(pass) || strippedPass.length < 8) {
    return "Invalid Gmail SMTP App Password (must be at least 8 characters).";
  }
  if (from) {
    const extractedFrom = extractEmailFromHeader(from);
    if (!EMAIL_REGEX.test(extractedFrom)) {
      return "Invalid Sender From Address. Use a valid email or \"Display Name\" <email@domain.com>.";
    }
  }

  try {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT) || 465;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: LIVE_CHECK_TIMEOUT_MS,
      greetingTimeout: LIVE_CHECK_TIMEOUT_MS,
    });
    await transporter.verify();
  } catch (err) {
    const code = String(err?.responseCode || err?.code || "");
    const msg = String(err?.message || "");
    if (
      code === "EAUTH" ||
      code === "535" ||
      /invalid login|username and password not accepted|authentication failed|badcredentials/i.test(msg)
    ) {
      return "Invalid Gmail SMTP credentials: SMTP authentication failed.";
    }
  }

  return null;
}

async function validateCalendarCredentials({ clientId, clientSecret, redirectUri }) {
  if (!clientId || !clientSecret || !redirectUri) {
    return "Google Calendar Client ID, Client Secret, and Redirect URI are all required.";
  }
  if (
    hasControlOrWhitespace(clientId) ||
    hasControlOrWhitespace(clientSecret) ||
    hasControlOrWhitespace(redirectUri)
  ) {
    return "Google Calendar credentials cannot contain spaces or line breaks.";
  }
  if (isPlaceholderValue(clientId) || isPlaceholderValue(clientSecret)) {
    return "Please enter valid Google Calendar credentials rather than placeholder text.";
  }
  if (!GOOGLE_CLIENT_ID_REGEX.test(clientId)) {
    return "Invalid Google Calendar Client ID format. Expected a value ending with .apps.googleusercontent.com.";
  }
  if (!GOOGLE_SECRET_REGEX.test(clientSecret)) {
    return "Invalid Google Calendar Client Secret format (must be 16-128 valid characters).";
  }
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Invalid Redirect URI. Must use http:// or https://.";
    }
  } catch {
    return "Invalid Redirect URI format. Must be a valid http:// or https:// URL.";
  }

  return null;
}

const VALIDATORS = {
  google: validateGoogleCredentials,
  facebook: validateFacebookCredentials,
  recaptcha: validateRecaptchaCredentials,
  weather: validateWeatherCredentials,
  oneSignal: validateOneSignalCredentials,
  cloudinary: validateCloudinaryCredentials,
  email: validateEmailCredentials,
  calendar: validateCalendarCredentials,
};

/**
 * Validates custom integration credentials for format completeness and live provider verification.
 * Returns null if valid, or a descriptive human-readable error message string if invalid.
 */
async function validateIntegrationCredentials(provider, credentials) {
  const validator = VALIDATORS[provider];
  if (!validator) return null;
  return validator(credentials || {});
}

module.exports = {
  validateIntegrationCredentials,
};

