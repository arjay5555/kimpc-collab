import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getMonthlySeries(entries, startDate, monthCount, valueKey) {
  const valuesByMonth = new Map(
    (entries || []).map((entry) => [`${entry.year}-${entry.month}`, Number(entry[valueKey]) || 0])
  );
  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + index, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return {
      year,
      month,
      label: MONTH_LABELS[month - 1],
      value: valuesByMonth.get(`${year}-${month}`) || 0,
    };
  });
}

function formatCompactNumber(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function getTrendBadge(currentValue = 0, previousValue = 0) {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;
  if (previous === 0) {
    return current > 0
      ? { label: "↑ New", className: "wz-trend-positive" }
      : { label: "0%", className: "wz-trend-neutral" };
  }

  const change = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (change === 0) return { label: "0%", className: "wz-trend-neutral" };
  return change > 0
    ? { label: `↑ +${change}%`, className: "wz-trend-positive" }
    : { label: `↓ ${change}%`, className: "wz-trend-negative" };
}

export default function ManagerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Dashboard metrics refresh automatically while the page is open.
  const [stats, setStats] = useState({
    totalRevenue: "—",
    newBookings: "—",
    rentedMachinery: "—",
    availableMachinery: "—",
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [earningsRange, setEarningsRange] = useState("8");
  const [rentStatusRange, setRentStatusRange] = useState("week");
  const [bookingsYear, setBookingsYear] = useState(() => new Date().getUTCFullYear());
  const [lastUpdated, setLastUpdated] = useState("");
  const [dashboardNow, setDashboardNow] = useState(() => new Date());

  // Reminders list (persisted in localStorage, no hardcoded future dates)
  const [reminders, setReminders] = useState(() => {
    try {
      const stored = localStorage.getItem("kimpc_manager_reminders");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return [
      { id: 1, title: "Review pending machinery booking applications.", date: new Date().toISOString().split("T")[0] },
      { id: 2, title: "Check fleet maintenance schedules and operational logs.", date: new Date().toISOString().split("T")[0] },
    ];
  });
  const [newReminderText, setNewReminderText] = useState("");
  const [showAddReminder, setShowAddReminder] = useState(false);

  // Active machinery category selection in right sidebar
  const [activeCategory, setActiveCategory] = useState("Harvester");
  const [financialsOpen, setFinancialsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let isFetching = false;

    const loadMetrics = async () => {
      if (isFetching) return;
      isFetching = true;
      const response = await api("/manager/dashboard/metrics");
      isFetching = false;
      if (!isMounted) return;
      if (!response.ok) {
        setDashboardError(response.data?.error || "Could not load dashboard metrics.");
        setLoadingStats(false);
        return;
      }

      const data = response.data;
      if (
        !data?.revenue ||
        !Array.isArray(data.revenue.byMonth) ||
        !data.revenue.sevenDayComparison ||
        !data?.bookings ||
        !Array.isArray(data.bookings.byMonth) ||
        !data.bookings.statusByStartDate ||
        !data?.fleetStatus
      ) {
        setDashboardError("Dashboard metrics response is incomplete.");
        setLoadingStats(false);
        return;
      }

      setDashboardMetrics(data);
      setStats({
        totalRevenue: `₱${Number(data.revenue.allTime || 0).toLocaleString()}`,
        newBookings: `${data.bookings.thisMonth || 0}`,
        rentedMachinery: `${data.fleetStatus.rented || 0}`,
        availableMachinery: `${data.fleetStatus.available || 0}`,
      });
      const updatedAt = data.asOf || new Date().toISOString();
      setLastUpdated(updatedAt);
      setDashboardNow(new Date(updatedAt));
      setDashboardError("");
      setLoadingStats(false);
    };

    loadMetrics();
    const refreshTimer = window.setInterval(loadMetrics, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const handleAddReminder = (e) => {
    e.preventDefault();
    if (!newReminderText.trim()) return;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const updated = [
      ...reminders,
      {
        id: Date.now(),
        title: newReminderText.trim(),
        date: dateStr,
      },
    ];
    setReminders(updated);
    try {
      localStorage.setItem("kimpc_manager_reminders", JSON.stringify(updated));
    } catch (err) {}
    setNewReminderText("");
    setShowAddReminder(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const currentYear = dashboardNow.getUTCFullYear();
  const currentMonth = dashboardNow.getUTCMonth() + 1;
  const earningsMonthCount = earningsRange === "year" ? currentMonth : Number(earningsRange);
  const earningsStart = earningsRange === "year"
    ? new Date(Date.UTC(currentYear, 0, 1))
    : new Date(Date.UTC(currentYear, currentMonth - earningsMonthCount, 1));
  const earningsSeries = getMonthlySeries(
    dashboardMetrics?.revenue?.byMonth,
    earningsStart,
    earningsMonthCount,
    "total"
  );
  const earningsMax = Math.max(...earningsSeries.map((entry) => entry.value), 0);
  const earningsAxisMax = earningsMax > 0 ? Math.ceil(earningsMax / 4) * 4 : 4;
  const earningsPoints = earningsSeries.map((entry, index) => ({
    ...entry,
    x: earningsSeries.length === 1 ? 282 : 45 + (475 * index) / (earningsSeries.length - 1),
    y: 175 - (155 * entry.value) / earningsAxisMax,
  }));
  const earningsLinePath = earningsPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const earningsAreaPath = earningsPoints.length
    ? `${earningsLinePath} L ${earningsPoints[earningsPoints.length - 1].x} 175 L ${earningsPoints[0].x} 175 Z`
    : "";
  const earningsPeak = earningsSeries.reduce(
    (peak, entry, index) => (entry.value > (peak?.value || 0) ? { ...earningsPoints[index] } : peak),
    null
  );
  const bookingsSeries = getMonthlySeries(
    dashboardMetrics?.bookings?.byMonth,
    new Date(Date.UTC(bookingsYear, 0, 1)),
    12,
    "count"
  );
  const bookingsMax = Math.max(...bookingsSeries.map((entry) => entry.value), 0);
  const bookingsAxisMax = Math.max(bookingsMax, 4);
  const bookingsPeak = bookingsSeries.reduce(
    (peak, entry, index) => (entry.value > (peak?.value || 0) ? { ...bookingsSeries[index], x: 60 + index * 38 } : peak),
    null
  );
  const statusCounts = dashboardMetrics?.bookings?.statusByStartDate?.[rentStatusRange] || {};
  const rentStatusGroups = [
    { label: "Active", count: (statusCounts.Approved || 0) + (statusCounts["Checked-Out"] || 0), color: "#182538" },
    { label: "Pending", count: (statusCounts.Pending || 0) + (statusCounts["Cancellation Requested"] || 0), color: "#94a3b8" },
    { label: "Returned", count: statusCounts.Returned || 0, color: "#0284c7" },
    { label: "Cancelled", count: (statusCounts.Cancelled || 0) + (statusCounts.Rejected || 0), color: "#ff3b5c" },
  ];
  const rentStatusTotal = rentStatusGroups.reduce((total, group) => total + group.count, 0);
  let rentStatusOffset = 0;
  const rentStatusSegments = rentStatusGroups.map((group) => {
    const length = rentStatusTotal ? (group.count / rentStatusTotal) * 345.58 : 0;
    const segment = { ...group, length, offset: rentStatusOffset };
    rentStatusOffset += length;
    return segment;
  });
  const revenueTrend = getTrendBadge(
    dashboardMetrics?.revenue?.sevenDayComparison?.current,
    dashboardMetrics?.revenue?.sevenDayComparison?.previous
  );
  const bookingTrend = getTrendBadge(
    dashboardMetrics?.bookings?.sevenDayComparison?.current,
    dashboardMetrics?.bookings?.sevenDayComparison?.previous
  );

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <ManagerSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top Header Bar */}
        <ManagerTopbar title="Dashboard" />
        {dashboardError && (
          <div role="alert" style={{ marginBottom: "16px", color: "#b91c1c", fontSize: "0.82rem" }}>
            {dashboardError}
          </div>
        )}
        {loadingStats ? (
          <div role="status" style={{ marginBottom: "16px", color: "#64748b", fontSize: "0.78rem" }}>
            Loading dashboard metrics...
          </div>
        ) : lastUpdated ? (
          <div role="status" style={{ marginBottom: "16px", color: "#64748b", fontSize: "0.72rem", textAlign: "right" }}>
            Live data · Updated {new Date(lastUpdated).toLocaleTimeString()}
          </div>
        ) : null}

        {/* 4 KPI Top Cards */}
        <div className="wz-kpi-grid">
          {/* Card 1: Total Revenue (using Philippine Peso) */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap" style={{ color: "#0f172a" }}>
                ₱
              </div>
              <div>
                <div className="wz-kpi-label">Total Revenue</div>
                <div className="wz-kpi-value">{stats.totalRevenue}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className={`wz-trend-badge ${revenueTrend.className}`}>{revenueTrend.label}</span>
              <span className="wz-trend-subtitle">vs previous 7 days</span>
            </div>
          </div>

          {/* Card 2: New Bookings */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">New Bookings</div>
                <div className="wz-kpi-value">{stats.newBookings}</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className={`wz-trend-badge ${bookingTrend.className}`}>{bookingTrend.label}</span>
              <span className="wz-trend-subtitle">vs previous 7 days</span>
            </div>
          </div>

          {/* Card 3: Rented Machinery (was "Rented Cars") */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v6" />
                  <path d="M12 15v6" />
                  <path d="M3 12h6" />
                  <path d="M15 12h6" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Rented Machinery</div>
                <div className="wz-kpi-value">{stats.rentedMachinery} Unit</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-subtitle">Current fleet count</span>
            </div>
          </div>

          {/* Card 4: Available Machinery (was "Available Cars") */}
          <div className="wz-kpi-card">
            <div className="wz-kpi-left">
              <div className="wz-kpi-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 17h18" />
                  <circle cx="7" cy="17" r="3" />
                  <circle cx="17" cy="17" r="3" />
                  <path d="M9 14h6" />
                  <path d="M4 14V8h8l4 6" />
                </svg>
              </div>
              <div>
                <div className="wz-kpi-label">Available Machinery</div>
                <div className="wz-kpi-value">{stats.availableMachinery} Unit</div>
              </div>
            </div>
            <div className="wz-kpi-badge-wrap">
              <span className="wz-trend-subtitle">Current fleet count</span>
            </div>
          </div>
        </div>

        {/* Middle Row: Earnings Summary (₱) + Rent Status (Active, Pending, Cancelled) */}
        <div className="wz-dashboard-grid-2">
          {/* Earnings Summary Card */}
          <div className="wz-card">
            <div className="wz-card-header">
              <h2 className="wz-card-title">Earnings Summary</h2>
              <select
                className="wz-dropdown-select"
                value={earningsRange}
                onChange={(event) => setEarningsRange(event.target.value)}
              >
                <option value="8">Last 8 Month ˅</option>
                <option value="6">Last 6 Month</option>
                <option value="year">This Year</option>
              </select>
            </div>

            {/* SVG Revenue Chart */}
            <div style={{ width: "100%", height: "210px", position: "relative" }}>
              <svg width="100%" height="100%" viewBox="0 0 540 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="managerEarningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff3b5c" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#ff3b5c" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[1, 0.75, 0.5, 0.25, 0].map((ratio, index) => {
                  const y = 20 + index * 38.75;
                  return (
                    <g key={ratio}>
                      <line x1="45" y1={y} x2="520" y2={y} stroke={ratio === 0 ? "#e2e8f0" : "#f1f5f9"} strokeWidth="1" />
                      <text x="5" y={y + 4} fill="#94a3b8" fontSize="11" fontWeight="500">
                        ₱{formatCompactNumber(earningsAxisMax * ratio)}
                      </text>
                    </g>
                  );
                })}

                {earningsAreaPath && <path d={earningsAreaPath} fill="url(#managerEarningsGradient)" />}
                {earningsLinePath && <path d={earningsLinePath} fill="none" stroke="#ff3b5c" strokeWidth="2.8" />}

                {earningsPeak && earningsMax > 0 && (
                  <>
                    <circle cx={earningsPeak.x} cy={earningsPeak.y} r="4.5" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
                    <g transform={`translate(${Math.min(435, Math.max(45, earningsPeak.x - 40))}, ${Math.max(4, Math.min(130, earningsPeak.y - 44))})`}>
                      <rect width="80" height="38" rx="8" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" filter="drop-shadow(0 2px 5px rgba(0,0,0,0.06))" />
                      <text x="40" y="15" textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="600">
                        {earningsPeak.label} {earningsPeak.year}
                      </text>
                      <text x="40" y="30" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="800">
                        ₱{Math.round(earningsPeak.value).toLocaleString()}
                      </text>
                    </g>
                  </>
                )}

                {earningsPoints.map((point) => (
                  <text key={`${point.year}-${point.month}`} x={point.x} y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">
                    {point.label}
                  </text>
                ))}
              </svg>
            </div>
          </div>

          {/* Rent Status Card (Active, Pending, Cancelled) */}
          <div className="wz-card">
            <div className="wz-card-header">
              <h2 className="wz-card-title">Rent Status</h2>
              <select
                className="wz-dropdown-select"
                value={rentStatusRange}
                onChange={(event) => setRentStatusRange(event.target.value)}
              >
                <option value="week">This Week ˅</option>
                <option value="month">This Month</option>
              </select>
            </div>

            {/* SVG Donut Chart */}
            <div className="wz-donut-container">
              <svg width="150" height="150" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="55" fill="transparent" stroke="#e2e8f0" strokeWidth="22" />
                {rentStatusSegments.map((segment) => segment.length > 0 && (
                  <circle
                    key={segment.label}
                    cx="80"
                    cy="80"
                    r="55"
                    fill="transparent"
                    stroke={segment.color}
                    strokeWidth="22"
                    strokeDasharray={`${segment.length} ${345.58 - segment.length}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 80 80)"
                  />
                ))}
              </svg>
            </div>

            {/* Donut Legend List */}
            <div className="wz-legend-list">
              {rentStatusGroups.map((group) => (
                <div className="wz-legend-item" key={group.label}>
                  <div className="wz-legend-label">
                    <div className="wz-legend-dot" style={{ backgroundColor: group.color }} />
                    <span>{group.label}</span>
                  </div>
                  <div className="wz-legend-stat">
                    <span>{group.count.toLocaleString()} ({rentStatusTotal ? Math.round((group.count / rentStatusTotal) * 100) : 0}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row: Bookings Overview (Bar Chart) + Reminders List */}
        <div className="wz-dashboard-grid-2">
          {/* Bookings Overview Card */}
          <div className="wz-card">
            <div className="wz-card-header">
              <h2 className="wz-card-title">Bookings Overview</h2>
              <select
                className="wz-dropdown-select"
                value={bookingsYear}
                onChange={(event) => setBookingsYear(Number(event.target.value))}
              >
                <option value={currentYear}>This Year ˅</option>
                <option value={currentYear - 1}>Last Year</option>
              </select>
            </div>

            {/* SVG Monthly Bookings Chart */}
            <div className="wz-barchart-wrap">
              <svg width="100%" height="100%" viewBox="0 0 540 180" preserveAspectRatio="none">
                {[1, 0.75, 0.5, 0.25, 0].map((ratio, index) => {
                  const y = 20 + index * 33.75;
                  return (
                    <g key={ratio}>
                      <line x1="38" y1={y} x2="520" y2={y} stroke={ratio === 0 ? "#e2e8f0" : "#f1f5f9"} strokeWidth="1" />
                      <text x="8" y={y + 4} fill="#94a3b8" fontSize="10">
                        {Math.round(bookingsAxisMax * ratio).toLocaleString()}
                      </text>
                    </g>
                  );
                })}

                {bookingsSeries.map((entry, index) => {
                  const x = 52 + index * 38;
                  const barHeight = (entry.value / bookingsAxisMax) * 125;
                  const isPeak = bookingsMax > 0 && entry.value === bookingsMax;
                  return (
                    <g key={`${entry.year}-${entry.month}`}>
                      <rect
                        x={x}
                        y={155 - barHeight}
                        width="16"
                        height={barHeight}
                        rx="4"
                        ry="4"
                        fill={isPeak ? "#ff3b5c" : "#182538"}
                      />
                      <text
                        x={x + 8}
                        y="172"
                        fill={isPeak ? "#ff3b5c" : "#94a3b8"}
                        fontSize="10"
                        fontWeight={isPeak ? "700" : "400"}
                        textAnchor="middle"
                      >
                        {entry.label}
                      </text>
                    </g>
                  );
                })}

                {bookingsPeak && bookingsMax > 0 && (
                  <g transform={`translate(${Math.min(450, Math.max(38, bookingsPeak.x - 26))}, 8)`}>
                    <rect width="68" height="34" rx="6" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.8" />
                    <text x="34" y="13" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">
                      {bookingsPeak.label} {bookingsPeak.year}
                    </text>
                    <text x="34" y="27" textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="800">
                      {bookingsPeak.value.toLocaleString()}
                    </text>
                  </g>
                )}
              </svg>
            </div>

            {/* Carousel navigation pills */}
            <div className="wz-slider-controls">
              <button className="wz-slider-btn">&lt;</button>
              <button className="wz-slider-btn">&gt;</button>
            </div>
          </div>

          {/* Reminders Card */}
          <div className="wz-card">
            <div className="wz-card-header">
              <h2 className="wz-card-title">Reminders</h2>
              <button
                className="wz-icon-btn"
                style={{ width: "30px", height: "30px", fontSize: "1.1rem" }}
                onClick={() => setShowAddReminder(!showAddReminder)}
                title="Add Reminder"
              >
                +
              </button>
            </div>

            {showAddReminder && (
              <form onSubmit={handleAddReminder} style={{ marginBottom: "14px" }}>
                <input
                  type="text"
                  placeholder="Type new reminder..."
                  value={newReminderText}
                  onChange={(e) => setNewReminderText(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    fontSize: "0.82rem",
                    outline: "none",
                  }}
                  autoFocus
                />
              </form>
            )}

            <div className="wz-reminders-list">
              {reminders.map((item) => (
                <div key={item.id} className="wz-reminder-item">
                  <div className="wz-reminder-icon">!</div>
                  <div className="wz-reminder-content">
                    <p className="wz-reminder-title">{item.title}</p>
                    <span className="wz-reminder-date">{item.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="wz-card wz-machinery-types-section">
          <div className="wz-card-header">
            <h2 className="wz-card-title">Machinery Types</h2>
            <span className="wz-dots-menu">•••</span>
          </div>

          <div className="wz-machinery-types-grid">
          {/* Harvester */}
          <div
            className={`wz-machinery-type-item ${activeCategory === "Harvester" ? "selected" : ""}`}
            onClick={() => setActiveCategory("Harvester")}
          >
            <img
              src="https://images.unsplash.com/photo-1594771804886-a933bb2d609b?auto=format&fit=crop&w=150&q=80"
              alt="Combine Harvester"
              className="wz-machinery-thumb"
            />
            <div className="wz-machinery-info">
              <div className="wz-machinery-name-row">
                <span className="wz-machinery-name">Combine Harvester</span>
                <span className="wz-machinery-pct">30%</span>
              </div>
              <div className="wz-progress-bar-bg">
                <div className="wz-progress-bar-fill wz-bar-navy" style={{ width: "30%" }} />
              </div>
            </div>
          </div>

          {/* 4WD Tractor */}
          <div
            className={`wz-machinery-type-item ${activeCategory === "Tractor" ? "selected" : ""}`}
            onClick={() => setActiveCategory("Tractor")}
          >
            <img
              src="https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&w=150&q=80"
              alt="4WD Farm Tractor"
              className="wz-machinery-thumb"
            />
            <div className="wz-machinery-info">
              <div className="wz-machinery-name-row">
                <span className="wz-machinery-name">4WD Farm Tractor</span>
                <span className="wz-machinery-pct">25%</span>
              </div>
              <div className="wz-progress-bar-bg">
                <div className="wz-progress-bar-fill wz-bar-red" style={{ width: "25%" }} />
              </div>
            </div>
          </div>

          {/* Rotavator */}
          <div
            className={`wz-machinery-type-item ${activeCategory === "Rotavator" ? "selected" : ""}`}
            onClick={() => setActiveCategory("Rotavator")}
          >
            <img
              src="https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=150&q=80"
              alt="Rotary Tiller"
              className="wz-machinery-thumb"
            />
            <div className="wz-machinery-info">
              <div className="wz-machinery-name-row">
                <span className="wz-machinery-name">Rotary Tiller / Rotavator</span>
                <span className="wz-machinery-pct">20%</span>
              </div>
              <div className="wz-progress-bar-bg">
                <div className="wz-progress-bar-fill wz-bar-navy" style={{ width: "20%" }} />
              </div>
            </div>
          </div>

          {/* Transplanter */}
          <div
            className={`wz-machinery-type-item ${activeCategory === "Transplanter" ? "selected" : ""}`}
            onClick={() => setActiveCategory("Transplanter")}
          >
            <img
              src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=150&q=80"
              alt="Rice Transplanter"
              className="wz-machinery-thumb"
            />
            <div className="wz-machinery-info">
              <div className="wz-machinery-name-row">
                <span className="wz-machinery-name">Rice Transplanter</span>
                <span className="wz-machinery-pct">10%</span>
              </div>
              <div className="wz-progress-bar-bg">
                <div className="wz-progress-bar-fill wz-bar-navy" style={{ width: "10%" }} />
              </div>
            </div>
          </div>

          {/* Hauling Truck */}
          <div
            className={`wz-machinery-type-item ${activeCategory === "Truck" ? "selected" : ""}`}
            onClick={() => setActiveCategory("Truck")}
          >
            <img
              src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=150&q=80"
              alt="Hauling Flatbed Truck"
              className="wz-machinery-thumb"
            />
            <div className="wz-machinery-info">
              <div className="wz-machinery-name-row">
                <span className="wz-machinery-name">Hauling Flatbed Truck</span>
                <span className="wz-machinery-pct">10%</span>
              </div>
              <div className="wz-progress-bar-bg">
                <div className="wz-progress-bar-fill wz-bar-navy" style={{ width: "10%" }} />
              </div>
            </div>
          </div>

          {/* Thresher */}
          <div
            className={`wz-machinery-type-item ${activeCategory === "Thresher" ? "selected" : ""}`}
            onClick={() => setActiveCategory("Thresher")}
          >
            <img
              src="https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=150&q=80"
              alt="Mechanical Thresher"
              className="wz-machinery-thumb"
            />
            <div className="wz-machinery-info">
              <div className="wz-machinery-name-row">
                <span className="wz-machinery-name">Mechanical Thresher</span>
                <span className="wz-machinery-pct">5%</span>
              </div>
              <div className="wz-progress-bar-bg">
                <div className="wz-progress-bar-fill wz-bar-navy" style={{ width: "5%" }} />
              </div>
            </div>
          </div>
          </div>
        </section>
      </main>
    </div>
  );
}
