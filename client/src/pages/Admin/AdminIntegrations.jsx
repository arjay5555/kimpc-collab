import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AdminIntegrations() {
  const [settings, setSettings] = useState({
    googleLoginEnabled: true,
    facebookLoginEnabled: true,
    recaptchaEnabled: true,
    weatherEnabled: true,
    oneSignalEnabled: true,
    cloudinaryEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ message: "", isError: false });
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'auth' | 'services'
  const [searchQuery, setSearchQuery] = useState("");

  // Customizable API Keys State
  const [apiKeys, setApiKeys] = useState({
    google: { isCustom: false, customClientId: "", customClientSecret: "", defaultClientIdMasked: "", defaultClientSecretMasked: "" },
    facebook: { isCustom: false, customAppId: "", customAppSecret: "", defaultAppIdMasked: "", defaultAppSecretMasked: "" },
    recaptcha: { isCustom: false, customSiteKey: "", customSecretKey: "", defaultSiteKeyMasked: "", defaultSecretKeyMasked: "" },
    weather: { isCustom: false, customKey: "", defaultKeyMasked: "" },
    oneSignal: { isCustom: false, customAppId: "", customRestApiKey: "", defaultAppIdMasked: "", defaultRestKeyMasked: "" },
    cloudinary: { isCustom: false, customCloudName: "", customApiKey: "", customApiSecret: "", defaultCloudName: "", defaultApiKeyMasked: "", defaultApiSecretMasked: "" },
  });

  const [keyForms, setKeyForms] = useState({
    googleClientId: "",
    googleClientSecret: "",
    facebookAppId: "",
    facebookAppSecret: "",
    recaptchaSiteKey: "",
    recaptchaSecretKey: "",
    weatherApiKey: "",
    oneSignalAppId: "",
    oneSignalRestApiKey: "",
    cloudinaryCloudName: "",
    cloudinaryApiKey: "",
    cloudinaryApiSecret: "",
  });

  const [expandedKeys, setExpandedKeys] = useState({
    google: false,
    facebook: false,
    recaptcha: false,
    weather: false,
    oneSignal: false,
    cloudinary: false,
  });

  const [revealSecrets, setRevealSecrets] = useState({
    google: false,
    facebook: false,
    recaptcha: false,
    weather: false,
    oneSignal: false,
    cloudinary: false,
  });

  const [keyFeedback, setKeyFeedback] = useState({});
  const [keySaving, setKeySaving] = useState({});

  const loadApiKeys = async () => {
    const { ok, data } = await api("/admin/api-keys");
    if (ok && data) {
      setApiKeys(data);
      setKeyForms({
        googleClientId: data.google?.customClientId || "",
        googleClientSecret: data.google?.customClientSecret || "",
        facebookAppId: data.facebook?.customAppId || "",
        facebookAppSecret: data.facebook?.customAppSecret || "",
        recaptchaSiteKey: data.recaptcha?.customSiteKey || "",
        recaptchaSecretKey: data.recaptcha?.customSecretKey || "",
        weatherApiKey: data.weather?.customKey || "",
        oneSignalAppId: data.oneSignal?.customAppId || "",
        oneSignalRestApiKey: data.oneSignal?.customRestApiKey || "",
        cloudinaryCloudName: data.cloudinary?.customCloudName || "",
        cloudinaryApiKey: data.cloudinary?.customApiKey || "",
        cloudinaryApiSecret: data.cloudinary?.customApiSecret || "",
      });
    }
  };

  const loadConfig = async () => {
    const { ok, data } = await api("/config");
    if (ok && data) {
      setSettings({
        googleLoginEnabled: data.googleLoginEnabled !== false,
        facebookLoginEnabled: data.facebookLoginEnabled !== false,
        recaptchaEnabled: data.recaptchaEnabled !== false,
        weatherEnabled: data.weatherEnabled !== false,
        oneSignalEnabled: data.oneSignalEnabled !== false,
        cloudinaryEnabled: data.cloudinaryEnabled !== false,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConfig();
    loadApiKeys();
  }, []);

  // Toggle Handlers
  const handleToggleGoogle = async () => {
    const nextVal = !settings.googleLoginEnabled;
    setSettings((p) => ({ ...p, googleLoginEnabled: nextVal }));
    const { ok, data } = await api("/admin/settings/google-auth", {
      method: "PATCH",
      body: { enabled: nextVal },
    });
    if (ok) {
      setFeedback({ message: data.message || `Google sign-in ${nextVal ? "enabled" : "disabled"}.`, isError: false });
    } else {
      setSettings((p) => ({ ...p, googleLoginEnabled: !nextVal }));
      setFeedback({ message: "Failed to update Google auth setting.", isError: true });
    }
    setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
  };

  const handleToggleFacebook = async () => {
    const nextVal = !settings.facebookLoginEnabled;
    setSettings((p) => ({ ...p, facebookLoginEnabled: nextVal }));
    const { ok, data } = await api("/admin/settings/facebook-auth", {
      method: "PATCH",
      body: { enabled: nextVal },
    });
    if (ok) {
      setFeedback({ message: data.message || `Facebook sign-in ${nextVal ? "enabled" : "disabled"}.`, isError: false });
    } else {
      setSettings((p) => ({ ...p, facebookLoginEnabled: !nextVal }));
      setFeedback({ message: "Failed to update Facebook auth setting.", isError: true });
    }
    setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
  };

  const handleToggleRecaptcha = async () => {
    const nextVal = !settings.recaptchaEnabled;
    setSettings((p) => ({ ...p, recaptchaEnabled: nextVal }));
    const { ok, data } = await api("/admin/settings/recaptcha", {
      method: "PATCH",
      body: { enabled: nextVal },
    });
    if (ok) {
      setFeedback({ message: data.message || `Google reCAPTCHA ${nextVal ? "enabled" : "disabled"}.`, isError: false });
    } else {
      setSettings((p) => ({ ...p, recaptchaEnabled: !nextVal }));
      setFeedback({ message: "Failed to update reCAPTCHA setting.", isError: true });
    }
    setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
  };

  const handleToggleWeather = async () => {
    const nextVal = settings.weatherEnabled === false;
    setSettings((p) => ({ ...p, weatherEnabled: nextVal }));
    const { ok, data } = await api("/admin/settings/weather", {
      method: "PATCH",
      body: { enabled: nextVal },
    });
    if (ok) {
      setFeedback({ message: data.message || `Kalilangan Weather API ${nextVal ? "enabled" : "disabled"}.`, isError: false });
    } else {
      setSettings((p) => ({ ...p, weatherEnabled: !nextVal }));
      setFeedback({ message: "Failed to update Weather API setting.", isError: true });
    }
    setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
  };

  const handleToggleOneSignal = async () => {
    const nextVal = settings.oneSignalEnabled === false;
    setSettings((p) => ({ ...p, oneSignalEnabled: nextVal }));
    const { ok, data } = await api("/admin/settings/onesignal", {
      method: "PATCH",
      body: { enabled: nextVal },
    });
    if (ok) {
      setFeedback({ message: data.message || `OneSignal push notifications ${nextVal ? "enabled" : "disabled"}.`, isError: false });
    } else {
      setSettings((p) => ({ ...p, oneSignalEnabled: !nextVal }));
      setFeedback({ message: "Failed to update OneSignal setting.", isError: true });
    }
    setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
  };

  const handleToggleCloudinary = async () => {
    const nextVal = settings.cloudinaryEnabled === false;
    setSettings((p) => ({ ...p, cloudinaryEnabled: nextVal }));
    const { ok, data } = await api("/admin/settings/cloudinary", {
      method: "PATCH",
      body: { enabled: nextVal },
    });
    if (ok) {
      setFeedback({ message: data.message || `Cloudinary media storage ${nextVal ? "enabled" : "disabled"}.`, isError: false });
    } else {
      setSettings((p) => ({ ...p, cloudinaryEnabled: !nextVal }));
      setFeedback({ message: "Failed to update Cloudinary setting.", isError: true });
    }
    setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
  };

  // Save & Reset Key Handlers
  const handleSaveGoogleKeys = async () => {
    setKeySaving((p) => ({ ...p, google: true }));
    const res = await api("/admin/api-keys/google", {
      method: "POST",
      body: {
        clientId: keyForms.googleClientId.trim(),
        clientSecret: keyForms.googleClientSecret.trim(),
      },
    });
    setKeySaving((p) => ({ ...p, google: false }));
    if (res.ok) {
      setKeyFeedback((p) => ({ ...p, google: { message: res.data?.message || "Google OAuth credentials saved to .env!", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, google: null })), 4000);
    } else {
      setKeyFeedback((p) => ({ ...p, google: { message: res.data?.error || "Failed to save credentials.", isError: true } }));
    }
  };

  const handleResetGoogleKeys = async () => {
    setKeySaving((p) => ({ ...p, google: true }));
    const res = await api("/admin/api-keys/google", {
      method: "POST",
      body: { reset: true },
    });
    setKeySaving((p) => ({ ...p, google: false }));
    if (res.ok) {
      setKeyForms((p) => ({ ...p, googleClientId: "", googleClientSecret: "" }));
      setKeyFeedback((p) => ({ ...p, google: { message: "Reset to default code keys.", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, google: null })), 4000);
    }
  };

  const handleSaveFacebookKeys = async () => {
    setKeySaving((p) => ({ ...p, facebook: true }));
    const res = await api("/admin/api-keys/facebook", {
      method: "POST",
      body: {
        appId: keyForms.facebookAppId.trim(),
        appSecret: keyForms.facebookAppSecret.trim(),
      },
    });
    setKeySaving((p) => ({ ...p, facebook: false }));
    if (res.ok) {
      setKeyFeedback((p) => ({ ...p, facebook: { message: res.data?.message || "Facebook OAuth credentials saved to .env!", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, facebook: null })), 4000);
    } else {
      setKeyFeedback((p) => ({ ...p, facebook: { message: res.data?.error || "Failed to save credentials.", isError: true } }));
    }
  };

  const handleResetFacebookKeys = async () => {
    setKeySaving((p) => ({ ...p, facebook: true }));
    const res = await api("/admin/api-keys/facebook", {
      method: "POST",
      body: { reset: true },
    });
    setKeySaving((p) => ({ ...p, facebook: false }));
    if (res.ok) {
      setKeyForms((p) => ({ ...p, facebookAppId: "", facebookAppSecret: "" }));
      setKeyFeedback((p) => ({ ...p, facebook: { message: "Reset to default code keys.", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, facebook: null })), 4000);
    }
  };

  const handleSaveRecaptchaKeys = async () => {
    setKeySaving((p) => ({ ...p, recaptcha: true }));
    const res = await api("/admin/api-keys/recaptcha", {
      method: "POST",
      body: {
        siteKey: keyForms.recaptchaSiteKey.trim(),
        secretKey: keyForms.recaptchaSecretKey.trim(),
      },
    });
    setKeySaving((p) => ({ ...p, recaptcha: false }));
    if (res.ok) {
      setKeyFeedback((p) => ({ ...p, recaptcha: { message: res.data?.message || "Google reCAPTCHA keys saved to .env!", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, recaptcha: null })), 4000);
    } else {
      setKeyFeedback((p) => ({ ...p, recaptcha: { message: res.data?.error || "Failed to save keys.", isError: true } }));
    }
  };

  const handleResetRecaptchaKeys = async () => {
    setKeySaving((p) => ({ ...p, recaptcha: true }));
    const res = await api("/admin/api-keys/recaptcha", {
      method: "POST",
      body: { reset: true },
    });
    setKeySaving((p) => ({ ...p, recaptcha: false }));
    if (res.ok) {
      setKeyForms((p) => ({ ...p, recaptchaSiteKey: "", recaptchaSecretKey: "" }));
      setKeyFeedback((p) => ({ ...p, recaptcha: { message: "Reset to default code keys.", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, recaptcha: null })), 4000);
    }
  };

  const handleSaveWeatherKey = async () => {
    setKeySaving((p) => ({ ...p, weather: true }));
    const res = await api("/admin/api-keys/weather", {
      method: "POST",
      body: { apiKey: keyForms.weatherApiKey.trim() },
    });
    setKeySaving((p) => ({ ...p, weather: false }));
    if (res.ok) {
      setKeyFeedback((p) => ({ ...p, weather: { message: res.data?.message || "Weather API key saved to .env!", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, weather: null })), 4000);
    } else {
      setKeyFeedback((p) => ({ ...p, weather: { message: res.data?.error || "Failed to save key.", isError: true } }));
    }
  };

  const handleResetWeatherKey = async () => {
    setKeySaving((p) => ({ ...p, weather: true }));
    const res = await api("/admin/api-keys/weather", {
      method: "POST",
      body: { reset: true },
    });
    setKeySaving((p) => ({ ...p, weather: false }));
    if (res.ok) {
      setKeyForms((p) => ({ ...p, weatherApiKey: "" }));
      setKeyFeedback((p) => ({ ...p, weather: { message: "Reset to default code key.", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, weather: null })), 4000);
    }
  };

  const handleSaveOneSignalKeys = async () => {
    setKeySaving((p) => ({ ...p, oneSignal: true }));
    const res = await api("/admin/api-keys/onesignal", {
      method: "POST",
      body: {
        appId: keyForms.oneSignalAppId.trim(),
        restApiKey: keyForms.oneSignalRestApiKey.trim(),
      },
    });
    setKeySaving((p) => ({ ...p, oneSignal: false }));
    if (res.ok) {
      setKeyFeedback((p) => ({ ...p, oneSignal: { message: res.data?.message || "OneSignal credentials saved to .env!", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, oneSignal: null })), 4000);
    } else {
      setKeyFeedback((p) => ({ ...p, oneSignal: { message: res.data?.error || "Failed to save credentials.", isError: true } }));
    }
  };

  const handleResetOneSignalKeys = async () => {
    setKeySaving((p) => ({ ...p, oneSignal: true }));
    const res = await api("/admin/api-keys/onesignal", {
      method: "POST",
      body: { reset: true },
    });
    setKeySaving((p) => ({ ...p, oneSignal: false }));
    if (res.ok) {
      setKeyForms((p) => ({ ...p, oneSignalAppId: "", oneSignalRestApiKey: "" }));
      setKeyFeedback((p) => ({ ...p, oneSignal: { message: "Reset to default code keys.", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, oneSignal: null })), 4000);
    }
  };

  const handleSaveCloudinaryKeys = async () => {
    setKeySaving((p) => ({ ...p, cloudinary: true }));
    const res = await api("/admin/api-keys/cloudinary", {
      method: "POST",
      body: {
        cloudName: keyForms.cloudinaryCloudName.trim(),
        apiKey: keyForms.cloudinaryApiKey.trim(),
        apiSecret: keyForms.cloudinaryApiSecret.trim(),
      },
    });
    setKeySaving((p) => ({ ...p, cloudinary: false }));
    if (res.ok) {
      setKeyFeedback((p) => ({ ...p, cloudinary: { message: res.data?.message || "Cloudinary credentials saved to .env!", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, cloudinary: null })), 4000);
    } else {
      setKeyFeedback((p) => ({ ...p, cloudinary: { message: res.data?.error || "Failed to save credentials.", isError: true } }));
    }
  };

  const handleResetCloudinaryKeys = async () => {
    setKeySaving((p) => ({ ...p, cloudinary: true }));
    const res = await api("/admin/api-keys/cloudinary", {
      method: "POST",
      body: { reset: true },
    });
    setKeySaving((p) => ({ ...p, cloudinary: false }));
    if (res.ok) {
      setKeyForms((p) => ({ ...p, cloudinaryCloudName: "", cloudinaryApiKey: "", cloudinaryApiSecret: "" }));
      setKeyFeedback((p) => ({ ...p, cloudinary: { message: "Reset to default code keys.", isError: false } }));
      loadApiKeys();
      setTimeout(() => setKeyFeedback((p) => ({ ...p, cloudinary: null })), 4000);
    }
  };

  // Metrics calculation
  const totalEnabled = [
    settings.googleLoginEnabled,
    settings.facebookLoginEnabled,
    settings.recaptchaEnabled,
    settings.weatherEnabled !== false,
    settings.oneSignalEnabled !== false,
    settings.cloudinaryEnabled !== false,
  ].filter(Boolean).length;

  const totalCustom = [
    apiKeys.google?.isCustom,
    apiKeys.facebook?.isCustom,
    apiKeys.recaptcha?.isCustom,
    apiKeys.weather?.isCustom,
    apiKeys.oneSignal?.isCustom,
    apiKeys.cloudinary?.isCustom,
  ].filter(Boolean).length;

  // Filter integrations
  const matchesSearch = (title, desc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return title.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
  };

  const showGoogle = (activeFilter === "all" || activeFilter === "auth") && matchesSearch("Google Sign-In OAuth", "Allow members to authenticate with Google");
  const showFacebook = (activeFilter === "all" || activeFilter === "auth") && matchesSearch("Facebook Sign-In Graph API", "Allow members to authenticate using Facebook");
  const showRecaptcha = (activeFilter === "all" || activeFilter === "auth") && matchesSearch("Google reCAPTCHA v2", "Protect member sign-in and registration forms from bots");
  const showWeather = (activeFilter === "all" || activeFilter === "services") && matchesSearch("Kalilangan Weather Forecast API", "3-day Kalilangan weather predictions on manager dispatch calendar");
  const showOneSignal = (activeFilter === "all" || activeFilter === "services") && matchesSearch("OneSignal Web Push Notifications", "Browser push updates for bookings and machinery schedules");
  const showCloudinary = (activeFilter === "all" || activeFilter === "services") && matchesSearch("Cloudinary Media Storage", "Upload machinery fleet photos and user avatars");

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top Header Bar */}
        <AdminTopbar
          title="API & Service Integrations"
          subtitle="Configure third-party service connections, custom API credentials (.env), and operational switches."
          settings={settings}
          onToggleGoogle={handleToggleGoogle}
          onToggleFacebook={handleToggleFacebook}
          onToggleRecaptcha={handleToggleRecaptcha}
          onToggleWeather={handleToggleWeather}
          onToggleOneSignal={handleToggleOneSignal}
          onToggleCloudinary={handleToggleCloudinary}
        />

        {/* Global Feedback Banner */}
        {feedback.message && (
          <div
            style={{
              padding: "12px 18px",
              marginBottom: "20px",
              borderRadius: "10px",
              background: feedback.isError ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${feedback.isError ? "#fca5a5" : "#86efac"}`,
              color: feedback.isError ? "#991b1b" : "#166534",
              fontSize: "0.86rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback({ message: "", isError: false })}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* 4 Summary KPI Cards */}
        <div className="wz-kpi-grid" style={{ marginBottom: "24px" }}>
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#ecfdf5", color: "#166534" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22v-5" />
                  <path d="M9 8V2" />
                  <path d="M15 2v6" />
                  <path d="M18 8v5a6 6 0 0 1-12 0V8z" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Active Integrations</div>
                <div className="wz-kpi-value">{loading ? "..." : `${totalEnabled} of 6`}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Live</span>
              <span className="wz-trend-subtitle">Operational</span>
            </div>
          </div>

          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#eff6ff", color: "#2563eb" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">OAuth &amp; Security</div>
                <div className="wz-kpi-value">
                  {settings.googleLoginEnabled || settings.facebookLoginEnabled || settings.recaptchaEnabled ? "Active" : "Disabled"}
                </div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Google / FB / Captcha</span>
              <span className="wz-trend-subtitle">Auth Gateways</span>
            </div>
          </div>

          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#fef3c7", color: "#d97706" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Custom .env Keys</div>
                <div className="wz-kpi-value">{totalCustom} Custom</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">{6 - totalCustom} Defaults</span>
              <span className="wz-trend-subtitle">Synced to .env</span>
            </div>
          </div>

          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#f0fdf4", color: "#15803d" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Sync Status</div>
                <div className="wz-kpi-value" style={{ fontSize: "1.05rem", color: "#16a34a" }}>
                  ● Synchronized
                </div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">MongoDB &amp; .env</span>
              <span className="wz-trend-subtitle">Zero Restart Required</span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar & Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "20px",
            background: "#ffffff",
            padding: "14px 18px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: activeFilter === "all" ? "1px solid #0f172a" : "1px solid #cbd5e1",
                background: activeFilter === "all" ? "#0f172a" : "#ffffff",
                color: activeFilter === "all" ? "#ffffff" : "#475569",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              All Integrations (6)
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("auth")}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: activeFilter === "auth" ? "1px solid #0f172a" : "1px solid #cbd5e1",
                background: activeFilter === "auth" ? "#0f172a" : "#ffffff",
                color: activeFilter === "auth" ? "#ffffff" : "#475569",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Authentication &amp; Security (3)
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("services")}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: activeFilter === "services" ? "1px solid #0f172a" : "1px solid #cbd5e1",
                background: activeFilter === "services" ? "#0f172a" : "#ffffff",
                color: activeFilter === "services" ? "#ffffff" : "#475569",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              External APIs &amp; Cloud (3)
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="text"
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "7px 14px",
                fontSize: "0.82rem",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                outline: "none",
                width: "220px",
              }}
            />
          </div>
        </div>

        {/* Integration Cards List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
          {/* ================= 1. Google Sign-In ================= */}
          {showGoogle && (
            <div className="wz-card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      color: "#ea4335",
                      fontSize: "1.25rem",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    }}
                  >
                    G
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "1rem", color: "#0f172a" }}>Google Sign-In (OAuth 2.0)</strong>
                      <span style={{ fontSize: "0.72rem", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", color: "#475569", fontWeight: 700 }}>
                        Authentication
                      </span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                      Allow members and cooperative officers to authenticate with verified Google Workspace accounts.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKeys((p) => ({ ...p, google: !p.google }))}
                    style={{
                      padding: "6px 12px",
                      background: apiKeys.google?.isCustom ? "#dcfce7" : "#f8fafc",
                      color: apiKeys.google?.isCustom ? "#15803d" : "#475569",
                      border: `1px solid ${apiKeys.google?.isCustom ? "#86efac" : "#cbd5e1"}`,
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    title="Configure custom Google credentials"
                  >
                    <span>{apiKeys.google?.isCustom ? "● Custom Keys (.env)" : "⚙️ Code Default Keys"}</span>
                    <span>{expandedKeys.google ? "▲" : "▼"}</span>
                  </button>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: settings.googleLoginEnabled ? "#16a34a" : "#64748b",
                    }}
                  >
                    {settings.googleLoginEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <label className="wz-switch-toggle">
                    <input
                      type="checkbox"
                      checked={settings.googleLoginEnabled}
                      onChange={handleToggleGoogle}
                    />
                    <span className="wz-switch-slider" />
                  </label>
                </div>
              </div>

              {/* Expandable Google Drawer */}
              {expandedKeys.google && (
                <div style={{ padding: "20px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>
                      Google OAuth 2.0 Credentials:
                    </span>
                    <span style={{ fontSize: "0.76rem", color: apiKeys.google?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                      {apiKeys.google?.isCustom ? "● Custom Credentials active in server/.env" : `● Using Code Defaults (${apiKeys.google?.defaultClientIdMasked || "1042••••0nii4"})`}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Google Client ID (Saved to CUSTOM_GOOGLE_CLIENT_ID in .env)
                      </label>
                      <input
                        type="text"
                        className="wz-form-input"
                        style={{ width: "100%", padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                        placeholder={`Default in code: ${apiKeys.google?.defaultClientIdMasked || "1042••••0nii4"}`}
                        value={keyForms.googleClientId}
                        onChange={(e) => setKeyForms((p) => ({ ...p, googleClientId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Google Client Secret (Saved to CUSTOM_GOOGLE_CLIENT_SECRET in .env)
                      </label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type={revealSecrets.google ? "text" : "password"}
                          className="wz-form-input"
                          style={{ flex: 1, padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.google?.defaultClientSecretMasked || "GOCS••••wnVd"}`}
                          value={keyForms.googleClientSecret}
                          onChange={(e) => setKeyForms((p) => ({ ...p, googleClientSecret: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setRevealSecrets((p) => ({ ...p, google: !p.google }))}
                          style={{
                            padding: "9px 14px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {revealSecrets.google ? "🙈 Hide" : "👁️ Reveal"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Leave blank or click Reset to Default to revert back to the verified system code keys.
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {apiKeys.google?.isCustom && (
                        <button
                          type="button"
                          onClick={handleResetGoogleKeys}
                          disabled={keySaving.google}
                          style={{
                            padding: "7px 14px",
                            background: "#fff1f2",
                            color: "#be123c",
                            border: "1px solid #fecdd3",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Reset to Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveGoogleKeys}
                        disabled={keySaving.google}
                        style={{
                          padding: "7px 16px",
                          background: "#0f172a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {keySaving.google ? "Saving to .env..." : "Save Credentials"}
                      </button>
                    </div>
                  </div>

                  {keyFeedback.google && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.8rem",
                        color: keyFeedback.google.isError ? "#b91c1c" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {keyFeedback.google.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= 2. Facebook Sign-In ================= */}
          {showFacebook && (
            <div className="wz-card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      color: "#1877f2",
                      fontSize: "1.25rem",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    }}
                  >
                    f
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "1rem", color: "#0f172a" }}>Facebook Sign-In (Graph API)</strong>
                      <span style={{ fontSize: "0.72rem", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", color: "#475569", fontWeight: 700 }}>
                        Authentication
                      </span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                      Allow members to authenticate with authorized Facebook OAuth login credentials.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKeys((p) => ({ ...p, facebook: !p.facebook }))}
                    style={{
                      padding: "6px 12px",
                      background: apiKeys.facebook?.isCustom ? "#dcfce7" : "#f8fafc",
                      color: apiKeys.facebook?.isCustom ? "#15803d" : "#475569",
                      border: `1px solid ${apiKeys.facebook?.isCustom ? "#86efac" : "#cbd5e1"}`,
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    title="Configure custom Facebook credentials"
                  >
                    <span>{apiKeys.facebook?.isCustom ? "● Custom Keys (.env)" : "⚙️ Code Default Keys"}</span>
                    <span>{expandedKeys.facebook ? "▲" : "▼"}</span>
                  </button>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: settings.facebookLoginEnabled ? "#16a34a" : "#64748b",
                    }}
                  >
                    {settings.facebookLoginEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <label className="wz-switch-toggle">
                    <input
                      type="checkbox"
                      checked={settings.facebookLoginEnabled}
                      onChange={handleToggleFacebook}
                    />
                    <span className="wz-switch-slider" />
                  </label>
                </div>
              </div>

              {/* Expandable Facebook Drawer */}
              {expandedKeys.facebook && (
                <div style={{ padding: "20px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>
                      Facebook Graph API Credentials:
                    </span>
                    <span style={{ fontSize: "0.76rem", color: apiKeys.facebook?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                      {apiKeys.facebook?.isCustom ? "● Custom Credentials active in server/.env" : `● Using Code Defaults (${apiKeys.facebook?.defaultAppIdMasked || "4031••••3782"})`}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Facebook App ID (Saved to CUSTOM_FACEBOOK_APP_ID in .env)
                      </label>
                      <input
                        type="text"
                        className="wz-form-input"
                        style={{ width: "100%", padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                        placeholder={`Default in code: ${apiKeys.facebook?.defaultAppIdMasked || "4031••••3782"}`}
                        value={keyForms.facebookAppId}
                        onChange={(e) => setKeyForms((p) => ({ ...p, facebookAppId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Facebook App Secret (Saved to CUSTOM_FACEBOOK_APP_SECRET in .env)
                      </label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type={revealSecrets.facebook ? "text" : "password"}
                          className="wz-form-input"
                          style={{ flex: 1, padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.facebook?.defaultAppSecretMasked || "4495••••139"}`}
                          value={keyForms.facebookAppSecret}
                          onChange={(e) => setKeyForms((p) => ({ ...p, facebookAppSecret: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setRevealSecrets((p) => ({ ...p, facebook: !p.facebook }))}
                          style={{
                            padding: "9px 14px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {revealSecrets.facebook ? "🙈 Hide" : "👁️ Reveal"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Leave blank or click Reset to Default to revert back to system code keys.
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {apiKeys.facebook?.isCustom && (
                        <button
                          type="button"
                          onClick={handleResetFacebookKeys}
                          disabled={keySaving.facebook}
                          style={{
                            padding: "7px 14px",
                            background: "#fff1f2",
                            color: "#be123c",
                            border: "1px solid #fecdd3",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Reset to Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveFacebookKeys}
                        disabled={keySaving.facebook}
                        style={{
                          padding: "7px 16px",
                          background: "#0f172a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {keySaving.facebook ? "Saving to .env..." : "Save Credentials"}
                      </button>
                    </div>
                  </div>

                  {keyFeedback.facebook && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.8rem",
                        color: keyFeedback.facebook.isError ? "#b91c1c" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {keyFeedback.facebook.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= 3. Google reCAPTCHA v2 ================= */}
          {showRecaptcha && (
            <div className="wz-card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "#e0f2fe",
                      border: "1px solid #bae6fd",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#0284c7",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "1rem", color: "#0f172a" }}>Google reCAPTCHA v2</strong>
                      <span style={{ fontSize: "0.72rem", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", color: "#475569", fontWeight: 700 }}>
                        Bot Defense
                      </span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                      Protect member registration and login forms against bots, scripts, and brute-force attempts.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKeys((p) => ({ ...p, recaptcha: !p.recaptcha }))}
                    style={{
                      padding: "6px 12px",
                      background: apiKeys.recaptcha?.isCustom ? "#dcfce7" : "#f8fafc",
                      color: apiKeys.recaptcha?.isCustom ? "#15803d" : "#475569",
                      border: `1px solid ${apiKeys.recaptcha?.isCustom ? "#86efac" : "#cbd5e1"}`,
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    title="Configure custom reCAPTCHA keys"
                  >
                    <span>{apiKeys.recaptcha?.isCustom ? "● Custom Keys (.env)" : "⚙️ Code Default Keys"}</span>
                    <span>{expandedKeys.recaptcha ? "▲" : "▼"}</span>
                  </button>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: settings.recaptchaEnabled ? "#16a34a" : "#64748b",
                    }}
                  >
                    {settings.recaptchaEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <label className="wz-switch-toggle">
                    <input
                      type="checkbox"
                      checked={settings.recaptchaEnabled}
                      onChange={handleToggleRecaptcha}
                    />
                    <span className="wz-switch-slider" />
                  </label>
                </div>
              </div>

              {/* Expandable reCAPTCHA Drawer */}
              {expandedKeys.recaptcha && (
                <div style={{ padding: "20px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>
                      Google reCAPTCHA v2 API Keys:
                    </span>
                    <span style={{ fontSize: "0.76rem", color: apiKeys.recaptcha?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                      {apiKeys.recaptcha?.isCustom ? "● Custom Keys active in server/.env" : `● Using Code Defaults (${apiKeys.recaptcha?.defaultSiteKeyMasked || "6Lfr••••6UG5"})`}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Site Key (Client-side, saved to CUSTOM_RECAPTCHA_SITE_KEY in .env)
                      </label>
                      <input
                        type="text"
                        className="wz-form-input"
                        style={{ width: "100%", padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                        placeholder={`Default in code: ${apiKeys.recaptcha?.defaultSiteKeyMasked || "6Lfr••••6UG5"}`}
                        value={keyForms.recaptchaSiteKey}
                        onChange={(e) => setKeyForms((p) => ({ ...p, recaptchaSiteKey: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        Secret Key (Server-side, saved to CUSTOM_RECAPTCHA_SECRET_KEY in .env)
                      </label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type={revealSecrets.recaptcha ? "text" : "password"}
                          className="wz-form-input"
                          style={{ flex: 1, padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.recaptcha?.defaultSecretKeyMasked || "6Lfr••••ST12"}`}
                          value={keyForms.recaptchaSecretKey}
                          onChange={(e) => setKeyForms((p) => ({ ...p, recaptchaSecretKey: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setRevealSecrets((p) => ({ ...p, recaptcha: !p.recaptcha }))}
                          style={{
                            padding: "9px 14px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {revealSecrets.recaptcha ? "🙈 Hide" : "👁️ Reveal"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Leave blank or click Reset to Default to revert back to system code keys.
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {apiKeys.recaptcha?.isCustom && (
                        <button
                          type="button"
                          onClick={handleResetRecaptchaKeys}
                          disabled={keySaving.recaptcha}
                          style={{
                            padding: "7px 14px",
                            background: "#fff1f2",
                            color: "#be123c",
                            border: "1px solid #fecdd3",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Reset to Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveRecaptchaKeys}
                        disabled={keySaving.recaptcha}
                        style={{
                          padding: "7px 16px",
                          background: "#0f172a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {keySaving.recaptcha ? "Saving to .env..." : "Save Keys"}
                      </button>
                    </div>
                  </div>

                  {keyFeedback.recaptcha && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.8rem",
                        color: keyFeedback.recaptcha.isError ? "#b91c1c" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {keyFeedback.recaptcha.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= 4. Kalilangan Weather Forecast API ================= */}
          {showWeather && (
            <div className="wz-card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#d97706",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2" />
                      <path d="M12 20v2" />
                      <path d="m4.93 4.93 1.41 1.41" />
                      <path d="m17.66 17.66 1.41 1.41" />
                      <path d="M2 12h2" />
                      <path d="M20 12h2" />
                      <path d="m6.34 17.66-1.41 1.41" />
                      <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "1rem", color: "#0f172a" }}>Kalilangan Weather Forecast API</strong>
                      <span style={{ fontSize: "0.72rem", background: "#fef3c7", padding: "2px 8px", borderRadius: "6px", color: "#b45309", fontWeight: 700 }}>
                        WeatherAPI.com
                      </span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                      Provide 3-day Kalilangan weather predictions on the manager dispatch calendar (shows offline warning when disabled).
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKeys((p) => ({ ...p, weather: !p.weather }))}
                    style={{
                      padding: "6px 12px",
                      background: apiKeys.weather?.isCustom ? "#dcfce7" : "#f8fafc",
                      color: apiKeys.weather?.isCustom ? "#15803d" : "#475569",
                      border: `1px solid ${apiKeys.weather?.isCustom ? "#86efac" : "#cbd5e1"}`,
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    title="Configure custom WeatherAPI key"
                  >
                    <span>{apiKeys.weather?.isCustom ? "● Custom Key (.env)" : "⚙️ Code Default Key"}</span>
                    <span>{expandedKeys.weather ? "▲" : "▼"}</span>
                  </button>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: settings.weatherEnabled !== false ? "#16a34a" : "#64748b",
                    }}
                  >
                    {settings.weatherEnabled !== false ? "Enabled" : "Disabled"}
                  </span>
                  <label className="wz-switch-toggle">
                    <input
                      type="checkbox"
                      checked={settings.weatherEnabled !== false}
                      onChange={handleToggleWeather}
                    />
                    <span className="wz-switch-slider" />
                  </label>
                </div>
              </div>

              {/* Expandable Weather Drawer */}
              {expandedKeys.weather && (
                <div style={{ padding: "20px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>
                      WeatherAPI.com API Key:
                    </span>
                    <span style={{ fontSize: "0.76rem", color: apiKeys.weather?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                      {apiKeys.weather?.isCustom ? "● Custom Key active in server/.env" : `● Using Code Default (${apiKeys.weather?.defaultKeyMasked || "7145••••••••0611"})`}
                    </span>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      API Key (Saved to CUSTOM_WEATHER_API_KEY in .env)
                    </label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type={revealSecrets.weather ? "text" : "password"}
                        className="wz-form-input"
                        style={{ flex: 1, padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                        placeholder={`Code default: ${apiKeys.weather?.defaultKeyMasked || "7145••••••••0611"}`}
                        value={keyForms.weatherApiKey}
                        onChange={(e) => setKeyForms((p) => ({ ...p, weatherApiKey: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, weather: !p.weather }))}
                        style={{
                          padding: "9px 14px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {revealSecrets.weather ? "🙈 Hide" : "👁️ Reveal"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Leave blank or click Reset to Default to revert back to the code default key.
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {apiKeys.weather?.isCustom && (
                        <button
                          type="button"
                          onClick={handleResetWeatherKey}
                          disabled={keySaving.weather}
                          style={{
                            padding: "7px 14px",
                            background: "#fff1f2",
                            color: "#be123c",
                            border: "1px solid #fecdd3",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Reset to Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveWeatherKey}
                        disabled={keySaving.weather}
                        style={{
                          padding: "7px 16px",
                          background: "#0f172a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {keySaving.weather ? "Saving to .env..." : "Save Custom Key"}
                      </button>
                    </div>
                  </div>

                  {keyFeedback.weather && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.8rem",
                        color: keyFeedback.weather.isError ? "#b91c1c" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {keyFeedback.weather.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= 5. OneSignal Web Push ================= */}
          {showOneSignal && (
            <div className="wz-card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#e11d48",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "1rem", color: "#0f172a" }}>OneSignal Web Push Notifications</strong>
                      <span style={{ fontSize: "0.72rem", background: "#ffe4e6", padding: "2px 8px", borderRadius: "6px", color: "#be123c", fontWeight: 700 }}>
                        Push Alerts
                      </span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                      Deliver real-time browser alerts to members and drivers for booking approvals and machinery dispatch.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKeys((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                    style={{
                      padding: "6px 12px",
                      background: apiKeys.oneSignal?.isCustom ? "#dcfce7" : "#f8fafc",
                      color: apiKeys.oneSignal?.isCustom ? "#15803d" : "#475569",
                      border: `1px solid ${apiKeys.oneSignal?.isCustom ? "#86efac" : "#cbd5e1"}`,
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    title="Configure custom OneSignal credentials"
                  >
                    <span>{apiKeys.oneSignal?.isCustom ? "● Custom Keys (.env)" : "⚙️ Code Default Keys"}</span>
                    <span>{expandedKeys.oneSignal ? "▲" : "▼"}</span>
                  </button>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: settings.oneSignalEnabled !== false ? "#16a34a" : "#64748b",
                    }}
                  >
                    {settings.oneSignalEnabled !== false ? "Enabled" : "Disabled"}
                  </span>
                  <label className="wz-switch-toggle">
                    <input
                      type="checkbox"
                      checked={settings.oneSignalEnabled !== false}
                      onChange={handleToggleOneSignal}
                    />
                    <span className="wz-switch-slider" />
                  </label>
                </div>
              </div>

              {/* Expandable OneSignal Drawer */}
              {expandedKeys.oneSignal && (
                <div style={{ padding: "20px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>
                      OneSignal REST API &amp; App Credentials:
                    </span>
                    <span style={{ fontSize: "0.76rem", color: apiKeys.oneSignal?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                      {apiKeys.oneSignal?.isCustom ? "● Custom Keys active in server/.env" : `● Using Code Defaults (${apiKeys.oneSignal?.defaultAppIdMasked || "fc81••••896839"})`}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        OneSignal App ID (Saved to CUSTOM_ONESIGNAL_APP_ID in .env)
                      </label>
                      <input
                        type="text"
                        className="wz-form-input"
                        style={{ width: "100%", padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                        placeholder={`Default in code: ${apiKeys.oneSignal?.defaultAppIdMasked || "fc81••••896839"}`}
                        value={keyForms.oneSignalAppId}
                        onChange={(e) => setKeyForms((p) => ({ ...p, oneSignalAppId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        OneSignal REST API Key (Saved to CUSTOM_ONESIGNAL_REST_API_KEY in .env)
                      </label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type={revealSecrets.oneSignal ? "text" : "password"}
                          className="wz-form-input"
                          style={{ flex: 1, padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.oneSignal?.defaultRestKeyMasked || "os_v2_••••••••nbyq"}`}
                          value={keyForms.oneSignalRestApiKey}
                          onChange={(e) => setKeyForms((p) => ({ ...p, oneSignalRestApiKey: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setRevealSecrets((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                          style={{
                            padding: "9px 14px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {revealSecrets.oneSignal ? "🙈 Hide" : "👁️ Reveal"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Leave blank or click Reset to Default to revert back to system code keys.
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {apiKeys.oneSignal?.isCustom && (
                        <button
                          type="button"
                          onClick={handleResetOneSignalKeys}
                          disabled={keySaving.oneSignal}
                          style={{
                            padding: "7px 14px",
                            background: "#fff1f2",
                            color: "#be123c",
                            border: "1px solid #fecdd3",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Reset to Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveOneSignalKeys}
                        disabled={keySaving.oneSignal}
                        style={{
                          padding: "7px 16px",
                          background: "#0f172a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {keySaving.oneSignal ? "Saving to .env..." : "Save Custom Keys"}
                      </button>
                    </div>
                  </div>

                  {keyFeedback.oneSignal && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.8rem",
                        color: keyFeedback.oneSignal.isError ? "#b91c1c" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {keyFeedback.oneSignal.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================= 6. Cloudinary Cloud Media ================= */}
          {showCloudinary && (
            <div className="wz-card" style={{ padding: "0", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#2563eb",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                      <path d="M12 13v-5" />
                      <path d="m9 10 3-3 3 3" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "1rem", color: "#0f172a" }}>Cloudinary Cloud Media Storage</strong>
                      <span style={{ fontSize: "0.72rem", background: "#dbeafe", padding: "2px 8px", borderRadius: "6px", color: "#1d4ed8", fontWeight: 700 }}>
                        Cloud Media
                      </span>
                    </div>
                    <p style={{ margin: "3px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                      Store high-resolution tractor photos, equipment catalogs, and user avatar images with worldwide CDN delivery.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKeys((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                    style={{
                      padding: "6px 12px",
                      background: apiKeys.cloudinary?.isCustom ? "#dcfce7" : "#f8fafc",
                      color: apiKeys.cloudinary?.isCustom ? "#15803d" : "#475569",
                      border: `1px solid ${apiKeys.cloudinary?.isCustom ? "#86efac" : "#cbd5e1"}`,
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    title="Configure custom Cloudinary credentials"
                  >
                    <span>{apiKeys.cloudinary?.isCustom ? "● Custom Keys (.env)" : "⚙️ Code Default Keys"}</span>
                    <span>{expandedKeys.cloudinary ? "▲" : "▼"}</span>
                  </button>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: settings.cloudinaryEnabled !== false ? "#16a34a" : "#64748b",
                    }}
                  >
                    {settings.cloudinaryEnabled !== false ? "Enabled" : "Disabled"}
                  </span>
                  <label className="wz-switch-toggle">
                    <input
                      type="checkbox"
                      checked={settings.cloudinaryEnabled !== false}
                      onChange={handleToggleCloudinary}
                    />
                    <span className="wz-switch-slider" />
                  </label>
                </div>
              </div>

              {/* Expandable Cloudinary Drawer */}
              {expandedKeys.cloudinary && (
                <div style={{ padding: "20px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>
                      Cloudinary Cloud Credentials:
                    </span>
                    <span style={{ fontSize: "0.76rem", color: apiKeys.cloudinary?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                      {apiKeys.cloudinary?.isCustom ? "● Custom Credentials active in server/.env" : `● Using Code Defaults (${apiKeys.cloudinary?.defaultCloudName || "kimpc"})`}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          Cloud Name (Saved to CUSTOM_CLOUDINARY_CLOUD_NAME in .env)
                        </label>
                        <input
                          type="text"
                          className="wz-form-input"
                          style={{ width: "100%", padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.cloudinary?.defaultCloudName || "kimpc"}`}
                          value={keyForms.cloudinaryCloudName}
                          onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryCloudName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          API Key (Saved to CUSTOM_CLOUDINARY_API_KEY in .env)
                        </label>
                        <input
                          type="text"
                          className="wz-form-input"
                          style={{ width: "100%", padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.cloudinary?.defaultApiKeyMasked || "6913••••7346"}`}
                          value={keyForms.cloudinaryApiKey}
                          onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryApiKey: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                        API Secret (Saved to CUSTOM_CLOUDINARY_API_SECRET in .env)
                      </label>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type={revealSecrets.cloudinary ? "text" : "password"}
                          className="wz-form-input"
                          style={{ flex: 1, padding: "9px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.cloudinary?.defaultApiSecretMasked || "0aNA••••••••KnY"}`}
                          value={keyForms.cloudinaryApiSecret}
                          onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryApiSecret: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setRevealSecrets((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                          style={{
                            padding: "9px 14px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {revealSecrets.cloudinary ? "🙈 Hide" : "👁️ Reveal"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Leave blank or click Reset to Default to revert back to system code keys.
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {apiKeys.cloudinary?.isCustom && (
                        <button
                          type="button"
                          onClick={handleResetCloudinaryKeys}
                          disabled={keySaving.cloudinary}
                          style={{
                            padding: "7px 14px",
                            background: "#fff1f2",
                            color: "#be123c",
                            border: "1px solid #fecdd3",
                            borderRadius: "8px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Reset to Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveCloudinaryKeys}
                        disabled={keySaving.cloudinary}
                        style={{
                          padding: "7px 16px",
                          background: "#0f172a",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {keySaving.cloudinary ? "Saving to .env..." : "Save Credentials"}
                      </button>
                    </div>
                  </div>

                  {keyFeedback.cloudinary && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.8rem",
                        color: keyFeedback.cloudinary.isError ? "#b91c1c" : "#15803d",
                        fontWeight: 600,
                      }}
                    >
                      {keyFeedback.cloudinary.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cooperative Architecture & .env Information Box */}
        <div
          style={{
            padding: "20px 24px",
            background: "#f0fdf4",
            borderRadius: "14px",
            border: "1px solid #bbf7d0",
            display: "flex",
            alignItems: "flex-start",
            gap: "16px",
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "#dcfce7",
              color: "#15803d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
          <div>
            <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem", color: "#166534", fontWeight: 800 }}>
              Automatic .env &amp; Database Synchronization Architecture
            </h4>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#166534", lineHeight: 1.5 }}>
              Any custom API keys saved in this portal are automatically written into both the system database and the
              backend <code style={{ background: "#dcfce7", padding: "1px 6px", borderRadius: "4px" }}>server/.env</code> file.
              The default system keys hardcoded in the codebase remain untouched as a fail-safe fallback whenever a custom key is left empty or reset.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
