import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function ProfileDropdown({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenChangePassword,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  const [userDetails, setUserDetails] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    role: user?.role || "",
    cooperativeId: "",
    phone: "",
  });

  useEffect(() => {
    if (isOpen) {
      api("/auth/me").then(({ ok, data }) => {
        if (ok && data) {
          setUserDetails({
            fullName: data.fullName || user?.fullName || "",
            email: data.email || user?.email || "",
            role: data.role || user?.role || "",
            cooperativeId: data.cooperativeId || "",
            phone: data.phone || "",
          });
        }
      });
    }
  }, [isOpen, user]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const roleName = (user?.role || "user").toLowerCase();
  const isAdmin = roleName === "admin";
  const isManager = roleName === "manager";
  const isMember = roleName === "member";
  const initial = userDetails.fullName ? userDetails.fullName[0].toUpperCase() : isAdmin ? "A" : isManager ? "M" : "M";

  return (
    <div className="wz-profile-dropdown" ref={dropdownRef}>
      {/* Profile Header */}
      <div className="wz-profile-header">
        <div
          className="wz-profile-avatar-large"
          style={{
            background: isAdmin ? "#0f172a" : isManager ? "#166534" : "#15803d",
          }}
        >
          {initial}
        </div>
        <div className="wz-profile-info">
          <div className="wz-profile-name" title={userDetails.fullName}>
            {userDetails.fullName || (isAdmin ? "System Administrator" : isManager ? "Operations Manager" : "Cooperative Member")}
          </div>
          <span className={`wz-profile-role-badge ${isAdmin ? "admin" : isManager ? "manager" : "member"}`}>
            {isAdmin ? "Administrator" : isManager ? "Manager" : "Member"}
          </span>
        </div>
      </div>

      {/* Personal Information Section */}
      <div className="wz-profile-body">
        <div className="wz-profile-section-title">Personal Information</div>

        <div className="wz-profile-detail-row">
          <span className="wz-profile-detail-label">Email:</span>
          <span className="wz-profile-detail-value" style={{ fontSize: "0.76rem" }}>
            {userDetails.email || "—"}
          </span>
        </div>

        <div className="wz-profile-detail-row">
          <span className="wz-profile-detail-label">Coop ID:</span>
          <span className="wz-profile-detail-value" style={{ fontFamily: "monospace", color: "#0f766e" }}>
            {userDetails.cooperativeId || (isAdmin ? "ADMIN-01" : isManager ? "MGR-01" : "MEM-01")}
          </span>
        </div>

        <div className="wz-profile-detail-row">
          <span className="wz-profile-detail-label">Phone:</span>
          <span className="wz-profile-detail-value">
            {userDetails.phone || "Not set"}
          </span>
        </div>

        <div className="wz-profile-detail-row">
          <span className="wz-profile-detail-label">Status:</span>
          <span className="wz-profile-detail-value" style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
            Active / Verified
          </span>
        </div>

        {/* Action Buttons */}
        <div className="wz-profile-actions">
          <button
            type="button"
            className="wz-profile-action-btn"
            onClick={() => {
              onClose();
              if (onOpenChangePassword) onOpenChangePassword();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Change Password</span>
          </button>

          <button
            type="button"
            className="wz-profile-action-btn"
            onClick={() => {
              onClose();
              if (onOpenSettings) onOpenSettings();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Edit Profile &amp; Settings</span>
          </button>
        </div>
      </div>

      {/* Log Out Button inside Profile */}
      <div className="wz-profile-footer">
        <button
          type="button"
          className="wz-profile-logout-btn"
          onClick={handleLogout}
          title="Sign out of KIMPC portal"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
}

