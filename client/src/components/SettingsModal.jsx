import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { getStoredTheme, applyTheme } from "../services/theme";

export default function SettingsModal({
  isOpen,
  onClose,
  initialTab = "account", // "account" | "appearance" | "oauth"
  settings = null,
  onToggleGoogle = null,
  onToggleFacebook = null,
  onToggleRecaptcha = null,
  onToggleWeather = null,
  onToggleOneSignal = null,
  onToggleCloudinary = null,
}) {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [currentTheme, setCurrentTheme] = useState(() => getStoredTheme());

  // Edit Profile Form State
  const [profileData, setProfileData] = useState({
    fullName: user?.fullName || "",
    phone: "",
    email: user?.email || "",
    cooperativeId: "",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState({ message: "", isError: false });

  // Change Password Form State
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState({ message: "", isError: false });

  // Customizable API Keys State (Admin Only)
  const [apiKeys, setApiKeys] = useState({
    weather: { isCustom: false, customKey: "", defaultKeyMasked: "" },
    oneSignal: { isCustom: false, customAppId: "", customRestApiKey: "", defaultAppIdMasked: "", defaultRestKeyMasked: "" },
    cloudinary: { isCustom: false, customCloudName: "", customApiKey: "", customApiSecret: "", defaultCloudName: "", defaultApiKeyMasked: "", defaultApiSecretMasked: "" },
  });
  const [keyForms, setKeyForms] = useState({
    weatherApiKey: "",
    oneSignalAppId: "",
    oneSignalRestApiKey: "",
    cloudinaryCloudName: "",
    cloudinaryApiKey: "",
    cloudinaryApiSecret: "",
  });
  const [expandedKeys, setExpandedKeys] = useState({
    weather: false,
    oneSignal: false,
    cloudinary: false,
  });
  const [revealSecrets, setRevealSecrets] = useState({
    weather: false,
    oneSignal: false,
    cloudinary: false,
  });
  const [keyFeedback, setKeyFeedback] = useState({});
  const [keySaving, setKeySaving] = useState({});

  const loadApiKeys = async () => {
    if (!isAdmin) return;
    const { ok, data } = await api("/admin/api-keys");
    if (ok && data) {
      setApiKeys(data);
      setKeyForms({
        weatherApiKey: data.weather?.customKey || "",
        oneSignalAppId: data.oneSignal?.customAppId || "",
        oneSignalRestApiKey: data.oneSignal?.customRestApiKey || "",
        cloudinaryCloudName: data.cloudinary?.customCloudName || "",
        cloudinaryApiKey: data.cloudinary?.customApiKey || "",
        cloudinaryApiSecret: data.cloudinary?.customApiSecret || "",
      });
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

  // Fetch complete profile and API keys on mount
  useEffect(() => {
    if (isOpen) {
      api("/auth/me").then(({ ok, data }) => {
        if (ok && data) {
          setProfileData({
            fullName: data.fullName || user?.fullName || "",
            phone: data.phone || "",
            email: data.email || user?.email || "",
            cooperativeId: data.cooperativeId || "",
          });
        }
      });
      if (isAdmin) {
        loadApiKeys();
      }
      setCurrentTheme(getStoredTheme());
      setActiveTab(initialTab);
      setProfileFeedback({ message: "", isError: false });
      setPasswordFeedback({ message: "", isError: false });
    }
  }, [isOpen, initialTab, user, isAdmin]);

  if (!isOpen) return null;

  const handleThemeSelect = (mode) => {
    applyTheme(mode);
    setCurrentTheme(mode);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!profileData.fullName.trim()) {
      setProfileFeedback({ message: "Full Name cannot be empty.", isError: true });
      return;
    }
    setProfileLoading(true);
    setProfileFeedback({ message: "", isError: false });

    const res = await api("/auth/profile", {
      method: "PATCH",
      body: {
        fullName: profileData.fullName.trim(),
        phone: profileData.phone.trim(),
      },
    });

    setProfileLoading(false);
    if (!res.ok) {
      setProfileFeedback({ message: res.data?.error || "Failed to update profile.", isError: true });
    } else {
      updateProfile({ fullName: profileData.fullName.trim() });
      setProfileFeedback({ message: "Profile details updated successfully!", isError: false });
      setTimeout(() => setProfileFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      setPasswordFeedback({ message: "Current and new passwords are required.", isError: true });
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setPasswordFeedback({ message: "New password must be at least 6 characters.", isError: true });
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordFeedback({ message: "New password and confirmation do not match.", isError: true });
      return;
    }

    setPasswordLoading(true);
    setPasswordFeedback({ message: "", isError: false });

    const res = await api("/auth/change-password", {
      method: "POST",
      body: {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        confirmPassword: passwordData.confirmPassword,
      },
    });

    setPasswordLoading(false);
    if (!res.ok) {
      setPasswordFeedback({ message: res.data?.error || "Failed to update password.", isError: true });
    } else {
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordFeedback({ message: "Password updated successfully!", isError: false });
      setTimeout(() => setPasswordFeedback({ message: "", isError: false }), 4000);
    }
  };

  return (
    <div className="wz-modal-overlay" style={{ zIndex: 1300 }}>
      <div className="wz-settings-modal">
        {/* Modal Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--wz-border, #e2e8f0)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#f0fdf4", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                Cooperative Settings
              </h3>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                KIMPC Portal Account &amp; Preferences
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.2rem",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="wz-settings-tabs">
          <button
            type="button"
            className={`wz-settings-tab ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Account &amp; Security</span>
          </button>

          <button
            type="button"
            className={`wz-settings-tab ${activeTab === "appearance" ? "active" : ""}`}
            onClick={() => setActiveTab("appearance")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <span>Appearance</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              className={`wz-settings-tab ${activeTab === "oauth" ? "active" : ""}`}
              onClick={() => setActiveTab("oauth")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Auth &amp; Security Gateways</span>
            </button>
          )}
        </div>

        {/* Tab Contents */}
        <div className="wz-settings-content">
          {/* ================= TAB 1: Account & Security ================= */}
          {activeTab === "account" && (
            <div>
              {/* Section 1: Edit Own Profile */}
              <div style={{ marginBottom: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                      Edit Own Profile
                    </h4>
                    <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                      Update your cooperative display name and contact phone.
                    </p>
                  </div>
                </div>

                {/* Quick Link to Web Push & Full Settings */}
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1.1rem" }}>🔔</span>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#166534" }}>
                        Push Notifications &amp; Member Preferences
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#15803d" }}>
                        Configure OneSignal web push alerts, booking reminders &amp; farm settings.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate("/member/settings");
                    }}
                    style={{
                      background: "#166534",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      padding: "6px 12px",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Open Notification Settings →
                  </button>
                </div>

                {profileFeedback.message && (
                  <div
                    style={{
                      padding: "8px 12px",
                      marginBottom: "12px",
                      borderRadius: "8px",
                      fontSize: "0.8rem",
                      background: profileFeedback.isError ? "#fee2e2" : "#f0fdf4",
                      color: profileFeedback.isError ? "#991b1b" : "#166534",
                      border: `1px solid ${profileFeedback.isError ? "#fca5a5" : "#bbf7d0"}`,
                    }}
                  >
                    {profileFeedback.message}
                  </div>
                )}

                <form onSubmit={handleProfileSubmit}>
                  <div className="wz-form-group">
                    <label className="wz-form-label">Full Name</label>
                    <input
                      type="text"
                      className="wz-form-input"
                      value={profileData.fullName}
                      onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="wz-form-group">
                      <label className="wz-form-label">Phone Number</label>
                      <input
                        type="text"
                        className="wz-form-input"
                        value={profileData.phone}
                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                        placeholder="+63 9XX XXX XXXX"
                      />
                    </div>
                    <div className="wz-form-group">
                      <label className="wz-form-label">Cooperative ID</label>
                      <input
                        type="text"
                        className="wz-form-input"
                        value={profileData.cooperativeId || "Staff / Admin"}
                        disabled
                      />
                    </div>
                  </div>

                  <div className="wz-form-group">
                    <label className="wz-form-label">Email Address (Managed by Admin)</label>
                    <input
                      type="email"
                      className="wz-form-input"
                      value={profileData.email}
                      disabled
                    />
                  </div>

                  <button
                    type="submit"
                    className="wz-btn-submit"
                    disabled={profileLoading}
                  >
                    {profileLoading ? "Saving Changes..." : "Save Profile Details"}
                  </button>
                </form>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--wz-border, #e2e8f0)", margin: "24px 0" }} />

              {/* Section 2: Change Password */}
              <div>
                <div style={{ marginBottom: "14px" }}>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                    Change Password
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                    Ensure your account is using a long, random password to stay secure.
                  </p>
                </div>

                {passwordFeedback.message && (
                  <div
                    style={{
                      padding: "8px 12px",
                      marginBottom: "12px",
                      borderRadius: "8px",
                      fontSize: "0.8rem",
                      background: passwordFeedback.isError ? "#fee2e2" : "#f0fdf4",
                      color: passwordFeedback.isError ? "#991b1b" : "#166534",
                      border: `1px solid ${passwordFeedback.isError ? "#fca5a5" : "#bbf7d0"}`,
                    }}
                  >
                    {passwordFeedback.message}
                  </div>
                )}

                <form onSubmit={handlePasswordSubmit}>
                  <div className="wz-form-group">
                    <label className="wz-form-label">Current Password</label>
                    <input
                      type={showPasswords ? "text" : "password"}
                      className="wz-form-input"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      placeholder="Enter current password"
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="wz-form-group">
                      <label className="wz-form-label">New Password</label>
                      <input
                        type={showPasswords ? "text" : "password"}
                        className="wz-form-input"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        placeholder="At least 6 characters"
                        required
                      />
                    </div>
                    <div className="wz-form-group">
                      <label className="wz-form-label">Confirm New Password</label>
                      <input
                        type={showPasswords ? "text" : "password"}
                        className="wz-form-input"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        placeholder="Repeat new password"
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px", marginBottom: "16px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#64748b", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={showPasswords}
                        onChange={(e) => setShowPasswords(e.target.checked)}
                      />
                      <span>Show passwords</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="wz-btn-submit"
                    disabled={passwordLoading}
                  >
                    {passwordLoading ? "Updating..." : "Update Password"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ================= TAB 2: Appearance ================= */}
          {activeTab === "appearance" && (
            <div>
              <div>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                  Theme Appearance
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                  Select how KIMPC displays across your workspace.
                </p>
              </div>

              <div className="wz-theme-grid">
                {/* Light Option */}
                <div
                  className={`wz-theme-card ${currentTheme === "light" ? "active" : ""}`}
                  onClick={() => handleThemeSelect("light")}
                >
                  {currentTheme === "light" && <div className="wz-theme-check">✓</div>}
                  <div className="wz-theme-preview light">
                    ☀️
                  </div>
                  <div className="wz-theme-title">Light</div>
                  <div className="wz-theme-desc">Crisp, bright daytime contrast</div>
                </div>

                {/* Dark Option */}
                <div
                  className={`wz-theme-card ${currentTheme === "dark" ? "active" : ""}`}
                  onClick={() => handleThemeSelect("dark")}
                >
                  {currentTheme === "dark" && <div className="wz-theme-check">✓</div>}
                  <div className="wz-theme-preview dark">
                    🌙
                  </div>
                  <div className="wz-theme-title">Dark</div>
                  <div className="wz-theme-desc">Reduced eye strain in low-light</div>
                </div>

                {/* Follow Device Option */}
                <div
                  className={`wz-theme-card ${currentTheme === "device" ? "active" : ""}`}
                  onClick={() => handleThemeSelect("device")}
                >
                  {currentTheme === "device" && <div className="wz-theme-check">✓</div>}
                  <div className="wz-theme-preview device">
                    💻
                  </div>
                  <div className="wz-theme-title">Follow Device</div>
                  <div className="wz-theme-desc">Sync automatically with system OS</div>
                </div>
              </div>

              <div style={{ marginTop: "24px", padding: "14px 16px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--wz-border, #e2e8f0)" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>
                  Active Mode: <span style={{ color: "#166534", textTransform: "capitalize" }}>{currentTheme}</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.74rem", color: "#64748b", lineHeight: 1.4 }}>
                  Theme preference is stored persistently and seamlessly applies across your entire session.
                </p>
              </div>
            </div>
          )}

          {/* ================= TAB 3: System Auth & Security (Admin Only) ================= */}
          {activeTab === "oauth" && isAdmin && (
            <div>
              <div style={{ marginBottom: "16px" }}>
                <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                  Authentication &amp; Security Settings
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                  Configure OAuth providers, bot protection, and external system integrations (Weather, OneSignal, Cloudinary).
                </p>
              </div>

              {/* Section 1: Sign-In Gateways & Bot Defense */}
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", margin: "14px 0 8px" }}>
                Authentication &amp; Bot Defense
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Google Sign-In */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid var(--wz-border, #e2e8f0)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#ea4335" }}>
                      G
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.88rem", color: "var(--wz-text, #0f172a)" }}>Google Sign-In</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>Allow members and staff to authenticate via Google</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: settings?.googleLoginEnabled ? "#16a34a" : "#64748b" }}>
                      {settings?.googleLoginEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <label className="wz-switch-toggle">
                      <input
                        type="checkbox"
                        checked={!!settings?.googleLoginEnabled}
                        onChange={onToggleGoogle || (() => {})}
                      />
                      <span className="wz-switch-slider" />
                    </label>
                  </div>
                </div>

                {/* Facebook Sign-In */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid var(--wz-border, #e2e8f0)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#1877f2" }}>
                      f
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.88rem", color: "var(--wz-text, #0f172a)" }}>Facebook Sign-In</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>Allow members to authenticate via Facebook OAuth</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: settings?.facebookLoginEnabled ? "#16a34a" : "#64748b" }}>
                      {settings?.facebookLoginEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <label className="wz-switch-toggle">
                      <input
                        type="checkbox"
                        checked={!!settings?.facebookLoginEnabled}
                        onChange={onToggleFacebook || (() => {})}
                      />
                      <span className="wz-switch-slider" />
                    </label>
                  </div>
                </div>

                {/* Google reCAPTCHA v2 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid var(--wz-border, #e2e8f0)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0284c7" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.88rem", color: "var(--wz-text, #0f172a)" }}>Google reCAPTCHA v2</strong>
                      <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>Require captcha verification on member login &amp; registration</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: settings?.recaptchaEnabled ? "#16a34a" : "#64748b" }}>
                      {settings?.recaptchaEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <label className="wz-switch-toggle">
                      <input
                        type="checkbox"
                        checked={!!settings?.recaptchaEnabled}
                        onChange={onToggleRecaptcha || (() => {})}
                      />
                      <span className="wz-switch-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Section 2: External System Services & Integrations */}
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#64748b", margin: "20px 0 8px" }}>
                External System Services &amp; Customizable API Credentials
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Weather Forecast API (WeatherAPI.com) */}
                <div
                  style={{
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid var(--wz-border, #e2e8f0)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#fef3c7", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center", color: "#d97706" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
                        <strong style={{ fontSize: "0.88rem", color: "var(--wz-text, #0f172a)" }}>Kalilangan Weather Forecast</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>WeatherAPI.com 3-day forecast on manager dispatch calendar</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedKeys((p) => ({ ...p, weather: !p.weather }))}
                        style={{
                          padding: "4px 8px",
                          background: apiKeys.weather?.isCustom ? "#dcfce7" : "#ffffff",
                          color: apiKeys.weather?.isCustom ? "#15803d" : "#475569",
                          border: `1px solid ${apiKeys.weather?.isCustom ? "#86efac" : "#cbd5e1"}`,
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        title="Configure custom API key"
                      >
                        <span>{apiKeys.weather?.isCustom ? "● Custom Key" : "⚙️ Default Key"}</span>
                        <span>{expandedKeys.weather ? "▲" : "▼"}</span>
                      </button>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: settings?.weatherEnabled !== false ? "#16a34a" : "#64748b" }}>
                        {settings?.weatherEnabled !== false ? "Enabled" : "Disabled"}
                      </span>
                      <label className="wz-switch-toggle">
                        <input
                          type="checkbox"
                          checked={settings?.weatherEnabled !== false}
                          onChange={onToggleWeather || (() => {})}
                        />
                        <span className="wz-switch-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Expandable Key Drawer */}
                  {expandedKeys.weather && (
                    <div style={{ padding: "14px 16px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
                          WeatherAPI.com API Key:
                        </span>
                        <span style={{ fontSize: "0.72rem", color: apiKeys.weather?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                          {apiKeys.weather?.isCustom ? "● Custom Key Active" : `● Using Code Default (${apiKeys.weather?.defaultKeyMasked || "7145••••••••0611"})`}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type={revealSecrets.weather ? "text" : "password"}
                          className="wz-form-input"
                          style={{ flex: 1, padding: "7px 10px", fontSize: "0.8rem", fontFamily: "monospace" }}
                          placeholder={`Default in code: ${apiKeys.weather?.defaultKeyMasked || "7145••••••••0611"}`}
                          value={keyForms.weatherApiKey}
                          onChange={(e) => setKeyForms((p) => ({ ...p, weatherApiKey: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => setRevealSecrets((p) => ({ ...p, weather: !p.weather }))}
                          style={{
                            padding: "7px 10px",
                            background: "#f1f5f9",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {revealSecrets.weather ? "🙈 Hide" : "👁️ Reveal"}
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }}>
                        <span style={{ fontSize: "0.71rem", color: "#64748b" }}>
                          Leave blank or click Reset to Default to revert to system code key.
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {apiKeys.weather?.isCustom && (
                            <button
                              type="button"
                              onClick={handleResetWeatherKey}
                              disabled={keySaving.weather}
                              style={{
                                padding: "5px 10px",
                                background: "#fff1f2",
                                color: "#be123c",
                                border: "1px solid #fecdd3",
                                borderRadius: "6px",
                                fontSize: "0.74rem",
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
                              padding: "5px 12px",
                              background: "#0f172a",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {keySaving.weather ? "Saving..." : "Save Key"}
                          </button>
                        </div>
                      </div>
                      {keyFeedback.weather && (
                        <div
                          style={{
                            marginTop: "8px",
                            fontSize: "0.74rem",
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
                    borderRadius: "10px",
                    border: "1px solid var(--wz-border, #e2e8f0)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", display: "flex", alignItems: "center", justifyContent: "center", color: "#e11d48" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                      </div>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--wz-text, #0f172a)" }}>OneSignal Web Push</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>Push notification delivery for booking status alerts</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedKeys((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                        style={{
                          padding: "4px 8px",
                          background: apiKeys.oneSignal?.isCustom ? "#dcfce7" : "#ffffff",
                          color: apiKeys.oneSignal?.isCustom ? "#15803d" : "#475569",
                          border: `1px solid ${apiKeys.oneSignal?.isCustom ? "#86efac" : "#cbd5e1"}`,
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        title="Configure custom credentials"
                      >
                        <span>{apiKeys.oneSignal?.isCustom ? "● Custom Keys" : "⚙️ Default Keys"}</span>
                        <span>{expandedKeys.oneSignal ? "▲" : "▼"}</span>
                      </button>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: settings?.oneSignalEnabled !== false ? "#16a34a" : "#64748b" }}>
                        {settings?.oneSignalEnabled !== false ? "Enabled" : "Disabled"}
                      </span>
                      <label className="wz-switch-toggle">
                        <input
                          type="checkbox"
                          checked={settings?.oneSignalEnabled !== false}
                          onChange={onToggleOneSignal || (() => {})}
                        />
                        <span className="wz-switch-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Expandable Key Drawer */}
                  {expandedKeys.oneSignal && (
                    <div style={{ padding: "14px 16px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
                          OneSignal Web Push Credentials:
                        </span>
                        <span style={{ fontSize: "0.72rem", color: apiKeys.oneSignal?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                          {apiKeys.oneSignal?.isCustom ? "● Custom Keys Active" : `● Using Code Defaults (${apiKeys.oneSignal?.defaultAppIdMasked || "fc81••••896839"})`}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div>
                          <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                            OneSignal App ID
                          </label>
                          <input
                            type="text"
                            className="wz-form-input"
                            style={{ width: "100%", padding: "7px 10px", fontSize: "0.8rem", fontFamily: "monospace" }}
                            placeholder={`Default in code: ${apiKeys.oneSignal?.defaultAppIdMasked || "fc81••••896839"}`}
                            value={keyForms.oneSignalAppId}
                            onChange={(e) => setKeyForms((p) => ({ ...p, oneSignalAppId: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                            OneSignal REST API Key
                          </label>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input
                              type={revealSecrets.oneSignal ? "text" : "password"}
                              className="wz-form-input"
                              style={{ flex: 1, padding: "7px 10px", fontSize: "0.8rem", fontFamily: "monospace" }}
                              placeholder={`Default in code: ${apiKeys.oneSignal?.defaultRestKeyMasked || "os_v2_••••••••nbyq"}`}
                              value={keyForms.oneSignalRestApiKey}
                              onChange={(e) => setKeyForms((p) => ({ ...p, oneSignalRestApiKey: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setRevealSecrets((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                              style={{
                                padding: "7px 10px",
                                background: "#f1f5f9",
                                border: "1px solid #cbd5e1",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {revealSecrets.oneSignal ? "🙈 Hide" : "👁️ Reveal"}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }}>
                        <span style={{ fontSize: "0.71rem", color: "#64748b" }}>
                          Leave blank or click Reset to Default to revert to system code keys.
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {apiKeys.oneSignal?.isCustom && (
                            <button
                              type="button"
                              onClick={handleResetOneSignalKeys}
                              disabled={keySaving.oneSignal}
                              style={{
                                padding: "5px 10px",
                                background: "#fff1f2",
                                color: "#be123c",
                                border: "1px solid #fecdd3",
                                borderRadius: "6px",
                                fontSize: "0.74rem",
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
                              padding: "5px 12px",
                              background: "#0f172a",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {keySaving.oneSignal ? "Saving..." : "Save Keys"}
                          </button>
                        </div>
                      </div>
                      {keyFeedback.oneSignal && (
                        <div
                          style={{
                            marginTop: "8px",
                            fontSize: "0.74rem",
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
                    borderRadius: "10px",
                    border: "1px solid var(--wz-border, #e2e8f0)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb" }}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                          <path d="M12 13v-5" />
                          <path d="m9 10 3-3 3 3" />
                        </svg>
                      </div>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--wz-text, #0f172a)" }}>Cloudinary Cloud Storage</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "#64748b" }}>Upload machinery &amp; profile photos to cloud (falls back to local disk if disabled)</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedKeys((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                        style={{
                          padding: "4px 8px",
                          background: apiKeys.cloudinary?.isCustom ? "#dcfce7" : "#ffffff",
                          color: apiKeys.cloudinary?.isCustom ? "#15803d" : "#475569",
                          border: `1px solid ${apiKeys.cloudinary?.isCustom ? "#86efac" : "#cbd5e1"}`,
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        title="Configure custom credentials"
                      >
                        <span>{apiKeys.cloudinary?.isCustom ? "● Custom Keys" : "⚙️ Default Keys"}</span>
                        <span>{expandedKeys.cloudinary ? "▲" : "▼"}</span>
                      </button>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: settings?.cloudinaryEnabled !== false ? "#16a34a" : "#64748b" }}>
                        {settings?.cloudinaryEnabled !== false ? "Enabled" : "Disabled"}
                      </span>
                      <label className="wz-switch-toggle">
                        <input
                          type="checkbox"
                          checked={settings?.cloudinaryEnabled !== false}
                          onChange={onToggleCloudinary || (() => {})}
                        />
                        <span className="wz-switch-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Expandable Key Drawer */}
                  {expandedKeys.cloudinary && (
                    <div style={{ padding: "14px 16px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#334155" }}>
                          Cloudinary Cloud Credentials:
                        </span>
                        <span style={{ fontSize: "0.72rem", color: apiKeys.cloudinary?.isCustom ? "#16a34a" : "#0284c7", fontWeight: 600 }}>
                          {apiKeys.cloudinary?.isCustom ? "● Custom Credentials Active" : `● Using Code Defaults (${apiKeys.cloudinary?.defaultCloudName || "kimpc"})`}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <div>
                            <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                              Cloud Name
                            </label>
                            <input
                              type="text"
                              className="wz-form-input"
                              style={{ width: "100%", padding: "7px 10px", fontSize: "0.8rem", fontFamily: "monospace" }}
                              placeholder={`Default in code: ${apiKeys.cloudinary?.defaultCloudName || "kimpc"}`}
                              value={keyForms.cloudinaryCloudName}
                              onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryCloudName: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                              API Key
                            </label>
                            <input
                              type="text"
                              className="wz-form-input"
                              style={{ width: "100%", padding: "7px 10px", fontSize: "0.8rem", fontFamily: "monospace" }}
                              placeholder={`Default in code: ${apiKeys.cloudinary?.defaultApiKeyMasked || "6913••••7346"}`}
                              value={keyForms.cloudinaryApiKey}
                              onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryApiKey: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "3px" }}>
                            API Secret
                          </label>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input
                              type={revealSecrets.cloudinary ? "text" : "password"}
                              className="wz-form-input"
                              style={{ flex: 1, padding: "7px 10px", fontSize: "0.8rem", fontFamily: "monospace" }}
                              placeholder={`Default in code: ${apiKeys.cloudinary?.defaultApiSecretMasked || "0aNA••••••••KnY"}`}
                              value={keyForms.cloudinaryApiSecret}
                              onChange={(e) => setKeyForms((p) => ({ ...p, cloudinaryApiSecret: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setRevealSecrets((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                              style={{
                                padding: "7px 10px",
                                background: "#f1f5f9",
                                border: "1px solid #cbd5e1",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {revealSecrets.cloudinary ? "🙈 Hide" : "👁️ Reveal"}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }}>
                        <span style={{ fontSize: "0.71rem", color: "#64748b" }}>
                          Leave blank or click Reset to Default to revert to system code keys.
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {apiKeys.cloudinary?.isCustom && (
                            <button
                              type="button"
                              onClick={handleResetCloudinaryKeys}
                              disabled={keySaving.cloudinary}
                              style={{
                                padding: "5px 10px",
                                background: "#fff1f2",
                                color: "#be123c",
                                border: "1px solid #fecdd3",
                                borderRadius: "6px",
                                fontSize: "0.74rem",
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
                              padding: "5px 12px",
                              background: "#0f172a",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              fontSize: "0.74rem",
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
                            fontSize: "0.74rem",
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
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ padding: "14px 24px", background: "var(--wz-card-bg, #ffffff)", borderTop: "1px solid var(--wz-border, #e2e8f0)", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 18px",
              background: "#0f172a",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

