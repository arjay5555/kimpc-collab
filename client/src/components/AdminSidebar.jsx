import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function AdminSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  const isDashboardActive = currentPath === "/admin";
  const isAccountsActive = currentPath === "/account-management";
  const isPoliciesActive = currentPath === "/admin/financial-policies";
  const isIntegrationsActive = currentPath === "/admin/integrations";
  const isReportsActive = currentPath === "/admin/reports";
  const isBackupsActive = currentPath === "/admin/backups";
  const isAuditActive = currentPath === "/audit-logs";

  return (
    <aside className="wz-sidebar">
      {/* Brand Header */}
      <Link to="/admin" className="wz-brand" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
        <img
          src="/images/kimpc logo.png"
          alt="KIMPC Logo"
          style={{ width: "28px", height: "28px", objectFit: "contain", borderRadius: "6px" }}
        />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize: "0.98rem", fontWeight: 800, color: "var(--wz-text, #0f172a)", letterSpacing: "0.02em" }}>KIMPC</span>
          <span style={{ fontSize: "0.62rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>Administrator</span>
        </div>
      </Link>

      {/* Navigation Links */}
      <nav className="wz-nav">
        {/* Dashboard */}
        <Link
          to="/admin"
          className={`wz-nav-item ${isDashboardActive ? "active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <span>Dashboard</span>
        </Link>

        {/* Account Management & Roles */}
        <Link
          to="/account-management"
          className={`wz-nav-item ${isAccountsActive ? "active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Accounts &amp; Roles</span>
        </Link>

        {/* Financial Policies & Payments */}
        <Link
          to="/admin/financial-policies"
          className={`wz-nav-item ${isPoliciesActive ? "active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          <span>Financial Policies</span>
        </Link>

        {/* Integrations & API Keys */}
        <Link
          to="/admin/integrations"
          className={`wz-nav-item ${isIntegrationsActive ? "active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22v-5" />
            <path d="M9 8V2" />
            <path d="M15 2v6" />
            <path d="M18 8v5a6 6 0 0 1-12 0V8z" />
          </svg>
          <span>Integrations</span>
        </Link>

        {/* Reports */}
        <Link
          to="/admin/reports"
          className={`wz-nav-item ${isReportsActive ? "active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>Reports</span>
        </Link>

        {/* Database & Backups */}
        <Link
          to="/admin/backups"
          className={`wz-nav-item ${isBackupsActive ? "active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
          <span>Database &amp; Backups</span>
        </Link>

        {/* Audit Logs */}
        <Link
          to="/audit-logs"
          className={`wz-nav-item ${isAuditActive ? "active" : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <span>Audit Logs</span>
        </Link>
      </nav>
    </aside>
  );
}
