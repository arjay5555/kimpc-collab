import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { formatRentalPeriod, getApplicationProgress, getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";
import MemberTopbar from "../../components/MemberTopbar";

// Real-world cooperative events and updates
const corporationEvents = [
  {
    image: "https://picsum.photos/seed/kimpc-new-equipment/600/400",
    tag: "New Equipment",
    title: "We have new equipment!",
    description: "The new Ag Leader Precision Boom Sprayer is now available for booking.",
    date: "Nov 3, 2026",
  },
  {
    image: "https://picsum.photos/seed/kimpc-general-assembly/600/400",
    tag: "Event",
    title: "Annual General Assembly",
    description: "All registered members are invited to the KIMPC annual cooperative general assembly.",
    date: "Nov 20, 2026",
  },
  {
    image: "https://picsum.photos/seed/kimpc-maintenance-schedule/600/400",
    tag: "Announcement",
    title: "Equipment Maintenance Schedule",
    description: "Tractors and harvesters will undergo periodic servicing to ensure field readiness.",
    date: "Nov 8, 2026",
  },
];

function formatPrice(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function StatusBadge({ application }) {
  const progress = getApplicationProgress(application);
  return (
    <span
      className={`member-status member-status-${progress.tone}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: "999px",
        fontSize: "0.7rem",
        fontWeight: 700,
      }}
    >
      {progress.label}
    </span>
  );
}

export default function MemberDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const fetchApplications = useCallback(async () => {
    const response = await api(getApplicationsUrl(user?.email));
    if (response.ok) {
      setApplications(unwrapListResponse(response));
      setLoadError("");
    } else {
      setLoadError(response.data?.error || "Could not load your rental activity.");
    }
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    fetchApplications();
    const interval = window.setInterval(fetchApplications, 12000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  // Derived KPI counts
  const activeCount = useMemo(() => {
    return applications.filter((app) => {
      const label = (getApplicationProgress(app).label || "").toLowerCase();
      const status = (app.status || "").toLowerCase();
      return label === "in-use" || status === "checked-out" || status === "in use";
    }).length;
  }, [applications]);

  const pendingCount = useMemo(() => {
    return applications.filter((app) => {
      const status = (app.status || "Pending").toLowerCase();
      const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
      return status === "pending" && !isCancelPending;
    }).length;
  }, [applications]);

  const completedCount = useMemo(() => {
    return applications.filter((app) => {
      const status = (app.status || "").toLowerCase();
      const label = (getApplicationProgress(app).label || "").toLowerCase();
      return status === "completed" || status === "returned" || label === "completed";
    }).length;
  }, [applications]);

  const outstandingBalance = useMemo(() => {
    return applications
      .filter((app) => {
        const status = (app.status || "").toLowerCase();
        const isInactive = ["cancelled", "rejected", "void"].includes(status);
        if (isInactive) return false;
        const isPaid =
          (app.paymentStatus || "").toLowerCase() === "paid" ||
          (app.paymentStatus || "").toLowerCase() === "settled" ||
          Boolean(app.financials?.isSettled);
        return !isPaid;
      })
      .reduce((sum, app) => {
        const amount = Number(app.totalAmount || app.financials?.totalFee || app.paymentAmount || 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);
  }, [applications]);

  const cancelApplication = async (application) => {
    const id = application._id || application.id;
    if (!id || !window.confirm(`Cancel your booking request for ${application.equipment}?`)) return;

    setCancellingId(id);
    setActionError("");
    setActionSuccess("");

    const response = await api(`/applications/${encodeURIComponent(id)}`, { method: "DELETE" });
    setCancellingId("");
    if (!response.ok) {
      setActionError(response.data?.error || "Could not cancel this booking request.");
      return;
    }
    setActionSuccess("Booking request cancelled successfully.");
    const updatedApplication = response.data?.application;
    if (updatedApplication) {
      setApplications((current) => current.map((item) => ((item._id || item.id) === id ? updatedApplication : item)));
    } else {
      fetchApplications();
    }
    setTimeout(() => setActionSuccess(""), 4000);
  };

  return (
    <div className="member-dashboard-content" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Header Bar matching Manager and Admin */}
      <MemberTopbar
        title="Dashboard"
        subtitle="Welcome back, oversee your machinery rentals, booking requests, and cooperative news."
      />

      {/* Global Action Messages */}
      {actionSuccess && (
        <div style={{ padding: "10px 16px", marginBottom: "18px", borderRadius: "10px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "0.85rem", fontWeight: 600 }}>
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div style={{ padding: "10px 16px", marginBottom: "18px", borderRadius: "10px", background: "#fef2f2", border: "1px solid #fecdd3", color: "#b91c1c", fontSize: "0.85rem", fontWeight: 600 }}>
          {actionError}
        </div>
      )}

      {/* 4 KPI Top Cards Grid */}
      <div className="wz-kpi-grid">
        {/* Card 1: Active Rentals */}
        <div className="wz-kpi-card">
          <div className="wz-kpi-left">
            <div className="wz-kpi-icon-wrap" style={{ background: "#ecfdf5", color: "#166534" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 16h13l2-5h3l1 5v3h-2" />
                <path d="M3 16V9h8l3 7" />
                <circle cx="7" cy="19" r="2" />
                <circle cx="18" cy="19" r="2" />
                <path d="M7 9V6h5" />
              </svg>
            </div>
            <div>
              <div className="wz-kpi-label">Active Rentals</div>
              <div className="wz-kpi-value">{loading ? "..." : activeCount}</div>
            </div>
          </div>
        </div>

        {/* Card 2: Pending Requests */}
        <div className="wz-kpi-card">
          <div className="wz-kpi-left">
            <div className="wz-kpi-icon-wrap" style={{ background: "#fffbeb", color: "#b45309" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <div className="wz-kpi-label">Pending Requests</div>
              <div className="wz-kpi-value">{loading ? "..." : pendingCount}</div>
            </div>
          </div>
        </div>

        {/* Card 3: Completed Rentals */}
        <div className="wz-kpi-card">
          <div className="wz-kpi-left">
            <div className="wz-kpi-icon-wrap" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <div className="wz-kpi-label">Completed Rentals</div>
              <div className="wz-kpi-value">{loading ? "..." : completedCount}</div>
            </div>
          </div>
        </div>

        {/* Card 4: Outstanding Balance */}
        <div className="wz-kpi-card">
          <div className="wz-kpi-left">
            <div
              className="wz-kpi-icon-wrap"
              style={{
                background: outstandingBalance > 0 ? "#fef2f2" : "#ecfdf5",
                color: outstandingBalance > 0 ? "#dc2626" : "#166534",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2" />
                <path d="M6 12h.01M18 12h.01" />
              </svg>
            </div>
            <div>
              <div className="wz-kpi-label">Outstanding Balance</div>
              <div className="wz-kpi-value">{loading ? "..." : formatPrice(outstandingBalance)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Welcome Banner / Quick Booking Action */}
      <div
        className="wz-welcome-banner"
        style={{
          background: "linear-gradient(135deg, #14532d 0%, #166534 60%, #15803d 100%)",
          borderRadius: "14px",
          padding: "22px 26px",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          marginBottom: "24px",
          boxShadow: "0 4px 18px rgba(22, 101, 52, 0.16)",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#bbf7d0",
              display: "block",
              marginBottom: "4px",
            }}
          >
            KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE
          </span>
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: "1.35rem",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.01em",
            }}
          >
            Need agricultural machinery for your farm?
          </h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#dcfce7", maxWidth: "680px", lineHeight: 1.5 }}>
            Reserve high-performance 4WD tractors, rice combine harvesters, and boom sprayers at member-subsidized rates.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
          <Link
            to="/member/book"
            className="wz-btn"
            style={{
              background: "#ffffff",
              color: "#166534",
              fontWeight: 700,
              padding: "10px 20px",
              borderRadius: "10px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              transition: "transform 0.15s ease",
            }}
          >
            <span>Book Machinery</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* 2-Column Main Section */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.85fr) minmax(320px, 1fr)",
          gap: "22px",
          alignItems: "start",
        }}
      >
        {/* Left Column: Recent Bookings & Fleet Usage */}
        <div className="wz-card" style={{ margin: 0 }}>
          <div className="wz-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 className="wz-card-title" style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>
                Recent Booking Requests &amp; Machinery Rentals
              </h2>
              <span style={{ fontSize: "0.74rem", color: "#64748b" }}>Live cooperative booking status</span>
            </div>
            <Link to="/applications" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534", textDecoration: "none" }}>
              My Bookings →
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: "20px" }}>
              <div className="member-table-skeleton" style={{ height: "60px", marginBottom: "8px" }} />
              <div className="member-table-skeleton" style={{ height: "60px", marginBottom: "8px" }} />
              <div className="member-table-skeleton" style={{ height: "60px" }} />
            </div>
          ) : loadError ? (
            <div style={{ padding: "30px 20px", textAlign: "center" }}>
              <p style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: "12px" }}>{loadError}</p>
              <button onClick={fetchApplications} className="wz-btn wz-btn-outline" style={{ padding: "6px 14px" }}>
                Try again
              </button>
            </div>
          ) : applications.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  background: "#f0fdf4",
                  color: "#166534",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 12px",
                  fontSize: "1.4rem",
                }}
              >
                🚜
              </div>
              <h3 style={{ fontSize: "0.98rem", fontWeight: 700, margin: "0 0 6px", color: "#0f172a" }}>
                No equipment bookings yet
              </h3>
              <p style={{ fontSize: "0.82rem", color: "#64748b", margin: "0 0 16px", maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
                Browse the KIMPC agricultural fleet and reserve equipment for your scheduled farm preparation or harvest.
              </p>
              <Link
                to="/member/book"
                className="wz-btn wz-btn-primary"
                style={{ padding: "8px 18px", borderRadius: "8px", textDecoration: "none", display: "inline-block" }}
              >
                Explore Machinery Fleet
              </Link>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="wz-table wz-bookings-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                      Equipment
                    </th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                      Rental Period
                    </th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                      Farm Location
                    </th>
                    <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                      Status
                    </th>
                    <th style={{ padding: "10px 14px", textAlign: "right", fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {applications.slice(0, 6).map((app) => {
                    const appId = app._id || app.id;
                    const status = (app.status || "Pending").toLowerCase();
                    const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
                    const isPending = status === "pending" && !isCancelPending;
                    const isApproved = (status === "approved" || status === "checked-out" || status === "returned") && !isCancelPending;

                    return (
                      <tr key={appId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "#f0fdf4",
                                color: "#166534",
                                display: "grid",
                                placeItems: "center",
                                fontSize: "1rem",
                                flexShrink: 0,
                              }}
                            >
                              🚜
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "#0f172a" }}>{app.equipment}</div>
                              <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                                {app.hectares ? `${app.hectares} ha · Per Hectare` : "Per Hectare"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: "0.8rem", color: "#334155" }}>
                          {formatRentalPeriod(app)}
                        </td>
                        <td style={{ padding: "12px 14px", fontSize: "0.78rem", color: "#64748b" }}>
                          {app.farmLocation || "Barangay Farm"}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <StatusBadge application={app} />
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                            <Link to="/applications" style={{ fontSize: "0.76rem", fontWeight: 600, color: "#166534", textDecoration: "none" }}>
                              Details
                            </Link>
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => cancelApplication(app)}
                                disabled={cancellingId === appId}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#dc2626",
                                  fontSize: "0.76rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                {cancellingId === appId ? "Cancelling..." : "Cancel"}
                              </button>
                            )}
                            {isApproved && (
                              <Link to="/applications" style={{ fontSize: "0.74rem", fontWeight: 600, color: "#d97706", textDecoration: "none" }}>
                                Request Cancel
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Machinery Categories, Announcements & Support */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Machinery Categories Quick Access */}
          <div className="wz-card" style={{ margin: 0 }}>
            <div className="wz-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="wz-card-title" style={{ fontSize: "0.96rem", fontWeight: 800, margin: 0 }}>
                Machinery Fleet Categories
              </h3>
              <Link to="/member/book" style={{ fontSize: "0.76rem", fontWeight: 700, color: "#166534", textDecoration: "none" }}>
                Catalog →
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { name: "4WD Farm Tractors", desc: "Heavy land preparation & tilling", icon: "🚜", tag: "Available" },
                { name: "Combine Harvesters", desc: "Grain harvesting & threshing", icon: "🌾", tag: "High Demand" },
                { name: "Rice Transplanters", desc: "Mechanical seedling planting", icon: "🌱", tag: "Available" },
                { name: "Precision Boom Sprayers", desc: "Crop pest control & nutrition", icon: "💦", tag: "Available" },
              ].map((cat) => (
                <Link
                  key={cat.name}
                  to="/member/book"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background: "#f8fafc",
                    border: "1px solid #f1f5f9",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "1.2rem" }}>{cat.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#0f172a" }}>{cat.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{cat.desc}</div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "6px",
                      background: cat.tag === "Available" ? "#dcfce7" : "#fef3c7",
                      color: cat.tag === "Available" ? "#15803d" : "#b45309",
                    }}
                  >
                    {cat.tag}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Announcements & News */}
          <div className="wz-card" style={{ margin: 0 }}>
            <div className="wz-card-header">
              <h3 className="wz-card-title" style={{ fontSize: "0.96rem", fontWeight: 800, margin: 0 }}>
                Cooperative News &amp; Updates
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {corporationEvents.map((evt) => (
                <div key={evt.title} style={{ display: "flex", gap: "12px", alignItems: "start" }}>
                  <img
                    src={evt.image}
                    alt=""
                    style={{
                      width: "54px",
                      height: "54px",
                      borderRadius: "8px",
                      objectFit: "cover",
                      flexShrink: 0,
                      background: "#f1f5f9",
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#ecfdf5", color: "#166534" }}>
                        {evt.tag}
                      </span>
                      <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{evt.date}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#0f172a", lineHeight: 1.3, marginBottom: "2px" }}>
                      {evt.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "#64748b",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {evt.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dispatcher Office Support */}
          <div className="wz-card" style={{ margin: 0, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "#16a34a",
                  color: "#ffffff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "0.9rem",
                }}
              >
                📞
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#14532d" }}>KIMPC Dispatch Office</div>
                <div style={{ fontSize: "0.72rem", color: "#15803d" }}>Machinery scheduling &amp; member assistance</div>
              </div>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: "0.75rem", color: "#166534", lineHeight: 1.4 }}>
              Have questions about your rental slot, field operator assignment, or fuel terms? Contact the cooperative office.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.74rem", color: "#14532d" }}>
              <div><strong>Office:</strong> (088) 555-KIMPC / 0917-000-0000</div>
              <div><strong>Email:</strong> kimpc.system@gmail.com</div>
              <div><strong>Hours:</strong> Mon – Fri: 7:00 AM – 5:00 PM</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
