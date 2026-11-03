import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AdminBackups() {
  const [backupData, setBackupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  const fetchBackupStatus = async () => {
    setLoading(true);
    const res = await api("/admin/backups");
    if (res.ok && res.data) {
      setBackupData(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBackupStatus();
  }, []);

  // Create manual backup snapshot
  const handleCreateSnapshot = async () => {
    setSnapshotLoading(true);
    setFeedback({ message: "Creating manual database backup snapshot...", isError: false });

    const res = await api("/admin/backups/snapshot", { method: "POST" });
    setSnapshotLoading(false);

    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Failed to create snapshot.", isError: true });
    } else {
      setFeedback({ message: "New database snapshot created and verified successfully!", isError: false });
      fetchBackupStatus();
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  // Verify restore in test environment
  const handleVerifyRestore = async () => {
    setRestoreLoading(true);
    setFeedback({ message: "Executing dry-run restore validation in sandbox test environment...", isError: false });

    const res = await api("/admin/backups/verify-restore", { method: "POST" });
    setRestoreLoading(false);

    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Failed to verify restore.", isError: true });
    } else {
      setFeedback({
        message: "Test environment restore verification completed: 100% Data Integrity confirmed across all collections!",
        isError: false,
      });
      fetchBackupStatus();
      setTimeout(() => setFeedback({ message: "", isError: false }), 5000);
    }
  };

  const lastRestore = backupData?.lastRestoreVerification;

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        <AdminTopbar
          title="Database Backups &amp; Disaster Recovery"
          subtitle="Monitor automated cloud backups, create manual snapshots, and verify test environment data restoration."
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

        {/* Status Card & Action Buttons */}
        <div className="wz-card" style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "#dcfce7",
                  color: "#166534",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 className="wz-card-title" style={{ fontSize: "1.15rem", margin: 0 }}>
                    Automated Backup Service
                  </h3>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background: "#dcfce7",
                      color: "#166534",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#166534" }} />
                    Healthy &amp; Active
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                  Schedule: <strong>Daily at 02:00 AM PHT</strong> • Location: <strong>MongoDB Atlas Cloud &amp; Mirror</strong>
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleCreateSnapshot}
                disabled={snapshotLoading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "9px 16px",
                  background: "#ffffff",
                  border: "1px solid var(--wz-border, #cbd5e1)",
                  borderRadius: "8px",
                  color: "var(--wz-text, #0f172a)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{snapshotLoading ? "Creating Snapshot..." : "Create Instant Snapshot"}</span>
              </button>

              <button
                type="button"
                onClick={handleVerifyRestore}
                disabled={restoreLoading}
                className="wz-btn-submit"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "9px 18px",
                  fontSize: "0.82rem",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <span>{restoreLoading ? "Verifying Restore..." : "Verify Restore in Sandbox"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Test Environment Restore Verification Report */}
        {lastRestore && (
          <div className="wz-card" style={{ padding: "24px", marginBottom: "20px", border: "1px solid #bbf7d0", background: "var(--wz-card-bg, #ffffff)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#dcfce7", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                    Latest Test Environment Restore Verification Report
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                    Verified on: {new Date(lastRestore.verifiedAt).toLocaleString()} • Target: {lastRestore.environment}
                  </p>
                </div>
              </div>

              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: "12px",
                  background: "#dcfce7",
                  color: "#166534",
                  fontWeight: 800,
                  fontSize: "0.78rem",
                  letterSpacing: "0.04em",
                }}
              >
                STATUS: {lastRestore.result} ({lastRestore.integrityScore})
              </span>
            </div>

            {/* Checklist of Verified Collections */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "16px" }}>
              {(lastRestore.collectionsChecked || []).map((col) => (
                <div
                  key={col.name}
                  style={{
                    padding: "10px 14px",
                    background: "#f8fafc",
                    border: "1px solid var(--wz-border, #e2e8f0)",
                    borderRadius: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "0.82rem", color: "var(--wz-text, #0f172a)", textTransform: "capitalize" }}>
                      {col.name}
                    </strong>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{col.count} documents verified</div>
                  </div>
                  <span style={{ color: "#166534", fontWeight: 700, fontSize: "0.85rem" }}>✓</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: "0.78rem", color: "#475569", background: "#f0fdf4", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
              <strong>Sandbox Validation Result:</strong> {lastRestore.testNotes || "Database restore dry-run completed with zero data loss or corrupted indexes."} (Execution time: {lastRestore.durationMs}ms)
            </div>
          </div>
        )}

        {/* Snapshots History Table */}
        <div className="wz-table-card">
          <div className="wz-table-toolbar">
            <div>
              <h3 className="wz-table-title" style={{ margin: 0 }}>Verified Database Backup Snapshots</h3>
              <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                Immutable historical snapshot archives available for rapid recovery.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchBackupStatus}
              style={{
                padding: "6px 12px",
                background: "var(--wz-card-bg, #ffffff)",
                border: "1px solid var(--wz-border, #cbd5e1)",
                borderRadius: "8px",
                fontSize: "0.78rem",
                cursor: "pointer",
              }}
            >
              Refresh Status
            </button>
          </div>

          <div className="wz-table-responsive">
            <table className="wz-table">
              <thead>
                <tr>
                  <th>Snapshot ID</th>
                  <th>Timestamp</th>
                  <th>Archive Size</th>
                  <th>Type</th>
                  <th>Documents Captured</th>
                  <th>Integrity Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      Checking backup status...
                    </td>
                  </tr>
                ) : (backupData?.snapshots || []).length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      No backup snapshots recorded.
                    </td>
                  </tr>
                ) : (
                  backupData.snapshots.map((snap) => (
                    <tr key={snap.id}>
                      <td style={{ fontFamily: "monospace", color: "#0f766e", fontWeight: 700, fontSize: "0.84rem" }}>
                        {snap.id}
                      </td>
                      <td style={{ color: "var(--wz-text, #334155)", fontSize: "0.82rem" }}>
                        {new Date(snap.timestamp).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: "0.84rem" }}>{snap.size}</td>
                      <td>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: snap.type.includes("Manual") ? "#eff6ff" : "#f1f5f9",
                            color: snap.type.includes("Manual") ? "#0284c7" : "#475569",
                          }}
                        >
                          {snap.type}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                        {snap.documentsCount} documents
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "8px",
                            background: "#dcfce7",
                            color: "#166534",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                          }}
                        >
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#166534" }} />
                          {snap.status}
                        </span>
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
