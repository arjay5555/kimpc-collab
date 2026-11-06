import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, getAuthToken, getSignedInEmail } from "../../services/api";
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

  // 3-Day Weather Forecast State for Kalilangan, Bukidnon (WeatherAPI.com)
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");
  const [weatherDisabled, setWeatherDisabled] = useState(false);
  const [showWeatherCard, setShowWeatherCard] = useState(false);

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

    // Fetch 3-day weather forecast for Kalilangan, Bukidnon
    fetchWeather();
  }, []);

  // Fetch 3-Day Forecast for Kalilangan from Manager-only Express endpoint
  const fetchWeather = async (force = false) => {
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const url = force ? "/calendar/weather?refresh=true" : "/calendar/weather";
      const res = await api(url);
      if (res.data?.disabled) {
        setWeatherDisabled(true);
        setWeatherData(null);
        setWeatherError(res.data?.error || "Weather forecast service is currently disabled by administrator.");
      } else if (res.ok && res.data && Array.isArray(res.data.forecast)) {
        setWeatherDisabled(false);
        setWeatherData(res.data);
      } else {
        setWeatherDisabled(false);
        setWeatherError(res.data?.error || "Weather forecast temporarily unavailable.");
      }
    } catch {
      setWeatherDisabled(false);
      setWeatherError("Weather service unavailable.");
    } finally {
      setWeatherLoading(false);
    }
  };

  // Fast map to find forecast data by "YYYY-MM-DD"
  const weatherByDate = useMemo(() => {
    const map = {};
    if (weatherData?.forecast && Array.isArray(weatherData.forecast)) {
      weatherData.forecast.forEach((day) => {
        if (day.date) map[day.date] = day;
      });
    }
    return map;
  }, [weatherData]);

  const handleConnectCalendar = () => {
    const token = getAuthToken();
    const email = getSignedInEmail();
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (email) params.set("email", email);
    params.set("returnUrl", window.location.origin);
    const qs = params.toString();
    window.location.href = qs ? `/api/calendar/connect?${qs}` : "/api/calendar/connect";
  };

  const handleDisconnectCalendar = async () => {
    if (!window.confirm("Disconnect your Google Calendar from KIMPC? Automatic sync will stop.")) return;
    try {
      const res = await api("/calendar/disconnect", { method: "POST" });
      if (res.ok) {
        setGoogleCalendarStatus({ connected: false });
        setCalendarNotice("Google Calendar disconnected successfully.");
      } else {
        setCalendarNotice(res.data?.error || "Could not disconnect Google Calendar.");
      }
    } catch {
      setCalendarNotice("Error disconnecting Google Calendar.");
    }
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
  // - Rescheduled: Clean icon '🔄' on card so machinery name is fully visible
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
          {evt.isRescheduled && (
            <span className="wz-cal-reschedule-icon" title="Rescheduled" style={{ flexShrink: 0, marginLeft: "auto" }}>
              🔄
            </span>
          )}
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
        {/* Top Row: Time + Pickup/Return Tag + Reschedule Icon */}
        <div className="wz-cal-event-top-row">
          <span className="wz-cal-event-time-val">{evt.timeExact || "9:00 AM"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span className={`wz-cal-type-tag ${evt.type}`}>
              {evt.type === "pickup" ? "Pickup" : "Return"}
            </span>
            {evt.isRescheduled && (
              <span className="wz-cal-reschedule-icon" title="Rescheduled">
                🔄
              </span>
            )}
          </div>
        </div>

        {/* Middle Line: Equipment Name (fully visible, no extra row squishing it!) */}
        <div className="wz-cal-event-model" title={evt.equipment}>
          {evt.equipment}
        </div>

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
          <span className="wz-cal-event-client-name" title={evt.clientName}>
            {evt.clientName}
          </span>
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
            {googleCalendarStatus.disabled ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "#f1f5f9",
                  color: "#64748b",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  border: "1px solid #e2e8f0",
                }}
                title="Google Calendar integration is currently disabled in Admin Settings"
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} />
                Calendar Sync Disabled
              </span>
            ) : googleCalendarStatus.connected ? (
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
                  title="Push latest approved bookings and maintenance schedules to Google Calendar"
                >
                  {syncingCalendar ? "Syncing..." : "Sync Now"}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectCalendar}
                  style={{
                    padding: "6px 9px",
                    borderRadius: "6px",
                    border: "1px solid #fecdd3",
                    background: "#fff1f2",
                    color: "#be123c",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Disconnect Google Calendar sync"
                >
                  Disconnect
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

            {/* Weather Forecast Toggle Button */}
            <button
              type="button"
              onClick={() => setShowWeatherCard((prev) => !prev)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 11px",
                borderRadius: "6px",
                border: weatherDisabled
                  ? "1.5px solid #fde68a"
                  : showWeatherCard
                  ? "1.5px solid #0284c7"
                  : "1px solid #cbd5e1",
                background: weatherDisabled
                  ? "#fffbeb"
                  : showWeatherCard
                  ? "#f0f9ff"
                  : "#ffffff",
                color: weatherDisabled ? "#b45309" : "#1e293b",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                transition: "all 0.15s ease",
              }}
              title={
                weatherDisabled
                  ? "Kalilangan Weather Forecast is disabled by administrator. Click to view details."
                  : "Click to view 3-day Kalilangan, Bukidnon weather forecast"
              }
            >
              {weatherLoading ? (
                <>
                  <span style={{ fontSize: "0.85rem" }}>⏳</span>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Weather...</span>
                </>
              ) : weatherDisabled ? (
                <>
                  <span style={{ fontSize: "0.85rem" }}>🌤️</span>
                  <span style={{ color: "#b45309", fontWeight: 700 }}>Weather Disabled</span>
                  <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "1px 6px", borderRadius: "8px", fontSize: "0.65rem", fontWeight: 800 }}>
                    OFF
                  </span>
                </>
              ) : weatherData?.current ? (
                <>
                  {weatherData.current.icon ? (
                    <img
                      src={weatherData.current.icon}
                      alt={weatherData.current.condition}
                      style={{ width: "18px", height: "18px", objectFit: "contain" }}
                    />
                  ) : (
                    <span>⛅</span>
                  )}
                  <span>{Math.round(weatherData.current.temp_c)}°C</span>
                  <span style={{ color: "#64748b", fontWeight: 600, fontSize: "0.72rem" }}>
                    Kalilangan
                  </span>
                  {weatherData.forecast?.[0]?.chance_of_rain > 0 && (
                    <span
                      style={{
                        background: weatherData.forecast[0].chance_of_rain >= 50 ? "#fee2e2" : "#e0f2fe",
                        color: weatherData.forecast[0].chance_of_rain >= 50 ? "#b91c1c" : "#0369a1",
                        padding: "1px 5px",
                        borderRadius: "4px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                      }}
                    >
                      💧 {weatherData.forecast[0].chance_of_rain}%
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>☁️</span>
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Weather</span>
                  {weatherError && <span style={{ color: "#ef4444", fontSize: "0.65rem" }} title={weatherError}>●</span>}
                </>
              )}
            </button>

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

        {/* 3-Day Weather Forecast Details Panel for Kalilangan, Bukidnon */}
        {showWeatherCard && (
          <div
            className="wz-cal-weather-card"
            style={{
              margin: "12px 24px 0",
              padding: "16px 20px",
              background: "linear-gradient(135deg, #f0fdf4 0%, #f0f9ff 100%)",
              border: "1px solid #bae6fd",
              borderRadius: "14px",
              boxShadow: "0 4px 14px rgba(14, 165, 233, 0.08)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.2rem" }}>🌤️</span>
                  <span style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0369a1" }}>
                    Kalilangan, Bukidnon • 3-Day Weather Forecast
                  </span>
                  {weatherData?.location && (
                    <span style={{ fontSize: "0.72rem", background: "#e0f2fe", color: "#0284c7", padding: "2px 8px", borderRadius: "12px", fontWeight: 600 }}>
                      Lat: {weatherData.location.lat}° | Lon: {weatherData.location.lon}°
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.76rem", color: "#475569", marginTop: "3px" }}>
                  Real-time agricultural conditions from WeatherAPI.com to assist heavy machinery scheduling and rainfall planning.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => fetchWeather(true)}
                  disabled={weatherLoading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "4px 9px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "#334155",
                    cursor: weatherLoading ? "wait" : "pointer",
                  }}
                  title="Refresh weather from WeatherAPI.com"
                >
                  <span style={{ display: "inline-block" }}>🔄</span>
                  {weatherLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWeatherCard(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#64748b",
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                  title="Close weather forecast"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Loading State */}
            {weatherLoading && !weatherData && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "#ffffff",
                      borderRadius: "10px",
                      padding: "16px",
                      border: "1px solid #e2e8f0",
                      textAlign: "center",
                      opacity: 0.7,
                    }}
                  >
                    <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>⏳</div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b" }}>Loading Day {idx}...</div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>Fetching Kalilangan data</div>
                  </div>
                ))}
              </div>
            )}

            {/* Disabled State Banner */}
            {!weatherLoading && weatherDisabled && (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "10px",
                  padding: "16px 20px",
                  border: "1.5px solid #fde68a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      background: "#fef3c7",
                      border: "1px solid #fde68a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.3rem",
                      flexShrink: 0,
                    }}
                  >
                    🌤️
                  </div>
                  <div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 800, color: "#92400e", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>Kalilangan Weather Forecast Disabled</span>
                      <span style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "10px", background: "#fee2e2", color: "#b91c1c", fontWeight: 800 }}>
                        Disabled by Administrator
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#78350f", marginTop: "3px", lineHeight: 1.45 }}>
                      The Kalilangan 3-day weather forecast integration has been turned OFF by an administrator in <strong>Authentication &amp; Security Settings</strong>. All calendar bookings, equipment schedules, and dispatch operations remain fully functional.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchWeather(true)}
                  style={{
                    background: "#d97706",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "7px 14px",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Check Status
                </button>
              </div>
            )}

            {/* Unavailable / Error State */}
            {!weatherLoading && !weatherDisabled && weatherError && !weatherData?.forecast?.length && (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "10px",
                  padding: "16px 20px",
                  border: "1px solid #fecaca",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.5rem" }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#991b1b" }}>
                      Weather Service Currently Unavailable
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "2px" }}>
                      {weatherError} • Calendar bookings, schedules, and machinery dispatch remain fully functional.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fetchWeather(true)}
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Retry Connection
                </button>
              </div>
            )}

            {/* Weather 3-Day Forecast Cards */}
            {weatherData?.forecast && weatherData.forecast.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {weatherData.forecast.map((day, idx) => {
                  const isToday = idx === 0;
                  const rainChance = Number(day.chance_of_rain) || 0;
                  const isHighRain = rainChance >= 60;
                  const isMediumRain = rainChance >= 35 && rainChance < 60;

                  return (
                    <div
                      key={day.date}
                      style={{
                        background: "#ffffff",
                        borderRadius: "12px",
                        padding: "14px 16px",
                        border: isToday ? "1.5px solid #38bdf8" : "1px solid #e2e8f0",
                        boxShadow: isToday ? "0 2px 8px rgba(56, 189, 248, 0.15)" : "0 1px 3px rgba(0,0,0,0.03)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      {/* Day Label & Badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div>
                          <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#0f172a" }}>
                            {isToday ? "Today" : idx === 1 ? "Tomorrow" : day.dayName}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>
                            {day.date}
                          </div>
                        </div>
                        {isToday && (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", padding: "2px 7px", borderRadius: "10px" }}>
                            Current
                          </span>
                        )}
                      </div>

                      {/* Condition & Icon */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "6px 0" }}>
                        {day.icon ? (
                          <img
                            src={day.icon}
                            alt={day.condition}
                            style={{ width: "38px", height: "38px", objectFit: "contain" }}
                          />
                        ) : (
                          <span style={{ fontSize: "1.8rem" }}>⛅</span>
                        )}
                        <div>
                          <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>
                            {Math.round(day.temp_c)}°C
                          </div>
                          <div style={{ fontSize: "0.76rem", color: "#334155", fontWeight: 600 }}>
                            {day.condition}
                          </div>
                        </div>
                      </div>

                      {/* Temperature Range */}
                      <div style={{ fontSize: "0.72rem", color: "#64748b", margin: "4px 0", display: "flex", justifyContent: "space-between" }}>
                        <span>Range: <strong>{Math.round(day.min_temp_c)}°C</strong> – <strong>{Math.round(day.max_temp_c)}°C</strong></span>
                        <span>Humidity: <strong>{day.humidity}%</strong></span>
                      </div>

                      {/* Chance of Rain */}
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "6px 10px",
                          borderRadius: "8px",
                          background: isHighRain ? "#fee2e2" : isMediumRain ? "#fef3c7" : "#f0fdf4",
                          border: `1px solid ${isHighRain ? "#fca5a5" : isMediumRain ? "#fde68a" : "#bbf7d0"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "0.74rem",
                        }}
                      >
                        <span style={{ fontWeight: 700, color: isHighRain ? "#991b1b" : isMediumRain ? "#92400e" : "#166534" }}>
                          💧 Chance of Rain: {rainChance}%
                        </span>
                        <span style={{ fontSize: "0.68rem", fontWeight: 600, color: isHighRain ? "#dc2626" : isMediumRain ? "#b45309" : "#15803d" }}>
                          {isHighRain ? "Rain Likely" : isMediumRain ? "Showers Possible" : "Dry / Good"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
                      {weatherByDate[day.dateKey] && (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            fontSize: "0.68rem",
                            marginTop: "2px",
                            padding: "1px 4px",
                            borderRadius: "4px",
                            background: "rgba(255,255,255,0.9)",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                          }}
                          title={`Forecast for ${day.dateKey}: ${weatherByDate[day.dateKey].condition}, ${Math.round(weatherByDate[day.dateKey].temp_c)}°C, ${weatherByDate[day.dateKey].chance_of_rain}% Rain`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowWeatherCard(true);
                          }}
                        >
                          {weatherByDate[day.dateKey].icon && (
                            <img src={weatherByDate[day.dateKey].icon} alt="" style={{ width: "14px", height: "14px" }} />
                          )}
                          <span style={{ fontWeight: 700 }}>{Math.round(weatherByDate[day.dateKey].temp_c)}°</span>
                          <span style={{ color: weatherByDate[day.dateKey].chance_of_rain >= 50 ? "#dc2626" : "#0284c7", fontWeight: 700 }}>
                            {weatherByDate[day.dateKey].chance_of_rain}%💧
                          </span>
                        </div>
                      )}
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
                          {weatherByDate[cell.dateKey] && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "2px",
                                fontSize: "0.68rem",
                                color: "#334155",
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                borderRadius: "4px",
                                padding: "1px 4px",
                                cursor: "pointer",
                              }}
                              title={`Kalilangan Forecast: ${weatherByDate[cell.dateKey].condition}, ${Math.round(weatherByDate[cell.dateKey].temp_c)}°C, ${weatherByDate[cell.dateKey].chance_of_rain}% rain`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowWeatherCard(true);
                              }}
                            >
                              {weatherByDate[cell.dateKey].icon && (
                                <img src={weatherByDate[cell.dateKey].icon} alt="" style={{ width: "13px", height: "13px" }} />
                              )}
                              <span style={{ fontWeight: 700 }}>{Math.round(weatherByDate[cell.dateKey].temp_c)}°</span>
                              <span style={{ color: weatherByDate[cell.dateKey].chance_of_rain >= 50 ? "#dc2626" : "#0284c7", fontWeight: 700 }}>
                                {weatherByDate[cell.dateKey].chance_of_rain}%💧
                              </span>
                            </span>
                          )}
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

              {/* Rescheduled Notice in Details */}
              {selectedEvent.isRescheduled && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    background: "#e0e7ff",
                    border: "1px solid #c7d2fe",
                    color: "#3730a3",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>🔄</span>
                  <span>Rescheduled</span>
                </div>
              )}

              {/* 1. Client Info */}
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
                  to="/manager/bookings"
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
                  Manage in Booking
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
