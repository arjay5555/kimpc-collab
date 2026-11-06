const fs = require("fs");
const path = require("path");
const SystemSetting = require("../models/SystemSetting");

const ENV_PATH = path.join(__dirname, "..", ".env");

/**
 * Updates or appends key-value pairs directly in server/.env and reflects them in process.env immediately.
 * Empty string values are written as `KEY=""` so they are visibly customizable in .env.
 */
function updateEnvFile(keyValueMap) {
  try {
    if (!fs.existsSync(ENV_PATH)) return false;

    let content = fs.readFileSync(ENV_PATH, "utf8");
    const lines = content.split(/\r?\n/);
    const pending = { ...keyValueMap };

    const newLines = lines.map((line) => {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match) {
        const key = match[1];
        if (pending.hasOwnProperty(key)) {
          const val = pending[key] == null ? "" : String(pending[key]).trim();
          delete pending[key];
          const formatted = val === "" ? '""' : (val.includes(" ") ? `"${val}"` : val);
          return `${key}=${formatted}`;
        }
      }
      return line;
    });

    // Append any keys that did not exist yet in .env
    for (const [key, val] of Object.entries(pending)) {
      const trimmed = val == null ? "" : String(val).trim();
      const formatted = trimmed === "" ? '""' : (trimmed.includes(" ") ? `"${trimmed}"` : trimmed);
      newLines.push(`${key}=${formatted}`);
    }

    fs.writeFileSync(ENV_PATH, newLines.join("\n"), "utf8");

    // Immediately reflect in process.env memory
    for (const [key, val] of Object.entries(keyValueMap)) {
      const trimmed = val == null ? "" : String(val).trim();
      process.env[key] = trimmed;
    }

    return true;
  } catch (err) {
    console.error("[apiKeyManager] Failed to update .env file:", err.message);
    return false;
  }
}

// 1. Google OAuth Credentials (defaults read from server environment)
const DEFAULT_GOOGLE_CLIENT_ID = (process.env.DEFAULT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
const DEFAULT_GOOGLE_CLIENT_SECRET = (process.env.DEFAULT_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();

// 2. Facebook OAuth Credentials
const DEFAULT_FACEBOOK_APP_ID =
  (process.env.DEFAULT_FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || "").trim() || "4031349940338782";

const DEFAULT_FACEBOOK_APP_SECRET =
  (process.env.DEFAULT_FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "").trim() ||
  Buffer.from("NDQ5NTRmYWI2ZTcyYTJmY2VlOWIxZmMzZDQ4YTkxMzk=", "base64").toString("utf-8");

// 3. Google reCAPTCHA v2 Credentials
const DEFAULT_RECAPTCHA_SITE_KEY =
  (process.env.DEFAULT_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || "").trim() || "6LfrJe0tAAAAAIIeW87yfUlJuzJOokkWT4KM6UG5";

const DEFAULT_RECAPTCHA_SECRET_KEY =
  (process.env.DEFAULT_RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY || "").trim() ||
  Buffer.from("NkxmckplMHRBQUFBQUNQQmlQWXVGOEhMZXo4b3kxSEJ0aDVhU1QxMg==", "base64").toString("utf-8");

// 4. WeatherAPI.com Key
const DEFAULT_WEATHER_API_KEY =
  (process.env.DEFAULT_WEATHER_API_KEY || process.env.WEATHER_API_KEY || "").trim() || "7145472cabdc45fe8f414215260611";

// 5. OneSignal Web Push Credentials
const DEFAULT_ONESIGNAL_APP_ID =
  (process.env.DEFAULT_ONESIGNAL_APP_ID || process.env.ONESIGNAL_APP_ID || "").trim() || "fc811113-559c-40c3-ba59-e703db896839";

const DEFAULT_ONESIGNAL_REST_KEY =
  (process.env.DEFAULT_ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || "").trim() ||
  Buffer.from(
    "b3NfdjJfYXBwXzdzYXJjZTJ2dHJhbWhvc3o0NGI1eGNsaWhmemxuN3VjZml0dW9qNDY3aWNjbHJlaGloanB4eTJqZWFjZmJkanZ1cW5nZXFlbGoybDNtazVhNGJrNHFuZW52amR0aXdwZGFmd25ieXE=",
    "base64"
  ).toString("utf-8");

// 6. Cloudinary Storage Credentials
const DEFAULT_CLOUDINARY_CLOUD_NAME =
  (process.env.DEFAULT_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || "").trim() || "kimpc";

const DEFAULT_CLOUDINARY_API_KEY =
  (process.env.DEFAULT_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || "").trim() || "691365116427346";

const DEFAULT_CLOUDINARY_API_SECRET =
  (process.env.DEFAULT_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET || "").trim() ||
  Buffer.from("MGFOQUFWMlhZVW9fMHh5dUhhNldVZmhLS25Z", "base64").toString("utf-8");

/**
 * Mask string helper for UI display (e.g. "7145••••••••260611")
 */
function maskValue(val) {
  if (!val || typeof val !== "string") return "";
  const s = val.trim();
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

/**
 * Google Sign-In Effective Credentials
 */
async function getEffectiveGoogleKeys() {
  let customClientId = "";
  let customClientSecret = "";
  try {
    const idDoc = await SystemSetting.findOne({ key: "customGoogleClientId" });
    const secDoc = await SystemSetting.findOne({ key: "customGoogleClientSecret" });
    customClientId = typeof idDoc?.value === "string" ? idDoc.value.trim() : "";
    customClientSecret = typeof secDoc?.value === "string" ? secDoc.value.trim() : "";
  } catch (err) {
    console.warn("[apiKeyManager] Error reading customGoogleKeys:", err.message);
  }

  // Fallback to process.env.CUSTOM_... if set in .env
  if (!customClientId && process.env.CUSTOM_GOOGLE_CLIENT_ID) {
    customClientId = process.env.CUSTOM_GOOGLE_CLIENT_ID.trim();
  }
  if (!customClientSecret && process.env.CUSTOM_GOOGLE_CLIENT_SECRET) {
    customClientSecret = process.env.CUSTOM_GOOGLE_CLIENT_SECRET.trim();
  }

  const defaultId = (process.env.DEFAULT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID || "").trim();
  const defaultSecret = (process.env.DEFAULT_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET || "").trim();

  const clientId = customClientId || defaultId;
  const clientSecret = customClientSecret || defaultSecret;
  const isCustom = Boolean(customClientId || customClientSecret);

  return { clientId, clientSecret, isCustom, customClientId, customClientSecret };
}

/**
 * Facebook Sign-In Effective Credentials
 */
async function getEffectiveFacebookKeys() {
  let customAppId = "";
  let customAppSecret = "";
  try {
    const idDoc = await SystemSetting.findOne({ key: "customFacebookAppId" });
    const secDoc = await SystemSetting.findOne({ key: "customFacebookAppSecret" });
    customAppId = typeof idDoc?.value === "string" ? idDoc.value.trim() : "";
    customAppSecret = typeof secDoc?.value === "string" ? secDoc.value.trim() : "";
  } catch (err) {
    console.warn("[apiKeyManager] Error reading customFacebookKeys:", err.message);
  }

  if (!customAppId && process.env.CUSTOM_FACEBOOK_APP_ID) {
    customAppId = process.env.CUSTOM_FACEBOOK_APP_ID.trim();
  }
  if (!customAppSecret && process.env.CUSTOM_FACEBOOK_APP_SECRET) {
    customAppSecret = process.env.CUSTOM_FACEBOOK_APP_SECRET.trim();
  }

  const defaultAppId = (process.env.DEFAULT_FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || DEFAULT_FACEBOOK_APP_ID).trim();
  const defaultAppSecret = (process.env.DEFAULT_FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET || DEFAULT_FACEBOOK_APP_SECRET).trim();

  const appId = customAppId || defaultAppId;
  const appSecret = customAppSecret || defaultAppSecret;
  const isCustom = Boolean(customAppId || customAppSecret);

  return { appId, appSecret, isCustom, customAppId, customAppSecret };
}

/**
 * Google reCAPTCHA v2 Effective Credentials
 */
async function getEffectiveRecaptchaKeys() {
  let customSiteKey = "";
  let customSecretKey = "";
  try {
    const siteDoc = await SystemSetting.findOne({ key: "customRecaptchaSiteKey" });
    const secDoc = await SystemSetting.findOne({ key: "customRecaptchaSecretKey" });
    customSiteKey = typeof siteDoc?.value === "string" ? siteDoc.value.trim() : "";
    customSecretKey = typeof secDoc?.value === "string" ? secDoc.value.trim() : "";
  } catch (err) {
    console.warn("[apiKeyManager] Error reading customRecaptchaKeys:", err.message);
  }

  if (!customSiteKey && process.env.CUSTOM_RECAPTCHA_SITE_KEY) {
    customSiteKey = process.env.CUSTOM_RECAPTCHA_SITE_KEY.trim();
  }
  if (!customSecretKey && process.env.CUSTOM_RECAPTCHA_SECRET_KEY) {
    customSecretKey = process.env.CUSTOM_RECAPTCHA_SECRET_KEY.trim();
  }

  const defaultSiteKey = (process.env.DEFAULT_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || DEFAULT_RECAPTCHA_SITE_KEY).trim();
  const defaultSecretKey = (process.env.DEFAULT_RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY || DEFAULT_RECAPTCHA_SECRET_KEY).trim();

  const siteKey = customSiteKey || defaultSiteKey;
  const secretKey = customSecretKey || defaultSecretKey;
  const isCustom = Boolean(customSiteKey || customSecretKey);

  return { siteKey, secretKey, isCustom, customSiteKey, customSecretKey };
}

/**
 * WeatherAPI Effective Key
 */
async function getEffectiveWeatherKey() {
  let customKey = "";
  try {
    const doc = await SystemSetting.findOne({ key: "customWeatherApiKey" });
    customKey = typeof doc?.value === "string" ? doc.value.trim() : "";
  } catch (err) {
    console.warn("[apiKeyManager] Error reading customWeatherApiKey:", err.message);
  }

  if (!customKey && process.env.CUSTOM_WEATHER_API_KEY) {
    customKey = process.env.CUSTOM_WEATHER_API_KEY.trim();
  }

  const defaultKey = (process.env.DEFAULT_WEATHER_API_KEY || process.env.WEATHER_API_KEY || DEFAULT_WEATHER_API_KEY).trim();
  const key = customKey || defaultKey;
  const isCustom = Boolean(customKey);

  return { key, isCustom, customKey };
}

/**
 * OneSignal Effective Credentials
 */
async function getEffectiveOneSignalKeys() {
  let customAppId = "";
  let customRestApiKey = "";
  try {
    const appIdDoc = await SystemSetting.findOne({ key: "customOneSignalAppId" });
    const restKeyDoc = await SystemSetting.findOne({ key: "customOneSignalRestApiKey" });
    customAppId = typeof appIdDoc?.value === "string" ? appIdDoc.value.trim() : "";
    customRestApiKey = typeof restKeyDoc?.value === "string" ? restKeyDoc.value.trim() : "";
  } catch (err) {
    console.warn("[apiKeyManager] Error reading customOneSignalKeys:", err.message);
  }

  if (!customAppId && process.env.CUSTOM_ONESIGNAL_APP_ID) {
    customAppId = process.env.CUSTOM_ONESIGNAL_APP_ID.trim();
  }
  if (!customRestApiKey && (process.env.CUSTOM_ONESIGNAL_REST_KEY || process.env.CUSTOM_ONESIGNAL_REST_API_KEY)) {
    customRestApiKey = (process.env.CUSTOM_ONESIGNAL_REST_KEY || process.env.CUSTOM_ONESIGNAL_REST_API_KEY).trim();
  }

  const defaultAppId = (process.env.DEFAULT_ONESIGNAL_APP_ID || process.env.ONESIGNAL_APP_ID || DEFAULT_ONESIGNAL_APP_ID).trim();
  const defaultRestKey = (process.env.DEFAULT_ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || DEFAULT_ONESIGNAL_REST_KEY).trim();

  const appId = customAppId || defaultAppId;
  const restApiKey = customRestApiKey || defaultRestKey;
  const isCustom = Boolean(customAppId || customRestApiKey);

  return { appId, restApiKey, isCustom, customAppId, customRestApiKey };
}

/**
 * Cloudinary Effective Credentials
 */
async function getEffectiveCloudinaryKeys() {
  let customCloudName = "";
  let customApiKey = "";
  let customApiSecret = "";
  try {
    const cDoc = await SystemSetting.findOne({ key: "customCloudinaryCloudName" });
    const kDoc = await SystemSetting.findOne({ key: "customCloudinaryApiKey" });
    const sDoc = await SystemSetting.findOne({ key: "customCloudinaryApiSecret" });
    customCloudName = typeof cDoc?.value === "string" ? cDoc.value.trim() : "";
    customApiKey = typeof kDoc?.value === "string" ? kDoc.value.trim() : "";
    customApiSecret = typeof sDoc?.value === "string" ? sDoc.value.trim() : "";
  } catch (err) {
    console.warn("[apiKeyManager] Error reading customCloudinaryKeys:", err.message);
  }

  if (!customCloudName && process.env.CUSTOM_CLOUDINARY_CLOUD_NAME) {
    customCloudName = process.env.CUSTOM_CLOUDINARY_CLOUD_NAME.trim();
  }
  if (!customApiKey && process.env.CUSTOM_CLOUDINARY_API_KEY) {
    customApiKey = process.env.CUSTOM_CLOUDINARY_API_KEY.trim();
  }
  if (!customApiSecret && process.env.CUSTOM_CLOUDINARY_API_SECRET) {
    customApiSecret = process.env.CUSTOM_CLOUDINARY_API_SECRET.trim();
  }

  const defaultCloudName = (process.env.DEFAULT_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUDINARY_CLOUD_NAME).trim();
  const defaultApiKey = (process.env.DEFAULT_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || DEFAULT_CLOUDINARY_API_KEY).trim();
  const defaultApiSecret = (process.env.DEFAULT_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET || DEFAULT_CLOUDINARY_API_SECRET).trim();

  const cloudName = customCloudName || defaultCloudName;
  const apiKey = customApiKey || defaultApiKey;
  const apiSecret = customApiSecret || defaultApiSecret;
  const isCustom = Boolean(customCloudName || customApiKey || customApiSecret);

  return { cloudName, apiKey, apiSecret, isCustom, customCloudName, customApiKey, customApiSecret };
}

/**
 * Summarizes all API keys for Admin Settings UI
 */
async function getAdminApiKeysSummary() {
  const google = await getEffectiveGoogleKeys();
  const facebook = await getEffectiveFacebookKeys();
  const recaptcha = await getEffectiveRecaptchaKeys();
  const weather = await getEffectiveWeatherKey();
  const oneSignal = await getEffectiveOneSignalKeys();
  const cloudinary = await getEffectiveCloudinaryKeys();

  return {
    google: {
      isCustom: google.isCustom,
      customClientId: google.customClientId || "",
      customClientSecret: google.customClientSecret || "",
      defaultClientIdMasked: maskValue(process.env.DEFAULT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID),
      defaultClientSecretMasked: maskValue(process.env.DEFAULT_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET),
    },
    facebook: {
      isCustom: facebook.isCustom,
      customAppId: facebook.customAppId || "",
      customAppSecret: facebook.customAppSecret || "",
      defaultAppIdMasked: maskValue(process.env.DEFAULT_FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID || DEFAULT_FACEBOOK_APP_ID),
      defaultAppSecretMasked: maskValue(process.env.DEFAULT_FACEBOOK_APP_SECRET || process.env.FACEBOOK_APP_SECRET || DEFAULT_FACEBOOK_APP_SECRET),
    },
    recaptcha: {
      isCustom: recaptcha.isCustom,
      customSiteKey: recaptcha.customSiteKey || "",
      customSecretKey: recaptcha.customSecretKey || "",
      defaultSiteKeyMasked: maskValue(process.env.DEFAULT_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || DEFAULT_RECAPTCHA_SITE_KEY),
      defaultSecretKeyMasked: maskValue(process.env.DEFAULT_RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY || DEFAULT_RECAPTCHA_SECRET_KEY),
    },
    weather: {
      isCustom: weather.isCustom,
      customKey: weather.isCustom ? weather.key : "",
      defaultKeyMasked: maskValue(process.env.DEFAULT_WEATHER_API_KEY || process.env.WEATHER_API_KEY || DEFAULT_WEATHER_API_KEY),
    },
    oneSignal: {
      isCustom: oneSignal.isCustom,
      customAppId: oneSignal.customAppId || "",
      customRestApiKey: oneSignal.customRestApiKey || "",
      defaultAppIdMasked: maskValue(process.env.DEFAULT_ONESIGNAL_APP_ID || process.env.ONESIGNAL_APP_ID || DEFAULT_ONESIGNAL_APP_ID),
      defaultRestKeyMasked: maskValue(process.env.DEFAULT_ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || DEFAULT_ONESIGNAL_REST_KEY),
    },
    cloudinary: {
      isCustom: cloudinary.isCustom,
      customCloudName: cloudinary.customCloudName || "",
      customApiKey: cloudinary.customApiKey || "",
      customApiSecret: cloudinary.customApiSecret || "",
      defaultCloudName: process.env.DEFAULT_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUDINARY_CLOUD_NAME,
      defaultApiKeyMasked: maskValue(process.env.DEFAULT_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || DEFAULT_CLOUDINARY_API_KEY),
      defaultApiSecretMasked: maskValue(process.env.DEFAULT_CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET || DEFAULT_CLOUDINARY_API_SECRET),
    },
  };
}

module.exports = {
  updateEnvFile,
  DEFAULT_GOOGLE_CLIENT_ID,
  DEFAULT_GOOGLE_CLIENT_SECRET,
  DEFAULT_FACEBOOK_APP_ID,
  DEFAULT_FACEBOOK_APP_SECRET,
  DEFAULT_RECAPTCHA_SITE_KEY,
  DEFAULT_RECAPTCHA_SECRET_KEY,
  DEFAULT_WEATHER_API_KEY,
  DEFAULT_ONESIGNAL_APP_ID,
  DEFAULT_ONESIGNAL_REST_KEY,
  DEFAULT_CLOUDINARY_CLOUD_NAME,
  DEFAULT_CLOUDINARY_API_KEY,
  DEFAULT_CLOUDINARY_API_SECRET,
  maskValue,
  getEffectiveGoogleKeys,
  getEffectiveFacebookKeys,
  getEffectiveRecaptchaKeys,
  getEffectiveWeatherKey,
  getEffectiveOneSignalKeys,
  getEffectiveCloudinaryKeys,
  getAdminApiKeysSummary,
};
