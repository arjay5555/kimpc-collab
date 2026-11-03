import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AdminReports() {
  const [period, setPeriod] = useState("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reportData, setReportData] = useState({
    metrics: {
      totalRevenue: 0,
      totalApplications: 0,
      approvedBookings: 0,
      completedBookings: 0,
      pendingBookings: 0,
      cancelledBookings: 0,
      fleetUtilizationRate: "0%",
      totalTransactions: 0,
    },
    applications: [],
    transactions: [],
  });
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");

  const fetchReports = async () => {
    setLoading(true);
    let url = `/admin/reports?period=${period}`;
    if (period === "custom" && customStart && customEnd) {
      url += `&startDate=${encodeURIComponent(customStart)}&endDate=${encodeURIComponent(customEnd)}`;
    }
    const res = await api(url);
    if (res.ok && res.data) {
      setReportData(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, [period]);

  // Export to CSV
  const handleExportCSV = () => {
    const txs = reportData.transactions || [];
    const apps = reportData.applications || [];

    const headers = ["Date", "Type", "Reference ID", "Member / Farmer", "Equipment / Category", "Payment Method", "Amount (PHP)", "Status"];
    const rows = [];

    // Add transactions
    txs.forEach((tx) => {
      rows.push([
        tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "",
        `Transaction: ${tx.type || "Payment"}`,
        tx.txId || "",
        `"${(tx.farmer || "").replace(/"/g, '""')}"`,
        `"${(tx.equipment || "").replace(/"/g, '""')}"`,
        tx.paymentMethod || "Cash",
        tx.amount || 0,
        tx.status || "Completed",
      ]);
    });

    // Add bookings
    apps.forEach((app) => {
      rows.push([
        app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "",
        "Rental Booking",
        app.applicationId || app._id || "",
        `"${(app.memberName || app.memberEmail || "").replace(/"/g, '""')}"`,
        `"${(app.machineryType || app.equipmentModel || "").replace(/"/g, '""')}"`,
        "—",
        app.totalFee || app.amount || 0,
        app.status || "Pending",
      ]);
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `KIMPC-Financial-Rental-Report-${period}-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = (reportData.transactions || []).filter((tx) => {
    const q = searchFilter.toLowerCase();
    return (
      (tx.farmer || "").toLowerCase().includes(q) ||
      (tx.equipment || "").toLowerCase().includes(q) ||
      (tx.txId || "").toLowerCase().includes(q) ||
      (tx.type || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        <AdminTopbar
          title="Rental &amp; Financial Reports"
          subtitle="Filter revenue, rental utilization, and transactions by reporting period, with CSV spreadsheet export."
        />

        {/* Period Filter Bar & Export Action */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            background: "var(--wz-card-bg, #ffffff)",
            border: "1px solid var(--wz-border, #e2e8f0)",
            padding: "16px 20px",
            borderRadius: "12px",
            marginBottom: "20px",
          }}
        >
          {/* Period Selector Pills */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginRight: "6px" }}>
              Reporting Period:
            </span>
            {[
              { key: "today", label: "Today" },
              { key: "this_week", label: "This Week" },
              { key: "this_month", label: "This Month" },
              { key: "last_month", label: "Last Month" },
              { key: "this_quarter", label: "This Quarter" },
              { key: "this_year", label: "This Year" },
              { key: "all", label: "All Time" },
              { key: "custom", label: "Custom Range" },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: period === p.key ? "#166534" : "#f1f5f9",
                  color: period === p.key ? "#ffffff" : "var(--wz-text, #475569)",
                  fontWeight: 600,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 18px",
              background: "#166534",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
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
            <span>Export to CSV Report</span>
          </button>
        </div>

        {/* Custom Date Range Selector (if selected) */}
        {period === "custom" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "var(--wz-card-bg, #ffffff)",
              border: "1px solid var(--wz-border, #e2e8f0)",
              padding: "12px 20px",
              borderRadius: "10px",
              marginBottom: "20px",
            }}
          >
            <div>
              <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>Start Date:</span>
              <input
                type="date"
                className="wz-form-input"
                style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div>
              <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>End Date:</span>
              <input
                type="date"
                className="wz-form-input"
                style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={fetchReports}
              className="wz-btn-submit"
              style={{ alignSelf: "flex-end", padding: "8px 16px" }}
            >
              Apply Filter
            </button>
          </div>
        )}

        {/* 4 Summary Metrics KPI Grid */}
        <div className="wz-kpi-grid">
          {/* Metric 1: Total Revenue */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#ecfdf5", color: "#166534" }}>
                ₱
              </div>
              <div>
                <div className="wz-kpi-label">Total Revenue</div>
                <div className="wz-kpi-value" style={{ color: "#166534" }}>
                  ₱{Number(reportData.metrics?.totalRevenue || 0).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Verified</span>
              <span className="wz-trend-subtitle">In selected period</span>
            </div>
          </div>

          {/* Metric 2: Total Bookings */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#f0fdfa", color: "#0d9488" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Rental Bookings</div>
                <div className="wz-kpi-value">{reportData.metrics?.totalApplications || 0}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">{reportData.metrics?.completedBookings || 0} Done</span>
              <span className="wz-trend-subtitle">{reportData.metrics?.approvedBookings || 0} Active</span>
            </div>
          </div>

          {/* Metric 3: Fleet Utilization Rate */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#eff6ff", color: "#2563eb" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Fleet Utilization</div>
                <div className="wz-kpi-value">{reportData.metrics?.fleetUtilizationRate || "0%"}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Active Deployment</span>
              <span className="wz-trend-subtitle">Across fleet</span>
            </div>
          </div>

          {/* Metric 4: Total Transactions */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ background: "#fef3c7", color: "#d97706" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Ledger Entries</div>
                <div className="wz-kpi-value">{reportData.metrics?.totalTransactions || 0}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-badge wz-trend-positive">Audited</span>
              <span className="wz-trend-subtitle">Transactions</span>
            </div>
          </div>
        </div>

        {/* Detailed Transactions & Rental Records Table */}
        <div className="wz-table-card">
          <div className="wz-table-toolbar">
            <div>
              <h3 className="wz-table-title" style={{ margin: 0 }}>Financial Transactions in Selected Period</h3>
              <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                Detailed revenue and rental payments collected for period: <strong style={{ color: "#166534", textTransform: "capitalize" }}>{period.replace("_", " ")}</strong>
              </p>
            </div>

            <input
              type="text"
              placeholder="Search by farmer, ID, or equipment..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                padding: "7px 14px",
                borderRadius: "18px",
                border: "1px solid var(--wz-border, #cbd5e1)",
                background: "var(--wz-card-bg, #ffffff)",
                color: "var(--wz-text, #0f172a)",
                fontSize: "0.82rem",
                width: "240px",
                outline: "none",
              }}
            />
          </div>

          <div className="wz-table-responsive">
            <table className="wz-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Transaction ID</th>
                  <th>Member / Farmer</th>
                  <th>Equipment / Service</th>
                  <th>Type</th>
                  <th>Payment Channel</th>
                  <th style={{ textAlign: "right" }}>Amount (₱)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      Generating period financial report...
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                      No financial records found in the selected reporting period.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((tx) => (
                    <tr key={tx._id || tx.txId}>
                      <td style={{ color: "#64748b", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "Recent"} {tx.time || ""}
                      </td>
                      <td style={{ fontFamily: "monospace", color: "#0f766e", fontWeight: 700, fontSize: "0.84rem" }}>
                        {tx.txId}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--wz-text, #0f172a)" }}>
                        {tx.farmer}
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>{tx.equipment}</td>
                      <td>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            background: tx.type === "Rental Fee" ? "#dcfce7" : "#fef3c7",
                            color: tx.type === "Rental Fee" ? "#166534" : "#b45309",
                          }}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "#475569" }}>{tx.paymentMethod}</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#166534", fontSize: "0.9rem" }}>
                        ₱{Number(tx.amount || 0).toLocaleString()}
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
