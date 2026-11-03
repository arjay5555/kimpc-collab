import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import "../../styles/admin-kimpc.css";

export default function ManagerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Data stats
  const [stats, setStats] = useState({
    totalRevenue: "₱8,450",
    newBookings: "386",
    rentedMachinery: "214",
    availableMachinery: "89",
  });

  // Machinery availability checker state
  const [selectedMachineryType, setSelectedMachineryType] = useState("4WD Tractor");
  const [selectedDate, setSelectedDate] = useState("2028-08-17");
  const [selectedTime, setSelectedTime] = useState("10:00 AM");
  const [availResult, setAvailResult] = useState(null);

  // Reminders list
  const [reminders, setReminders] = useState([
    {
      id: 1,
      title: "Inspect and service the fleet machinery.",
      date: "2028-08-10",
    },
    {
      id: 2,
      title: "Update the machinery rental pricing plans for the upcoming season.",
      date: "2028-08-12",
    },
    {
      id: 3,
      title: "Review customer feedback and implement improvements.",
      date: "2028-08-15",
    },
  ]);
  const [newReminderText, setNewReminderText] = useState("");
  const [showAddReminder, setShowAddReminder] = useState(false);

  // Active machinery category selection in right sidebar
  const [activeCategory, setActiveCategory] = useState("Harvester");
  const [financialsOpen, setFinancialsOpen] = useState(false);

  useEffect(() => {
    // Fetch live machinery units count
    api("/machinery-units").then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        const available = data.filter((u) => (u.status || "").toLowerCase() === "available").length;
        const rented = data.filter((u) => (u.status || "").toLowerCase() === "rented" || (u.status || "").toLowerCase() === "in use").length;
        if (data.length > 0) {
          setStats((prev) => ({
            ...prev,
            availableMachinery: available > 0 ? `${available}` : "89",
            rentedMachinery: rented > 0 ? `${rented}` : "214",
          }));
        }
      }
    });

    // Fetch applications
    api("/applications").then(({ ok, data }) => {
      if (ok && Array.isArray(data) && data.length > 0) {
        setStats((prev) => ({
          ...prev,
          newBookings: `${data.length}`,
        }));
      }
    });
  }, []);

  const handleCheckAvailability = () => {
    setAvailResult({
      type: selectedMachineryType,
      date: selectedDate,
      time: selectedTime,
      availableUnits: 3,
      names: ["JD-5075-01 (John Deere)", "CASE-90JX-04 (Case IH)", "KB-DC70-02 (Kubota)"],
    });
  };

  const handleAddReminder = (e) => {
    e.preventDefault();
    if (!newReminderText.trim()) return;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    setReminders([
      ...reminders,
      {
        id: Date.now(),
        title: newReminderText.trim(),
        date: dateStr,
      },
    ]);
    setNewReminderText("");
    setShowAddReminder(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <ManagerSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top Header Bar */}
        <div className="wz-topbar">
          <h1 className="wz-topbar-title">Dashboard</h1>

          <div className="wz-topbar-actions">
            <button className="wz-icon-btn" title="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <button className="wz-icon-btn" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <div className="wz-notif-dot" />
            </button>

            <div className="wz-user-pill" onClick={handleLogout} title="Click to Log Out" style={{ cursor: "pointer" }}>
              <div className="wz-avatar">
                {user?.fullName ? user.fullName[0].toUpperCase() : "M"}
              </div>
              <div className="wz-user-info">
                <span className="wz-user-name">{user?.fullName || "Manager Operations"}</span>
                <span className="wz-user-role">Manager</span>
              </div>
            </div>

            <button
              type="button"
              className="wz-topbar-logout-btn"
              onClick={handleLogout}
              title="Log Out of KIMPC"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Log Out</span>
            </button>
          </div>
        </div>

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
              <span className="wz-trend-badge wz-trend-positive">↑ +2.86%</span>
              <span className="wz-trend-subtitle">from last week</span>
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
              <span className="wz-trend-badge wz-trend-positive">↑ +1.73%</span>
              <span className="wz-trend-subtitle">from last week</span>
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
              <span className="wz-trend-badge wz-trend-negative">↓ -2.86%</span>
              <span className="wz-trend-subtitle">from last week</span>
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
              <span className="wz-trend-badge wz-trend-positive">↑ +3.45%</span>
              <span className="wz-trend-subtitle">from last week</span>
            </div>
          </div>
        </div>

        {/* Middle Row: Earnings Summary (₱) + Rent Status (Active, Pending, Cancelled) */}
        <div className="wz-dashboard-grid-2">
          {/* Earnings Summary Card */}
          <div className="wz-card">
            <div className="wz-card-header">
              <h2 className="wz-card-title">Earnings Summary</h2>
              <select className="wz-dropdown-select" defaultValue="8">
                <option value="8">Last 8 Month ˅</option>
                <option value="6">Last 6 Month</option>
                <option value="12">This Year</option>
              </select>
            </div>

            {/* SVG Spline Line Chart in Philippine Peso */}
            <div style={{ width: "100%", height: "210px", position: "relative" }}>
              <svg width="100%" height="100%" viewBox="0 0 540 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="managerEarningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff3b5c" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#ff3b5c" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-axis grid lines with ₱ Peso labels */}
                <line x1="45" y1="20" x2="520" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                <text x="5" y="24" fill="#94a3b8" fontSize="11" fontWeight="500">₱24K</text>

                <line x1="45" y1="60" x2="520" y2="60" stroke="#f1f5f9" strokeWidth="1" />
                <text x="5" y="64" fill="#94a3b8" fontSize="11" fontWeight="500">₱18K</text>

                <line x1="45" y1="100" x2="520" y2="100" stroke="#f1f5f9" strokeWidth="1" />
                <text x="5" y="104" fill="#94a3b8" fontSize="11" fontWeight="500">₱12K</text>

                <line x1="45" y1="140" x2="520" y2="140" stroke="#f1f5f9" strokeWidth="1" />
                <text x="12" y="144" fill="#94a3b8" fontSize="11" fontWeight="500">₱6K</text>

                <line x1="45" y1="175" x2="520" y2="175" stroke="#e2e8f0" strokeWidth="1" />
                <text x="22" y="179" fill="#94a3b8" fontSize="11" fontWeight="500">₱0</text>

                {/* Gradient area under the curve */}
                <path
                  d="M 50 120 C 85 110, 110 135, 140 128 C 170 120, 195 80, 225 60 C 255 115, 280 128, 310 110 C 345 85, 375 125, 410 115 C 445 100, 480 85, 515 115 L 515 175 L 50 175 Z"
                  fill="url(#managerEarningsGradient)"
                />

                {/* Main smooth curve */}
                <path
                  d="M 50 120 C 85 110, 110 135, 140 128 C 170 120, 195 80, 225 60 C 255 115, 280 128, 310 110 C 345 85, 375 125, 410 115 C 445 100, 480 85, 515 115"
                  fill="none"
                  stroke="#ff3b5c"
                  strokeWidth="2.8"
                />

                {/* Peak point indicator at April */}
                <circle cx="225" cy="60" r="4.5" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />

                {/* Floating tooltip badge */}
                <g transform="translate(185, 8)">
                  <rect width="80" height="38" rx="8" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" filter="drop-shadow(0 2px 5px rgba(0,0,0,0.06))" />
                  <text x="40" y="15" textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="600">April 2028</text>
                  <text x="40" y="30" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="800">₱18,450</text>
                </g>

                {/* X-axis Month Labels */}
                <text x="50" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">Jan</text>
                <text x="115" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">Feb</text>
                <text x="175" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">Mar</text>
                <text x="225" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">Apr</text>
                <text x="290" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">May</text>
                <text x="350" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">Jun</text>
                <text x="415" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">Jul</text>
                <text x="480" y="194" fill="#94a3b8" fontSize="11" textAnchor="middle">Aug</text>
              </svg>
            </div>
          </div>

          {/* Rent Status Card (Active, Pending, Cancelled) */}
          <div className="wz-card">
            <div className="wz-card-header">
              <h2 className="wz-card-title">Rent Status</h2>
              <select className="wz-dropdown-select" defaultValue="week">
                <option value="week">This Week ˅</option>
                <option value="month">This Month</option>
              </select>
            </div>

            {/* SVG Donut Chart */}
            <div className="wz-donut-container">
              <svg width="150" height="150" viewBox="0 0 160 160">
                {/* Circumference = 2 * PI * 55 = 345.57 */}
                {/* 1. Active: 58% (navy) */}
                <circle
                  cx="80"
                  cy="80"
                  r="55"
                  fill="transparent"
                  stroke="#182538"
                  strokeWidth="22"
                  strokeDasharray="200.4 145.1"
                  strokeDashoffset="0"
                  transform="rotate(-90 80 80)"
                />
                {/* 2. Pending: 24% (slate/light blue) */}
                <circle
                  cx="80"
                  cy="80"
                  r="55"
                  fill="transparent"
                  stroke="#94a3b8"
                  strokeWidth="22"
                  strokeDasharray="82.9 262.6"
                  strokeDashoffset="-200.4"
                  transform="rotate(-90 80 80)"
                />
                {/* 3. Cancelled: 18% (coral red) */}
                <circle
                  cx="80"
                  cy="80"
                  r="55"
                  fill="transparent"
                  stroke="#ff3b5c"
                  strokeWidth="22"
                  strokeDasharray="62.2 283.3"
                  strokeDashoffset="-283.3"
                  transform="rotate(-90 80 80)"
                />
              </svg>
            </div>

            {/* Donut Legend List */}
            <div className="wz-legend-list">
              <div className="wz-legend-item">
                <div className="wz-legend-label">
                  <div className="wz-legend-dot" style={{ backgroundColor: "#182538" }} />
                  <span>Active</span>
                </div>
                <div className="wz-legend-stat">
                  <span>58%</span>
                  <span className="wz-legend-arrow-up">↑</span>
                </div>
              </div>

              <div className="wz-legend-item">
                <div className="wz-legend-label">
                  <div className="wz-legend-dot" style={{ backgroundColor: "#94a3b8" }} />
                  <span>Pending</span>
                </div>
                <div className="wz-legend-stat">
                  <span>24%</span>
                  <span className="wz-legend-arrow-down">↓</span>
                </div>
              </div>

              <div className="wz-legend-item">
                <div className="wz-legend-label">
                  <div className="wz-legend-dot" style={{ backgroundColor: "#ff3b5c" }} />
                  <span>Cancelled</span>
                </div>
                <div className="wz-legend-stat">
                  <span>18%</span>
                  <span className="wz-legend-arrow-up">↑</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Bookings Overview (Bar Chart) + Reminders List */}
        <div className="wz-dashboard-grid-2">
          {/* Bookings Overview Card */}
          <div className="wz-card">
            <div className="wz-card-header">
              <h2 className="wz-card-title">Bookings Overview</h2>
              <select className="wz-dropdown-select" defaultValue="year">
                <option value="year">This Year ˅</option>
                <option value="prev">Last Year</option>
              </select>
            </div>

            {/* SVG Bar Chart for Jan-Dec */}
            <div className="wz-barchart-wrap">
              <svg width="100%" height="100%" viewBox="0 0 540 180" preserveAspectRatio="none">
                {/* Y-axis grid lines */}
                <line x1="38" y1="20" x2="520" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                <text x="8" y="24" fill="#94a3b8" fontSize="10">1.2K</text>

                <line x1="38" y1="55" x2="520" y2="55" stroke="#f1f5f9" strokeWidth="1" />
                <text x="12" y="59" fill="#94a3b8" fontSize="10">900</text>

                <line x1="38" y1="90" x2="520" y2="90" stroke="#f1f5f9" strokeWidth="1" />
                <text x="12" y="94" fill="#94a3b8" fontSize="10">600</text>

                <line x1="38" y1="125" x2="520" y2="125" stroke="#f1f5f9" strokeWidth="1" />
                <text x="12" y="129" fill="#94a3b8" fontSize="10">300</text>

                <line x1="38" y1="155" x2="520" y2="155" stroke="#e2e8f0" strokeWidth="1" />
                <text x="24" y="158" fill="#94a3b8" fontSize="10">0</text>

                {/* 12 Bars for Jan - Dec */}
                {/* Jan */}
                <rect x="52" y="105" width="16" height="50" rx="4" ry="4" fill="#182538" />
                <text x="60" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Jan</text>

                {/* Feb */}
                <rect x="90" y="80" width="16" height="75" rx="4" ry="4" fill="#182538" />
                <text x="98" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Feb</text>

                {/* Mar */}
                <rect x="128" y="92" width="16" height="63" rx="4" ry="4" fill="#182538" />
                <text x="136" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Mar</text>

                {/* Apr */}
                <rect x="166" y="65" width="16" height="90" rx="4" ry="4" fill="#182538" />
                <text x="174" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Apr</text>

                {/* May */}
                <rect x="204" y="85" width="16" height="70" rx="4" ry="4" fill="#182538" />
                <text x="212" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">May</text>

                {/* Jun (Highlighted in Red with Tooltip) */}
                <rect x="242" y="50" width="16" height="105" rx="4" ry="4" fill="#ff3b5c" />
                <text x="250" y="172" fill="#ff3b5c" fontSize="10" fontWeight="700" textAnchor="middle">Jun</text>

                {/* Tooltip Tag above June */}
                <g transform="translate(216, 8)">
                  <rect width="68" height="34" rx="6" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.8" />
                  <text x="34" y="13" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">June 2028</text>
                  <text x="34" y="27" textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="800">985</text>
                </g>

                {/* Jul */}
                <rect x="280" y="90" width="16" height="65" rx="4" ry="4" fill="#182538" />
                <text x="288" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Jul</text>

                {/* Aug */}
                <rect x="318" y="80" width="16" height="75" rx="4" ry="4" fill="#182538" />
                <text x="326" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Aug</text>

                {/* Sep */}
                <rect x="356" y="72" width="16" height="83" rx="4" ry="4" fill="#182538" />
                <text x="364" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Sep</text>

                {/* Oct */}
                <rect x="394" y="88" width="16" height="67" rx="4" ry="4" fill="#182538" />
                <text x="402" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Oct</text>

                {/* Nov */}
                <rect x="432" y="95" width="16" height="60" rx="4" ry="4" fill="#182538" />
                <text x="440" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Nov</text>

                {/* Dec */}
                <rect x="470" y="78" width="16" height="77" rx="4" ry="4" fill="#182538" />
                <text x="478" y="172" fill="#94a3b8" fontSize="10" textAnchor="middle">Dec</text>
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
      </main>

      {/* ================= Right Sidebar Panel ================= */}
      <aside className="wz-right-panel">
        {/* Machinery Availability (was "Car Availability") */}
        <div className="wz-right-header">
          <h3 className="wz-right-title">Machinery Availability</h3>
          <span className="wz-dots-menu">•••</span>
        </div>

        <div className="wz-avail-card">
          {/* 1. Machinery Type Select Dropdown (was "Car Type") */}
          <div className="wz-input-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 17h18" />
              <circle cx="7" cy="17" r="3" />
              <circle cx="17" cy="17" r="3" />
              <path d="M9 14h6" />
              <path d="M4 14V8h8l4 6" />
            </svg>
            <select
              value={selectedMachineryType}
              onChange={(e) => setSelectedMachineryType(e.target.value)}
            >
              <option value="4WD Tractor">4WD Farm Tractor</option>
              <option value="Combine Harvester">Combine Harvester</option>
              <option value="Rotary Tiller / Rotavator">Rotary Tiller / Rotavator</option>
              <option value="Rice Transplanter">Rice Transplanter</option>
              <option value="Round Baler">Round Baler</option>
              <option value="Hauling Trailer Truck">Hauling Trailer Truck</option>
              <option value="Precision Boom Sprayer">Precision Boom Sprayer</option>
            </select>
          </div>

          {/* 2. Date Picker */}
          <div className="wz-input-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="text"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              placeholder="e.g. 17 August 2028"
            />
          </div>

          {/* 3. Time Picker */}
          <div className="wz-input-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <input
              type="text"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              placeholder="10:00 AM"
            />
          </div>

          {/* Check Button */}
          <button className="wz-btn-check" onClick={handleCheckAvailability}>
            Check
          </button>

          {availResult && (
            <div
              style={{
                marginTop: "12px",
                padding: "10px",
                borderRadius: "8px",
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                fontSize: "0.78rem",
                color: "#065f46",
              }}
            >
              <strong>{availResult.availableUnits} units available</strong> for {availResult.type} on {availResult.date}:
              <ul style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
                {availResult.names.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Machinery Types List (was "Car Types") */}
        <div className="wz-right-header">
          <h3 className="wz-right-title">Machinery Types</h3>
          <span className="wz-dots-menu">•••</span>
        </div>

        <div>
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
      </aside>
    </div>
  );
}
