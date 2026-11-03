import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isDashboardActive = currentPath === "/admin";
  const isAccountsActive = currentPath === "/account-management";
  const isAuditActive = currentPath === "/audit-logs";

  return (
    <aside className="wz-sidebar">
      {/* Brand Header */}
      <Link to="/admin" className="wz-brand" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
        <img
          src="/images/kimpc logo.png"
          alt="KIMPC Logo"
          style={{ width: "32px", height: "32px", objectFit: "contain", borderRadius: "6px" }}
        />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", letterSpacing: "0.02em" }}>KIMPC</span>
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Administrator</span>
        </div>
      </Link>

      {/* Navigation Links */}
      <nav className="wz-nav">
        {/* Dashboard */}
        <Link
          to="/admin"
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

        {/* Account Management */}
        <Link
          to="/account-management"
          className={`wz-nav-item ${isAccountsActive ? "active" : ""}`}
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
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Accounts</span>
        </Link>

        {/* Audit Logs */}
        <Link
          to="/audit-logs"
          className={`wz-nav-item ${isAuditActive ? "active" : ""}`}
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
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <span>Audit Logs</span>
        </Link>
      </nav>

      {/* Sidebar Footer: Admin Profile & Log Out */}
      <div className="wz-sidebar-footer">
        <div className="wz-sidebar-user">
          <div className="wz-sidebar-avatar" style={{ background: "#0f172a" }}>
            {user?.fullName ? user.fullName[0].toUpperCase() : "A"}
          </div>
          <div className="wz-sidebar-user-details">
            <span className="wz-sidebar-user-name">{user?.fullName || "Administrator"}</span>
            <span className="wz-sidebar-user-role">{user?.email || "Admin Portal"}</span>
          </div>
        </div>
        <button
          type="button"
          className="wz-sidebar-logout-btn"
          onClick={handleLogout}
          title="Log Out of Admin Portal"
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
