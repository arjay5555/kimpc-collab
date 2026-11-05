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
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected / Cancelled" },
];

const CANCELLATION_REASONS = [
  "Weather conditions / Heavy rain or wet soil",
  "Change of farming schedule or harvest timing",
  "Found alternative machinery / equipment",
  "Equipment no longer needed",
  "Financial or budget constraints",
  "Personal or family emergency",
  "Other",
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
  if (s === "returned" || s === "completed") return { slug: "completed", label: "Completed" };
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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [cancellingId, setCancellingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Modal active view tab: 'details' | 'timeline' | 'edit' | 'cancel'
  const [viewModalTab, setViewModalTab] = useState("details");

  // Machinery units image lookup map
  const [machineryUnitsMap, setMachineryUnitsMap] = useState(new Map());

  // Inline Editing state for selected booking
  const [editForm, setEditForm] = useState({
    farmLocation: "",
    startDate: "",
    endDate: "",
    hectares: 1,
    rescheduleReason: "",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Cancellation reason state (dropdown selection + optional custom text for 'Other')
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);

  // GCash Screenshot Lightbox Modal State
  const [previewGcashImage, setPreviewGcashImage] = useState(null);

  const fetchApplications = useCallback(async () => {
    const [response, unitsRes] = await Promise.all([
      api(getApplicationsUrl(user?.email)),
      api("/machinery-units"),
    ]);
    if (response.ok) {
      setApplications(unwrapListResponse(response));
      setError("");
    } else {
      setError(response.data?.error || "Could not load your bookings.");
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
      if (filter === "pending" && (status !== "pending" || isCancelPending)) return false;
      if (filter === "approved" && (!["approved", "checked-out", "ongoing"].includes(status) || isCancelPending)) return false;
      if (filter === "completed" && !(status === "returned" || status === "completed")) return false;
      if (filter === "rejected" && (!["rejected", "cancelled", "voided"].includes(status) && !isCancelPending)) return false;

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const displayId = (application.displayId || (application._id ? `APP-${String(application._id).slice(-6)}` : "")).toLowerCase();
        const machinery = (application.machineryModel || application.equipment || "").toLowerCase();
        const driver = (application.driverName || application.driverOption || "").toLowerCase();
        const location = (application.farmLocation || "").toLowerCase();
        const payment = (application.paymentMethod || "").toLowerCase();
        const statusText = status;
        const matches =
          displayId.includes(q) ||
          machinery.includes(q) ||
          driver.includes(q) ||
          location.includes(q) ||
          payment.includes(q) ||
          statusText.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [applications, filter, search]);

  // Open Unified View Modal
  const handleOpenViewModal = (app) => {
    setSelected(app);
    setViewModalTab("details");
    setEditForm({
      farmLocation: app.farmLocation || "",
      startDate: app.startDate || "",
      endDate: app.endDate || "",
      hectares: app.hectares || 1,
      rescheduleReason: "",
    });
    setSelectedCancelReason("");
    setCustomCancelReason("");
    setActionError("");
    setActionSuccess("");
  };

  // Live conflict checking for inline edit
  const editDateConflict = useMemo(() => {
    if (!selected || viewModalTab !== "edit" || !editForm.startDate || !editForm.endDate) {
      return "";
    }
    if (editForm.endDate < editForm.startDate) {
      return "End date must be on or after start date.";
    }

    const otherBookings = applications
      .filter((other) => {
        const otherId = other._id || other.id;
        const thisId = selected._id || selected.id;
        if (otherId === thisId) return false;
        const isSameEq =
          (other.machineryUnitId && other.machineryUnitId === selected.machineryUnitId) ||
          (other.equipment && other.equipment.toLowerCase() === (selected.equipment || "").toLowerCase());
        const isActive = ["approved", "checked-out", "ongoing", "pending"].includes((other.status || "").toLowerCase());
        return isSameEq && isActive;
      })
      .map((b) => ({ startDate: b.startDate, endDate: b.endDate, label: b.status }));

    if (hasBookedDatesInRange(editForm.startDate, editForm.endDate, otherBookings)) {
      return `"${selected.equipment}" is already booked on dates in this range. Please choose different dates.`;
    }
    return "";
  }, [selected, viewModalTab, editForm.startDate, editForm.endDate, applications]);

  // Inline Save Edit for Pending booking
  const handleInlineSaveEdit = async () => {
    if (!selected) return;
    const id = selected._id || selected.id;

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
      const updated = response.data?.application;
      if (updated) {
        setSelected(updated);
        setApplications((prev) => prev.map((item) => ((item._id || item.id) === id ? updated : item)));
      } else {
        fetchApplications();
      }
      setViewModalTab("details");
    }
  };

  // Inline Cancel Booking / Submit Cancellation
  const handleInlineConfirmCancel = async () => {
    if (!selected) return;
    const id = selected._id || selected.id;
    const isPending = (selected.status || "Pending").toLowerCase() === "pending";

    if (!selectedCancelReason) {
      setActionError("Please select a reason for cancelling this booking.");
      return;
    }
    if (selectedCancelReason === "Other" && !customCancelReason.trim()) {
      setActionError("Please state your specific reason for cancellation.");
      return;
    }

    const finalReason = selectedCancelReason === "Other" ? customCancelReason.trim() : selectedCancelReason;

    if (isPending) {
      setCancellingId(id);
      setActionError("");
      setActionSuccess("");
      const response = await api(`/applications/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: { reason: finalReason },
      });
      setCancellingId("");
      if (!response.ok) {
        setActionError(response.data?.error || "Could not cancel this booking request.");
        return;
      }
      setActionSuccess("Booking request cancelled successfully.");
      setSelected(null);
      fetchApplications();
    } else {
      setIsSubmittingCancellation(true);
      setActionError("");
      setActionSuccess("");
      const response = await api(`/applications/${encodeURIComponent(id)}/request-cancellation`, {
        method: "POST",
        body: { reason: finalReason },
      });
      setIsSubmittingCancellation(false);
      if (!response.ok) {
        setActionError(response.data?.error || "Failed to submit cancellation request.");
      } else {
        setActionSuccess("Cancellation request submitted to manager. Awaiting manager approval.");
        setSelected(null);
        fetchApplications();
      }
    }
  };

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", paddingBottom: "40px" }}>
      <MemberTopbar
        title="My Bookings"
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search bookings, machinery, driver..."
      />

      {/* Top Filter Bar (No outside history icon) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div className="member-filter-tabs" role="tablist" aria-label="Filter bookings" style={{ margin: 0 }}>
          {filters.map((item) => {
            const count = item.key === "all" ? applications.length : applications.filter((app) => {
              const status = (app.status || "Pending").toLowerCase();
              const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
              if (item.key === "pending") return status === "pending" && !isCancelPending;
              if (item.key === "approved") return ["approved", "checked-out", "ongoing"].includes(status) && !isCancelPending;
              if (item.key === "completed") return status === "returned" || status === "completed";
              return ["rejected", "cancelled", "voided"].includes(status) || isCancelPending;
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
          <strong>Couldn’t load your bookings</strong>
          <p>{error}</p>
          <button className="member-button member-button-outline" type="button" onClick={fetchApplications}>
            Try again
          </button>
        </div>
      ) : visibleApplications.length === 0 ? (
        <div className="member-empty-state" style={{ background: "#ffffff", borderRadius: "12px", padding: "40px 20px", textAlign: "center" }}>
          <span className="member-empty-icon" aria-hidden="true" style={{ fontSize: "2rem", display: "block", marginBottom: "10px" }}>▧</span>
          <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
            {search.trim() ? "No bookings match your search" : "No bookings found in this view"}
          </strong>
          <p style={{ color: "#64748b", margin: "6px 0 16px" }}>
            {search.trim()
              ? `No bookings found for "${search}". Try searching for a different keyword or clear the search.`
              : "Submitted equipment booking requests will appear here with complete details and timeline."}
          </p>
          {search.trim() ? (
            <button
              type="button"
              className="member-button member-button-outline"
              onClick={() => setSearch("")}
            >
              Clear Search
            </button>
          ) : (
            <Link className="member-button member-button-primary" to="/member/book" style={{ display: "inline-block", textDecoration: "none" }}>
              Browse Machinery
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="wz-table-responsive member-desktop-only" style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto" }}>
          <table className="wz-table wz-bookings-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Booking ID</th>
                <th>Booked Date</th>
                <th>Machinery Model</th>
                <th>Rental Schedule</th>
                <th>Driver</th>
                <th>Payment</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleApplications.map((app) => {
                const statusInfo = getStatusInfo(app.status, app.cancellationRequested);
                const displayId = app.displayId || (app._id ? `APP-${String(app._id).slice(-6).toUpperCase()}` : "APP");
                const modelName = app.machineryModel || app.equipment;
                const bookedDateStr = formatDateDisplay(app.createdAt);
                const dateRangeStr = formatBookingDateRange(app.startDate, app.endDate);
                const days = getDaysCount(app.startDate, app.endDate);
                const totalAmount = app.totalAmount || (app.ratePerHectare || 2500) * (app.hectares || 1);

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

                    {/* 6. Driver (Clean text without X or check icon) */}
                    <td>
                      <span style={{ fontSize: "0.76rem", color: "#334155", fontWeight: 500 }}>
                        {app.assignedDriver || "Self-Operated"}
                      </span>
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
                      <div style={{ fontSize: "0.74rem", marginTop: "4px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                        {app.paymentMethod === "GCash" ? (
                          <>
                            <span style={{ fontWeight: 700, color: "#0284c7" }}>GCash</span>
                            {app.gcashProof ? (
                              <button
                                type="button"
                                onClick={() => setPreviewGcashImage(app.gcashProof)}
                                style={{
                                  background: "#eff6ff",
                                  border: "1px solid #bfdbfe",
                                  borderRadius: "4px",
                                  padding: "1px 6px",
                                  color: "#1d4ed8",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                }}
                                title="Click to view uploaded GCash screenshot"
                              >
                                Proof
                              </button>
                            ) : (
                              <span style={{ color: "#d97706", fontSize: "0.7rem", fontWeight: 600 }}>• Pending Proof</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span style={{ fontWeight: 700, color: "#166534" }}>Cash</span>
                            {app.cashPaymentOption && (
                              <span
                                style={{
                                  color: app.cashPaymentOption === "Upon Return" ? "#d97706" : "#0284c7",
                                  fontWeight: 700,
                                }}
                              >
                                • {app.cashPaymentOption}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* 8. Action (Single Icon: View Details, Edit & Cancel) */}
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <div className="wz-actions-cell" style={{ justifyContent: "center" }}>
                        <button
                          type="button"
                          className="wz-action-icon-btn view"
                          onClick={() => handleOpenViewModal(app)}
                          title="View booking details, timeline, edit or cancel"
                          aria-label="View Details"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Phone Card View (Visible only on phone screens <= 768px) */}
        <div className="member-mobile-bookings-list member-mobile-only" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {visibleApplications.map((app) => {
            const statusInfo = getStatusInfo(app.status, app.cancellationRequested);
            const displayId = app.displayId || (app._id ? `APP-${String(app._id).slice(-6).toUpperCase()}` : "APP");
            const modelName = app.machineryModel || app.equipment;
            const dateRangeStr = formatBookingDateRange(app.startDate, app.endDate);
            const days = getDaysCount(app.startDate, app.endDate);
            const totalAmount = app.totalAmount || (app.ratePerHectare || 2500) * (app.hectares || 1);
            const isPaid = (app.paymentStatus || "").toLowerCase() === "paid" || (app.paymentStatus || "").toLowerCase() === "settled";

            return (
              <div
                key={app._id || app.id}
                style={{
                  background: "#ffffff",
                  borderRadius: "14px",
                  border: "1px solid #e2e8f0",
                  padding: "16px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                {/* Top Bar: Booking ID + Status Badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>
                    {displayId}
                  </span>
                  <span className={`wz-status-pill wz-status-${statusInfo.slug}`} style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: "999px" }}>
                    {statusInfo.label}
                  </span>
                </div>

                {/* Machinery Image & Info */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <img
                    src={
                      app.imageUrl ||
                      machineryUnitsMap.get(app.machineryUnitId) ||
                      machineryUnitsMap.get(app.equipment) ||
                      "/images/kimpc logo.png"
                    }
                    alt={modelName}
                    style={{
                      width: "54px",
                      height: "54px",
                      borderRadius: "10px",
                      objectFit: "cover",
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      e.currentTarget.src = "/images/kimpc logo.png";
                      e.currentTarget.style.objectFit = "contain";
                    }}
                  />
                  <div>
                    <strong style={{ fontSize: "0.98rem", color: "#0f172a", display: "block" }}>
                      {modelName}
                    </strong>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      {app.hectares ? `${app.hectares} hectare${app.hectares > 1 ? "s" : ""}` : "1 hectare"} • {app.farmLocation || "Kalilangan"}
                    </span>
                  </div>
                </div>

                {/* Details Card Strip */}
                <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", fontSize: "0.82rem", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Schedule:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{dateRangeStr} ({days}d)</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Driver:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>
                      {app.driverName || (app.driverOption === "With Cooperative Driver" ? "Coop Driver Assigned" : "Self-Operated / Own Driver")}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Estimated Total:</span>
                    <span style={{ fontWeight: 800, color: "#166534" }}>₱{Number(totalAmount).toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#64748b" }}>Payment:</span>
                    <span
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        color: isPaid ? "#15803d" : "#b45309",
                        background: isPaid ? "#dcfce7" : "#fef3c7",
                        padding: "2px 8px",
                        borderRadius: "6px",
                      }}
                    >
                      {isPaid ? "Paid" : "Pending"} ({app.paymentMethod || "Cash"})
                    </span>
                  </div>
                </div>

                {/* Tap to View Details / Actions */}
                <button
                  type="button"
                  onClick={() => handleOpenViewModal(app)}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "8px",
                    color: "#166534",
                    fontWeight: 700,
                    fontSize: "0.84rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    cursor: "pointer",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>View Details, History &amp; Actions</span>
                </button>
              </div>
            );
          })}
        </div>
      </>
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
          style={{ zIndex: 10001 }}
        >
          <section
            className="member-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-detail-title"
            style={{ maxWidth: "720px", width: "95%", maxHeight: "90vh", overflowY: "auto", position: "relative" }}
          >
            {/* Header: Title & Sleek Circular Close Button */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "14px",
              }}
            >
              <div>
                <p
                  className="member-eyebrow"
                  style={{
                    margin: "0 0 4px",
                    letterSpacing: "0.06em",
                    color: "#64748b",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  {selected.displayId || (selected._id ? `BK-${String(selected._id).slice(-4).toUpperCase()}` : "BOOKING DETAILS")}
                </p>
                <h2
                  id="application-detail-title"
                  style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}
                >
                  {selected.machineryModel || selected.equipment}
                </h2>
              </div>

              <button
                type="button"
                aria-label="Close details"
                onClick={() => setSelected(null)}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "50%",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#64748b",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#fee2e2";
                  e.currentTarget.style.color = "#dc2626";
                  e.currentTarget.style.borderColor = "#fecdd3";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#f8fafc";
                  e.currentTarget.style.color = "#64748b";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }}
              >
                ✕
              </button>
            </div>

            {/* Clean Segmented Tab Strip */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                padding: "4px",
                background: "#f1f5f9",
                borderRadius: "10px",
                marginBottom: "18px",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
              }}
            >
              {/* Tab 1: Details */}
              <button
                type="button"
                onClick={() => setViewModalTab("details")}
                style={{
                  flex: "1 0 auto",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "7px",
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: viewModalTab === "details" ? "#ffffff" : "transparent",
                  color: viewModalTab === "details" ? "#0f172a" : "#64748b",
                  boxShadow: viewModalTab === "details" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>Details</span>
              </button>

              {/* Tab 2: Timeline */}
              <button
                type="button"
                onClick={() => setViewModalTab("timeline")}
                style={{
                  flex: "1 0 auto",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "7px",
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: viewModalTab === "timeline" ? "#ffffff" : "transparent",
                  color: viewModalTab === "timeline" ? "#15803d" : "#64748b",
                  boxShadow: viewModalTab === "timeline" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>Timeline</span>
              </button>

              {/* Tab 3: Edit (only if Pending & not cancellationRequested) */}
              {(selected.status || "Pending").toLowerCase() === "pending" && !selected.cancellationRequested && (
                <button
                  type="button"
                  onClick={() => setViewModalTab("edit")}
                  style={{
                    flex: "1 0 auto",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "7px",
                    border: "none",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: viewModalTab === "edit" ? "#ffffff" : "transparent",
                    color: viewModalTab === "edit" ? "#1d4ed8" : "#64748b",
                    boxShadow: viewModalTab === "edit" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <span>Edit Booking</span>
                </button>
              )}

              {/* Tab 4: Cancel (only if not already cancelled/rejected/returned/cancellationRequested) */}
              {!selected.cancellationRequested && !["cancelled", "rejected", "returned"].includes((selected.status || "").toLowerCase()) && (
                <button
                  type="button"
                  onClick={() => {
                    setViewModalTab("cancel");
                    setSelectedCancelReason("");
                    setCustomCancelReason("");
                    setActionError("");
                  }}
                  style={{
                    flex: "1 0 auto",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "7px",
                    border: "none",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: viewModalTab === "cancel" ? "#ffffff" : "transparent",
                    color: viewModalTab === "cancel" ? "#dc2626" : "#64748b",
                    boxShadow: viewModalTab === "cancel" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span>Cancel Booking</span>
                </button>
              )}
            </div>

            {/* Machinery Picture Preview (Visible in Details view) */}
            {viewModalTab === "details" && (
              <div
                style={{
                  marginTop: "6px",
                  marginBottom: "16px",
                  borderRadius: "10px",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  maxHeight: "220px",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <img
                  src={
                    selected.imageUrl ||
                    machineryUnitsMap.get(selected.machineryUnitId) ||
                    machineryUnitsMap.get(selected.equipment) ||
                    "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=800&q=80"
                  }
                  alt={selected.machineryModel || selected.equipment}
                  style={{
                    width: "100%",
                    height: "210px",
                    objectFit: "cover",
                    display: "block",
                  }}
                  onError={(e) => {
                    e.currentTarget.src = "/images/kimpc logo.png";
                    e.currentTarget.style.objectFit = "contain";
                    e.currentTarget.style.padding = "24px";
                    e.currentTarget.style.height = "160px";
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "12px",
                    background: "rgba(15, 23, 42, 0.78)",
                    color: "#ffffff",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    backdropFilter: "blur(4px)",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  {selected.machineryModel || selected.equipment}
                </div>
              </div>
            )}

            {/* Dynamic Modal Body */}
            {viewModalTab === "details" && (
              <dl className="member-detail-list" style={{ marginTop: "14px" }}>
                <div>
                  <dt>Status</dt>
                  <dd style={{ fontWeight: 600, color: "#0f172a" }}>
                    {getStatusInfo(selected.status, selected.cancellationRequested).label}
                  </dd>
                </div>
                <div>
                  <dt>Booking ID</dt>
                  <dd style={{ fontWeight: 600, color: "#0f172a", fontFamily: "monospace" }}>
                    {selected.displayId || (selected._id ? `APP-${String(selected._id).slice(-6).toUpperCase()}` : "—")}
                  </dd>
                </div>
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
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, marginLeft: "6px" }}>
                      ({selected.paymentStatus === "Paid" ? (
                        <span style={{ color: "#059669" }}>Paid</span>
                      ) : (
                        <span style={{ color: "#d97706" }}>{selected.paymentStatus || "Pending"}</span>
                      )}
                      {" • "}
                      {selected.paymentMethod === "GCash" ? (
                        <span style={{ color: "#0284c7" }}>GCash</span>
                      ) : (
                        <span style={{ color: "#166534" }}>Cash</span>
                      )})
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Payment Mode &amp; Timing</dt>
                  <dd>
                    {selected.paymentMethod === "GCash" ? (
                      <div>
                        <span style={{ color: "#0284c7", fontWeight: 700 }}>GCash</span>
                        <span style={{ color: "#0369a1", fontWeight: 600, marginLeft: "6px" }}>(0926 463 8983 - KIMPC)</span>
                      </div>
                    ) : (
                      <div>
                        <span style={{ color: "#166534", fontWeight: 700 }}>Cash</span>
                        <span style={{ color: "#64748b", margin: "0 5px" }}>•</span>
                        <span
                          style={{
                            color: selected.cashPaymentOption === "Upon Return" ? "#d97706" : "#0284c7",
                            fontWeight: 700,
                          }}
                        >
                          {selected.cashPaymentOption === "Upon Return" ? "Upon Return" : "Upon Pickup"}
                        </span>
                      </div>
                    )}
                  </dd>
                </div>
                {selected.paymentMethod === "GCash" && (
                  <div style={{ gridColumn: "1 / -1", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px 14px" }}>
                    <dt style={{ color: "#0284c7", marginBottom: "6px", fontWeight: 600 }}>GCash Payment Proof</dt>
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
                            <p style={{ margin: "0 0 4px", fontSize: "0.8rem", color: "#059669", fontWeight: 600 }}>Proof Uploaded</p>
                            <button
                              type="button"
                              onClick={() => setPreviewGcashImage(selected.gcashProof)}
                              style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "4px", padding: "3px 10px", fontSize: "0.74rem", color: "#1d4ed8", fontWeight: 700, cursor: "pointer" }}
                            >
                              View Proof Screenshot
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "#d97706", fontWeight: 600 }}>No GCash proof uploaded yet.</span>
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
            )}

            {viewModalTab === "timeline" && (
              <div className="app-timeline-container" style={{ marginTop: "14px" }}>
                <div className="app-timeline-header">
                  <h3 className="app-timeline-header-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Booking Lifecycle Timeline
                  </h3>
                  <span className="app-timeline-count">
                    {getTimelineEvents(selected).length} Recorded Event{getTimelineEvents(selected).length === 1 ? "" : "s"}
                  </span>
                </div>

                <ul className="app-timeline-list">
                  {getTimelineEvents(selected).length > 0 ? (
                    getTimelineEvents(selected).map((evt, idx) => (
                      <li key={idx} className="app-timeline-item">
                        <div className="app-timeline-item-icon">
                          <span className={`wz-status-dot wz-status-${getStatusInfo(evt.event).slug}`} />
                        </div>
                        <div className="app-timeline-item-content">
                          <div className="app-timeline-item-meta">
                            <span className="app-timeline-item-status">{evt.title}</span>
                            <span className="app-timeline-item-actor">
                              by {evt.actor}
                            </span>
                            <span className="app-timeline-item-time">
                              {evt.timestamp ? new Date(evt.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                            </span>
                          </div>
                          {evt.note && <p className="app-timeline-item-note">{evt.note}</p>}
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="app-timeline-item">
                      <div className="app-timeline-item-content">
                        <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>
                          No lifecycle events recorded for this booking yet.
                        </p>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {viewModalTab === "edit" && (
              <div style={{ marginTop: "14px" }}>
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
                      hectares (₱{Number(Math.round((selected.ratePerHectare || 2500) * (editForm.hectares || 1))).toLocaleString()} est.)
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
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
              </div>
            )}

            {viewModalTab === "cancel" && (
              <div style={{ marginTop: "14px" }}>
                {(selected.status || "Pending").toLowerCase() === "pending" ? (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecdd3", borderRadius: "8px", padding: "14px 16px", color: "#991b1b", marginBottom: "16px" }}>
                    <strong style={{ fontSize: "0.95rem", display: "block", marginBottom: "4px" }}>
                      Cancel this pending booking request?
                    </strong>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#b91c1c" }}>
                      Your reservation for <strong>{selected.machineryModel || selected.equipment}</strong> ({formatBookingDateRange(selected.startDate, selected.endDate)}) will be cancelled immediately.
                    </p>
                  </div>
                ) : (
                  <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "0.84rem", color: "#92400e" }}>
                    ⚠️ <strong>Manager Approval Required:</strong> Because this booking was already approved by cooperative management, your cancellation request will be submitted to the manager to review and approve.
                  </div>
                )}

                {/* Reason Selection */}
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "0.84rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                    Select Reason for Cancellation <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <select
                    required
                    value={selectedCancelReason}
                    onChange={(e) => {
                      setSelectedCancelReason(e.target.value);
                      if (e.target.value !== "Other") {
                        setCustomCancelReason("");
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem",
                      background: "#ffffff",
                      color: "#0f172a",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">-- Choose a reason --</option>
                    {CANCELLATION_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Other: Custom Reason Input */}
                {selectedCancelReason === "Other" && (
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px", color: "#0f172a" }}>
                      Please State Your Reason <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <textarea
                      required
                      rows="3"
                      maxLength={500}
                      placeholder="Please describe why you need to cancel this booking..."
                      value={customCancelReason}
                      onChange={(e) => setCustomCancelReason(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.88rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions Footer: Close only by default; Close + Save for edit; Close + Cancel for cancel */}
            <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
              <button
                className="member-button member-button-outline"
                type="button"
                onClick={() => {
                  if (viewModalTab !== "details") {
                    setViewModalTab("details");
                  } else {
                    setSelected(null);
                  }
                }}
              >
                Close
              </button>

              {viewModalTab === "edit" && (
                <button
                  className="member-button member-button-primary"
                  type="button"
                  disabled={isSavingEdit || Boolean(editDateConflict)}
                  onClick={handleInlineSaveEdit}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{isSavingEdit ? "Saving Changes…" : "Save Changes"}</span>
                </button>
              )}

              {viewModalTab === "cancel" && (
                <button
                  type="button"
                  className="member-button"
                  style={{
                    background: (selected.status || "Pending").toLowerCase() === "pending" ? "#dc2626" : "#d97706",
                    color: "#ffffff",
                    border: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  disabled={isSubmittingCancellation || cancellingId === (selected._id || selected.id)}
                  onClick={handleInlineConfirmCancel}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span>
                    {(selected.status || "Pending").toLowerCase() === "pending"
                      ? cancellingId === (selected._id || selected.id)
                        ? "Cancelling..."
                        : "Cancel Booking"
                      : isSubmittingCancellation
                      ? "Submitting..."
                      : "Submit Cancellation"}
                  </span>
                </button>
              )}
            </div>
          </section>
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
              alt="GCash Screenshot"
              style={{ width: "100%", maxHeight: "65vh", objectFit: "contain", borderRadius: "8px", border: "1px solid #e2e8f0" }}
            />
            <button
              type="button"
              className="member-button member-button-outline"
              onClick={() => setPreviewGcashImage(null)}
              style={{ marginTop: "14px", width: "100%" }}
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
