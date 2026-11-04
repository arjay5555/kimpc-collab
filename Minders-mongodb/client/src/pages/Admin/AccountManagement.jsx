import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AccountManagement() {
  const { user: currentUser } = useAuth();
  const [activeMainTab, setActiveMainTab] = useState("directory"); // "directory" | "permissions"

  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "pending" | "active" | "deactivated" | "declined" | "staff"
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // 1-button action dropdown menu state
  const [openMenuEmail, setOpenMenuEmail] = useState(null);

  // Close action dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = () => setOpenMenuEmail(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Decline confirmation modal state
  const [declineModal, setDeclineModal] = useState({ open: false, account: null, reason: "" });

  // OTP modal state
  const [otpModal, setOtpModal] = useState({ open: false, account: null, code: "" });

  // Role permissions state
  const [permissions, setPermissions] = useState(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    const res = await api("/accounts");
    if (res.ok && Array.isArray(res.data)) {
      setAccounts(res.data);
    }
    setLoading(false);
  };

  const fetchPermissions = async () => {
    setPermissionsLoading(true);
    const res = await api("/admin/permissions");
    if (res.ok && res.data) {
      setPermissions(res.data);
    }
    setPermissionsLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
    fetchPermissions();
  }, []);

  // Account Action 1: Activate / Verify
  const handleActivateAccount = async (account) => {
    setFeedback({ message: `Activating ${account.fullName}...`, isError: false });
    const res = await api(`/admin/accounts/${encodeURIComponent(account.email)}/activate`, {
      method: "PATCH",
      body: {},
    });

    if (!res.ok) {
      setFeedback({
        message: res.data?.error || `Failed to activate account (HTTP ${res.status}).`,
        isError: true,
      });
    } else {
      setFeedback({ message: `Account "${account.fullName}" has been activated and verified successfully!`, isError: false });
      fetchAccounts();
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  // Account Action 2: Decline registration
  const handleConfirmDecline = async () => {
    if (!declineModal.account) return;
    const account = declineModal.account;
    const reason = declineModal.reason.trim() || "Application declined by administrator";

    setFeedback({ message: `Declining registration for ${account.fullName}...`, isError: false });
    const res = await api(`/admin/accounts/${encodeURIComponent(account.email)}/decline`, {
      method: "PATCH",
      body: { reason },
    });

    setDeclineModal({ open: false, account: null, reason: "" });

    if (!res.ok) {
      setFeedback({
        message: res.data?.error || `Failed to decline account (HTTP ${res.status}).`,
        isError: true,
      });
    } else {
      setFeedback({ message: `Registration for "${account.fullName}" has been declined.`, isError: false });
      fetchAccounts();
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  // Account Action 3: Deactivate (preserves all records and places below active accounts)
  const handleDeactivateAccount = async (account) => {
    if (currentUser?.email && account.email.toLowerCase() === currentUser.email.toLowerCase()) {
      setFeedback({ message: "You cannot deactivate your own active administrator account.", isError: true });
      return;
    }

    setFeedback({ message: `Deactivating ${account.fullName} while preserving all records...`, isError: false });
    const res = await api(`/admin/accounts/${encodeURIComponent(account.email)}/deactivate`, {
      method: "PATCH",
      body: { reason: "Deactivated by administrator" },
    });

    if (!res.ok) {
      setFeedback({
        message: res.data?.error || `Failed to deactivate account (HTTP ${res.status}).`,
        isError: true,
      });
    } else {
      setFeedback({
        message: `Account "${account.fullName}" has been deactivated and placed below active accounts. All historical records are preserved.`,
        isError: false,
      });
      fetchAccounts();
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  // Legacy helper for toggle
  const handleToggleActive = async (account) => {
    if (account.isSuspended) {
      await handleActivateAccount(account);
    } else {
      await handleDeactivateAccount(account);
    }
  };

  // Issue OTP for forgot password
  const handleIssueOtp = async (account) => {
    setFeedback({ message: "Issuing One-Time Password...", isError: false });
    const res = await api("/admin/issue-otp", {
      method: "POST",
      body: { email: account.email },
    });

    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Could not issue OTP.", isError: true });
      return;
    }

    setOtpModal({
      open: true,
      account,
      code: res.data.otp || res.data.tempPassword || "OTP generated and emailed to member",
    });
    setFeedback({ message: `One-Time Password generated for ${account.fullName || account.email}`, isError: false });
    fetchAccounts();
  };

  // Save Role Permissions
  const handleSavePermissions = async () => {
    if (!permissions) return;
    setPermissionsSaving(true);
    setFeedback({ message: "Saving role permissions matrix...", isError: false });

    const res = await api("/admin/permissions", {
      method: "POST",
      body: { permissions },
    });

    setPermissionsSaving(false);
    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Failed to save permissions.", isError: true });
    } else {
      setFeedback({ message: "Role-based permissions matrix saved and enforced successfully!", isError: false });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handleTogglePermission = (role, permKey) => {
    setPermissions((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permKey]: !prev[role][permKey],
      },
    }));
  };

  // Account status resolver
  const getAccountStatus = (acc) => {
    if (acc.verificationStatus === "declined") {
      return { key: "declined", label: "Declined", color: "#dc2626", bg: "#fee2e2" };
    }
    if (acc.verificationStatus === "pending" || !acc.emailVerified) {
      return { key: "pending", label: "Pending Verification", color: "#b45309", bg: "#fef3c7" };
    }
    if (acc.isSuspended) {
      return { key: "deactivated", label: "Deactivated", color: "#475569", bg: "#f1f5f9" };
    }
    return { key: "active", label: "Active", color: "#166534", bg: "#dcfce7" };
  };

  // Filtering
  const filtered = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (acc.fullName || "").toLowerCase().includes(q) ||
      (acc.email || "").toLowerCase().includes(q) ||
      (acc.cooperativeId || "").toLowerCase().includes(q);

    if (!matchesSearch) return false;

    const status = getAccountStatus(acc).key;
    const role = (acc.role || "").toLowerCase();

    if (filterStatus === "all") return true;
    if (filterStatus === "pending") return status === "pending";
    if (filterStatus === "active") return status === "active";
    if (filterStatus === "deactivated") return status === "deactivated";
    if (filterStatus === "declined") return status === "declined";
    if (filterStatus === "staff") return role === "manager" || role === "admin";
    return true;
  });

  // Sorting: Pending & Active accounts on top; Deactivated accounts placed at the VERY BOTTOM below active accounts
  const sortedAccounts = [...filtered].sort((a, b) => {
    const statusA = getAccountStatus(a).key;
    const statusB = getAccountStatus(b).key;

    const priority = {
      pending: 0,
      active: 1,
      deactivated: 2,
      declined: 3,
    };

    const rankA = priority[statusA] ?? 1;
    const rankB = priority[statusB] ?? 1;

    if (rankA !== rankB) {
      return rankA - rankB; // Deactivated accounts are placed at the very bottom below active accounts
    }

    const dateA = new Date(a.createdAt || a.verifiedAt || 0).getTime();
    const dateB = new Date(b.createdAt || b.verifiedAt || 0).getTime();
    return dateB - dateA;
  });

  // KPI counts
  const pendingCount = accounts.filter((a) => getAccountStatus(a).key === "pending").length;
  const activeCount = accounts.filter((a) => getAccountStatus(a).key === "active").length;
  const deactivatedCount = accounts.filter((a) => getAccountStatus(a).key === "deactivated").length;
  const staffCount = accounts.filter((a) => ["manager", "admin"].includes((a.role || "").toLowerCase())).length;

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        <AdminTopbar
          title="Account &amp; Role Management"
          subtitle="Verify new registrations, manage active/deactivated status, and configure role-based permissions."
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by name, email, or Coop ID..."
        />

        {/* Global Feedback Alert */}
        {feedback.message && (
          <div
            style={{
              padding: "12px 18px",
              marginBottom: "20px",
              borderRadius: "10px",
              background: feedback.isError ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${feedback.isError ? "#fca5a5" : "#86efac"}`,
              color: feedback.isError ? "#991b1b" : "#166534",
              fontSize: "0.86rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback({ message: "", isError: false })}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* 4 Summary Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "20px" }}>
          {/* Card 1: Total Accounts */}
          <div style={{ padding: "16px 18px", background: "var(--wz-card-bg, #ffffff)", border: "1px solid var(--wz-border, #e2e8f0)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Total Accounts</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--wz-text, #0f172a)", marginTop: "2px" }}>{accounts.length}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>

          {/* Card 2: Pending Verification */}
          <div style={{ padding: "16px 18px", background: "var(--wz-card-bg, #ffffff)", border: "1px solid var(--wz-border, #e2e8f0)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#b45309", fontWeight: 700, textTransform: "uppercase" }}>Pending Verification</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: pendingCount > 0 ? "#b45309" : "var(--wz-text, #0f172a)", marginTop: "2px" }}>
                {pendingCount}
              </div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", color: "#b45309" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
            </div>
          </div>

          {/* Card 3: Active Members */}
          <div style={{ padding: "16px 18px", background: "var(--wz-card-bg, #ffffff)", border: "1px solid var(--wz-border, #e2e8f0)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#166534", fontWeight: 700, textTransform: "uppercase" }}>Active Verified</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#166534", marginTop: "2px" }}>{activeCount}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", color: "#166534" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          {/* Card 4: Deactivated (Preserved Records) */}
          <div style={{ padding: "16px 18px", background: "var(--wz-card-bg, #ffffff)", border: "1px solid var(--wz-border, #e2e8f0)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Deactivated (Preserved)</div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--wz-text, #0f172a)", marginTop: "2px" }}>{deactivatedCount}</div>
            </div>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
          </div>
        </div>

        {/* Tab Switcher: Accounts Directory vs Role Permissions */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid var(--wz-border, #e2e8f0)", paddingBottom: "10px" }}>
          <button
            type="button"
            onClick={() => setActiveMainTab("directory")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeMainTab === "directory" ? "#166534" : "transparent",
              color: activeMainTab === "directory" ? "#ffffff" : "var(--wz-text, #475569)",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>Accounts Directory &amp; Verification</span>
            {pendingCount > 0 && (
              <span style={{ padding: "1px 6px", borderRadius: "10px", background: activeMainTab === "directory" ? "#ffffff" : "#fee2e2", color: activeMainTab === "directory" ? "#166534" : "#dc2626", fontSize: "0.72rem", fontWeight: 800 }}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("permissions")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeMainTab === "permissions" ? "#166534" : "transparent",
              color: activeMainTab === "permissions" ? "#ffffff" : "var(--wz-text, #475569)",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Role Permissions Management</span>
          </button>
        </div>

        {/* ================= TAB 1: ACCOUNTS DIRECTORY & VERIFICATION ================= */}
        {activeMainTab === "directory" && (
          <div className="wz-table-card">
            <div className="wz-table-toolbar">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h3 className="wz-table-title" style={{ margin: 0 }}>Registered Cooperative Accounts</h3>
                <span style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>({filtered.length} found)</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {/* Filter Pills */}
                <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", flexWrap: "wrap" }}>
                  {[
                    { key: "all", label: "All" },
                    { key: "pending", label: `Pending (${pendingCount})` },
                    { key: "active", label: "Active" },
                    { key: "deactivated", label: "Deactivated" },
                    { key: "declined", label: "Declined" },
                    { key: "staff", label: `Staff (${staffCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilterStatus(tab.key)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "none",
                        background: filterStatus === tab.key ? "#ffffff" : "transparent",
                        color: filterStatus === tab.key ? "#0f172a" : "#64748b",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        boxShadow: filterStatus === tab.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={fetchAccounts}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    background: "var(--wz-card-bg, #ffffff)",
                    border: "1px solid var(--wz-border, #cbd5e1)",
                    borderRadius: "8px",
                    color: "var(--wz-text, #334155)",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div className="wz-table-responsive" style={{ minHeight: "380px" }}>
              <table className="wz-table">
                <thead>
                  <tr>
                    <th>Member / Name</th>
                    <th>Cooperative ID</th>
                    <th>Email Address</th>
                    <th>Role</th>
                    <th>Account Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                        Loading accounts directory...
                      </td>
                    </tr>
                  ) : sortedAccounts.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                        No matching accounts found for the current filter.
                      </td>
                    </tr>
                  ) : (
                    sortedAccounts.map((acc, index) => {
                      const statusInfo = getAccountStatus(acc);
                      const isStaff = ["manager", "admin"].includes((acc.role || "").toLowerCase());
                      const isPending = statusInfo.key === "pending";
                      const isDeclined = statusInfo.key === "declined";
                      const isDeactivated = statusInfo.key === "deactivated";
                      const isActive = statusInfo.key === "active";
                      const isSelf = Boolean(
                        currentUser?.email && acc.email.toLowerCase() === currentUser.email.toLowerCase()
                      );
                      const isMenuOpen = openMenuEmail === acc.email;

                      return (
                        <tr
                          key={acc._id || acc.email}
                          style={{
                            opacity: isDeactivated ? 0.75 : 1,
                            background: isDeactivated ? "rgba(241, 245, 249, 0.4)" : "transparent",
                          }}
                        >
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  background: isStaff ? "#0f172a" : isDeactivated ? "#64748b" : "#166534",
                                  color: "#ffffff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: "0.82rem",
                                  flexShrink: 0,
                                }}
                              >
                                {acc.fullName ? acc.fullName[0].toUpperCase() : "U"}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "var(--wz-text, #0f172a)", fontSize: "0.86rem" }}>
                                  {acc.fullName || "—"}
                                  {isSelf && (
                                    <span style={{ marginLeft: "6px", fontSize: "0.7rem", color: "#166534", fontWeight: 700 }}>
                                      (You)
                                    </span>
                                  )}
                                </div>
                                {acc.phone && (
                                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{acc.phone}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ fontFamily: "monospace", color: "#0f766e", fontWeight: 600 }}>
                            {acc.cooperativeId || "—"}
                          </td>
                          <td style={{ color: "var(--wz-text, #334155)", fontSize: "0.84rem" }}>{acc.email}</td>
                          <td>
                            <span
                              style={{
                                padding: "3px 9px",
                                borderRadius: "12px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                textTransform: "capitalize",
                                background:
                                  acc.role === "admin"
                                    ? "#f1f5f9"
                                    : acc.role === "manager"
                                    ? "#e0f2fe"
                                    : "#dcfce7",
                                color:
                                  acc.role === "admin"
                                    ? "#0f172a"
                                    : acc.role === "manager"
                                    ? "#0369a1"
                                    : "#15803d",
                              }}
                            >
                              {acc.role || "member"}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "3px 9px",
                                borderRadius: "8px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: statusInfo.bg,
                                color: statusInfo.color,
                              }}
                            >
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusInfo.color }} />
                              {statusInfo.label}
                            </span>
                            {acc.suspensionReason && (
                              <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }} title={acc.suspensionReason}>
                                {acc.suspensionReason.slice(0, 32)}...
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: "right", position: "relative" }}>
                            <div style={{ display: "inline-block", position: "relative" }}>
                              {/* Single Action Button Icon */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuEmail(isMenuOpen ? null : acc.email);
                                }}
                                aria-label="Account actions menu"
                                title="Actions"
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "8px",
                                  border: isMenuOpen ? "1px solid #166534" : "1px solid var(--wz-border, #cbd5e1)",
                                  background: isMenuOpen ? "#ecfdf5" : "var(--wz-card-bg, #ffffff)",
                                  color: isMenuOpen ? "#166534" : "var(--wz-text, #334155)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                  boxShadow: isMenuOpen ? "0 0 0 2px rgba(22, 101, 52, 0.15)" : "0 1px 2px rgba(0,0,0,0.04)",
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="12" cy="5" r="2.2" />
                                  <circle cx="12" cy="12" r="2.2" />
                                  <circle cx="12" cy="19" r="2.2" />
                                </svg>
                              </button>

                              {/* Clean Floating Action Dropdown Menu */}
                              {isMenuOpen && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    [index >= Math.max(1, sortedAccounts.length - 2) ? "bottom" : "top"]: "calc(100% + 4px)",
                                    zIndex: 120,
                                    minWidth: "195px",
                                    background: "#ffffff",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "10px",
                                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.18), 0 8px 10px -6px rgba(0,0,0,0.1)",
                                    padding: "6px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                  }}
                                >
                                  {/* Action 1: Active / Verify */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuEmail(null);
                                      handleActivateAccount(acc);
                                    }}
                                    disabled={isActive}
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "8px 12px",
                                      borderRadius: "6px",
                                      border: "none",
                                      background: "transparent",
                                      color: isActive ? "#94a3b8" : "#166534",
                                      fontSize: "0.82rem",
                                      fontWeight: 600,
                                      cursor: isActive ? "default" : "pointer",
                                      textAlign: "left",
                                      transition: "background 0.15s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isActive) e.currentTarget.style.background = "#f0fdf4";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "transparent";
                                    }}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>{isActive ? "Active (Verified)" : "Active (Verify)"}</span>
                                  </button>

                                  {/* Action 2: Decline */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuEmail(null);
                                      setDeclineModal({ open: true, account: acc, reason: "" });
                                    }}
                                    disabled={isDeclined}
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "8px 12px",
                                      borderRadius: "6px",
                                      border: "none",
                                      background: "transparent",
                                      color: isDeclined ? "#94a3b8" : "#dc2626",
                                      fontSize: "0.82rem",
                                      fontWeight: 600,
                                      cursor: isDeclined ? "default" : "pointer",
                                      textAlign: "left",
                                      transition: "background 0.15s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isDeclined) e.currentTarget.style.background = "#fef2f2";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "transparent";
                                    }}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                    <span>{isDeclined ? "Already Declined" : "Decline Account"}</span>
                                  </button>

                                  {/* Action 3: Deactivate */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuEmail(null);
                                      handleDeactivateAccount(acc);
                                    }}
                                    disabled={isDeactivated || isSelf}
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "8px 12px",
                                      borderRadius: "6px",
                                      border: "none",
                                      background: "transparent",
                                      color: isDeactivated || isSelf ? "#94a3b8" : "#475569",
                                      fontSize: "0.82rem",
                                      fontWeight: 600,
                                      cursor: isDeactivated || isSelf ? "default" : "pointer",
                                      textAlign: "left",
                                      transition: "background 0.15s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isDeactivated && !isSelf) e.currentTarget.style.background = "#f1f5f9";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "transparent";
                                    }}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                    </svg>
                                    <span>{isSelf ? "Self (Protected)" : isDeactivated ? "Deactivated" : "Deactivate"}</span>
                                  </button>


                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB 2: ROLE PERMISSIONS MANAGEMENT ================= */}
        {activeMainTab === "permissions" && (
          <div className="wz-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <h3 className="wz-card-title" style={{ fontSize: "1.15rem", margin: 0 }}>
                  Role-Based Access Control (RBAC) Permissions Matrix
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                  Configure granular capabilities for Members, Managers, and Administrators across cooperative modules.
                </p>
              </div>

              <button
                type="button"
                className="wz-btn-submit"
                onClick={handleSavePermissions}
                disabled={permissionsSaving || !permissions}
              >
                {permissionsSaving ? "Saving Matrix..." : "Save Role Permissions"}
              </button>
            </div>

            {permissionsLoading || !permissions ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                Loading role permissions matrix...
              </div>
            ) : (
              <div className="wz-table-responsive" style={{ minHeight: "380px" }}>
                <table className="wz-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Capability / Permission</th>
                      <th style={{ width: "20%", textAlign: "center" }}>Member</th>
                      <th style={{ width: "20%", textAlign: "center" }}>Manager</th>
                      <th style={{ width: "20%", textAlign: "center" }}>Administrator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        key: "canViewCatalog",
                        label: "Browse Machinery Catalog & Availability",
                        desc: "View specifications, rates, and availability of all fleet units",
                      },
                      {
                        key: "canBookEquipment",
                        label: "Submit Machinery Rental Applications",
                        desc: "Apply for equipment rentals and choose operators/dates",
                      },
                      {
                        key: "canViewOwnApplications",
                        label: "View Own Bookings & Transaction Invoices",
                        desc: "Access historical rental contracts, receipts, and invoices",
                      },
                      {
                        key: "canCancelPendingBookings",
                        label: "Cancel Pending Booking Reservations",
                        desc: "Cancel booking applications before manager approval dispatch",
                      },
                      {
                        key: "canManageFleet",
                        label: "Manage Fleet Units & Maintenance Logs",
                        desc: "Add machinery, log service meters, update operating status",
                      },
                      {
                        key: "canApproveBookings",
                        label: "Review, Approve & Dispatch Rental Bookings",
                        desc: "Validate farmer requirements, inspect machinery, approve rentals",
                      },
                      {
                        key: "canManageAccounts",
                        label: "Verify & Deactivate Cooperative Accounts",
                        desc: "Review new registrations, activate/deactivate accounts, issue OTPs",
                      },
                      {
                        key: "canViewFinancialReports",
                        label: "View & Export Financial & Rental Reports",
                        desc: "Access revenue totals, equipment utilization, and ledger metrics",
                      },
                      {
                        key: "canManagePolicies",
                        label: "Configure Deposits, Cancellation & Payment Gateways",
                        desc: "Define cooperative deposit %, cancellation rules, accepted payments",
                      },
                      {
                        key: "canManageBackups",
                        label: "Database Backups & Test Restore Verification",
                        desc: "Create snapshots and verify data restore in sandbox environment",
                      },
                    ].map((row) => (
                      <tr key={row.key}>
                        <td>
                          <div style={{ fontWeight: 700, color: "var(--wz-text, #0f172a)", fontSize: "0.85rem" }}>
                            {row.label}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{row.desc}</div>
                        </td>
                        {["member", "manager", "admin"].map((role) => (
                          <td key={role} style={{ textAlign: "center" }}>
                            <label className="wz-switch-toggle" style={{ margin: "0 auto" }}>
                              <input
                                type="checkbox"
                                checked={!!permissions[role]?.[row.key]}
                                onChange={() => handleTogglePermission(role, row.key)}
                              />
                              <span className="wz-switch-slider" />
                            </label>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Decline Account Modal Dialog */}
      {declineModal.open && (
        <div className="wz-modal-overlay">
          <div className="wz-modal-content" style={{ maxWidth: "440px", padding: "24px" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
              Decline Registration
            </h3>
            <p style={{ fontSize: "0.82rem", color: "#64748b", margin: "0 0 14px", lineHeight: 1.4 }}>
              Are you sure you want to decline registration for{" "}
              <strong>{declineModal.account?.fullName}</strong> ({declineModal.account?.email})?
            </p>

            <div className="wz-form-group">
              <label className="wz-form-label">Decline Reason (Optional)</label>
              <textarea
                className="wz-form-input"
                rows={3}
                placeholder="e.g. Incomplete cooperative credentials, duplicate registration, or unverified farm jurisdiction."
                value={declineModal.reason}
                onChange={(e) => setDeclineModal({ ...declineModal, reason: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setDeclineModal({ open: false, account: null, reason: "" })}
                style={{
                  padding: "7px 14px",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDecline}
                style={{
                  padding: "7px 16px",
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTP Generated Modal Dialog */}
      {otpModal.open && (
        <div className="wz-modal-overlay">
          <div className="wz-modal-content" style={{ maxWidth: "440px", padding: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#dcfce7",
                  color: "#166534",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--wz-text, #0f172a)" }}>
                Temporary OTP Generated
              </h3>
            </div>

            <p style={{ fontSize: "0.84rem", color: "#475569", lineHeight: 1.45, margin: "0 0 16px" }}>
              Provide this key to cooperative member{" "}
              <strong style={{ color: "var(--wz-text, #0f172a)" }}>{otpModal.account?.fullName}</strong> (
              {otpModal.account?.email}):
            </p>

            <div
              style={{
                background: "#f8fafc",
                padding: "16px",
                border: "2px dashed #0f766e",
                borderRadius: "10px",
                textAlign: "center",
                fontSize: "1.6rem",
                fontFamily: "monospace",
                letterSpacing: "4px",
                color: "#0f766e",
                fontWeight: 800,
                marginBottom: "16px",
              }}
            >
              {otpModal.code}
            </div>

            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setOtpModal({ open: false, account: null, code: "" })}
                style={{
                  padding: "8px 18px",
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.84rem",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
