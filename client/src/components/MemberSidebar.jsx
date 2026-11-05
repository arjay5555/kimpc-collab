import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function MemberSidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (user?.role !== "member") return;
    try {
      const response = await api("/notifications");
      if (response.ok) setUnreadCount(Number(response.data?.unreadCount) || 0);
    } catch (e) {
      // ignore
    }
  }, [user?.role]);

  useEffect(() => {
    loadUnreadCount();
    const interval = window.setInterval(loadUnreadCount, 30000);
    const refresh = () => loadUnreadCount();
    window.addEventListener("member-notifications-updated", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("member-notifications-updated", refresh);
    };
  }, [loadUnreadCount]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isDashboardActive = currentPath === "/member";
  const isBookActive = currentPath === "/member/book" || currentPath.startsWith("/member/book/");
  const isApplicationsActive = currentPath === "/applications" || currentPath === "/member/history";
  const isNotificationsActive = currentPath === "/member/notifications";
  const isSettingsActive = currentPath === "/member/settings";

  return (
    <aside className="wz-sidebar">
      {/* Brand Header */}
      <Link
        to="/member"
        className="wz-brand"
        style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}
      >
        <img
          src="/images/kimpc logo.png"
          alt="KIMPC Logo"
          style={{ width: "32px", height: "32px", objectFit: "contain", borderRadius: "6px" }}
        />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--wz-text, #0f172a)", letterSpacing: "0.02em" }}>
            KIMPC
          </span>
          <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Member Portal
          </span>
        </div>
      </Link>

      {/* Navigation Links */}
      <nav className="wz-nav">
        {/* Dashboard */}
        <Link to="/member" className={`wz-nav-item ${isDashboardActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <span>Dashboard</span>
        </Link>

        {/* Book Equipment */}
        <Link to="/member/book" className={`wz-nav-item ${isBookActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 16h13l2-5h3l1 5v3h-2" />
            <path d="M3 16V9h8l3 7" />
            <circle cx="7" cy="19" r="2" />
            <circle cx="18" cy="19" r="2" />
            <path d="M7 9V6h5" />
          </svg>
          <span>Book Equipment</span>
        </Link>

        {/* Your Applications (Includes History) */}
        <Link to="/applications" className={`wz-nav-item ${isApplicationsActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5h6a1.5 1.5 0 0 0-3-1 1.5 1.5 0 0 0-3 1Z" />
            <path d="m9 13 2 2 4-4" />
          </svg>
          <span>Your Applications</span>
        </Link>

        {/* Notifications */}
        <Link to="/member/notifications" className={`wz-nav-item ${isNotificationsActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10" />
            <path d="M10 21h4" />
          </svg>
          <span>Notifications</span>
          {unreadCount > 0 && <span className="wz-nav-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Link>

        {/* Settings */}
        <Link to="/member/settings" className={`wz-nav-item ${isSettingsActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </Link>
      </nav>

      {/* Sidebar Footer: User profile and Logout */}
      <div className="wz-sidebar-footer">
        <div className="wz-sidebar-user">
          <div className="wz-sidebar-avatar" style={{ background: "#15803d" }}>
            {user?.fullName ? user.fullName[0].toUpperCase() : "M"}
          </div>
          <div className="wz-sidebar-user-details">
            <span className="wz-sidebar-user-name">{user?.fullName || "Member"}</span>
            <span className="wz-sidebar-user-role">{user?.email || "Cooperative Member"}</span>
          </div>
        </div>
        <button
          type="button"
          className="wz-sidebar-logout-btn"
          onClick={handleLogout}
          title="Log Out of KIMPC Member Portal"
          aria-label="Log Out"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
