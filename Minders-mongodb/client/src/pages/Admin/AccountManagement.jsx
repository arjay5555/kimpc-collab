import React, { useState, useEffect } from "react";
import Header from "../../components/Header";
import { api } from "../../services/api";

export default function AccountManagement() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  const [otpModal, setOtpModal] = useState({ open: false, account: null, code: "" });

  const fetchAccounts = async () => {
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
      setFeedback({ message: res.data.error || "Could not issue OTP.", isError: true });
      return;
    }

    setOtpModal({
      open: true,
      account,
      code: res.data.otp || res.data.tempPassword || "OTP generated and emailed to member",
    });
    setFeedback({ message: "", isError: false });
    fetchAccounts();
  };

  const filtered = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase();
    return (
      (acc.fullName || "").toLowerCase().includes(q) ||
      (acc.email || "").toLowerCase().includes(q) ||
      (acc.cooperativeId || "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <Header activePage="account-management" />

      <main className="app-shell" style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        <section className="page-intro" style={{ marginBottom: "20px" }}>
          <p className="eyebrow">ADMINISTRATION / DIRECTORY</p>
          <h1>Account Management</h1>
          <p className="muted">Manage member and staff roles, credentials, and password recovery keys.</p>
        </section>

        {feedback.message && (
          <div className={`form-feedback ${feedback.isError ? "error" : ""}`} style={{ marginBottom: "16px" }}>
            {feedback.message}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", gap: "12px" }}>
          <input
            type="text"
            placeholder="Search by name, email, or Coop ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: "8px 14px", border: "1px solid #cbd5e1", borderRadius: "8px", width: "100%", maxWidth: "360px" }}
          />
          <button onClick={fetchAccounts} className="button button-outline button-sm">
            Refresh
          </button>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                <th style={{ padding: "12px 16px" }}>Member / Name</th>
                <th style={{ padding: "12px 16px" }}>Coop ID</th>
                <th style={{ padding: "12px 16px" }}>Email</th>
                <th style={{ padding: "12px 16px" }}>Role</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    Loading accounts...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    No matching accounts found.
                  </td>
                </tr>
              ) : (
                filtered.map((acc) => (
                  <tr key={acc._id || acc.email} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px", fontWeight: "600" }}>{acc.fullName || "—"}</td>
                    <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "#0f766e" }}>{acc.cooperativeId || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>{acc.email}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`status-pill status-${(acc.role || "member").toLowerCase()}`} style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "0.75rem", textTransform: "capitalize", fontWeight: "600" }}>
                        {acc.role || "member"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {acc.forgotPasswordRequested ? (
                        <span style={{ color: "#d97706", fontSize: "0.78rem", fontWeight: "700" }}>OTP Requested</span>
                      ) : (
                        <span style={{ color: "#16a34a", fontSize: "0.78rem" }}>Active</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {acc.forgotPasswordRequested && (
                        <button
                          onClick={() => handleIssueOtp(acc)}
                          className="button button-primary button-sm"
                          style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                        >
                          Issue OTP
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {otpModal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", maxWidth: "400px", width: "100%", padding: "24px", borderRadius: "12px" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Temporary OTP Generated</h3>
            <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0 0 16px" }}>
              Provide this key to <strong>{otpModal.account?.fullName}</strong> ({otpModal.account?.email}):
            </p>
            <div style={{ background: "#f8fafc", padding: "12px", border: "1px dashed #cbd5e1", borderRadius: "8px", textAlign: "center", fontSize: "1.4rem", fontFamily: "monospace", letterSpacing: "2px", color: "#0f766e", fontWeight: "700" }}>
              {otpModal.code}
            </div>
            <div style={{ marginTop: "20px", textAlign: "right" }}>
              <button
                onClick={() => setOtpModal({ open: false, account: null, code: "" })}
                className="button button-primary button-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
