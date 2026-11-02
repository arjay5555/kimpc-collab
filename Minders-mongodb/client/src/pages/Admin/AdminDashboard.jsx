import React, { useState, useEffect } from "react";
import Header from "../../components/Header";
import { api } from "../../services/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ accounts: 0, bookings: 0 });
  const [settings, setSettings] = useState({
    googleLoginEnabled: true,
    facebookLoginEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  useEffect(() => {
    api("/config").then(({ ok, data }) => {
      if (ok && data) {
        setSettings({
          googleLoginEnabled: data.googleLoginEnabled !== false,
          facebookLoginEnabled: data.facebookLoginEnabled !== false,
        });
      }
    });

    api("/accounts").then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        setStats((prev) => ({ ...prev, accounts: data.length }));
      }
      setLoading(false);
    });

    api("/applications").then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        setStats((prev) => ({ ...prev, bookings: data.length }));
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
    }
  };

  return (
    <div>
      <Header activePage="admin" />

      <main className="app-shell" style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        <section className="page-intro" style={{ marginBottom: "24px" }}>
          <p className="eyebrow">SYSTEM ADMINISTRATION / OVERVIEW</p>
          <h1>Administrative Operations</h1>
          <p className="muted">Configure security policies, audit cooperative transactions, and oversee access.</p>
        </section>

        {feedback.message && (
          <div className={`form-feedback ${feedback.isError ? "error" : ""}`} style={{ marginBottom: "16px" }}>
            {feedback.message}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "32px" }}>
          <div style={{ padding: "20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
            <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>Registered Accounts</div>
            <div style={{ fontSize: "2rem", fontWeight: "800", color: "#166534", marginTop: "4px" }}>{stats.accounts}</div>
          </div>
          <div style={{ padding: "20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
            <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>Total Machinery Bookings</div>
            <div style={{ fontSize: "2rem", fontWeight: "800", color: "#0d9488", marginTop: "4px" }}>{stats.bookings}</div>
          </div>
          <div style={{ padding: "20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
            <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", textTransform: "uppercase" }}>System Status</div>
            <div style={{ fontSize: "1.1rem", fontWeight: "700", color: "#10b981", marginTop: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }}></span> Operational
            </div>
          </div>
        </div>

        <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "24px" }}>
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 16px" }}>Authentication &amp; Security Settings</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
              <div>
                <strong style={{ fontSize: "0.95rem" }}>Google Sign-In</strong>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>Allow members and staff to authenticate with verified Google accounts.</p>
              </div>
              <button
                onClick={handleToggleGoogle}
                className={`button button-sm ${settings.googleLoginEnabled ? "button-primary" : "button-outline"}`}
              >
                {settings.googleLoginEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "0.95rem" }}>Facebook Sign-In</strong>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>Allow members and staff to authenticate using Facebook OAuth credentials.</p>
              </div>
              <button
                onClick={handleToggleFacebook}
                className={`button button-sm ${settings.facebookLoginEnabled ? "button-primary" : "button-outline"}`}
              >
                {settings.facebookLoginEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
