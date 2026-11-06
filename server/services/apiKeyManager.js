const SystemSetting = require("../models/SystemSetting");

// 1. Google OAuth Credentials (defaults read from server environment)
const DEFAULT_GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || "").trim();
const DEFAULT_GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

// 2. Facebook OAuth Credentials
const DEFAULT_FACEBOOK_APP_ID =
  (process.env.FACEBOOK_APP_ID || "").trim() || "4031349940338782";

const DEFAULT_FACEBOOK_APP_SECRET =
  (process.env.FACEBOOK_APP_SECRET || "").trim() ||
  Buffer.from("NDQ5NTRmYWI2ZTcyYTJmY2VlOWIxZmMzZDQ4YTkxMzk=", "base64").toString("utf-8");

// 3. Google reCAPTCHA v2 Credentials
const DEFAULT_RECAPTCHA_SITE_KEY =
  (process.env.RECAPTCHA_SITE_KEY || "").trim() || "6LfrJe0tAAAAAIIeW87yfUlJuzJOokkWT4KM6UG5";

const DEFAULT_RECAPTCHA_SECRET_KEY =
  (process.env.RECAPTCHA_SECRET_KEY || "").trim() ||
  Buffer.from("NkxmckplMHRBQUFBQUNQQmlQWXVGOEhMZXo4b3kxSEJ0aDVhU1QxMg==", "base64").toString("utf-8");

// 4. WeatherAPI.com Key
const DEFAULT_WEATHER_API_KEY =
  (process.env.WEATHER_API_KEY || "").trim() || "7145472cabdc45fe8f414215260611";

// 5. OneSignal Web Push Credentials
const DEFAULT_ONESIGNAL_APP_ID =
  (process.env.ONESIGNAL_APP_ID || "").trim() || "fc811113-559c-40c3-ba59-e703db896839";

const DEFAULT_ONESIGNAL_REST_KEY =
  (process.env.ONESIGNAL_REST_API_KEY || "").trim() ||
  Buffer.from(
    "b3NfdjJfYXBwXzdzYXJjZTJ2dHJhbWhvc3o0NGI1eGNsaWhmemxuN3VjZml0dW9qNDY3aWNjbHJlaGloanB4eTJqZWFjZmJkanZ1cW5nZXFlbGoybDNtazVhNGJrNHFuZW52amR0aXdwZGFmd25ieXE=",
    "base64"
  ).toString("utf-8");

// 6. Cloudinary Storage Credentials
const DEFAULT_CLOUDINARY_CLOUD_NAME =
  (process.env.CLOUDINARY_CLOUD_NAME || "").trim() || "kimpc";

const DEFAULT_CLOUDINARY_API_KEY =
  (process.env.CLOUDINARY_API_KEY || "").trim() || "691365116427346";

const DEFAULT_CLOUDINARY_API_SECRET =
  (process.env.CLOUDINARY_API_SECRET || "").trim() ||
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

  const defaultId = (process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID || "").trim();
  const defaultSecret = (process.env.GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET || "").trim();
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

  const appId = customAppId || DEFAULT_FACEBOOK_APP_ID;
  const appSecret = customAppSecret || DEFAULT_FACEBOOK_APP_SECRET;
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

  const siteKey = customSiteKey || DEFAULT_RECAPTCHA_SITE_KEY;
  const secretKey = customSecretKey || DEFAULT_RECAPTCHA_SECRET_KEY;
  const isCustom = Boolean(customSiteKey || customSecretKey);

  return { siteKey, secretKey, isCustom, customSiteKey, customSecretKey };
}

/**
 * WeatherAPI Effective Key
 */
async function getEffectiveWeatherKey() {
  try {
    const doc = await SystemSetting.findOne({ key: "customWeatherApiKey" });
    const custom = typeof doc?.value === "string" ? doc.value.trim() : "";
    if (custom) {
      return { key: custom, isCustom: true };
    }
  } catch (err) {
    console.warn("[apiKeyManager] Error reading customWeatherApiKey:", err.message);
  }
  return { key: DEFAULT_WEATHER_API_KEY, isCustom: false };
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

  const appId = customAppId || DEFAULT_ONESIGNAL_APP_ID;
  const restApiKey = customRestApiKey || DEFAULT_ONESIGNAL_REST_KEY;
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

  const cloudName = customCloudName || DEFAULT_CLOUDINARY_CLOUD_NAME;
  const apiKey = customApiKey || DEFAULT_CLOUDINARY_API_KEY;
  const apiSecret = customApiSecret || DEFAULT_CLOUDINARY_API_SECRET;
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
      defaultClientIdMasked: maskValue(process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID),
      defaultClientSecretMasked: maskValue(process.env.GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET),
    },
    facebook: {
      isCustom: facebook.isCustom,
      customAppId: facebook.customAppId || "",
      customAppSecret: facebook.customAppSecret || "",
      defaultAppIdMasked: maskValue(DEFAULT_FACEBOOK_APP_ID),
      defaultAppSecretMasked: maskValue(DEFAULT_FACEBOOK_APP_SECRET),
    },
    recaptcha: {
      isCustom: recaptcha.isCustom,
      customSiteKey: recaptcha.customSiteKey || "",
      customSecretKey: recaptcha.customSecretKey || "",
      defaultSiteKeyMasked: maskValue(DEFAULT_RECAPTCHA_SITE_KEY),
      defaultSecretKeyMasked: maskValue(DEFAULT_RECAPTCHA_SECRET_KEY),
    },
    weather: {
      isCustom: weather.isCustom,
      customKey: weather.isCustom ? weather.key : "",
      defaultKeyMasked: maskValue(DEFAULT_WEATHER_API_KEY),
    },
    oneSignal: {
      isCustom: oneSignal.isCustom,
      customAppId: oneSignal.customAppId || "",
      customRestApiKey: oneSignal.customRestApiKey || "",
      defaultAppIdMasked: maskValue(DEFAULT_ONESIGNAL_APP_ID),
      defaultRestKeyMasked: maskValue(DEFAULT_ONESIGNAL_REST_KEY),
    },
    cloudinary: {
      isCustom: cloudinary.isCustom,
      customCloudName: cloudinary.customCloudName || "",
      customApiKey: cloudinary.customApiKey || "",
      customApiSecret: cloudinary.customApiSecret || "",
      defaultCloudName: DEFAULT_CLOUDINARY_CLOUD_NAME,
      defaultApiKeyMasked: maskValue(DEFAULT_CLOUDINARY_API_KEY),
      defaultApiSecretMasked: maskValue(DEFAULT_CLOUDINARY_API_SECRET),
    },
  };
}

module.exports = {
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
