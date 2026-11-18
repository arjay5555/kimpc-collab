import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, getCachedApiData, onReloadLatest } from "../../services/api";
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

function formatTimelineDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dateFormatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const hours = d.getHours();
  const minutes = d.getMinutes();
  if (hours !== 0 || minutes !== 0) {
    const timeFormatted = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${dateFormatted}, ${timeFormatted}`;
  }
  return dateFormatted;
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
    return { slug: "cancellation-requested", label: "Cancellation Pending", textColor: "#b45309" };
  }
  if (s === "approved") return { slug: "approved", label: "Approved", textColor: "#15803d" };
  if (s === "checked-out" || s === "ongoing") return { slug: "ongoing", label: "Ongoing", textColor: "#0284c7" };
  if (s === "returned" || s === "completed") return { slug: "completed", label: "Completed", textColor: "#166534" };
  if (s === "rejected") return { slug: "rejected", label: "Declined", textColor: "#b91c1c" };
  if (s === "cancelled") return { slug: "cancelled", label: "Cancelled", textColor: "#64748b" };
  if (s === "voided" || s === "void") return { slug: "voided", label: "Voided", textColor: "#64748b" };
  return { slug: "pending", label: "Pending", textColor: "#d97706" };
}

function getAppOperatorInfo(app, fullMap) {
  if (!app) return { required: false, name: "Self-Operated / Own Driver", phone: "" };
  const unit =
    fullMap?.get(app.machineryUnitId) ||
    fullMap?.get(app.equipment?.toLowerCase?.()) ||
    fullMap?.get(app.machineryModel?.toLowerCase?.());

  const isOperatorRequired = Boolean(
    app.operatorRequired ||
    app.driverOption === "With Cooperative Driver" ||
    unit?.operatorRequired ||
    unit?.operatorIncluded
  );

  let operatorName = "";
  const candidateDriver = (app.driverName || app.assignedDriver || "").trim();
  const unitDriver = (unit?.assignedDriver || "").trim();

  if (candidateDriver && candidateDriver !== "Unassigned" && !candidateDriver.toLowerCase().includes("self-operated")) {
    operatorName = candidateDriver;
  } else if (unitDriver && unitDriver !== "Unassigned" && !unitDriver.toLowerCase().includes("self-operated")) {
    operatorName = unitDriver;
  } else if (isOperatorRequired) {
    operatorName = "Coop Operator Assigned";
  } else {
    operatorName = "Self-Operated / Own Driver";
  }

  return {
    required: isOperatorRequired,
    name: operatorName,
    phone: unit?.driverPhone || app.driverPhone || "",
  };
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
  const isApprovedStage =
    ["approved", "checked-out", "ongoing", "returned", "completed"].includes(statusLower) ||
    Boolean(app.approvedAt);
  if (isApprovedStage && statusLower !== "pending" && statusLower !== "rejected") {
    events.push({
      event: "approved",
      title: "Booking Approved",
      timestamp: new Date(app.approvedAt || app.updatedAt || app.createdAt),
      actor: "Manager",
      note: "Cooperative management approved the booking schedule and confirmed machinery reservation.",
    });
  }

  // 4. Given / Dispatched (Checked-Out)
  const isDispatched =
    ["checked-out", "ongoing", "returned", "completed"].includes(statusLower) ||
    Boolean(app.dispatchedAt) ||
    Boolean(app.checkoutInspection?.inspectedAt);
  if (isDispatched && !["pending", "approved", "rejected", "cancelled", "voided"].includes(statusLower)) {
    const insp = app.checkoutInspection;
    const inspNote = insp && insp.inspectedAt ? ` (Fuel: ${insp.fuelLevel || "100%"}, Odometer: ${insp.odometerHours || 0} hrs)` : "";
    events.push({
      event: "dispatched",
      title: "Machinery Given / Dispatched",
      timestamp: new Date(app.dispatchedAt || insp?.inspectedAt || app.startDate || app.updatedAt),
      actor: "Manager",
      note: `Pre-rental checkout inspection completed.${inspNote} Machinery handed over for field operations. Assigned Driver: ${app.assignedDriver || "Cooperative Operator"}.`,
    });
  }

  // 5. Returned
  const isReturned =
    ["returned", "completed"].includes(statusLower) ||
    Boolean(app.returnedAt) ||
    Boolean(app.checkinInspection?.inspectedAt);
  if (isReturned && !["pending", "approved", "checked-out", "ongoing", "rejected", "cancelled", "voided"].includes(statusLower)) {
    const insp = app.checkinInspection;
    const inspNote = insp && insp.inspectedAt ? ` (Fuel: ${insp.fuelLevel || "100%"}, Odometer: ${insp.odometerHours || 0} hrs, Notes: ${insp.notes || "Clean"})` : "";
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

function getStageTimestamp(app, eventKey, fallbackDate) {
  if (Array.isArray(app?.timeline)) {
    for (let i = app.timeline.length - 1; i >= 0; i--) {
      const item = app.timeline[i];
      if (item && item.event === eventKey && item.timestamp) {
        return item.timestamp;
      }
    }
  }
  return fallbackDate || app.updatedAt || app.createdAt || new Date();
}

/**
 * Synthesizes minimal lifecycle stages (Pending, Approved, On Going, Completed, Cancelled)
 * sorted with the LATEST STAGE AT THE TOP (reverse-chronological).
 * Strictly gated by actual booking status and the timestamp of each status change.
 * Only displays status label and date/time.
 */
function getMobileTimelineStages(app) {
  if (!app) return [];
  const statusLower = (app.status || "pending").toLowerCase();
  const stages = [];

  const isCancelled = ["cancelled", "voided"].includes(statusLower);
  const isCancellationRequested = app.cancellationRequested || statusLower === "cancellation requested";
  const isRejected = statusLower === "rejected";
  const isCompleted = ["returned", "completed"].includes(statusLower);
  const isOngoing = isCompleted || ["checked-out", "ongoing"].includes(statusLower);
  const isApproved = isOngoing || statusLower === "approved" || Boolean(app.approvedAt);

  // Stage order rank for tie-breaking when timestamps match
  const STAGE_ORDER = {
    cancelled: 6,
    cancellation_requested: 6,
    rejected: 6,
    completed: 5,
    ongoing: 4,
    approved: 3,
    pending: 1,
  };

  // 1. Pending (Always present as the initial booking submission)
  const pendingDate = app.createdAt || getStageTimestamp(app, "submitted", app.createdAt);
  stages.push({
    key: "pending",
    label: "Pending",
    timestamp: new Date(pendingDate),
    dateStr: formatTimelineDate(pendingDate),
    color: "#0284c7",
  });

  // 2. Approved (Strictly only if status is Approved, On Going, Completed, or was approved before being cancelled)
  if (isApproved && statusLower !== "pending" && !isRejected) {
    const approvedDate = app.approvedAt || getStageTimestamp(app, "approved", app.updatedAt);
    stages.push({
      key: "approved",
      label: "Approved",
      timestamp: new Date(approvedDate),
      dateStr: formatTimelineDate(approvedDate),
      color: "#15803d",
    });
  }

  // 3. On Going (Strictly only if status is Checked-Out, On Going, or Completed)
  if (isOngoing && !isCancelled && !isCancellationRequested && !isRejected) {
    const ongoingDate = app.dispatchedAt || getStageTimestamp(app, "dispatched", app.startDate || app.updatedAt);
    stages.push({
      key: "ongoing",
      label: "On Going",
      timestamp: new Date(ongoingDate),
      dateStr: formatTimelineDate(ongoingDate),
      color: "#0284c7",
    });
  }

  // 4. Completed (Strictly only if status is Returned or Completed)
  if (isCompleted && !isCancelled && !isRejected) {
    const completedDate = app.returnedAt || getStageTimestamp(app, "returned", app.updatedAt);
    stages.push({
      key: "completed",
      label: "Completed",
      timestamp: new Date(completedDate),
      dateStr: formatTimelineDate(completedDate),
      color: "#166534",
    });
  }

  // 5. Cancelled / Cancellation Requested / Rejected
  if (isCancelled) {
    const cancelDate = app.cancelledAt || getStageTimestamp(app, "cancelled", app.updatedAt);
    stages.push({
      key: "cancelled",
      label: "Cancelled",
      timestamp: new Date(cancelDate),
      dateStr: formatTimelineDate(cancelDate),
      color: "#dc2626",
    });
  } else if (isCancellationRequested) {
    const cancelReqDate = app.cancellationRequestedAt || getStageTimestamp(app, "cancellation_requested", app.updatedAt);
    stages.push({
      key: "cancellation_requested",
      label: "Cancellation Requested",
      timestamp: new Date(cancelReqDate),
      dateStr: formatTimelineDate(cancelReqDate),
      color: "#b45309",
    });
  } else if (isRejected) {
    const rejectDate = getStageTimestamp(app, "rejected", app.updatedAt);
    stages.push({
      key: "rejected",
      label: "Declined",
      timestamp: new Date(rejectDate),
      dateStr: formatTimelineDate(rejectDate),
      color: "#dc2626",
    });
  }

  // Sort reverse-chronological: NEWEST / LATEST STAGE ON TOP!
  stages.sort((a, b) => {
    const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
    if (timeDiff !== 0) return timeDiff;
    return (STAGE_ORDER[b.key] || 0) - (STAGE_ORDER[a.key] || 0);
  });

  return stages;
}

export default function Applications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState(() => {
    const cached = getCachedApiData("/applications");
    return Array.isArray(cached) ? cached : [];
  });
  const [loading, setLoading] = useState(() => !getCachedApiData("/applications"));
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [cancellingId, setCancellingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Modal active view tab: 'details' | 'timeline' | 'edit' | 'cancel'
  const [viewModalTab, setViewModalTab] = useState("details");

  // Screen width detection for mobile vs desktop experience
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 768 : false));

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Machinery units image and full metadata lookup maps
  const [machineryUnitsMap, setMachineryUnitsMap] = useState(new Map());
  const [machineryUnitsFullMap, setMachineryUnitsFullMap] = useState(new Map());

  // Mobile Booking Details View Specific States
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [requestMode, setRequestMode] = useState(""); // "" | "menu" | "reschedule" | "cancel"
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [copiedBookingId, setCopiedBookingId] = useState(false);

  const handleCopyBookingId = (text) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedBookingId(true);
      setTimeout(() => setCopiedBookingId(false), 2000);
    }
  };

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
      const fullMap = new Map();
      unitsList.forEach((u) => {
        const img = u.imageUrl || (Array.isArray(u.photos) && u.photos[0]) || "";
        if (u.unitId && img) map.set(u.unitId, img);
        if (u.name && img && !map.has(u.name)) map.set(u.name, img);

        if (u.unitId) fullMap.set(u.unitId, u);
        if (u._id) fullMap.set(String(u._id), u);
        if (u.name) fullMap.set(u.name.toLowerCase(), u);
      });
      setMachineryUnitsMap(map);
      setMachineryUnitsFullMap(fullMap);
    }
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    fetchApplications();
    const interval = window.setInterval(fetchApplications, 12000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  // "Reload latest" after a 409: show the server copy of this booking; the edit form keeps the member's input.
  useEffect(
    () =>
      onReloadLatest(({ current }) => {
        const id = String(current?.id || current?._id || "");
        if (!id) return;
        const same = (item) => item && String(item._id || item.id) === id;
        setSelected((prev) => (same(prev) ? current : prev));
        setApplications((prev) => prev.map((item) => (same(item) ? current : item)));
      }),
    []
  );

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
    setRequestMode("");
    setIsTimelineExpanded(false);
    setIsSummaryExpanded(false);
    setShowReceiptModal(false);
    setShowContactModal(false);
    setShowHelpModal(false);
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
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Live conflict checking for inline edit
  const editDateConflict = useMemo(() => {
    if (!selected || (viewModalTab !== "edit" && requestMode !== "reschedule") || !editForm.startDate || !editForm.endDate) {
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
        version: selected.version,
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
        body: { reason: finalReason, version: selected.version },
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
        body: { reason: finalReason, version: selected.version },
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

  // Mobile Full-Page Details View (Matches Picture 1 & Picture 2 for Mobile Screens)
  if (isMobile && selected) {
    const statusInfo = getStatusInfo(selected.status, selected.cancellationRequested);
    const displayId = selected.displayId || (selected._id ? `APP-${String(selected._id).slice(-6).toUpperCase()}` : "APP");
    const modelName = selected.machineryModel || selected.equipment;
    const dateRangeStr = formatBookingDateRange(selected.startDate, selected.endDate);
    const days = getDaysCount(selected.startDate, selected.endDate);
    const totalAmount = selected.totalAmount || (selected.ratePerHectare || 2500) * (selected.hectares || 1);
    const operatorInfo = getAppOperatorInfo(selected, machineryUnitsFullMap);
    const operatorPhone =
      operatorInfo.phone ||
      selected.driverPhone ||
      (operatorInfo.name && !operatorInfo.name.toLowerCase().includes("self-operated")
        ? "(0926) 463 8983"
        : "");
    const farmLoc = (selected.farmLocation || selected.farmFormattedAddress || "").trim() || "Kalilangan, Bukidnon";
    const targetUnit =
      machineryUnitsFullMap?.get(selected.machineryUnitId) ||
      machineryUnitsFullMap?.get(selected.equipment?.toLowerCase?.()) ||
      machineryUnitsFullMap?.get(selected.machineryModel?.toLowerCase?.());
    const unitTargetId =
      selected.machineryUnitId ||
      targetUnit?.unitId ||
      targetUnit?._id ||
      targetUnit?.id ||
      "";
    const unitDetailUrl = unitTargetId ? `/member/book/${encodeURIComponent(unitTargetId)}` : `/member/book`;
    const timelineStages = getMobileTimelineStages(selected);
    const latestStage = timelineStages[0] || { label: "Pending", dateStr: formatDateDisplay(selected.createdAt), color: "#0284c7" };
    const isPending = (selected.status || "Pending").toLowerCase() === "pending" && !selected.cancellationRequested;

    return (
      <div className="member-page" style={{ padding: 0, margin: 0, background: "#f8fafc", minHeight: "100vh", width: "100%" }}>
        <div className="mobile-detail-page">
          {/* 1. Header with back button */}
          <div className="mobile-detail-header">
            <button
              type="button"
              className="mobile-back-btn"
              onClick={() => {
                setSelected(null);
                setRequestMode("");
                setActionError("");
                setActionSuccess("");
              }}
              aria-label="Back to bookings"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 className="mobile-detail-title">Booking Details</h1>
            <div style={{ width: "24px" }} />
          </div>

          {/* Action alerts if any (Clean full-width rectangular banners) */}
          {actionError && (
            <div style={{ margin: "0 0 8px", padding: "10px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: 0, fontSize: "0.82rem", borderTop: "1px solid #fecdd3", borderBottom: "1px solid #fecdd3" }}>
              {actionError}
            </div>
          )}
          {actionSuccess && (
            <div style={{ margin: "0 0 8px", padding: "10px 16px", background: "#f0fdf4", color: "#166534", borderRadius: 0, fontSize: "0.82rem", borderTop: "1px solid #bbf7d0", borderBottom: "1px solid #bbf7d0" }}>
              {actionSuccess}
            </div>
          )}

          {/* Unified Single Container (Matches Reference E-Commerce Order View) */}
          <div className="mobile-unified-container">
            {/* 1. Top Status Section: Latest Stage at top + Line Down connecting date & timeline */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: latestStage.color || "#0284c7",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>
                    {latestStage.label}
                  </span>
                </div>
                <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "#0284c7" }}>
                  {dateRangeStr}
                </span>
              </div>

              {/* Vertical line down track connecting date and timeline */}
              <div style={{ marginLeft: "3.5px", paddingLeft: "14px", borderLeft: "1.5px solid #cbd5e1" }}>
                {/* When collapsed: show latest date only */}
                {!isTimelineExpanded && (
                  <div style={{ fontSize: "0.72rem", color: "#64748b", padding: "2px 0 6px" }}>
                    {latestStage.dateStr}
                  </div>
                )}

                {/* When expanded: show the full list of timeline stages sliding down with animation */}
                {isTimelineExpanded && (
                  <div
                    className="timeline-dropdown-anim"
                    style={{
                      paddingTop: "2px",
                      paddingBottom: "8px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    {timelineStages.map((stage, idx) => (
                      <div key={stage.key || idx} style={{ position: "relative", fontSize: "0.76rem" }}>
                        <span
                          style={{
                            position: "absolute",
                            left: "-18px",
                            top: "4px",
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: idx === 0 ? stage.color || "#0284c7" : "#94a3b8",
                          }}
                        />
                        <div style={{ fontWeight: 700, color: idx === 0 ? "#0f172a" : "#475569" }}>
                          {stage.label}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "1px" }}>
                          {stage.dateStr}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Booking Timeline toggle button - goes down below the timeline when expanded, with up/down arrow */}
                <button
                  type="button"
                  onClick={() => setIsTimelineExpanded((prev) => !prev)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "2px 0",
                    fontSize: "0.74rem",
                    color: "#64748b",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    marginTop: isTimelineExpanded ? "4px" : "0",
                  }}
                >
                  <span>Booking Timeline</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {isTimelineExpanded ? (
                      <polyline points="18 15 12 9 6 15" />
                    ) : (
                      <polyline points="6 9 12 15 18 9" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* 2. Farm Location & Operator Section (Clean, Small Font, Crisp Rectangular Layout) */}
            <div style={{ padding: "11px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: "9px", background: "#ffffff" }}>
              {/* Row 1: Farm Location */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ color: "#0284c7", marginTop: "2px", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "1px" }}>
                    Farm Location
                  </div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#0f172a", lineHeight: 1.3 }}>
                    {farmLoc}
                  </div>
                  {selected.farmFormattedAddress && selected.farmLocation && selected.farmFormattedAddress !== selected.farmLocation && (
                    <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "1px" }}>
                      {selected.farmFormattedAddress}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Assigned Operator & Phone Number */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div style={{ color: "#166534", marginTop: "2px", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "1px" }}>
                    Assigned Operator
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#0f172a" }}>
                      {operatorInfo.name || "Self-Operated / Own Driver"}
                    </span>
                    {operatorPhone ? (
                      <a
                        href={`tel:${operatorPhone.replace(/[^0-9+]/g, "")}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          color: "#0284c7",
                          textDecoration: "none",
                          background: "#f0f9ff",
                          border: "1px solid #bae6fd",
                          padding: "2px 6px",
                          borderRadius: 0,
                        }}
                        title={`Call ${operatorInfo.name || "operator"}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span>{operatorPhone}</span>
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                        {operatorInfo.required ? "Assigned by Depot" : "Self-Operated"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Store Header & Machinery Item */}
            <div style={{ padding: "14px 16px 12px" }}>
              {/* Store Header: KIMPC RENTAL MACHINERY (No Icon, No Arrow) */}
              <div style={{ marginBottom: "12px" }}>
                <span style={{ fontWeight: 800, fontSize: "0.84rem", color: "#0f172a", letterSpacing: "0.02em" }}>
                  KIMPC RENTAL MACHINERY
                </span>
              </div>

              {/* Machinery Item Row: Clickable Link to the unit (Picture, Name, Rental Fee) */}
              <Link
                to={unitDetailUrl}
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                  marginBottom: "10px",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
                title={`View ${modelName} unit details`}
              >
                <img
                  src={
                    selected.imageUrl ||
                    machineryUnitsMap.get(selected.machineryUnitId) ||
                    machineryUnitsMap.get(selected.equipment) ||
                    "/images/kimpc logo.png"
                  }
                  alt={modelName}
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: 0,
                    objectFit: "cover",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    e.currentTarget.src = "/images/kimpc logo.png";
                    e.currentTarget.style.objectFit = "contain";
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: "0.92rem", fontWeight: 700, color: "#0f172a", display: "block", lineHeight: 1.3, marginBottom: "4px" }}>
                    {modelName}
                  </strong>
                  <span style={{ fontWeight: 800, fontSize: "0.98rem", color: "#0f172a" }}>
                    ₱{Number(totalAmount).toLocaleString()}
                  </span>
                </div>
              </Link>

              {/* Request Button below machinery */}
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "6px" }}>
                {requestMode === "" ? (
                  <button
                    type="button"
                    onClick={() => setRequestMode("menu")}
                    style={{
                      padding: "6px 18px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: 0,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#334155",
                      cursor: "pointer",
                    }}
                  >
                    Request
                  </button>
                ) : requestMode === "menu" ? (
                  <div style={{ width: "100%", background: "#f8fafc", borderRadius: 0, padding: "10px 12px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "8px", textTransform: "uppercase" }}>
                      Select Request Action:
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestMode("reschedule");
                            setActionError("");
                          }}
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: 0,
                            color: "#1d4ed8",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            cursor: "pointer",
                          }}
                        >
                          Reschedule Booking
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRequestMode("cancel");
                          setActionError("");
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          background: "#fef2f2",
                          border: "1px solid #fecdd3",
                          borderRadius: 0,
                          color: "#dc2626",
                          fontWeight: 700,
                          fontSize: "0.78rem",
                          cursor: "pointer",
                        }}
                      >
                        Cancel Booking
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestMode("")}
                        style={{
                          padding: "8px 12px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: 0,
                          color: "#64748b",
                          fontSize: "0.78rem",
                          cursor: "pointer",
                        }}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                ) : requestMode === "reschedule" ? (
                  /* Inline Reschedule Form */
                  <div style={{ width: "100%", background: "#f8fafc", borderRadius: 0, padding: "12px", border: "1px solid #bfdbfe" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "0.84rem", color: "#1d4ed8" }}>Reschedule Booking Dates</strong>
                      <button type="button" onClick={() => setRequestMode("")} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.78rem" }}>
                      <div>
                        <label style={{ display: "block", color: "#475569", marginBottom: "2px", fontWeight: 600 }}>Start Date</label>
                        <input
                          type="date"
                          value={editForm.startDate}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, startDate: e.target.value }))}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 0, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", color: "#475569", marginBottom: "2px", fontWeight: 600 }}>End Date</label>
                        <input
                          type="date"
                          value={editForm.endDate}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, endDate: e.target.value }))}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 0, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", color: "#475569", marginBottom: "2px", fontWeight: 600 }}>Hectares</label>
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={editForm.hectares}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, hectares: e.target.value }))}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 0, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", color: "#475569", marginBottom: "2px", fontWeight: 600 }}>Farm Location</label>
                        <input
                          type="text"
                          value={editForm.farmLocation}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, farmLocation: e.target.value }))}
                          placeholder="Barangay / Purok"
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 0, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", color: "#475569", marginBottom: "2px", fontWeight: 600 }}>Reason for Reschedule</label>
                        <input
                          type="text"
                          value={editForm.rescheduleReason}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, rescheduleReason: e.target.value }))}
                          placeholder="e.g. Heavy rain, soil wet..."
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 0, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        />
                      </div>
                      {editDateConflict && (
                        <div style={{ color: "#b91c1c", fontSize: "0.74rem", background: "#fef2f2", padding: "6px 8px", borderRadius: 0 }}>
                          {editDateConflict}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={async () => {
                            await handleInlineSaveEdit();
                            setRequestMode("");
                          }}
                          disabled={isSavingEdit || Boolean(editDateConflict)}
                          style={{ flex: 1, padding: "7px 12px", background: "#166534", color: "#ffffff", border: "none", borderRadius: 0, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                        >
                          {isSavingEdit ? "Saving..." : "Save Reschedule"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRequestMode("")}
                          style={{ padding: "7px 12px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 0, color: "#64748b", fontSize: "0.78rem", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Inline Cancel Form */
                  <div style={{ width: "100%", background: "#fef2f2", borderRadius: 0, padding: "12px", border: "1px solid #fecdd3" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "0.84rem", color: "#b91c1c" }}>Cancel Booking</strong>
                      <button type="button" onClick={() => setRequestMode("")} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.78rem" }}>
                      <div>
                        <label style={{ display: "block", color: "#475569", marginBottom: "2px", fontWeight: 600 }}>Reason for Cancellation</label>
                        <select
                          value={selectedCancelReason}
                          onChange={(e) => setSelectedCancelReason(e.target.value)}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 0, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                        >
                          <option value="">-- Choose a reason --</option>
                          {CANCELLATION_REASONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      {selectedCancelReason === "Other" && (
                        <div>
                          <label style={{ display: "block", color: "#475569", marginBottom: "2px", fontWeight: 600 }}>Specify Reason</label>
                          <textarea
                            rows={2}
                            value={customCancelReason}
                            onChange={(e) => setCustomCancelReason(e.target.value)}
                            placeholder="Provide details..."
                            style={{ width: "100%", padding: "6px 8px", borderRadius: 0, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                          />
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={async () => {
                            await handleInlineConfirmCancel();
                          }}
                          disabled={isSubmittingCancellation || cancellingId === (selected._id || selected.id)}
                          style={{ flex: 1, padding: "7px 12px", background: "#dc2626", color: "#ffffff", border: "none", borderRadius: 0, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                        >
                          {isSubmittingCancellation ? "Submitting..." : isPending ? "Confirm Cancellation" : "Submit Cancellation Request"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRequestMode("")}
                          style={{ padding: "7px 12px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 0, color: "#64748b", fontSize: "0.78rem", cursor: "pointer" }}
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Financials & Booking Summary */}
            <div style={{ padding: "14px 16px", borderTop: "1px solid #f1f5f9" }}>
              {/* Total Row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>Total</span>
                <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                  ₱{Number(totalAmount).toLocaleString()}
                </span>
              </div>

              {/* Order No. Row with Copy button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Booking No.</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>
                    {displayId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyBookingId(displayId)}
                    style={{
                      background: "none",
                      border: "none",
                      color: copiedBookingId ? "#166534" : "#0284c7",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    {copiedBookingId ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* View Booking Summary Dropdown with Full Computation */}
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setIsSummaryExpanded((prev) => !prev)}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    fontSize: "0.78rem",
                    color: "#0284c7",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  <span>View Booking Summary</span>
                  <span style={{ fontSize: "0.72rem", transition: "transform 0.2s ease", transform: isSummaryExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                    ∨
                  </span>
                </button>

                {isSummaryExpanded && (
                  <div style={{ marginTop: "10px", background: "#f8fafc", borderRadius: 0, border: "1px solid #e2e8f0", padding: "10px 12px", fontSize: "0.76rem", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Rate per Hectare:</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>₱{Number(selected.ratePerHectare || 2500).toLocaleString()} / ha</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Coverage:</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{selected.hectares || 1} ha ({days}d)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Machinery Subtotal:</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>₱{Number((selected.ratePerHectare || 2500) * (selected.hectares || 1)).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Operator Fee:</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{selected.operatorFee ? `₱${Number(selected.operatorFee).toLocaleString()}` : "₱0.00 (Included)"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Tax (VAT 0%):</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>₱0.00 (Coop Exempt)</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed #e2e8f0", paddingTop: "6px" }}>
                      <span style={{ color: "#0f172a", fontWeight: 700 }}>Total:</span>
                      <span style={{ fontWeight: 800, color: "#166534" }}>₱{Number(totalAmount).toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Mode of Payment:</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{selected.paymentMethod || "Cash"} ({selected.paymentStatus || "Pending"})</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748b" }}>Book Date:</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{formatDateDisplay(selected.createdAt)}</span>
                    </div>
                    {(Boolean(selected.cancelledAt) || Boolean(selected.cancellationRequestedAt) || (selected.status || "").toLowerCase().includes("cancel")) && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626", borderTop: "1px dashed #fecdd3", paddingTop: "6px" }}>
                        <span>Cancellation Date:</span>
                        <span style={{ fontWeight: 700 }}>{formatDateDisplay(selected.cancelledAt || selected.cancellationRequestedAt || selected.updatedAt)}</span>
                      </div>
                    )}
                    {selected.cancellationReason && (
                      <div style={{ fontSize: "0.72rem", color: "#991b1b", background: "#fef2f2", padding: "6px 8px", borderRadius: 0 }}>
                        <strong>Cancellation Reason:</strong> {selected.cancellationReason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Action List Items (Picture 2: Single-color #475569 line SVG icons, unified minimalist style) */}
            <div style={{ borderTop: "1px solid #f1f5f9" }}>
              {/* Item 1: Receipt */}
              <button
                type="button"
                className="mobile-action-list-item"
                onClick={() => setShowReceiptModal(true)}
              >
                <div className="mobile-action-list-left">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 3 2 3-2 3 2 3-2 3 2V8l-6-6z" />
                    <path d="M14 2v6h6" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="13" y2="17" />
                  </svg>
                  <span>Receipt</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <div className="mobile-action-divider" />

              {/* Item 2: Contact Manager */}
              <button
                type="button"
                className="mobile-action-list-item"
                onClick={() => setShowContactModal(true)}
              >
                <div className="mobile-action-list-left">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <line x1="8" y1="9" x2="16" y2="9" />
                    <line x1="8" y1="13" x2="13" y2="13" />
                  </svg>
                  <span>Contact Manager</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <div className="mobile-action-divider" />

              {/* Item 3: Rental Guidelines & Policies */}
              <button
                type="button"
                className="mobile-action-list-item"
                onClick={() => setShowHelpModal(true)}
              >
                <div className="mobile-action-list-left">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>Rental Guidelines &amp; Policies</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Popups on Mobile */}
        {showReceiptModal && (
          <ReceiptModal
            app={selected}
            onClose={() => setShowReceiptModal(false)}
            user={user}
            operatorInfo={operatorInfo}
          />
        )}
        {showContactModal && (
          <ContactManagerModal
            onClose={() => setShowContactModal(false)}
          />
        )}
        {showHelpModal && (
          <HelpPoliciesModal
            onClose={() => setShowHelpModal(false)}
          />
        )}
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
                <strong style={{ fontSize: "1rem", color: "#0f172a" }}>GCash Payment Screenshot Proof</strong>
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
        <div className="member-mobile-bookings-list member-mobile-only" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {visibleApplications.map((app) => {
            const statusInfo = getStatusInfo(app.status, app.cancellationRequested);
            const displayId = app.displayId || (app._id ? `APP-${String(app._id).slice(-6).toUpperCase()}` : "APP");
            const modelName = app.machineryModel || app.equipment;
            const dateRangeStr = formatBookingDateRange(app.startDate, app.endDate);
            const days = getDaysCount(app.startDate, app.endDate);
            const totalAmount = app.totalAmount || (app.ratePerHectare || 2500) * (app.hectares || 1);
            const isPaid = (app.paymentStatus || "").toLowerCase() === "paid" || (app.paymentStatus || "").toLowerCase() === "settled";
            const operatorInfo = getAppOperatorInfo(app, machineryUnitsFullMap);

            return (
              <div
                key={app._id || app.id}
                style={{
                  background: "#ffffff",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  padding: "10px 12px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                {/* Top Bar: Booking ID + Status Text (Word only, no card background) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "0.85rem", color: "#0f172a" }}>
                    {displayId}
                  </span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: statusInfo.textColor || "#0f172a" }}>
                    {statusInfo.label}
                  </span>
                </div>

                {/* Machinery Image & Info */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                  <img
                    src={
                      app.imageUrl ||
                      machineryUnitsMap.get(app.machineryUnitId) ||
                      machineryUnitsMap.get(app.equipment) ||
                      "/images/kimpc logo.png"
                    }
                    alt={modelName}
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "8px",
                      objectFit: "cover",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      e.currentTarget.src = "/images/kimpc logo.png";
                      e.currentTarget.style.objectFit = "contain";
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: "0.88rem", color: "#0f172a", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {modelName}
                    </strong>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      {app.hectares ? `${app.hectares} ha` : "1 ha"} • {app.farmLocation || "Kalilangan"}
                    </span>
                  </div>
                </div>

                {/* Details Strip */}
                <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "8px 10px", marginBottom: "8px", fontSize: "0.76rem", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Schedule:</span>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{dateRangeStr} ({days}d)</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Operator:</span>
                    <span style={{ fontWeight: 600, color: "#334155" }}>
                      {operatorInfo.name}
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
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: isPaid ? "#15803d" : "#b45309",
                        background: isPaid ? "#dcfce7" : "#fef3c7",
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {isPaid ? "Paid" : "Pending"} ({app.paymentMethod || "Cash"})
                    </span>
                  </div>
                </div>

                {/* Tap to View Details (No eye icon, plain "View Details" text) */}
                <button
                  type="button"
                  onClick={() => handleOpenViewModal(app)}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    color: "#166534",
                    fontWeight: 700,
                    fontSize: "0.78rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  View Details
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

              <button
                type="button"
                className="member-button member-button-outline"
                onClick={() => setShowReceiptModal(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 3 2 3-2 3 2 3-2 3 2V8l-6-6z" />
                  <path d="M14 2v6h6" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
                <span>Receipt</span>
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
              <strong style={{ fontSize: "1rem", color: "#0f172a" }}>GCash Payment Screenshot Proof</strong>
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

      {/* Official KIMPC Receipt Modal on Desktop */}
      {showReceiptModal && selected && (
        <ReceiptModal
          app={selected}
          onClose={() => setShowReceiptModal(false)}
          user={user}
          operatorInfo={getAppOperatorInfo(selected, machineryUnitsFullMap)}
        />
      )}
    </div>
  );
}

/**
 * Official KIMPC Machinery Rental Receipt Modal (Picture 2: Receipt)
 */
function ReceiptModal({ app, onClose, user, operatorInfo }) {
  if (!app) return null;
  const displayId = app.displayId || (app._id ? `APP-${String(app._id).slice(-6).toUpperCase()}` : "APP");
  const modelName = app.machineryModel || app.equipment;
  const dateRangeStr = formatBookingDateRange(app.startDate, app.endDate);
  const days = getDaysCount(app.startDate, app.endDate);
  const totalAmount = app.totalAmount || (app.ratePerHectare || 2500) * (app.hectares || 1);
  const statusInfo = getStatusInfo(app.status, app.cancellationRequested);
  const isPaid = (app.paymentStatus || "").toLowerCase() === "paid" || (app.paymentStatus || "").toLowerCase() === "settled";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="member-modal-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ zIndex: 10002, background: "rgba(15, 23, 42, 0.75)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 0,
          padding: "24px 20px",
          maxWidth: "480px",
          width: "92%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          position: "relative",
          fontFamily: "inherit",
        }}
      >
        {/* Receipt Header */}
        <div style={{ textAlign: "center", borderBottom: "1px dashed #cbd5e1", paddingBottom: "14px", marginBottom: "16px" }}>
          <img
            src="/images/kimpc logo.png"
            alt="KIMPC Logo"
            style={{ width: "48px", height: "48px", margin: "0 auto 8px", display: "block" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <h3 style={{ margin: "0 0 2px", fontSize: "1.02rem", fontWeight: 800, color: "#0f172a" }}>
            KALILANGAN INTEGRATED MULTIPURPOSE COOPERATIVE
          </h3>
          <p style={{ margin: "0 0 4px", fontSize: "0.74rem", color: "#64748b" }}>
            Purok 2, Poblacion, Kalilangan, Bukidnon
          </p>
          <div style={{ display: "inline-block", background: "#f1f5f9", padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, color: "#475569" }}>
            OFFICIAL MACHINERY RENTAL RECEIPT
          </div>
        </div>

        {/* Receipt Meta */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "12px", color: "#475569" }}>
          <div>
            <div><strong>Receipt No:</strong> <span style={{ fontFamily: "monospace" }}>{displayId}</span></div>
            <div><strong>Date Issued:</strong> {formatDateDisplay(app.createdAt || new Date())}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div><strong>Status:</strong> <span style={{ color: statusInfo.textColor, fontWeight: 700 }}>{statusInfo.label}</span></div>
            <div><strong>Payment:</strong> <span style={{ color: isPaid ? "#15803d" : "#b45309", fontWeight: 700 }}>{app.paymentStatus || "Pending"}</span></div>
          </div>
        </div>

        {/* Member & Booking Info Box */}
        <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px", marginBottom: "14px", fontSize: "0.8rem", border: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#64748b" }}>Member:</span>
            <strong style={{ color: "#0f172a" }}>{user?.name || app.applicantName || user?.email}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#64748b" }}>Farm Location:</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{app.farmLocation || "Kalilangan"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ color: "#64748b" }}>Rental Schedule:</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{dateRangeStr} ({days} days)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#64748b" }}>Operator:</span>
            <span style={{ color: "#334155", fontWeight: 600 }}>{operatorInfo?.name || "Cooperative Operator"}</span>
          </div>
        </div>

        {/* Line Items Table */}
        <div style={{ borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", padding: "10px 0", marginBottom: "14px", fontSize: "0.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#64748b", marginBottom: "6px", fontSize: "0.72rem", textTransform: "uppercase" }}>
            <span>Item Description</span>
            <span>Amount</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>{modelName}</div>
              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{app.hectares || 1} hectare(s) @ ₱{Number(app.ratePerHectare || 2500).toLocaleString()}</div>
            </div>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>₱{Number(totalAmount).toLocaleString()}</span>
          </div>
          {operatorInfo?.required && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#475569", marginTop: "4px" }}>
              <span>Cooperative Operator Service</span>
              <span>Included</span>
            </div>
          )}
        </div>

        {/* Total Box */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", padding: "8px 12px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
          <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#166534" }}>TOTAL AMOUNT</span>
          <span style={{ fontWeight: 900, fontSize: "1.15rem", color: "#166534" }}>₱{Number(totalAmount).toLocaleString()}</span>
        </div>

        {/* Payment Method Details */}
        <div style={{ fontSize: "0.74rem", color: "#64748b", textAlign: "center", marginBottom: "18px" }}>
          Payment Method: <strong>{app.paymentMethod || "Cash"}</strong> {app.cashPaymentOption ? `(${app.cashPaymentOption})` : ""}
          <br />
          Thank you for choosing KIMPC Agricultural Machinery Services.
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#166534",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print / Save PDF</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 16px",
              background: "#f1f5f9",
              color: "#475569",
              border: "none",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Cooperative Manager Contact Modal (Picture 2: Contact seller)
 */
function ContactManagerModal({ onClose }) {
  return (
    <div
      className="member-modal-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ zIndex: 10002, background: "rgba(15, 23, 42, 0.75)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 0,
          padding: "20px",
          maxWidth: "440px",
          width: "90%",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="8" y1="9" x2="16" y2="9" />
              <line x1="8" y1="13" x2="13" y2="13" />
            </svg>
            <span>Contact Manager</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer", color: "#64748b", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.82rem", color: "#64748b", margin: "0 0 16px" }}>
          Reach out directly to the KIMPC Machinery Operations Manager for dispatch questions, scheduling changes, or urgent inquiries.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>MANAGER HOTLINE</div>
              <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0f172a" }}>+63 917 123 4567</div>
            </div>
            <a
              href="tel:+639171234567"
              style={{
                padding: "6px 12px",
                background: "#166534",
                color: "#ffffff",
                borderRadius: "6px",
                fontSize: "0.76rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Call
            </a>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>OFFICIAL EMAIL</div>
              <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#0f172a" }}>kimpc.kalilangan@gmail.com</div>
            </div>
            <a
              href="mailto:kimpc.kalilangan@gmail.com?subject=Booking Inquiry"
              style={{
                padding: "6px 12px",
                background: "#0284c7",
                color: "#ffffff",
                borderRadius: "6px",
                fontSize: "0.76rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Email
            </a>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>COOPERATIVE OFFICE</div>
              <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "#0f172a" }}>Purok 2, Poblacion, Kalilangan, Bukidnon</div>
              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Mon – Sat: 8:00 AM – 5:00 PM</div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{ width: "100%", padding: "10px", background: "#f1f5f9", border: "none", borderRadius: "8px", color: "#475569", fontWeight: 700, fontSize: "0.84rem", cursor: "pointer" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Rental Guidelines & Policies Modal (Picture 2: Rental Guidelines)
 */
function HelpPoliciesModal({ onClose }) {
  return (
    <div
      className="member-modal-backdrop"
      role="presentation"
      onClick={onClose}
      style={{ zIndex: 10002, background: "rgba(15, 23, 42, 0.75)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 0,
          padding: "20px",
          maxWidth: "480px",
          width: "90%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Rental Guidelines &amp; Policies</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: "28px", height: "28px", cursor: "pointer", color: "#64748b", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.8rem", color: "#334155", lineHeight: 1.5, marginBottom: "18px" }}>
          <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", borderLeft: "3px solid #166534" }}>
            <strong style={{ color: "#0f172a", display: "block", marginBottom: "4px" }}>1. Booking &amp; Confirmation</strong>
            Pending requests undergo cooperative verification. Once approved by management, the machinery is reserved and prepared for field dispatch.
          </div>

          <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", borderLeft: "3px solid #0284c7" }}>
            <strong style={{ color: "#0f172a", display: "block", marginBottom: "4px" }}>2. Operator &amp; Safety Requirements</strong>
            Units designated with operator required are operated exclusively by accredited KIMPC personnel to protect equipment warranties and ensure farm safety.
          </div>

          <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", borderLeft: "3px solid #f59e0b" }}>
            <strong style={{ color: "#0f172a", display: "block", marginBottom: "4px" }}>3. Reschedule &amp; Cancellation Policy</strong>
            Members may reschedule or cancel pending bookings at any time without fees. For approved bookings, cancellation requests require manager approval.
          </div>

          <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "8px", borderLeft: "3px solid #64748b" }}>
            <strong style={{ color: "#0f172a", display: "block", marginBottom: "4px" }}>4. Checkout &amp; Return Inspection</strong>
            Fuel levels and hour meter readings are documented upon dispatch and checked again upon return. Fuel consumed during self-operated rentals must be replenished.
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{ width: "100%", padding: "10px", background: "#f1f5f9", border: "none", borderRadius: "8px", color: "#475569", fontWeight: 700, fontSize: "0.84rem", cursor: "pointer" }}
        >
          Understood
        </button>
      </div>
    </div>
  );
}
