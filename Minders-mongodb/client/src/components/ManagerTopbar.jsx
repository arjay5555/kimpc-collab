import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import ProfileDropdown from "./ProfileDropdown";
import SettingsModal from "./SettingsModal";

export default function ManagerTopbar({
  title = "Dashboard",
  subtitle = "",
  searchQuery = "",
  onSearchChange = null,
  searchPlaceholder = "Search...",
}) {
  const { user } = useAuth();

  // Dropdowns / Modals
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState("account");
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(true);

  const notifRef = useRef(null);

  // Manager live notifications
  const [notifications, setNotifications] = useState([
    {
      id: "mgr-notif-1",
      type: "info",
      title: "Machinery Status",
      desc: "Fleet units availability refreshed for upcoming harvest schedule.",
      time: "Just now",
      read: false,
    },
    {
      id: "mgr-notif-2",
      type: "success",
      title: "Cooperative Bookings",
      desc: "Member rental applications synced successfully.",
      time: "15 mins ago",
      read: false,
    },
  ]);

  // Fetch pending applications count for live notification
  useEffect(() => {
    api("/applications").then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        const pending = data.filter((a) => (a.status || "").toLowerCase() === "pending");
        if (pending.length > 0) {
          setNotifications((prev) => [
            {
              id: "pending-apps",
              type: "alert",
              title: `${pending.length} Pending Booking Approval${pending.length > 1 ? "s" : ""}`,
              desc: "New machinery rental requests waiting for manager review.",
              time: "Action required",
              link: "/booking-approvals",
              read: false,
            },
            ...prev.filter((n) => n.id !== "pending-apps"),
          ]);
          setHasUnreadNotifs(true);
        }
      }
    });
  }, []);

  // Click outside to close notifications
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpenSettings = (tab = "account") => {
    setSettingsInitialTab(tab);
    setSettingsModalOpen(true);
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setHasUnreadNotifs(false);
  };

  return (
    <>
      <header className="wz-topbar">
        {/* Title */}
        <div>
          <h1 className="wz-topbar-title">{title}</h1>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Topbar Actions */}
        <div className="wz-topbar-actions">
          {/* Optional Search */}
          {onSearchChange && (
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                style={{
                  padding: "8px 14px 8px 34px",
                  fontSize: "0.84rem",
                  borderRadius: "20px",
                  border: "1px solid var(--wz-border, #cbd5e1)",
                  background: "var(--wz-card-bg, #ffffff)",
                  color: "var(--wz-text, #0f172a)",
                  outline: "none",
                  width: "220px",
                }}
              />
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                strokeWidth="2.5"
                style={{ position: "absolute", left: "11px", pointerEvents: "none" }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
          )}

          {/* ================= Settings Icon (Gear) ================= */}
          <button
            type="button"
            className="wz-icon-btn"
            title="Settings (Account, Security, Appearance)"
            onClick={() => handleOpenSettings("account")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* ================= Notifications Icon (Bell) ================= */}
          <div className="wz-topbar-popover-wrapper" ref={notifRef}>
            <button
              type="button"
              className="wz-icon-btn"
              title="Notifications"
              onClick={() => setNotifOpen((p) => !p)}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {hasUnreadNotifs && <div className="wz-notif-dot" />}
            </button>

            {notifOpen && (
              <div className="wz-topbar-popover">
                <div className="wz-topbar-popover-header">
                  <span className="wz-topbar-popover-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    Manager Notifications
                    {hasUnreadNotifs && (
                      <span className="wz-topbar-popover-badge">
                        {notifications.filter((n) => !n.read).length} new
                      </span>
                    )}
                  </span>
                  {hasUnreadNotifs && (
                    <button
                      type="button"
                      className="wz-topbar-popover-action"
                      onClick={handleMarkAllRead}
                    >
                      Mark read
                    </button>
                  )}
                </div>

                <div className="wz-topbar-popover-body">
                  {notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`wz-notif-item ${!item.read ? "unread" : ""}`}
                    >
                      <div className={`wz-notif-icon-wrap ${item.type}`}>
                        {item.type === "alert" ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="wz-notif-content">
                        <div className="wz-notif-title">{item.title}</div>
                        <div className="wz-notif-desc">{item.desc}</div>
                        <div className="wz-notif-time">{item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="wz-topbar-popover-footer">
                  <Link to="/booking-approvals" className="wz-topbar-popover-link" onClick={() => setNotifOpen(false)}>
                    View booking approvals →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ================= Profile Pill with Log Out in Dropdown ================= */}
          <div className="wz-profile-wrapper">
            <div
              className="wz-user-pill"
              onClick={() => setProfileOpen((p) => !p)}
              title="Click to view personal profile, change password, and log out"
              style={{ cursor: "pointer" }}
            >
              <div
                className="wz-avatar"
                style={{
                  background: "#166534",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "0.92rem",
                }}
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : "M"}
              </div>
              <div className="wz-user-info">
                <span className="wz-user-name">{user?.fullName || "Operations Manager"}</span>
                <span className="wz-user-role" style={{ color: "#166534", fontWeight: 600 }}>Manager</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "4px", color: "#64748b" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Profile Dropdown Component */}
            <ProfileDropdown
              isOpen={profileOpen}
              onClose={() => setProfileOpen(false)}
              onOpenSettings={() => handleOpenSettings("account")}
              onOpenChangePassword={() => handleOpenSettings("account")}
            />
          </div>
        </div>
      </header>

      {/* Settings Modal (Account & Security + Appearance) */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={settingsInitialTab}
      />
    </>
  );
}
