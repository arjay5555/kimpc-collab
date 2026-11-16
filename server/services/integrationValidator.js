const nodemailer = require("nodemailer");

const LIVE_CHECK_TIMEOUT_MS = 5000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_CLIENT_ID_REGEX = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const GOOGLE_SECRET_REGEX = /^GOCSPX-[A-Za-z0-9_-]{28}$/;
const FACEBOOK_APP_ID_REGEX = /^\d{16}$/;
const FACEBOOK_SECRET_REGEX = /^[a-fA-F0-9]{32}$/;
const RECAPTCHA_KEY_REGEX = /^6L[A-Za-z0-9_-]{38}$/;
const WEATHER_KEY_REGEX = /^[A-Za-z0-9]{30,31}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOUDINARY_NAME_REGEX = /^[a-z0-9_-]{2,32}$/;
const CLOUDINARY_API_KEY_REGEX = /^\d{15}$/;
const CLOUDINARY_SECRET_REGEX = /^[A-Za-z0-9_-]{27}$/;
const OCR_SPACE_KEY_REGEX = /^K[A-Za-z0-9]{19}$/;

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
  if (!GOOGLE_CLIENT_ID_REGEX.test(clientId) || clientId.length < 65 || clientId.length > 85) {
    return `Google Client ID must end with .apps.googleusercontent.com and be 70-75 characters long (currently ${clientId.length} characters).`;
  }
  if (!GOOGLE_SECRET_REGEX.test(clientSecret) || clientSecret.length !== 35) {
    return `Google Client Secret must be exactly 35 characters starting with 'GOCSPX-' (currently ${clientSecret.length} character${clientSecret.length === 1 ? "" : "s"}).`;
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
  if (!FACEBOOK_APP_ID_REGEX.test(appId) || appId.length !== 16) {
    return `Facebook App ID must be exactly 16 numeric digits (currently ${appId.length} character${appId.length === 1 ? "" : "s"}).`;
  }
  if (!FACEBOOK_SECRET_REGEX.test(appSecret) || appSecret.length !== 32) {
    return `Facebook App Secret must be exactly 32 hexadecimal characters (currently ${appSecret.length} character${appSecret.length === 1 ? "" : "s"}).`;
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
  if (!RECAPTCHA_KEY_REGEX.test(siteKey) || siteKey.length !== 40) {
    return `Google reCAPTCHA Site Key must be exactly 40 characters starting with '6L' (currently ${siteKey.length} character${siteKey.length === 1 ? "" : "s"}).`;
  }
  if (!RECAPTCHA_KEY_REGEX.test(secretKey) || secretKey.length !== 40) {
    return `Google reCAPTCHA Secret Key must be exactly 40 characters starting with '6L' (currently ${secretKey.length} character${secretKey.length === 1 ? "" : "s"}).`;
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
  if (hasControlOrWhitespace(apiKey) || isPlaceholderValue(apiKey)) {
    return "WeatherAPI key cannot contain spaces or placeholder text.";
  }
  if (!WEATHER_KEY_REGEX.test(apiKey) || (apiKey.length !== 30 && apiKey.length !== 31)) {
    return `WeatherAPI key must be exactly 30 or 31 alphanumeric characters (currently ${apiKey.length} character${apiKey.length === 1 ? "" : "s"}).`;
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
  if (!UUID_REGEX.test(appId) || appId.length !== 36) {
    return `OneSignal App ID must be exactly 36 characters in UUID format (currently ${appId.length} character${appId.length === 1 ? "" : "s"}).`;
  }
  if (restApiKey.length < 48 || !/^[A-Za-z0-9_=-]+$/.test(restApiKey)) {
    return `OneSignal REST API Key must be at least 48 characters (currently ${restApiKey.length} character${restApiKey.length === 1 ? "" : "s"}).`;
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
    return "Invalid Cloudinary Cloud Name (use 2-32 lowercase letters, numbers, hyphens, or underscores).";
  }
  if (!CLOUDINARY_API_KEY_REGEX.test(apiKey) || apiKey.length !== 15) {
    return `Cloudinary API Key must be exactly 15 numeric digits (currently ${apiKey.length} character${apiKey.length === 1 ? "" : "s"}).`;
  }
  if (!CLOUDINARY_SECRET_REGEX.test(apiSecret) || apiSecret.length !== 27) {
    return `Cloudinary API Secret must be exactly 27 characters (currently ${apiSecret.length} character${apiSecret.length === 1 ? "" : "s"}).`;
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
  if (!/^[a-zA-Z]{16}$/.test(strippedPass) || strippedPass.length !== 16) {
    return `Gmail App Password must be exactly 16 letters with spaces removed (currently ${strippedPass.length} character${strippedPass.length === 1 ? "" : "s"}).`;
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
      auth: { user, pass: strippedPass },
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
  if (!GOOGLE_CLIENT_ID_REGEX.test(clientId) || clientId.length < 65 || clientId.length > 85) {
    return `Google Calendar Client ID must end with .apps.googleusercontent.com and be 70-75 characters (currently ${clientId.length} characters).`;
  }
  if (!GOOGLE_SECRET_REGEX.test(clientSecret) || clientSecret.length !== 35) {
    return `Google Calendar Client Secret must be exactly 35 characters starting with 'GOCSPX-' (currently ${clientSecret.length} character${clientSecret.length === 1 ? "" : "s"}).`;
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

async function validateOrsCredentials({ apiKey }) {
  if (!apiKey) {
    return "OpenRouteService API key is required.";
  }
  if (hasControlOrWhitespace(apiKey) || isPlaceholderValue(apiKey)) {
    return "OpenRouteService API key cannot contain spaces or placeholder text.";
  }
  const isStandardToken = apiKey.length >= 58 && apiKey.length <= 64;
  const isHeigitToken = apiKey.length === 120;
  if ((!isStandardToken && !isHeigitToken) || !/^[A-Za-z0-9_=+/.-]+$/.test(apiKey)) {
    return `OpenRouteService API key must be 58-64 characters (standard token) or 120 characters (HeiGIT token), currently ${apiKey.length} characters.`;
  }

  try {
    const { ok, status, data } = await fetchJsonWithTimeout(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [124.7314, 7.8211],
            [124.745, 7.83],
          ],
          preference: "fastest",
        }),
      }
    );
    if (!ok && (status === 401 || status === 403)) {
      const msg = data?.error?.message || data?.error || "rejected by OpenRouteService.";
      return `Invalid OpenRouteService API key: ${msg}`;
    }
  } catch {
    // Allow format-validated key when offline
  }

  return null;
}

async function validateOcrSpaceCredentials({ apiKey }) {
  if (!apiKey) {
    return "OCR.space API key is required.";
  }
  if (hasControlOrWhitespace(apiKey) || isPlaceholderValue(apiKey)) {
    return "OCR.space API key cannot contain spaces or placeholder text.";
  }
  if (!OCR_SPACE_KEY_REGEX.test(apiKey) || apiKey.length !== 20) {
    return `OCR.space API key must be exactly 20 characters starting with 'K' (currently ${apiKey.length} character${apiKey.length === 1 ? "" : "s"}).`;
  }

  try {
    const form = new FormData();
    form.append("apikey", apiKey);
    form.append("base64Image", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
    form.append("language", "eng");
    const { status, data } = await fetchJsonWithTimeout("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
    });
    const errText = Array.isArray(data?.ErrorMessage)
      ? data.ErrorMessage.join("; ")
      : String(data?.ErrorMessage || data?.error || "");
    if (status === 401 || status === 403 || /api key is invalid|invalid api key|expired/i.test(errText)) {
      return `Invalid OCR.space API key: ${errText || `HTTP ${status} from OCR.space.`}`;
    }
  } catch {
    // Allow format-validated key when offline
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
  ors: validateOrsCredentials,
  ocrSpace: validateOcrSpaceCredentials,
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

