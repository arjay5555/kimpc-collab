import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AccountManagement() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  const [otpModal, setOtpModal] = useState({ open: false, account: null, code: "" });

  const fetchAccounts = async () => {
    setLoading(true);
    const res = await api("/accounts");
    if (res.ok && Array.isArray(res.data)) {
      setAccounts(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleIssueOtp = async (account) => {
    setFeedback({ message: "Issuing One-Time Password...", isError: false });
    const res = await api("/admin/issue-otp", {
      method: "POST",
      body: { email: account.email },
    });

    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Could not issue OTP.", isError: true });
      return;
    }

    setOtpModal({
      open: true,
      account,
      code: res.data.otp || res.data.tempPassword || "OTP generated and emailed to member",
    });
    setFeedback({ message: `One-Time Password generated for ${account.fullName || account.email}`, isError: false });
    fetchAccounts();
  };

  const filtered = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (acc.fullName || "").toLowerCase().includes(q) ||
      (acc.email || "").toLowerCase().includes(q) ||
      (acc.cooperativeId || "").toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (filterRole === "all") return true;
    return (acc.role || "").toLowerCase() === filterRole.toLowerCase();
  });

  const memberCount = accounts.filter((a) => (a.role || "").toLowerCase() === "member").length;
  const managerCount = accounts.filter((a) => (a.role || "").toLowerCase() === "manager").length;
  const adminCount = accounts.filter((a) => (a.role || "").toLowerCase() === "admin").length;
  const otpPendingCount = accounts.filter((a) => a.forgotPasswordRequested).length;

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top Header Bar with Settings, Notifications & Profile */}
        <AdminTopbar
          title="Account Management"
          subtitle="Manage member and staff roles, credentials, and password recovery keys."
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search accounts by name, email, or Coop ID..."
        />

        {/* Feedback Alert */}
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

        {/* 4 Mini Metric Badges */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "20px" }}>
          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Total Accounts</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{accounts.length}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>

          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Coop Members</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#166534", marginTop: "2px" }}>{memberCount}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", color: "#166534" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </div>

          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Staff &amp; Managers</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0284c7", marginTop: "2px" }}>{managerCount + adminCount}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", color: "#0284c7" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
          </div>

          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>OTP Requests</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: otpPendingCount > 0 ? "#dc2626" : "#0f172a", marginTop: "2px" }}>
                {otpPendingCount}
              </div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: otpPendingCount > 0 ? "#fee2e2" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: otpPendingCount > 0 ? "#dc2626" : "#64748b" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="wz-table-card">
          <div className="wz-table-toolbar">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3 className="wz-table-title" style={{ margin: 0 }}>Registered Cooperative Accounts</h3>
              <span style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>({filtered.length} found)</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Role filter buttons */}
              <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px" }}>
                <button
                  type="button"
                  onClick={() => setFilterRole("all")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: filterRole === "all" ? "#ffffff" : "transparent",
                    color: filterRole === "all" ? "#0f172a" : "#64748b",
                    fontWeight: 600,
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    boxShadow: filterRole === "all" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterRole("member")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: filterRole === "member" ? "#ffffff" : "transparent",
                    color: filterRole === "member" ? "#0f172a" : "#64748b",
                    fontWeight: 600,
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    boxShadow: filterRole === "member" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  Members
                </button>
                <button
                  type="button"
                  onClick={() => setFilterRole("manager")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: filterRole === "manager" ? "#ffffff" : "transparent",
                    color: filterRole === "manager" ? "#0f172a" : "#64748b",
                    fontWeight: 600,
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    boxShadow: filterRole === "manager" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  Managers
                </button>
              </div>

              <button
                type="button"
                onClick={fetchAccounts}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  color: "#334155",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="wz-table-responsive">
            <table className="wz-table">
              <thead>
                <tr>
                  <th>Member / Name</th>
                  <th>Cooperative ID</th>
                  <th>Email Address</th>
                  <th>System Role</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      Loading accounts directory...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      No matching accounts found for "{searchQuery}".
                    </td>
                  </tr>
                ) : (
                  filtered.map((acc) => {
                    const role = (acc.role || "member").toLowerCase();
                    const isStaff = role === "manager" || role === "admin";
                    return (
                      <tr key={acc._id || acc.email}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: isStaff ? "#0f172a" : "#166534",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "0.82rem",
                                flexShrink: 0,
                              }}
                            >
                              {acc.fullName ? acc.fullName[0].toUpperCase() : "U"}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>
                                {acc.fullName || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily: "monospace", color: "#0f766e", fontWeight: 600 }}>
                          {acc.cooperativeId || "—"}
                        </td>
                        <td style={{ color: "#334155", fontSize: "0.84rem" }}>{acc.email}</td>
                        <td>
                          <span
                            style={{
                              padding: "3px 9px",
                              borderRadius: "12px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              textTransform: "capitalize",
                              background:
                                role === "admin"
                                  ? "#f1f5f9"
                                  : role === "manager"
                                  ? "#e0f2fe"
                                  : "#dcfce7",
                              color:
                                role === "admin"
                                  ? "#0f172a"
                                  : role === "manager"
                                  ? "#0369a1"
                                  : "#15803d",
                            }}
                          >
                            {acc.role || "member"}
                          </span>
                        </td>
                        <td>
                          {acc.forgotPasswordRequested ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                background: "#fee2e2",
                                color: "#b91c1c",
                                borderRadius: "6px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                              }}
                            >
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#dc2626" }} />
                              OTP Requested
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                color: "#16a34a",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                              }}
                            >
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
                              Active
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {acc.forgotPasswordRequested ? (
                            <button
                              type="button"
                              onClick={() => handleIssueOtp(acc)}
                              style={{
                                padding: "5px 12px",
                                background: "#dc2626",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "0.76rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                boxShadow: "0 1px 2px rgba(220,38,38,0.2)",
                              }}
                            >
                              Issue OTP
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* OTP Generated Modal Dialog */}
      {otpModal.open && (
        <div className="wz-modal-overlay">
          <div className="wz-modal-content" style={{ maxWidth: "440px", padding: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#dcfce7",
                  color: "#16a34a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
                Temporary OTP Generated
              </h3>
            </div>

            <p style={{ fontSize: "0.84rem", color: "#475569", lineHeight: 1.45, margin: "0 0 16px" }}>
              Provide this key to cooperative member{" "}
              <strong style={{ color: "#0f172a" }}>{otpModal.account?.fullName}</strong> (
              {otpModal.account?.email}):
            </p>

            <div
              style={{
                background: "#f8fafc",
                padding: "16px",
                border: "2px dashed #0f766e",
                borderRadius: "10px",
                textAlign: "center",
                fontSize: "1.6rem",
                fontFamily: "monospace",
                letterSpacing: "4px",
                color: "#0f766e",
                fontWeight: 800,
                marginBottom: "16px",
              }}
            >
              {otpModal.code}
            </div>

            <div style={{ fontSize: "0.74rem", color: "#64748b", lineHeight: 1.4, marginBottom: "20px" }}>
              * This one-time password permits the member to reset their account access credentials securely.
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setOtpModal({ open: false, account: null, code: "" })}
                style={{
                  padding: "8px 18px",
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.84rem",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
