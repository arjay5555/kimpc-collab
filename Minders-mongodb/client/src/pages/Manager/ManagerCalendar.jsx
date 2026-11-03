import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import "../../styles/admin-kimpc.css";

// Seed calendar schedule items modeled for KIMPC
const CALENDAR_SCHEDULE_ITEMS = [
  // 14 Mon
  {
    id: "evt-1",
    dayIndex: 0, // Mon 14
    timeSlot: "8:00 AM",
    timeExact: "8:00 AM",
    type: "pickup",
    vehicleName: "Ford Focus",
    category: "Hatchback",
    vehicleNumber: "FF-4402",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80",
    clientName: "Michael Brown",
    clientAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Mon, 14 Aug 2028",
    endDate: "Tue, 15 Aug 2028",
    notes: "Requires early pickup confirmation at depot.",
  },
  {
    id: "evt-2",
    dayIndex: 0, // Mon 14
    timeSlot: "1:00 PM",
    timeExact: "1:30 PM",
    type: "return",
    vehicleName: "Hyundai Elantra",
    category: "Sedan",
    vehicleNumber: "HE-1190",
    transmission: "Manual",
    vehicleImage: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80",
    clientName: "Jane Wilson",
    clientAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    driver: "Assigned",
    startDate: "Sun, 13 Aug 2028",
    endDate: "Mon, 14 Aug 2028",
    notes: "Vehicle returned with full tank and clean inspection.",
  },

  // 15 Tue
  {
    id: "evt-3",
    dayIndex: 1, // Tue 15
    timeSlot: "9:00 AM",
    timeExact: "9:00 AM",
    type: "return",
    vehicleName: "Toyota Corolla",
    category: "Sedan",
    vehicleNumber: "TC-9021",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=600&q=80",
    clientName: "Alice Johnson",
    clientAvatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Mon, 14 Aug 2028",
    endDate: "Tue, 15 Aug 2028",
    notes: "Scheduled field return handover.",
  },
  {
    id: "evt-4",
    dayIndex: 1, // Tue 15
    timeSlot: "1:00 PM",
    timeExact: "1:00 PM",
    type: "pickup",
    vehicleName: "Chevrolet Malibu",
    category: "Sedan",
    vehicleNumber: "CM-3381",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80",
    clientName: "Helen Martinez",
    clientAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    driver: "Assigned",
    startDate: "Tue, 15 Aug 2028",
    endDate: "Wed, 16 Aug 2028",
    notes: "Client requested vehicle inspection checklist copy.",
  },
  {
    id: "evt-5",
    dayIndex: 1, // Tue 15
    timeSlot: "3:00 PM",
    timeExact: "3:30 PM",
    type: "pickup",
    vehicleName: "Ford Focus",
    category: "Hatchback",
    vehicleNumber: "FF-4402",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80",
    clientName: "Kyle Thompson",
    clientAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Tue, 15 Aug 2028",
    endDate: "Thu, 17 Aug 2028",
    notes: "Standard 2-day rental dispatch.",
  },

  // 16 Wed
  {
    id: "evt-6",
    dayIndex: 2, // Wed 16
    timeSlot: "8:00 AM",
    timeExact: "8:00 AM",
    type: "pickup",
    vehicleName: "Kia Soul",
    category: "SUV",
    vehicleNumber: "KS-7810",
    transmission: "Manual",
    vehicleImage: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80",
    clientName: "Oliver Scott",
    clientAvatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Wed, 16 Aug 2028",
    endDate: "Thu, 17 Aug 2028",
    notes: "Requires auxiliary equipment trailer hitch.",
  },
  {
    id: "evt-7",
    dayIndex: 2, // Wed 16
    timeSlot: "1:00 PM",
    timeExact: "1:30 PM",
    type: "return",
    vehicleName: "Mercedes C-Class",
    category: "Sedan",
    vehicleNumber: "MB-2210",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=600&q=80",
    clientName: "Fiona Brown",
    clientAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Tue, 15 Aug 2028",
    endDate: "Wed, 16 Aug 2028",
    notes: "Depot check-in completed.",
  },
  {
    id: "evt-8",
    dayIndex: 2, // Wed 16
    timeSlot: "2:00 PM",
    timeExact: "2:00 PM",
    type: "return",
    vehicleName: "Hyundai Elantra",
    category: "Sedan",
    vehicleNumber: "HE-1190",
    transmission: "Manual",
    vehicleImage: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80",
    clientName: "George Clark",
    clientAvatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Tue, 15 Aug 2028",
    endDate: "Wed, 16 Aug 2028",
    notes: "Standard routine return.",
  },

  // 17 Thu (Contains default selected event)
  {
    id: "evt-9",
    dayIndex: 3, // Thu 17
    timeSlot: "10:00 AM",
    timeExact: "10:00 AM",
    type: "pickup",
    vehicleName: "Toyota Corolla",
    category: "Sedan",
    vehicleNumber: "TC-9021",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=600&q=80",
    clientName: "Alice Johnson",
    clientAvatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Thu, 17 Aug 2028",
    endDate: "Fri, 18 Aug 2028",
    notes: "Member requested early morning inspection.",
  },
  {
    id: "evt-10",
    dayIndex: 3, // Thu 17
    timeSlot: "11:00 AM",
    timeExact: "11:00 AM",
    type: "pickup",
    vehicleName: "Nissan Altima",
    category: "Sedan",
    vehicleNumber: "NA-5510",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=600&q=80",
    clientName: "Oliver Scott",
    clientAvatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Thu, 17 Aug 2028",
    endDate: "Sat, 19 Aug 2028",
    notes: "Contract verified with deposit waiver.",
  },
  {
    id: "evt-11",
    dayIndex: 3, // Thu 17
    timeSlot: "12:00 PM",
    timeExact: "12:30 PM",
    type: "pickup",
    vehicleName: "Audi Q7",
    category: "SUV",
    vehicleNumber: "CX2345",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=600&q=80",
    clientName: "Kyle Thompson",
    clientAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Thu, 17 Aug 2028",
    endDate: "Fri, 18 Aug 2028",
    notes: "Client requested a child safety seat.",
  },

  // 18 Fri
  {
    id: "evt-12",
    dayIndex: 4, // Fri 18
    timeSlot: "9:00 AM",
    timeExact: "9:00 AM",
    type: "pickup",
    vehicleName: "Chevrolet Malibu",
    category: "Sedan",
    vehicleNumber: "CM-3381",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80",
    clientName: "Nancy Davis",
    clientAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Fri, 18 Aug 2028",
    endDate: "Sat, 19 Aug 2028",
    notes: "Farm transport dispatch.",
  },
  {
    id: "evt-13",
    dayIndex: 4, // Fri 18
    timeSlot: "11:00 AM",
    timeExact: "11:30 AM",
    type: "return",
    vehicleName: "Honda Civic",
    category: "Sedan",
    vehicleNumber: "HC-7740",
    transmission: "Manual",
    vehicleImage: "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&w=600&q=80",
    clientName: "Bob Smith",
    clientAvatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Wed, 16 Aug 2028",
    endDate: "Fri, 18 Aug 2028",
    notes: "Rental return settlement confirmed.",
  },
  {
    id: "evt-14",
    dayIndex: 4, // Fri 18
    timeSlot: "4:00 PM",
    timeExact: "4:30 PM",
    type: "pickup",
    vehicleName: "Kia Soul",
    category: "SUV",
    vehicleNumber: "KS-7810",
    transmission: "Manual",
    vehicleImage: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80",
    clientName: "Diana White",
    clientAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Fri, 18 Aug 2028",
    endDate: "Sun, 20 Aug 2028",
    notes: "Weekend field rental reservation.",
  },

  // 19 Sat
  {
    id: "evt-15",
    dayIndex: 5, // Sat 19
    timeSlot: "9:00 AM",
    timeExact: "9:30 AM",
    type: "pickup",
    vehicleName: "BMW X5",
    category: "SUV",
    vehicleNumber: "BX-9930",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=600&q=80",
    clientName: "Charlie Davis",
    clientAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    driver: "Assigned",
    startDate: "Sat, 19 Aug 2028",
    endDate: "Mon, 21 Aug 2028",
    notes: "GPS tracker verified active.",
  },
  {
    id: "evt-16",
    dayIndex: 5, // Sat 19
    timeSlot: "1:00 PM",
    timeExact: "1:00 PM",
    type: "return",
    vehicleName: "Toyota Corolla",
    category: "Sedan",
    vehicleNumber: "TC-9021",
    transmission: "Automatic",
    vehicleImage: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=600&q=80",
    clientName: "Michael Brown",
    clientAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    driver: "None",
    startDate: "Fri, 18 Aug 2028",
    endDate: "Sat, 19 Aug 2028",
    notes: "Completed rental return inspection.",
  },
];

// Days of the active week shown in the calendar
const WEEK_DAYS = [
  { num: 14, name: "Mon" },
  { num: 15, name: "Tue" },
  { num: 16, name: "Wed" },
  { num: 17, name: "Thu" },
  { num: 18, name: "Fri" },
  { num: 19, name: "Sat" },
];

// Time rows from 8:00 AM to 5:00 PM
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

  // Active filter: 'all', 'pickup', 'return'
  const [filterType, setFilterType] = useState("all");
  const [viewMode, setViewMode] = useState("Week");

  // Selected event for the right sidebar detail panel (Default: null until selected)
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Toggle detail panel visibility (Default: hidden until an event is clicked)
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [financialsOpen, setFinancialsOpen] = useState(false);

  // Month title state
  const [currentMonth, setCurrentMonth] = useState("August 2028");

  // Filter events based on selected filter
  const filteredEvents = useMemo(() => {
    if (filterType === "all") return CALENDAR_SCHEDULE_ITEMS;
    return CALENDAR_SCHEDULE_ITEMS.filter((item) => item.type === filterType);
  }, [filterType]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <ManagerSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper wz-cal-content-wrapper">
        {/* Top bar with Title & User Profile - spans full width across the top */}
        <header className="wz-topbar" style={{ marginBottom: "16px" }}>
          <h1 className="wz-topbar-title">Calendar</h1>

          <div className="wz-topbar-actions">
            <button className="wz-icon-btn" title="Search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <button className="wz-icon-btn" title="Settings" onClick={() => navigate("/manager")}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <button className="wz-icon-btn" title="Notifications">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <div className="wz-notif-dot" />
            </button>

            <div className="wz-user-pill" onClick={handleLogout} title="Click to Logout">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
                alt="Avatar"
                className="wz-avatar"
              />
              <div className="wz-user-info">
                <span className="wz-user-name">{user?.fullName || "Abram Schleifer"}</span>
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
        </header>

        {/* Subbar: Date Navigation & Event Type Filters */}
        <div className="wz-cal-subbar">
            {/* Left: Today, < >, Month Title */}
            <div className="wz-cal-nav-group">
              <button
                className="wz-cal-btn-today"
                onClick={() => setCurrentMonth("August 2028")}
              >
                Today
              </button>

              <div className="wz-cal-arrow-btns">
                <button
                  className="wz-cal-arrow-btn"
                  title="Previous Week"
                  onClick={() => setCurrentMonth("August 2028")}
                >
                  &lt;
                </button>
                <button
                  className="wz-cal-arrow-btn"
                  title="Next Week"
                  onClick={() => setCurrentMonth("August 2028")}
                >
                  &gt;
                </button>
              </div>

              <span className="wz-cal-month-title">{currentMonth}</span>
            </div>

            {/* Right: All / Pickup / Return Segmented Toggle + Week Dropdown */}
            <div className="wz-cal-controls-right">
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

          {/* Legend Row */}
          <div className="wz-cal-legend-row">
            <span className="wz-cal-legend-item">
              <span className="wz-cal-legend-dot-pickup" /> Pickup
            </span>
            <span className="wz-cal-legend-item">
              <span className="wz-cal-legend-dot-return" /> Return
            </span>
          </div>

        {/* ================= Calendar Body Layout: Grid + Schedule Detail Panel ================= */}
        <div className="wz-cal-body-layout">
          {/* Weekly Calendar Grid Card */}
          <div className="wz-cal-grid-card">
            {/* Header Row: UTC+1 timezone + Days (14 Mon to 19 Sat) */}
            <div className="wz-cal-header-row">
              <div className="wz-cal-tz-cell">UTC +1</div>
              {WEEK_DAYS.map((day) => (
                <div key={day.num} className="wz-cal-day-header">
                  <div className="wz-cal-day-num">{day.num}</div>
                  <div className="wz-cal-day-name">{day.name}</div>
                </div>
              ))}
            </div>

            {/* Body Scrollable Grid Rows */}
            <div className="wz-cal-body-scroll">
              {TIME_ROWS.map((time) => (
                <div key={time} className="wz-cal-time-row">
                  {/* Left Column: Time label */}
                  <div className="wz-cal-time-cell">{time}</div>

                  {/* 6 Day Columns (Mon to Sat) */}
                  {WEEK_DAYS.map((_, dayIdx) => {
                    // Match events in this day and this time slot
                    const slotEvents = filteredEvents.filter(
                      (evt) => evt.dayIndex === dayIdx && evt.timeSlot === time
                    );

                    return (
                      <div key={dayIdx} className="wz-cal-day-slot">
                        {slotEvents.map((evt) => {
                          const isSelected = selectedEvent?.id === evt.id;

                          return (
                            <div
                              key={evt.id}
                              className={`wz-cal-event-card ${
                                evt.type === "pickup" ? "wz-event-pickup" : "wz-event-return"
                              } ${isSelected ? "wz-event-selected" : ""}`}
                              onClick={() => {
                                setSelectedEvent(evt);
                                setShowDetailPanel(true);
                              }}
                            >
                              <span className="wz-cal-event-time">{evt.timeExact}</span>
                              <div className="wz-cal-event-model">{evt.vehicleName}</div>
                              <div className="wz-cal-event-client">
                                <img
                                  src={evt.clientAvatar}
                                  alt={evt.clientName}
                                  className="wz-cal-event-avatar"
                                />
                                <span>{evt.clientName}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Schedule Detail Panel (Aligned beside Grid Card, below Topbar & Days Row) */}
          {showDetailPanel && selectedEvent && (
            <aside className="wz-cal-detail-panel">
              {/* Header: Title + Close Button */}
              <div className="wz-cal-detail-header">
                <h3 className="wz-cal-detail-title">Schedule Detail</h3>
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

              {/* 1. Agenda */}
              <div className="wz-cal-detail-section">
                <span className="wz-cal-section-label">Agenda</span>
                <div className="wz-cal-agenda-text">
                  {selectedEvent.type === "pickup" ? "Car Pickup" : "Car Return"} at{" "}
                  {selectedEvent.timeExact}
                </div>
              </div>

              {/* 2. Client Info */}
              <div className="wz-cal-detail-section">
                <span className="wz-cal-section-label">Client Info</span>

                <div className="wz-cal-client-card">
                  <img
                    src={selectedEvent.clientAvatar}
                    alt={selectedEvent.clientName}
                    className="wz-cal-client-avatar"
                  />
                  <div className="wz-cal-client-name">{selectedEvent.clientName}</div>
                </div>

                <div className="wz-cal-meta-list">
                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Driver</span>
                    <span className="wz-cal-meta-val">{selectedEvent.driver}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Start Date</span>
                    <span className="wz-cal-meta-val">{selectedEvent.startDate}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">End Date</span>
                    <span className="wz-cal-meta-val">{selectedEvent.endDate}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Notes</span>
                    <span className="wz-cal-meta-notes">{selectedEvent.notes}</span>
                  </div>
                </div>
              </div>

              {/* 3. Car Info */}
              <div className="wz-cal-detail-section">
                <span className="wz-cal-section-label">Car Info</span>

                {/* Photo Card Preview */}
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
                    <span className="wz-cal-meta-key">Car Type</span>
                    <span className="wz-cal-meta-val">{selectedEvent.category}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Car Number</span>
                    <span className="wz-cal-meta-val">{selectedEvent.vehicleNumber}</span>
                  </div>

                  <div className="wz-cal-meta-row">
                    <span className="wz-cal-meta-key">Transmission</span>
                    <span className="wz-cal-meta-val">{selectedEvent.transmission}</span>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

