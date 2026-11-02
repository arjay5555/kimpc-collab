import React, { useState, useEffect } from "react";
import Header from "../../components/Header";
import { api } from "../../services/api";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("all");

  const fetchLogs = async () => {
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
    if (filterAction === "all") return true;
    return (log.action || "").includes(filterAction);
  });

  return (
    <div>
      <Header activePage="audit-logs" />

      <main className="app-shell" style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        <section className="page-intro" style={{ marginBottom: "20px" }}>
          <p className="eyebrow">SECURITY / COMPLIANCE</p>
          <h1>System Audit Logs</h1>
          <p className="muted">Trace administrative updates, authentication events, and data changes.</p>
        </section>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setFilterAction("all")}
              className={`button button-sm ${filterAction === "all" ? "button-primary" : "button-outline"}`}
            >
              All Events
            </button>
            <button
              onClick={() => setFilterAction("LOGIN")}
              className={`button button-sm ${filterAction === "LOGIN" ? "button-primary" : "button-outline"}`}
            >
              Logins
            </button>
            <button
              onClick={() => setFilterAction("BOOKING")}
              className={`button button-sm ${filterAction === "BOOKING" ? "button-primary" : "button-outline"}`}
            >
              Bookings
            </button>
          </div>
          <button onClick={fetchLogs} className="button button-outline button-sm">
            Refresh Logs
          </button>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                <th style={{ padding: "12px 16px" }}>Timestamp</th>
                <th style={{ padding: "12px 16px" }}>Action</th>
                <th style={{ padding: "12px 16px" }}>User</th>
                <th style={{ padding: "12px 16px" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    Loading audit events...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    No audit records found.
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr key={item._id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Recently"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "2px 6px", background: "#f1f5f9", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.78rem" }}>
                        {item.action}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: "600" }}>{item.actorEmail || item.email || "System"}</td>
                    <td style={{ padding: "12px 16px", color: "#334155" }}>{item.details || item.description || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
