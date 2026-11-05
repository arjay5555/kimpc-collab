import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

// Formats a Date object to "YYYY-MM-DD" local date key
function toDateKey(d) {
  if (!d || isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Safely parses "YYYY-MM-DD" into a local Date object without UTC timezone drift
function parseDateKey(str) {
  if (!str) return new Date();
  const parts = String(str).split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

// Generates standard 7 days (Sunday to Saturday) for the week of refDate
function getWeekDays(refDate) {
  const cur = new Date(refDate);
  const dayOfWeek = cur.getDay(); // 0 is Sun, 1 is Mon...
  const sun = new Date(cur);
  sun.setDate(cur.getDate() - dayOfWeek);
  sun.setHours(0, 0, 0, 0);

  const days = [];
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayKey = toDateKey(new Date());

  for (let i = 0; i < 7; i++) {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    const key = toDateKey(d);
    days.push({
      date: d,
      dateKey: key,
      dayNum: d.getDate(),
      dayName: names[i],
      isToday: key === todayKey,
    });
  }
  return days;
}

// Generates calendar matrix (35 or 42 cells, Sunday to Saturday) for month of refDate
function getMonthMatrix(refDate) {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadCount = firstDay.getDay(); // Sunday-first: 0 for Sun, 1 for Mon...

  const cells = [];
  const todayKey = toDateKey(new Date());

  // Leading days from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = leadCount - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i);
    const key = toDateKey(d);
    cells.push({
      date: d,
      dateKey: key,
      dayNum: d.getDate(),
      isCurrentMonth: false,
      isToday: key === todayKey,
    });
  }

  // Days of current month
  for (let dNum = 1; dNum <= daysInMonth; dNum++) {
    const d = new Date(year, month, dNum);
    const key = toDateKey(d);
    cells.push({
      date: d,
      dateKey: key,
      dayNum: dNum,
      isCurrentMonth: true,
      isToday: key === todayKey,
    });
  }

  // Trailing days from next month to complete standard calendar rows
  const totalCells = cells.length > 35 ? 42 : 35;
  const remaining = totalCells - cells.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const key = toDateKey(d);
    cells.push({
      date: d,
      dateKey: key,
      dayNum: d.getDate(),
      isCurrentMonth: false,
      isToday: key === todayKey,
    });
  }

  return cells;
}

// Standard daily time rows
const TIME_ROWS = [
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
];

export default function ManagerCalendar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Active view date state (Default: today)
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // View mode: 'Week', 'Month', 'Day'
  const [viewMode, setViewMode] = useState("Week");

  // Filters
  const [filterType, setFilterType] = useState("all"); // 'all', 'pickup', 'return'
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'Approved', 'Pending', 'Checked-Out'
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Live applications from API
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected event for the right sidebar detail panel
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // Google Calendar Integration State
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState({ connected: false });
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState("");

  // Fetch live applications
  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await api("/applications");
      if (res.ok && Array.isArray(res.data)) {
        setApplications(res.data);
      }
    } catch (err) {
      console.error("Error fetching bookings for calendar:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();

    // Check URL parameters for return from Google OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      setCalendarNotice("Google Calendar connected successfully! Approved rentals will sync automatically.");
    } else if (params.get("google") === "denied") {
      setCalendarNotice("Google Calendar authorization was cancelled or denied.");
    } else if (params.get("google") === "error") {
      setCalendarNotice(`Google Calendar connection error: ${params.get("msg") || "Unknown error"}`);
    }

    // Fetch live Google sync status
    api("/calendar/status").then((res) => {
      if (res.ok && res.data) {
        setGoogleCalendarStatus(res.data);
      }
    });
  }, []);

  const handleConnectCalendar = () => {
    const token = localStorage.getItem("token") || "";
    window.location.href = token
      ? `/api/calendar/connect?token=${encodeURIComponent(token)}`
      : "/api/calendar/connect";
  };

  const handleSyncNow = async () => {
    setSyncingCalendar(true);
    setCalendarNotice("");
    const res = await api("/calendar/sync-now", { method: "POST" });
    setSyncingCalendar(false);
    if (res.ok) {
      setCalendarNotice(`Sync complete: ${res.data?.syncedBookings || 0} bookings and ${res.data?.syncedMaintenance || 0} records synced.`);
    } else {
      setCalendarNotice(res.data?.error || "Could not sync with Google Calendar.");
    }
  };

  // Convert raw applications to calendar events
  // Pickup = Yellow, Return = Red, Pending = Only yellow dot, Cancelled/Rejected/Void = Excluded
  const calendarEvents = useMemo(() => {
    const events = [];
    const EXCLUDED_STATUSES = ["cancelled", "canceled", "rejected", "void", "voided"];

    applications.forEach((app) => {
      const rawStatus = (app.status || "Pending").trim();
      const statusLower = rawStatus.toLowerCase();

      // Rule: If booking is cancel, rejected, void, it will not be seen on screen
      if (EXCLUDED_STATUSES.includes(statusLower)) {
        return;
      }

      // Rule: If reschedule it will adjust the day
      let effectiveStartDate = app.startDate;
      let effectiveEndDate = app.endDate || app.startDate;
      let isRescheduled = false;
      let rescheduleReason = "";

      if (app.rescheduleHistory && app.rescheduleHistory.length > 0) {
        isRescheduled = true;
        const latest = app.rescheduleHistory[app.rescheduleHistory.length - 1];
        if (latest.newStartDate) effectiveStartDate = latest.newStartDate;
        if (latest.newEndDate) effectiveEndDate = latest.newEndDate;
        rescheduleReason = latest.reason || "Booking dates rescheduled";
      } else if (app.rescheduledStartDate) {
        isRescheduled = true;
        effectiveStartDate = app.rescheduledStartDate;
        if (app.rescheduledEndDate) effectiveEndDate = app.rescheduledEndDate;
      } else if (app.rescheduledAt) {
        isRescheduled = true;
      }

      if (!effectiveStartDate) return;

      const isPending = statusLower.includes("pending");

      const clientAvatar =
        app.clientAvatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(app.memberName || "Member")}&background=f1f5f9&color=334155&size=64&bold=true`;

      const vehicleImage =
        app.imageUrl ||
        app.machineryImage ||
        "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80";

      // Common event base properties
      const baseItem = {
        appId: app.id || app._id,
        displayId: app.displayId || `APP-${String(app.id || app._id).slice(-6).toUpperCase()}`,
        equipment: app.equipment || "Machinery Unit",
        vehicleName: app.equipment || "Machinery Unit",
        category: app.bookingType === "hectare" ? `${app.hectares || 1} Hectares` : "Daily Rental",
        vehicleNumber: app.machineryUnitId || app.displayId || "UNIT",
        clientName: app.memberName || "Coop Member",
        clientAvatar,
        clientEmail: app.memberEmail || "",
        clientPhone: app.farmerPhone || app.memberPhone || app.clientPhone || "N/A",
        driver: app.assignedDriver || "Self-Operated",
        driverPhone: app.driverPhone || "",
        farmLocation: app.farmLocation || app.farmFormattedAddress || "Depot Pickup",
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        originalStartDate: app.startDate,
        originalEndDate: app.endDate,
        isRescheduled,
        rescheduleReason,
        status: rawStatus,
        isPending,
        totalAmount: app.totalAmount || 0,
        paymentStatus: app.paymentStatus || "Pending",
        paymentMethod: app.paymentMethod || "Cash",
        vehicleImage,
        transmission: "Heavy Duty",
        notes: app.managerRemarks || (isRescheduled ? `Rescheduled to ${effectiveStartDate}` : "Cooperative machinery reservation"),
        appData: app,
      };

      if (isPending) {
        // Pending booking: only yellow dot will see so that schedule determined by manager is still pending
        events.push({
          ...baseItem,
          id: `${app.id || app._id}-pending`,
          dateKey: effectiveStartDate,
          type: "pending",
          timeSlot: "9:00 AM",
          timeExact: app.preferredTime || "9:00 AM",
          agenda: "Pending Reservation Request",
        });
      } else {
        // Approved booking:
        // Rule: Pickup day is YELLOW
        events.push({
          ...baseItem,
          id: `${app.id || app._id}-pickup`,
          dateKey: effectiveStartDate,
          type: "pickup",
          timeSlot: "9:00 AM",
          timeExact: app.preferredTime || "9:00 AM",
          agenda: "Approved Equipment Pickup",
        });

        // Rule: Return day is RED
        if (effectiveEndDate && effectiveEndDate !== effectiveStartDate) {
          events.push({
            ...baseItem,
            id: `${app.id || app._id}-return`,
            dateKey: effectiveEndDate,
            type: "return",
            timeSlot: "4:00 PM",
            timeExact: "4:00 PM",
            agenda: "Approved Equipment Return",
          });
        } else if (effectiveEndDate === effectiveStartDate) {
          // Single day rental: Return on the same day in the afternoon (Red)
          events.push({
            ...baseItem,
            id: `${app.id || app._id}-return`,
            dateKey: effectiveStartDate,
            type: "return",
            timeSlot: "4:00 PM",
            timeExact: "4:00 PM",
            agenda: "Approved Equipment Return (Same Day)",
          });
        }
      }
    });

    return events;
  }, [applications]);

  // Distinct equipment list for dropdown
  const equipmentOptions = useMemo(() => {
    const set = new Set();
    applications.forEach((a) => {
      if (a.equipment) set.add(a.equipment.trim());
    });
    return Array.from(set).sort();
  }, [applications]);

  // Filter events based on active user filters
  const filteredEvents = useMemo(() => {
    return calendarEvents.filter((item) => {
      // Filter by action type (all, pickup, return)
      if (filterType !== "all") {
        if (filterType === "pickup" && item.type !== "pickup") return false;
        if (filterType === "return" && item.type !== "return") return false;
      }

      // Filter by status
      if (statusFilter !== "all") {
        const itemStatus = (item.status || "").toLowerCase();
        if (statusFilter === "Approved" && itemStatus !== "approved") return false;
        if (statusFilter === "Pending" && !itemStatus.includes("pending")) return false;
        if (statusFilter === "Checked-Out" && itemStatus !== "checked-out" && itemStatus !== "dispatched") return false;
      }

      // Filter by equipment
      if (equipmentFilter !== "all" && item.equipment !== equipmentFilter) {
        return false;
      }

      // Filter by search query (equipment name, member name, displayId)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchEquipment = (item.equipment || "").toLowerCase().includes(q);
        const matchMember = (item.clientName || "").toLowerCase().includes(q);
        const matchId = (item.displayId || "").toLowerCase().includes(q);
        if (!matchEquipment && !matchMember && !matchId) return false;
      }

      return true;
    });
  }, [calendarEvents, filterType, statusFilter, equipmentFilter, searchQuery]);

  // Date navigation handlers: Previous, Next, Today
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "Month") {
        next.setMonth(next.getMonth() - 1);
      } else if (viewMode === "Week") {
        next.setDate(next.getDate() - 7);
      } else {
        next.setDate(next.getDate() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "Month") {
        next.setMonth(next.getMonth() + 1);
      } else if (viewMode === "Week") {
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + 1);
      }
      return next;
    });
  };

  // Subbar title display based on current view
  const formattedTitle = useMemo(() => {
    if (viewMode === "Month") {
      return currentDate.toLocaleString("default", { month: "long", year: "numeric" });
    }
    if (viewMode === "Week") {
      const weekDays = getWeekDays(currentDate);
      const first = weekDays[0].date;
      const last = weekDays[6].date;
      const firstMonth = first.toLocaleString("default", { month: "short" });
      const lastMonth = last.toLocaleString("default", { month: "short" });
      if (firstMonth === lastMonth) {
        return `${firstMonth} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`;
      }
      return `${firstMonth} ${first.getDate()} – ${lastMonth} ${last.getDate()}, ${last.getFullYear()}`;
    }
    // Day view
    return currentDate.toLocaleString("default", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [currentDate, viewMode]);

  // Current week days (Sunday to Saturday)
  const currentWeekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // Current month matrix (Sunday to Saturday)
  const currentMonthCells = useMemo(() => getMonthMatrix(currentDate), [currentDate]);

  // Day view events for currentDate
  const dayViewEvents = useMemo(() => {
    const key = toDateKey(currentDate);
    return filteredEvents.filter((evt) => evt.dateKey === key);
  }, [filteredEvents, currentDate]);

  // Render Event Item:
  // - Pending: ONLY A YELLOW DOT with title
  // - Pickup: YELLOW card
  // - Return: RED card (like uploaded picture)
  const renderEventItem = (evt, isCompact = false) => {
    const isSelected = selectedEvent?.id === evt.id;

    // Rule: When pending, only dot will see so that schedule determine by the manager still pending
    if (evt.isPending || evt.type === "pending") {
      return (
        <div
          key={evt.id}
          className="wz-cal-pending-dot-item"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedEvent(evt);
            setShowDetailPanel(true);
          }}
          title={`Pending Approval: ${evt.equipment} - ${evt.clientName} (${evt.timeExact})`}
        >
          <span className="wz-cal-yellow-dot" />
          <span className="wz-cal-pending-dot-label">
            {evt.timeExact} • Pending: {evt.equipment}
          </span>
        </div>
      );
    }

    // Approved: Pickup = Yellow card, Return = Red card
    const cardClass = evt.type === "pickup" ? "wz-event-pickup" : "wz-event-return";

    return (
      <div
        key={evt.id}
        className={`wz-cal-event-card ${cardClass} ${isSelected ? "wz-event-selected" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedEvent(evt);
          setShowDetailPanel(true);
        }}
        title={`${evt.type === "pickup" ? "Pickup (Yellow)" : "Return (Red)"}: ${evt.equipment} - ${evt.clientName}`}
      >
        {/* Top Line: Time + Type Tag */}
        <div className="wz-cal-event-time">
          <span style={{ fontWeight: 800 }}>{evt.timeExact || "9:00 AM"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: "4px",
                background: evt.type === "pickup" ? "#fef3c7" : "#ffe4e6",
                color: evt.type === "pickup" ? "#92400e" : "#be123c",
              }}
            >
              {evt.type === "pickup" ? "Pickup" : "Return"}
            </span>
            {evt.isRescheduled && (
              <span className="wz-cal-rescheduled-badge" title="Rescheduled Rental Day">
                Rescheduled
              </span>
            )}
          </div>
        </div>

        {/* Middle Line: Equipment Name */}
        <div className="wz-cal-event-model">{evt.equipment}</div>

        {/* Bottom Line: Avatar + Client Name */}
        <div className="wz-cal-event-client">
          <img
            src={evt.clientAvatar}
            alt={evt.clientName}
            className="wz-cal-event-avatar"
            onError={(e) => {
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(evt.clientName || "M")}&background=fee2e2&color=991b1b&size=32`;
            }}
          />
          <span className="wz-cal-event-client-name">{evt.clientName}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <ManagerSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper wz-cal-content-wrapper">
        {/* Top bar with Title & User Profile */}
        <ManagerTopbar title="Calendar" />

        {/* Google Calendar Status / Feedback Banner */}
        {calendarNotice && (
          <div
            style={{
              margin: "10px 24px 0",
              padding: "10px 14px",
              borderRadius: "8px",
              background: calendarNotice.includes("cancelled") || calendarNotice.includes("error") || calendarNotice.includes("Could not") ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${calendarNotice.includes("cancelled") || calendarNotice.includes("error") || calendarNotice.includes("Could not") ? "#fecdd3" : "#bbf7d0"}`,
              color: calendarNotice.includes("cancelled") || calendarNotice.includes("error") || calendarNotice.includes("Could not") ? "#b91c1c" : "#15803d",
              fontSize: "0.82rem",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{calendarNotice}</span>
            <button
              type="button"
              onClick={() => setCalendarNotice("")}
              style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 700, fontSize: "1rem" }}
            >
              ×
            </button>
          </div>
        )}

        {/* Subbar: Date Navigation & Event Type Filters */}
        <div className="wz-cal-subbar" style={{ padding: "0 24px", marginTop: "12px" }}>
          {/* Left: Today, < >, Title */}
          <div className="wz-cal-nav-group">
            <button className="wz-cal-btn-today" onClick={handleToday}>
              Today
            </button>

            <div className="wz-cal-arrow-btns">
              <button
                className="wz-cal-arrow-btn"
                title={`Previous ${viewMode}`}
                onClick={handlePrev}
              >
                &lt;
              </button>
              <button
                className="wz-cal-arrow-btn"
                title={`Next ${viewMode}`}
                onClick={handleNext}
              >
                &gt;
              </button>
            </div>

            <span className="wz-cal-month-title">{formattedTitle}</span>
          </div>

          {/* Right: Google Calendar + Pickup/Return Toggle + View Mode Dropdown */}
          <div className="wz-cal-controls-right" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Google Calendar Connection Status */}
            {googleCalendarStatus.connected ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    background: "#dcfce7",
                    color: "#15803d",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    border: "1px solid #bbf7d0",
                  }}
                  title={`Google Calendar synced (${googleCalendarStatus.email || "Active"})`}
                >
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                  Google Synced
                </span>
                <button
                  type="button"
                  disabled={syncingCalendar}
                  onClick={handleSyncNow}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#334155",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: syncingCalendar ? "not-allowed" : "pointer",
                  }}
                >
                  {syncingCalendar ? "Syncing..." : "Sync Now"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectCalendar}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 11px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#1e293b",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
                title="Connect cooperative Google Calendar for 2-way sync"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>Connect Google Calendar</span>
              </button>
            )}

            {/* All / Pickup / Return Type Buttons */}
            <div className="wz-cal-filter-group">
              <button
                className={`wz-cal-filter-btn ${filterType === "all" ? "active" : ""}`}
                onClick={() => setFilterType("all")}
              >
                All
              </button>
              <button
                className={`wz-cal-filter-btn ${filterType === "pickup" ? "active" : ""}`}
                onClick={() => setFilterType("pickup")}
              >
                Pickup
              </button>
              <button
                className={`wz-cal-filter-btn ${filterType === "return" ? "active" : ""}`}
                onClick={() => setFilterType("return")}
              >
                Return
              </button>
            </div>

            {/* View Mode Selector: Week, Month, Day */}
            <select
              className="wz-cal-view-select"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
            >
              <option value="Week">Week</option>
              <option value="Month">Month</option>
              <option value="Day">Day</option>
            </select>
          </div>
        </div>

        {/* Filter Toolbar: Search, Status, Machinery (Cleaned line without badges) */}
        <div className="wz-cal-filter-bar">
          <div className="wz-cal-search-box">
            <span className="wz-cal-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search machinery, member, or ID..."
              className="wz-cal-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b" }}>Status:</span>
            <select
              className="wz-cal-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Active</option>
              <option value="Approved">Approved Only</option>
              <option value="Pending">Pending Only</option>
              <option value="Checked-Out">Checked-Out</option>
            </select>

            {equipmentOptions.length > 0 && (
              <>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", marginLeft: "6px" }}>Unit:</span>
                <select
                  className="wz-cal-select"
                  value={equipmentFilter}
                  onChange={(e) => setEquipmentFilter(e.target.value)}
                >
                  <option value="all">All Equipment</option>
                  {equipmentOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* ================= Calendar Body Layout ================= */}
        <div className="wz-cal-body-layout" style={{ padding: "0 24px 20px" }}>
          {/* Main Grid Card based on current viewMode */}
          <div className="wz-cal-grid-card">
            {/* VIEW 1: WEEK VIEW */}
            {viewMode === "Week" && (
              <>
                {/* Header Row: 7 Days (Sun to Sat) */}
                <div className="wz-cal-header-row">
                  <div className="wz-cal-tz-cell">Time</div>
                  {currentWeekDays.map((day) => (
                    <div
                      key={day.dateKey}
                      className={`wz-cal-day-header ${day.isToday ? "is-today" : ""}`}
                      onClick={() => {
                        setCurrentDate(day.date);
                        setViewMode("Day");
                      }}
                      title="Click to view single day"
                    >
                      <div className="wz-cal-day-num">{day.dayNum}</div>
                      <div className="wz-cal-day-name">{day.dayName}</div>
                    </div>
                  ))}
                </div>

                {/* Body Scrollable Grid Rows */}
                <div className="wz-cal-body-scroll">
                  {TIME_ROWS.map((time) => (
                    <div key={time} className="wz-cal-time-row">
                      {/* Left Column: Time label */}
                      <div className="wz-cal-time-cell">{time}</div>

                      {/* 7 Day Columns (Sun to Sat) */}
                      {currentWeekDays.map((day) => {
                        // Match events for this day and time slot
                        const slotEvents = filteredEvents.filter(
                          (evt) => evt.dateKey === day.dateKey && evt.timeSlot === time
                        );

                        return (
                          <div key={day.dateKey} className="wz-cal-day-slot">
                            {slotEvents.map((evt) => renderEventItem(evt))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* VIEW 2: MONTH VIEW (Formatted Sunday to Saturday) */}
            {viewMode === "Month" && (
              <div className="wz-cal-month-container">
                {/* Weekday Labels Sun - Sat */}
                <div className="wz-cal-month-weekdays">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => (
                    <div key={name} className="wz-cal-month-weekday-cell">
                      {name}
                    </div>
                  ))}
                </div>

                {/* Month Grid Cells */}
                <div className="wz-cal-month-grid">
                  {currentMonthCells.map((cell) => {
                    const cellEvents = filteredEvents.filter((evt) => evt.dateKey === cell.dateKey);
                    const maxVisible = 2;
                    const visibleEvents = cellEvents.slice(0, maxVisible);
                    const overflowCount = cellEvents.length - maxVisible;

                    return (
                      <div
                        key={cell.dateKey}
                        className={`wz-cal-month-cell ${!cell.isCurrentMonth ? "is-other-month" : ""} ${
                          cell.isToday ? "is-today" : ""
                        }`}
                        onClick={() => {
                          setCurrentDate(cell.date);
                          setViewMode("Day");
                        }}
                      >
                        <div className="wz-cal-month-cell-header">
                          <span className="wz-cal-month-day-num">{cell.dayNum}</span>
                          {cellEvents.length > 0 && (
                            <span className="wz-cal-month-cell-count">
                              {cellEvents.length} {cellEvents.length === 1 ? "event" : "events"}
                            </span>
                          )}
                        </div>

                        <div className="wz-cal-month-events-list">
                          {visibleEvents.map((evt) => renderEventItem(evt, true))}
                          {overflowCount > 0 && (
                            <button
                              type="button"
                              className="wz-cal-more-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentDate(cell.date);
                                setViewMode("Day");
                              }}
                            >
                              +{overflowCount} more
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW 3: DAY VIEW */}
            {viewMode === "Day" && (
              <div className="wz-cal-day-container">
                {/* Day Summary Banner */}
                <div className="wz-cal-day-banner">
                  <div>
                    <h3 className="wz-cal-day-banner-title">
                      {currentDate.toLocaleString("default", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
                      Showing all scheduled dispatches, returns, and field operations for this date.
                    </p>
                  </div>

                  <div className="wz-cal-day-banner-stats">
                    <span className="wz-cal-day-stat-pill" style={{ background: "#f1f5f9", color: "#334155" }}>
                      <strong>{dayViewEvents.length}</strong> Total Events
                    </span>
                    <span className="wz-cal-day-stat-pill" style={{ background: "#fef3c7", color: "#92400e" }}>
                      <strong>{dayViewEvents.filter((e) => e.type === "pickup").length}</strong> Pickups (Yellow)
                    </span>
                    <span className="wz-cal-day-stat-pill" style={{ background: "#fef2f2", color: "#e11d48" }}>
                      <strong>{dayViewEvents.filter((e) => e.type === "return").length}</strong> Returns (Red)
                    </span>
                    <span className="wz-cal-day-stat-pill" style={{ background: "#fffbeb", color: "#b45309" }}>
                      <span className="wz-cal-yellow-dot" style={{ width: "7px", height: "7px" }} />
                      <strong>{dayViewEvents.filter((e) => e.isPending).length}</strong> Pending
                    </span>
                  </div>
                </div>

                {/* Day Hourly Breakdown */}
                <div className="wz-cal-day-timeline">
                  {TIME_ROWS.map((time) => {
                    const hourEvents = dayViewEvents.filter((evt) => evt.timeSlot === time);

                    return (
                      <div key={time} className="wz-cal-day-hour-row">
                        <div className="wz-cal-day-hour-label">{time}</div>
                        <div className="wz-cal-day-hour-content">
                          {hourEvents.length === 0 ? (
                            <span style={{ fontSize: "0.76rem", color: "#cbd5e1", fontStyle: "italic", alignSelf: "center" }}>
                              No scheduled dispatch or return
                            </span>
                          ) : (
                            hourEvents.map((evt) => {
                              // If pending: show as yellow dot item
                              if (evt.isPending || evt.type === "pending") {
                                return (
                                  <div
                                    key={evt.id}
                                    className="wz-cal-pending-dot-item"
                                    style={{ padding: "10px 14px" }}
                                    onClick={() => {
                                      setSelectedEvent(evt);
                                      setShowDetailPanel(true);
                                    }}
                                  >
                                    <span className="wz-cal-yellow-dot" />
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#92400e" }}>
                                      {evt.timeExact} • Pending Approval: {evt.equipment} (Member: {evt.clientName})
                                    </span>
                                  </div>
                                );
                              }

                              const isPickup = evt.type === "pickup";

                              return (
                                <div
                                  key={evt.id}
                                  className="wz-cal-day-card"
                                  style={{
                                    background: isPickup ? "#fefce8" : "#fef2f2",
                                    border: `1px solid ${isPickup ? "#fde047" : "#fecdd3"}`,
                                  }}
                                  onClick={() => {
                                    setSelectedEvent(evt);
                                    setShowDetailPanel(true);
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                    <img
                                      src={evt.vehicleImage}
                                      alt={evt.equipment}
                                      style={{
                                        width: "60px",
                                        height: "45px",
                                        borderRadius: "8px",
                                        objectFit: "cover",
                                        border: "1px solid rgba(0,0,0,0.08)",
                                      }}
                                    />
                                    <div>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span
                                          style={{
                                            color: isPickup ? "#b45309" : "#e11d48",
                                            fontWeight: 800,
                                            fontSize: "0.85rem",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "5px",
                                          }}
                                        >
                                          {evt.timeExact} ({isPickup ? "Pickup - Yellow" : "Return - Red"})
                                        </span>
                                        <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#64748b" }}>
                                          • {evt.agenda}
                                        </span>
                                        {evt.isRescheduled && (
                                          <span className="wz-cal-rescheduled-badge">Rescheduled</span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: "0.98rem", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                                        {evt.equipment}
                                      </div>
                                      <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "2px" }}>
                                        Member: <strong>{evt.clientName}</strong> ({evt.clientPhone}) • Driver: <strong>{evt.driver}</strong>
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                                    <span
                                      style={{
                                        padding: "3px 8px",
                                        borderRadius: "6px",
                                        fontSize: "0.74rem",
                                        fontWeight: 800,
                                        background: isPickup ? "#fef3c7" : "#ffe4e6",
                                        color: isPickup ? "#92400e" : "#be123c",
                                      }}
                                    >
                                      {isPickup ? "Pickup Scheduled" : "Return Scheduled"}
                                    </span>
                                    <button
                                      type="button"
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: "#2563eb",
                                        fontSize: "0.78rem",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      View Details →
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Schedule Detail Panel (Right Sidebar) */}
          {showDetailPanel && selectedEvent && (
            <aside className="wz-cal-detail-panel">
              {/* Header: Title + Close Button */}
              <div className="wz-cal-detail-header">
                <div>
                  <h3 className="wz-cal-detail-title">Schedule Detail</h3>
                  <span style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>
                    Ref: {selectedEvent.displayId}
                  </span>
                </div>
                <button
                  className="wz-cal-btn-close"
                  title="Close Detail"
                  onClick={() => {
                    setShowDetailPanel(false);
                    setSelectedEvent(null);
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Status Banner */}
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: selectedEvent.isPending
                    ? "#fefce8"
                    : selectedEvent.type === "pickup"
                    ? "#fef3c7"
                    : "#fef2f2",
                  border: `1px solid ${
                    selectedEvent.isPending
                      ? "#fde047"
                      : selectedEvent.type === "pickup"
                      ? "#fde68a"
                      : "#fecdd3"
                  }`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {selectedEvent.isPending ? (
                    <span className="wz-cal-yellow-dot" />
                  ) : selectedEvent.type === "pickup" ? (
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#d97706" }} />
                  ) : (
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#e11d48" }} />
                  )}
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: "0.8rem",
                      color: selectedEvent.isPending
                        ? "#92400e"
                        : selectedEvent.type === "pickup"
                        ? "#b45309"
                        : "#be123c",
                    }}
                  >
                    {selectedEvent.isPending
                      ? "Pending Approval (Schedule Not Final)"
                      : selectedEvent.type === "pickup"
                      ? "Approved Pickup (Yellow)"
                      : "Approved Return (Red)"}
                  </span>
                </div>
                {selectedEvent.isRescheduled && (
                  <span className="wz-cal-rescheduled-badge">Adjusted Date</span>
                )}
              </div>

              {/* 1. Agenda */}
              <div className="wz-cal-detail-section">
                <span className="wz-cal-section-label">Agenda</span>
                <div className="wz-cal-agenda-text">
                  {selectedEvent.agenda || `${selectedEvent.type === "pickup" ? "Equipment Pickup" : "Equipment Return"} at ${selectedEvent.timeExact}`}
                </div>
              </div>

              {/* 2. Client Info */}
              <div className="wz-cal-detail-section">
                <span className="wz-cal-section-label">Member Info</span>

                <div className="wz-cal-client-card">
                  <img
                    src={selectedEvent.clientAvatar}
                    alt={selectedEvent.clientName}
                    className="wz-cal-client-avatar"
                  />
                  <div className="wz-cal-client-name">{selectedEvent.clientName}</div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{selectedEvent.clientEmail}</div>
                </div>

                <div className="wz-cal-meta-list">
                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Phone</span>
                    <span className="wz-cal-meta-val">{selectedEvent.clientPhone}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Assigned Driver</span>
                    <span className="wz-cal-meta-val">{selectedEvent.driver}</span>
                  </div>

                  {selectedEvent.driverPhone && (
                    <div className="wz-cal-meta-row">
                      <span className="wz-cal-meta-key">Driver Phone</span>
                      <span className="wz-cal-meta-val">{selectedEvent.driverPhone}</span>
                    </div>
                  )}

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Start Date</span>
                    <span className="wz-cal-meta-val">{selectedEvent.startDate}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">End Date</span>
                    <span className="wz-cal-meta-val">{selectedEvent.endDate}</span>
                  </div>

                  {selectedEvent.isRescheduled && selectedEvent.originalStartDate && (
                    <div className="wz-cal-meta-row">
                      <span className="wz-cal-meta-key">Original Date</span>
                      <span className="wz-cal-meta-val" style={{ textDecoration: "line-through", color: "#94a3b8" }}>
                        {selectedEvent.originalStartDate} to {selectedEvent.originalEndDate}
                      </span>
                    </div>
                  )}

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Farm Location</span>
                    <span className="wz-cal-meta-notes">{selectedEvent.farmLocation}</span>
                  </div>
                </div>
              </div>

              {/* 3. Machinery Info */}
              <div className="wz-cal-detail-section">
                <span className="wz-cal-section-label">Machinery Info</span>

                <div className="wz-cal-car-preview-card">
                  <img
                    src={selectedEvent.vehicleImage}
                    alt={selectedEvent.vehicleName}
                    className="wz-cal-car-preview-img"
                  />
                </div>

                <h4 className="wz-cal-car-title">{selectedEvent.vehicleName}</h4>

                <div className="wz-cal-meta-list">
                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Rental Plan</span>
                    <span className="wz-cal-meta-val">{selectedEvent.category}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Total Fee</span>
                    <span className="wz-cal-meta-val" style={{ color: "#16a34a", fontWeight: 800 }}>
                      ₱{Number(selectedEvent.totalAmount || 0).toLocaleString()} ({selectedEvent.paymentStatus})
                    </span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Payment Mode</span>
                    <span className="wz-cal-meta-val">{selectedEvent.paymentMethod}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Footer */}
              <div style={{ marginTop: "auto", paddingTop: "14px", borderTop: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: "8px" }}>
                <Link
                  to="/manager/reservations"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "9px 14px",
                    background: "#0f172a",
                    color: "#ffffff",
                    borderRadius: "8px",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Manage in Reservations
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDetailPanel(false)}
                  style={{
                    padding: "7px 14px",
                    background: "transparent",
                    border: "1px solid #cbd5e1",
                    color: "#64748b",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close Panel
                </button>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
