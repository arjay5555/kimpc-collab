import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import ProfileDropdown from "./ProfileDropdown";
import SettingsModal from "./SettingsModal";

export default function MemberTopbar({
  title = "Member Dashboard",
  subtitle = "",
  searchQuery = "",
  onSearchChange = null,
  searchPlaceholder = "Search machinery, bookings...",
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Dropdowns / Modals
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState("account");
  const [notifOpen, setNotifOpen] = useState(false);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);

  // Search expansion state
  const [isSearchExpanded, setIsSearchExpanded] = useState(Boolean(searchQuery));
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

  const notifRef = useRef(null);

  // Member notifications state
  const [notifications, setNotifications] = useState([]);

  // Fetch live notifications and bookings alerts
  useEffect(() => {
    let isMounted = true;
    const fetchAlerts = async () => {
      try {
        const notifRes = await api("/notifications");
        const appRes = await api("/applications");

        const incomingNotifs = [];

        // Check applications for recent approved/scheduled/pending
        if (appRes.ok && Array.isArray(appRes.data)) {
          const userApps = appRes.data.filter(
            (a) => a.memberEmail === user?.email || a.userId === user?.id
          );

          const approvedApps = userApps.filter(
            (a) => (a.status || "").toLowerCase() === "approved"
          );
          if (approvedApps.length > 0) {
            incomingNotifs.push({
              id: "member-approved",
              type: "success",
              title: `${approvedApps.length} Approved Booking${approvedApps.length > 1 ? "s" : ""}`,
              desc: `Your reservation for ${approvedApps[0].equipment || "equipment"} has been approved by the manager.`,
              time: "Ready",
              link: "/applications",
              read: false,
            });
          }

          const pendingApps = userApps.filter(
            (a) => (a.status || "").toLowerCase() === "pending"
          );
          if (pendingApps.length > 0) {
            incomingNotifs.push({
              id: "member-pending",
              type: "info",
              title: `${pendingApps.length} Booking${pendingApps.length > 1 ? "s" : ""} Pending Approval`,
              desc: "Your machinery request is being evaluated by KIMPC management.",
              time: "In Review",
              link: "/applications",
              read: false,
            });
          }
        }

        // Include notifications from notification collection if any
        if (notifRes.ok && notifRes.data?.notifications && Array.isArray(notifRes.data.notifications)) {
          notifRes.data.notifications.slice(0, 5).forEach((n, idx) => {
            incomingNotifs.push({
              id: n._id || `notif-${idx}`,
              type: n.type || "info",
              title: n.title || "KIMPC Notice",
              desc: n.message || n.desc || "Cooperative update available.",
              time: n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "Recent",
              link: "/member/notifications",
              read: Boolean(n.read),
            });
          });
        }

        if (isMounted) {
          if (incomingNotifs.length > 0) {
            setNotifications(incomingNotifs);
            setHasUnreadNotifs(incomingNotifs.some((n) => !n.read));
          } else {
            setNotifications([
              {
                id: "default-1",
                type: "info",
                title: "Welcome to KIMPC",
                desc: "Explore agricultural machinery catalog and reserve equipment.",
                time: "Today",
                link: "/member/book",
                read: true,
              },
            ]);
            setHasUnreadNotifs(false);
          }
        }
      } catch (err) {
        // ignore
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.email, user?.id]);

  // Click outside to close notifications
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
      if (
        isSearchExpanded &&
        !searchQuery &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target)
      ) {
        setIsSearchExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchExpanded, searchQuery]);

  // Expand if searchQuery is updated externally
  useEffect(() => {
    if (searchQuery) {
      setIsSearchExpanded(true);
    }
  }, [searchQuery]);

  // Focus input when expanded
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

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
          {onSearchChange ? (
            isSearchExpanded ? (
              <div
                ref={searchContainerRef}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  animation: "fadeIn 0.15s ease-out",
                }}
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (!searchQuery) {
                        setIsSearchExpanded(false);
                      } else {
                        onSearchChange("");
                      }
                    }
                  }}
                  style={{
                    padding: "8px 30px 8px 34px",
                    fontSize: "0.84rem",
                    borderRadius: "20px",
                    border: "1px solid var(--wz-border, #cbd5e1)",
                    background: "var(--wz-card-bg, #ffffff)",
                    color: "var(--wz-text, #0f172a)",
                    outline: "none",
                    width: "230px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
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
                <button
                  type="button"
                  title="Close search"
                  aria-label="Close search"
                  onClick={() => {
                    onSearchChange("");
                    setIsSearchExpanded(false);
                  }}
                  style={{
                    position: "absolute",
                    right: "8px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "3px",
                    borderRadius: "50%",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#334155")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="wz-icon-btn"
                title="Search"
                aria-label="Search"
                onClick={() => setIsSearchExpanded(true)}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            )
          ) : null}

          {/* ================= Notifications Icon (Bell) ================= */}
          <div className="wz-topbar-popover-wrapper" ref={notifRef}>
            <button
              type="button"
              className="wz-icon-btn"
              title="Notifications"
              aria-label="Notifications"
              onClick={() => setNotifOpen((p) => !p)}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {hasUnreadNotifs && <div className="wz-notif-dot" style={{ backgroundColor: "#16a34a" }} />}
            </button>

            {notifOpen && (
              <div className="wz-topbar-popover">
                <div className="wz-topbar-popover-header">
                  <span className="wz-topbar-popover-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    Member Notifications
                    {hasUnreadNotifs && (
                      <span className="wz-topbar-popover-badge" style={{ backgroundColor: "#16a34a" }}>
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
                    <Link
                      to={item.link || "/applications"}
                      key={item.id}
                      className={`wz-notif-item ${!item.read ? "unread" : ""}`}
                      onClick={() => setNotifOpen(false)}
                      style={{ textDecoration: "none", color: "inherit", display: "flex" }}
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
                    </Link>
                  ))}
                </div>

                <div className="wz-topbar-popover-footer">
                  <Link to="/member/notifications" className="wz-topbar-popover-link" onClick={() => setNotifOpen(false)}>
                    View all notifications →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ================= Settings Icon (Gear) ================= */}
          <button
            type="button"
            className="wz-icon-btn"
            title="Account, Security & Appearance Settings"
            aria-label="Settings"
            onClick={() => handleOpenSettings("account")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* ================= Profile Pill with Dropdown ================= */}
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
                  background: "#15803d",
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
                <span className="wz-user-name">{user?.fullName || "Member"}</span>
                <span className="wz-user-role" style={{ color: "#15803d", fontWeight: 600 }}>Member</span>
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

