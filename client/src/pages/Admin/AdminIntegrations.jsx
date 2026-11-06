import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AdminIntegrations() {
  const [settings, setSettings] = useState({
    googleLoginEnabled: true,
    facebookLoginEnabled: false,
    recaptchaEnabled: true,
    weatherEnabled: true,
    oneSignalEnabled: true,
    cloudinaryEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // Customizable API Keys State
  const [apiKeys, setApiKeys] = useState({
    google: { clientId: "", clientSecret: "", isCustom: false, source: "default" },
    facebook: { appId: "", appSecret: "", isCustom: false, source: "default" },
    recaptcha: { siteKey: "", secretKey: "", isCustom: false, source: "default" },
    weather: { apiKey: "", isCustom: false, source: "default" },
    oneSignal: { appId: "", restApiKey: "", isCustom: false, source: "default" },
    cloudinary: { cloudName: "", apiKey: "", apiSecret: "", isCustom: false, source: "default" },
  });

  // Key form inputs
  const [keyInputs, setKeyInputs] = useState({
    google: { clientId: "", clientSecret: "" },
    facebook: { appId: "", appSecret: "" },
    recaptcha: { siteKey: "", secretKey: "" },
    weather: { apiKey: "" },
    oneSignal: { appId: "", restApiKey: "" },
    cloudinary: { cloudName: "", apiKey: "", apiSecret: "" },
  });

  // Drawer expansion state (toggled via Edit icon)
  const [expandedKeys, setExpandedKeys] = useState({
    google: false,
    facebook: false,
    recaptcha: false,
    weather: false,
    oneSignal: false,
    cloudinary: false,
  });

  // Reveal / Hide secrets toggle
  const [revealSecrets, setRevealSecrets] = useState({
    google: false,
    facebook: false,
    recaptcha: false,
    weather: false,
    oneSignal: false,
    cloudinary: false,
  });

  // Individual saving state & feedback
  const [keySaving, setKeySaving] = useState({});
  const [keyFeedback, setKeyFeedback] = useState({});

  // 1. Fetch current integration switches & customizable keys
  const fetchSettingsAndKeys = async () => {
    setLoading(true);
    try {
      const res = await api("/admin/settings");
      if (res.ok && res.data) {
        setSettings({
          googleLoginEnabled: res.data.googleLoginEnabled ?? true,
          facebookLoginEnabled: res.data.facebookLoginEnabled ?? false,
          recaptchaEnabled: res.data.recaptchaEnabled ?? true,
          weatherEnabled: res.data.weatherEnabled ?? true,
          oneSignalEnabled: res.data.oneSignalEnabled ?? true,
          cloudinaryEnabled: res.data.cloudinaryEnabled ?? true,
        });
      }

      const keysRes = await api("/admin/integrations/keys");
      if (keysRes.ok && keysRes.data?.data) {
        const d = keysRes.data?.data || keysRes.data || {};
        setApiKeys({
          google: d.google || {},
          facebook: d.facebook || {},
          recaptcha: d.recaptcha || {},
          weather: d.weather || {},
          oneSignal: d.oneSignal || {},
          cloudinary: d.cloudinary || {},
        });

        setKeyInputs({
          google: {
            clientId: d.google?.customClientId || "",
            clientSecret: d.google?.customClientSecret || "",
          },
          facebook: {
            appId: d.facebook?.customAppId || "",
            appSecret: d.facebook?.customAppSecret || "",
          },
          recaptcha: {
            siteKey: d.recaptcha?.customSiteKey || "",
            secretKey: d.recaptcha?.customSecretKey || "",
          },
          weather: {
            apiKey: d.weather?.customKey || "",
          },
          oneSignal: {
            appId: d.oneSignal?.customAppId || "",
            restApiKey: d.oneSignal?.customRestApiKey || "",
          },
          cloudinary: {
            cloudName: d.cloudinary?.customCloudName || "",
            apiKey: d.cloudinary?.customApiKey || "",
            apiSecret: d.cloudinary?.customApiSecret || "",
          },
        });
      }
    } catch (err) {
      console.error("Error fetching integrations:", err);
      setFeedback({ message: "Could not load integration settings.", isError: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndKeys();
  }, []);

  // Update a single setting switch with dual-route guarantee (dedicated endpoint + fallback PUT)
  const updateSetting = async (endpoint, key, value, label) => {
    const previous = settings[key];
    setSettings((prev) => ({ ...prev, [key]: value }));
    setFeedback({ message: `Updating ${label}...`, isError: false });

    try {
      // 1. Try dedicated endpoint first (e.g. /admin/settings/google-login)
      let res = await api(endpoint, {
        method: "POST",
        body: { enabled: value },
      });

      // 2. Also try PUT /admin/settings as reliable fallback
      if (!res.ok) {
        res = await api("/admin/settings", {
          method: "PUT",
          body: { [key]: value },
        });
      }

      if (!res.ok) {
        setSettings((prev) => ({ ...prev, [key]: previous }));
        setFeedback({ message: res.data?.error || `Failed to update ${label}.`, isError: true });
      } else {
        setFeedback({
          message: `${label} has been ${value ? "enabled" : "disabled"} successfully.`,
          isError: false,
        });
        setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
      }
    } catch (err) {
      console.error(`Error updating ${label}:`, err);
      setSettings((prev) => ({ ...prev, [key]: previous }));
      setFeedback({ message: `Network error updating ${label}.`, isError: true });
    }
  };

  // Toggle handlers mapped to both dedicated routes and PUT
  const handleToggleGoogle = () =>
    updateSetting("/admin/settings/google-login", "googleLoginEnabled", !settings.googleLoginEnabled, "Google Sign-In");
  const handleToggleFacebook = () =>
    updateSetting("/admin/settings/facebook-login", "facebookLoginEnabled", !settings.facebookLoginEnabled, "Facebook Sign-In");
  const handleToggleRecaptcha = () =>
    updateSetting("/admin/settings/recaptcha", "recaptchaEnabled", !settings.recaptchaEnabled, "Google reCAPTCHA v2");
  const handleToggleWeather = () =>
    updateSetting("/admin/settings/weather", "weatherEnabled", !settings.weatherEnabled, "Kalilangan Weather Forecast API");
  const handleToggleOneSignal = () =>
    updateSetting("/admin/settings/onesignal", "oneSignalEnabled", !settings.oneSignalEnabled, "OneSignal Web Push");
  const handleToggleCloudinary = () =>
    updateSetting("/admin/settings/cloudinary", "cloudinaryEnabled", !settings.cloudinaryEnabled, "Cloudinary Media Storage");

  // Save / Reset Handlers for Customizable Keys
  const handleSaveGoogleKeys = async () => {
    setKeySaving((p) => ({ ...p, google: true }));
    setKeyFeedback((p) => ({ ...p, google: null }));
    try {
      const res = await api("/admin/integrations/keys/google", {
        method: "POST",
        body: {
          clientId: keyInputs.google.clientId.trim(),
          clientSecret: keyInputs.google.clientSecret.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, google: { isError: true, message: res.data?.error || "Failed to update Google credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, google: { isError: false, message: "Google credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, google: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, google: { isError: true, message: "Network error saving Google credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, google: false }));
    }
  };

  const handleResetGoogleKeys = async () => {
    if (!window.confirm("Reset Google credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, google: true }));
    try {
      const res = await api("/admin/integrations/keys/google/reset", { method: "POST" });
      if (res.ok) {
        setKeyInputs((p) => ({ ...p, google: { clientId: "", clientSecret: "" } }));
        setKeyFeedback((p) => ({ ...p, google: { isError: false, message: "Reset to default system credentials." } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, google: null })), 4000);
      }
    } finally {
      setKeySaving((p) => ({ ...p, google: false }));
    }
  };

  const handleSaveFacebookKeys = async () => {
    setKeySaving((p) => ({ ...p, facebook: true }));
    setKeyFeedback((p) => ({ ...p, facebook: null }));
    try {
      const res = await api("/admin/integrations/keys/facebook", {
        method: "POST",
        body: {
          appId: keyInputs.facebook.appId.trim(),
          appSecret: keyInputs.facebook.appSecret.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, facebook: { isError: true, message: res.data?.error || "Failed to update Facebook credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, facebook: { isError: false, message: "Facebook credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, facebook: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, facebook: { isError: true, message: "Network error saving Facebook credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, facebook: false }));
    }
  };

  const handleResetFacebookKeys = async () => {
    if (!window.confirm("Reset Facebook credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, facebook: true }));
    try {
      const res = await api("/admin/integrations/keys/facebook/reset", { method: "POST" });
      if (res.ok) {
        setKeyInputs((p) => ({ ...p, facebook: { appId: "", appSecret: "" } }));
        setKeyFeedback((p) => ({ ...p, facebook: { isError: false, message: "Reset to default system credentials." } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, facebook: null })), 4000);
      }
    } finally {
      setKeySaving((p) => ({ ...p, facebook: false }));
    }
  };

  const handleSaveRecaptchaKeys = async () => {
    setKeySaving((p) => ({ ...p, recaptcha: true }));
    setKeyFeedback((p) => ({ ...p, recaptcha: null }));
    try {
      const res = await api("/admin/integrations/keys/recaptcha", {
        method: "POST",
        body: {
          siteKey: keyInputs.recaptcha.siteKey.trim(),
          secretKey: keyInputs.recaptcha.secretKey.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, recaptcha: { isError: true, message: res.data?.error || "Failed to update reCAPTCHA keys." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, recaptcha: { isError: false, message: "reCAPTCHA keys saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, recaptcha: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, recaptcha: { isError: true, message: "Network error saving reCAPTCHA keys." } }));
    } finally {
      setKeySaving((p) => ({ ...p, recaptcha: false }));
    }
  };

  const handleResetRecaptchaKeys = async () => {
    if (!window.confirm("Reset reCAPTCHA keys to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, recaptcha: true }));
    try {
      const res = await api("/admin/integrations/keys/recaptcha/reset", { method: "POST" });
      if (res.ok) {
        setKeyInputs((p) => ({ ...p, recaptcha: { siteKey: "", secretKey: "" } }));
        setKeyFeedback((p) => ({ ...p, recaptcha: { isError: false, message: "Reset to default system credentials." } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, recaptcha: null })), 4000);
      }
    } finally {
      setKeySaving((p) => ({ ...p, recaptcha: false }));
    }
  };

  const handleSaveWeatherKey = async () => {
    setKeySaving((p) => ({ ...p, weather: true }));
    setKeyFeedback((p) => ({ ...p, weather: null }));
    try {
      const res = await api("/admin/integrations/keys/weather", {
        method: "POST",
        body: {
          apiKey: keyInputs.weather.apiKey.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, weather: { isError: true, message: res.data?.error || "Failed to update Weather API key." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, weather: { isError: false, message: "Weather API key saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, weather: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, weather: { isError: true, message: "Network error saving Weather API key." } }));
    } finally {
      setKeySaving((p) => ({ ...p, weather: false }));
    }
  };

  const handleResetWeatherKey = async () => {
    if (!window.confirm("Reset Weather API key to default system code key?")) return;
    setKeySaving((p) => ({ ...p, weather: true }));
    try {
      const res = await api("/admin/integrations/keys/weather/reset", { method: "POST" });
      if (res.ok) {
        setKeyInputs((p) => ({ ...p, weather: { apiKey: "" } }));
        setKeyFeedback((p) => ({ ...p, weather: { isError: false, message: "Reset to default system credentials." } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, weather: null })), 4000);
      }
    } finally {
      setKeySaving((p) => ({ ...p, weather: false }));
    }
  };

  const handleSaveOneSignalKeys = async () => {
    setKeySaving((p) => ({ ...p, oneSignal: true }));
    setKeyFeedback((p) => ({ ...p, oneSignal: null }));
    try {
      const res = await api("/admin/integrations/keys/onesignal", {
        method: "POST",
        body: {
          appId: keyInputs.oneSignal.appId.trim(),
          restApiKey: keyInputs.oneSignal.restApiKey.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, oneSignal: { isError: true, message: res.data?.error || "Failed to update OneSignal credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, oneSignal: { isError: false, message: "OneSignal credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, oneSignal: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, oneSignal: { isError: true, message: "Network error saving OneSignal credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, oneSignal: false }));
    }
  };

  const handleResetOneSignalKeys = async () => {
    if (!window.confirm("Reset OneSignal credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, oneSignal: true }));
    try {
      const res = await api("/admin/integrations/keys/onesignal/reset", { method: "POST" });
      if (res.ok) {
        setKeyInputs((p) => ({ ...p, oneSignal: { appId: "", restApiKey: "" } }));
        setKeyFeedback((p) => ({ ...p, oneSignal: { isError: false, message: "Reset to default system credentials." } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, oneSignal: null })), 4000);
      }
    } finally {
      setKeySaving((p) => ({ ...p, oneSignal: false }));
    }
  };

  const handleSaveCloudinaryKeys = async () => {
    setKeySaving((p) => ({ ...p, cloudinary: true }));
    setKeyFeedback((p) => ({ ...p, cloudinary: null }));
    try {
      const res = await api("/admin/integrations/keys/cloudinary", {
        method: "POST",
        body: {
          cloudName: keyInputs.cloudinary.cloudName.trim(),
          apiKey: keyInputs.cloudinary.apiKey.trim(),
          apiSecret: keyInputs.cloudinary.apiSecret.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, cloudinary: { isError: true, message: res.data?.error || "Failed to update Cloudinary credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, cloudinary: { isError: false, message: "Cloudinary credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, cloudinary: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, cloudinary: { isError: true, message: "Network error saving Cloudinary credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, cloudinary: false }));
    }
  };

  const handleResetCloudinaryKeys = async () => {
    if (!window.confirm("Reset Cloudinary credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, cloudinary: true }));
    try {
      const res = await api("/admin/integrations/keys/cloudinary/reset", { method: "POST" });
      if (res.ok) {
        setKeyInputs((p) => ({ ...p, cloudinary: { cloudName: "", apiKey: "", apiSecret: "" } }));
        setKeyFeedback((p) => ({ ...p, cloudinary: { isError: false, message: "Reset to default system credentials." } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, cloudinary: null })), 4000);
      }
    } finally {
      setKeySaving((p) => ({ ...p, cloudinary: false }));
    }
  };

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

        {/* ================= Single Seamless Container for All Integrations ================= */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--wz-border, #edf2f7)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
            overflow: "hidden",
            marginBottom: "28px",
          }}
        >
          {/* ================= 1. Google Sign-In ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/google logo.png"
                    alt="Google"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Google Sign-In</strong>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => setExpandedKeys((p) => ({ ...p, google: !p.google }))}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.google
                      ? "#166534"
                      : apiKeys.google?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.google?.isCustom
                      ? "Custom Google credentials active (Click to edit)"
                      : "Edit Google credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.google?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.googleLoginEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.googleLoginEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.googleLoginEnabled)}
                    onChange={handleToggleGoogle}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Google Keys Expandable Drawer */}
            {expandedKeys.google && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Google OAuth Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.google?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.google?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active Source: {apiKeys.google?.isCustom ? "Custom .env Key" : "Default Hardcoded Code"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      GOOGLE_CLIENT_ID
                    </label>
                    <input
                      type="text"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.google?.defaultClientIdMasked ? `Example (Default): ${apiKeys.google.defaultClientIdMasked}` : "e.g. 1047648325603-...apps.googleusercontent.com"}
                      value={keyInputs.google.clientId}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, google: { ...p.google, clientId: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      GOOGLE_CLIENT_SECRET
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.google ? "text" : "password"}
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.google?.defaultClientSecretMasked ? `Example (Default): ${apiKeys.google.defaultClientSecretMasked}` : "e.g. GOCSPX-..."}
                        value={keyInputs.google.clientSecret}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, google: { ...p.google, clientSecret: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, google: !p.google }))}
                        title={revealSecrets.google ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.google ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.google ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
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

          {/* ================= 2. Facebook Sign-In ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/FB LOGO.webp"
                    alt="Facebook"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Facebook Sign-In</strong>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => setExpandedKeys((p) => ({ ...p, facebook: !p.facebook }))}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.facebook
                      ? "#166534"
                      : apiKeys.facebook?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.facebook?.isCustom
                      ? "Custom Facebook credentials active (Click to edit)"
                      : "Edit Facebook credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.facebook?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.facebookLoginEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.facebookLoginEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.facebookLoginEnabled)}
                    onChange={handleToggleFacebook}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Facebook Keys Expandable Drawer */}
            {expandedKeys.facebook && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Facebook App Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.facebook?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.facebook?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active Source: {apiKeys.facebook?.isCustom ? "Custom .env Key" : "Default Hardcoded Code"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      FACEBOOK_APP_ID
                    </label>
                    <input
                      type="text"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.facebook?.defaultAppIdMasked ? `Example (Default): ${apiKeys.facebook.defaultAppIdMasked}` : "e.g. 19582..."}
                      value={keyInputs.facebook.appId}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, facebook: { ...p.facebook, appId: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      FACEBOOK_APP_SECRET
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.facebook ? "text" : "password"}
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.facebook?.defaultAppSecretMasked ? `Example (Default): ${apiKeys.facebook.defaultAppSecretMasked}` : "e.g. 38d9f..."}
                        value={keyInputs.facebook.appSecret}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, facebook: { ...p.facebook, appSecret: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, facebook: !p.facebook }))}
                        title={revealSecrets.facebook ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.facebook ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.facebook ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
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

          {/* ================= 3. Google reCAPTCHA v2 ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/recaptcha.jpg"
                    alt="reCAPTCHA"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Google reCAPTCHA v2</strong>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => setExpandedKeys((p) => ({ ...p, recaptcha: !p.recaptcha }))}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.recaptcha
                      ? "#166534"
                      : apiKeys.recaptcha?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.recaptcha?.isCustom
                      ? "Custom reCAPTCHA keys active (Click to edit)"
                      : "Edit reCAPTCHA keys"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.recaptcha?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.recaptchaEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.recaptchaEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.recaptchaEnabled)}
                    onChange={handleToggleRecaptcha}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom reCAPTCHA Keys Expandable Drawer */}
            {expandedKeys.recaptcha && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Google reCAPTCHA v2 Keys (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.recaptcha?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.recaptcha?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active Source: {apiKeys.recaptcha?.isCustom ? "Custom .env Key" : "Default Hardcoded Code"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      RECAPTCHA_SITE_KEY (Frontend)
                    </label>
                    <input
                      type="text"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.recaptcha?.defaultSiteKeyMasked ? `Example (Default): ${apiKeys.recaptcha.defaultSiteKeyMasked}` : "e.g. 6Ldxq..."}
                      value={keyInputs.recaptcha.siteKey}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, recaptcha: { ...p.recaptcha, siteKey: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      RECAPTCHA_SECRET_KEY (Backend Verification)
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.recaptcha ? "text" : "password"}
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.recaptcha?.defaultSecretKeyMasked ? `Example (Default): ${apiKeys.recaptcha.defaultSecretKeyMasked}` : "e.g. 6Ldxq..."}
                        value={keyInputs.recaptcha.secretKey}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, recaptcha: { ...p.recaptcha, secretKey: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, recaptcha: !p.recaptcha }))}
                        title={revealSecrets.recaptcha ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.recaptcha ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.recaptcha ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
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
                      {keySaving.recaptcha ? "Saving to .env..." : "Save Credentials"}
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

          {/* ================= 4. Kalilangan Weather Forecast API ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#f0f9ff",
                    border: "1px solid #e0f2fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  </svg>
                </div>
                <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Kalilangan Weather Forecast API</strong>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => setExpandedKeys((p) => ({ ...p, weather: !p.weather }))}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.weather
                      ? "#166534"
                      : apiKeys.weather?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.weather?.isCustom
                      ? "Custom Weather API key active (Click to edit)"
                      : "Edit Weather API key"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.weather?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.weatherEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.weatherEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.weatherEnabled)}
                    onChange={handleToggleWeather}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Weather Key Expandable Drawer */}
            {expandedKeys.weather && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom WeatherAPI Key (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.weather?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.weather?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active Source: {apiKeys.weather?.isCustom ? "Custom .env Key" : "Default Hardcoded Code"}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                    WEATHER_API_KEY (WeatherAPI.com Token)
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type={revealSecrets.weather ? "text" : "password"}
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                      placeholder={apiKeys.weather?.defaultKeyMasked ? `Example (Default): ${apiKeys.weather.defaultKeyMasked}` : "e.g. 7145472cabdc45fe8f414215260611"}
                      value={keyInputs.weather.apiKey}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, weather: { ...p.weather, apiKey: e.target.value } }))}
                    />
                    <button
                      type="button"
                      onClick={() => setRevealSecrets((p) => ({ ...p, weather: !p.weather }))}
                      title={revealSecrets.weather ? "Hide secret" : "Reveal secret"}
                      style={{
                        width: "38px",
                        height: "38px",
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: revealSecrets.weather ? "#166534" : "#64748b",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {revealSecrets.weather ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
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
                      {keySaving.weather ? "Saving to .env..." : "Save Credentials"}
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

          {/* ================= 5. OneSignal Web Push Notifications ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/one signal logo.webp"
                    alt="OneSignal"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>OneSignal Web Push Notifications</strong>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => setExpandedKeys((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.oneSignal
                      ? "#166534"
                      : apiKeys.oneSignal?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.oneSignal?.isCustom
                      ? "Custom OneSignal credentials active (Click to edit)"
                      : "Edit OneSignal credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.oneSignal?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.oneSignalEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.oneSignalEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.oneSignalEnabled)}
                    onChange={handleToggleOneSignal}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom OneSignal Keys Expandable Drawer */}
            {expandedKeys.oneSignal && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom OneSignal Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.oneSignal?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.oneSignal?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active Source: {apiKeys.oneSignal?.isCustom ? "Custom .env Key" : "Default Hardcoded Code"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      ONESIGNAL_APP_ID
                    </label>
                    <input
                      type="text"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.oneSignal?.defaultAppIdMasked ? `Example (Default): ${apiKeys.oneSignal.defaultAppIdMasked}` : "e.g. fc811113-559c-40c3-ba59-e703db896839"}
                      value={keyInputs.oneSignal.appId}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, oneSignal: { ...p.oneSignal, appId: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      ONESIGNAL_REST_API_KEY
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.oneSignal ? "text" : "password"}
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.oneSignal?.defaultRestKeyMasked ? `Example (Default): ${apiKeys.oneSignal.defaultRestKeyMasked}` : "e.g. os_v2_app_..."}
                        value={keyInputs.oneSignal.restApiKey}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, oneSignal: { ...p.oneSignal, restApiKey: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                        title={revealSecrets.oneSignal ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.oneSignal ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.oneSignal ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
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
                      {keySaving.oneSignal ? "Saving to .env..." : "Save Credentials"}
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

          {/* ================= 6. Cloudinary Cloud Media Storage ================= */}
          <div style={{ borderBottom: "none" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/Cloudinary logo.webp"
                    alt="Cloudinary"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Cloudinary Cloud Media Storage</strong>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => setExpandedKeys((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.cloudinary
                      ? "#166534"
                      : apiKeys.cloudinary?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.cloudinary?.isCustom
                      ? "Custom Cloudinary credentials active (Click to edit)"
                      : "Edit Cloudinary credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.cloudinary?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.cloudinaryEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.cloudinaryEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.cloudinaryEnabled)}
                    onChange={handleToggleCloudinary}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Cloudinary Keys Expandable Drawer */}
            {expandedKeys.cloudinary && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Cloudinary Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.cloudinary?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.cloudinary?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active Source: {apiKeys.cloudinary?.isCustom ? "Custom .env Key" : "Default Hardcoded Code"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      CLOUDINARY_CLOUD_NAME
                    </label>
                    <input
                      type="text"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.cloudinary?.defaultCloudName ? `Example (Default): ${apiKeys.cloudinary.defaultCloudName}` : "e.g. kimpc"}
                      value={keyInputs.cloudinary.cloudName}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, cloudinary: { ...p.cloudinary, cloudName: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      CLOUDINARY_API_KEY
                    </label>
                    <input
                      type="text"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.cloudinary?.defaultApiKeyMasked ? `Example (Default): ${apiKeys.cloudinary.defaultApiKeyMasked}` : "e.g. 691365116427346"}
                      value={keyInputs.cloudinary.apiKey}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, cloudinary: { ...p.cloudinary, apiKey: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      CLOUDINARY_API_SECRET
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.cloudinary ? "text" : "password"}
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.cloudinary?.defaultApiSecretMasked ? `Example (Default): ${apiKeys.cloudinary.defaultApiSecretMasked}` : "e.g. ••••••••••••••••"}
                        value={keyInputs.cloudinary.apiSecret}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, cloudinary: { ...p.cloudinary, apiSecret: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                        title={revealSecrets.cloudinary ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.cloudinary ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.cloudinary ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
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
        </div>
      </main>
    </div>
  );
}
