import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";
import MemberTopbar from "../../components/MemberTopbar";

const filters = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "cancellation", label: "Cancellation Pending" },
  { key: "rejected", label: "Rejected / Cancelled" },
];

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatBookingDateRange(startDate, endDate) {
  if (!startDate) return "—";
  if (!endDate || startDate === endDate) return formatDateDisplay(startDate);
  const d1 = new Date(startDate.includes("T") ? startDate : `${startDate}T00:00:00`);
  const d2 = new Date(endDate.includes("T") ? endDate : `${endDate}T00:00:00`);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return `${startDate} – ${endDate}`;

  const m1 = d1.toLocaleDateString("en-US", { month: "short" });
  const m2 = d2.toLocaleDateString("en-US", { month: "short" });
  const y1 = d1.getFullYear();
  const y2 = d2.getFullYear();

  if (y1 === y2) {
    if (m1 === m2) {
      return `${m1} ${d1.getDate()} – ${d2.getDate()}, ${y1}`;
    }
    return `${m1} ${d1.getDate()} – ${m2} ${d2.getDate()}, ${y1}`;
  }
  return `${m1} ${d1.getDate()}, ${y1} – ${m2} ${d2.getDate()}, ${y2}`;
}

function getDaysCount(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const d1 = new Date(startDate.includes("T") ? startDate : `${startDate}T00:00:00`);
  const d2 = new Date(endDate.includes("T") ? endDate : `${endDate}T00:00:00`);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1;
  const diff = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function getStatusInfo(status, isCancellationRequested) {
  const s = (status || "Pending").toLowerCase();
  if (isCancellationRequested || s === "cancellation requested") {
    return { slug: "cancellation-requested", label: "Cancellation Pending" };
  }
  if (s === "approved") return { slug: "approved", label: "Approved" };
  if (s === "checked-out" || s === "ongoing") return { slug: "ongoing", label: "Ongoing" };
  if (s === "returned") return { slug: "returned", label: "Returned" };
  if (s === "rejected") return { slug: "rejected", label: "Declined" };
  if (s === "cancelled") return { slug: "cancelled", label: "Cancelled" };
  if (s === "voided" || s === "void") return { slug: "voided", label: "Voided" };
  return { slug: "pending", label: "Pending" };
}

function isDateKeyBooked(dayKey, blockedRanges) {
  if (!dayKey || !blockedRanges?.length) return false;
  return blockedRanges.some((range) => {
    const startKey = range.startDate;
    const endKey = range.endDate || startKey;
    return Boolean(startKey && endKey && startKey <= dayKey && endKey >= dayKey);
  });
}

function hasBookedDatesInRange(startKey, endKey, blockedRanges) {
  if (!startKey || !endKey || !blockedRanges?.length) return false;
  if (endKey < startKey) return true;
  const cur = new Date(`${startKey}T00:00:00`);
  const last = new Date(`${endKey}T00:00:00`);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const k = `${y}-${m}-${d}`;
    if (isDateKeyBooked(k, blockedRanges)) return true;
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

/**
 * Synthesizes a comprehensive history timeline for an application.
 * Ensures all lifecycle events are present: Created, Rescheduled, Approved, Dispatched, Returned, Cancelled/Voided, etc.
 */
function getTimelineEvents(app) {
  if (!app) return [];
  const events = [];
  const statusLower = (app.status || "").toLowerCase();

  // 1. Created / Submitted
  if (app.createdAt) {
    events.push({
      event: "created",
      title: "Booking Request Submitted",
      timestamp: new Date(app.createdAt),
      actor: "Member",
      note: `Booking request created for ${app.hectares || 1} hectare${(app.hectares || 1) > 1 ? "s" : ""} (${formatBookingDateRange(app.startDate, app.endDate)}) at ${app.farmLocation || "Member farm"}.`,
    });
  }

  // 2. Reschedules (from rescheduleHistory or explicit dates)
  if (Array.isArray(app.rescheduleHistory) && app.rescheduleHistory.length > 0) {
    app.rescheduleHistory.forEach((r, idx) => {
      events.push({
        event: "rescheduled",
        title: app.rescheduleHistory.length > 1 ? `Booking Rescheduled (#${idx + 1})` : "Booking Rescheduled",
        timestamp: new Date(r.rescheduledAt || app.rescheduledAt || app.updatedAt),
        actor: "Member",
        note: `Rental dates moved from ${formatBookingDateRange(r.previousStartDate, r.previousEndDate)} ➔ ${formatBookingDateRange(r.newStartDate, r.newEndDate)}.${r.reason ? ` Reason: ${r.reason}` : ""}`,
      });
    });
  } else if (app.rescheduledAt) {
    events.push({
      event: "rescheduled",
      title: "Booking Rescheduled",
      timestamp: new Date(app.rescheduledAt),
      actor: "Member",
      note: `Rental schedule updated to ${formatBookingDateRange(app.startDate, app.endDate)}.`,
    });
  }

  // 3. Approved
  const isApprovedStage = ["approved", "checked-out", "ongoing", "returned"].includes(statusLower) || Boolean(app.approvedAt);
  if (isApprovedStage) {
    events.push({
      event: "approved",
      title: "Booking Approved",
      timestamp: new Date(app.approvedAt || app.updatedAt || app.createdAt),
      actor: "Manager",
      note: "Cooperative management approved the booking schedule and confirmed machinery reservation.",
    });
  }

  // 4. Given / Dispatched (Checked-Out)
  const isDispatched = statusLower === "checked-out" || statusLower === "ongoing" || statusLower === "returned" || Boolean(app.dispatchedAt) || Boolean(app.checkoutInspection);
  if (isDispatched) {
    const insp = app.checkoutInspection;
    const inspNote = insp ? ` (Fuel: ${insp.fuelLevel || "100%"}, Odometer: ${insp.odometerHours || 0} hrs)` : "";
    events.push({
      event: "dispatched",
      title: "Machinery Given / Dispatched",
      timestamp: new Date(app.dispatchedAt || insp?.inspectedAt || app.startDate || app.updatedAt),
      actor: "Manager",
      note: `Pre-rental checkout inspection completed.${inspNote} Machinery handed over for field operations. Assigned Driver: ${app.assignedDriver || "Cooperative Operator"}.`,
    });
  }

  // 5. Returned
  const isReturned = statusLower === "returned" || Boolean(app.returnedAt) || Boolean(app.checkinInspection);
  if (isReturned) {
    const insp = app.checkinInspection;
    const inspNote = insp ? ` (Fuel: ${insp.fuelLevel || "100%"}, Odometer: ${insp.odometerHours || 0} hrs, Notes: ${insp.notes || "Clean"})` : "";
    events.push({
      event: "returned",
      title: "Machinery Returned & Inspected",
      timestamp: new Date(app.returnedAt || insp?.inspectedAt || app.endDate || app.updatedAt),
      actor: "Manager",
      note: `Rental completed and machinery returned to cooperative depot.${inspNote}`,
    });
  }

  // 6. Cancellation Requested
  if (app.cancellationRequested || statusLower === "cancellation requested" || app.cancellationRequestedAt) {
    events.push({
      event: "cancellation_requested",
      title: "Cancellation Requested by Member",
      timestamp: new Date(app.cancellationRequestedAt || app.updatedAt),
      actor: "Member",
      note: `Reason: ${app.cancellationReason || "Member requested booking cancellation (Awaiting manager review)"}`,
    });
  }

  // 7. Cancelled or Voided
  if (statusLower === "cancelled" || statusLower === "voided" || app.cancelledAt) {
    const isVoid = statusLower === "voided" || (app.managerRemarks && app.managerRemarks.toLowerCase().includes("void"));
    events.push({
      event: isVoid ? "voided" : "cancelled",
      title: isVoid ? "Booking Voided by Manager" : "Booking Cancelled",
      timestamp: new Date(app.cancelledAt || app.updatedAt),
      actor: isVoid ? "Manager" : "Member",
      note: `Reason: ${app.cancellationReason || app.managerRemarks || "Booking was cancelled."}`,
    });
  }

  // 8. Rejected / Declined
  if (statusLower === "rejected") {
    events.push({
      event: "rejected",
      title: "Booking Request Declined",
      timestamp: new Date(app.updatedAt),
      actor: "Manager",
      note: `Reason: ${app.managerRemarks || "Booking request was declined by management."}`,
    });
  }

  // Merge any items from persisted app.timeline that are not duplicates
  if (Array.isArray(app.timeline)) {
    app.timeline.forEach((item) => {
      const exists = events.some((e) => e.event === item.event && Math.abs(new Date(e.timestamp).getTime() - new Date(item.timestamp).getTime()) < 60000);
      if (!exists && item.title) {
        events.push({
          event: item.event,
          title: item.title,
          timestamp: new Date(item.timestamp),
          actor: item.actor || "System",
          note: item.note || "",
        });
      }
    });
  }

  // Chronological sort
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return events;
}

export default function Applications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [cancellingId, setCancellingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Editing state for Pending bookings
  const [editingApp, setEditingApp] = useState(null);
  const [editForm, setEditForm] = useState({
    farmLocation: "",
    startDate: "",
    endDate: "",
    hectares: 1,
    rescheduleReason: "",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editDateConflict, setEditDateConflict] = useState("");

  // Cancellation Request state for Approved bookings
  const [cancellationRequestApp, setCancellationRequestApp] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);

  // Official Receipt & GCash Screenshot Modal States
  const [receiptApp, setReceiptApp] = useState(null);
  const [previewGcashImage, setPreviewGcashImage] = useState(null);

  const fetchApplications = useCallback(async () => {
    const response = await api(getApplicationsUrl(user?.email));
    if (response.ok) {
      setApplications(unwrapListResponse(response));
      setError("");
    } else {
      setError(response.data?.error || "Could not load your applications.");
    }
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    fetchApplications();
    const interval = window.setInterval(fetchApplications, 12000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  const visibleApplications = useMemo(() => {
    return applications.filter((application) => {
      const status = (application.status || "Pending").toLowerCase();
      const isCancelPending = status === "cancellation requested" || application.cancellationRequested;
      if (filter === "pending") return status === "pending" && !isCancelPending;
      if (filter === "approved") return ["approved", "checked-out", "ongoing", "returned"].includes(status) && !isCancelPending;
      if (filter === "cancellation") return isCancelPending;
      if (filter === "rejected") return ["rejected", "cancelled", "voided"].includes(status);
      return true;
    });
  }, [applications, filter]);

  // Direct cancel for Pending bookings
  const cancelPendingApplication = async (application) => {
    const id = application._id || application.id;
    if (!id || !window.confirm(`Are you sure you want to cancel your pending booking request for "${application.equipment}"?`)) return;

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
      setApplications((current) => current.map((item) => (item._id || item.id) === id ? updatedApplication : item));
    } else {
      fetchApplications();
    }
  };

  // Open Edit Modal for Pending booking
  const handleOpenEdit = (application) => {
    const status = (application.status || "Pending").toLowerCase();
    if (status !== "pending") {
      setActionError("Only pending bookings can be edited. Approved bookings cannot be edited directly.");
      return;
    }
    setEditingApp(application);
    setEditForm({
      farmLocation: application.farmLocation || "",
      startDate: application.startDate || "",
      endDate: application.endDate || "",
      hectares: application.hectares || 1,
      rescheduleReason: "",
    });
    setEditDateConflict("");
    setActionError("");
    setActionSuccess("");
  };

  // Live conflict checking whenever edit dates change
  useEffect(() => {
    if (!editingApp || !editForm.startDate || !editForm.endDate) {
      setEditDateConflict("");
      return;
    }

    if (editForm.endDate < editForm.startDate) {
      setEditDateConflict("End date must be on or after start date.");
      return;
    }

    // Extract other active bookings for this equipment
    const otherBookings = applications.filter((other) => {
      const otherId = other._id || other.id;
      const thisId = editingApp._id || editingApp.id;
      if (otherId === thisId) return false;
      const isSameEq = (other.machineryUnitId && other.machineryUnitId === editingApp.machineryUnitId) ||
                       (other.equipment && other.equipment.toLowerCase() === editingApp.equipment.toLowerCase());
      const isActive = ["approved", "checked-out", "ongoing", "pending"].includes((other.status || "").toLowerCase());
      return isSameEq && isActive;
    }).map((b) => ({ startDate: b.startDate, endDate: b.endDate, label: b.status }));

    if (hasBookedDatesInRange(editForm.startDate, editForm.endDate, otherBookings)) {
      setEditDateConflict(`"${editingApp.equipment}" is already booked on dates in this range. Please choose different dates.`);
    } else {
      setEditDateConflict("");
    }
  }, [editingApp, editForm.startDate, editForm.endDate, applications]);

  // Submit Edit for Pending booking
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingApp) return;
    const id = editingApp._id || editingApp.id;

    if (!editForm.startDate || !editForm.endDate) {
      setActionError("Start date and end date are required.");
      return;
    }
    if (editForm.startDate > editForm.endDate) {
      setActionError("End date must be on or after start date.");
      return;
    }
    if (editDateConflict) {
      setActionError(editDateConflict);
      return;
    }

    setIsSavingEdit(true);
    setActionError("");
    setActionSuccess("");

    const response = await api(`/applications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: {
        farmLocation: editForm.farmLocation.trim(),
        startDate: editForm.startDate,
        endDate: editForm.endDate,
        hectares: Number(editForm.hectares) || 1,
        bookingType: "hectare",
        rescheduleReason: editForm.rescheduleReason.trim() || "Member rescheduled rental dates",
      },
    });

    setIsSavingEdit(false);
    if (!response.ok) {
      setActionError(response.data?.error || "Failed to update booking.");
    } else {
      setActionSuccess("Booking updated and rescheduled successfully.");
      setEditingApp(null);
      fetchApplications();
    }
  };

  // Open Cancellation Request Modal for Approved booking
  const handleOpenCancellationRequest = (application) => {
    setCancellationRequestApp(application);
    setCancellationReason("");
    setActionError("");
    setActionSuccess("");
  };

  // Submit Cancellation Request for Approved booking
  const handleSubmitCancellationRequest = async (e) => {
    e.preventDefault();
    if (!cancellationRequestApp) return;
    const id = cancellationRequestApp._id || cancellationRequestApp.id;

    if (!cancellationReason.trim()) {
      setActionError("Please provide a reason for cancelling this approved booking.");
      return;
    }

    setIsSubmittingCancellation(true);
    setActionError("");
    setActionSuccess("");

    const response = await api(`/applications/${encodeURIComponent(id)}/request-cancellation`, {
      method: "POST",
      body: { reason: cancellationReason.trim() },
    });

    setIsSubmittingCancellation(false);
    if (!response.ok) {
      setActionError(response.data?.error || "Failed to submit cancellation request.");
    } else {
      setActionSuccess("Cancellation request submitted to manager. Awaiting manager approval.");
      setCancellationRequestApp(null);
      fetchApplications();
    }
  };

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", paddingBottom: "40px" }}>
      <MemberTopbar
        title="Your Applications"
        subtitle="Track machinery bookings, inspect lifecycle history timeline, edit pending details, or request cancellations."
      />

      {/* Top Filter and Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div className="member-filter-tabs" role="tablist" aria-label="Filter applications" style={{ margin: 0 }}>
          {filters.map((item) => {
            const count = item.key === "all" ? applications.length : applications.filter((app) => {
              const status = (app.status || "Pending").toLowerCase();
              const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
              if (item.key === "pending") return status === "pending" && !isCancelPending;
              if (item.key === "approved") return ["approved", "checked-out", "ongoing", "returned"].includes(status) && !isCancelPending;
              if (item.key === "cancellation") return isCancelPending;
              return ["rejected", "cancelled", "voided"].includes(status);
            }).length;

            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={filter === item.key}
                className={filter === item.key ? "active" : ""}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>
        <Link
          className="wz-btn wz-btn-secondary"
          to="/member/history"
          title="Booking History"
          aria-label="View Booking History"
          style={{
            borderRadius: "8px",
            textDecoration: "none",
            padding: "8px 16px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "0.85rem",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            color: "#1e293b",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            transition: "all 0.15s ease",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>Booking History</span>
        </Link>
      </div>

      {actionError && (
        <p className="member-form-feedback" role="alert" style={{ color: "#dc2626", background: "#fef2f2", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fecdd3", marginBottom: "14px", fontSize: "0.85rem" }}>
          {actionError}
        </p>
      )}
      {actionSuccess && (
        <p className="member-form-feedback" role="status" style={{ color: "#166534", background: "#f0fdf4", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bbf7d0", marginBottom: "14px", fontSize: "0.85rem" }}>
          {actionSuccess}
        </p>
      )}

      {/* Main Table Container */}
      {loading ? (
        <div className="member-app-table" style={{ background: "#ffffff", borderRadius: "12px", padding: "20px" }}>
          <div className="member-table-skeleton" />
          <div className="member-table-skeleton" />
          <div className="member-table-skeleton" />
        </div>
      ) : error ? (
        <div className="member-empty-state" role="alert" style={{ background: "#ffffff", borderRadius: "12px", padding: "40px 20px" }}>
          <strong>Couldn’t load your applications</strong>
          <p>{error}</p>
          <button className="member-button member-button-outline" type="button" onClick={fetchApplications}>
            Try again
          </button>
        </div>
      ) : visibleApplications.length === 0 ? (
        <div className="member-empty-state" style={{ background: "#ffffff", borderRadius: "12px", padding: "40px 20px", textAlign: "center" }}>
          <span className="member-empty-icon" aria-hidden="true" style={{ fontSize: "2rem", display: "block", marginBottom: "10px" }}>▧</span>
          <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>No applications found in this view</strong>
          <p style={{ color: "#64748b", margin: "6px 0 16px" }}>Submitted equipment booking requests will appear here with complete details and timeline.</p>
          <Link className="member-button member-button-primary" to="/member/book" style={{ display: "inline-block", textDecoration: "none" }}>
            Browse Equipment
          </Link>
        </div>
      ) : (
        <div className="wz-table-responsive" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
          <table className="wz-table wz-bookings-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Booking ID</th>
                <th>Booked Date</th>
                <th>Machinery Model</th>
                <th>Date Start and End</th>
                <th>Driver</th>
                <th>Payment</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleApplications.map((app) => {
                const statusLower = (app.status || "Pending").toLowerCase();
                const isPending = statusLower === "pending";
                const isApproved = statusLower === "approved";
                const isCancelPending = statusLower === "cancellation requested" || app.cancellationRequested;
                const statusInfo = getStatusInfo(app.status, isCancelPending);
                const displayId = app.displayId || (app._id ? `APP-${String(app._id).slice(-6).toUpperCase()}` : "APP-NEW");
                const modelName = app.machineryModel || app.equipment || "Standard Unit";
                const bookedDateStr = app.createdAt ? new Date(app.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recently";
                const dateRangeStr = formatBookingDateRange(app.startDate, app.endDate);
                const days = getDaysCount(app.startDate, app.endDate);
                const totalAmount = app.totalAmount || (app.ratePerHectare || 2500) * (app.hectares || 1);
                const hasDriver = app.assignedDriver && app.assignedDriver !== "Self-Operated";

                return (
                  <tr key={app._id || app.id}>
                    {/* 1. Status */}
                    <td>
                      <span className={`wz-status-pill wz-status-${statusInfo.slug}`}>
                        {statusInfo.label}
                      </span>
                    </td>

                    {/* 2. Booking ID */}
                    <td className="wz-booking-id" style={{ fontWeight: 700, fontFamily: "monospace", color: "#0f172a" }}>
                      {displayId}
                    </td>

                    {/* 3. Booked Date */}
                    <td style={{ color: "#475569", whiteSpace: "nowrap" }}>
                      {bookedDateStr}
                    </td>

                    {/* 4. Machinery Model */}
                    <td>
                      <div className="wz-machinery-cell">
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>{modelName}</span>
                        {app.equipment && modelName !== app.equipment && (
                          <span className="wz-machinery-badge">{app.equipment}</span>
                        )}
                      </div>
                    </td>

                    {/* 5. Date Start and End */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontWeight: 600, color: "#1e293b" }}>{dateRangeStr}</span>
                        <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                          {app.hectares ? `${app.hectares} ha` : "1 ha"} • {days} day{days > 1 ? "s" : ""}
                        </span>
                      </div>
                    </td>

                    {/* 6. Driver */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {hasDriver ? (
                          <div className="wz-driver-icon wz-driver-assigned" title="Driver Assigned">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        ) : (
                          <div className="wz-driver-icon wz-driver-unassigned" title="Self-Operated">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </div>
                        )}
                        <span style={{ fontSize: "0.76rem", color: "#334155", fontWeight: 500 }}>
                          {app.assignedDriver || "Self-Operated"}
                        </span>
                      </div>
                    </td>

                    {/* 7. Payment */}
                    <td>
                      <div className="wz-payment-wrap">
                        <span className="wz-payment-amount">
                          ₱{Number(totalAmount).toLocaleString()}
                        </span>
                        <span className={app.paymentStatus === "Paid" ? "wz-payment-badge-paid" : "wz-payment-badge-pending"}>
                          {app.paymentStatus || "Pending"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "#334155" }}>{app.paymentMethod || "Cash"}</span>
                        {app.paymentMethod === "Cash" && app.cashPaymentOption && (
                          <span style={{ color: "#0284c7", fontWeight: 600 }}>• {app.cashPaymentOption}</span>
                        )}
                        {app.paymentMethod === "GCash" && (
                          app.gcashProof ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewGcashImage(app.gcashProof);
                              }}
                              style={{
                                background: "#ecfdf5",
                                border: "1px solid #a7f3d0",
                                borderRadius: "4px",
                                padding: "1px 6px",
                                color: "#047857",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                              }}
                              title="Click to view uploaded GCash screenshot"
                            >
                              📷 Proof
                            </button>
                          ) : (
                            <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>• Pending Proof</span>
                          )
                        )}
                      </div>
                    </td>

                    {/* 8. Action */}
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <div className="wz-actions-cell" style={{ justifyContent: "center", gap: "6px" }}>
                        {/* View Details & History Timeline */}
                        <button
                          type="button"
                          className="wz-action-icon-btn view"
                          onClick={() => setSelected(app)}
                          title="View all details & lifecycle history timeline"
                          aria-label="View Details"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>

                        {/* View & Download Official Receipt */}
                        {(app.paymentStatus === "Paid" || isApproved) && (
                          <button
                            type="button"
                            className="wz-action-icon-btn"
                            style={{ color: "#059669", background: "#ecfdf5" }}
                            onClick={() => setReceiptApp(app)}
                            title="View & Download Official KIMPC Receipt"
                            aria-label="View Receipt"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                          </button>
                        )}

                        {/* Edit / Reschedule Pending Booking */}
                        {isPending && !isCancelPending && (
                          <button
                            type="button"
                            className="wz-action-icon-btn"
                            style={{ color: "#2563eb", background: "#eff6ff" }}
                            onClick={() => handleOpenEdit(app)}
                            title="Edit farm location, area, or dates"
                            aria-label="Edit Booking"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                        )}

                        {/* Direct Cancel for Pending */}
                        {isPending && !isCancelPending && (
                          <button
                            type="button"
                            className="wz-action-icon-btn"
                            style={{ color: "#dc2626", background: "#fef2f2" }}
                            disabled={cancellingId === (app._id || app.id)}
                            onClick={() => cancelPendingApplication(app)}
                            title="Cancel pending booking request"
                            aria-label="Cancel Booking"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}

                        {/* Request Cancellation for Approved */}
                        {isApproved && !isCancelPending && (
                          <button
                            type="button"
                            className="wz-action-icon-btn"
                            style={{ color: "#d97706", background: "#fffbeb" }}
                            onClick={() => handleOpenCancellationRequest(app)}
                            title="Request manager approval to cancel"
                            aria-label="Request Cancel"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          </button>
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

      {/* ========================================================================= */}
      {/* ======================= View Details & Timeline Modal =================== */}
      {/* ========================================================================= */}
      {selected && (
        <div
          className="member-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="member-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-detail-title"
            style={{ maxWidth: "720px", width: "95%", maxHeight: "90vh", overflowY: "auto" }}
          >
            <button className="member-modal-close" type="button" aria-label="Close details" onClick={() => setSelected(null)}>
              ×
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
              <div>
                <p className="member-eyebrow" style={{ margin: "0 0 4px", letterSpacing: "0.06em", color: "#64748b" }}>
                  BOOKING DETAILS & HISTORY TIMELINE
                </p>
                <h2 id="application-detail-title" style={{ margin: 0, fontSize: "1.35rem", color: "#0f172a" }}>
                  {selected.machineryModel || selected.equipment}
                </h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={`wz-status-pill wz-status-${getStatusInfo(selected.status, selected.cancellationRequested).slug}`}>
                  {getStatusInfo(selected.status, selected.cancellationRequested).label}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px", color: "#334155" }}>
                  {selected.displayId || (selected._id ? `APP-${String(selected._id).slice(-6).toUpperCase()}` : "APP")}
                </span>
              </div>
            </div>

            {/* Core Details Grid */}
            <dl className="member-detail-list" style={{ marginTop: "14px" }}>
              <div>
                <dt>Rental Period</dt>
                <dd>{formatBookingDateRange(selected.startDate, selected.endDate)} ({getDaysCount(selected.startDate, selected.endDate)} days)</dd>
              </div>
              <div>
                <dt>Submitted On</dt>
                <dd>{selected.createdAt ? new Date(selected.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Recently"}</dd>
              </div>
              <div>
                <dt>Farm Location</dt>
                <dd>{selected.farmLocation || "Not specified"}</dd>
              </div>
              <div>
                <dt>Farm Area</dt>
                <dd>{selected.hectares ? `${selected.hectares} hectare${selected.hectares > 1 ? "s" : ""}` : "1 hectare"}</dd>
              </div>
              <div>
                <dt>Client Phone</dt>
                <dd>{selected.farmerPhone || selected.memberPhone || selected.clientPhone || "—"}</dd>
              </div>
              <div>
                <dt>Assigned Driver</dt>
                <dd>{selected.assignedDriver || "Self-Operated"}{selected.driverPhone ? ` (${selected.driverPhone})` : ""}</dd>
              </div>
              <div>
                <dt>Total Payment</dt>
                <dd style={{ fontWeight: 700, color: "#166534" }}>
                  ₱{Number(selected.totalAmount || (selected.ratePerHectare || 2500) * (selected.hectares || 1)).toLocaleString()}
                  <span style={{ fontSize: "0.78rem", fontWeight: 500, color: "#64748b", marginLeft: "6px" }}>
                    ({selected.paymentStatus || "Pending"} • {selected.paymentMethod || "Cash"})
                  </span>
                </dd>
              </div>
              <div>
                <dt>Payment Mode &amp; Timing</dt>
                <dd>
                  {selected.paymentMethod === "GCash" ? (
                    <span style={{ color: "#0284c7", fontWeight: 600 }}>GCash (0926 463 8983 - KIMPC)</span>
                  ) : (
                    <span>Cash • {selected.cashPaymentOption === "Upon Return" ? "Upon Return" : "Upon Pickup"}</span>
                  )}
                </dd>
              </div>
              {selected.paymentMethod === "GCash" && (
                <div style={{ gridColumn: "1 / -1", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 14px" }}>
                  <dt style={{ color: "#334155", marginBottom: "6px" }}>GCash Payment Proof Screenshot</dt>
                  <dd>
                    {selected.gcashProof ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <img
                          src={selected.gcashProof}
                          alt="GCash Screenshot"
                          onClick={() => setPreviewGcashImage(selected.gcashProof)}
                          style={{ width: "65px", height: "65px", objectFit: "cover", borderRadius: "6px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                        />
                        <div>
                          <p style={{ margin: "0 0 4px", fontSize: "0.8rem", color: "#059669", fontWeight: 600 }}>✓ Screenshot Uploaded</p>
                          <button
                            type="button"
                            onClick={() => setPreviewGcashImage(selected.gcashProof)}
                            style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "3px 8px", fontSize: "0.72rem", cursor: "pointer" }}
                          >
                            Click to View Screenshot
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "#f59e0b" }}>No GCash screenshot uploaded.</span>
                    )}
                  </dd>
                </div>
              )}
              {selected.cancellationReason && (
                <div style={{ gridColumn: "1 / -1", background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "8px", padding: "8px 12px" }}>
                  <dt style={{ color: "#b45309" }}>Cancellation Reason</dt>
                  <dd style={{ color: "#92400e", fontWeight: 500 }}>{selected.cancellationReason}</dd>
                </div>
              )}
              {selected.managerRemarks && (
                <div style={{ gridColumn: "1 / -1", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "8px 12px" }}>
                  <dt style={{ color: "#475569" }}>Manager Remarks</dt>
                  <dd style={{ color: "#0f172a" }}>{selected.managerRemarks}</dd>
                </div>
              )}
            </dl>

            {/* Visual History Timeline */}
            <div className="app-timeline-container">
              <div className="app-timeline-header">
                <h3 className="app-timeline-header-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Booking History & Lifecycle Timeline</span>
                </h3>
                <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>
                  {getTimelineEvents(selected).length} Event{getTimelineEvents(selected).length !== 1 ? "s" : ""}
                </span>
              </div>

              <ul className="app-timeline-list">
                {getTimelineEvents(selected).map((evt, idx) => (
                  <li key={`${evt.event}-${idx}`} className="app-timeline-item">
                    <div className={`app-timeline-node node-${evt.event}`}>
                      {evt.event === "created" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                      )}
                      {evt.event === "rescheduled" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      )}
                      {evt.event === "approved" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {evt.event === "dispatched" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="1" y="3" width="15" height="13" />
                          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                          <circle cx="5.5" cy="18.5" r="2.5" />
                          <circle cx="18.5" cy="18.5" r="2.5" />
                        </svg>
                      )}
                      {evt.event === "returned" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      )}
                      {evt.event === "cancellation_requested" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                      {(evt.event === "cancelled" || evt.event === "voided" || evt.event === "cancellation_granted") && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                      {(evt.event === "rejected" || evt.event === "cancellation_declined") && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                      )}
                    </div>

                    <div className="app-timeline-card">
                      <div className="app-timeline-card-header">
                        <div>
                          <span className="app-timeline-item-title">{evt.title}</span>
                          {evt.actor && <span className="app-timeline-actor">{evt.actor}</span>}
                        </div>
                        <span className="app-timeline-item-time">
                          {evt.timestamp ? new Date(evt.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                        </span>
                      </div>
                      {evt.note && <p className="app-timeline-item-note">{evt.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Modal Actions */}
            <div style={{ marginTop: "20px", display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {(selected.status || "Pending").toLowerCase() === "pending" && !selected.cancellationRequested && (
                <>
                  <button
                    className="member-button member-button-outline"
                    type="button"
                    style={{ color: "#dc2626", borderColor: "#fecdd3" }}
                    onClick={() => {
                      const app = selected;
                      setSelected(null);
                      cancelPendingApplication(app);
                    }}
                  >
                    Cancel Booking
                  </button>
                  <button
                    className="member-button member-button-primary"
                    type="button"
                    onClick={() => {
                      const app = selected;
                      setSelected(null);
                      handleOpenEdit(app);
                    }}
                  >
                    Edit / Reschedule
                  </button>
                </>
              )}

              {(selected.paymentStatus === "Paid" || (selected.status || "").toLowerCase() === "approved") && (
                <button
                  className="member-button"
                  style={{ background: "#059669", color: "#ffffff", border: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  type="button"
                  onClick={() => {
                    const app = selected;
                    setReceiptApp(app);
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  View &amp; Download Receipt
                </button>
              )}

              {(selected.status || "").toLowerCase() === "approved" && !selected.cancellationRequested && (
                <button
                  className="member-button member-button-outline"
                  type="button"
                  style={{ color: "#d97706", borderColor: "#fde68a" }}
                  onClick={() => {
                    const app = selected;
                    setSelected(null);
                    handleOpenCancellationRequest(app);
                  }}
                >
                  Request Cancellation
                </button>
              )}

              <button className="member-button member-button-outline" type="button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===================== Edit / Reschedule Pending Booking ================== */}
      {/* ========================================================================= */}
      {editingApp && (
        <div
          className="member-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingApp(null);
          }}
        >
          <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="edit-booking-title" style={{ maxWidth: "560px", width: "95%" }}>
            <button className="member-modal-close" type="button" aria-label="Close edit" onClick={() => setEditingApp(null)}>
              ×
            </button>
            <p className="member-eyebrow" style={{ color: "#2563eb", margin: "0 0 4px" }}>EDIT / RESCHEDULE PENDING BOOKING</p>
            <h2 id="edit-booking-title" style={{ margin: "0 0 8px", fontSize: "1.25rem", color: "#0f172a" }}>
              {editingApp.machineryModel || editingApp.equipment}
            </h2>
            <p className="member-muted" style={{ fontSize: "0.82rem", marginBottom: "16px", color: "#64748b" }}>
              Update your farm location, area, or rental dates while this booking is still Pending. Changes will be saved and recorded to the history timeline.
            </p>

            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                  Farm Location / Landmark
                </label>
                <input
                  type="text"
                  maxLength={240}
                  required
                  placeholder="e.g. Purok 3, Barangay 4, Malaybalay City"
                  value={editForm.farmLocation}
                  onChange={(e) => setEditForm({ ...editForm, farmLocation: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: editDateConflict ? "2px solid #ef4444" : "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    min={editForm.startDate}
                    value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: editDateConflict ? "2px solid #ef4444" : "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                    }}
                  />
                </div>
              </div>

              {/* Date Conflict Notice */}
              {editDateConflict && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecdd3", color: "#dc2626", borderRadius: "8px", padding: "10px 12px", fontSize: "0.82rem", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>⚠️</span>
                  <span>{editDateConflict}</span>
                </div>
              )}

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                  Farm Area (Hectares)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={editForm.hectares}
                    onChange={(e) => setEditForm({ ...editForm, hectares: parseFloat(e.target.value) || 0.1 })}
                    style={{ width: "160px", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem", fontWeight: 700 }}
                  />
                  <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                    hectares (₱{Number(Math.round((editingApp.ratePerHectare || 2500) * (editForm.hectares || 1))).toLocaleString()} est.)
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                  Reason for Rescheduling / Modification (Optional)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="e.g. Weather delay, adjusting harvest prep..."
                  value={editForm.rescheduleReason}
                  onChange={(e) => setEditForm({ ...editForm, rescheduleReason: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="member-button member-button-outline"
                  onClick={() => setEditingApp(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || Boolean(editDateConflict)}
                  className="member-button member-button-primary"
                >
                  {isSavingEdit ? "Saving Changes…" : "Save Changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ============ Request Cancellation Modal (for Approved bookings) ========= */}
      {/* ========================================================================= */}
      {cancellationRequestApp && (
        <div
          className="member-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCancellationRequestApp(null);
          }}
        >
          <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title" style={{ maxWidth: "540px", width: "95%" }}>
            <button className="member-modal-close" type="button" aria-label="Close request" onClick={() => setCancellationRequestApp(null)}>
              ×
            </button>
            <p className="member-eyebrow" style={{ color: "#d97706", margin: "0 0 4px" }}>REQUEST CANCELLATION</p>
            <h2 id="cancel-booking-title" style={{ margin: "0 0 8px", fontSize: "1.25rem", color: "#0f172a" }}>
              {cancellationRequestApp.machineryModel || cancellationRequestApp.equipment}
            </h2>

            <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "0.84rem", color: "#92400e" }}>
              ⚠️ <strong>Manager Approval Required:</strong> Because this booking was already approved by cooperative management, your cancellation request will be submitted to the manager to review and grant.
            </div>

            <form onSubmit={handleSubmitCancellationRequest}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                  Reason for Cancellation
                </label>
                <textarea
                  required
                  rows="3"
                  maxLength={500}
                  placeholder="Please describe why you need to cancel this approved booking (e.g. weather delay, field condition, change of harvest plan)..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="member-button member-button-outline"
                  onClick={() => setCancellationRequestApp(null)}
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancellation}
                  className="member-button"
                  style={{ background: "#dc2626", color: "#ffffff", border: "none" }}
                >
                  {isSubmittingCancellation ? "Submitting Request…" : "Submit Cancellation Request"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ================= Official Cooperative Receipt Modal ==================== */}
      {/* ========================================================================= */}
      {receiptApp && (
        <div
          className="member-modal-backdrop wz-receipt-print-backdrop"
          role="presentation"
          onClick={() => setReceiptApp(null)}
          style={{ background: "rgba(15, 23, 42, 0.75)", zIndex: 9999 }}
        >
          <div
            className="wz-receipt-voucher-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "28px",
              maxWidth: "680px",
              width: "95%",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
              position: "relative",
            }}
          >
            {/* Modal Close Icon */}
            <button
              type="button"
              onClick={() => setReceiptApp(null)}
              className="no-print"
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "#f1f5f9",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                cursor: "pointer",
                fontSize: "1rem",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>

            {/* Official KIMPC Header */}
            <div style={{ textAlign: "center", borderBottom: "2px solid #0f172a", paddingBottom: "16px", marginBottom: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "4px" }}>
                <span style={{ fontSize: "1.6rem" }}>🚜</span>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "900", color: "#0f172a", letterSpacing: "0.5px" }}>
                  KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE
                </h3>
              </div>
              <p style={{ margin: "2px 0", fontSize: "0.78rem", color: "#475569" }}>
                CDA Registration No. 9520-10012480 • Kalilangan, Bukidnon, Philippines
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", fontWeight: "700", color: "#059669", textTransform: "uppercase", letterSpacing: "1px" }}>
                Official Machinery Rental Billing Voucher &amp; Receipt
              </p>
            </div>

            {/* Receipt Top Meta Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", background: "#f8fafc", padding: "14px 16px", borderRadius: "10px", marginBottom: "18px", border: "1px solid #e2e8f0" }}>
              <div>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Billed To Member</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.95rem" }}>
                  {receiptApp.memberName || user?.fullName || "Cooperative Member"}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "2px" }}>
                  📞 {receiptApp.farmerPhone || receiptApp.memberPhone || user?.phone || "—"}
                </div>
                <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                  ✉️ {receiptApp.memberEmail || user?.email}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Receipt Voucher No.</span>
                <div style={{ fontFamily: "monospace", fontWeight: 900, color: "#0f172a", fontSize: "1.1rem" }}>
                  {receiptApp.receiptNo || `REC-2026-${String(receiptApp._id || "1001").slice(-4).toUpperCase()}`}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "2px" }}>
                  Booking ID: <strong>{receiptApp.displayId || `APP-${String(receiptApp._id || "").slice(-6).toUpperCase()}`}</strong>
                </div>
                <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                  Date: {receiptApp.createdAt ? new Date(receiptApp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : new Date().toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Rental Breakdown Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "18px", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", borderRadius: "6px 0 0 0" }}>Equipment &amp; Specifications</th>
                  <th style={{ padding: "10px 12px" }}>Area / Terms</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", borderRadius: "0 6px 0 0" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "12px" }}>
                    <strong style={{ color: "#0f172a", display: "block" }}>{receiptApp.machineryModel || receiptApp.equipment}</strong>
                    <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                      Rental Duration: {formatBookingDateRange(receiptApp.startDate, receiptApp.endDate)} ({getDaysCount(receiptApp.startDate, receiptApp.endDate)} days)
                    </span>
                  </td>
                  <td style={{ padding: "12px", color: "#334155" }}>
                    {receiptApp.hectares ? `${receiptApp.hectares} ha` : "1 ha"} @ ₱{Number(receiptApp.ratePerHectare || 2500).toLocaleString()}/ha
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                    ₱{Number(receiptApp.totalAmount || (receiptApp.ratePerHectare || 2500) * (receiptApp.hectares || 1)).toLocaleString()}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px", color: "#475569" }}>
                    Assigned Field Operator / Driver
                    <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                      {receiptApp.assignedDriver && receiptApp.assignedDriver !== "Self-Operated" ? receiptApp.assignedDriver : "Self-Operated by Member"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#64748b" }}>Coop Service</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669" }}>₱0.00</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px", color: "#475569" }}>Maintenance &amp; Fuel Inspection Guarantee</td>
                  <td style={{ padding: "10px 12px", color: "#64748b" }}>Coop Benefit</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669" }}>₱0.00</td>
                </tr>
                <tr style={{ borderBottom: "2px solid #0f172a" }}>
                  <td style={{ padding: "10px 12px", color: "#475569" }}>CDA RA 9520 Member Tax Exemption</td>
                  <td style={{ padding: "10px 12px", color: "#64748b" }}>Tax Exempt</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669" }}>₱0.00</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2" style={{ padding: "14px 12px", fontWeight: 800, fontSize: "0.98rem", color: "#0f172a" }}>
                    Total Rental Payable:
                  </td>
                  <td style={{ padding: "14px 12px", textAlign: "right", fontWeight: 900, fontSize: "1.15rem", color: "#059669" }}>
                    ₱{Number(receiptApp.totalAmount || (receiptApp.ratePerHectare || 2500) * (receiptApp.hectares || 1)).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Payment Method & Verified Stamp Strip */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", padding: "12px 16px", background: receiptApp.paymentStatus === "Paid" ? "#f0fdf4" : "#fffbeb", border: `1px solid ${receiptApp.paymentStatus === "Paid" ? "#bbf7d0" : "#fef3c7"}`, borderRadius: "10px", marginBottom: "18px" }}>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Payment Method:</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.9rem", marginTop: "2px" }}>
                  {receiptApp.paymentMethod === "GCash" ? "GCash (Account: 0926 463 8983 - Kalilangan Irrigators MPC)" : `Cash (${receiptApp.cashPaymentOption === "Upon Return" ? "Upon Return" : "Upon Pickup"})`}
                </div>
              </div>

              <div>
                {receiptApp.paymentStatus === "Paid" ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#059669", color: "#ffffff", padding: "6px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.5px" }}>
                    <span>✓</span> PAID &amp; SETTLED
                  </div>
                ) : (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#d97706", color: "#ffffff", padding: "6px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.5px" }}>
                    <span>⏳</span> AWAITING SETTLEMENT
                  </div>
                )}
              </div>
            </div>

            {/* Official Cooperative Signoff */}
            <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "14px", fontSize: "0.75rem", color: "#64748b" }}>
              <div>
                <p style={{ margin: "0 0 2px", fontWeight: 600, color: "#334155" }}>✓ Digitally Authorized by KIMPC Fleet Dispatch</p>
                <p style={{ margin: 0 }}>Official electronic copy pursuant to CDA &amp; RA 9520 regulations.</p>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "cursive", fontSize: "1.1rem", color: "#0f172a", fontWeight: 700 }}>KIMPC Administration</div>
                <div style={{ borderTop: "1px solid #94a3b8", width: "160px", marginTop: "4px", paddingTop: "2px" }}>Authorized Officer</div>
              </div>
            </div>

            {/* Print / Download & Close Buttons */}
            <div className="no-print" style={{ marginTop: "22px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="member-button member-button-outline"
                onClick={() => setReceiptApp(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="member-button"
                style={{ background: "#0f172a", color: "#ffffff", border: "none", display: "inline-flex", alignItems: "center", gap: "8px" }}
                onClick={() => window.print()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print / Download PDF Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ================== GCash Screenshot Lightbox Modal ====================== */}
      {/* ========================================================================= */}
      {previewGcashImage && (
        <div
          className="member-modal-backdrop"
          role="presentation"
          onClick={() => setPreviewGcashImage(null)}
          style={{ background: "rgba(15, 23, 42, 0.85)", zIndex: 10000 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "20px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <strong style={{ fontSize: "1rem", color: "#0f172a" }}>📱 GCash Payment Screenshot Proof</strong>
              <button
                type="button"
                onClick={() => setPreviewGcashImage(null)}
                style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
            <img
              src={previewGcashImage}
              alt="Uploaded GCash Screenshot"
              style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: "8px", border: "1px solid #cbd5e1" }}
            />
            <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPreviewGcashImage(null)}
                className="member-button member-button-outline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
