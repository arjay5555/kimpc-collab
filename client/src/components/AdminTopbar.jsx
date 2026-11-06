import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import ProfileDropdown from "./ProfileDropdown";
import SettingsModal from "./SettingsModal";

export default function AdminTopbar({
  title = "Administrative Dashboard",
  subtitle = "",
  searchQuery = "",
  onSearchChange = null,
  searchPlaceholder = "Search records, users, logs...",
  settings: externalSettings = null,
  onToggleGoogle: externalToggleGoogle = null,
  onToggleFacebook: externalToggleFacebook = null,
  onToggleRecaptcha: externalToggleRecaptcha = null,
  onToggleWeather: externalToggleWeather = null,
  onToggleOneSignal: externalToggleOneSignal = null,
  onToggleCloudinary: externalToggleCloudinary = null,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Modals & Popovers
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState("account");
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(true);

  // Fallback internal settings if not passed as props
  const [internalSettings, setInternalSettings] = useState({
    googleLoginEnabled: true,
    facebookLoginEnabled: true,
    recaptchaEnabled: true,
    weatherEnabled: true,
    oneSignalEnabled: true,
    cloudinaryEnabled: true,
  });

  // Live notifications list
  const [notifications, setNotifications] = useState([
    {
      id: "notif-1",
      type: "info",
      title: "System Operational",
      desc: "All KIMPC cooperative administrative services running normally.",
      time: "Just now",
      read: false,
    },
    {
      id: "notif-2",
      type: "alert",
      title: "Security & Compliance",
      desc: "Audit logging is actively monitoring member authentication.",
      time: "10 mins ago",
      read: false,
    },
  ]);

  const notifRef = useRef(null);
  const searchInputRef = useRef(null);

  // Active settings value
  const activeSettings = externalSettings || internalSettings;

  // Fetch initial config & check for member password reset alerts
  useEffect(() => {
    // Fetch auth config
    if (!externalSettings) {
      api("/config").then(({ ok, data }) => {
        if (ok && data) {
          setInternalSettings({
            googleLoginEnabled: data.googleLoginEnabled !== false,
            facebookLoginEnabled: data.facebookLoginEnabled !== false,
            recaptchaEnabled: data.recaptchaEnabled !== false,
            weatherEnabled: data.weatherEnabled !== false,
            oneSignalEnabled: data.oneSignalEnabled !== false,
            cloudinaryEnabled: data.cloudinaryEnabled !== false,
          });
        }
      });
    }

    // Check for accounts requesting password reset (OTP)
    api("/accounts").then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        const pendingOtp = data.filter((a) => a.forgotPasswordRequested);
        if (pendingOtp.length > 0) {
          setNotifications((prev) => [
            {
              id: "otp-alert",
              type: "alert",
              title: `${pendingOtp.length} Password Reset Request${pendingOtp.length > 1 ? "s" : ""}`,
              desc: `${pendingOtp[0].fullName || pendingOtp[0].email} requested a temporary OTP.`,
              time: "Action required",
              link: "/account-management",
              read: false,
            },
            ...prev.filter((n) => n.id !== "otp-alert"),
          ]);
          setHasUnreadNotifs(true);
        }
      }
    });
  }, [externalSettings]);

  // Click outside listener for notifications
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setNotifOpen(false);
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleOpenSettings = (tab = "account") => {
    setSettingsInitialTab(tab);
    setSettingsModalOpen(true);
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setHasUnreadNotifs(false);
  };

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      return next;
    });
  };

  const handleInternalToggleGoogle = async () => {
    if (externalToggleGoogle) {
      externalToggleGoogle();
      return;
    }
    const nextState = !activeSettings.googleLoginEnabled;
    setInternalSettings((prev) => ({ ...prev, googleLoginEnabled: nextState }));
    const res = await api("/admin/settings/google-login", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setInternalSettings((prev) => ({ ...prev, googleLoginEnabled: !nextState }));
    }
  };

  const handleInternalToggleFacebook = async () => {
    if (externalToggleFacebook) {
      externalToggleFacebook();
      return;
    }
    const nextState = !activeSettings.facebookLoginEnabled;
    setInternalSettings((prev) => ({ ...prev, facebookLoginEnabled: nextState }));
    const res = await api("/admin/settings/facebook-login", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setInternalSettings((prev) => ({ ...prev, facebookLoginEnabled: !nextState }));
    }
  };

  const handleInternalToggleRecaptcha = async () => {
    if (externalToggleRecaptcha) {
      externalToggleRecaptcha();
      return;
    }
    const nextState = !activeSettings.recaptchaEnabled;
    setInternalSettings((prev) => ({ ...prev, recaptchaEnabled: nextState }));
    const res = await api("/admin/settings/recaptcha", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setInternalSettings((prev) => ({ ...prev, recaptchaEnabled: !nextState }));
    }
  };

  const handleInternalToggleWeather = async () => {
    if (externalToggleWeather) {
      externalToggleWeather();
      return;
    }
    const nextState = activeSettings.weatherEnabled === false ? true : false;
    setInternalSettings((prev) => ({ ...prev, weatherEnabled: nextState }));
    const res = await api("/admin/settings/weather", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setInternalSettings((prev) => ({ ...prev, weatherEnabled: !nextState }));
    }
  };

  const handleInternalToggleOneSignal = async () => {
    if (externalToggleOneSignal) {
      externalToggleOneSignal();
      return;
    }
    const nextState = activeSettings.oneSignalEnabled === false ? true : false;
    setInternalSettings((prev) => ({ ...prev, oneSignalEnabled: nextState }));
    const res = await api("/admin/settings/onesignal", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setInternalSettings((prev) => ({ ...prev, oneSignalEnabled: !nextState }));
    }
  };

  const handleInternalToggleCloudinary = async () => {
    if (externalToggleCloudinary) {
      externalToggleCloudinary();
      return;
    }
    const nextState = activeSettings.cloudinaryEnabled === false ? true : false;
    setInternalSettings((prev) => ({ ...prev, cloudinaryEnabled: nextState }));
    const res = await api("/admin/settings/cloudinary", {
      method: "POST",
      body: { enabled: nextState },
    });
    if (!res.ok) {
      setInternalSettings((prev) => ({ ...prev, cloudinaryEnabled: !nextState }));
    }
  };

  return (
    <>
      <header className="wz-topbar">
        {/* Title & Subtitle */}
        <div>
          <h1 className="wz-topbar-title">{title}</h1>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Topbar Right Actions */}
        <div className="wz-topbar-actions">
          {/* Optional Search / Search Trigger */}
          {onSearchChange ? (
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                ref={searchInputRef}
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
                  width: "240px",
                  transition: "all 0.2s ease",
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
          ) : (
            <div style={{ position: "relative" }}>
              {searchOpen ? (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Quick jump to account..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target.value) {
                        navigate(`/account-management?q=${encodeURIComponent(e.target.value)}`);
                      }
                    }}
                    style={{
                      padding: "7px 12px",
                      fontSize: "0.82rem",
                      borderRadius: "18px",
                      border: "1px solid #0f766e",
                      background: "var(--wz-card-bg, #ffffff)",
                      color: "var(--wz-text, #0f172a)",
                      outline: "none",
                      width: "200px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={toggleSearch}
                    style={{ background: "none", border: "none", color: "#64748b", marginLeft: "4px", cursor: "pointer", fontSize: "1rem" }}
                    title="Close search"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="wz-icon-btn"
                  title="Search cooperative records"
                  onClick={toggleSearch}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* ================= Settings Icon (Gear) ================= */}
          <button
            type="button"
            className="wz-icon-btn"
            title="System Settings (Account, Security, Appearance)"
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
              title="Administrative Notifications"
              onClick={() => setNotifOpen((p) => !p)}
              aria-expanded={notifOpen}
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
                    Admin Notifications
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
                      onClick={() => {
                        if (item.link) {
                          navigate(item.link);
                          setNotifOpen(false);
                        }
                      }}
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
                  <Link to="/audit-logs" className="wz-topbar-popover-link" onClick={() => setNotifOpen(false)}>
                    View all system audit events →
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
                  background: "#0f172a",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "0.92rem",
                }}
              >
                {user?.fullName ? user.fullName[0].toUpperCase() : "A"}
              </div>
              <div className="wz-user-info">
                <span className="wz-user-name">{user?.fullName || "System Administrator"}</span>
                <span className="wz-user-role" style={{ color: "#0f766e", fontWeight: 600 }}>Administrator</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "4px", color: "#64748b" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Profile Dropdown */}
            <ProfileDropdown
              isOpen={profileOpen}
              onClose={() => setProfileOpen(false)}
              onOpenSettings={() => handleOpenSettings("account")}
              onOpenChangePassword={() => handleOpenSettings("account")}
            />
          </div>
        </div>
      </header>

      {/* Settings Modal (Account & Security + Appearance + OAuth) */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        initialTab={settingsInitialTab}
        settings={activeSettings}
        onToggleGoogle={externalToggleGoogle || handleInternalToggleGoogle}
        onToggleFacebook={externalToggleFacebook || handleInternalToggleFacebook}
        onToggleRecaptcha={externalToggleRecaptcha || handleInternalToggleRecaptcha}
        onToggleWeather={externalToggleWeather || handleInternalToggleWeather}
        onToggleOneSignal={externalToggleOneSignal || handleInternalToggleOneSignal}
        onToggleCloudinary={externalToggleCloudinary || handleInternalToggleCloudinary}
      />
    </>
  );
}
