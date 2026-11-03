import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    const res = await api("/admin/audit-logs");
    if (res.ok && res.data) {
      setLogs(res.data.logs || (Array.isArray(res.data) ? res.data : []));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter((log) => {
    // Action filter
    if (filterAction !== "all") {
      const act = (log.action || "").toUpperCase();
      if (!act.includes(filterAction.toUpperCase())) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const userMatch = (log.actorEmail || log.email || "").toLowerCase().includes(q);
      const actionMatch = (log.action || "").toLowerCase().includes(q);
      const detailsMatch = (log.details || log.description || "").toLowerCase().includes(q);
      if (!userMatch && !actionMatch && !detailsMatch) return false;
    }

    return true;
  });

  const loginCount = logs.filter((l) => (l.action || "").toUpperCase().includes("LOGIN")).length;
  const bookingCount = logs.filter((l) => (l.action || "").toUpperCase().includes("BOOKING")).length;
  const settingsCount = logs.filter((l) => (l.action || "").toUpperCase().includes("SETTING") || (l.action || "").toUpperCase().includes("CONFIG")).length;

  const getActionBadgeStyle = (action = "") => {
    const act = action.toUpperCase();
    if (act.includes("LOGIN") || act.includes("AUTH")) {
      return { bg: "#e0f2fe", text: "#0369a1" };
    }
    if (act.includes("BOOKING") || act.includes("APPLICATION")) {
      return { bg: "#dcfce7", text: "#15803d" };
    }
    if (act.includes("SETTING") || act.includes("PASSWORD") || act.includes("OTP")) {
      return { bg: "#fef3c7", text: "#b45309" };
    }
    return { bg: "#f1f5f9", text: "#475569" };
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top Header Bar with Settings, Notifications & Profile */}
        <AdminTopbar
          title="System Audit Logs"
          subtitle="Trace administrative updates, authentication events, and data changes."
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Filter logs by actor, action, or details..."
        />

        {/* 4 Mini Audit KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "20px" }}>
          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Total Records</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{logs.length}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
          </div>

          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Login Events</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0284c7", marginTop: "2px" }}>{loginCount}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", color: "#0284c7" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </div>
          </div>

          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Booking Events</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#166534", marginTop: "2px" }}>{bookingCount}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", color: "#166534" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          </div>

          <div style={{ padding: "16px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Security Changes</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#b45309", marginTop: "2px" }}>{settingsCount}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", color: "#b45309" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="wz-table-card">
          <div className="wz-table-toolbar">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3 className="wz-table-title" style={{ margin: 0 }}>System Audit Trail</h3>
              <span style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>({filtered.length} entries)</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Event Filter Pills */}
              <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px" }}>
                <button
                  type="button"
                  onClick={() => setFilterAction("all")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: filterAction === "all" ? "#ffffff" : "transparent",
                    color: filterAction === "all" ? "#0f172a" : "#64748b",
                    fontWeight: 600,
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    boxShadow: filterAction === "all" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  All Events
                </button>
                <button
                  type="button"
                  onClick={() => setFilterAction("LOGIN")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: filterAction === "LOGIN" ? "#ffffff" : "transparent",
                    color: filterAction === "LOGIN" ? "#0f172a" : "#64748b",
                    fontWeight: 600,
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    boxShadow: filterAction === "LOGIN" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  Logins
                </button>
                <button
                  type="button"
                  onClick={() => setFilterAction("BOOKING")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: filterAction === "BOOKING" ? "#ffffff" : "transparent",
                    color: filterAction === "BOOKING" ? "#0f172a" : "#64748b",
                    fontWeight: 600,
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    boxShadow: filterAction === "BOOKING" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  Bookings
                </button>
              </div>

              <button
                type="button"
                onClick={fetchLogs}
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
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor / User</th>
                  <th>Details &amp; Parameters</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      Loading audit events...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      No audit records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => {
                    const badge = getActionBadgeStyle(item.action);
                    return (
                      <tr key={item._id || idx}>
                        <td style={{ color: "#64748b", whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Recently"}
                        </td>
                        <td>
                          <span
                            style={{
                              padding: "3px 9px",
                              borderRadius: "6px",
                              fontFamily: "monospace",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              background: badge.bg,
                              color: badge.text,
                            }}
                          >
                            {item.action}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div
                              style={{
                                width: "26px",
                                height: "26px",
                                borderRadius: "50%",
                                background: "#0f172a",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {(item.actorEmail || item.email || "S")[0].toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.84rem" }}>
                              {item.actorEmail || item.email || "System"}
                            </span>
                          </div>
                        </td>
                        <td style={{ color: "#334155", fontSize: "0.82rem" }}>
                          {item.details || item.description || "—"}
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
    </div>
  );
}
