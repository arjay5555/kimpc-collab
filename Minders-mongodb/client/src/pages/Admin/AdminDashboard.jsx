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
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ message: "", isError: false });
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    // Load config
    api("/config").then(({ ok, data }) => {
      if (ok && data) {
        setSettings({
          googleLoginEnabled: data.googleLoginEnabled !== false,
          facebookLoginEnabled: data.facebookLoginEnabled !== false,
          recaptchaEnabled: data.recaptchaEnabled !== false,
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
    api("/admin/audit-logs").then(({ ok, data }) => {
      if (ok && data) {
        const list = data.logs || (Array.isArray(data) ? data : []);
        setRecentLogs(list.slice(0, 5));
      }
    });
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

  const refreshAll = () => {
    setLoading(true);
    Promise.all([
      api("/accounts"),
      api("/applications"),
      api("/admin/audit-logs"),
    ]).then(([accRes, appRes, logRes]) => {
      if (accRes.ok && Array.isArray(accRes.data)) {
        setStats((p) => ({ ...p, accounts: accRes.data.length }));
      }
      if (appRes.ok && Array.isArray(appRes.data)) {
        setStats((p) => ({ ...p, bookings: appRes.data.length }));
      }
      if (logRes.ok && logRes.data) {
        const list = logRes.data.logs || (Array.isArray(logRes.data) ? logRes.data : []);
        setRecentLogs(list.slice(0, 5));
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
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
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
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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

              {/* Facebook Sign-In */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
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
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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

              {/* Google reCAPTCHA v2 Security */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
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
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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

        {/* Recent Audit Activity Table */}
        <div className="wz-table-card">
          <div className="wz-table-toolbar">
            <div>
              <h3 className="wz-table-title">Recent Administrative &amp; Security Events</h3>
              <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                Latest security events captured by the cooperative audit logger.
              </p>
            </div>
            <Link
              to="/audit-logs"
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
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

          <div className="wz-table-responsive">
            <table className="wz-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor / User</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", padding: "28px", color: "#64748b" }}>
                      No recent audit events logged.
                    </td>
                  </tr>
                ) : (
                  recentLogs.map((log, index) => (
                    <tr key={log._id || index}>
                      <td style={{ color: "#64748b", whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : "Recently"}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: "3px 8px",
                            background: "#f1f5f9",
                            borderRadius: "6px",
                            fontFamily: "monospace",
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            color: "#334155",
                          }}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: "0.84rem" }}>
                        {log.actorEmail || log.email || "System"}
                      </td>
                      <td style={{ color: "#475569", fontSize: "0.82rem" }}>
                        {log.details || log.description || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
