import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function ManagerSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isFinancialsActive =
    currentPath.startsWith("/manager/financials") ||
    currentPath.startsWith("/financials");

  const [financialsOpen, setFinancialsOpen] = useState(isFinancialsActive);

  useEffect(() => {
    if (isFinancialsActive) {
      setFinancialsOpen(true);
    }
  }, [currentPath, isFinancialsActive]);

  const isDashboardActive = currentPath === "/manager";
  const isBookingsActive =
    currentPath === "/booking-approvals" ||
    currentPath.startsWith("/manager/bookings");
  const isUnitsActive =
    currentPath === "/manager/units" || currentPath === "/units";
  const isCalendarActive =
    currentPath === "/manager/calendar" || currentPath === "/calendar";
  const isDriversActive =
    currentPath === "/manager/drivers" || currentPath === "/drivers";
  const isPaymentsActive =
    currentPath === "/manager/financials/payments" ||
    currentPath === "/financials/payments" ||
    currentPath === "/manager/financials" ||
    currentPath === "/financials";
  const isExpensesActive =
    currentPath === "/manager/financials/expenses" ||
    currentPath === "/financials/expenses";
  const isMessagesActive =
    currentPath === "/manager/messages" ||
    currentPath === "/messages" ||
    currentPath.startsWith("/manager/messages");

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const res = await api("/manager/messages");
        if (isMounted && res.ok && res.data) {
          const count = (res.data.messages || []).filter((m) => m.status === "unread").length;
          setUnreadCount(count);
        }
      } catch (err) {
        // ignore
      }
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 15000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside className="wz-sidebar">
      {/* Brand Header */}
      <Link to="/manager" className="wz-brand" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
        <img
          src="/images/kimpc logo.png"
          alt="KIMPC Logo"
          style={{ width: "32px", height: "32px", objectFit: "contain", borderRadius: "6px" }}
        />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", letterSpacing: "0.02em" }}>KIMPC</span>
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Cooperative</span>
        </div>
      </Link>

      {/* Navigation Links */}
      <nav className="wz-nav">
        {/* Dashboard */}
        <Link
          to="/manager"
          className={`wz-nav-item ${isDashboardActive ? "active" : ""}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <span>Dashboard</span>
        </Link>

        {/* Bookings */}
        <Link
          to="/booking-approvals"
          className={`wz-nav-item ${isBookingsActive ? "active" : ""}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span>Bookings</span>
        </Link>

        {/* Units */}
        <Link
          to="/manager/units"
          className={`wz-nav-item ${isUnitsActive ? "active" : ""}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
          </svg>
          <span>Units</span>
        </Link>

        {/* Calendar */}
        <Link
          to="/manager/calendar"
          className={`wz-nav-item ${isCalendarActive ? "active" : ""}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Calendar</span>
        </Link>

        {/* Clients */}
        <div
          className="wz-nav-item"
          onClick={() => navigate("/manager")}
          style={{ cursor: "pointer" }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Clients</span>
        </div>

        {/* Drivers */}
        <Link
          to="/manager/drivers"
          className={`wz-nav-item ${isDriversActive ? "active" : ""}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>Drivers</span>
        </Link>

        {/* Financials (Dropdown) */}
        <div
          className={`wz-nav-parent ${financialsOpen ? "active-parent" : ""}`}
          onClick={() => setFinancialsOpen((prev) => !prev)}
        >
          <div className="wz-nav-parent-left">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <line x1="12" y1="6" x2="12" y2="8" />
              <line x1="12" y1="16" x2="12" y2="18" />
            </svg>
            <span>Financials</span>
          </div>
          <span className="wz-nav-chevron">
            {financialsOpen ? "▲" : "▼"}
          </span>
        </div>

        {financialsOpen && (
          <div className="wz-nav-submenu">
            <Link
              to="/manager/financials/payments"
              className={`wz-nav-subitem ${isPaymentsActive ? "active" : ""}`}
            >
              Payments
            </Link>
            <Link
              to="/manager/financials/expenses"
              className={`wz-nav-subitem ${isExpensesActive ? "active" : ""}`}
            >
              Expenses
            </Link>
          </div>
        )}

        {/* Messages */}
        <Link
          to="/manager/messages"
          className={`wz-nav-item ${isMessagesActive ? "active" : ""}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Messages</span>
          {unreadCount > 0 && <span className="wz-nav-badge">{unreadCount}</span>}
        </Link>
      </nav>

      {/* Sidebar Footer: User profile and Logout */}
      <div className="wz-sidebar-footer">
        <div className="wz-sidebar-user">
          <div className="wz-sidebar-avatar">
            {user?.fullName ? user.fullName[0].toUpperCase() : "M"}
          </div>
          <div className="wz-sidebar-user-details">
            <span className="wz-sidebar-user-name">{user?.fullName || "Manager Operations"}</span>
            <span className="wz-sidebar-user-role">{user?.email || "Manager"}</span>
          </div>
        </div>
        <button
          type="button"
          className="wz-sidebar-logout-btn"
          onClick={handleLogout}
          title="Log Out of KIMPC"
          aria-label="Log Out"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}

