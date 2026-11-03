import React, { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

const navigation = [
  { label: "Dashboard", to: "/member", icon: "grid", end: true },
  { label: "Book Equipment", to: "/member/book", icon: "tractor" },
  { label: "Your Applications", to: "/applications", icon: "clipboard" },
  { label: "Notifications", to: "/member/notifications", icon: "bell" },
  { label: "Settings", to: "/member/settings", icon: "settings" },
];

function NavigationIcon({ name }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "grid") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
  if (name === "tractor") return <svg {...common}><path d="M3 16h13l2-5h3l1 5v3h-2" /><path d="M3 16V9h8l3 7" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /><path d="M7 9V6h5" /></svg>;
  if (name === "clipboard") return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6a1.5 1.5 0 0 0-3-1 1.5 1.5 0 0 0-3 1Z" /><path d="m9 13 2 2 4-4" /></svg>;
  if (name === "bell") return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10" /><path d="M10 21h4" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></svg>;
  return null;
}

function getInitials(name) {
  return (name || "Member").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export default function MemberSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (user?.role !== "member") return;
    const response = await api("/notifications");
    if (response.ok) setUnreadCount(Number(response.data?.unreadCount) || 0);
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

  return (
    <aside className={`member-sidebar${menuOpen ? " is-open" : ""}`}>
      <div className="member-sidebar-top">
        <NavLink className="member-brand" to="/member" onClick={() => setMenuOpen(false)}>
          <img src="/images/kimpc logo.png" alt="" />
          <span><strong>KIMPC</strong><small>Member portal</small></span>
        </NavLink>
        <button className="member-menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span /><span /><span />
        </button>
      </div>

      <nav className="member-nav" aria-label="Member navigation">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `member-nav-link${isActive ? " active" : ""}`}
            onClick={() => setMenuOpen(false)}
          >
            <NavigationIcon name={item.icon} />
            <span>{item.label}</span>
            {item.icon === "bell" && unreadCount > 0 && <span className="member-nav-count" aria-label={`${unreadCount} unread notifications`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="member-sidebar-user">
        <div className="member-avatar" aria-hidden="true">{getInitials(user?.fullName)}</div>
        <div className="member-user-copy">
          <strong>{user?.fullName || "Member"}</strong>
          <span>{user?.email || "Cooperative member"}</span>
        </div>
        <button className="member-logout" type="button" onClick={handleLogout} aria-label="Log out" title="Log out">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>
        </button>
      </div>
    </aside>
  );
}
