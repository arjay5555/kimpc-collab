import React, { useState, useEffect, useMemo } from "react";
import { api, getCachedApiData } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AuditLogs() {
  const [logs, setLogs] = useState(() => {
    const cached = getCachedApiData("/admin/audit-logs?limit=500");
    return cached?.logs || (Array.isArray(cached) ? cached : []);
  });
  const [loading, setLoading] = useState(() => !getCachedApiData("/admin/audit-logs?limit=500"));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterModule, setFilterModule] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  const fetchLogs = async () => {
    setIsRefreshing(true);
    const res = await api("/admin/audit-logs?limit=500", { skipCache: true });
    if (res.ok && res.data) {
      setLogs(res.data.logs || (Array.isArray(res.data) ? res.data : []));
    }
    setLoading(false);
    setTimeout(() => setIsRefreshing(false), 650);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getModuleBadgeStyle = (mod = "") => {
    const m = (mod || "").toLowerCase();
    if (m.includes("account")) return { bg: "#e0f2fe", text: "#0369a1", border: "#bae6fd" };
    if (m.includes("booking")) return { bg: "#dcfce7", text: "#15803d", border: "#bbf7d0" };
    if (m.includes("auth")) return { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" };
    if (m.includes("security") || m.includes("setting")) return { bg: "#fef3c7", text: "#b45309", border: "#fde68a" };
    if (m.includes("financial") || m.includes("payment")) return { bg: "#f3e8ff", text: "#7e22ce", border: "#e9d5ff" };
    if (m.includes("backup")) return { bg: "#ffe4e6", text: "#be123c", border: "#fecdd3" };
    if (m.includes("machin") || m.includes("fleet")) return { bg: "#cffafe", text: "#0e7490", border: "#a5f3fc" };
    if (m.includes("message")) return { bg: "#ede9fe", text: "#6d28d9", border: "#ddd6fe" };
    return { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };
  };

  const getResultBadgeStyle = (res = "") => {
    const r = (res || "").toLowerCase();
    if (r === "success") return { bg: "#dcfce7", text: "#15803d", border: "#86efac" };
    if (r === "failed") return { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" };
    if (r === "denied") return { bg: "#fef3c7", text: "#b45309", border: "#fde68a" };
    return { bg: "#f1f5f9", text: "#475569", border: "#cbd5e1" };
  };

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      // Module filter
      if (filterModule !== "all") {
        const mod = (log.module || "").toLowerCase();
        if (mod !== filterModule.toLowerCase() && !mod.includes(filterModule.toLowerCase())) return false;
      }

      // Result / Status filter
      if (filterResult !== "all") {
        const res = (log.result || log.status || "").toLowerCase();
        if (res !== filterResult.toLowerCase()) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const userMatch = (
          (log.actorName || "") +
          " " +
          (log.actorEmail || "") +
          " " +
          (log.performedBy?.name || "") +
          " " +
          (log.performedBy?.email || "")
        )
          .toLowerCase()
          .includes(q);
        const actionMatch = (log.action || "").toLowerCase().includes(q);
        const moduleMatch = (log.module || "").toLowerCase().includes(q);
        const recordMatch = (log.affectedRecord || "").toLowerCase().includes(q);
        const detailsMatch = String(log.details || "").toLowerCase().includes(q);
        if (!userMatch && !actionMatch && !moduleMatch && !recordMatch && !detailsMatch) return false;
      }

      return true;
    });
  }, [logs, filterModule, filterResult, searchQuery]);

  // Metric counts
  const accountEvents = logs.filter((l) => (l.module || "").includes("Account")).length;
  const bookingEvents = logs.filter((l) => (l.module || "").includes("Booking")).length;
  const securityEvents = logs.filter((l) => (l.module || "").includes("Security") || (l.module || "").includes("Auth")).length;

  // Export to CSV
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      alert("No logs to export matching current filters.");
      return;
    }

    const headers = ["Date & Time", "Performed By", "Email", "Role", "Module", "Action", "Affected Record", "Result", "Details", "IP"];
    const rows = filtered.map((l) => [
      `"${l.date || (l.createdAt ? new Date(l.createdAt).toLocaleString() : "")}"`,
      `"${l.performedBy?.name || l.actorName || l.actorEmail || "System"}"`,
      `"${l.performedBy?.email || l.actorEmail || ""}"`,
      `"${l.performedBy?.role || l.actorRole || "admin"}"`,
      `"${l.module || "System"}"`,
      `"${l.action || ""}"`,
      `"${(l.affectedRecord || "").replace(/"/g, '""')}"`,
      `"${l.result || l.status || "Success"}"`,
      `"${(l.details || "").replace(/"/g, '""')}"`,
      `"${l.ip || ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `KIMPC_Audit_Logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Purge / Clear all audit logs
  const handlePurgeLogs = async () => {
    if (!window.confirm("Are you sure you want to purge all system audit logs? This action will clear the existing history and cannot be undone.")) {
      return;
    }
    const res = await api("/admin/audit-logs", { method: "DELETE" });
    if (res.ok) {
      setFeedback({ message: "All audit logs successfully purged.", isError: false });
      fetchLogs();
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    } else {
      setFeedback({ message: res.data?.error || "Failed to purge audit logs.", isError: true });
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
          title="System Audit Logs"
          subtitle="Complete chronological audit trail recording administrative actions, security modifications, and operational events."
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by actor, action, module, or details..."
        />

        {feedback.message && (
          <div
            style={{
              padding: "12px 18px",
              marginBottom: "18px",
              borderRadius: "10px",
              background: feedback.isError ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${feedback.isError ? "#fca5a5" : "#86efac"}`,
              color: feedback.isError ? "#991b1b" : "#166534",
              fontSize: "0.86rem",
              fontWeight: 600,
            }}
          >
            {feedback.message}
          </div>
        )}

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
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Accounts &amp; Roles</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0284c7", marginTop: "2px" }}>{accountEvents}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", color: "#0284c7" }}>
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
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Bookings Operations</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#166534", marginTop: "2px" }}>{bookingEvents}</div>
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
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Security &amp; Auth</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#b45309", marginTop: "2px" }}>{securityEvents}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", color: "#b45309" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>
        </div>

        {/* Main Table Card */}
        <div className="wz-table-card">
          <div className="wz-table-toolbar" style={{ flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3 className="wz-table-title" style={{ margin: 0 }}>System Audit Trail</h3>
              <span style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>({filtered.length} entries)</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {/* Module Filter Select */}
              <select
                value={filterModule}
                onChange={(e) => setFilterModule(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "#334155",
                  outline: "none",
                }}
              >
                <option value="all">All Modules</option>
                <option value="Accounts & Roles">Accounts &amp; Roles</option>
                <option value="Bookings">Bookings</option>
                <option value="Authentication">Authentication</option>
                <option value="Security Settings">Security Settings</option>
                <option value="Financial Policies">Financial Policies</option>
                <option value="Financial Reports">Financial Reports</option>
                <option value="Database Backups">Database Backups</option>
                <option value="Machinery Fleet">Machinery Fleet</option>
                <option value="Member Messages">Member Messages</option>
                <option value="System">System</option>
              </select>

              {/* Result Filter Select */}
              <select
                value={filterResult}
                onChange={(e) => setFilterResult(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "#334155",
                  outline: "none",
                }}
              >
                <option value="all">All Results</option>
                <option value="Success">Success</option>
                <option value="Failed">Failed</option>
                <option value="Denied">Denied</option>
              </select>

              {/* Refresh Button (Icon-Only with Spin Animation) */}
              <button
                type="button"
                onClick={fetchLogs}
                disabled={isRefreshing}
                className={`wz-icon-btn ${isRefreshing ? "spinning" : ""}`}
                style={{
                  background: "var(--wz-card-bg, #ffffff)",
                  border: "1px solid var(--wz-border, #cbd5e1)",
                  color: isRefreshing ? "#166534" : "var(--wz-text, #334155)",
                  cursor: isRefreshing ? "wait" : "pointer",
                }}
                title="Refresh audit logs"
                aria-label="Refresh audit logs"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>

              {/* Export CSV Button (Icon-Only) */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="wz-icon-btn"
                style={{
                  background: "#166534",
                  border: "1px solid #14532d",
                  color: "#ffffff",
                }}
                title="Export filtered audit logs to CSV"
                aria-label="Export audit logs to CSV"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>

              {/* Purge Logs Button */}
              <button
                type="button"
                onClick={handlePurgeLogs}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "6px 12px",
                  background: "#ffffff",
                  border: "1px solid #fca5a5",
                  borderRadius: "8px",
                  color: "#dc2626",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Purge all audit logs"
              >
                <span>Purge</span>
              </button>
            </div>
          </div>

          <div className="wz-table-responsive" style={{ overflowX: "hidden", width: "100%" }}>
            <table className="wz-table" style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ width: "13%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Date &amp; Time</th>
                  <th style={{ width: "21%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Performed By</th>
                  <th style={{ width: "15%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Module</th>
                  <th style={{ width: "18%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Action</th>
                  <th style={{ width: "19%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 8px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Affected Record</th>
                  <th style={{ width: "8%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 4px", textAlign: "center", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Result</th>
                  <th style={{ width: "6%", fontSize: "0.68rem", fontWeight: 700, padding: "8px 4px", textAlign: "center", color: "#475569", textTransform: "uppercase", letterSpacing: "0.02em" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: "0.78rem" }}>
                      Loading verified audit trail...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: "0.78rem" }}>
                      No audit records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => {
                    const modBadge = getModuleBadgeStyle(item.module);
                    const resBadge = getResultBadgeStyle(item.result || item.status);
                    const actorName = item.performedBy?.name || item.actorName || (item.actorEmail ? item.actorEmail.split("@")[0] : "System");
                    const actorEmail = item.performedBy?.email || item.actorEmail || "system";
                    const actorRole = item.performedBy?.role || item.actorRole || "admin";

                    const d = item.createdAt ? new Date(item.createdAt) : null;
                    const isValid = d && !isNaN(d.getTime());
                    const datePart = isValid
                      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "Recently";
                    const timePart = isValid
                      ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                      : "";

                    return (
                      <tr
                        key={item._id || item.id || idx}
                        style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.15s ease" }}
                      >
                        {/* 1. Date & Time (2 lines) */}
                        <td style={{ padding: "8px 8px", lineHeight: 1.2 }}>
                          <div style={{ color: "#0f172a", fontWeight: 700, fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                            {datePart}
                          </div>
                          {timePart && (
                            <div style={{ color: "#64748b", fontSize: "0.66rem", fontWeight: 500, marginTop: "1px", whiteSpace: "nowrap" }}>
                              {timePart}
                            </div>
                          )}
                        </td>

                        {/* 2. Performed By */}
                        <td style={{ padding: "8px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "50%",
                                background: actorRole === "admin" ? "#166534" : actorRole === "manager" ? "#0284c7" : "#0f172a",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.68rem",
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              {(actorName || "S")[0].toUpperCase()}
                            </div>
                            <div style={{ lineHeight: 1.15, minWidth: 0, overflow: "hidden" }}>
                              <div style={{ fontWeight: 700, fontSize: "0.74rem", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={actorName}>
                                {actorName}
                              </div>
                              <div style={{ fontSize: "0.66rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={actorEmail}>
                                <span style={{ textTransform: "capitalize", fontWeight: 600, color: actorRole === "admin" ? "#166534" : "#0284c7" }}>
                                  {actorRole}
                                </span>{" "}
                                • {actorEmail}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Module */}
                        <td style={{ padding: "8px 8px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.66rem",
                              fontWeight: 700,
                              background: modBadge.bg,
                              color: modBadge.text,
                              border: `1px solid ${modBadge.border}`,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                            title={item.module || "System"}
                          >
                            {item.module || "System"}
                          </span>
                        </td>

                        {/* 4. Action */}
                        <td style={{ padding: "8px 8px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 5px",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                              fontSize: "0.66rem",
                              fontWeight: 700,
                              background: "#f1f5f9",
                              color: "#1e293b",
                              border: "1px solid #e2e8f0",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                            }}
                            title={item.action}
                          >
                            {item.action}
                          </span>
                        </td>

                        {/* 5. Affected Record */}
                        <td style={{ padding: "8px 8px" }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "0.74rem",
                              color: "#0f172a",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={item.affectedRecord || "—"}
                          >
                            {item.affectedRecord || "—"}
                          </div>
                        </td>

                        {/* 6. Result */}
                        <td style={{ textAlign: "center", padding: "8px 4px" }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.66rem",
                              fontWeight: 700,
                              background: resBadge.bg,
                              color: resBadge.text,
                              border: `1px solid ${resBadge.border}`,
                              display: "inline-block",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.result || item.status || "Success"}
                          </span>
                        </td>

                        {/* 7. Details (Clickable Icon) */}
                        <td style={{ textAlign: "center", padding: "6px 4px" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAuditLog(item);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "24px",
                              height: "24px",
                              borderRadius: "5px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#0284c7",
                              cursor: "pointer",
                              padding: 0,
                              transition: "all 0.15s ease",
                            }}
                            title="Click to view full event audit details"
                            aria-label="View Details"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Log Record Detail Modal */}
        {selectedAuditLog && (
          <div
            className="wz-modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
            onClick={() => setSelectedAuditLog(null)}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                maxWidth: "620px",
                width: "100%",
                padding: "24px",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: "6px",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      background: getModuleBadgeStyle(selectedAuditLog.module).bg,
                      color: getModuleBadgeStyle(selectedAuditLog.module).text,
                      border: `1px solid ${getModuleBadgeStyle(selectedAuditLog.module).border}`,
                    }}
                  >
                    {selectedAuditLog.module || "System"}
                  </span>
                  <h3 style={{ margin: "8px 0 0", fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>
                    Audit Event Details
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "#94a3b8" }}
                >
                  &times;
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>DATE &amp; TIME</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                    {selectedAuditLog.date || new Date(selectedAuditLog.createdAt).toLocaleString()}
                  </div>
                </div>

                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>RESULT / STATUS</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: selectedAuditLog.result === "Success" ? "#166534" : "#dc2626", marginTop: "2px" }}>
                    {selectedAuditLog.result || selectedAuditLog.status || "Success"}
                  </div>
                </div>

                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>PERFORMED BY</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                    {selectedAuditLog.performedBy?.name || selectedAuditLog.actorName || selectedAuditLog.actorEmail || "System"}
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#64748b" }}>
                    Role: {selectedAuditLog.performedBy?.role || selectedAuditLog.actorRole || "admin"} • {selectedAuditLog.performedBy?.email || selectedAuditLog.actorEmail || ""}
                  </div>
                </div>

                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>AFFECTED RECORD</div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                    {selectedAuditLog.affectedRecord || "—"}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
                  ACTION &amp; HUMAN DETAILS
                </div>
                <div style={{ padding: "12px", background: "#f1f5f9", borderRadius: "8px", fontSize: "0.86rem", color: "#1e293b", lineHeight: 1.4 }}>
                  <strong>Action:</strong> <code style={{ fontFamily: "monospace", color: "#0284c7" }}>{selectedAuditLog.action}</code>
                  <div style={{ marginTop: "6px" }}>{selectedAuditLog.details}</div>
                  {selectedAuditLog.ip && (
                    <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "6px" }}>
                      Origin IP: {selectedAuditLog.ip}
                    </div>
                  )}
                </div>
              </div>

              {selectedAuditLog.rawDetails && typeof selectedAuditLog.rawDetails === "object" && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
                    RAW PAYLOAD (JSON)
                  </div>
                  <pre
                    style={{
                      padding: "10px",
                      background: "#0f172a",
                      color: "#38bdf8",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      overflowX: "auto",
                      maxHeight: "150px",
                    }}
                  >
                    {JSON.stringify(selectedAuditLog.rawDetails, null, 2)}
                  </pre>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
