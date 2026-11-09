import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { getStoredTheme, applyTheme } from "../services/theme";

export default function SettingsModal({
  isOpen,
  onClose,
  initialTab = "account", // "account" | "appearance"
}) {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState(initialTab === "oauth" ? "account" : initialTab);
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

  // Admin 6-Digit Security PIN Form State (Admin Only)
  const [pinData, setPinData] = useState({
    currentPin: "",
    newPin: "",
    confirmPin: "",
  });
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinFeedback, setPinFeedback] = useState({ message: "", isError: false });
  const [adminHasPin, setAdminHasPin] = useState(false);

  const fetchPinStatus = async () => {
    if (!isAdmin || !user?.email) return;
    try {
      const res = await api(`/admin/pin-status?email=${encodeURIComponent(user.email)}`);
      if (res.ok && res.data) {
        setAdminHasPin(Boolean(res.data.hasPin));
      }
    } catch (err) {
      console.warn("Could not fetch PIN status:", err);
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchPinStatus();
    }
  }, [isOpen, isAdmin, user?.email]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pinData.newPin)) {
      setPinFeedback({ message: "New PIN must be exactly 6 numeric digits.", isError: true });
      return;
    }
    if (pinData.newPin !== pinData.confirmPin) {
      setPinFeedback({ message: "New PIN and confirmation do not match.", isError: true });
      return;
    }
    if (pinData.newPin === pinData.currentPin) {
      setPinFeedback({ message: "New PIN must be different from current PIN.", isError: true });
      return;
    }

    setPinLoading(true);
    setPinFeedback({ message: "", isError: false });

    try {
      const res = await api("/admin/change-pin", {
        method: "POST",
        body: {
          email: user?.email,
          currentPin: pinData.currentPin,
          newPin: pinData.newPin,
          confirmPin: pinData.confirmPin,
        },
      });

      setPinLoading(false);
      if (!res.ok) {
        setPinFeedback({ message: res.data?.error || "Failed to update security PIN.", isError: true });
      } else {
        setPinData({ currentPin: "", newPin: "", confirmPin: "" });
        setAdminHasPin(true);
        setPinFeedback({ message: "6-digit admin security PIN updated successfully!", isError: false });
        setTimeout(() => setPinFeedback({ message: "", isError: false }), 4000);
      }
    } catch (err) {
      setPinLoading(false);
      setPinFeedback({ message: "Network error updating security PIN.", isError: true });
    }
  };

  // Fetch complete profile on mount
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
      setCurrentTheme(getStoredTheme());
      setActiveTab(initialTab === "oauth" ? "account" : initialTab);
      setProfileFeedback({ message: "", isError: false });
      setPasswordFeedback({ message: "", isError: false });
    }
  }, [isOpen, initialTab, user]);

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
                        value={profileData.cooperativeId || (isAdmin ? "ADMIN-01" : user?.role === "manager" ? "MGR-01" : "MEM-01")}
                        disabled
                      />
                    </div>
                  </div>

                  <div className="wz-form-group">
                    <label className="wz-form-label">Email Address {isAdmin ? "(Primary Account)" : "(System Account)"}</label>
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

              {/* Section 3: Admin 6-Digit Security PIN (Admin Only) */}
              {isAdmin && (
                <>
                  <hr style={{ border: "none", borderTop: "1px solid var(--wz-border, #e2e8f0)", margin: "24px 0" }} />
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                            Admin 6-Digit Security PIN
                          </h4>
                          <span
                            style={{
                              fontSize: "0.70rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "10px",
                              background: adminHasPin ? "#ecfdf5" : "#fffbeb",
                              color: adminHasPin ? "#15803d" : "#b45309",
                              border: `1px solid ${adminHasPin ? "#86efac" : "#fde68a"}`,
                            }}
                          >
                            {adminHasPin ? "● PIN Configured" : "● Using Default (123456)"}
                          </span>
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                          Manage the 6-digit PIN required to authorize sensitive administrator actions (integrations, account management).
                        </p>
                      </div>
                    </div>

                    {pinFeedback.message && (
                      <div
                        style={{
                          padding: "8px 12px",
                          marginBottom: "12px",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          background: pinFeedback.isError ? "#fee2e2" : "#f0fdf4",
                          color: pinFeedback.isError ? "#991b1b" : "#166534",
                          border: `1px solid ${pinFeedback.isError ? "#fca5a5" : "#bbf7d0"}`,
                        }}
                      >
                        {pinFeedback.message}
                      </div>
                    )}

                    <form onSubmit={handlePinSubmit}>
                      <div className="wz-form-group">
                        <label className="wz-form-label">
                          Current 6-Digit PIN {adminHasPin ? "" : "(Enter default: 123456)"}
                        </label>
                        <input
                          type={showPinForm ? "text" : "password"}
                          className="wz-form-input"
                          maxLength={6}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={pinData.currentPin}
                          onChange={(e) => setPinData({ ...pinData, currentPin: e.target.value.replace(/\D/g, "") })}
                          placeholder={adminHasPin ? "Enter current 6-digit PIN" : "Default: 123456"}
                          required
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div className="wz-form-group">
                          <label className="wz-form-label">New 6-Digit PIN</label>
                          <input
                            type={showPinForm ? "text" : "password"}
                            className="wz-form-input"
                            maxLength={6}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={pinData.newPin}
                            onChange={(e) => setPinData({ ...pinData, newPin: e.target.value.replace(/\D/g, "") })}
                            placeholder="Exactly 6 digits"
                            required
                          />
                        </div>
                        <div className="wz-form-group">
                          <label className="wz-form-label">Confirm New PIN</label>
                          <input
                            type={showPinForm ? "text" : "password"}
                            className="wz-form-input"
                            maxLength={6}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={pinData.confirmPin}
                            onChange={(e) => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, "") })}
                            placeholder="Repeat 6 digits"
                            required
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px", marginBottom: "16px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#64748b", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={showPinForm}
                            onChange={(e) => setShowPinForm(e.target.checked)}
                          />
                          <span>Show PIN digits</span>
                        </label>
                      </div>

                      <button
                        type="submit"
                        className="wz-btn-submit"
                        disabled={pinLoading}
                      >
                        {pinLoading ? "Updating PIN..." : "Update Security PIN"}
                      </button>
                    </form>
                  </div>
                </>
              )}
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

