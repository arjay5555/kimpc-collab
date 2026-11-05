import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header({ activePage }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getInitials = (name) => {
    if (!name) return "KM";
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  };

  const role = user?.role || "member";

  return (
    <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "inherit" }}>
          <img src="/images/kimpc logo.png" alt="KIMPC Logo" style={{ height: "36px", width: "auto" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "700" }}>
            <span style={{ color: "#166534" }}>KIMPC</span>
            <span style={{ color: "#94a3b8" }}>/</span>
            <span style={{ color: "#475569", fontSize: "0.9rem" }}>Portal</span>
          </div>
        </Link>

        {/* Role-based navigation tabs */}
        <nav style={{ display: "flex", gap: "8px", marginLeft: "20px" }}>
          {role === "member" && (
            <>
              <Link to="/member" className={`button button-sm ${activePage === "member" ? "button-primary" : "button-ghost"}`}>
                Dashboard
              </Link>
              <Link to="/applications" className={`button button-sm ${activePage === "applications" ? "button-primary" : "button-ghost"}`}>
                My Bookings
              </Link>
            </>
          )}

          {role === "manager" && (
            <>
              <Link to="/manager" className={`button button-sm ${activePage === "manager" ? "button-primary" : "button-ghost"}`}>
                Fleet Overview
              </Link>
              <Link to="/booking-approvals" className={`button button-sm ${activePage === "booking-approvals" ? "button-primary" : "button-ghost"}`}>
                Approvals
              </Link>
            </>
          )}

          {role === "admin" && (
            <>
              <Link to="/admin" className={`button button-sm ${activePage === "admin" ? "button-primary" : "button-ghost"}`}>
                Admin Dashboard
              </Link>
              <Link to="/account-management" className={`button button-sm ${activePage === "account-management" ? "button-primary" : "button-ghost"}`}>
                Accounts
              </Link>
              <Link to="/audit-logs" className={`button button-sm ${activePage === "audit-logs" ? "button-primary" : "button-ghost"}`}>
                Audit Logs
              </Link>
            </>
          )}
        </nav>
      </div>

      {/* User profile & logout */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "600", color: "#1e293b" }}>
            {user?.fullName || user?.email || "Member"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "capitalize" }}>
            {role}
          </div>
        </div>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "#166534",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "700",
            fontSize: "0.85rem",
          }}
        >
          {getInitials(user?.fullName)}
        </div>
        <button
          onClick={handleLogout}
          className="button button-outline button-sm"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            fontSize: "0.82rem",
            fontWeight: "600",
            color: "#dc2626",
            borderColor: "#fecaca",
            background: "#fff",
            borderRadius: "8px",
            cursor: "pointer",
          }}
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
  );
}
