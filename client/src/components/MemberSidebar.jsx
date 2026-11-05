import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function MemberSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  const isDashboardActive = currentPath === "/member";
  const isBookActive = currentPath === "/member/book" || currentPath.startsWith("/member/book/");
  const isApplicationsActive =
    currentPath === "/applications" || currentPath === "/my-bookings" || currentPath === "/member/history";
  const isPaymentsActive = currentPath === "/member/payments" || currentPath === "/payments";

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
      <nav className="wz-nav" style={{ marginTop: "12px" }}>
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

        {/* Browse Machinery */}
        <Link to="/member/book" className={`wz-nav-item ${isBookActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 16h13l2-5h3l1 5v3h-2" />
            <path d="M3 16V9h8l3 7" />
            <circle cx="7" cy="19" r="2" />
            <circle cx="18" cy="19" r="2" />
            <path d="M7 9V6h5" />
          </svg>
          <span>Browse Machinery</span>
        </Link>

        {/* My Bookings */}
        <Link to="/applications" className={`wz-nav-item ${isApplicationsActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5h6a1.5 1.5 0 0 0-3-1 1.5 1.5 0 0 0-3 1Z" />
            <path d="m9 13 2 2 4-4" />
          </svg>
          <span>My Bookings</span>
        </Link>

        {/* Payments */}
        <Link to="/member/payments" className={`wz-nav-item ${isPaymentsActive ? "active" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <span>Payments</span>
        </Link>
      </nav>
    </aside>
  );
}
