const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Account = require("../models/Account");
const SystemSetting = require("../models/SystemSetting");
const authenticate = require("../middleware/authenticate");
const { logAudit } = require("../services/auditLogger");
const {
  sendPasswordResetEmail,
  sendPasswordChangedNotificationEmail,
  sendAccountLockoutSecurityEmail,
} = require("../services/mailer");
const {
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
  DEFAULT_SMTP_USER,
  DEFAULT_SMTP_PASS,
  DEFAULT_SMTP_FROM,
  DEFAULT_GOOGLE_CALENDAR_CLIENT_ID,
  DEFAULT_GOOGLE_CALENDAR_CLIENT_SECRET,
  DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI,
  getEffectiveGoogleKeys,
  getEffectiveFacebookKeys,
  getEffectiveRecaptchaKeys,
  getEffectiveOneSignalKeys,
  getAdminApiKeysSummary,
} = require("../services/apiKeyManager");
const {
  clean,
  cleanEmail,
  fail,
  getSystemSetting,
  setSystemSetting,
  generateUserToken,
  requireAdmin,
  verifyRecaptcha,
} = require("./routeHelpers");

const router = express.Router();

// Helper to calculate sequential Cooperative ID
async function nextCooperativeId() {
  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `M${year}`;
  const regex = new RegExp(`^${prefix}(\\d{4})$`, "i");
  const accounts = await Account.find({ cooperativeId: regex }).select("cooperativeId").lean();
  const highest = accounts.reduce((max, a) => {
    const seq = parseInt(String(a.cooperativeId || "").slice(3), 10);
    return isNaN(seq) ? max : Math.max(max, seq);
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

// ---------- Registration & Verification ----------

router.post("/register", async (req, res) => {
  let fullName = clean(req.body.fullName);
  let firstName = clean(req.body.firstName);
  let middleName = clean(req.body.middleName || "");
  let lastName = clean(req.body.lastName);

  if (!fullName && (firstName || lastName)) {
    fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  }

  if (fullName && (!firstName && !lastName)) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  const email = cleanEmail(req.body.email);
  const password = String(req.body.password ?? "");
  let coopId = clean(req.body.cooperativeId);

  if (!fullName || !email) return fail(res, 400, "Full name and email are required.");
  if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
  if (await Account.exists({ email })) return fail(res, 409, "An account already exists for this email address.");

  const coopIdFormat = /^M\d{2}\d{4}$/i;
  if (coopId) {
    coopId = coopId.trim().toUpperCase();
    if (!coopIdFormat.test(coopId)) {
      return fail(res, 400, "Cooperative No ID must follow the format M(Year)(Sequence), for example M260001.");
    }
    const coopIdExists = await Account.exists({
      cooperativeId: { $regex: new RegExp(`^${coopId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (coopIdExists) {
      return fail(res, 409, "This Cooperative No ID is already registered.");
    }
  } else {
    coopId = await nextCooperativeId();
  }

  const account = await Account.create({
    firstName: firstName || "",
    middleName: middleName || "",
    lastName: lastName || "",
    fullName,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "member",
    cooperativeId: coopId,
    emailVerified: false,
    verificationStatus: "pending",
  });

  await logAudit({
    action: "USER_REGISTERED",
    actorEmail: email,
    actorRole: "member",
    targetEmail: email,
    targetName: fullName,
    targetRole: "member",
    details: `New member account created with ID ${coopId}`,
    req,
  });

  res.status(201).json(account);
});

router.post("/verify", async (req, res) => {
  return fail(res, 403, "waiting for verification");
});

// ---------- System Settings & Public Config ----------

router.get(["/config", "/auth/settings", "/settings/public"], async (req, res) => {
  const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
  const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
  const recaptchaEnabled = await getSystemSetting("recaptchaEnabled", process.env.RECAPTCHA_ENABLED !== "false");
  const weatherEnabled = await getSystemSetting("weatherEnabled", true);
  const oneSignalEnabled = await getSystemSetting("oneSignalEnabled", true);
  const cloudinaryEnabled = await getSystemSetting("cloudinaryEnabled", true);
  const emailResetEnabled = await getSystemSetting("emailResetEnabled", true);
  const googleCalendarEnabled = await getSystemSetting("googleCalendarEnabled", true);

  const { clientId: googleClientId } = await getEffectiveGoogleKeys();
  const { appId: facebookAppId } = await getEffectiveFacebookKeys();
  const { siteKey: recaptchaSiteKey } = await getEffectiveRecaptchaKeys();
  const { appId: oneSignalAppId } = await getEffectiveOneSignalKeys();

  res.json({
    recaptchaSiteKey,
    recaptchaEnabled: Boolean(recaptchaEnabled),
    googleClientId,
    googleLoginEnabled: Boolean(googleLoginEnabled),
    facebookAppId,
    facebookLoginEnabled: Boolean(facebookLoginEnabled),
    weatherEnabled: Boolean(weatherEnabled),
    oneSignalEnabled: Boolean(oneSignalEnabled),
    cloudinaryEnabled: Boolean(cloudinaryEnabled),
    emailResetEnabled: Boolean(emailResetEnabled),
    googleCalendarEnabled: Boolean(googleCalendarEnabled),
    oneSignalAppId: oneSignalAppId || "fc811113-559c-40c3-ba59-e703db896839",
  });
});

router.get("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
    const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
    const recaptchaEnabled = await getSystemSetting("recaptchaEnabled", process.env.RECAPTCHA_ENABLED !== "false");
    const weatherEnabled = await getSystemSetting("weatherEnabled", true);
    const oneSignalEnabled = await getSystemSetting("oneSignalEnabled", true);
    const cloudinaryEnabled = await getSystemSetting("cloudinaryEnabled", true);
    const emailResetEnabled = await getSystemSetting("emailResetEnabled", true);
    const googleCalendarEnabled = await getSystemSetting("googleCalendarEnabled", true);
    res.json({
      googleLoginEnabled: Boolean(googleLoginEnabled),
      facebookLoginEnabled: Boolean(facebookLoginEnabled),
      recaptchaEnabled: Boolean(recaptchaEnabled),
      weatherEnabled: Boolean(weatherEnabled),
      oneSignalEnabled: Boolean(oneSignalEnabled),
      cloudinaryEnabled: Boolean(cloudinaryEnabled),
      emailResetEnabled: Boolean(emailResetEnabled),
      googleCalendarEnabled: Boolean(googleCalendarEnabled),
    });
  } catch (err) {
    console.error("Error retrieving admin settings:", err);
    fail(res, 500, "Could not load settings.");
  }
});

router.put("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const updatedBy = req.admin?.email || "admin";
    const allowedKeys = [
      "googleLoginEnabled",
      "facebookLoginEnabled",
      "recaptchaEnabled",
      "weatherEnabled",
      "oneSignalEnabled",
      "cloudinaryEnabled",
      "emailResetEnabled",
      "googleCalendarEnabled",
    ];

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        const val = Boolean(req.body[key]);
        await setSystemSetting(
          key,
          val,
          `Administrator updated ${key}`,
          updatedBy
        );

        await logAudit({
          action: "SETTINGS_UPDATED",
          actorEmail: updatedBy,
          actorRole: req.admin?.role || "admin",
          details: `Administrator toggled ${key} to ${val ? "enabled" : "disabled"}`,
          status: "Success",
          req,
        });
      }
    }

    const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
    const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
    const recaptchaEnabled = await getSystemSetting("recaptchaEnabled", process.env.RECAPTCHA_ENABLED !== "false");
    const weatherEnabled = await getSystemSetting("weatherEnabled", true);
    const oneSignalEnabled = await getSystemSetting("oneSignalEnabled", true);
    const cloudinaryEnabled = await getSystemSetting("cloudinaryEnabled", true);
    const emailResetEnabled = await getSystemSetting("emailResetEnabled", true);
    const googleCalendarEnabled = await getSystemSetting("googleCalendarEnabled", true);

    res.json({
      ok: true,
      googleLoginEnabled: Boolean(googleLoginEnabled),
      facebookLoginEnabled: Boolean(facebookLoginEnabled),
      recaptchaEnabled: Boolean(recaptchaEnabled),
      weatherEnabled: Boolean(weatherEnabled),
      oneSignalEnabled: Boolean(oneSignalEnabled),
      cloudinaryEnabled: Boolean(cloudinaryEnabled),
      emailResetEnabled: Boolean(emailResetEnabled),
      googleCalendarEnabled: Boolean(googleCalendarEnabled),
      message: "Integration settings updated successfully.",
    });
  } catch (err) {
    console.error("Error updating admin settings:", err);
    fail(res, 500, "Failed to update settings.");
  }
});

router.post("/admin/settings/google-login", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "googleLoginEnabled",
      enabled,
      "Allow members and staff to authenticate using Google Sign-In",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Log in with Google`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      googleLoginEnabled: enabled,
      message: `Log in with Google has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving Google login setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/facebook-login", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "facebookLoginEnabled",
      enabled,
      "Allow members and staff to authenticate using Facebook Sign-In",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Log in with Facebook`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      facebookLoginEnabled: enabled,
      message: `Log in with Facebook has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving Facebook login setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/recaptcha", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "recaptchaEnabled",
      enabled,
      "Require Google reCAPTCHA verification on login and registration",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} reCAPTCHA security verification`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      recaptchaEnabled: enabled,
      message: `reCAPTCHA verification has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving reCAPTCHA setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/weather", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "weatherEnabled",
      enabled,
      "Allow manager calendar to fetch 3-day Kalilangan weather forecast",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Kalilangan Weather Forecast API integration`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      weatherEnabled: enabled,
      message: `Weather forecast integration has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving weather setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/onesignal", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "oneSignalEnabled",
      enabled,
      "Allow web push notifications via OneSignal for booking updates",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} OneSignal Web Push service`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      oneSignalEnabled: enabled,
      message: `OneSignal Web Push has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving OneSignal setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/cloudinary", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "cloudinaryEnabled",
      enabled,
      "Store uploaded profile and machinery photos on Cloudinary cloud storage",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Cloudinary media storage (fallback to local disk when disabled)`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      cloudinaryEnabled: enabled,
      message: `Cloudinary media storage has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving Cloudinary setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/email-reset", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "emailResetEnabled",
      enabled,
      "Allow members and staff to receive password reset and verification emails",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Gmail SMTP Password Reset email service`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      emailResetEnabled: enabled,
      message: `Gmail password reset service has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving email reset setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/google-calendar", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "googleCalendarEnabled",
      enabled,
      "Allow managers to connect and sync bookings to Google Calendar",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Google Calendar integration`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      googleCalendarEnabled: enabled,
      message: `Google Calendar integration has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving Google Calendar setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

// ---------- Customizable API Keys & Credentials (Admin Only) ----------

router.get(["/admin/api-keys", "/admin/integrations/keys"], requireAdmin, async (req, res) => {
  try {
    const summary = await getAdminApiKeysSummary();
    res.json({
      ok: true,
      data: summary,
      ...summary,
    });
  } catch (err) {
    console.error("Error retrieving API keys summary:", err);
    fail(res, 500, "Failed to load API keys summary.");
  }
});

router.post(["/admin/api-keys/google", "/admin/integrations/keys/google", "/admin/integrations/keys/google/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const clientId = clean(body.clientId);
    const clientSecret = clean(body.clientSecret);
    const defaultClientId = (process.env.DEFAULT_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID || "").trim();
    const defaultClientSecret = (process.env.DEFAULT_GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET || "").trim();
    const isMatchingDefault = clientId === defaultClientId && (!clientSecret || clientSecret === defaultClientSecret);
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || (!clientId && !clientSecret) || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customGoogleClientId" });
      await SystemSetting.findOneAndDelete({ key: "customGoogleClientSecret" });
      updateEnvFile({
        CUSTOM_GOOGLE_CLIENT_ID: "",
        CUSTOM_GOOGLE_CLIENT_SECRET: "",
      });
      process.env.GOOGLE_CLIENT_ID = defaultClientId;
      process.env.GOOGLE_CLIENT_SECRET = defaultClientSecret;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset Google OAuth credentials to default code keys",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          clientId: defaultClientId,
          clientSecret: defaultClientSecret,
        },
        message: "Google OAuth credentials reset to default code keys.",
      });
    }

    if (clientId) {
      await setSystemSetting(
        "customGoogleClientId",
        clientId,
        "Custom Google OAuth Client ID",
        updatedBy
      );
    }
    if (clientSecret) {
      await setSystemSetting(
        "customGoogleClientSecret",
        clientSecret,
        "Custom Google OAuth Client Secret",
        updatedBy
      );
    }

    updateEnvFile({
      CUSTOM_GOOGLE_CLIENT_ID: clientId || "",
      CUSTOM_GOOGLE_CLIENT_SECRET: clientSecret || "",
    });
    process.env.GOOGLE_CLIENT_ID = clientId || defaultClientId;
    process.env.GOOGLE_CLIENT_SECRET = clientSecret || defaultClientSecret;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator updated custom Google OAuth credentials",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom Google OAuth credentials saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom Google credentials:", err);
    fail(res, 500, "Failed to save Google credentials.");
  }
});

router.post(["/admin/api-keys/facebook", "/admin/integrations/keys/facebook", "/admin/integrations/keys/facebook/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const appId = clean(body.appId);
    const appSecret = clean(body.appSecret);
    const defaultAppId = (process.env.DEFAULT_FACEBOOK_APP_ID || DEFAULT_FACEBOOK_APP_ID || "").trim();
    const defaultAppSecret = (process.env.DEFAULT_FACEBOOK_APP_SECRET || DEFAULT_FACEBOOK_APP_SECRET || "").trim();
    const isMatchingDefault = appId === defaultAppId && (!appSecret || appSecret === defaultAppSecret);
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || (!appId && !appSecret) || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customFacebookAppId" });
      await SystemSetting.findOneAndDelete({ key: "customFacebookAppSecret" });
      updateEnvFile({
        CUSTOM_FACEBOOK_APP_ID: "",
        CUSTOM_FACEBOOK_APP_SECRET: "",
      });
      process.env.FACEBOOK_APP_ID = defaultAppId;
      process.env.FACEBOOK_APP_SECRET = defaultAppSecret;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset Facebook OAuth credentials to default code keys",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          appId: defaultAppId,
          appSecret: defaultAppSecret,
        },
        message: "Facebook OAuth credentials reset to default code keys.",
      });
    }

    if (appId) {
      await setSystemSetting(
        "customFacebookAppId",
        appId,
        "Custom Facebook App ID",
        updatedBy
      );
    }
    if (appSecret) {
      await setSystemSetting(
        "customFacebookAppSecret",
        appSecret,
        "Custom Facebook App Secret",
        updatedBy
      );
    }

    updateEnvFile({
      CUSTOM_FACEBOOK_APP_ID: appId || "",
      CUSTOM_FACEBOOK_APP_SECRET: appSecret || "",
    });
    process.env.FACEBOOK_APP_ID = appId || defaultAppId;
    process.env.FACEBOOK_APP_SECRET = appSecret || defaultAppSecret;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator updated custom Facebook OAuth credentials",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom Facebook OAuth credentials saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom Facebook credentials:", err);
    fail(res, 500, "Failed to save Facebook credentials.");
  }
});

router.post(["/admin/api-keys/recaptcha", "/admin/integrations/keys/recaptcha", "/admin/integrations/keys/recaptcha/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const siteKey = clean(body.siteKey);
    const secretKey = clean(body.secretKey);
    const defaultSiteKey = (process.env.DEFAULT_RECAPTCHA_SITE_KEY || DEFAULT_RECAPTCHA_SITE_KEY || "").trim();
    const defaultSecretKey = (process.env.DEFAULT_RECAPTCHA_SECRET_KEY || DEFAULT_RECAPTCHA_SECRET_KEY || "").trim();
    const isMatchingDefault = siteKey === defaultSiteKey && (!secretKey || secretKey === defaultSecretKey);
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || (!siteKey && !secretKey) || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customRecaptchaSiteKey" });
      await SystemSetting.findOneAndDelete({ key: "customRecaptchaSecretKey" });
      updateEnvFile({
        CUSTOM_RECAPTCHA_SITE_KEY: "",
        CUSTOM_RECAPTCHA_SECRET_KEY: "",
      });
      process.env.RECAPTCHA_SITE_KEY = defaultSiteKey;
      process.env.RECAPTCHA_SECRET_KEY = defaultSecretKey;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset Google reCAPTCHA credentials to default code keys",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          siteKey: defaultSiteKey,
          secretKey: defaultSecretKey,
        },
        message: "Google reCAPTCHA credentials reset to default code keys.",
      });
    }

    if (siteKey) {
      await setSystemSetting(
        "customRecaptchaSiteKey",
        siteKey,
        "Custom Google reCAPTCHA Site Key",
        updatedBy
      );
    }
    if (secretKey) {
      await setSystemSetting(
        "customRecaptchaSecretKey",
        secretKey,
        "Custom Google reCAPTCHA Secret Key",
        updatedBy
      );
    }

    updateEnvFile({
      CUSTOM_RECAPTCHA_SITE_KEY: siteKey || "",
      CUSTOM_RECAPTCHA_SECRET_KEY: secretKey || "",
    });
    process.env.RECAPTCHA_SITE_KEY = siteKey || defaultSiteKey;
    process.env.RECAPTCHA_SECRET_KEY = secretKey || defaultSecretKey;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator updated custom Google reCAPTCHA credentials",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom Google reCAPTCHA credentials saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom reCAPTCHA credentials:", err);
    fail(res, 500, "Failed to save reCAPTCHA credentials.");
  }
});

router.post(["/admin/api-keys/weather", "/admin/integrations/keys/weather", "/admin/integrations/keys/weather/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const key = clean(body.apiKey);
    const defaultKey = (process.env.DEFAULT_WEATHER_API_KEY || DEFAULT_WEATHER_API_KEY || "").trim();
    const isMatchingDefault = key === defaultKey;
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || !key || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customWeatherApiKey" });
      updateEnvFile({
        CUSTOM_WEATHER_API_KEY: "",
      });
      process.env.WEATHER_API_KEY = defaultKey;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset Kalilangan WeatherAPI key to default code key",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          apiKey: defaultKey,
        },
        message: "Weather API key reset to default code key.",
      });
    }

    await setSystemSetting(
      "customWeatherApiKey",
      key,
      "Custom WeatherAPI.com API Key",
      updatedBy
    );

    updateEnvFile({
      CUSTOM_WEATHER_API_KEY: key,
    });
    process.env.WEATHER_API_KEY = key;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator saved custom WeatherAPI key",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom Weather API key saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom weather API key:", err);
    fail(res, 500, "Failed to save Weather API key.");
  }
});

router.post(["/admin/api-keys/onesignal", "/admin/integrations/keys/onesignal", "/admin/integrations/keys/onesignal/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const appId = clean(body.appId);
    const restApiKey = clean(body.restApiKey);
    const defaultAppId = (process.env.DEFAULT_ONESIGNAL_APP_ID || DEFAULT_ONESIGNAL_APP_ID || "").trim();
    const defaultRestKey = (process.env.DEFAULT_ONESIGNAL_REST_KEY || process.env.DEFAULT_ONESIGNAL_REST_API_KEY || DEFAULT_ONESIGNAL_REST_KEY || "").trim();
    const isMatchingDefault = appId === defaultAppId && (!restApiKey || restApiKey === defaultRestKey);
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || (!appId && !restApiKey) || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customOneSignalAppId" });
      await SystemSetting.findOneAndDelete({ key: "customOneSignalRestApiKey" });
      updateEnvFile({
        CUSTOM_ONESIGNAL_APP_ID: "",
        CUSTOM_ONESIGNAL_REST_KEY: "",
      });
      process.env.ONESIGNAL_APP_ID = defaultAppId;
      process.env.ONESIGNAL_REST_API_KEY = defaultRestKey;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset OneSignal credentials to default code keys",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          appId: defaultAppId,
          restApiKey: defaultRestKey,
        },
        message: "OneSignal credentials reset to default code keys.",
      });
    }

    if (appId) {
      await setSystemSetting(
        "customOneSignalAppId",
        appId,
        "Custom OneSignal App ID",
        updatedBy
      );
    }
    if (restApiKey) {
      await setSystemSetting(
        "customOneSignalRestApiKey",
        restApiKey,
        "Custom OneSignal REST API Key",
        updatedBy
      );
    }

    updateEnvFile({
      CUSTOM_ONESIGNAL_APP_ID: appId || "",
      CUSTOM_ONESIGNAL_REST_KEY: restApiKey || "",
    });
    process.env.ONESIGNAL_APP_ID = appId || defaultAppId;
    process.env.ONESIGNAL_REST_API_KEY = restApiKey || defaultRestKey;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator saved custom OneSignal credentials",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom OneSignal credentials saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom OneSignal credentials:", err);
    fail(res, 500, "Failed to save OneSignal credentials.");
  }
});

router.post(["/admin/api-keys/cloudinary", "/admin/integrations/keys/cloudinary", "/admin/integrations/keys/cloudinary/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const cloudName = clean(body.cloudName);
    const apiKey = clean(body.apiKey);
    const apiSecret = clean(body.apiSecret);
    const defaultCloudName = (process.env.DEFAULT_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUDINARY_CLOUD_NAME || "").trim();
    const defaultApiKey = (process.env.DEFAULT_CLOUDINARY_API_KEY || DEFAULT_CLOUDINARY_API_KEY || "").trim();
    const defaultApiSecret = (process.env.DEFAULT_CLOUDINARY_API_SECRET || DEFAULT_CLOUDINARY_API_SECRET || "").trim();
    const isMatchingDefault = cloudName === defaultCloudName && (!apiKey || apiKey === defaultApiKey) && (!apiSecret || apiSecret === defaultApiSecret);
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || (!cloudName && !apiKey && !apiSecret) || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customCloudinaryCloudName" });
      await SystemSetting.findOneAndDelete({ key: "customCloudinaryApiKey" });
      await SystemSetting.findOneAndDelete({ key: "customCloudinaryApiSecret" });
      updateEnvFile({
        CUSTOM_CLOUDINARY_CLOUD_NAME: "",
        CUSTOM_CLOUDINARY_API_KEY: "",
        CUSTOM_CLOUDINARY_API_SECRET: "",
      });
      process.env.CLOUDINARY_CLOUD_NAME = defaultCloudName;
      process.env.CLOUDINARY_API_KEY = defaultApiKey;
      process.env.CLOUDINARY_API_SECRET = defaultApiSecret;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset Cloudinary credentials to default code keys",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          cloudName: defaultCloudName,
          apiKey: defaultApiKey,
          apiSecret: defaultApiSecret,
        },
        message: "Cloudinary credentials reset to default code keys.",
      });
    }

    if (cloudName) {
      await setSystemSetting(
        "customCloudinaryCloudName",
        cloudName,
        "Custom Cloudinary Cloud Name",
        updatedBy
      );
    }
    if (apiKey) {
      await setSystemSetting(
        "customCloudinaryApiKey",
        apiKey,
        "Custom Cloudinary API Key",
        updatedBy
      );
    }
    if (apiSecret) {
      await setSystemSetting(
        "customCloudinaryApiSecret",
        apiSecret,
        "Custom Cloudinary API Secret",
        updatedBy
      );
    }

    updateEnvFile({
      CUSTOM_CLOUDINARY_CLOUD_NAME: cloudName || "",
      CUSTOM_CLOUDINARY_API_KEY: apiKey || "",
      CUSTOM_CLOUDINARY_API_SECRET: apiSecret || "",
    });
    process.env.CLOUDINARY_CLOUD_NAME = cloudName || defaultCloudName;
    process.env.CLOUDINARY_API_KEY = apiKey || defaultApiKey;
    process.env.CLOUDINARY_API_SECRET = apiSecret || defaultApiSecret;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator saved custom Cloudinary credentials",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom Cloudinary credentials saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom Cloudinary credentials:", err);
    fail(res, 500, "Failed to save Cloudinary credentials.");
  }
});

router.post(["/admin/api-keys/email", "/admin/integrations/keys/email", "/admin/integrations/keys/email/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const user = clean(body.user || body.smtpUser);
    const pass = clean(body.pass || body.smtpPass);
    const from = clean(body.from || body.smtpFrom);
    const defaultUser = (process.env.DEFAULT_SMTP_USER || DEFAULT_SMTP_USER || "").trim();
    const defaultPass = (process.env.DEFAULT_SMTP_PASS || DEFAULT_SMTP_PASS || "").trim();
    const defaultFrom = (process.env.DEFAULT_SMTP_FROM || DEFAULT_SMTP_FROM || "").trim();
    const isMatchingDefault = user === defaultUser && (!pass || pass === defaultPass) && (!from || from === defaultFrom);
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || (!user && !pass && !from) || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customSmtpUser" });
      await SystemSetting.findOneAndDelete({ key: "customSmtpPass" });
      await SystemSetting.findOneAndDelete({ key: "customSmtpFrom" });
      updateEnvFile({
        CUSTOM_SMTP_USER: "",
        CUSTOM_SMTP_PASS: "",
        CUSTOM_SMTP_FROM: "",
      });
      process.env.SMTP_USER = defaultUser;
      process.env.SMTP_PASS = defaultPass;
      process.env.SMTP_FROM = defaultFrom;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset Gmail SMTP credentials to default code keys",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          user: defaultUser,
          pass: defaultPass,
          from: defaultFrom,
        },
        message: "Gmail SMTP credentials reset to default code keys.",
      });
    }

    if (user) {
      await setSystemSetting(
        "customSmtpUser",
        user,
        "Custom Gmail SMTP Username / Email",
        updatedBy
      );
    }
    if (pass) {
      await setSystemSetting(
        "customSmtpPass",
        pass,
        "Custom Gmail SMTP App Password",
        updatedBy
      );
    }
    if (from) {
      await setSystemSetting(
        "customSmtpFrom",
        from,
        "Custom SMTP Sender From Address",
        updatedBy
      );
    }

    updateEnvFile({
      CUSTOM_SMTP_USER: user || "",
      CUSTOM_SMTP_PASS: pass || "",
      CUSTOM_SMTP_FROM: from || "",
    });
    process.env.SMTP_USER = user || defaultUser;
    process.env.SMTP_PASS = pass || defaultPass;
    process.env.SMTP_FROM = from || defaultFrom;
    process.env.SMTP_PASS = pass || process.env.DEFAULT_SMTP_PASS || DEFAULT_SMTP_PASS;
    process.env.SMTP_FROM = from || process.env.DEFAULT_SMTP_FROM || DEFAULT_SMTP_FROM;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator saved custom Gmail SMTP credentials",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom Gmail SMTP credentials saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom Gmail SMTP credentials:", err);
    fail(res, 500, "Failed to save Gmail SMTP credentials.");
  }
});

router.post(["/admin/api-keys/calendar", "/admin/integrations/keys/calendar", "/admin/integrations/keys/calendar/reset"], requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const clientId = clean(body.clientId);
    const clientSecret = clean(body.clientSecret);
    const redirectUri = clean(body.redirectUri);
    const defaultClientId = (process.env.DEFAULT_GOOGLE_CALENDAR_CLIENT_ID || DEFAULT_GOOGLE_CALENDAR_CLIENT_ID || "").trim();
    const defaultClientSecret = (process.env.DEFAULT_GOOGLE_CALENDAR_CLIENT_SECRET || DEFAULT_GOOGLE_CALENDAR_CLIENT_SECRET || "").trim();
    const defaultRedirectUri = (process.env.DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI || DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI || "").trim();
    const isMatchingDefault = clientId === defaultClientId && (!clientSecret || clientSecret === defaultClientSecret) && (!redirectUri || redirectUri === defaultRedirectUri);
    const isReset = req.path.endsWith("/reset") || Boolean(body.reset) || (!clientId && !clientSecret && !redirectUri) || isMatchingDefault;
    const updatedBy = req.admin?.email || "admin";

    if (isReset) {
      await SystemSetting.findOneAndDelete({ key: "customCalendarClientId" });
      await SystemSetting.findOneAndDelete({ key: "customCalendarClientSecret" });
      await SystemSetting.findOneAndDelete({ key: "customCalendarRedirectUri" });
      updateEnvFile({
        CUSTOM_GOOGLE_CALENDAR_CLIENT_ID: "",
        CUSTOM_GOOGLE_CALENDAR_CLIENT_SECRET: "",
        CUSTOM_GOOGLE_CALENDAR_REDIRECT_URI: "",
      });
      process.env.GOOGLE_CALENDAR_CLIENT_ID = defaultClientId;
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET = defaultClientSecret;
      process.env.GOOGLE_CALENDAR_REDIRECT_URI = defaultRedirectUri;
      await logAudit({
        action: "SETTINGS_UPDATED",
        actorEmail: updatedBy,
        actorRole: req.admin?.role || "admin",
        details: "Administrator reset Google Calendar credentials to default code keys",
        status: "Success",
        req,
      });
      return res.json({
        ok: true,
        isCustom: false,
        defaultKeys: {
          clientId: defaultClientId,
          clientSecret: defaultClientSecret,
          redirectUri: defaultRedirectUri,
        },
        message: "Google Calendar credentials reset to default code keys.",
      });
    }

    if (clientId) {
      await setSystemSetting(
        "customCalendarClientId",
        clientId,
        "Custom Google Calendar OAuth Client ID",
        updatedBy
      );
    }
    if (clientSecret) {
      await setSystemSetting(
        "customCalendarClientSecret",
        clientSecret,
        "Custom Google Calendar OAuth Client Secret",
        updatedBy
      );
    }
    if (redirectUri) {
      await setSystemSetting(
        "customCalendarRedirectUri",
        redirectUri,
        "Custom Google Calendar OAuth Redirect URI",
        updatedBy
      );
    }

    updateEnvFile({
      CUSTOM_GOOGLE_CALENDAR_CLIENT_ID: clientId || "",
      CUSTOM_GOOGLE_CALENDAR_CLIENT_SECRET: clientSecret || "",
      CUSTOM_GOOGLE_CALENDAR_REDIRECT_URI: redirectUri || "",
    });
    process.env.GOOGLE_CALENDAR_CLIENT_ID = clientId || defaultClientId;
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = clientSecret || defaultClientSecret;
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = redirectUri || defaultRedirectUri;

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: "Administrator saved custom Google Calendar credentials",
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      isCustom: true,
      message: "Custom Google Calendar credentials saved successfully.",
    });
  } catch (err) {
    console.error("Error saving custom Google Calendar credentials:", err);
    fail(res, 500, "Failed to save Google Calendar credentials.");
  }
});

// ---------- Core Login & Password Recovery ----------

router.post("/login", async (req, res) => {
  const isHuman = await verifyRecaptcha(req.body.recaptchaToken);
  if (!isHuman) return fail(res, 400, "reCAPTCHA verification failed. Please check the 'I'm not a robot' box.");

  const identifier = clean(req.body.email || req.body.identifier);
  const password = String(req.body.password ?? "");
  const account = await Account.findOne({
    $or: [
      { email: cleanEmail(identifier) },
      { cooperativeId: identifier },
      { cooperativeId: identifier.toUpperCase() },
      { cooperativeId: { $regex: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
    ],
  });

  if (!account) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: identifier,
      actorRole: "guest",
      details: "Sign-in rejected: account not found in database",
      status: "Failed",
      req,
    });
    return fail(res, 401, "No account was found for this Member ID or email.");
  }

  const email = account.email;

  // 1. Check if account is temporarily locked due to brute force login attempts
  if (account.lockoutUntil && account.lockoutUntil > new Date()) {
    const remainingMinutes = Math.ceil((account.lockoutUntil.getTime() - Date.now()) / 60000);
    return fail(
      res,
      429,
      `Too many failed login attempts. Your account has been temporarily locked for ${remainingMinutes} more minute${remainingMinutes > 1 ? "s" : ""} for security. A security alert was sent to ${email}.`
    );
  }

  if (!account.emailVerified || account.verificationStatus === "pending") {
    const isDeclined = account.verificationStatus === "declined";
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      details: isDeclined
        ? "Sign-in rejected: account registration was declined by administrator"
        : "Sign-in rejected: waiting for verification",
      status: "Denied",
      req,
    });
    return fail(
      res,
      403,
      isDeclined
        ? "Your account registration was declined by the cooperative administrator. Please contact the KIMPC office for assistance."
        : "waiting for verification"
    );
  }

  if (account.isSuspended) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `Sign-in rejected: account has been deactivated (${account.suspensionReason || "Administrative deactivation"})`,
      status: "Denied",
      req,
    });
    return fail(
      res,
      403,
      `This account has been deactivated by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`
    );
  }

  if (account.isArchived) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: "Sign-in rejected: account is in archive folder",
      status: "Denied",
      req,
    });
    return fail(res, 403, "This account is currently archived and inactive. Please contact the administrator.");
  }

  const passwordValid = await bcrypt.compare(password, account.passwordHash);
  if (!passwordValid) {
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_MINUTES = 15;
    const nextAttempts = (account.failedLoginAttempts || 0) + 1;
    account.failedLoginAttempts = nextAttempts;

    if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
      account.lockoutUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      account.failedLoginAttempts = 0; // reset counter once locked
      await account.save();

      const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress || "";
      const userAgent = req.headers["user-agent"] || "";
      const clientUrl = process.env.APP_BASE_URL || "http://localhost:5173";
      const resetPasswordUrl = `${clientUrl}/forgot-password`;

      await logAudit({
        action: "ACCOUNT_LOCKED",
        actorEmail: email,
        actorRole: account.role,
        targetEmail: email,
        targetName: account.fullName,
        details: `Account temporarily locked for ${LOCKOUT_MINUTES} minutes after ${MAX_LOGIN_ATTEMPTS} consecutive failed sign-in attempts. Security notification email dispatched.`,
        status: "Locked",
        req,
      });

      // Dispatch security alert email to account owner (member, manager, or admin)
      try {
        await sendAccountLockoutSecurityEmail({
          toEmail: email,
          fullName: account.fullName,
          role: account.role,
          attempts: MAX_LOGIN_ATTEMPTS,
          lockoutMinutes: LOCKOUT_MINUTES,
          ipAddress,
          userAgent,
          resetPasswordUrl,
        });
      } catch (mailErr) {
        console.error("[Login Security] Failed to dispatch account lockout email:", mailErr);
      }

      return fail(
        res,
        429,
        `Too many failed login attempts. Your account has been temporarily locked for ${LOCKOUT_MINUTES} minutes for security. A security alert email has been sent to your registered email address.`
      );
    }

    await account.save();
    const attemptsLeft = MAX_LOGIN_ATTEMPTS - nextAttempts;

    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      details: `Sign-in rejected: invalid password entered (${nextAttempts}/${MAX_LOGIN_ATTEMPTS} attempts)`,
      status: "Failed",
      req,
    });
    return fail(
      res,
      401,
      `The email or password is incorrect. (${attemptsLeft} attempt${attemptsLeft > 1 ? "s" : ""} remaining before temporary lock)`
    );
  }

  // Password correct: reset failed login attempts & clear any lockout
  if (account.failedLoginAttempts || account.lockoutUntil) {
    account.failedLoginAttempts = 0;
    account.lockoutUntil = null;
    await account.save();
  }

  await logAudit({
    action: "USER_LOGIN",
    actorEmail: email,
    actorRole: account.role,
    targetEmail: email,
    targetName: account.fullName,
    details: `User signed in successfully to ${account.role} portal`,
    req,
  });

  const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
  responseData.token = generateUserToken(account);
  res.json(responseData);
});


// ---------- Email-Based Password Reset Recovery ----------

// In-memory rate limiting map (IP: max 5 requests / 15m; Email: max 3 requests / 15m)
const resetRateLimits = new Map();
function checkResetRateLimit(key, maxLimit, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const record = resetRateLimits.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  resetRateLimits.set(key, record);
  return record.count <= maxLimit;
}

// Periodically clean up expired rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of resetRateLimits.entries()) {
    if (now > record.resetAt) resetRateLimits.delete(key);
  }
}, 10 * 60 * 1000).unref();

const FORGOT_GENERIC_MESSAGE =
  "If an eligible account exists for this Cooperative No. ID or email, we’ll send a password reset link to the registered email address.";

/**
 * POST /api/auth/forgot-password & /api/forgot-password
 * Initiates email-based password reset. Generates random token, stores SHA-256 hash, and emails reset link.
 */
router.post(
  ["/auth/forgot-password", "/forgot-password", "/auth/forgot-password-request"],
  async (req, res) => {
  const startTime = Date.now();
  const MIN_DELAY_MS = 380; // Mitigate timing-based email enumeration

  try {
    const rawIdentifier = clean(req.body.email || req.body.identifier);

    if (!rawIdentifier) {
      return fail(res, 400, "Please enter your Cooperative No. ID or registered email.");
    }

    const emailResetEnabled = await getSystemSetting("emailResetEnabled", true);
    if (emailResetEnabled === false) {
      return fail(res, 403, "Password reset email delivery is currently disabled by administrator. Please contact your cooperative manager.");
    }

    // Rate limiting checks by IP and Identifier
    const clientIp = (req.ip || req.headers["x-forwarded-for"] || "127.0.0.1")
      .split(",")[0]
      .trim();

    const ipAllowed = checkResetRateLimit(`ip:${clientIp}`, 8, 15 * 60 * 1000);
    const idAllowed = checkResetRateLimit(`id:${rawIdentifier.toLowerCase()}`, 5, 15 * 60 * 1000);

    if (!ipAllowed || !idAllowed) {
      return fail(res, 429, "Too many password reset requests. Please try again in 15 minutes.");
    }

    const emailCandidate = cleanEmail(rawIdentifier);
    const coopUpper = rawIdentifier.toUpperCase();

    // Locate account matching either email OR Cooperative No. ID (case-insensitive)
    const account = await Account.findOne({
      $or: [
        { email: emailCandidate },
        { cooperativeId: rawIdentifier },
        { cooperativeId: coopUpper },
        { cooperativeId: { $regex: new RegExp(`^${rawIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
      ],
    });

    // Enforce account eligibility rules
    const isEligible =
      account &&
      !account.isSuspended &&
      !account.isArchived &&
      account.emailVerified !== false &&
      account.verificationStatus !== "declined";

    if (isEligible) {
      // Generate unguessable 256-bit cryptographically secure token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      const expiryMinutes = Math.max(1, Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 5);
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      // Store SHA-256 hash and expiry, replacing any previous token
      account.resetPasswordToken = hashedToken;
      account.resetPasswordExpires = expiresAt;
      account.forgotPasswordRequested = true;
      await account.save();

      // Build trusted reset link (prioritizing current browser origin if available, then APP_BASE_URL)
      const appBaseUrl = (
        req.get("origin") ||
        process.env.APP_BASE_URL ||
        `${req.protocol}://${req.get("host")}`
      ).trim().replace(/\/+$/, "");

      const resetLink = `${appBaseUrl}/reset-password?token=${rawToken}`;

      console.log(`\n============================================================`);
      console.log(`🔑 [PASSWORD RESET LINK GENERATED]`);
      console.log(`   Account: ${account.fullName}`);
      console.log(`   Cooperative ID: ${account.cooperativeId || 'N/A'}`);
      console.log(`   Registered Email: ${account.email}`);
      console.log(`   Reset URL: ${resetLink}`);
      console.log(`============================================================\n`);

      // Dispatch email through configured service (Resend or SMTP)
      await sendPasswordResetEmail({
        toEmail: account.email,
        resetLink,
        fullName: account.fullName,
        expiryMinutes,
      });

      await logAudit({
        action: "PASSWORD_RESET_REQUESTED",
        actorEmail: account.email,
        actorRole: account.role,
        targetEmail: account.email,
        targetName: account.fullName,
        details: `Password reset link dispatched via email (valid for ${expiryMinutes} minutes).`,
        status: "Success",
        req,
      });
    } else {
      // Audit log attempt for non-existent / ineligible identifier without leaking to client
      await logAudit({
        action: "PASSWORD_RESET_REQUESTED",
        actorEmail: rawIdentifier,
        actorRole: "guest",
        targetEmail: rawIdentifier,
        details: "Password reset requested for unknown or ineligible account (generic response returned).",
        status: "Success",
        req,
      });
    }

    // Constant-time artificial delay to prevent latency-based enumeration
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
    }

    // Always return generic success message
    return res.json({
      ok: true,
      message: FORGOT_GENERIC_MESSAGE,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
    }
    return fail(res, 500, "Could not process password reset request at this time.");
  }
});

/**
 * GET /api/auth/verify-reset-token & /api/verify-reset-token
 * Validates reset token status before showing input form.
 */
router.get(["/auth/verify-reset-token", "/verify-reset-token"], async (req, res) => {
  const rawToken = String(req.query.token || "").trim();
  if (!rawToken) {
    return fail(res, 400, "Password reset token is missing.");
  }

  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const account = await Account.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() },
    isArchived: { $ne: true },
    isSuspended: { $ne: true },
  }).select("_id email fullName role");

  if (!account) {
    return fail(res, 400, "This password reset link is invalid, expired, or has already been used.");
  }

  return res.json({
    ok: true,
    valid: true,
    email: account.email,
    fullName: account.fullName,
  });
});

/**
 * POST /api/auth/reset-password & /api/reset-password
 * Verifies token, validates password policy, updates password atomically, invalidates sessions, and sends notification.
 */
router.post(["/auth/reset-password", "/reset-password"], async (req, res) => {
  try {
    const rawToken = String(req.body.token || "").trim();
    const newPassword = String(req.body.newPassword || "").trim();
    const confirmPassword = String(req.body.confirmPassword || "").trim();

    if (!rawToken) {
      return fail(res, 400, "Password reset token is required.");
    }

    if (!newPassword || !confirmPassword) {
      return fail(res, 400, "New password and password confirmation are required.");
    }

    if (newPassword !== confirmPassword) {
      return fail(res, 400, "Confirmation password does not match.");
    }

    // Enforce existing password policy: at least 6 characters
    if (newPassword.length < 6) {
      return fail(res, 400, "Password must be at least 6 characters.");
    }

    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Atomically find account with valid token, update password, unset token & expiry, and bump tokenVersion.
    // Using atomic findOneAndUpdate prevents race conditions and simultaneous reuse of the same token.
    const updatedAccount = await Account.findOneAndUpdate(
      {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() },
        isArchived: { $ne: true },
        isSuspended: { $ne: true },
      },
      {
        $set: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          forgotPasswordRequested: false,
          oneTimePasswordSetAt: null,
        },
        $unset: {
          resetPasswordToken: 1,
          resetPasswordExpires: 1,
        },
        $inc: {
          tokenVersion: 1, // Invalidates all existing active JWTs and sessions across devices
        },
      },
      { new: true }
    );

    if (!updatedAccount) {
      // Check if token exists in DB but expired or already consumed
      const existingTokenAcc = await Account.findOne({ resetPasswordToken: hashedToken });
      if (existingTokenAcc) {
        return fail(res, 400, "This password reset link has expired or has already been used. Please request a new one.");
      }
      return fail(res, 400, "This password reset link is invalid or has expired. Please request a new link.");
    }

    // Dispatch confirmation email
    sendPasswordChangedNotificationEmail({
      toEmail: updatedAccount.email,
      fullName: updatedAccount.fullName,
    }).catch((err) => console.error("Could not send password change confirmation email:", err));

    // Audit log without passwords or tokens
    await logAudit({
      action: "PASSWORD_RESET_SUCCESS",
      actorEmail: updatedAccount.email,
      actorRole: updatedAccount.role,
      targetEmail: updatedAccount.email,
      targetName: updatedAccount.fullName,
      details: "Password was reset successfully via email verification token. Active sessions invalidated.",
      status: "Success",
      req,
    });

    return res.json({
      ok: true,
      message: "Your password has been successfully reset! You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return fail(res, 500, "Could not reset password. Please try again later.");
  }
});



// ---------- Social Authentication (Google & Facebook) ----------

router.post("/auth/google", async (req, res) => {
  try {
    let email = cleanEmail(req.body.email);
    let fullName = clean(req.body.fullName);
    const credential = req.body.credential;

    if (credential && typeof credential === "string") {
      try {
        const parts = credential.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
          if (payload.email) {
            email = cleanEmail(payload.email);
            fullName = clean(payload.name || payload.given_name || fullName || "Google Member");
          }
        }
      } catch (err) {
        console.warn("Could not parse Google credential JWT:", err);
      }
    }

    const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
    if (!googleLoginEnabled) {
      await logAudit({
        action: "LOGIN_FAILED",
        actorEmail: email || "unknown@google.com",
        actorRole: "guest",
        details: "Google Sign-In rejected: Log in with Google has been disabled by the system administrator.",
        status: "Denied",
        req,
      });
      return fail(res, 403, "Log in with Google is currently disabled by the system administrator.");
    }

    if (!email) {
      return fail(res, 400, "Google account email is required.");
    }

    let account = await Account.findOne({ email });

    if (account) {
      if (account.isSuspended) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: `Google sign-in rejected: account has been suspended (${account.suspensionReason || "Administrative restriction"})`,
          status: "Denied",
          req,
        });
        return fail(
          res,
          403,
          `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`
        );
      }

      if (account.isArchived) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: "Google sign-in rejected: account is currently in the archive folder",
          status: "Denied",
          req,
        });
        return fail(res, 403, "This account is currently archived. Please contact the administrator.");
      }

      if (!account.emailVerified || account.verificationStatus === "pending") {
        const isDeclined = account.verificationStatus === "declined";
        return fail(
          res,
          403,
          isDeclined
            ? "Your account registration was declined by the cooperative administrator."
            : "waiting for verification"
        );
      }
    } else {
      const cooperativeId = await nextCooperativeId();
      const randomPassword = crypto.randomBytes(16).toString("hex");
      account = await Account.create({
        fullName: fullName || "Google Member",
        email,
        passwordHash: await bcrypt.hash(randomPassword, 10),
        role: "member",
        cooperativeId,
        emailVerified: false,
        verificationStatus: "pending",
      });

      await logAudit({
        action: "ACCOUNT_CREATED",
        actorEmail: email,
        actorRole: "member",
        targetEmail: email,
        targetName: account.fullName,
        targetRole: "member",
        details: `New member registered via Google sign-in (assigned ID: ${cooperativeId}), waiting for admin verification`,
        req,
      });

      return fail(res, 403, "waiting for verification");
    }

    await logAudit({
      action: "USER_LOGIN",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `User signed in successfully with Google to ${account.role} portal`,
      req,
    });

    const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
    responseData.token = generateUserToken(account);
    res.json(responseData);
  } catch (error) {
    console.error("Google authentication error:", error);
    res.status(500).json({ error: "Google authentication failed. Please try again." });
  }
});

router.post("/auth/facebook", async (req, res) => {
  try {
    const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
    if (!facebookLoginEnabled) {
      await logAudit({
        action: "LOGIN_FAILED",
        actorEmail: "facebook-user",
        actorRole: "guest",
        details: "Facebook Sign-In rejected: Log in with Facebook has been disabled by the system administrator.",
        status: "Denied",
        req,
      });
      return fail(res, 403, "Log in with Facebook is currently disabled by the system administrator.");
    }

    const { accessToken, userID } = req.body;
    let email = cleanEmail(req.body.email);
    let fullName = clean(req.body.name || req.body.fullName);
    let fbId = clean(userID || req.body.id);

    if (accessToken) {
      try {
        const fbUrl = `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(accessToken)}`;
        const fbResponse = await fetch(fbUrl);
        if (fbResponse.ok) {
          const fbData = await fbResponse.json();
          if (fbData.id) fbId = fbData.id;
          if (fbData.name) fullName = clean(fbData.name);
          if (fbData.email) email = cleanEmail(fbData.email);
        } else {
          console.warn("Facebook Graph API validation returned warning:", await fbResponse.text());
        }
      } catch (err) {
        console.warn("Could not reach Facebook Graph API:", err);
      }
    }

    if (!email && fbId) {
      email = `fb_${fbId}@facebook.member.minders`;
    }

    if (!email) {
      return fail(res, 400, "Facebook account email or user ID is required.");
    }

    let account = await Account.findOne({
      $or: [{ email }, ...(fbId ? [{ email: `fb_${fbId}@facebook.member.minders` }] : [])],
    });

    if (account) {
      if (account.isSuspended) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: `Facebook sign-in rejected: account has been suspended (${account.suspensionReason || "Administrative restriction"})`,
          status: "Denied",
          req,
        });
        return fail(
          res,
          403,
          `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`
        );
      }

      if (account.isArchived) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: "Facebook sign-in rejected: account is currently in the archive folder",
          status: "Denied",
          req,
        });
        return fail(res, 403, "This account is currently archived. Please contact the administrator.");
      }

      if (!account.emailVerified || account.verificationStatus === "pending") {
        const isDeclined = account.verificationStatus === "declined";
        return fail(
          res,
          403,
          isDeclined
            ? "Your account registration was declined by the cooperative administrator."
            : "waiting for verification"
        );
      }
    } else {
      const cooperativeId = await nextCooperativeId();
      const randomPassword = crypto.randomBytes(16).toString("hex");
      account = await Account.create({
        fullName: fullName || "Facebook Member",
        email,
        passwordHash: await bcrypt.hash(randomPassword, 10),
        role: "member",
        cooperativeId,
        emailVerified: false,
        verificationStatus: "pending",
      });

      await logAudit({
        action: "ACCOUNT_CREATED",
        actorEmail: email,
        actorRole: "member",
        targetEmail: email,
        targetName: account.fullName,
        targetRole: "member",
        details: `New member registered via Facebook sign-in (assigned ID: ${cooperativeId}), waiting for admin verification`,
        req,
      });

      return fail(res, 403, "waiting for verification");
    }

    await logAudit({
      action: "USER_LOGIN",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `User signed in successfully with Facebook to ${account.role} portal`,
      req,
    });

    const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
    responseData.token = generateUserToken(account);
    res.json(responseData);
  } catch (error) {
    console.error("Facebook authentication error:", error);
    res.status(500).json({ error: "Facebook authentication failed. Please try again." });
  }
});

// ---------- Authenticated User Profile & Password Management (Admin, Manager, Member) ----------

// Get current authenticated user's profile information
router.get("/auth/me", authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.user._id).select("-passwordHash -adminPinHash").lean();
    if (!account) return fail(res, 404, "Account not found.");
    res.json(account);
  } catch (error) {
    console.error("Fetch current profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile information." });
  }
});

// Authenticated user changes their own password
router.post("/auth/change-password", authenticate, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "").trim();
    const newPassword = String(req.body.newPassword || "").trim();
    const confirmPassword = String(req.body.confirmPassword || "").trim();

    if (!currentPassword || !newPassword) {
      return fail(res, 400, "Current and new passwords are required.");
    }
    if (newPassword.length < 6) {
      return fail(res, 400, "New password must be at least 6 characters.");
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      return fail(res, 400, "New passwords do not match.");
    }

    const account = await Account.findById(req.user._id).select("+passwordHash");
    if (!account) return fail(res, 404, "Account not found.");

    const match = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!match) {
      return fail(res, 401, "Current password is incorrect.");
    }

    account.passwordHash = await bcrypt.hash(newPassword, 10);
    account.mustChangePassword = false;
    await account.save();

    await logAudit({
      action: "PASSWORD_CHANGED",
      actorEmail: account.email,
      actorRole: account.role,
      targetEmail: account.email,
      targetName: account.fullName,
      details: `${account.role} ${account.fullName} updated their account password`,
      req,
    });

    return res.json({ ok: true, message: "Password updated successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Failed to update password." });
  }
});

// Authenticated user updates their own profile details
router.patch("/auth/profile", authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.user._id);
    if (!account) return fail(res, 404, "Account not found.");

    if (req.body.fullName) account.fullName = clean(req.body.fullName);
    if (req.body.phone !== undefined) account.phone = clean(req.body.phone);
    if (req.body.address !== undefined) account.address = clean(req.body.address);
    if (req.body.city !== undefined) account.city = clean(req.body.city);

    await account.save();

    await logAudit({
      action: "PROFILE_UPDATED",
      actorEmail: account.email,
      actorRole: account.role,
      targetEmail: account.email,
      targetName: account.fullName,
      details: `${account.role} ${account.fullName} updated personal profile details`,
      req,
    });

    const responseData = account.toJSON ? account.toJSON() : account;
    delete responseData.passwordHash;
    delete responseData.adminPinHash;
    return res.json({ ok: true, user: responseData });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

module.exports = router;

