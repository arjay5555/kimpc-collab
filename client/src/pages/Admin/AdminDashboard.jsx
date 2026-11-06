import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ accounts: 0, bookings: 0 });
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
  const [recentLogs, setRecentLogs] = useState([]);
  const [logFilterModule, setLogFilterModule] = useState("all");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [isRefreshingAudit, setIsRefreshingAudit] = useState(false);

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
      setKeyFeedback((p) => ({ ...p, google: { message: res.data?.message || "Google OAuth credentials saved!", isError: false } }));
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
      setKeyFeedback((p) => ({ ...p, facebook: { message: res.data?.message || "Facebook OAuth credentials saved!", isError: false } }));
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
      setKeyFeedback((p) => ({ ...p, recaptcha: { message: res.data?.message || "Google reCAPTCHA keys saved!", isError: false } }));
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
      setKeyFeedback((p) => ({ ...p, weather: { message: res.data?.message || "Weather API key saved!", isError: false } }));
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
      setKeyFeedback((p) => ({ ...p, oneSignal: { message: res.data?.message || "OneSignal credentials saved!", isError: false } }));
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
      setKeyFeedback((p) => ({ ...p, cloudinary: { message: res.data?.message || "Cloudinary credentials saved!", isError: false } }));
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

  const handleRefreshAuditDashboard = async () => {
    setIsRefreshingAudit(true);
    const { ok, data } = await api("/admin/audit-logs?limit=50");
    if (ok && data) {
      setRecentLogs(data.logs || (Array.isArray(data) ? data : []));
    }
    setTimeout(() => setIsRefreshingAudit(false), 650);
  };

  const getModuleBadgeStyle = (mod = "") => {
    const m = (mod || "").toLowerCase();
    if (m.includes("account")) return { bg: "#e0f2fe", text: "#0369a1", border: "#bae6fd" };
    if (m.includes("booking")) return { bg: "#dcfce7", text: "#15803d", border: "#bbf7d0" };
    if (m.includes("auth")) return { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" };
    if (m.includes("security") || m.includes("setting")) return { bg: "#fef3c7", text: "#b45309", border: "#fde68a" };
    if (m.includes("financial") || m.includes("payment")) return { bg: "#f3e8ff", text: "#7e22ce", border: "#e9d5ff" };
    if (m.includes("backup")) return { bg: "#ffe4e6", text: "#be123c", border: "#fecdd3" };
    if (m.includes("machin") || m.includes("fleet")) return { bg: "#cffafe", text: "#0e7490", border: "#a5f3fc" };
    if (m.includes("message")) return { bg: "#ede9fe", text: "#6d28d9", border: "#ddd6fe" };
    return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };
  };

  const getResultBadgeStyle = (res = "") => {
    const r = (res || "").toLowerCase();
    if (r === "success") return { bg: "#dcfce7", text: "#15803d", border: "#86efac" };
    if (r === "failed") return { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" };
    if (r === "denied") return { bg: "#fef3c7", text: "#b45309", border: "#fde68a" };
    return { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" };
  };

  useEffect(() => {
    // Load config
    api("/config").then(({ ok, data }) => {
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
    });

    // Load accounts
    api("/accounts").then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        setStats((prev) => ({ ...prev, accounts: data.length }));
      }
      setLoading(false);
    });

    // Load bookings
    api("/applications").then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        setStats((prev) => ({ ...prev, bookings: data.length }));
      }
    });

    // Load recent audit logs preview
    api("/admin/audit-logs?limit=50").then(({ ok, data }) => {
      if (ok && data) {
        const list = data.logs || (Array.isArray(data) ? data : []);
        setRecentLogs(list);
      }
    });

    // Load Customizable API Keys
    loadApiKeys();
  }, []);

  const handleToggleGoogle = async () => {
    const nextState = !settings.googleLoginEnabled;
    setSettings((prev) => ({ ...prev, googleLoginEnabled: nextState }));
    const res = await api("/admin/settings/google-login", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setFeedback({ message: "Failed to update Google login setting.", isError: true });
      setSettings((prev) => ({ ...prev, googleLoginEnabled: !nextState }));
    } else {
      setFeedback({ message: `Google login is now ${nextState ? "enabled" : "disabled"}.`, isError: false });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handleToggleFacebook = async () => {
    const nextState = !settings.facebookLoginEnabled;
    setSettings((prev) => ({ ...prev, facebookLoginEnabled: nextState }));
    const res = await api("/admin/settings/facebook-login", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setFeedback({ message: "Failed to update Facebook login setting.", isError: true });
      setSettings((prev) => ({ ...prev, facebookLoginEnabled: !nextState }));
    } else {
      setFeedback({ message: `Facebook login is now ${nextState ? "enabled" : "disabled"}.`, isError: false });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handleToggleRecaptcha = async () => {
    const nextState = !settings.recaptchaEnabled;
    setSettings((prev) => ({ ...prev, recaptchaEnabled: nextState }));
    const res = await api("/admin/settings/recaptcha", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setFeedback({ message: "Failed to update reCAPTCHA setting.", isError: true });
      setSettings((prev) => ({ ...prev, recaptchaEnabled: !nextState }));
    } else {
      setFeedback({
        message: `Google reCAPTCHA v2 is now ${nextState ? "enabled" : "disabled"}.`,
        isError: false,
      });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handleToggleWeather = async () => {
    const nextState = settings.weatherEnabled === false ? true : false;
    setSettings((prev) => ({ ...prev, weatherEnabled: nextState }));
    const res = await api("/admin/settings/weather", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setFeedback({ message: "Failed to update weather forecast setting.", isError: true });
      setSettings((prev) => ({ ...prev, weatherEnabled: !nextState }));
    } else {
      setFeedback({
        message: `Kalilangan weather forecast is now ${nextState ? "enabled" : "disabled"}.`,
        isError: false,
      });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handleToggleOneSignal = async () => {
    const nextState = settings.oneSignalEnabled === false ? true : false;
    setSettings((prev) => ({ ...prev, oneSignalEnabled: nextState }));
    const res = await api("/admin/settings/onesignal", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setFeedback({ message: "Failed to update OneSignal setting.", isError: true });
      setSettings((prev) => ({ ...prev, oneSignalEnabled: !nextState }));
    } else {
      setFeedback({
        message: `OneSignal Web Push notifications are now ${nextState ? "enabled" : "disabled"}.`,
        isError: false,
      });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handleToggleCloudinary = async () => {
    const nextState = settings.cloudinaryEnabled === false ? true : false;
    setSettings((prev) => ({ ...prev, cloudinaryEnabled: nextState }));
    const res = await api("/admin/settings/cloudinary", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setFeedback({ message: "Failed to update Cloudinary setting.", isError: true });
      setSettings((prev) => ({ ...prev, cloudinaryEnabled: !nextState }));
    } else {
      setFeedback({
        message: `Cloudinary media storage is now ${nextState ? "enabled" : "disabled (using local storage fallback)"}.`,
        isError: false,
      });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const refreshAll = () => {
    setLoading(true);
    Promise.all([
      api("/accounts"),
      api("/applications"),
      api("/admin/audit-logs?limit=50"),
    ]).then(([accRes, appRes, logRes]) => {
      if (accRes.ok && Array.isArray(accRes.data)) {
        setStats((p) => ({ ...p, accounts: accRes.data.length }));
      }
      if (appRes.ok && Array.isArray(appRes.data)) {
        setStats((p) => ({ ...p, bookings: appRes.data.length }));
      }
      if (logRes.ok && logRes.data) {
        const list = logRes.data.logs || (Array.isArray(logRes.data) ? logRes.data : []);
        setRecentLogs(list);
      }
      setLoading(false);
      setFeedback({ message: "Dashboard metrics refreshed successfully.", isError: false });
      setTimeout(() => setFeedback({ message: "", isError: false }), 3000);
    });
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top Header Bar with Settings, Notifications & Profile */}
        <AdminTopbar
          title="Administrative Dashboard"
          subtitle="Configure security policies, audit cooperative transactions, and oversee access."
          settings={settings}
          onToggleGoogle={handleToggleGoogle}
          onToggleFacebook={handleToggleFacebook}
          onToggleRecaptcha={handleToggleRecaptcha}
          onToggleWeather={handleToggleWeather}
          onToggleOneSignal={handleToggleOneSignal}
          onToggleCloudinary={handleToggleCloudinary}
        />

        {/* Global Feedback Alert */}
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

        {/* 4 KPI Top Cards */}
        <div className="wz-kpi-grid">
          {/* Card 1: Registered Accounts */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#ecfdf5", color: "#166534" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Registered Accounts</div>
                <div className="wz-kpi-value">{loading ? "..." : stats.accounts}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Active</span>
              <span className="wz-trend-subtitle">Members & Staff</span>
            </div>
          </div>

          {/* Card 2: Total Bookings */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#f0fdfa", color: "#0d9488" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Machinery Bookings</div>
                <div className="wz-kpi-value">{loading ? "..." : stats.bookings}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Cooperative</span>
              <span className="wz-trend-subtitle">Reservations</span>
            </div>
          </div>

          {/* Card 3: System Status */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#ecfdf5", color: "#10b981" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">System Security</div>
                <div className="wz-kpi-value" style={{ fontSize: "1.15rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
                  Operational
                </div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">100% Uptime</span>
              <span className="wz-trend-subtitle">All Services</span>
            </div>
          </div>

          {/* Card 4: OAuth Protocols */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#eff6ff", color: "#2563eb" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">OAuth Providers</div>
                <div className="wz-kpi-value">
                  {settings.googleLoginEnabled && settings.facebookLoginEnabled ? "2 Active" : settings.googleLoginEnabled || settings.facebookLoginEnabled ? "1 Active" : "Disabled"}
                </div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Verified</span>
              <span className="wz-trend-subtitle">Sign-in Gateways</span>
            </div>
          </div>
        </div>

        {/* Main Content Grid: 2 Columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px", marginBottom: "24px" }}>
          {/* Left Column: Authentication & Security Settings */}
          <div className="wz-card" style={{ padding: "24px" }}>
            <div className="wz-card-header" style={{ marginBottom: "16px" }}>
              <div>
                <h2 className="wz-card-title" style={{ fontSize: "1.15rem" }}>Authentication &amp; Security Settings</h2>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Control global single sign-on (SSO) gateways and bot protection for members and cooperative staff.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Google Sign-In */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        color: "#ea4335",
                        fontSize: "1.1rem",
                      }}
                    >
                      G
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>Google Sign-In</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Allow members to authenticate with verified Google Workspace accounts.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedKeys((p) => ({ ...p, google: !p.google }))}
                      style={{
                        padding: "5px 10px",
                        background: apiKeys.google?.isCustom ? "#dcfce7" : "#ffffff",
                        color: apiKeys.google?.isCustom ? "#15803d" : "#475569",
                        border: `1px solid ${apiKeys.google?.isCustom ? "#86efac" : "#cbd5e1"}`,
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Configure custom Google credentials"
                    >
                      <span>{apiKeys.google?.isCustom ? "● Custom Keys" : "⚙️ Default Keys"}</span>
                      <span>{expandedKeys.google ? "▲" : "▼"}</span>
                    </button>
                    <span
                      style={{
                        fontSize: "0.78rem",
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

                {/* Expandable Google Key Drawer */}
                {expandedKeys.google && (
                  <div style={{ padding: "16px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                        Google OAuth 2.0 Credentials:
                      </span>
                      <span style={{ fontSize: "0.75rem", color: apiKeys.google?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                        {apiKeys.google?.isCustom ? "● Custom Keys Active" : `● Using Code Defaults (${apiKeys.google?.defaultClientIdMasked || "1042••••0nii4"})`}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          Google Client ID
                        </label>
                        <input
                          type="text"
                          className="wz-form-input"
                          style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.google?.defaultClientIdMasked || "1042••••0nii4"}`}
                          value={keyForms.googleClientId}
                          onChange={(e) => setKeyForms((p) => ({ ...p, googleClientId: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          Google Client Secret
                        </label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type={revealSecrets.google ? "text" : "password"}
                            className="wz-form-input"
                            style={{ flex: 1, padding: "8px 12px", fontSize: "0.82rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.google?.defaultClientSecretMasked || "GOCS••••wnVd"}`}
                            value={keyForms.googleClientSecret}
                            onChange={(e) => setKeyForms((p) => ({ ...p, googleClientSecret: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => setRevealSecrets((p) => ({ ...p, google: !p.google }))}
                            style={{
                              padding: "8px 12px",
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {revealSecrets.google ? "🙈 Hide" : "👁️ Reveal"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                      <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                        Leave blank or click Reset to Default to revert to system code keys.
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {apiKeys.google?.isCustom && (
                          <button
                            type="button"
                            onClick={handleResetGoogleKeys}
                            disabled={keySaving.google}
                            style={{
                              padding: "6px 12px",
                              background: "#fff1f2",
                              color: "#be123c",
                              border: "1px solid #fecdd3",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
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
                            padding: "6px 14px",
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {keySaving.google ? "Saving..." : "Save Credentials"}
                        </button>
                      </div>
                    </div>
                    {keyFeedback.google && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "0.78rem",
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

              {/* Facebook Sign-In */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        color: "#1877f2",
                        fontSize: "1.1rem",
                      }}
                    >
                      f
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>Facebook Sign-In</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Allow members to authenticate using Facebook OAuth credentials.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedKeys((p) => ({ ...p, facebook: !p.facebook }))}
                      style={{
                        padding: "5px 10px",
                        background: apiKeys.facebook?.isCustom ? "#dcfce7" : "#ffffff",
                        color: apiKeys.facebook?.isCustom ? "#15803d" : "#475569",
                        border: `1px solid ${apiKeys.facebook?.isCustom ? "#86efac" : "#cbd5e1"}`,
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Configure custom Facebook credentials"
                    >
                      <span>{apiKeys.facebook?.isCustom ? "● Custom Keys" : "⚙️ Default Keys"}</span>
                      <span>{expandedKeys.facebook ? "▲" : "▼"}</span>
                    </button>
                    <span
                      style={{
                        fontSize: "0.78rem",
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

                {/* Expandable Facebook Key Drawer */}
                {expandedKeys.facebook && (
                  <div style={{ padding: "16px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                        Facebook Graph API Credentials:
                      </span>
                      <span style={{ fontSize: "0.75rem", color: apiKeys.facebook?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                        {apiKeys.facebook?.isCustom ? "● Custom Keys Active" : `● Using Code Defaults (${apiKeys.facebook?.defaultAppIdMasked || "4031••••3782"})`}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          Facebook App ID
                        </label>
                        <input
                          type="text"
                          className="wz-form-input"
                          style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.facebook?.defaultAppIdMasked || "4031••••3782"}`}
                          value={keyForms.facebookAppId}
                          onChange={(e) => setKeyForms((p) => ({ ...p, facebookAppId: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          Facebook App Secret
                        </label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type={revealSecrets.facebook ? "text" : "password"}
                            className="wz-form-input"
                            style={{ flex: 1, padding: "8px 12px", fontSize: "0.82rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.facebook?.defaultAppSecretMasked || "4495••••139"}`}
                            value={keyForms.facebookAppSecret}
                            onChange={(e) => setKeyForms((p) => ({ ...p, facebookAppSecret: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => setRevealSecrets((p) => ({ ...p, facebook: !p.facebook }))}
                            style={{
                              padding: "8px 12px",
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {revealSecrets.facebook ? "🙈 Hide" : "👁️ Reveal"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                      <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                        Leave blank or click Reset to Default to revert to system code keys.
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {apiKeys.facebook?.isCustom && (
                          <button
                            type="button"
                            onClick={handleResetFacebookKeys}
                            disabled={keySaving.facebook}
                            style={{
                              padding: "6px 12px",
                              background: "#fff1f2",
                              color: "#be123c",
                              border: "1px solid #fecdd3",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
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
                            padding: "6px 14px",
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {keySaving.facebook ? "Saving..." : "Save Credentials"}
                        </button>
                      </div>
                    </div>
                    {keyFeedback.facebook && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "0.78rem",
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

              {/* Google reCAPTCHA v2 Security */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        color: "#0284c7",
                        fontSize: "1.1rem",
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>Google reCAPTCHA v2</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Protect member sign-in and registration forms from bots and brute-force attempts.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedKeys((p) => ({ ...p, recaptcha: !p.recaptcha }))}
                      style={{
                        padding: "5px 10px",
                        background: apiKeys.recaptcha?.isCustom ? "#dcfce7" : "#ffffff",
                        color: apiKeys.recaptcha?.isCustom ? "#15803d" : "#475569",
                        border: `1px solid ${apiKeys.recaptcha?.isCustom ? "#86efac" : "#cbd5e1"}`,
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Configure custom reCAPTCHA keys"
                    >
                      <span>{apiKeys.recaptcha?.isCustom ? "● Custom Keys" : "⚙️ Default Keys"}</span>
                      <span>{expandedKeys.recaptcha ? "▲" : "▼"}</span>
                    </button>
                    <span
                      style={{
                        fontSize: "0.78rem",
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

                {/* Expandable reCAPTCHA Key Drawer */}
                {expandedKeys.recaptcha && (
                  <div style={{ padding: "16px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                        Google reCAPTCHA v2 Keys:
                      </span>
                      <span style={{ fontSize: "0.75rem", color: apiKeys.recaptcha?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                        {apiKeys.recaptcha?.isCustom ? "● Custom Keys Active" : `● Using Code Defaults (${apiKeys.recaptcha?.defaultSiteKeyMasked || "6Lfr••••6UG5"})`}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          Site Key (Client-side)
                        </label>
                        <input
                          type="text"
                          className="wz-form-input"
                          style={{ width: "100%", padding: "8px 12px", fontSize: "0.82rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.recaptcha?.defaultSiteKeyMasked || "6Lfr••••6UG5"}`}
                          value={keyForms.recaptchaSiteKey}
                          onChange={(e) => setKeyForms((p) => ({ ...p, recaptchaSiteKey: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          Secret Key (Server-side)
                        </label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type={revealSecrets.recaptcha ? "text" : "password"}
                            className="wz-form-input"
                            style={{ flex: 1, padding: "8px 12px", fontSize: "0.82rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.recaptcha?.defaultSecretKeyMasked || "6Lfr••••ST12"}`}
                            value={keyForms.recaptchaSecretKey}
                            onChange={(e) => setKeyForms((p) => ({ ...p, recaptchaSecretKey: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => setRevealSecrets((p) => ({ ...p, recaptcha: !p.recaptcha }))}
                            style={{
                              padding: "8px 12px",
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {revealSecrets.recaptcha ? "🙈 Hide" : "👁️ Reveal"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                      <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                        Leave blank or click Reset to Default to revert to system code keys.
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {apiKeys.recaptcha?.isCustom && (
                          <button
                            type="button"
                            onClick={handleResetRecaptchaKeys}
                            disabled={keySaving.recaptcha}
                            style={{
                              padding: "6px 12px",
                              background: "#fff1f2",
                              color: "#be123c",
                              border: "1px solid #fecdd3",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
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
                            padding: "6px 14px",
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {keySaving.recaptcha ? "Saving..." : "Save Keys"}
                        </button>
                      </div>
                    </div>
                    {keyFeedback.recaptcha && (
                      <div
                        style={{
                          marginTop: "10px",
                          fontSize: "0.78rem",
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

              {/* Kalilangan Weather Forecast API */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: "#fef3c7",
                        border: "1px solid #fde68a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#d97706",
                        fontSize: "1.1rem",
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
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>Kalilangan Weather Forecast API</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Provide 3-day Kalilangan weather predictions on the manager dispatch calendar (WeatherAPI.com).
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedKeys((p) => ({ ...p, weather: !p.weather }))}
                      style={{
                        padding: "5px 10px",
                        background: apiKeys.weather?.isCustom ? "#dcfce7" : "#ffffff",
                        color: apiKeys.weather?.isCustom ? "#15803d" : "#475569",
                        border: `1px solid ${apiKeys.weather?.isCustom ? "#86efac" : "#cbd5e1"}`,
                        borderRadius: "8px",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Configure custom API key"
                    >
                      <span>{apiKeys.weather?.isCustom ? "● Custom Key" : "⚙️ Default Key"}</span>
                      <span>{expandedKeys.weather ? "▲" : "▼"}</span>
                    </button>
                    <span
                      style={{
                        fontSize: "0.78rem",
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

                {/* Weather Custom Key Drawer */}
                {expandedKeys.weather && (
                  <div style={{ padding: "16px 20px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                        WeatherAPI.com API Key:
                      </span>
                      <span style={{ fontSize: "0.74rem", color: apiKeys.weather?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                        {apiKeys.weather?.isCustom ? "● Custom Key Active" : `● Using Code Default (${apiKeys.weather?.defaultKeyMasked || "7145••••••••0611"})`}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type={revealSecrets.weather ? "text" : "password"}
                        className="wz-form-input"
                        style={{ flex: 1, padding: "8px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                        placeholder={`Code default: ${apiKeys.weather?.defaultKeyMasked || "7145••••••••0611"}`}
                        value={keyForms.weatherApiKey}
                        onChange={(e) => setKeyForms((p) => ({ ...p, weatherApiKey: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, weather: !p.weather }))}
                        style={{
                          padding: "8px 12px",
                          background: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          fontSize: "0.78rem",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {revealSecrets.weather ? "🙈 Hide" : "👁️ Reveal"}
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                      <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                        Leave blank or click Reset to Default to revert back to the code default key.
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {apiKeys.weather?.isCustom && (
                          <button
                            type="button"
                            onClick={handleResetWeatherKey}
                            disabled={keySaving.weather}
                            style={{
                              padding: "6px 12px",
                              background: "#fff1f2",
                              color: "#be123c",
                              border: "1px solid #fecdd3",
                              borderRadius: "6px",
                              fontSize: "0.78rem",
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
                            padding: "6px 14px",
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {keySaving.weather ? "Saving..." : "Save Custom Key"}
                        </button>
                      </div>
                    </div>
                    {keyFeedback.weather && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "0.78rem",
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

              {/* OneSignal Web Push */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#e11d48",
                        fontSize: "1.1rem",
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      </svg>
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>OneSignal Web Push Notifications</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Send browser push updates for booking status, approvals, and machinery schedules.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedKeys((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                      style={{
                        padding: "5px 10px",
                        background: apiKeys.oneSignal?.isCustom ? "#dcfce7" : "#ffffff",
                        color: apiKeys.oneSignal?.isCustom ? "#15803d" : "#475569",
                        border: `1px solid ${apiKeys.oneSignal?.isCustom ? "#86efac" : "#cbd5e1"}`,
                        borderRadius: "8px",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Configure custom credentials"
                    >
                      <span>{apiKeys.oneSignal?.isCustom ? "● Custom Keys" : "⚙️ Default Keys"}</span>
                      <span>{expandedKeys.oneSignal ? "▲" : "▼"}</span>
                    </button>
                    <span
                      style={{
                        fontSize: "0.78rem",
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

                {/* OneSignal Custom Keys Drawer */}
                {expandedKeys.oneSignal && (
                  <div style={{ padding: "16px 20px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                        OneSignal Web Push Credentials:
                      </span>
                      <span style={{ fontSize: "0.74rem", color: apiKeys.oneSignal?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                        {apiKeys.oneSignal?.isCustom ? "● Custom Keys Active" : `● Using Code Defaults (${apiKeys.oneSignal?.defaultAppIdMasked || "fc81••••896839"})`}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div>
                        <label style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                          OneSignal App ID
                        </label>
                        <input
                          type="text"
                          className="wz-form-input"
                          style={{ width: "100%", padding: "8px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.oneSignal?.defaultAppIdMasked || "fc81••••896839"}`}
                          value={keyForms.oneSignalAppId}
                          onChange={(e) => setKeyForms((p) => ({ ...p, oneSignalAppId: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                          OneSignal REST API Key
                        </label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type={revealSecrets.oneSignal ? "text" : "password"}
                            className="wz-form-input"
                            style={{ flex: 1, padding: "8px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.oneSignal?.defaultRestKeyMasked || "os_v2_••••••••nbyq"}`}
                            value={keyForms.oneSignalRestApiKey}
                            onChange={(e) => setKeyForms((p) => ({ ...p, oneSignalRestApiKey: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => setRevealSecrets((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                            style={{
                              padding: "8px 12px",
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {revealSecrets.oneSignal ? "🙈 Hide" : "👁️ Reveal"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                      <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                        Leave blank or click Reset to Default to revert back to system code keys.
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {apiKeys.oneSignal?.isCustom && (
                          <button
                            type="button"
                            onClick={handleResetOneSignalKeys}
                            disabled={keySaving.oneSignal}
                            style={{
                              padding: "6px 12px",
                              background: "#fff1f2",
                              color: "#be123c",
                              border: "1px solid #fecdd3",
                              borderRadius: "6px",
                              fontSize: "0.78rem",
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
                            padding: "6px 14px",
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {keySaving.oneSignal ? "Saving..." : "Save Custom Keys"}
                        </button>
                      </div>
                    </div>
                    {keyFeedback.oneSignal && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "0.78rem",
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

              {/* Cloudinary Media Storage */}
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#2563eb",
                        fontSize: "1.1rem",
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                        <path d="M12 13v-5" />
                        <path d="m9 10 3-3 3 3" />
                      </svg>
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>Cloudinary Cloud Media Storage</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Upload machinery images and avatars to Cloudinary (falls back to local disk if disabled).
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExpandedKeys((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                      style={{
                        padding: "5px 10px",
                        background: apiKeys.cloudinary?.isCustom ? "#dcfce7" : "#ffffff",
                        color: apiKeys.cloudinary?.isCustom ? "#15803d" : "#475569",
                        border: `1px solid ${apiKeys.cloudinary?.isCustom ? "#86efac" : "#cbd5e1"}`,
                        borderRadius: "8px",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                      title="Configure custom credentials"
                    >
                      <span>{apiKeys.cloudinary?.isCustom ? "● Custom Keys" : "⚙️ Default Keys"}</span>
                      <span>{expandedKeys.cloudinary ? "▲" : "▼"}</span>
                    </button>
                    <span
                      style={{
                        fontSize: "0.78rem",
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

                {/* Cloudinary Custom Credentials Drawer */}
                {expandedKeys.cloudinary && (
                  <div style={{ padding: "16px 20px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
                        Cloudinary Cloud Credentials:
                      </span>
                      <span style={{ fontSize: "0.74rem", color: apiKeys.cloudinary?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                        {apiKeys.cloudinary?.isCustom ? "● Custom Credentials Active" : `● Using Code Defaults (${apiKeys.cloudinary?.defaultCloudName || "kimpc"})`}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <label style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                            Cloud Name
                          </label>
                          <input
                            type="text"
                            className="wz-form-input"
                            style={{ width: "100%", padding: "8px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.cloudinary?.defaultCloudName || "kimpc"}`}
                            value={keyForms.cloudinaryCloudName}
                            onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryCloudName: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                            API Key
                          </label>
                          <input
                            type="text"
                            className="wz-form-input"
                            style={{ width: "100%", padding: "8px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.cloudinary?.defaultApiKeyMasked || "6913••••7346"}`}
                            value={keyForms.cloudinaryApiKey}
                            onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryApiKey: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: "0.74rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                          API Secret
                        </label>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type={revealSecrets.cloudinary ? "text" : "password"}
                            className="wz-form-input"
                            style={{ flex: 1, padding: "8px 12px", fontSize: "0.84rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.cloudinary?.defaultApiSecretMasked || "0aNA••••••••KnY"}`}
                            value={keyForms.cloudinaryApiSecret}
                            onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryApiSecret: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => setRevealSecrets((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                            style={{
                              padding: "8px 12px",
                              background: "#f1f5f9",
                              border: "1px solid #cbd5e1",
                              borderRadius: "8px",
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {revealSecrets.cloudinary ? "🙈 Hide" : "👁️ Reveal"}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
                      <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                        Leave blank or click Reset to Default to revert back to system code keys.
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {apiKeys.cloudinary?.isCustom && (
                          <button
                            type="button"
                            onClick={handleResetCloudinaryKeys}
                            disabled={keySaving.cloudinary}
                            style={{
                              padding: "6px 12px",
                              background: "#fff1f2",
                              color: "#be123c",
                              border: "1px solid #fecdd3",
                              borderRadius: "6px",
                              fontSize: "0.78rem",
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
                            padding: "6px 14px",
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {keySaving.cloudinary ? "Saving..." : "Save Credentials"}
                        </button>
                      </div>
                    </div>
                    {keyFeedback.cloudinary && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "0.78rem",
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

              {/* Cooperative Security Information Box */}
              <div
                style={{
                  padding: "16px",
                  background: "#f0fdf4",
                  borderRadius: "12px",
                  border: "1px solid #bbf7d0",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: "2px" }}
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <div style={{ fontSize: "0.82rem", color: "#166534", lineHeight: 1.45 }}>
                  <strong>Cooperative Security Standard:</strong> Multi-factor password verification and audit
                  logging are active across all KIMPC accounts. Any password reset requires cooperative admin OTP
                  issuance.
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Quick Administration Actions & Info */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Quick Actions Card */}
            <div className="wz-card" style={{ padding: "24px" }}>
              <div className="wz-card-header" style={{ marginBottom: "16px" }}>
                <h2 className="wz-card-title" style={{ fontSize: "1.15rem" }}>Quick Actions</h2>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Link
                  to="/account-management"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 13px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                    </div>
                    <span>Accounts &amp; Role Permissions</span>
                  </div>
                  <span style={{ color: "#64748b", fontSize: "0.82rem" }}>→</span>
                </Link>

                <Link
                  to="/admin/financial-policies"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 13px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    </div>
                    <span>Deposits, Payments &amp; Refunds</span>
                  </div>
                  <span style={{ color: "#64748b", fontSize: "0.82rem" }}>→</span>
                </Link>

                <Link
                  to="/admin/reports"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 13px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#ecfdf5", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                    </div>
                    <span>Rental &amp; Financial Reports (CSV)</span>
                  </div>
                  <span style={{ color: "#64748b", fontSize: "0.82rem" }}>→</span>
                </Link>

                <Link
                  to="/admin/backups"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 13px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#ede9fe", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      </svg>
                    </div>
                    <span>Backups &amp; Sandbox Restore</span>
                  </div>
                  <span style={{ color: "#64748b", fontSize: "0.82rem" }}>→</span>
                </Link>

                <Link
                  to="/audit-logs"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 13px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    textDecoration: "none",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <span>System Audit Trail</span>
                  </div>
                  <span style={{ color: "#64748b", fontSize: "0.82rem" }}>→</span>
                </Link>

                <button
                  type="button"
                  onClick={refreshAll}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "11px 14px",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    color: "#334155",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    marginTop: "4px",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Refresh Metrics</span>
                </button>
              </div>
            </div>

            {/* Cooperative Organization Profile Card */}
            <div className="wz-card" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <img
                  src="/images/kimpc logo.png"
                  alt="KIMPC Logo"
                  style={{ width: "36px", height: "36px", objectFit: "contain", borderRadius: "8px" }}
                />
                <div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>KIMPC</div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Kalilangan Irrigators Multi-Purpose Coop</div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b", lineHeight: 1.4 }}>
                Admin Portal v2.0 • Serving cooperative members with modern machinery fleet management, bookings, and transparent operations.
              </p>
            </div>
          </div>
        </div>

        {/* Functional System Audit Logs Table with all 7 columns */}
        <div className="wz-table-card">
          <div className="wz-table-toolbar" style={{ flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h3 className="wz-table-title" style={{ margin: 0 }}>System Audit Logs</h3>
                <span style={{ fontSize: "0.74rem", background: "#f1f5f9", padding: "2px 8px", borderRadius: "12px", color: "#475569", fontWeight: 700 }}>
                  Live Trail
                </span>
              </div>
              <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                Complete verifiable audit trail recording Date &amp; Time, Performed By, Module, Action, Affected Record, Result, and Details.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              {/* Search within Audit Logs */}
              <input
                type="text"
                placeholder="Search audit trail..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  outline: "none",
                  width: "180px",
                }}
              />

              {/* Module Filter Select */}
              <select
                value={logFilterModule}
                onChange={(e) => setLogFilterModule(e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: "0.8rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  outline: "none",
                  fontWeight: 600,
                }}
              >
                <option value="all">All Modules</option>
                <option value="Accounts & Roles">Accounts &amp; Roles</option>
                <option value="Bookings">Bookings</option>
                <option value="Authentication">Authentication</option>
                <option value="Security Settings">Security Settings</option>
                <option value="Financial Policies">Financial Policies</option>
                <option value="Database Backups">Database Backups</option>
                <option value="Machinery Fleet">Machinery Fleet</option>
                <option value="Member Messages">Member Messages</option>
              </select>

              <button
                type="button"
                onClick={handleRefreshAuditDashboard}
                disabled={isRefreshingAudit}
                className={`wz-icon-btn ${isRefreshingAudit ? "spinning" : ""}`}
                style={{
                  background: "var(--wz-card-bg, #ffffff)",
                  border: "1px solid var(--wz-border, #cbd5e1)",
                  color: isRefreshingAudit ? "#166534" : "var(--wz-text, #334155)",
                  cursor: isRefreshingAudit ? "wait" : "pointer",
                }}
                title="Refresh audit logs"
                aria-label="Refresh audit logs"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>

              <Link
                to="/audit-logs"
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#166534",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                View Full Audit Logs →
              </Link>
            </div>
          </div>

          <div className="wz-table-responsive" style={{ overflowX: "hidden", width: "100%" }}>
            <table className="wz-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ width: "13%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Date &amp; Time</th>
                  <th style={{ width: "21%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Performed By</th>
                  <th style={{ width: "15%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Module</th>
                  <th style={{ width: "18%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Action</th>
                  <th style={{ width: "19%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Affected Record</th>
                  <th style={{ width: "8%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 4px", textAlign: "center", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Result</th>
                  <th style={{ width: "6%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 4px", textAlign: "center", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = recentLogs.filter((log) => {
                    if (logFilterModule !== "all") {
                      const mod = (log.module || "").toLowerCase();
                      if (!mod.includes(logFilterModule.toLowerCase().split(" ")[0])) return false;
                    }
                    if (logSearchQuery.trim()) {
                      const q = logSearchQuery.toLowerCase();
                      const matchActor = (log.actorEmail || log.actorName || log.performedBy?.name || "").toLowerCase().includes(q);
                      const matchAction = (log.action || "").toLowerCase().includes(q);
                      const matchModule = (log.module || "").toLowerCase().includes(q);
                      const matchRecord = (log.affectedRecord || "").toLowerCase().includes(q);
                      const matchDetails = (log.details || "").toLowerCase().includes(q);
                      if (!matchActor && !matchAction && !matchModule && !matchRecord && !matchDetails) return false;
                    }
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan="7" style={{ textAlign: "center", padding: "28px", color: "#64748b", fontSize: "0.78rem" }}>
                          No audit log records found matching your filters.
                        </td>
                      </tr>
                    );
                  }

                  return filtered.slice(0, 15).map((log, index) => {
                    const modBadge = getModuleBadgeStyle(log.module);
                    const resBadge = getResultBadgeStyle(log.result || log.status);
                    const actorName = log.performedBy?.name || log.actorName || (log.actorEmail ? log.actorEmail.split("@")[0] : "System");
                    const actorEmail = log.performedBy?.email || log.actorEmail || "system";
                    const actorRole = log.performedBy?.role || log.actorRole || "admin";

                    const d = log.createdAt ? new Date(log.createdAt) : null;
                    const isValid = d && !isNaN(d.getTime());
                    const datePart = isValid
                      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "Recently";
                    const timePart = isValid
                      ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                      : "";

                    return (
                      <tr
                        key={log._id || log.id || index}
                        style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s ease" }}
                      >
                        {/* 1. Date & Time (2 lines) */}
                        <td style={{ padding: "8px 8px", lineHeight: 1.2 }}>
                          <div style={{ color: "#0f172a", fontWeight: 700, fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                            {datePart}
                          </div>
                          {timePart && (
                            <div style={{ color: "#64748b", fontSize: "0.66rem", fontWeight: 500, marginTop: "1px", whiteSpace: "nowrap" }}>
                              {timePart}
                            </div>
                          )}
                        </td>

                        {/* 2. Performed By */}
                        <td style={{ padding: "8px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "50%",
                                background: actorRole === "admin" ? "#166534" : actorRole === "manager" ? "#0284c7" : "#0f172a",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.68rem",
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              {(actorName || "S")[0].toUpperCase()}
                            </div>
                            <div style={{ lineHeight: 1.15, minWidth: 0, overflow: "hidden" }}>
                              <div style={{ fontWeight: 700, fontSize: "0.74rem", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={actorName}>
                                {actorName}
                              </div>
                              <div style={{ fontSize: "0.66rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={actorEmail}>
                                <span style={{ textTransform: "capitalize", fontWeight: 600, color: actorRole === "admin" ? "#166534" : "#0284c7" }}>
                                  {actorRole}
                                </span>{" "}
                                • {actorEmail}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Module */}
                        <td style={{ padding: "8px 8px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.66rem",
                              fontWeight: 700,
                              background: modBadge.bg,
                              color: modBadge.text,
                              border: `1px solid ${modBadge.border}`,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                            title={log.module || "System"}
                          >
                            {log.module || "System"}
                          </span>
                        </td>

                        {/* 4. Action */}
                        <td style={{ padding: "8px 8px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 5px",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                              fontSize: "0.66rem",
                              fontWeight: 700,
                              background: "#f1f5f9",
                              color: "#1e293b",
                              border: "1px solid #e2e8f0",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                            title={log.action}
                          >
                            {log.action}
                          </span>
                        </td>

                        {/* 5. Affected Record */}
                        <td style={{ padding: "8px 8px" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "0.74rem",
                              color: "#0f172a",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={log.affectedRecord || "—"}
                          >
                            {log.affectedRecord || "—"}
                          </div>
                        </td>

                        {/* 6. Result */}
                        <td style={{ textAlign: "center", padding: "8px 4px" }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.66rem",
                              fontWeight: 700,
                              background: resBadge.bg,
                              color: resBadge.text,
                              border: `1px solid ${resBadge.border}`,
                              display: "inline-block",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {log.result || log.status || "Success"}
                          </span>
                        </td>

                        {/* 7. Details (Clickable Icon) */}
                        <td style={{ textAlign: "center", padding: "6px 4px" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAuditLog(log);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "24px",
                              height: "24px",
                              borderRadius: "5px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#0284c7",
                              cursor: "pointer",
                              padding: 0,
                              transition: "all 0.15s ease",
                            }}
                            title="Click to view full event audit details"
                            aria-label="View Details"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Log Record Detail Modal */}
        {selectedAuditLog && (
          <div
            className="wz-modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
            onClick={() => setSelectedAuditLog(null)}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                maxWidth: "600px",
                width: "100%",
                padding: "24px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: "6px",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      background: getModuleBadgeStyle(selectedAuditLog.module).bg,
                      color: getModuleBadgeStyle(selectedAuditLog.module).text,
                      border: `1px solid ${getModuleBadgeStyle(selectedAuditLog.module).border}`,
                    }}
                  >
                    {selectedAuditLog.module || "System"}
                  </span>
                  <h3 style={{ margin: "8px 0 0", fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>
                    Audit Event Details
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}
                >
                  &times;
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>DATE &amp; TIME</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                    {selectedAuditLog.date || new Date(selectedAuditLog.createdAt).toLocaleString()}
                  </div>
                </div>

                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>RESULT / STATUS</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: selectedAuditLog.result === "Success" ? "#166534" : "#dc2626", marginTop: "2px" }}>
                    {selectedAuditLog.result || selectedAuditLog.status || "Success"}
                  </div>
                </div>

                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>PERFORMED BY</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                    {selectedAuditLog.performedBy?.name || selectedAuditLog.actorName || selectedAuditLog.actorEmail || "System"}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                    Role: {selectedAuditLog.performedBy?.role || selectedAuditLog.actorRole || "admin"}
                  </div>
                </div>

                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>AFFECTED RECORD</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                    {selectedAuditLog.affectedRecord || "—"}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
                  ACTION &amp; HUMAN DETAILS
                </div>
                <div style={{ padding: "12px", background: "#f1f5f9", borderRadius: "8px", fontSize: "0.86rem", color: "#1e293b", lineHeight: 1.4 }}>
                  <strong>Action:</strong> <code style={{ fontFamily: "monospace", color: "#0284c7" }}>{selectedAuditLog.action}</code>
                  <div style={{ marginTop: "6px" }}>{selectedAuditLog.details}</div>
                  {selectedAuditLog.ip && (
                    <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "6px" }}>
                      Origin IP: {selectedAuditLog.ip}
                    </div>
                  )}
                </div>
              </div>

              {selectedAuditLog.rawDetails && typeof selectedAuditLog.rawDetails === "object" && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
                    RAW PAYLOAD (JSON)
                  </div>
                  <pre
                    style={{
                      padding: "10px",
                      background: "#0f172a",
                      color: "#38bdf8",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      overflowX: "auto",
                      maxHeight: "150px",
                    }}
                  >
                    {JSON.stringify(selectedAuditLog.rawDetails, null, 2)}
                  </pre>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
