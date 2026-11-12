import React, { useState, useEffect, useMemo } from "react";
import { api, getAuthToken } from "../services/api";
import "../styles/admin-kimpc.css";

const REPORT_TYPES = [
  { value: "booking", label: "Bookings" },
  { value: "machinery_usage", label: "Machinery Usage" },
  { value: "financial_summary", label: "Financial Summary" },
];

const DATE_PRESETS = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "last_30_days", label: "Last 30 Days" },
  { id: "ytd", label: "Year to Date" },
];

const STATUS_TONES = {
  Completed: { bg: "#dcfce7", color: "#166534", dot: "#16a34a" },
  Approved: { bg: "#e0f2fe", color: "#0369a1", dot: "#0284c7" },
  "Checked-Out": { bg: "#e0e7ff", color: "#3730a3", dot: "#4f46e5" },
  Pending: { bg: "#fef3c7", color: "#92400e", dot: "#d97706" },
  Cancelled: { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
  Rejected: { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
};

function getPHTNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 60000);
}

function formatPHTDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getPresetRange(presetId) {
  const pht = getPHTNow();
  const y = pht.getFullYear();
  const m = pht.getMonth();
  const pad = (n) => String(n).padStart(2, "0");

  if (presetId === "last_month") {
    return {
      startDate: formatPHTDate(new Date(y, m - 1, 1)),
      endDate: formatPHTDate(new Date(y, m, 0)),
    };
  }
  if (presetId === "last_30_days") {
    const start = new Date(pht);
    start.setDate(start.getDate() - 29);
    return { startDate: formatPHTDate(start), endDate: formatPHTDate(pht) };
  }
  if (presetId === "ytd") {
    return { startDate: `${y}-01-01`, endDate: formatPHTDate(pht) };
  }

  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    startDate: `${y}-${pad(m + 1)}-01`,
    endDate: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  };
}

function createInitialFilters() {
  const { startDate, endDate } = getPresetRange("this_month");
  return {
    reportType: "booking",
    startDate,
    endDate,
    unitId: "all",
    status: "all",
    paymentMethod: "all",
  };
}

function formatPeso(amount) {
  return `₱${Number(amount || 0).toLocaleString()}`;
}

function buildKpiCards(reportData) {
  if (!reportData) return [];
  const { metrics = {}, reportType } = reportData;

  if (reportType === "booking") {
    const overdue = metrics.overdueReturns || 0;
    return [
      { label: "Total Bookings", value: metrics.totalBookings || 0, sub: "In selected period" },
      { label: "Completed", value: metrics.completed || 0, sub: "Successfully returned" },
      { label: "Active / Ongoing", value: metrics.ongoing || 0, sub: "Approved & in-field" },
      {
        label: "Overdue Returns",
        value: overdue,
        sub: overdue > 0 ? "Requires action" : "On schedule",
        tone: overdue > 0 ? "danger" : "default",
      },
      { label: "Rental Volume", value: formatPeso(metrics.totalRentalValue), sub: "Gross booking value" },
    ];
  }

  if (reportType === "machinery" || reportType === "machinery_usage") {
    return [
      { label: "Units Tracked", value: metrics.totalUnitsTracked || 0, sub: "Active fleet size" },
      { label: "Units Utilized", value: metrics.unitsUtilized || 0, sub: "With rentals in period" },
      { label: "Total Rental Days", value: metrics.totalRentalDays || 0, sub: "Days in service" },
      { label: "Maintenances", value: metrics.completedMaintenances || 0, sub: "Completed jobs" },
      { label: "Maintenance Cost", value: formatPeso(metrics.totalMaintenanceCost), sub: "Repairs & servicing" },
    ];
  }

  if (reportType === "financial" || reportType === "financial_summary") {
    const net = metrics.netOperatingCashflow || 0;
    return [
      { label: "Payments Received", value: formatPeso(metrics.totalCollections), sub: "Gross collections" },
      { label: "Refunds Issued", value: formatPeso(metrics.totalRefunds), sub: "Returned deposits" },
      { label: "Operating Expenses", value: formatPeso(metrics.totalExpenses), sub: "Maintenance & upkeep" },
      { label: "Outstanding", value: formatPeso(metrics.totalOutstanding), sub: "Current snapshot" },
      {
        label: "Net Cashflow",
        value: formatPeso(net),
        sub: "Collections − refunds − exp",
        tone: net >= 0 ? "positive" : "danger",
      },
    ];
  }

  return [];
}

function getSectionHeading(reportType, financialTab) {
  if (reportType === "booking") return "Booking Records";
  if (reportType === "machinery" || reportType === "machinery_usage") return "Machinery Utilization & Maintenance";
  if (reportType === "financial" || reportType === "financial_summary") {
    if (financialTab === "refunds") return "Refunds & Reversals";
    if (financialTab === "expenses") return "Operating Expenses";
    if (financialTab === "outstanding") return "Outstanding Balances (Snapshot)";
    return "Payments & Collections";
  }
  return "Report Records";
}

function rowMatchesSearch(row, needle) {
  if (!needle) return true;
  const fields = [
    row.bookingId,
    row.id,
    row.memberName,
    row.memberEmail,
    row.client,
    row.machineryUnit,
    row.unit,
    row.unitId,
    row.unitCode,
    row.name,
    row.model,
    row.category,
    row.method,
    row.status,
    row.notes,
    row.reason,
  ];
  return fields.some((val) => val && String(val).toLowerCase().includes(needle));
}

export default function ReportsWorkspace({ sidebar, topbar }) {
  const [filters, setFilters] = useState(createInitialFilters);
  const [reportData, setReportData] = useState(null);
  const [unitsOptions, setUnitsOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [financialTab, setFinancialTab] = useState("collections");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const hasInvalidDates = Boolean(
    filters.startDate && filters.endDate && filters.startDate > filters.endDate
  );

  // Detect active date preset for highlighting quick-select pills
  const activePreset = useMemo(() => {
    for (const preset of DATE_PRESETS) {
      const range = getPresetRange(preset.id);
      if (range.startDate === filters.startDate && range.endDate === filters.endDate) {
        return preset.id;
      }
    }
    return null;
  }, [filters.startDate, filters.endDate]);

  // Show Reset link only when user modified dates, unit, status, or payment method away from defaults
  const hasCustomFilters = useMemo(() => {
    const def = createInitialFilters();
    return (
      filters.startDate !== def.startDate ||
      filters.endDate !== def.endDate ||
      filters.unitId !== "all" ||
      filters.status !== "all" ||
      filters.paymentMethod !== "all"
    );
  }, [filters]);

  // Auto-fetch preview whenever valid filters change
  useEffect(() => {
    if (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate) {
      return undefined;
    }

    let cancelled = false;
    const query = new URLSearchParams({
      reportType: filters.reportType,
      startDate: filters.startDate,
      endDate: filters.endDate,
      unitId: filters.unitId,
      status: filters.status,
      paymentMethod: filters.paymentMethod,
    }).toString();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api(`/manager/reports/preview?${query}`);
        if (cancelled) return;
        if (res.ok && res.data?.report) {
          setReportData(res.data.report);
          if (res.data.report.unitsList?.length) {
            setUnitsOptions(res.data.report.unitsList);
          }
          setCurrentPage(1);
        } else {
          setError(res.data?.error || "Failed to load report data.");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Fetch report error:", err);
          setError("Network error while loading report. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filters, reloadNonce]);

  const updateFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const handlePresetClick = (presetId) => {
    const range = getPresetRange(presetId);
    updateFilter(range);
  };

  const handleResetFilters = () => {
    const def = createInitialFilters();
    setFilters((prev) => ({ ...def, reportType: prev.reportType }));
    setSearchQuery("");
  };

  const handleDownloadPdf = async () => {
    if (hasInvalidDates) return;
    setDownloading(true);
    setError(null);

    const query = new URLSearchParams({
      reportType: filters.reportType,
      startDate: filters.startDate,
      endDate: filters.endDate,
      unitId: filters.unitId,
      status: filters.status,
      paymentMethod: filters.paymentMethod,
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
      let filename = `KIMPC-Report-${filters.startDate}-to-${filters.endDate}.pdf`;
      if (disposition && disposition.includes("filename=")) {
        const matches = disposition.match(/filename="?([^"]+)"?/);
        if (matches?.[1]) filename = matches[1];
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
      setError(`Could not download PDF: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const activeRows = useMemo(() => {
    if (!reportData) return [];
    if (reportData.reportType === "financial" || reportData.reportType === "financial_summary") {
      const extra = reportData.extraSections || {};
      if (financialTab === "collections") return extra.collections || [];
      if (financialTab === "refunds") return extra.refunds || [];
      if (financialTab === "expenses") return extra.expenses || [];
      if (financialTab === "outstanding") return extra.outstandingBalances || [];
      return reportData.rows || [];
    }
    return reportData.rows || [];
  }, [reportData, financialTab]);

  const filteredRows = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return activeRows;
    return activeRows.filter((row) => rowMatchesSearch(row, needle));
  }, [activeRows, searchQuery]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const kpiCards = useMemo(() => buildKpiCards(reportData), [reportData]);
  const isFinancialReport =
    reportData?.reportType === "financial" || reportData?.reportType === "financial_summary";

  return (
    <div className="wz-dashboard-container">
      {sidebar}

      <main className="wz-content-wrapper">
        {topbar}

        {/* Minimalist Top Bar: Report Type Segmented Tabs + Export PDF */}
        <div className="wz-rpt-headbar">
          <div className="wz-rpt-segmented" role="tablist" aria-label="Report Type">
            {REPORT_TYPES.map((type) => {
              const isActive = filters.reportType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`wz-rpt-seg-btn ${isActive ? "active" : ""}`}
                  onClick={() => {
                    updateFilter({ reportType: type.value });
                    setSearchQuery("");
                  }}
                >
                  {type.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="wz-rpt-export-btn"
            onClick={handleDownloadPdf}
            disabled={downloading || loading || hasInvalidDates}
            title="Download official PDF report"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{downloading ? "Exporting..." : "Export PDF"}</span>
          </button>
        </div>

        {/* Compact Filter Strip */}
        <section className="wz-rpt-filterbar" aria-label="Report filters">
          <div className="wz-rpt-presets">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`wz-rpt-preset-btn ${activePreset === preset.id ? "active" : ""}`}
                onClick={() => handlePresetClick(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="wz-rpt-controls">
            <div className="wz-rpt-date-pair">
              <input
                type="date"
                aria-label="Start date (PHT)"
                className="wz-rpt-control"
                value={filters.startDate}
                onChange={(e) => updateFilter({ startDate: e.target.value })}
              />
              <span>–</span>
              <input
                type="date"
                aria-label="End date (PHT)"
                className="wz-rpt-control"
                value={filters.endDate}
                onChange={(e) => updateFilter({ endDate: e.target.value })}
              />
            </div>

            <select
              aria-label="Machinery unit"
              className="wz-rpt-control"
              value={filters.unitId}
              onChange={(e) => updateFilter({ unitId: e.target.value })}
            >
              <option value="all">All Units</option>
              {unitsOptions.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.unitId} — {u.name}
                </option>
              ))}
            </select>

            {filters.reportType === "booking" && (
              <select
                aria-label="Booking status"
                className="wz-rpt-control"
                value={filters.status}
                onChange={(e) => updateFilter({ status: e.target.value })}
              >
                <option value="all">All Statuses</option>
                <option value="Completed">Completed</option>
                <option value="Approved">Approved</option>
                <option value="Checked-Out">Checked-Out</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Rejected">Rejected</option>
              </select>
            )}

            {filters.reportType === "financial_summary" && (
              <select
                aria-label="Payment method"
                className="wz-rpt-control"
                value={filters.paymentMethod}
                onChange={(e) => updateFilter({ paymentMethod: e.target.value })}
              >
                <option value="all">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            )}

            {hasCustomFilters && (
              <button type="button" className="wz-rpt-reset-link" onClick={handleResetFilters}>
                Reset
              </button>
            )}
          </div>
        </section>

        {/* Inline Validation / Error Banner */}
        {hasInvalidDates && (
          <div className="wz-rpt-alert">
            <span>Start date cannot be later than end date. Adjust the date range to update results.</span>
          </div>
        )}

        {error && !hasInvalidDates && (
          <div className="wz-rpt-alert">
            <span>{error}</span>
            <button
              type="button"
              className="wz-rpt-alert-btn"
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {/* Balanced Single-Row Summary KPI Cards */}
        {!loading && kpiCards.length > 0 && (
          <section className="wz-rpt-kpi-grid" aria-label="Report summary metrics">
            {kpiCards.map((card) => (
              <div key={card.label} className="wz-rpt-kpi-card">
                <span className="wz-rpt-kpi-label">{card.label}</span>
                <span
                  className={`wz-rpt-kpi-value ${
                    card.tone === "positive"
                      ? "is-positive"
                      : card.tone === "danger"
                      ? "is-danger"
                      : ""
                  }`}
                >
                  {card.value}
                </span>
                <span className="wz-rpt-kpi-sub">{card.sub}</span>
              </div>
            ))}
          </section>
        )}

        {/* Results Table Card */}
        <section className="wz-table-card">
          {isFinancialReport && (
            <div className="wz-reports-tabs" style={{ padding: "12px 18px 0 18px", marginBottom: 0 }}>
              {[
                { id: "collections", label: "Collections", count: reportData.extraSections?.collections?.length || 0 },
                { id: "refunds", label: "Refunds", count: reportData.extraSections?.refunds?.length || 0 },
                { id: "expenses", label: "Expenses", count: reportData.extraSections?.expenses?.length || 0 },
                { id: "outstanding", label: "Outstanding", count: reportData.extraSections?.outstandingBalances?.length || 0 },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`wz-reports-tab-btn ${financialTab === tab.id ? "active" : ""}`}
                  onClick={() => {
                    setFinancialTab(tab.id);
                    setCurrentPage(1);
                  }}
                >
                  <span>{tab.label}</span>
                  <span className="wz-reports-tab-badge">{tab.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="wz-rpt-table-toolbar">
            <div>
              <div style={{ fontSize: "0.98rem", fontWeight: 700, color: "#0f172a" }}>
                {getSectionHeading(reportData?.reportType || filters.reportType, financialTab)}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>
                {financialTab === "outstanding" && isFinancialReport && reportData?.extraSections?.snapshotDate
                  ? `Snapshot as of ${reportData.extraSections.snapshotDate} PHT · ${filteredRows.length} entries`
                  : `${filters.startDate} to ${filters.endDate} (PHT) · ${filteredRows.length} entries`}
              </div>
            </div>

            <div className="wz-rpt-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="wz-table-responsive">
            {loading ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#64748b", fontSize: "0.88rem" }}>
                Loading report...
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: "0.96rem", fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
                  No matching records
                </div>
                <p style={{ fontSize: "0.82rem", margin: "0 auto 14px auto", maxWidth: "360px" }}>
                  {searchQuery
                    ? `No entries match "${searchQuery}". Try clearing your search.`
                    : `No records found for ${filters.startDate} to ${filters.endDate}.`}
                </p>
                {(searchQuery || hasCustomFilters) && (
                  <button
                    type="button"
                    className="wz-reports-btn-reset"
                    onClick={searchQuery ? () => setSearchQuery("") : handleResetFilters}
                  >
                    {searchQuery ? "Clear search" : "Reset filters"}
                  </button>
                )}
              </div>
            ) : (
              <table className="wz-table">
                {reportData?.reportType === "booking" && (
                  <>
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Member</th>
                        <th>Machinery Unit</th>
                        <th>Rental Period</th>
                        <th>Days</th>
                        <th>Total Fee</th>
                        <th>Status</th>
                        <th>Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => {
                        const tone = STATUS_TONES[row.status] || {
                          bg: "#f1f5f9",
                          color: "#475569",
                          dot: "#64748b",
                        };
                        return (
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
                            <td style={{ fontSize: "0.85rem" }}>
                              {row.startDate} to {row.endDate}
                            </td>
                            <td>{row.rentalDays}d</td>
                            <td style={{ fontWeight: 600 }}>{formatPeso(row.totalAmount)}</td>
                            <td>
                              <span
                                className="wz-status-pill"
                                style={{ background: tone.bg, color: tone.color }}
                              >
                                <span className="wz-status-dot" style={{ background: tone.dot }} />
                                {row.status}
                              </span>
                            </td>
                            <td>
                              {row.isOverdue ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    background: "#fee2e2",
                                    color: "#991b1b",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {row.daysOverdue}d Overdue
                                </span>
                              ) : row.status === "Completed" ? (
                                <span style={{ color: "#16a34a", fontSize: "0.8rem", fontWeight: 600 }}>Returned</span>
                              ) : (
                                <span style={{ color: "#64748b", fontSize: "0.8rem" }}>On Schedule</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}

                {(reportData?.reportType === "machinery" ||
                  reportData?.reportType === "machinery_usage") && (
                  <>
                    <thead>
                      <tr>
                        <th>Asset Code</th>
                        <th>Machinery</th>
                        <th>Category</th>
                        <th>Rental Days</th>
                        <th>Meter Reading</th>
                        <th>Maintenances</th>
                        <th>Maint. Cost</th>
                        <th>Unavailable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row) => (
                        <tr key={row.unitId}>
                          <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.unitId}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: "#1e293b" }}>{row.name}</div>
                            {row.model && (
                              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{row.model}</div>
                            )}
                          </td>
                          <td>{row.category}</td>
                          <td style={{ fontWeight: 600 }}>{row.rentalDays} days</td>
                          <td>
                            {row.meterReading === "Unavailable" ? (
                              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Unavailable</span>
                            ) : (
                              <span style={{ fontWeight: 600 }}>{row.meterReading}</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{row.completedMaintenanceCount}</span> jobs
                          </td>
                          <td style={{ fontWeight: 600 }}>{formatPeso(row.maintenanceCost)}</td>
                          <td>
                            {row.daysUnavailable > 0 ? (
                              <span style={{ color: "#d97706", fontWeight: 600 }}>{row.daysUnavailable} days</span>
                            ) : (
                              <span style={{ color: "#16a34a" }}>Available</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {isFinancialReport && financialTab === "collections" && (
                  <>
                    <thead>
                      <tr>
                        <th>Reference ID</th>
                        <th>Date (PHT)</th>
                        <th>Client / Member</th>
                        <th>Machinery Unit</th>
                        <th>Method</th>
                        <th>Amount</th>
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
                          <td style={{ fontWeight: 700, color: "#15803d" }}>{formatPeso(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {isFinancialReport && financialTab === "refunds" && (
                  <>
                    <thead>
                      <tr>
                        <th>Reference ID</th>
                        <th>Date (PHT)</th>
                        <th>Client / Member</th>
                        <th>Machinery Unit</th>
                        <th>Method</th>
                        <th>Reason</th>
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
                          <td style={{ fontWeight: 700, color: "#b91c1c" }}>-{formatPeso(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {isFinancialReport && financialTab === "expenses" && (
                  <>
                    <thead>
                      <tr>
                        <th>Expense ID</th>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Assigned Unit</th>
                        <th>Notes</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row, idx) => (
                        <tr key={`${row.id}-${idx}`}>
                          <td style={{ fontWeight: 700, color: "#0284c7" }}>{row.id}</td>
                          <td>{row.date}</td>
                          <td style={{ fontWeight: 600 }}>{row.category}</td>
                          <td>{row.unit}</td>
                          <td style={{ color: "#64748b" }}>{row.notes}</td>
                          <td style={{ fontWeight: 700, color: "#b91c1c" }}>-{formatPeso(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {isFinancialReport && financialTab === "outstanding" && (
                  <>
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Client / Member</th>
                        <th>Machinery Unit</th>
                        <th>Due Date</th>
                        <th>Total Fee</th>
                        <th>Paid</th>
                        <th>Balance</th>
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
                          <td>{formatPeso(row.totalFee)}</td>
                          <td>{formatPeso(row.amountPaid)}</td>
                          <td style={{ fontWeight: 700, color: "#d97706" }}>{formatPeso(row.balance)}</td>
                          <td>
                            <span className="wz-status-pill" style={{ background: "#fef3c7", color: "#92400e" }}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            )}
          </div>

          {!loading && filteredRows.length > 0 && (
            <div className="wz-table-footer" style={{ padding: "12px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", color: "#64748b" }}>
                <span>Rows:</span>
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
                <span style={{ marginLeft: "8px" }}>
                  {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} of{" "}
                  {filteredRows.length}
                </span>
              </div>

              <div className="wz-pagination-btns">
                <button
                  type="button"
                  className="wz-page-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous Page"
                >
                  &lt;
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                  if (totalPages > 7 && Math.abs(p - currentPage) > 3 && p !== 1 && p !== totalPages) {
                    return null;
                  }
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`wz-page-btn ${p === currentPage ? "active" : ""}`}
                      onClick={() => setCurrentPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  type="button"
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
