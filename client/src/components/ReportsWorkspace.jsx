import React, { useState, useEffect, useMemo } from "react";
import { api, getAuthToken } from "../services/api";
import "../styles/admin-kimpc.css";

// Helper to determine Philippine Time (UTC+8) current date boundaries
function getPHTDefaults() {
  const now = new Date();
  const phtOffset = 8 * 60; // minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const phtDate = new Date(utc + phtOffset * 60000);

  const y = phtDate.getFullYear();
  const m = phtDate.getMonth(); // 0-indexed

  const pad = (n) => String(n).padStart(2, "0");
  const firstDay = `${y}-${pad(m + 1)}-01`;
  const lastDayDate = new Date(y, m + 1, 0).getDate();
  const lastDay = `${y}-${pad(m + 1)}-${pad(lastDayDate)}`;

  return {
    startDate: firstDay,
    endDate: lastDay,
  };
}

const INITIAL_DEFAULTS = {
  reportType: "booking",
  startDate: getPHTDefaults().startDate,
  endDate: getPHTDefaults().endDate,
  unitId: "all",
  status: "all",
  paymentMethod: "all",
};

export default function ReportsWorkspace({ sidebar, topbar }) {
  // Filter form inputs (unapplied)
  const [filterInputs, setFilterInputs] = useState(INITIAL_DEFAULTS);

  // Currently applied filters (used for live preview and PDF)
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_DEFAULTS);

  // Report data response
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  // Financial Summary active sub-tab: "collections" | "refunds" | "expenses" | "outstanding"
  const [financialTab, setFinancialTab] = useState("collections");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Available units list for dropdown
  const [unitsOptions, setUnitsOptions] = useState([]);

  // Check if form inputs differ from currently applied filters
  const isFilterDirty = useMemo(() => {
    return (
      filterInputs.reportType !== appliedFilters.reportType ||
      filterInputs.startDate !== appliedFilters.startDate ||
      filterInputs.endDate !== appliedFilters.endDate ||
      filterInputs.unitId !== appliedFilters.unitId ||
      filterInputs.status !== appliedFilters.status ||
      filterInputs.paymentMethod !== appliedFilters.paymentMethod
    );
  }, [filterInputs, appliedFilters]);

  // Fetch report data function
  const fetchReport = async (filtersToUse) => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({
      reportType: filtersToUse.reportType,
      startDate: filtersToUse.startDate,
      endDate: filtersToUse.endDate,
      unitId: filtersToUse.unitId,
      status: filtersToUse.status,
      paymentMethod: filtersToUse.paymentMethod,
    }).toString();

    try {
      const res = await api(`/manager/reports/preview?${query}`);
      if (res.ok && res.data?.report) {
        setReportData(res.data.report);
        setAppliedFilters({ ...filtersToUse });
        if (res.data.report.unitsList && res.data.report.unitsList.length > 0) {
          setUnitsOptions(res.data.report.unitsList);
        }
        setCurrentPage(1);
      } else {
        setError(res.data?.error || "Failed to load report data.");
      }
    } catch (err) {
      console.error("Fetch report error:", err);
      setError("Network error while loading report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchReport(INITIAL_DEFAULTS);
  }, []);

  // Handle Apply Filters
  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    if (filterInputs.startDate > filterInputs.endDate) {
      alert("Start Date cannot be later than End Date.");
      return;
    }
    fetchReport(filterInputs);
  };

  // Handle Reset Filters
  const handleResetFilters = () => {
    setFilterInputs(INITIAL_DEFAULTS);
    fetchReport(INITIAL_DEFAULTS);
  };

  // Handle PDF Export
  const handleDownloadPdf = async () => {
    if (isFilterDirty) {
      alert("You have unapplied filter changes. Click 'Apply Filters' first to update the report.");
      return;
    }

    setDownloading(true);
    const query = new URLSearchParams({
      reportType: appliedFilters.reportType,
      startDate: appliedFilters.startDate,
      endDate: appliedFilters.endDate,
      unitId: appliedFilters.unitId,
      status: appliedFilters.status,
      paymentMethod: appliedFilters.paymentMethod,
    }).toString();

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/manager/reports/pdf?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate report PDF.");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = `KIMPC-Report-${appliedFilters.startDate}-to-${appliedFilters.endDate}.pdf`;
      if (disposition && disposition.includes("filename=")) {
        const matches = disposition.match(/filename="?([^"]+)"?/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download error:", err);
      alert(`Could not download PDF: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  // Current active rows depending on report type and selected tab
  const activeRows = useMemo(() => {
    if (!reportData) return [];
    if (reportData.reportType === "booking") {
      return reportData.rows || [];
    }
    if (reportData.reportType === "machinery" || reportData.reportType === "machinery_usage") {
      return reportData.rows || [];
    }
    if (reportData.reportType === "financial" || reportData.reportType === "financial_summary") {
      const extra = reportData.extraSections || {};
      if (financialTab === "collections") return extra.collections || [];
      if (financialTab === "refunds") return extra.refunds || [];
      if (financialTab === "expenses") return extra.expenses || [];
      if (financialTab === "outstanding") return extra.outstandingBalances || [];
      return reportData.rows || [];
    }
    return [];
  }, [reportData, financialTab]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return activeRows.slice(start, start + pageSize);
  }, [activeRows, currentPage, pageSize]);

  const totalPages = Math.ceil(activeRows.length / pageSize) || 1;

  // Render KPI cards based on report type
  const renderKpiCards = () => {
    if (!reportData) return null;
    const { metrics = {}, reportType } = reportData;

    if (reportType === "booking") {
      return (
        <div className="wz-bookings-kpi-grid" style={{ marginBottom: "20px" }}>
          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Total Bookings</span>
                <span className="wz-kpi-value">{metrics.totalBookings || 0}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">in selected period</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Completed</span>
                <span className="wz-kpi-value">{metrics.completed || 0}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">successfully returned</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Active / Ongoing</span>
                <span className="wz-kpi-value">{metrics.ongoing || 0}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Approved & In-field</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon" style={{ borderColor: metrics.overdueReturns > 0 ? "#fca5a5" : "#e0f2fe" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Overdue Returns</span>
                <span className="wz-kpi-value" style={{ color: metrics.overdueReturns > 0 ? "#dc2626" : "inherit" }}>
                  {metrics.overdueReturns || 0}
                </span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">{metrics.overdueReturns > 0 ? "Requires action" : "On schedule"}</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Total Rental Value</span>
                <span className="wz-kpi-value">₱{(metrics.totalRentalValue || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Gross booking volume</span>
            </div>
          </div>
        </div>
      );
    }

    if (reportType === "machinery" || reportType === "machinery_usage") {
      return (
        <div className="wz-bookings-kpi-grid" style={{ marginBottom: "20px" }}>
          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Units Tracked</span>
                <span className="wz-kpi-value">{metrics.totalUnitsTracked || 0}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Active fleet size</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Units Utilized</span>
                <span className="wz-kpi-value">{metrics.unitsUtilized || 0}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">with rentals in period</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Total Rental Days</span>
                <span className="wz-kpi-value">{metrics.totalRentalDays || 0}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Days in service</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Completed Maintenances</span>
                <span className="wz-kpi-value">{metrics.completedMaintenances || 0}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Total upkeep jobs</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Maintenance Cost</span>
                <span className="wz-kpi-value">₱{(metrics.totalMaintenanceCost || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Repairs & servicing</span>
            </div>
          </div>
        </div>
      );
    }

    if (reportType === "financial" || reportType === "financial_summary") {
      return (
        <div className="wz-bookings-kpi-grid" style={{ marginBottom: "20px" }}>
          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Payments Received</span>
                <span className="wz-kpi-value">₱{(metrics.totalCollections || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Gross collections</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Refunds Issued</span>
                <span className="wz-kpi-value">₱{(metrics.totalRefunds || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Returned deposits</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Operating Expenses</span>
                <span className="wz-kpi-value">₱{(metrics.totalExpenses || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Maintenance & upkeep</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Outstanding Balances</span>
                <span className="wz-kpi-value">₱{(metrics.totalOutstanding || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Snapshot as of today</span>
            </div>
          </div>

          <div className="wz-booking-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-circle-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="wz-kpi-meta">
                <span className="wz-kpi-label">Net Operating Cashflow</span>
                <span
                  className="wz-kpi-value"
                  style={{ color: (metrics.netOperatingCashflow || 0) >= 0 ? "#15803d" : "#b91c1c" }}
                >
                  ₱{(metrics.netOperatingCashflow || 0).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="wz-kpi-right">
              <span className="wz-kpi-subtext">Collections - refunds - exp</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="wz-dashboard-container">
      {/* Left Navigation Sidebar */}
      {sidebar}

      {/* Center Content Area */}
      <main className="wz-content-wrapper">
        {topbar}

        {/* Page Header with Action Button */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.45rem", fontWeight: 700, color: "#0f172a", margin: "0 0 4px 0" }}>
              Operational & Financial Reports
            </h1>
            <p style={{ fontSize: "0.86rem", color: "#64748b", margin: 0 }}>
              Generate, filter, and export official cooperative reports with standardized Philippine Time boundaries.
            </p>
          </div>

          <div>
            <button
              className="wz-reports-btn-download"
              onClick={handleDownloadPdf}
              disabled={isFilterDirty || downloading || loading}
              title={
                isFilterDirty
                  ? "Filters have changed. Click 'Apply Filters' to enable PDF export."
                  : "Download official PDF report"
              }
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{downloading ? "Generating PDF..." : "Download PDF"}</span>
            </button>
          </div>
        </div>

        {/* ================= Filter Card ================= */}
        <section className="wz-reports-filter-card">
          <form onSubmit={handleApplyFilters}>
            <div className="wz-reports-filter-grid">
              {/* Report Type */}
              <div className="wz-reports-filter-group">
                <label>Report Type</label>
                <select
                  className="wz-reports-select"
                  value={filterInputs.reportType}
                  onChange={(e) =>
                    setFilterInputs((prev) => ({
                      ...prev,
                      reportType: e.target.value,
                    }))
                  }
                >
                  <option value="booking">Booking Report</option>
                  <option value="machinery_usage">Machinery Usage & Maintenance</option>
                  <option value="financial_summary">Rental Financial Summary</option>
                </select>
              </div>

              {/* Start Date */}
              <div className="wz-reports-filter-group">
                <label>Start Date (PHT)</label>
                <input
                  type="date"
                  className="wz-reports-input"
                  value={filterInputs.startDate}
                  onChange={(e) =>
                    setFilterInputs((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              {/* End Date */}
              <div className="wz-reports-filter-group">
                <label>End Date (PHT)</label>
                <input
                  type="date"
                  className="wz-reports-input"
                  value={filterInputs.endDate}
                  onChange={(e) =>
                    setFilterInputs((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              {/* Machinery Unit Selector */}
              <div className="wz-reports-filter-group">
                <label>Machinery Unit</label>
                <select
                  className="wz-reports-select"
                  value={filterInputs.unitId}
                  onChange={(e) =>
                    setFilterInputs((prev) => ({
                      ...prev,
                      unitId: e.target.value,
                    }))
                  }
                >
                  <option value="all">All Units</option>
                  {unitsOptions.map((u) => (
                    <option key={u.unitId} value={u.unitId}>
                      {u.unitId} - {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contextual Filter 1: Booking Status (Only for Booking Report) */}
              {filterInputs.reportType === "booking" && (
                <div className="wz-reports-filter-group">
                  <label>Booking Status</label>
                  <select
                    className="wz-reports-select"
                    value={filterInputs.status}
                    onChange={(e) =>
                      setFilterInputs((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="all">All Statuses</option>
                    <option value="Completed">Completed</option>
                    <option value="Approved">Approved</option>
                    <option value="Checked-Out">Checked-Out</option>
                    <option value="Pending">Pending</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              )}

              {/* Contextual Filter 2: Payment Method (Only for Financial Summary) */}
              {(filterInputs.reportType === "financial" || filterInputs.reportType === "financial_summary") && (
                <div className="wz-reports-filter-group">
                  <label>Payment Method</label>
                  <select
                    className="wz-reports-select"
                    value={filterInputs.paymentMethod}
                    onChange={(e) =>
                      setFilterInputs((prev) => ({
                        ...prev,
                        paymentMethod: e.target.value,
                      }))
                    }
                  >
                    <option value="all">All Payment Methods</option>
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              )}

              {/* Filter Buttons */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button type="submit" className="wz-reports-btn-apply" disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Apply Filters</span>
                </button>

                <button
                  type="button"
                  className="wz-reports-btn-reset"
                  onClick={handleResetFilters}
                  disabled={loading}
                >
                  Reset
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Warning if filters modified but not applied */}
        {isFilterDirty && (
          <div className="wz-reports-warning-banner">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                <strong>Unapplied filter changes:</strong> The on-screen preview and PDF export are paused until you click <em>Apply Filters</em>.
              </span>
            </div>
            <button
              onClick={handleApplyFilters}
              style={{
                background: "#d97706",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontWeight: 600,
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Apply Now
            </button>
          </div>
        )}

        {/* ================= Applied Filters Banner ================= */}
        {reportData && (
          <section className="wz-reports-applied-banner">
            <div className="wz-reports-applied-chips">
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Applied Filters:
              </span>

              <span className="wz-reports-chip">
                <span className="wz-reports-chip-label">Report:</span>
                <strong>{reportData.reportTitle}</strong>
              </span>

              <span className="wz-reports-chip">
                <span className="wz-reports-chip-label">Period:</span>
                <strong>{reportData.period.startDate} to {reportData.period.endDate}</strong>
              </span>

              <span className="wz-reports-chip">
                <span className="wz-reports-chip-label">Unit:</span>
                <strong>{reportData.appliedFilters.unitLabel || "All Units"}</strong>
              </span>

              {reportData.reportType === "booking" && reportData.appliedFilters.status !== "all" && (
                <span className="wz-reports-chip">
                  <span className="wz-reports-chip-label">Status:</span>
                  <strong>{reportData.appliedFilters.status}</strong>
                </span>
              )}

              {(reportData.reportType === "financial" || reportData.reportType === "financial_summary") && reportData.appliedFilters.paymentMethod !== "all" && (
                <span className="wz-reports-chip">
                  <span className="wz-reports-chip-label">Method:</span>
                  <strong>{reportData.appliedFilters.paymentMethod}</strong>
                </span>
              )}
            </div>

            {/* Date Basis Note */}
            <div className="wz-reports-date-basis">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                <strong>Date Basis:</strong> {reportData.dateBasisLabel} (Generated on {reportData.generatedAt} PHT)
              </span>
            </div>
          </section>
        )}

        {/* ================= Error State ================= */}
        {error && (
          <div
            style={{
              padding: "16px 20px",
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: "10px",
              color: "#991b1b",
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => fetchReport(appliedFilters)}
              style={{
                padding: "6px 12px",
                background: "#991b1b",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ================= Summary Metric Cards ================= */}
        {!loading && renderKpiCards()}

        {/* ================= Results Table Card ================= */}
        <section className="wz-table-card" style={{ marginTop: "10px" }}>
          {/* Sub-tabs for Financial Summary */}
          {(reportData?.reportType === "financial" || reportData?.reportType === "financial_summary") && (
            <div className="wz-reports-tabs" style={{ padding: "14px 20px 0 20px" }}>
              <button
                className={`wz-reports-tab-btn ${financialTab === "collections" ? "active" : ""}`}
                onClick={() => {
                  setFinancialTab("collections");
                  setCurrentPage(1);
                }}
              >
                <span>Collections Received</span>
                <span className="wz-reports-tab-badge">
                  {reportData.extraSections?.collections?.length || 0}
                </span>
              </button>

              <button
                className={`wz-reports-tab-btn ${financialTab === "refunds" ? "active" : ""}`}
                onClick={() => {
                  setFinancialTab("refunds");
                  setCurrentPage(1);
                }}
              >
                <span>Refunds Issued</span>
                <span className="wz-reports-tab-badge">
                  {reportData.extraSections?.refunds?.length || 0}
                </span>
              </button>

              <button
                className={`wz-reports-tab-btn ${financialTab === "expenses" ? "active" : ""}`}
                onClick={() => {
                  setFinancialTab("expenses");
                  setCurrentPage(1);
                }}
              >
                <span>Operating Expenses</span>
                <span className="wz-reports-tab-badge">
                  {reportData.extraSections?.expenses?.length || 0}
                </span>
              </button>

              <button
                className={`wz-reports-tab-btn ${financialTab === "outstanding" ? "active" : ""}`}
                onClick={() => {
                  setFinancialTab("outstanding");
                  setCurrentPage(1);
                }}
              >
                <span>Outstanding Balances (Snapshot)</span>
                <span className="wz-reports-tab-badge">
                  {reportData.extraSections?.outstandingBalances?.length || 0}
                </span>
              </button>
            </div>
          )}

          {/* Table Header / Toolbar */}
          <div className="wz-table-toolbar" style={{ padding: "16px 20px" }}>
            <div className="wz-table-title" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                {reportData?.reportType === "booking" && "Booking Audit Records"}
                {(reportData?.reportType === "machinery" || reportData?.reportType === "machinery_usage") && "Fleet Utilization & Maintenance Register"}
                {(reportData?.reportType === "financial" || reportData?.reportType === "financial_summary") && (
                  <>
                    {financialTab === "collections" && "Rental Payments & Collections Register"}
                    {financialTab === "refunds" && "Refunds & Reversals Register"}
                    {financialTab === "expenses" && "Operating & Maintenance Expenses Register"}
                    {financialTab === "outstanding" && "Current Outstanding Booking Balances (Snapshot)"}
                  </>
                )}
              </span>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                {financialTab === "outstanding" && reportData?.extraSections?.snapshotDate
                  ? `Snapshot date: ${reportData.extraSections.snapshotDate} PHT • ${activeRows.length} active balance entries`
                  : `Showing records for ${appliedFilters.startDate} to ${appliedFilters.endDate} • ${activeRows.length} total entries`}
              </span>
            </div>
          </div>

          {/* Table Content */}
          <div className="wz-table-responsive">
            {loading ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "8px" }}>Loading report data...</div>
                <div style={{ fontSize: "0.85rem" }}>Applying date filters and querying records from database.</div>
              </div>
            ) : activeRows.length === 0 ? (
              <div style={{ padding: "50px 20px", textAlign: "center", color: "#64748b" }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  style={{ margin: "0 auto 12px auto", display: "block" }}
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                  No Records Found
                </div>
                <p style={{ fontSize: "0.85rem", maxWidth: "420px", margin: "0 auto 16px auto" }}>
                  No matching entries were found for the selected period ({appliedFilters.startDate} to {appliedFilters.endDate}) and filter parameters.
                </p>
                <button
                  onClick={handleResetFilters}
                  style={{
                    padding: "8px 16px",
                    background: "#0284c7",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Reset to Current Month
                </button>
              </div>
            ) : (
              <table className="wz-table">
                {/* 1. BOOKING REPORT TABLE */}
                {reportData?.reportType === "booking" && (
                  <>
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Member Name</th>
                        <th>Machinery Unit</th>
                        <th>Rental Period</th>
                        <th>Days</th>
                        <th>Total Fee</th>
                        <th>Booking Status</th>
                        <th>Return Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.bookingId}>
                          <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.bookingId}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: "#1e293b" }}>{row.memberName}</div>
                            {row.memberEmail && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{row.memberEmail}</div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{row.machineryUnit}</div>
                            {row.unitCode && row.unitCode !== "-" && (
                              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Code: {row.unitCode}</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: "0.85rem" }}>
                              {row.startDate} to {row.endDate}
                            </span>
                          </td>
                          <td>{row.rentalDays}d</td>
                          <td style={{ fontWeight: 600 }}>₱{(row.totalAmount || 0).toLocaleString()}</td>
                          <td>
                            <span
                              className="wz-status-pill"
                              style={{
                                background:
                                  row.status === "Completed"
                                    ? "#dcfce7"
                                    : row.status === "Approved"
                                    ? "#e0f2fe"
                                    : row.status === "Pending"
                                    ? "#fef3c7"
                                    : row.status === "Cancelled" || row.status === "Rejected"
                                    ? "#fee2e2"
                                    : "#f1f5f9",
                                color:
                                  row.status === "Completed"
                                    ? "#166534"
                                    : row.status === "Approved"
                                    ? "#0369a1"
                                    : row.status === "Pending"
                                    ? "#92400e"
                                    : row.status === "Cancelled" || row.status === "Rejected"
                                    ? "#991b1b"
                                    : "#475569",
                              }}
                            >
                              <span
                                className="wz-status-dot"
                                style={{
                                  background:
                                    row.status === "Completed"
                                      ? "#16a34a"
                                      : row.status === "Approved"
                                      ? "#0284c7"
                                      : row.status === "Pending"
                                      ? "#d97706"
                                      : row.status === "Cancelled" || row.status === "Rejected"
                                      ? "#dc2626"
                                      : "#64748b",
                                }}
                              />
                              {row.status}
                            </span>
                          </td>
                          <td>
                            {row.isOverdue ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  background: "#fee2e2",
                                  color: "#991b1b",
                                  fontSize: "0.76rem",
                                  fontWeight: 700,
                                }}
                              >
                                ⚠️ {row.daysOverdue}d Overdue
                              </span>
                            ) : row.status === "Completed" ? (
                              <span style={{ color: "#16a34a", fontSize: "0.8rem", fontWeight: 600 }}>Returned</span>
                            ) : (
                              <span style={{ color: "#64748b", fontSize: "0.8rem" }}>On Schedule</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {/* 2. MACHINERY USAGE & MAINTENANCE REPORT TABLE */}
                {(reportData?.reportType === "machinery" || reportData?.reportType === "machinery_usage") && (
                  <>
                    <thead>
                      <tr>
                        <th>Asset Code</th>
                        <th>Machinery Name & Model</th>
                        <th>Category</th>
                        <th>Recorded Rental Days</th>
                        <th>Engine Hours / Meter</th>
                        <th>Completed Maintenance</th>
                        <th>Maintenance Cost</th>
                        <th>Days Unavailable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.unitId}>
                          <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.unitId}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: "#1e293b" }}>{row.name}</div>
                            {row.model && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Model: {row.model}</div>
                            )}
                          </td>
                          <td>{row.category}</td>
                          <td style={{ fontWeight: 600 }}>{row.rentalDays} days</td>
                          <td>
                            {row.meterReading === "Unavailable" ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  background: "#f1f5f9",
                                  color: "#64748b",
                                  fontSize: "0.75rem",
                                  fontStyle: "italic",
                                }}
                              >
                                Unavailable
                              </span>
                            ) : (
                              <span style={{ fontWeight: 600 }}>{row.meterReading}</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{row.completedMaintenanceCount}</span> jobs
                          </td>
                          <td style={{ fontWeight: 600 }}>₱{(row.maintenanceCost || 0).toLocaleString()}</td>
                          <td>
                            {row.daysUnavailable > 0 ? (
                              <span style={{ color: "#d97706", fontWeight: 600 }}>{row.daysUnavailable} days</span>
                            ) : (
                              <span style={{ color: "#16a34a" }}>0 days (Available)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {/* 3. RENTAL FINANCIAL SUMMARY TABLE */}
                {(reportData?.reportType === "financial" || reportData?.reportType === "financial_summary") && (
                  <>
                    {/* Tab 1: Collections */}
                    {financialTab === "collections" && (
                      <>
                        <thead>
                          <tr>
                            <th>Reference ID</th>
                            <th>Date (PHT)</th>
                            <th>Client / Member</th>
                            <th>Machinery Unit</th>
                            <th>Payment Method</th>
                            <th>Amount Collected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRows.map((row, idx) => (
                            <tr key={`${row.id}-${idx}`}>
                              <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.id}</td>
                              <td>{row.date}</td>
                              <td>{row.client}</td>
                              <td>{row.unit}</td>
                              <td>
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    background: "#f1f5f9",
                                    fontSize: "0.78rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  {row.method}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700, color: "#15803d" }}>
                                ₱{(row.amount || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}

                    {/* Tab 2: Refunds */}
                    {financialTab === "refunds" && (
                      <>
                        <thead>
                          <tr>
                            <th>Reference ID</th>
                            <th>Date (PHT)</th>
                            <th>Client / Member</th>
                            <th>Machinery Unit</th>
                            <th>Method</th>
                            <th>Reason / Description</th>
                            <th>Refund Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRows.map((row, idx) => (
                            <tr key={`${row.id}-${idx}`}>
                              <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.id}</td>
                              <td>{row.date}</td>
                              <td>{row.client}</td>
                              <td>{row.unit}</td>
                              <td>{row.method}</td>
                              <td style={{ color: "#64748b" }}>{row.reason}</td>
                              <td style={{ fontWeight: 700, color: "#b91c1c" }}>
                                -₱{(row.amount || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}

                    {/* Tab 3: Operating Expenses */}
                    {financialTab === "expenses" && (
                      <>
                        <thead>
                          <tr>
                            <th>Expense ID</th>
                            <th>Date</th>
                            <th>Category</th>
                            <th>Assigned Unit</th>
                            <th>Description / Notes</th>
                            <th>Expense Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRows.map((row, idx) => (
                            <tr key={`${row.id}-${idx}`}>
                              <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.id}</td>
                              <td>{row.date}</td>
                              <td>
                                <span style={{ fontWeight: 600 }}>{row.category}</span>
                              </td>
                              <td>{row.unit}</td>
                              <td style={{ color: "#64748b" }}>{row.notes}</td>
                              <td style={{ fontWeight: 700, color: "#b91c1c" }}>
                                -₱{(row.amount || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}

                    {/* Tab 4: Outstanding Balances Snapshot */}
                    {financialTab === "outstanding" && (
                      <>
                        <thead>
                          <tr>
                            <th>Booking ID</th>
                            <th>Client / Member</th>
                            <th>Machinery Unit</th>
                            <th>Due Date</th>
                            <th>Total Fee</th>
                            <th>Amount Paid</th>
                            <th>Outstanding Balance</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRows.map((row, idx) => (
                            <tr key={`${row.bookingId}-${idx}`}>
                              <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.bookingId}</td>
                              <td>{row.client}</td>
                              <td>{row.unit}</td>
                              <td>{row.dueDate}</td>
                              <td>₱{(row.totalFee || 0).toLocaleString()}</td>
                              <td>₱{(row.amountPaid || 0).toLocaleString()}</td>
                              <td style={{ fontWeight: 700, color: "#d97706" }}>
                                ₱{(row.balance || 0).toLocaleString()}
                              </td>
                              <td>
                                <span
                                  className="wz-status-pill"
                                  style={{ background: "#fef3c7", color: "#92400e" }}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}
                  </>
                )}
              </table>
            )}
          </div>

          {/* Table Footer with Pagination */}
          {!loading && activeRows.length > 0 && (
            <div className="wz-table-footer" style={{ marginTop: "16px", padding: "12px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#64748b" }}>
                <span>Rows per page:</span>
                <select
                  className="wz-dropdown-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
                <span style={{ marginLeft: "12px" }}>
                  Showing {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, activeRows.length)} of {activeRows.length} rows
                </span>
              </div>

              <div className="wz-pagination-btns">
                <button
                  className="wz-page-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous Page"
                >
                  &lt;
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                  // Only display up to 7 page numbers to keep it clean
                  if (totalPages > 7 && Math.abs(p - currentPage) > 3 && p !== 1 && p !== totalPages) {
                    return null;
                  }
                  return (
                    <button
                      key={p}
                      className={`wz-page-btn ${p === currentPage ? "active" : ""}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  className="wz-page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Next Page"
                >
                  &gt;
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
