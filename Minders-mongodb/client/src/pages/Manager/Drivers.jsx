import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import "../../styles/admin-kimpc.css";

// Initial drivers list modeled for KIMPC
const INITIAL_DRIVERS = [
  {
    id: "d1",
    name: "John Adams",
    email: "john.adams@example.com",
    phone: "111-222-3333",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    address: "742 Evergreen Terrace",
    workHours: 232,
    performance: 4.6,
    performanceLabel: "Excellent",
    dutyDays: [2, 3, 7, 9, 10, 14, 15, 19, 21, 22, 29],
    schedule: [
      { date: "Tue, 1 Aug", client: "Alice Johnson", time: "10:00 AM", vehicle: "Toyota Corolla" },
      { date: "Wed, 2 Aug", client: "Michael Brown", time: "08:00 AM", vehicle: "Ford Focus" },
      { date: "Fri, 4 Aug", client: "Nancy Davis", time: "09:00 AM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d2",
    name: "Emily Brown",
    email: "emily.brown@example.com",
    phone: "222-333-4444",
    status: "Sick Leave",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    address: "512 Pinecrest Blvd",
    workHours: 198,
    performance: 4.4,
    performanceLabel: "Good",
    dutyDays: [4, 5, 11, 12, 18, 25, 26],
    schedule: [
      { date: "Mon, 14 Aug", client: "Jane Wilson", time: "01:30 PM", vehicle: "Hyundai Elantra" },
    ],
  },
  {
    id: "d3",
    name: "Michael Clark",
    email: "michael.clark@example.com",
    phone: "333-444-5555",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    address: "88 Market St, Suite 4B",
    workHours: 254,
    performance: 4.8,
    performanceLabel: "Excellent",
    dutyDays: [1, 3, 5, 8, 10, 12, 15, 17, 22, 24, 29],
    schedule: [
      { date: "Wed, 2 Aug", client: "Oliver Scott", time: "08:00 AM", vehicle: "Kia Soul" },
      { date: "Thu, 3 Aug", client: "Charlie Davis", time: "09:30 AM", vehicle: "BMW X5" },
    ],
  },
  {
    id: "d4",
    name: "Sarah Davis",
    email: "sarah.davis@example.com",
    phone: "444-555-6666",
    status: "Half-Day Leave",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    address: "204 Oak Ridge Way",
    workHours: 210,
    performance: 4.3,
    performanceLabel: "Good",
    dutyDays: [1, 2, 7, 8, 14, 15, 21, 22, 28],
    schedule: [
      { date: "Fri, 4 Aug", client: "Diana White", time: "04:30 PM", vehicle: "Kia Soul" },
    ],
  },
  {
    id: "d5",
    name: "James Evans",
    email: "james.evans@example.com",
    phone: "555-666-7777",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80",
    address: "310 Meadow Lane",
    workHours: 242,
    performance: 4.7,
    performanceLabel: "Excellent",
    dutyDays: [2, 3, 4, 9, 10, 11, 16, 17, 18, 23, 24],
    schedule: [
      { date: "Sat, 5 Aug", client: "George Clark", time: "02:00 PM", vehicle: "Hyundai Elantra" },
    ],
  },
  {
    id: "d6",
    name: "Laura Fisher",
    email: "laura.fisher@example.com",
    phone: "666-777-8888",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    address: "95 Westwood Blvd",
    workHours: 236,
    performance: 4.5,
    performanceLabel: "Excellent",
    dutyDays: [1, 2, 6, 8, 9, 13, 14, 18, 20, 21, 28],
    schedule: [
      { date: "Tue, 8 Aug", client: "Helen Martinez", time: "01:00 PM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d7",
    name: "Robert Gray",
    email: "robert.gray@example.com",
    phone: "777-888-9999",
    status: "Sick Leave",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80",
    address: "109 Lakeview Court",
    workHours: 180,
    performance: 4.2,
    performanceLabel: "Good",
    dutyDays: [5, 6, 12, 13, 19, 20, 26, 27],
    schedule: [
      { date: "Thu, 17 Aug", client: "Kyle Thompson", time: "12:30 PM", vehicle: "Audi Q7" },
    ],
  },
  {
    id: "d8",
    name: "Jessica Harris",
    email: "jessica.harris@example.com",
    phone: "888-999-0000",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80",
    address: "420 Maple Drive",
    workHours: 245,
    performance: 4.6,
    performanceLabel: "Excellent",
    dutyDays: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21],
    schedule: [
      { date: "Fri, 18 Aug", client: "Nancy Davis", time: "09:00 AM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d9",
    name: "Daniel Jackson", // DEFAULT SELECTED IN SCREENSHOT
    email: "daniel.jackson@example.com",
    phone: "999-000-1111",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80",
    address: "123 Elm Street",
    workHours: 248,
    performance: 4.5,
    performanceLabel: "Excellent",
    dutyDays: [1, 2, 6, 8, 9, 13, 14, 18, 20, 21, 28],
    schedule: [
      { date: "Tue, 1 Aug", client: "Alice Johnson", time: "10:00 AM", vehicle: "Toyota Corolla" },
      { date: "Thu, 3 Aug", client: "Bob Smith", time: "11:30 AM", vehicle: "Honda Civic" },
      { date: "Mon, 7 Aug", client: "Charlie Davis", time: "2:00 PM", vehicle: "Ford Focus" },
      { date: "Thu, 10 Aug", client: "Diana White", time: "1:00 PM", vehicle: "Chevrolet Malibu" },
    ],
  },
  {
    id: "d10",
    name: "Olivia King",
    email: "olivia.king@example.com",
    phone: "000-111-2222",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    address: "67 Beacon Street",
    workHours: 228,
    performance: 4.6,
    performanceLabel: "Excellent",
    dutyDays: [3, 4, 10, 11, 17, 18, 24, 25],
    schedule: [
      { date: "Sat, 12 Aug", client: "Michael Brown", time: "01:00 PM", vehicle: "Toyota Corolla" },
    ],
  },
  {
    id: "d11",
    name: "David Lee",
    email: "david.lee@example.com",
    phone: "111-222-3334",
    status: "Half-Day Leave",
    avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80",
    address: "802 Highland Ave",
    workHours: 204,
    performance: 4.3,
    performanceLabel: "Good",
    dutyDays: [2, 4, 8, 10, 15, 17, 22, 24, 29],
    schedule: [
      { date: "Thu, 17 Aug", client: "Oliver Scott", time: "11:00 AM", vehicle: "Nissan Altima" },
    ],
  },
];

// Days of August 2028: starts on Tuesday (Aug 1) and has 31 days
const CALENDAR_DAYS_AUG_2028 = [
  { day: 30, isCurrentMonth: false },
  { day: 31, isCurrentMonth: false },
  { day: 1, isCurrentMonth: true },
  { day: 2, isCurrentMonth: true },
  { day: 3, isCurrentMonth: true },
  { day: 4, isCurrentMonth: true },
  { day: 5, isCurrentMonth: true },
  { day: 6, isCurrentMonth: true },
  { day: 7, isCurrentMonth: true },
  { day: 8, isCurrentMonth: true },
  { day: 9, isCurrentMonth: true },
  { day: 10, isCurrentMonth: true },
  { day: 11, isCurrentMonth: true },
  { day: 12, isCurrentMonth: true },
  { day: 13, isCurrentMonth: true },
  { day: 14, isCurrentMonth: true },
  { day: 15, isCurrentMonth: true },
  { day: 16, isCurrentMonth: true },
  { day: 17, isCurrentMonth: true },
  { day: 18, isCurrentMonth: true },
  { day: 19, isCurrentMonth: true },
  { day: 20, isCurrentMonth: true },
  { day: 21, isCurrentMonth: true },
  { day: 22, isCurrentMonth: true },
  { day: 23, isCurrentMonth: true },
  { day: 24, isCurrentMonth: true },
  { day: 25, isCurrentMonth: true },
  { day: 26, isCurrentMonth: true },
  { day: 27, isCurrentMonth: true },
  { day: 28, isCurrentMonth: true },
  { day: 29, isCurrentMonth: true },
  { day: 30, isCurrentMonth: true },
  { day: 31, isCurrentMonth: true },
  { day: 1, isCurrentMonth: false },
  { day: 2, isCurrentMonth: false },
];

export default function Drivers() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Drivers list state
  const [drivers, setDrivers] = useState(INITIAL_DRIVERS);
  // Selected driver detail panel (Default: null until selected/clicked)
  const [selectedDriver, setSelectedDriver] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy] = useState("name_asc");
  const [financialsOpen, setFinancialsOpen] = useState(false);

  // Add / Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [driverForm, setDriverForm] = useState({
    name: "",
    email: "",
    phone: "",
    status: "On Duty",
    address: "123 Elm Street",
  });

  // Filtered list
  const filteredDrivers = useMemo(() => {
    let result = drivers.filter((d) => {
      const matchesSearch =
        !searchQuery.trim() ||
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.phone.includes(searchQuery.trim());

      const matchesStatus =
        filterStatus === "All" || d.status.toLowerCase() === filterStatus.toLowerCase();

      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      if (sortBy === "name_desc") return (b.name || "").localeCompare(a.name || "");
      if (sortBy === "status") return (a.status || "").localeCompare(b.status || "");
      // Default: "name_asc"
      return (a.name || "").localeCompare(b.name || "");
    });

    return result;
  }, [drivers, searchQuery, filterStatus, sortBy]);

  // Handle Save Driver (Create or Edit)
  const handleSaveDriver = (e) => {
    e.preventDefault();
    if (!driverForm.name.trim() || !driverForm.email.trim()) {
      alert("Name and email are required.");
      return;
    }

    if (editingDriver) {
      const updated = drivers.map((d) =>
        d.id === editingDriver.id
          ? {
              ...d,
              name: driverForm.name.trim(),
              email: driverForm.email.trim(),
              phone: driverForm.phone.trim(),
              status: driverForm.status,
              address: driverForm.address.trim(),
            }
          : d
      );
      setDrivers(updated);
      setSelectedDriver(updated.find((d) => d.id === editingDriver.id));
      setEditingDriver(null);
    } else {
      const newD = {
        id: `d-${Date.now()}`,
        name: driverForm.name.trim(),
        email: driverForm.email.trim(),
        phone: driverForm.phone.trim() || "555-000-1234",
        status: driverForm.status,
        avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
        address: driverForm.address.trim() || "123 Elm Street",
        workHours: 160,
        performance: 4.5,
        performanceLabel: "Excellent",
        dutyDays: [1, 2, 6, 8, 9, 13, 14, 18, 20, 21, 28],
        schedule: [
          { date: "Tue, 1 Aug", client: "Alice Johnson", time: "10:00 AM", vehicle: "Toyota Corolla" },
        ],
      };
      setDrivers([newD, ...drivers]);
      setSelectedDriver(newD);
      setShowAddModal(false);
    }
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
      <main className="wz-content-wrapper wz-drivers-content-wrapper">
        {/* Top bar with Title & User Profile - spans full width */}
        <header className="wz-topbar" style={{ marginBottom: "18px" }}>
          <h1 className="wz-topbar-title">Drivers</h1>

          <div className="wz-topbar-actions">
            <button className="wz-icon-btn" title="Search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            <button className="wz-icon-btn" title="Settings" onClick={() => navigate("/manager")}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <button className="wz-icon-btn" title="Notifications">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

        {/* Toolbar: Search + Status Filter + Sort + Add Driver Button */}
        <div className="wz-drivers-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <ManagerSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              placeholder="Search driver name, email, phone..."
              filters={[
                {
                  id: "status",
                  label: "Driver Status",
                  value: filterStatus,
                  defaultValue: "All",
                  onChange: setFilterStatus,
                  options: [
                    { value: "All", label: "All Statuses" },
                    { value: "On Duty", label: "On Duty" },
                    { value: "Sick Leave", label: "Sick Leave" },
                    { value: "Half-Day Leave", label: "Half-Day Leave" },
                  ],
                },
              ]}
              sort={{
                value: sortBy,
                defaultValue: "name_asc",
                onChange: setSortBy,
                options: [
                  { value: "name_asc", label: "Name (A-Z)" },
                  { value: "name_desc", label: "Name (Z-A)" },
                  { value: "status", label: "By Status" },
                ],
              }}
            />
          </div>

          <button
            className="wz-btn-add-driver"
            onClick={() => {
              setEditingDriver(null);
              setDriverForm({
                name: "",
                email: "",
                phone: "",
                status: "On Duty",
                address: "123 Elm Street",
              });
              setShowAddModal(true);
            }}
          >
            Add Driver
          </button>
        </div>

        {/* ================= Body Layout: Driver Directory Table + Driver Detail Panel ================= */}
        <div className="wz-drivers-body-layout">
          {/* Driver Directory Table Card */}
          <div className="wz-driver-table-card">
            <div className="wz-driver-table-wrapper">
              <table className="wz-driver-table">
                <thead>
                  <tr>
                    <th>Name <span className="wz-sort-arrow">↕</span></th>
                    <th>Email <span className="wz-sort-arrow">↕</span></th>
                    <th>Phone No. <span className="wz-sort-arrow">↕</span></th>
                    <th>Status <span className="wz-sort-arrow">↕</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((d) => {
                    const isSelected = selectedDriver?.id === d.id;

                    return (
                      <tr
                        key={d.id}
                        className={`wz-driver-row ${isSelected ? "wz-driver-row-selected" : ""}`}
                        onClick={() => setSelectedDriver(d)}
                      >
                        {/* Name + Avatar */}
                        <td>
                          <div className="wz-driver-name-cell">
                            <img src={d.avatar} alt={d.name} className="wz-driver-table-avatar" />
                            <span className="wz-driver-table-name">{d.name}</span>
                          </div>
                        </td>

                        {/* Email */}
                        <td style={{ color: "#64748b" }}>{d.email}</td>

                        {/* Phone */}
                        <td style={{ color: "#64748b" }}>{d.phone}</td>

                        {/* Status */}
                        <td>
                          <span
                            className={`wz-driver-status-pill ${
                              d.status === "On Duty"
                                ? "wz-status-onduty"
                                : d.status === "Sick Leave"
                                ? "wz-status-sick"
                                : "wz-status-halfday"
                            }`}
                          >
                            <span className="wz-status-dot" />
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="wz-table-footer" style={{ padding: "14px 18px", borderTop: "1px solid var(--wz-border)" }}>
              <span>Showing {filteredDrivers.length} of {drivers.length} drivers</span>

              <div className="wz-pagination-btns">
                <button className="wz-page-btn">&lt;</button>
                <button className="wz-page-btn active">1</button>
                <button className="wz-page-btn">2</button>
                <button className="wz-page-btn">3</button>
                <button className="wz-page-btn">4</button>
                <button className="wz-page-btn">&gt;</button>
              </div>
            </div>
          </div>

          {/* ================= Right Sidebar: Driver Detail Profile & Schedule ================= */}
          {selectedDriver && (
            <aside className="wz-driver-detail-panel">
              {/* 1. Header Profile Card */}
              <div className="wz-driver-profile-header">
                <div className="wz-driver-profile-left">
                  <img
                    src={selectedDriver.avatar}
                    alt={selectedDriver.name}
                    className="wz-driver-profile-avatar"
                  />
                  <div>
                    <div className="wz-driver-profile-name">{selectedDriver.name}</div>
                    <span
                      className={`wz-driver-status-pill ${
                        selectedDriver.status === "On Duty"
                          ? "wz-status-onduty"
                          : selectedDriver.status === "Sick Leave"
                          ? "wz-status-sick"
                          : "wz-status-halfday"
                      }`}
                    >
                      <span className="wz-status-dot" />
                      {selectedDriver.status}
                    </span>
                  </div>
                </div>

                <div className="wz-driver-profile-actions">
                  <button className="wz-btn-driver-ban" title="Restrict / Block Driver">
                    ⊘
                  </button>
                  <button
                    className="wz-btn-driver-edit"
                    onClick={() => {
                      setEditingDriver(selectedDriver);
                      setDriverForm({
                        name: selectedDriver.name,
                        email: selectedDriver.email,
                        phone: selectedDriver.phone,
                        status: selectedDriver.status,
                        address: selectedDriver.address,
                      });
                      setShowAddModal(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="wz-cal-btn-close"
                    title="Close Details"
                    onClick={() => setSelectedDriver(null)}
                  >
                    &times;
                  </button>
                </div>
              </div>

            {/* 2. Contact Information Block */}
            <div className="wz-driver-contact-list">
              <div className="wz-driver-contact-item">
                <span className="wz-driver-contact-icon">✉</span>
                <span>{selectedDriver.email}</span>
              </div>
              <div className="wz-driver-contact-item">
                <span className="wz-driver-contact-icon">📞</span>
                <span>{selectedDriver.phone}</span>
              </div>
              <div className="wz-driver-contact-item">
                <span className="wz-driver-contact-icon">📍</span>
                <span>{selectedDriver.address}</span>
              </div>
            </div>

            {/* 3. Stats 2-Grid Tiles */}
            <div className="wz-driver-stats-grid">
              {/* Tile 1: Work Hours */}
              <div className="wz-driver-stat-tile">
                <div className="wz-driver-stat-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <div className="wz-driver-stat-title">Work Hours</div>
                  <div className="wz-driver-stat-value">{selectedDriver.workHours} hours</div>
                </div>
              </div>

              {/* Tile 2: Work Performance */}
              <div className="wz-driver-stat-tile">
                <div className="wz-driver-stat-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <div>
                  <div className="wz-driver-stat-title">Work Performance</div>
                  <div className="wz-driver-stat-value">
                    {selectedDriver.performance}
                    <span className="wz-driver-badge-excellent">{selectedDriver.performanceLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Mini Attendance / Duty Calendar */}
            <div className="wz-driver-calendar-card">
              <div className="wz-driver-cal-header">
                <span className="wz-driver-cal-title">August 2028</span>
                <div className="wz-driver-cal-arrows">
                  <button className="wz-driver-cal-arrow-btn">&lt;</button>
                  <button className="wz-driver-cal-arrow-btn">&gt;</button>
                </div>
              </div>

              <div className="wz-driver-cal-weekdays">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              <div className="wz-driver-cal-days-grid">
                {CALENDAR_DAYS_AUG_2028.map((item, idx) => {
                  const isDuty =
                    item.isCurrentMonth &&
                    selectedDriver.dutyDays.includes(item.day);

                  return (
                    <div
                      key={idx}
                      className={`wz-driver-cal-day-cell ${
                        isDuty ? "wz-driver-cal-day-duty" : ""
                      } ${!item.isCurrentMonth ? "wz-driver-cal-day-faded" : ""}`}
                    >
                      {item.day}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Schedule Section */}
            <div className="wz-driver-schedule-card">
              <div className="wz-driver-schedule-header">
                <h4 className="wz-driver-schedule-title">Schedule</h4>
                <span style={{ color: "#94a3b8", cursor: "pointer", fontSize: "1.1rem" }}>•••</span>
              </div>

              {selectedDriver.schedule.map((item, idx) => (
                <div key={idx} className="wz-driver-schedule-item">
                  <span className="wz-driver-schedule-date">{item.date}</span>
                  <div className="wz-driver-schedule-info">
                    <span className="wz-driver-schedule-client">{item.client}</span>
                    <div className="wz-driver-schedule-meta">
                      <span>🕒 {item.time}</span>
                      <span>🚗 {item.vehicle}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
        </div>
      </main>

      {/* ================= Add / Edit Driver Modal ================= */}
      {(showAddModal || editingDriver) && (
        <div
          className="wz-modal-overlay"
          onClick={() => {
            setShowAddModal(false);
            setEditingDriver(null);
          }}
        >
          <div className="wz-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                {editingDriver ? "Edit Driver Profile" : "Add New Driver"}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingDriver(null);
                }}
                style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#94a3b8" }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveDriver}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                  Driver Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daniel Jackson"
                  value={driverForm.name}
                  onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="driver@example.com"
                    value={driverForm.email}
                    onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="999-000-1111"
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Duty Status
                  </label>
                  <select
                    value={driverForm.status}
                    onChange={(e) => setDriverForm({ ...driverForm, status: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem", background: "#fff" }}
                  >
                    <option value="On Duty">On Duty</option>
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Half-Day Leave">Half-Day Leave</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>
                    Address
                  </label>
                  <input
                    type="text"
                    placeholder="123 Elm Street"
                    value={driverForm.address}
                    onChange={(e) => setDriverForm({ ...driverForm, address: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.86rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingDriver(null);
                  }}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#475569",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "9px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "var(--wz-primary-red)",
                    color: "#fff",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  {editingDriver ? "Update Driver" : "Save Driver"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

