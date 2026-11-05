import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";
import MemberTopbar from "../../components/MemberTopbar";

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeAgo(dateInput) {
  if (!dateInput) return "Just now";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MemberDashboard() {
  const { user } = useAuth();

  const [applications, setApplications] = useState([]);
  const [machineryUnitsMap, setMachineryUnitsMap] = useState(new Map());
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [appsRes, unitsRes, notifsRes] = await Promise.all([
        api(getApplicationsUrl(user?.email)),
        api("/machinery-units"),
        api("/notifications"),
      ]);

      if (appsRes.ok) {
        setApplications(unwrapListResponse(appsRes));
        setLoadError("");
      } else {
        setLoadError(appsRes.data?.error || "Could not load your rental activity.");
      }

      if (unitsRes.ok) {
        const unitsList = Array.isArray(unitsRes.data?.data)
          ? unitsRes.data.data
          : Array.isArray(unitsRes.data)
          ? unitsRes.data
          : [];
        const map = new Map();
        unitsList.forEach((u) => {
          const img = u.imageUrl || (Array.isArray(u.photos) && u.photos[0]) || "";
          if (u.unitId && img) map.set(u.unitId, img);
          if (u.name && img && !map.has(u.name)) map.set(u.name, img);
        });
        setMachineryUnitsMap(map);
      }

      if (notifsRes.ok) {
        const notifList = Array.isArray(notifsRes.data?.notifications)
          ? notifsRes.data.notifications
          : Array.isArray(notifsRes.data)
          ? notifsRes.data
          : [];
        setNotifications(notifList);
      }
    } catch {
      setLoadError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(fetchData, 12000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  // Next Upcoming or Active Rental
  const nextRental = useMemo(() => {
    const approved = applications.filter((app) => {
      const status = (app.status || "").toLowerCase();
      return ["approved", "checked-out", "ongoing"].includes(status) && !app.cancellationRequested;
    });
    if (approved.length > 0) {
      return approved.sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0];
    }
    return applications[0] || null;
  }, [applications]);

  // Payment Breakdown for Active Booking
  const paymentTarget = useMemo(() => {
    const withBalance = applications.find((app) => {
      const status = (app.status || "").toLowerCase();
      const isInactive = ["cancelled", "rejected", "void"].includes(status);
      if (isInactive) return false;
      const isPaid =
        (app.paymentStatus || "").toLowerCase() === "paid" ||
        (app.paymentStatus || "").toLowerCase() === "settled";
      return !isPaid;
    });

    const target = withBalance || applications[0];
    if (!target) return null;

    const totalCharge = Number(
      target.totalAmount || (target.ratePerHectare || 2500) * (target.hectares || 1)
    );
    const isPaid =
      (target.paymentStatus || "").toLowerCase() === "paid" ||
      (target.paymentStatus || "").toLowerCase() === "settled";
    const paid = isPaid ? totalCharge : Number(target.paymentAmount || 0);
    const balance = isPaid ? 0 : Math.max(0, totalCharge - paid);

    return {
      bookingId:
        target.displayId ||
        (target._id ? `BK-${String(target._id).slice(-4).toUpperCase()}` : "BK-1042"),
      totalCharge,
      paid,
      balance,
    };
  }, [applications]);

  // Top summary card metrics: Pending, Active Booking, Completed, Balance
  const pendingCount = useMemo(() => {
    return applications.filter((app) => {
      const status = (app.status || "Pending").toLowerCase();
      const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
      return status === "pending" && !isCancelPending;
    }).length;
  }, [applications]);

  const activeCount = useMemo(() => {
    return applications.filter((app) => {
      const status = (app.status || "").toLowerCase();
      const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
      return ["approved", "checked-out", "ongoing"].includes(status) && !isCancelPending;
    }).length;
  }, [applications]);

  const completedCount = useMemo(() => {
    return applications.filter((app) => {
      const status = (app.status || "").toLowerCase();
      return status === "returned" || status === "completed";
    }).length;
  }, [applications]);

  const totalOutstandingBalance = useMemo(() => {
    return applications
      .filter((app) => {
        const status = (app.status || "").toLowerCase();
        const isInactive = ["cancelled", "rejected", "void"].includes(status);
        if (isInactive) return false;
        const isPaid =
          (app.paymentStatus || "").toLowerCase() === "paid" ||
          (app.paymentStatus || "").toLowerCase() === "settled";
        return !isPaid;
      })
      .reduce((sum, app) => {
        const total = Number(
          app.totalAmount || (app.ratePerHectare || 2500) * (app.hectares || 1)
        );
        const paid = Number(app.paymentAmount || 0);
        return sum + Math.max(0, total - paid);
      }, 0);
  }, [applications]);

  // Pending Requests list
  const pendingList = useMemo(() => {
    return applications.filter((app) => {
      const status = (app.status || "Pending").toLowerCase();
      const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
      return status === "pending" && !isCancelPending;
    });
  }, [applications]);

  // Notifications list with fallback to synthesized events
  const displayNotifications = useMemo(() => {
    if (notifications.length > 0) {
      return notifications.slice(0, 3).map((item) => {
        const text = (item.title || "").toLowerCase();
        const isPayment =
          text.includes("deposit") || text.includes("payment") || text.includes("paid");
        return {
          title: item.title,
          subtext: `${item.message ? item.message.slice(0, 45) + " • " : ""}${formatTimeAgo(
            item.createdAt
          )}`,
          type: isPayment ? "payment" : "booking",
        };
      });
    }

    const synthesized = [];
    if (nextRental) {
      synthesized.push({
        title: `Your ${nextRental.machineryModel || nextRental.equipment} booking is approved`,
        subtext: `Booking ${nextRental.displayId || "BK-1042"} • 1 hour ago`,
        type: "booking",
      });
    }
    if (paymentTarget && paymentTarget.paid > 0) {
      synthesized.push({
        title: `Deposit recorded: ₱${Number(paymentTarget.paid).toLocaleString()}`,
        subtext: `Booking ${paymentTarget.bookingId} • 2 hours ago`,
        type: "payment",
      });
    } else if (pendingList.length > 0) {
      synthesized.push({
        title: `Request submitted: ${pendingList[0].machineryModel || pendingList[0].equipment}`,
        subtext: `Booking ${pendingList[0].displayId || "BK-1045"} • Awaiting approval`,
        type: "booking",
      });
    } else {
      synthesized.push({
        title: "Welcome to KIMPC Machinery Portal",
        subtext: "System ready • Just now",
        type: "booking",
      });
    }
    return synthesized;
  }, [notifications, nextRental, paymentTarget, pendingList]);

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", paddingBottom: "40px" }}>
      {/* Top Header Bar */}
      <MemberTopbar
        title="Dashboard"
        subtitle="Manage your equipment rentals, inspect pending bookings, and track payment schedules."
      />

      {loadError && (
        <div style={{ padding: "10px 16px", marginBottom: "18px", borderRadius: "10px", background: "#fef2f2", border: "1px solid #fecdd3", color: "#b91c1c", fontSize: "0.85rem", fontWeight: 600 }}>
          {loadError}
        </div>
      )}

      {/* Top 4 Summary Cards: Pending, Active Booking, Completed, Balance */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        {/* Card 1: Pending */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "#fffbeb",
              color: "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Pending
            </div>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {loading ? "..." : pendingCount}
            </div>
          </div>
        </div>

        {/* Card 2: Active Booking */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "#ecfdf5",
              color: "#166534",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 16h13l2-5h3l1 5v3h-2" />
              <path d="M3 16V9h8l3 7" />
              <circle cx="7" cy="19" r="2" />
              <circle cx="18" cy="19" r="2" />
              <path d="M7 9V6h5" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Active Booking
            </div>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {loading ? "..." : activeCount}
            </div>
          </div>
        </div>

        {/* Card 3: Completed */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: "#eff6ff",
              color: "#1d4ed8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Completed
            </div>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>
              {loading ? "..." : completedCount}
            </div>
          </div>
        </div>

        {/* Card 4: Balance */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              background: totalOutstandingBalance > 0 ? "#fef2f2" : "#ecfdf5",
              color: totalOutstandingBalance > 0 ? "#dc2626" : "#166534",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Balance
            </div>
            <div
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                color: totalOutstandingBalance > 0 ? "#b91c1c" : "#15803d",
                lineHeight: 1.2,
              }}
            >
              {loading ? "..." : `₱${Number(totalOutstandingBalance).toLocaleString()}`}
            </div>
          </div>
        </div>
      </div>

      {/* 2x2 Grid Matching User Reference Design */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
          gap: "20px",
          alignItems: "stretch",
        }}
      >
        {/* ========================================================================= */}
        {/* ======================== Card 1: Your Next Rental ======================= */}
        {/* ========================================================================= */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "22px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 16h13l2-5h3l1 5v3h-2" />
                <path d="M3 16V9h8l3 7" />
                <circle cx="7" cy="19" r="2" />
                <circle cx="18" cy="19" r="2" />
                <path d="M7 9V6h5" />
              </svg>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#14532d" }}>
                Your Next Rental
              </h3>
            </div>

            {/* Content */}
            {loading ? (
              <div style={{ padding: "20px 0" }}>
                <div className="member-table-skeleton" style={{ height: "100px", borderRadius: "8px" }} />
              </div>
            ) : nextRental ? (
              <div style={{ display: "flex", gap: "18px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "20px" }}>
                <img
                  src={
                    nextRental.imageUrl ||
                    machineryUnitsMap.get(nextRental.machineryUnitId) ||
                    machineryUnitsMap.get(nextRental.equipment) ||
                    "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=600&q=80"
                  }
                  alt={nextRental.machineryModel || nextRental.equipment}
                  style={{
                    width: "165px",
                    height: "115px",
                    borderRadius: "10px",
                    objectFit: "cover",
                    border: "1px solid #e2e8f0",
                    background: "#f1f5f9",
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    e.currentTarget.src = "/images/kimpc logo.png";
                    e.currentTarget.style.objectFit = "contain";
                    e.currentTarget.style.padding = "10px";
                  }}
                />

                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                    <span style={{ fontSize: "1.02rem", fontWeight: 800, color: "#0f172a" }}>
                      {nextRental.machineryModel || nextRental.equipment} • {nextRental.machineryUnitId || nextRental.displayId || "TR-001"}
                    </span>
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#15803d",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      ✓ {nextRental.status === "Approved" ? "Approved" : nextRental.status || "Approved"}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "0.82rem" }}>
                    {/* Schedule */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", width: "110px", flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        Schedule
                      </span>
                      <span style={{ color: "#0f172a", fontWeight: 600 }}>
                        {formatDateDisplay(nextRental.startDate)} • 8:00 AM
                      </span>
                    </div>

                    {/* Farm Location */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", width: "110px", flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Farm location
                      </span>
                      <span style={{ color: "#0f172a", fontWeight: 600 }}>
                        {nextRental.farmLocation || "Ninoy Aquino, Kalilangan"}
                      </span>
                    </div>

                    {/* Farm Area */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", width: "110px", flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="6" cy="19" r="2" />
                          <circle cx="18" cy="19" r="2" />
                          <path d="M6 17h12" />
                          <path d="M9 11h6" />
                        </svg>
                        Farm area
                      </span>
                      <span style={{ color: "#0f172a", fontWeight: 600 }}>
                        {nextRental.hectares ? `${nextRental.hectares} hectare${nextRental.hectares > 1 ? "s" : ""}` : "1 hectare"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "24px 0", color: "#64748b", fontSize: "0.85rem", marginBottom: "16px" }}>
                No active rentals at the moment. Browse our machinery catalog to reserve equipment.
              </div>
            )}
          </div>

          <div>
            <Link
              to="/applications"
              style={{
                display: "inline-block",
                background: "#ffffff",
                border: "1.5px solid #166534",
                color: "#166534",
                fontWeight: 700,
                fontSize: "0.84rem",
                padding: "7px 18px",
                borderRadius: "8px",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              View Booking
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ======================== Card 2: Payment Reminder ======================= */}
        {/* ========================================================================= */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "22px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            {/* Header & Status Badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#14532d" }}>
                  Payment Reminder
                </h3>
              </div>
              <span
                style={{
                  background: paymentTarget?.balance > 0 ? "#fef3c7" : "#dcfce7",
                  color: paymentTarget?.balance > 0 ? "#92400e" : "#15803d",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: "6px",
                }}
              >
                {paymentTarget?.balance > 0
                  ? paymentTarget?.paid > 0
                    ? "Partially Paid"
                    : "Pending Payment"
                  : "Paid in Full"}
              </span>
            </div>

            {/* Payment Details */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                <span style={{ color: "#475569" }}>Booking</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{paymentTarget?.bookingId || "BK-1042"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                <span style={{ color: "#475569" }}>Total charge</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>₱{Number(paymentTarget?.totalCharge || 0).toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                <span style={{ color: "#475569" }}>Paid</span>
                <span style={{ fontWeight: 600, color: "#0f172a" }}>₱{Number(paymentTarget?.paid || 0).toLocaleString()}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 12px",
                  marginTop: "6px",
                  background: "#fef9c3",
                  borderRadius: "6px",
                  fontSize: "0.92rem",
                }}
              >
                <span style={{ fontWeight: 800, color: "#78350f" }}>Balance</span>
                <span style={{ fontWeight: 900, color: "#78350f", fontSize: "1.05rem" }}>
                  ₱{Number(paymentTarget?.balance || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div>
            <Link
              to="/member/payments"
              style={{
                display: "inline-block",
                background: "#ffffff",
                border: "1.5px solid #166534",
                color: "#166534",
                fontWeight: 700,
                fontSize: "0.84rem",
                padding: "7px 18px",
                borderRadius: "8px",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              View Payments
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ======================== Card 3: Pending Requests ======================= */}
        {/* ========================================================================= */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "22px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            {/* Header & Link */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <path d="m9 14 2 2 4-4" />
                </svg>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#14532d" }}>
                  Pending Requests
                </h3>
              </div>
              <Link
                to="/applications"
                style={{
                  color: "#166534",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                View All →
              </Link>
            </div>

            {/* Table */}
            {pendingList.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 700, borderRadius: "6px 0 0 6px" }}>
                        Booking ID
                      </th>
                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 700 }}>
                        Machinery
                      </th>
                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 700 }}>
                        Requested Date
                      </th>
                      <th style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 700, borderRadius: "0 6px 6px 0" }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingList.slice(0, 4).map((item) => (
                      <tr key={item._id || item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 10px", fontWeight: 600, color: "#0f172a" }}>
                          {item.displayId || (item._id ? `BK-${String(item._id).slice(-4).toUpperCase()}` : "BK-1045")}
                        </td>
                        <td style={{ padding: "10px 10px", color: "#0f172a" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2">
                              <path d="M3 16h13l2-5h3l1 5v3h-2" />
                              <circle cx="7" cy="19" r="2" />
                              <circle cx="18" cy="19" r="2" />
                            </svg>
                            <span>{item.machineryModel || item.equipment}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 10px", color: "#334155" }}>
                          {formatDateDisplay(item.startDate)}
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <span
                            style={{
                              background: "#fef3c7",
                              color: "#92400e",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "6px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Pending Review
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "24px 0", color: "#64748b", fontSize: "0.85rem" }}>
                No pending requests at this time. All requests are cleared.
              </div>
            )}
          </div>

          <div style={{ marginTop: "14px" }}>
            <span style={{ fontStyle: "italic", fontSize: "0.76rem", color: "#64748b" }}>
              Requests require manager approval.
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ===================== Card 4: Recent Notifications ====================== */}
        {/* ========================================================================= */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "22px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#14532d" }}>
                Recent Notifications
              </h3>
            </div>

            {/* List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "16px" }}>
              {displayNotifications.map((notif, idx) => (
                <div key={idx} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: notif.type === "payment" ? "#fef3c7" : "#dcfce7",
                      color: notif.type === "payment" ? "#b45309" : "#15803d",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {notif.type === "payment" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="8" cy="8" r="6" />
                        <path d="M18 9v6a6 6 0 0 1-6 6" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <circle cx="12" cy="12" r="10" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#0f172a", marginBottom: "2px", lineHeight: 1.3 }}>
                      {notif.title}
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      {notif.subtext}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Link
              to="/member/notifications"
              style={{
                color: "#166534",
                fontWeight: 700,
                fontSize: "0.84rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              View All Notifications →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
