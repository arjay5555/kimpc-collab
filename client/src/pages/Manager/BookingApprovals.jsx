import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, getCachedApiData } from "../../services/api";
import { computePaymentSummary } from "../../utils/paymentSummary";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

const CURRENT_MOCK_YEAR = new Date().getFullYear();

// Live MongoDB database bookings
const INITIAL_MOCK_BOOKINGS = [];

const EMPTY_ADD_BOOKING = {
  machineryUnitId: "",
  equipment: "",
  memberPhone: "",
  hectares: 1,
  location: "",
  startDate: "",
  endDate: "",
};

function getAddUnitAvailability(unit) {
  const condition = (unit?.operatingCondition || unit?.status || "").toLowerCase();
  return ["operational", "available"].includes(condition) ? "Available" : "Unavailable";
}

function formatAddBookPrice(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatAddDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rangeAddDateKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatAddDateKey(date);
}

function formatAddDisplayDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isAddDateKeyBooked(dayKey, blockedRanges) {
  if (!dayKey) return false;
  return blockedRanges.some((range) => {
    const startKey = rangeAddDateKey(range.startDate);
    const endKey = rangeAddDateKey(range.endDate) || startKey;
    return Boolean(startKey && endKey && startKey <= dayKey && endKey >= dayKey);
  });
}

function hasAddBookedDatesInRange(startKey, endKey, blockedRanges) {
  if (!startKey || !endKey) return false;
  if (endKey < startKey) return true;
  const cur = new Date(`${startKey}T00:00:00`);
  const last = new Date(`${endKey}T00:00:00`);
  while (cur <= last) {
    if (isAddDateKeyBooked(formatAddDateKey(cur), blockedRanges)) return true;
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

function getMemberInitials(name, email) {
  const source = String(name || email || "M").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const HISTORY_BOOKING_STATUSES = new Set([
  "returned",
  "completed",
  "done",
  "cancelled",
  "canceled",
  "rejected",
  "voided",
]);

function isHistoryEligibleStatus(status) {
  return HISTORY_BOOKING_STATUSES.has(String(status || "").trim().toLowerCase());
}

function getBookingHistoryReferenceDate(booking) {
  const endDateCandidate = booking?.endDate
    ? /^\d{4}-\d{2}-\d{2}$/.test(booking.endDate)
      ? `${booking.endDate}T23:59:59`
      : booking.endDate
    : null;
  const candidates = [
    booking?.returnedAt,
    booking?.cancelledAt,
    booking?.bookingVoidedAt,
    endDateCandidate,
    booking?.updatedAt,
    booking?.createdAt,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (Number.isFinite(ts)) return new Date(ts);
  }
  return null;
}

function isBookingOlderThanThreeMonths(booking, now = new Date()) {
  if (!isHistoryEligibleStatus(booking?.status)) return false;
  const txDate = getBookingHistoryReferenceDate(booking);
  if (!txDate) return false;
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - 3);
  return txDate.getTime() <= cutoff.getTime();
}

// Bidirectional Chart Data for the 12 months
const MONTHLY_CHART_DATA = [
  { month: "Jan", done: 65, canceled: 50 },
  { month: "Feb", done: 70, canceled: 55 },
  { month: "Mar", done: 85, canceled: 70 },
  { month: "Apr", done: 80, canceled: 65 },
  { month: "May", done: 75, canceled: 60 },
  { month: "Jun", done: 95, canceled: 72, highlighted: true, doneCount: 586 },
  { month: "Jul", done: 82, canceled: 68 },
  { month: "Aug", done: 72, canceled: 58 },
  { month: "Sep", done: 84, canceled: 70 },
  { month: "Oct", done: 88, canceled: 75 },
  { month: "Nov", done: 76, canceled: 62 },
  { month: "Dec", done: 90, canceled: 78 },
];

export default function BookingApprovals() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Bookings list state
  const [liveBookings, setLiveBookings] = useState(() => {
    const cached = getCachedApiData("/applications");
    return Array.isArray(cached) ? cached : [];
  });
  const [loading, setLoading] = useState(() => !getCachedApiData("/applications"));
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy, setSortBy] = useState("date_desc");
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("kimpc_manager_pageSize");
    return saved ? Number(saved) : 8;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [chartPeriod, setChartPeriod] = useState("This Year");

  // Selected item (year/month) for interactive click tooltip in Overview chart (null until clicked)
  const [clickedItemIndex, setClickedItemIndex] = useState(null);
  const [financialsOpen, setFinancialsOpen] = useState(false);

  // Status overrides, booking data overrides, deleted bookings, and view modal
  const [statusOverrides, setStatusOverrides] = useState({});
  const [bookingOverrides, setBookingOverrides] = useState({});
  const [deletedIds, setDeletedIds] = useState([]);
  const [viewingBooking, setViewingBooking] = useState(null);
  const [viewModalTab, setViewModalTab] = useState("overview"); // "overview" | "payment" | "history"
  const [previewGcashImage, setPreviewGcashImage] = useState(null);
  const [modalStatus, setModalStatus] = useState("");
  const [modalRejectionReason, setModalRejectionReason] = useState("");
  const [modalVoidReason, setModalVoidReason] = useState("");
  const [modalStartDate, setModalStartDate] = useState("2028-08-01");
  const [modalEndDate, setModalEndDate] = useState("2028-08-05");
  const [mountNow] = useState(() => new Date());
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [historyScope, setHistoryScope] = useState("archived"); // "archived" | "all_closed"

  // Helper to extract ISO date strings or fallback
  const getBookingDates = (booking) => {
    let s = booking.startDateISO;
    let e = booking.endDateISO;
    if (!s || !e) {
      if (booking.dateRange && booking.dateRange.includes(" to ")) {
        const parts = booking.dateRange.split(" to ");
        const d1 = new Date(parts[0]);
        const d2 = new Date(parts[1]);
        if (!isNaN(d1.getTime())) s = d1.toISOString().split("T")[0];
        if (!isNaN(d2.getTime())) e = d2.toISOString().split("T")[0];
      }
    }
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0];
    return {
      s: s || today,
      e: e || nextWeek,
    };
  };

  // Open modal in View mode
  const handleOpenViewModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setViewModalTab("overview");
    setModalStatus(booking.status);
    setModalRejectionReason(booking.rejectionReason || "");
    setModalVoidReason(booking.voidReason || "");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Open modal directly for Reject
  const handleOpenRejectModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setViewModalTab("overview");
    setModalStatus("Rejected");
    setModalRejectionReason(booking.rejectionReason || "Machinery Under Maintenance");
    setModalVoidReason(booking.voidReason || "");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Build audit timeline events for modal Activity History
  const getBookingTimelineEvents = (b) => {
    if (!b) return [];
    if (Array.isArray(b.timeline) && b.timeline.length > 0) {
      return b.timeline.map((t) => ({
        title: t.title || "Booking Milestone",
        timestamp: t.timestamp,
        actor: t.actor || "Member",
        note: t.note || "",
        status: t.event || "created",
      }));
    }

    const events = [
      {
        title: "Booking Request Submitted",
        timestamp: b.createdAt || b.bookingDate,
        actor: `Member (${b.clientName})`,
        note: `Rental requested for ${b.plan} on ${b.machineryModel}. Payment method: ${b.paymentMethod || "Cash"} (${b.paymentStatus}).`,
        status: "created",
      },
    ];

    if (b.approvedAt || ["Approved", "Ongoing", "Returned"].includes(b.status)) {
      events.push({
        title: "Booking Approved",
        timestamp: b.approvedAt || b.bookingDate,
        actor: "Manager",
        note: `Approved for fleet assignment (${b.machineryUnitId || b.machineryModel}). Operator: ${b.hasDriver ? b.assignedDriver : "Self-Operated"}.`,
        status: "approved",
      });
    }

    if (b.dispatchedAt || ["Ongoing", "Returned"].includes(b.status)) {
      events.push({
        title: "Machinery Dispatched / In Operation",
        timestamp: b.dispatchedAt || b.startDate,
        actor: "Dispatch Office",
        note: `Machinery released for scheduled operations at ${b.farmFormattedAddress || b.farmLocation || "Member Site"}.`,
        status: "dispatched",
      });
    }

    if (b.returnedAt || b.status === "Returned") {
      events.push({
        title: "Machinery Returned & Inspection Completed",
        timestamp: b.returnedAt || b.endDate,
        actor: "Fleet Inspector",
        note: "Rental completed. Machinery safely returned to cooperative depot with post-operation inspection verified.",
        status: "returned",
      });
    }

    if (b.cancellationRequested) {
      events.push({
        title: "Cancellation Requested",
        timestamp: b.cancellationRequestedAt || new Date(),
        actor: "Member",
        note: b.cancellationReason || "Member submitted a cancellation request via member portal.",
        status: "cancellation_requested",
      });
    }

    if (b.status === "Rejected") {
      events.push({
        title: "Booking Rejected",
        timestamp: new Date(),
        actor: "Manager",
        note: modalRejectionReason || b.rejectionReason || "Booking request was rejected.",
        status: "rejected",
      });
    }

    if (b.status === "Voided") {
      events.push({
        title: "Booking Voided",
        timestamp: new Date(),
        actor: "Manager",
        note: modalVoidReason || b.voidReason || "Booking was administratively voided.",
        status: "voided",
      });
    }

    if (b.status === "Rescheduled") {
      events.push({
        title: "Booking Rescheduled",
        timestamp: new Date(),
        actor: "Manager",
        note: `Schedule adjusted to ${modalStartDate && modalEndDate ? `${modalStartDate} to ${modalEndDate}` : b.dateRange}.`,
        status: "rescheduled",
      });
    }

    return events;
  };

  // Open modal directly for Reschedule
  const handleOpenRescheduleModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setModalStatus("Rescheduled");
    setModalRejectionReason(booking.rejectionReason || "");
    setModalVoidReason(booking.voidReason || "");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Open modal directly for Void
  const handleOpenVoidModal = (booking) => {
    const dates = getBookingDates(booking);
    setViewingBooking(booking);
    setModalStatus("Voided");
    setModalRejectionReason(booking.rejectionReason || "");
    setModalVoidReason(booking.voidReason || "Administrative Cancellation");
    setModalStartDate(dates.s);
    setModalEndDate(dates.e);
  };

  // Close modal without saving (changes are discarded)
  const handleCloseViewModal = () => {
    setViewingBooking(null);
    setModalStatus("");
    setModalRejectionReason("");
    setModalVoidReason("");
  };

  // Save changes from modal
  const handleSaveModalStatus = async () => {
    if (!viewingBooking) return;
    const currentId = viewingBooking.id;
    const currentRawId = viewingBooking.rawId;
    const targetStatus = modalStatus || viewingBooking.status;

    const updatedFields = {
      status: targetStatus,
    };

    if (targetStatus === "Rejected") {
      updatedFields.rejectionReason = modalRejectionReason || "No reason specified";
    }

    if (targetStatus === "Voided") {
      updatedFields.voidReason = modalVoidReason || "Administrative Cancellation";
    }

    if (targetStatus === "Rescheduled" && modalStartDate && modalEndDate) {
      const d1 = new Date(modalStartDate);
      const d2 = new Date(modalEndDate);
      const diffTime = Math.max(0, d2 - d1);
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const dailyRate = viewingBooking.dailyRate || 2800;
      const totalAmount = dailyRate * days;

      const formattedStart = d1.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const formattedEnd = d2.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      updatedFields.startDateISO = modalStartDate;
      updatedFields.endDateISO = modalEndDate;
      updatedFields.plan = `${days} Day${days === 1 ? "" : "s"}`;
      updatedFields.daysCount = days;
      updatedFields.dateRange = `${formattedStart} to ${formattedEnd}`;
      updatedFields.paymentAmount = `₱${totalAmount.toLocaleString()}`;
    }

    // Save in local overrides
    setStatusOverrides((prev) => ({
      ...prev,
      [currentId]: targetStatus,
      ...(currentRawId ? { [currentRawId]: targetStatus } : {}),
    }));

    setBookingOverrides((prev) => ({
      ...prev,
      [currentId]: { ...(prev[currentId] || {}), ...updatedFields },
      ...(currentRawId ? { [currentRawId]: { ...(prev[currentRawId] || {}), ...updatedFields } } : {}),
    }));

    if (currentRawId) {
      setFeedback({ message: `Updating booking ${currentId} to ${targetStatus}...`, isError: false });
      try {
        const res = await api(`/applications/${currentRawId}`, {
          method: "PATCH",
          body: {
            status: targetStatus === "Voided" ? "Cancelled" : targetStatus,
            rejectionReason: updatedFields.rejectionReason,
            voidReason: updatedFields.voidReason,
            startDate: updatedFields.startDateISO,
            endDate: updatedFields.endDateISO,
            isVoid: targetStatus === "Voided",
          },
        });
        if (!res.ok) {
          setFeedback({ message: res.data?.error || `Failed to update status.`, isError: true });
        } else {
          setFeedback({ message: `Booking ${currentId} updated to ${targetStatus}!`, isError: false });
          fetchData();
        }
      } catch (err) {
        setFeedback({ message: `Booking ${currentId} updated locally to ${targetStatus}!`, isError: false });
      }
    } else {
      setFeedback({ message: `Booking ${currentId} updated to ${targetStatus}!`, isError: false });
    }

    setViewingBooking(null);
    setModalStatus("");
    setModalRejectionReason("");
    setModalVoidReason("");
  };

  // Reschedule calculation helpers
  const rescheduleDays = useMemo(() => {
    if (!modalStartDate || !modalEndDate) return 1;
    const d1 = new Date(modalStartDate);
    const d2 = new Date(modalEndDate);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1;
    const diffTime = Math.max(0, d2 - d1);
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(days, 1);
  }, [modalStartDate, modalEndDate]);

  const rescheduleAmount = useMemo(() => {
    const rate = viewingBooking?.dailyRate || 2800;
    return `₱${(rescheduleDays * rate).toLocaleString()}`;
  }, [rescheduleDays, viewingBooking]);

  // Dynamic confirmation label and style based on selected status
  const getConfirmationButtonDetails = () => {
    switch (modalStatus) {
      case "Approved":
        return {
          label: "Confirm Approval",
          bg: "#059669",
        };
      case "Rescheduled":
        return {
          label: "Confirm Reschedule",
          bg: "#7c3aed",
        };
      case "Rejected":
        return {
          label: "Confirm Rejection",
          bg: "#dc2626",
        };
      case "Voided":
        return {
          label: "Confirm Void",
          bg: "#991b1b",
        };
      case "Ongoing":
        return {
          label: "Confirm Ongoing",
          bg: "#0284c7",
        };
      case "Returned":
        return {
          label: "Confirm Return",
          bg: "#1e293b",
        };
      case "Pending":
        return {
          label: "Confirm Pending",
          bg: "#d97706",
        };
      default:
        return {
          label: "Save Changes",
          bg: "var(--wz-primary-red, #ff3b5c)",
        };
    }
  };

  // Add Booking Modal (matches Member Portal Book Now workflow)
  const [showAddModal, setShowAddModal] = useState(false);
  const [machineryUnits, setMachineryUnits] = useState(() => {
    const cached = getCachedApiData("/machinery-units");
    return Array.isArray(cached?.data) ? cached.data : (Array.isArray(cached) ? cached : []);
  });
  const [memberAccounts, setMemberAccounts] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberEmail, setSelectedMemberEmail] = useState("");
  const [newBooking, setNewBooking] = useState(EMPTY_ADD_BOOKING);
  const [addPaymentMethod, setAddPaymentMethod] = useState("Cash");
  const [addCashTiming, setAddCashTiming] = useState("Upon Pickup");
  const [addGcashProof, setAddGcashProof] = useState("");
  const [addGcashPreview, setAddGcashPreview] = useState("");
  const [addCopiedGcash, setAddCopiedGcash] = useState(false);
  const [addAvailability, setAddAvailability] = useState([]);
  const [addCalendarMonth, setAddCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [addDateError, setAddDateError] = useState("");
  const [addFormError, setAddFormError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Fetch live applications, machinery units, and registered member accounts from backend
  const fetchData = async () => {
    try {
      const [appRes, machRes, membersRes] = await Promise.all([
        api("/applications"),
        api("/machinery-units"),
        api("/manager/members"),
      ]);

      if (appRes.ok && Array.isArray(appRes.data)) {
        setLiveBookings(appRes.data);
      }
      if (machRes.ok && machRes.data) {
        const unitsList = Array.isArray(machRes.data?.data)
          ? machRes.data.data
          : Array.isArray(machRes.data)
          ? machRes.data
          : [];
        setMachineryUnits(unitsList);
        if (unitsList.length > 0) {
          const defaultUnit =
            unitsList.find((u) => getAddUnitAvailability(u) === "Available") || unitsList[0];
          setNewBooking((prev) =>
            prev.machineryUnitId || prev.equipment
              ? prev
              : {
                  ...prev,
                  machineryUnitId: defaultUnit.unitId || defaultUnit._id || "",
                  equipment: defaultUnit.name || "",
                }
          );
        }
      }
      if (membersRes.ok && Array.isArray(membersRes.data?.members)) {
        setMemberAccounts(membersRes.data.members);
      }
    } catch (err) {
      console.error("Error loading bookings data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return memberAccounts;
    return memberAccounts.filter((m) =>
      [m.fullName, m.email, m.cooperativeId, m.phone].some((field) =>
        String(field || "").toLowerCase().includes(q)
      )
    );
  }, [memberAccounts, memberSearch]);

  const selectedMember = useMemo(
    () =>
      memberAccounts.find(
        (m) => m.email?.toLowerCase() === selectedMemberEmail.toLowerCase()
      ) || null,
    [memberAccounts, selectedMemberEmail]
  );

  const selectedAddUnit = useMemo(() => {
    if (machineryUnits.length === 0) return null;
    return (
      machineryUnits.find(
        (u) =>
          (newBooking.machineryUnitId &&
            (u.unitId === newBooking.machineryUnitId || u._id === newBooking.machineryUnitId)) ||
          (newBooking.equipment && u.name === newBooking.equipment)
      ) ||
      machineryUnits.find((u) => getAddUnitAvailability(u) === "Available") ||
      machineryUnits[0]
    );
  }, [machineryUnits, newBooking.machineryUnitId, newBooking.equipment]);

  useEffect(() => {
    const targetId = selectedAddUnit?.unitId || selectedAddUnit?._id;
    if (!showAddModal || !targetId) {
      setAddAvailability([]);
      return;
    }
    let ignore = false;
    api(`/machinery-units/${encodeURIComponent(targetId)}/availability`).then((res) => {
      if (ignore) return;
      if (res.ok && Array.isArray(res.data?.data)) {
        setAddAvailability(res.data.data);
      } else {
        setAddAvailability([]);
      }
    });
    return () => {
      ignore = true;
    };
  }, [showAddModal, selectedAddUnit]);

  const addToday = new Date();
  const addMinDate = formatAddDateKey(addToday);

  const addBlockedRanges = useMemo(() => {
    const unitBookings = addAvailability.filter((item) => item.type === "booking");
    const unitMaintenance = addAvailability.filter((item) => item.type === "maintenance");
    return [
      ...unitBookings
        .filter((item) => ["pending", "approved", "checked-out"].includes((item.status || "").toLowerCase()))
        .map((item) => ({
          startDate: item.startDate,
          endDate: item.endDate,
          label: (item.status || "").toLowerCase() === "pending" ? "Pending Approval" : "Reserved / Booked",
        })),
      ...unitMaintenance.map((item) => ({
        startDate: item.startDate,
        endDate: item.endDate,
        label: "Maintenance",
      })),
    ].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  }, [addAvailability]);

  const addMonthNameYear = useMemo(
    () => addCalendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [addCalendarMonth]
  );

  const isAddPrevDisabled = useMemo(
    () =>
      addCalendarMonth.getFullYear() === addToday.getFullYear() &&
      addCalendarMonth.getMonth() === addToday.getMonth(),
    [addCalendarMonth, addToday]
  );

  const addCalendarGrid = useMemo(() => {
    const year = addCalendarMonth.getFullYear();
    const month = addCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const items = [];
    for (let i = 0; i < firstDay; i++) {
      items.push({ isBlank: true, key: `blank-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = formatAddDateKey(new Date(year, month, d));
      items.push({
        isBlank: false,
        dayNum: d,
        key,
        isPast: key < addMinDate,
        isBooked: isAddDateKeyBooked(key, addBlockedRanges),
      });
    }
    return items;
  }, [addCalendarMonth, addMinDate, addBlockedRanges]);

  const addUnitRatePerHectare = Number(
    selectedAddUnit?.ratePerHectare || selectedAddUnit?.memberRate || 2500
  );
  const addRequestedHectares = Math.max(0.1, Number(newBooking.hectares) || 1);
  const addEstimatedCost = Math.round(addUnitRatePerHectare * addRequestedHectares);

  const addScheduledDaysCount = useMemo(() => {
    if (!newBooking.startDate || !newBooking.endDate || newBooking.endDate < newBooking.startDate) return 0;
    const s = new Date(`${newBooking.startDate}T00:00:00`);
    const e = new Date(`${newBooking.endDate}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }, [newBooking.startDate, newBooking.endDate]);

  const isAddStartBooked = isAddDateKeyBooked(newBooking.startDate, addBlockedRanges);
  const isAddEndBooked = isAddDateKeyBooked(newBooking.endDate, addBlockedRanges);
  const isAddRangeBlocked = hasAddBookedDatesInRange(
    newBooking.startDate,
    newBooking.endDate,
    addBlockedRanges
  );
  const isAddDatesInvalid = Boolean(
    !newBooking.startDate ||
      !newBooking.endDate ||
      newBooking.endDate < newBooking.startDate ||
      isAddStartBooked ||
      isAddEndBooked ||
      isAddRangeBlocked
  );

  // Format and merge live bookings with sample records
  const mergedBookings = useMemo(() => {
    const formattedLive = liveBookings.map((item, idx) => {
      // Calculate duration in days
      let days = 1;
      if (item.startDate && item.endDate) {
        const diffTime = Math.abs(new Date(item.endDate) - new Date(item.startDate));
        days = Math.max(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1, 1);
      }

      // Map status
      let displayStatus = "Pending";
      const s = (item.status || "").toLowerCase();
      if (item.cancellationRequested || s === "cancellation requested") displayStatus = "Cancellation Requested";
      else if (s === "approved") displayStatus = "Approved";
      else if (s === "checked-out") displayStatus = "Ongoing";
      else if (s === "returned") displayStatus = "Returned";
      else if (s === "cancelled" || s === "rejected") displayStatus = "Cancelled";
      else if (s === "pending") displayStatus = "Pending";

      // Detect category
      const eq = (item.equipment || "").toLowerCase();
      let cat = "Tractor";
      if (eq.includes("harvester")) cat = "Harvester";
      else if (eq.includes("baler")) cat = "Baler";
      else if (eq.includes("rake") || eq.includes("mower")) cat = "Mower / Rake";
      else if (eq.includes("sprayer")) cat = "Sprayer";
      else if (eq.includes("hauler") || eq.includes("truck")) cat = "Transport";

      const dailyRate = item.financials?.dailyRate || item.ratePerHectare || 2800;
      const totalAmount = item.totalAmount || (dailyRate * days) || item.financials?.totalPaid;

      const clientName = item.memberName || item.farmerName || item.memberEmail || "Member";
      const clientEmail = item.memberEmail || item.clientEmail || `${clientName.toLowerCase().replace(/\s+/g, ".")}@example.com`;
      const clientPhone = item.farmerPhone || item.memberPhone || item.clientPhone || item.phone || (idx % 2 === 0 ? "+63 917 123 4567" : "+63 928 234 5678");
      const clientAddress = item.memberAddress || item.clientAddress || "Kalilangan, Bukidnon";
      const rawAvatar =
        item.clientAvatar ||
        item.avatar ||
        (item.memberEmail ? localStorage.getItem(`kimpc-avatar-${item.memberEmail}`) : null);
      let clientAvatar = "";
      if (rawAvatar && typeof rawAvatar === "string" && rawAvatar.trim()) {
        const trimmed = rawAvatar.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
          clientAvatar = trimmed;
        } else {
          clientAvatar = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
        }
      }
      if (!clientAvatar) {
        clientAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(clientName)}&background=0284c7&color=fff&bold=true`;
      }
      const coopId = item.coopId || `COOP-MB-${String(item._id || idx).slice(-4).toUpperCase()}`;
      const receiptNo = item.receiptNo || (item._id ? `REC-${new Date().getFullYear()}-${String(item._id).slice(-4).toUpperCase()}` : `REC-2028-0${10 + idx}`);
      const paymentMethod = item.paymentMethod || "Cash";
      const cashPaymentOption = item.cashPaymentOption || (paymentMethod === "Cash" ? "Upon Pickup" : "");
      const gcashProof = item.gcashProof || null;
      const hectares = item.hectares || 1;
      const assignedDriver = item.assignedDriver || (idx % 2 === 0 ? "John Adams" : "Self-Operated");
      const hasDriver = Boolean(item.assignedDriver ? item.assignedDriver !== "Self-Operated" : idx % 2 === 0);

      return {
        id: item.displayId || `BK-WZ${1010 + idx}`,
        rawId: item._id || item.id,
        bookingDate: item.submittedAt
          ? new Date(item.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : (item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Aug 1, 2028"),
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        clientAvatar,
        coopId,
        receiptNo,
        paymentReference: item.paymentReference || "",
        paymentDateTime: item.paymentDateTime || "",
        receivedBy: item.receivedBy || "",
        paymentMethod,
        cashPaymentOption,
        gcashProof,
        hectares,
        dailyRate,
        daysCount: days,
        assignedDriver,
        driverPhone: item.driverPhone || "",
        machineryUnitId: item.machineryUnitId || "",
        machineryModel: item.equipment,
        category: cat,
        plan: item.hectares ? `${item.hectares} ha (${days}d)` : `${days} Day${days === 1 ? "" : "s"}`,
        startDate: item.startDate || "",
        endDate: item.endDate || "",
        dateRange: `${item.startDate} to ${item.endDate}`,
        hasDriver,
        paymentAmount: `₱${Number(totalAmount).toLocaleString()}`,
        ...(() => {
          const fin = computePaymentSummary(item);
          return {
            totalAmountNum: fin.rentalCharge,
            paidAmountNum: fin.grossPaid,
            balanceAmountNum: fin.balanceDue,
            refundedAmountNum: fin.totalRefunded,
            paymentStatus: fin.paymentStatus,
            status: fin.isVoidedBooking ? "Voided" : displayStatus,
          };
        })(),
        cancellationRequested: Boolean(item.cancellationRequested || s === "cancellation requested"),
        cancellationReason: item.cancellationReason || "",
        cancellationRequestedAt: item.cancellationRequestedAt || null,
        farmLocation: item.farmLocation || "",
        farmFormattedAddress: item.farmFormattedAddress || item.farmLocation || "",
        farmCoordinates: item.farmCoordinates || null,
        bookingType: item.bookingType || "hectare",
        managerRemarks: item.managerRemarks || "",
        timeline: Array.isArray(item.timeline) ? item.timeline : [],
        rescheduleHistory: Array.isArray(item.rescheduleHistory) ? item.rescheduleHistory : [],
        approvedAt: item.approvedAt || null,
        dispatchedAt: item.dispatchedAt || null,
        returnedAt: item.returnedAt || null,
        cancelledAt: item.cancelledAt || null,
        bookingVoidedAt: item.bookingVoidedAt || null,
        rescheduledAt: item.rescheduledAt || null,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null,
        isLive: true,
      };
    });

    // Use strictly live booking data from MongoDB
    const base = formattedLive;

    return base
      .filter((b) => !deletedIds.includes(b.id))
      .map((b) => {
        const extra = bookingOverrides[b.id] || (b.rawId && bookingOverrides[b.rawId]) || {};
        const st = statusOverrides[b.id] || (b.rawId && statusOverrides[b.rawId]) || extra.status || b.status;
        const paymentStatus = extra.paymentStatus || b.paymentStatus;
        const totalAmtNum = Number(b.totalAmountNum ?? 0) || 0;
        const paidAmtNum = Number(b.paidAmountNum || 0) || 0;
        const balanceAmtNum = b.balanceAmountNum !== undefined ? Number(b.balanceAmountNum) : Math.max(0, totalAmtNum - paidAmtNum);
        const paymentAmount = totalAmtNum > 0 ? `₱${totalAmtNum.toLocaleString()}` : extra.paymentAmount || b.paymentAmount;
        const paymentMethod = extra.paymentMethod || b.paymentMethod;
        const paymentType = extra.paymentType || b.paymentType || "Full Rental Payment";
        const dateReceived = extra.dateReceived || b.paymentDateTime || b.dateReceived || "";
        const receiptNo = extra.receiptNo || b.receiptNo || `OR-${new Date().getFullYear()}-${String(b.id).replace(/\D/g, "")}`;
        const referenceNumber = extra.referenceNumber || b.paymentReference || "";
        const proofOfPayment = extra.proofOfPayment || b.proofOfPayment || b.gcashProof || null;
        const notes = extra.notes || b.notes || "";
        const recordedBy = extra.recordedBy || b.receivedBy || b.recordedBy || user?.fullName || user?.email || "Manager";

        return {
          ...b,
          ...extra,
          status: st,
          paymentStatus,
          paymentAmount,
          paidAmountNum: paidAmtNum,
          balanceAmountNum: balanceAmtNum,
          paymentMethod,
          paymentType,
          dateReceived,
          receiptNo,
          referenceNumber,
          proofOfPayment,
          notes,
          recordedBy,
        };
      });
  }, [liveBookings, statusOverrides, bookingOverrides, deletedIds, user]);

  const closedHistoryBookings = useMemo(() => {
    return mergedBookings
      .filter((b) => isHistoryEligibleStatus(b.status))
      .sort((a, b) => {
        const da = getBookingHistoryReferenceDate(a)?.getTime() || 0;
        const db = getBookingHistoryReferenceDate(b)?.getTime() || 0;
        return db - da;
      });
  }, [mergedBookings]);

  const archivedHistoryBookings = useMemo(
    () => closedHistoryBookings.filter((b) => isBookingOlderThanThreeMonths(b, mountNow)),
    [closedHistoryBookings, mountNow]
  );

  // Filtered bookings based on active/history mode, search & dropdowns
  const filteredBookings = useMemo(() => {
    const baseSource = isHistoryView
      ? historyScope === "archived"
        ? archivedHistoryBookings
        : closedHistoryBookings
      : mergedBookings.filter((b) => !isBookingOlderThanThreeMonths(b, mountNow));

    const q = searchQuery.trim().toLowerCase();
    const targetStatus = filterStatus.toLowerCase();

    let result = baseSource.filter((b) => {
      // Search filter
      const matchesSearch =
        !q ||
        b.clientName.toLowerCase().includes(q) ||
        (b.clientPhone && b.clientPhone.toLowerCase().includes(q)) ||
        b.machineryModel.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q);

      // Category filter
      const matchesType =
        filterType === "All" || b.category.toLowerCase().includes(filterType.toLowerCase());

      // Status filter
      const bStatus = String(b.status || "").trim().toLowerCase();
      const matchesStatus =
        filterStatus === "All" ||
        bStatus === targetStatus ||
        (targetStatus === "cancelled" && bStatus === "canceled") ||
        (targetStatus === "canceled" && bStatus === "cancelled");

      return matchesSearch && matchesType && matchesStatus;
    });

    result.sort((a, b) => {
      if (sortBy === "date_asc") return (a.startDate || "").localeCompare(b.startDate || "");
      if (sortBy === "date_desc") return (b.startDate || "").localeCompare(a.startDate || "");
      if (sortBy === "client_asc") return (a.clientName || "").localeCompare(b.clientName || "");
      if (sortBy === "client_desc") return (b.clientName || "").localeCompare(a.clientName || "");
      if (sortBy === "id_asc") return (a.id || "").localeCompare(b.id || "");
      return 0;
    });

    return result;
  }, [
    isHistoryView,
    historyScope,
    archivedHistoryBookings,
    closedHistoryBookings,
    mergedBookings,
    mountNow,
    searchQuery,
    filterType,
    filterStatus,
    sortBy,
  ]);

  const totalPages = Math.ceil(filteredBookings.length / pageSize) || 1;
  const paginatedBookings = useMemo(() => {
    return filteredBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredBookings, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterStatus, sortBy, isHistoryView, historyScope]);

  // ================= Dynamic KPI Counts directly derived from Machinery Bookings =================
  // 1. Pending Bookings: Pending manager confirmation/review
  const pendingCount = useMemo(() => {
    return mergedBookings.filter((b) => (b.status || "").toLowerCase() === "pending").length;
  }, [mergedBookings]);

  // 2. Ongoing Bookings: Ongoing machinery rentals in the field
  const ongoingCount = useMemo(() => {
    return mergedBookings.filter((b) => (b.status || "").toLowerCase() === "ongoing").length;
  }, [mergedBookings]);

  // 3. Canceled Bookings: Cancelled and Rejected bookings (strictly excluding Void)
  const canceledCount = useMemo(() => {
    return mergedBookings.filter((b) => {
      const s = (b.status || "").toLowerCase();
      return (s === "cancelled" || s === "canceled" || s === "rejected") && s !== "void" && s !== "voided";
    }).length;
  }, [mergedBookings]);

  // 4. Completed Bookings: Returned or Completed
  const completedCount = useMemo(() => {
    return mergedBookings.filter((b) => {
      const s = (b.status || "").toLowerCase();
      return s === "returned" || s === "completed";
    }).length;
  }, [mergedBookings]);

  const totalBookingsCount = mergedBookings.length;

  // Dynamic KPI trend analysis (Increase, Decrease, or As Is) based on machinery bookings
  const kpiTrends = useMemo(() => {
    const computeForPredicate = (predicate) => {
      if (!mergedBookings || mergedBookings.length === 0) {
        return { direction: "as_is", pct: 0 };
      }
      // Sort chronologically (oldest first)
      const sorted = [...mergedBookings].sort((a, b) => {
        const da = new Date(a.bookingDate || a.startDate || 0).getTime();
        const db = new Date(b.bookingDate || b.startDate || 0).getTime();
        if (da !== db) return da - db;
        return (a.id || "").localeCompare(b.id || "");
      });

      const mid = Math.floor(sorted.length / 2);
      const priorList = sorted.slice(0, mid);
      const recentList = sorted.slice(mid);

      const prior = priorList.filter(predicate).length;
      const recent = recentList.filter(predicate).length;

      if (recent > prior) {
        const base = prior > 0 ? prior : 1;
        const pct = Math.round(((recent - prior) / base) * 100);
        return { direction: "increase", pct };
      } else if (recent < prior) {
        const base = prior > 0 ? prior : 1;
        const pct = Math.round(((prior - recent) / base) * 100);
        return { direction: "decrease", pct };
      } else {
        return { direction: "as_is", pct: 0 };
      }
    };

    return {
      pending: computeForPredicate((b) => (b.status || "").toLowerCase() === "pending"),
      ongoing: computeForPredicate((b) => (b.status || "").toLowerCase() === "ongoing"),
      canceled: computeForPredicate((b) => {
        const s = (b.status || "").toLowerCase();
        return (s === "cancelled" || s === "canceled" || s === "rejected") && s !== "void" && s !== "voided";
      }),
      completed: computeForPredicate((b) => {
        const s = (b.status || "").toLowerCase();
        return s === "returned" || s === "completed";
      }),
    };
  }, [mergedBookings]);

  // Helper to render KPI trend: strictly arrow and percentage (e.g. ↑ 200%, ↓ 50%, or 0%), no signs or words, no container
  const renderTrend = (trend, incColor = "#16a34a", decColor = "#dc2626") => {
    if (!trend) return null;
    const { direction, pct } = trend;
    if (direction === "increase" && pct > 0) {
      return (
        <span className="wz-kpi-trend-plain" style={{ color: incColor }}>
          ↑ {pct}%
        </span>
      );
    }
    if (direction === "decrease" && pct > 0) {
      return (
        <span className="wz-kpi-trend-plain" style={{ color: decColor }}>
          ↓ {pct}%
        </span>
      );
    }
    return (
      <span className="wz-kpi-trend-plain" style={{ color: "#64748b" }}>
        0%
      </span>
    );
  };

  // Helper to render sparkline based on trend: "increase" | "decrease" | "as_is"
  const renderSparkline = (direction, color, id) => {
    const gradId = `sparkGrad_${id}`;
    if (direction === "increase") {
      return (
        <div className="wz-sparkline-container" title="Trending Up">
          <svg width="52" height="26" viewBox="0 0 100 50" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 38 C 25 36, 45 28, 65 20 C 80 14, 90 12, 100 10 L 100 50 L 0 50 Z"
              fill={`url(#${gradId})`}
            />
            <path
              d="M 0 38 C 25 36, 45 28, 65 20 C 80 14, 90 12, 100 10"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    }
    if (direction === "decrease") {
      return (
        <div className="wz-sparkline-container" title="Trending Down">
          <svg width="52" height="26" viewBox="0 0 100 50" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 10 C 25 12, 45 22, 65 30 C 80 38, 90 40, 100 42 L 100 50 L 0 50 Z"
              fill={`url(#${gradId})`}
            />
            <path
              d="M 0 10 C 25 12, 45 22, 65 30 C 80 38, 90 40, 100 42"
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    }
    // "as_is"
    return (
      <div className="wz-sparkline-container" title="Steady">
        <svg width="52" height="26" viewBox="0 0 100 50" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 25 C 25 24, 50 26, 75 24 C 90 25, 95 25, 100 25 L 100 50 L 0 50 Z"
            fill={`url(#${gradId})`}
          />
          <path
            d="M 0 25 C 25 24, 50 26, 75 24 C 90 25, 95 25, 100 25"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  };

  // ================= Bookings Overview Chart Data (This Year [Active Months] or All Years) =================
  const chartData = useMemo(() => {
    const currentYear = new Date().getFullYear();

    if (chartPeriod === "This Year") {
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];

      // Check if bookings exist for currentYear, otherwise fallback to primary year in data
      const hasCurrentYearBookings = mergedBookings.some((b) => {
        const dStr = b.bookingDate || b.startDate || b.submittedAt || b.createdAt;
        if (!dStr) return false;
        const d = new Date(dStr);
        return !isNaN(d.getTime()) && d.getFullYear() === currentYear;
      });

      const targetYear = hasCurrentYearBookings
        ? currentYear
        : (mergedBookings.length > 0
            ? new Date(mergedBookings[0].bookingDate || mergedBookings[0].startDate || 0).getFullYear() || currentYear
            : currentYear);

      const monthTallies = {};

      mergedBookings.forEach((b) => {
        const dStr = b.bookingDate || b.startDate || b.submittedAt || b.createdAt;
        if (!dStr) return;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return;

        if (d.getFullYear() === targetYear) {
          const mIdx = d.getMonth();
          if (!monthTallies[mIdx]) {
            monthTallies[mIdx] = {
              monthIndex: mIdx,
              label: monthNames[mIdx],
              doneCount: 0,
              canceledCount: 0,
            };
          }
          const s = (b.status || "").toLowerCase();
          if (s === "returned" || s === "completed" || s === "ongoing" || s === "approved") {
            monthTallies[mIdx].doneCount += 1;
          } else if (s === "cancelled" || s === "canceled" || s === "rejected") {
            monthTallies[mIdx].canceledCount += 1;
          }
        }
      });

      // Filter: if that month has no data then don't put!
      return Object.values(monthTallies)
        .filter((item) => item.doneCount > 0 || item.canceledCount > 0)
        .sort((a, b) => a.monthIndex - b.monthIndex);
    }

    // "By Year" / "All Years"
    const yearTallies = {};
    mergedBookings.forEach((b) => {
      const dStr = b.bookingDate || b.startDate || b.submittedAt || b.createdAt;
      if (!dStr) return;
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return;
      const yr = d.getFullYear();
      if (!yearTallies[yr]) {
        yearTallies[yr] = {
          label: String(yr),
          year: yr,
          doneCount: 0,
          canceledCount: 0,
        };
      }
      const s = (b.status || "").toLowerCase();
      if (s === "returned" || s === "completed" || s === "ongoing" || s === "approved") {
        yearTallies[yr].doneCount += 1;
      } else if (s === "cancelled" || s === "canceled" || s === "rejected") {
        yearTallies[yr].canceledCount += 1;
      }
    });

    return Object.values(yearTallies)
      .filter((y) => y.doneCount > 0 || y.canceledCount > 0)
      .sort((a, b) => a.year - b.year);
  }, [chartPeriod, mergedBookings]);

  // Handle status update (Approve / Reject / Change status)
  const handleUpdateStatus = async (bookingId, rawId, newStatus) => {
    setStatusOverrides((prev) => ({
      ...prev,
      [bookingId]: newStatus,
      ...(rawId ? { [rawId]: newStatus } : {}),
    }));

    // Update currently viewed booking if open so the modal updates immediately
    setViewingBooking((prev) =>
      prev && (prev.id === bookingId || prev.rawId === rawId)
        ? { ...prev, status: newStatus }
        : prev
    );

    if (rawId) {
      setFeedback({ message: `Updating booking to ${newStatus}...`, isError: false });
      try {
        const res = await api(`/applications/${rawId}`, {
          method: "PATCH",
          body: { status: newStatus },
        });
        if (!res.ok) {
          setFeedback({ message: res.data?.error || `Failed to update status.`, isError: true });
          return;
        }
        setFeedback({ message: `Booking marked as ${newStatus} successfully!`, isError: false });
        fetchData();
      } catch (err) {
        setFeedback({ message: `Booking ${bookingId} marked as ${newStatus} locally.`, isError: false });
      }
    } else {
      setFeedback({ message: `Booking ${bookingId} marked as ${newStatus}!`, isError: false });
    }
  };

  // Grant cancellation requested by member
  const handleGrantCancellation = async (rawId) => {
    if (!window.confirm("Grant member cancellation request? This will mark the booking as Cancelled, release the machinery unit, and notify the member.")) {
      return;
    }
    setFeedback({ message: "Granting cancellation request...", isError: false });
    try {
      const res = await api(`/applications/${rawId}/grant-cancellation`, { method: "POST" });
      if (res.ok) {
        setFeedback({ message: "Cancellation request granted. Booking marked as Cancelled.", isError: false });
        setViewingBooking(null);
        fetchData();
      } else {
        setFeedback({ message: res.data?.error || "Failed to grant cancellation.", isError: true });
      }
    } catch (err) {
      setFeedback({ message: "Error granting cancellation.", isError: true });
    }
  };

  // Decline cancellation requested by member
  const handleDeclineCancellation = async (rawId) => {
    if (!window.confirm("Decline member cancellation request? This will revert the booking to Approved status and notify the member.")) {
      return;
    }
    setFeedback({ message: "Declining cancellation request...", isError: false });
    try {
      const res = await api(`/applications/${rawId}/decline-cancellation`, { method: "POST" });
      if (res.ok) {
        setFeedback({ message: "Cancellation request declined. Booking reverted to Approved.", isError: false });
        setViewingBooking(null);
        fetchData();
      } else {
        setFeedback({ message: res.data?.error || "Failed to decline cancellation.", isError: true });
      }
    } catch (err) {
      setFeedback({ message: "Error declining cancellation.", isError: true });
    }
  };

  // Handle Delete Booking
  const handleDeleteBooking = (id) => {
    if (window.confirm(`Are you sure you want to delete booking ${id}?`)) {
      setDeletedIds((prev) => [...prev, id]);
      setFeedback({ message: `Booking ${id} deleted successfully.`, isError: false });
    }
  };

  const handleOpenAddModal = () => {
    const defaultUnit =
      machineryUnits.find((u) => getAddUnitAvailability(u) === "Available") ||
      machineryUnits[0] ||
      null;
    const now = new Date();
    setSelectedMemberEmail("");
    setMemberSearch("");
    setNewBooking({
      machineryUnitId: defaultUnit?.unitId || defaultUnit?._id || "",
      equipment: defaultUnit?.name || "",
      memberPhone: "",
      hectares: 1,
      location: "",
      startDate: "",
      endDate: "",
    });
    setAddPaymentMethod("Cash");
    setAddCashTiming("Upon Pickup");
    setAddGcashProof("");
    setAddGcashPreview("");
    setAddCopiedGcash(false);
    setAddCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setAddDateError("");
    setAddFormError("");
    setShowAddModal(true);
  };

  const handleSelectMemberAccount = (member) => {
    setSelectedMemberEmail(member.email);
    setAddFormError("");
    setNewBooking((prev) => ({
      ...prev,
      memberPhone: member.phone || prev.memberPhone || "",
      location:
        prev.location && prev.location.trim()
          ? prev.location
          : member.defaultFarmLocation || member.address || "",
    }));
  };

  const handleSelectAddUnit = (unitKey) => {
    const unit = machineryUnits.find(
      (u) => (u.unitId || u._id || u.name) === unitKey
    );
    setAddDateError("");
    setAddFormError("");
    setNewBooking((prev) => ({
      ...prev,
      machineryUnitId: unit?.unitId || unit?._id || "",
      equipment: unit?.name || "",
      startDate: "",
      endDate: "",
    }));
  };

  const handleAddPrevMonth = () => {
    setAddCalendarMonth((prev) => {
      const target = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      const minMonth = new Date(addToday.getFullYear(), addToday.getMonth(), 1);
      return target < minMonth ? minMonth : target;
    });
  };

  const handleAddNextMonth = () => {
    setAddCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleAddClearDates = () => {
    setNewBooking((prev) => ({ ...prev, startDate: "", endDate: "" }));
    setAddDateError("");
    setAddFormError("");
  };

  const handleAddCalendarDayClick = (dayKey) => {
    if (isAddDateKeyBooked(dayKey, addBlockedRanges)) return;
    setAddDateError("");
    setAddFormError("");
    if (
      !newBooking.startDate ||
      (newBooking.startDate &&
        newBooking.endDate &&
        newBooking.startDate !== newBooking.endDate)
    ) {
      setNewBooking((prev) => ({ ...prev, startDate: dayKey, endDate: dayKey }));
      return;
    }
    if (dayKey < newBooking.startDate) {
      setNewBooking((prev) => ({ ...prev, startDate: dayKey, endDate: dayKey }));
    } else if (dayKey === newBooking.startDate) {
      setNewBooking((prev) => ({ ...prev, endDate: dayKey }));
    } else {
      if (hasAddBookedDatesInRange(newBooking.startDate, dayKey, addBlockedRanges)) {
        setAddDateError(
          "The period between selected dates contains reserved days. Please select an available continuous range."
        );
        setNewBooking((prev) => ({ ...prev, startDate: dayKey, endDate: dayKey }));
        return;
      }
      setNewBooking((prev) => ({ ...prev, endDate: dayKey }));
    }
  };

  const handleAddStartDateChange = (val) => {
    setAddDateError("");
    setAddFormError("");
    if (!val) {
      setNewBooking((prev) => ({ ...prev, startDate: "" }));
      return;
    }
    const d = new Date(`${val}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      setAddCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    if (isAddDateKeyBooked(val, addBlockedRanges)) {
      setAddDateError(
        `Selected start date (${val}) is already booked for this machinery. Please choose an available date.`
      );
      setNewBooking((prev) => ({ ...prev, startDate: "" }));
      return;
    }
    setNewBooking((prev) => {
      const nextEnd = prev.endDate && prev.endDate < val ? val : prev.endDate;
      if (nextEnd && hasAddBookedDatesInRange(val, nextEnd, addBlockedRanges)) {
        setAddDateError(
          `The period from ${val} to ${nextEnd} contains booked dates. Choose an available date.`
        );
        return { ...prev, startDate: val, endDate: "" };
      }
      return { ...prev, startDate: val, endDate: nextEnd };
    });
  };

  const handleAddEndDateChange = (val) => {
    setAddDateError("");
    setAddFormError("");
    if (!val) {
      setNewBooking((prev) => ({ ...prev, endDate: "" }));
      return;
    }
    if (isAddDateKeyBooked(val, addBlockedRanges)) {
      setAddDateError(
        `Selected end date (${val}) is already booked for this machinery. Please choose an available date.`
      );
      setNewBooking((prev) => ({ ...prev, endDate: "" }));
      return;
    }
    if (newBooking.startDate && val < newBooking.startDate) {
      setAddDateError("End date must be on or after start date.");
      return;
    }
    if (
      newBooking.startDate &&
      hasAddBookedDatesInRange(newBooking.startDate, val, addBlockedRanges)
    ) {
      setAddDateError(
        `The period from ${newBooking.startDate} to ${val} contains dates that are already booked. Choose continuous available dates.`
      );
      return;
    }
    setNewBooking((prev) => ({ ...prev, endDate: val }));
  };

  const handleAddCopyGcash = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText("09264638983");
      setAddCopiedGcash(true);
      setTimeout(() => setAddCopiedGcash(false), 2000);
    }
  };

  const handleAddGCashFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setAddFormError("GCash screenshot file is too large (maximum 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAddGcashProof(reader.result);
      setAddGcashPreview(reader.result);
      setAddFormError("");
    };
    reader.readAsDataURL(file);
  };

  // Handle Create Booking Submit (identical fields to Member Portal Book Now)
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!selectedMember) {
      setAddFormError("Please select a registered member account.");
      return;
    }
    if (!selectedAddUnit || getAddUnitAvailability(selectedAddUnit) !== "Available") {
      setAddFormError("Please select an available machinery unit.");
      return;
    }
    const cleanPhone = (newBooking.memberPhone || selectedMember.phone || "").trim();
    if (!cleanPhone || cleanPhone.length < 7) {
      setAddFormError("Please provide a valid contact mobile number for this member.");
      return;
    }
    if (!newBooking.location || !newBooking.location.trim()) {
      setAddFormError("Please enter the farm location or address for machinery dispatch.");
      return;
    }
    if (!newBooking.startDate || !newBooking.endDate || isAddDatesInvalid) {
      setAddFormError("Please choose valid available booking dates.");
      return;
    }
    if (addPaymentMethod === "GCash" && !addGcashProof) {
      setAddFormError("Please upload the GCash payment screenshot proof before confirming.");
      return;
    }

    setAddSubmitting(true);
    setAddFormError("");
    setAddDateError("");

    try {
      const res = await api("/applications", {
        method: "POST",
        body: {
          memberEmail: selectedMember.email,
          memberName: selectedMember.fullName,
          equipment: selectedAddUnit.name,
          machineryUnitId: selectedAddUnit.unitId,
          startDate: newBooking.startDate,
          endDate: newBooking.endDate,
          bookingType: "hectare",
          hectares: addRequestedHectares,
          ratePerHectare: addUnitRatePerHectare,
          totalAmount: addEstimatedCost,
          paymentMethod: addPaymentMethod,
          cashPaymentOption: addPaymentMethod === "Cash" ? addCashTiming : "",
          gcashProof: addPaymentMethod === "GCash" ? addGcashProof : "",
          paymentStatus: "Pending",
          farmerPhone: cleanPhone,
          memberPhone: cleanPhone,
          farmLocation: newBooking.location.trim(),
        },
      });

      if (res.ok) {
        setShowAddModal(false);
        setFeedback({ message: "New member booking added successfully!", isError: false });
        setSelectedMemberEmail("");
        setMemberSearch("");
        setNewBooking(EMPTY_ADD_BOOKING);
        setAddGcashProof("");
        setAddGcashPreview("");
        fetchData();
      } else {
        setAddFormError(res.data?.error || "Could not submit the booking request.");
      }
    } catch (err) {
      setAddFormError("Could not submit the booking request.");
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <ManagerSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top bar with Title & User Profile */}
        <ManagerTopbar title="Bookings" />

        {feedback.message && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              marginBottom: "18px",
              fontSize: "0.86rem",
              fontWeight: "600",
              background: feedback.isError ? "#fee2e2" : "#e0f2fe",
              color: feedback.isError ? "#991b1b" : "#0369a1",
              border: `1px solid ${feedback.isError ? "#fca5a5" : "#bae6fd"}`,
            }}
          >
            {feedback.message}
          </div>
        )}

        {/* ================= Top Row: 4 Metric Cards (2x2) + Bookings Overview Chart ================= */}
        <section className="wz-bookings-top-section">
          {/* Left Column: 2x2 KPI Cards */}
          <div className="wz-bookings-kpi-grid">
            {/* Card 1: Pending Bookings */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Pending Bookings</span>
                  <span className="wz-kpi-value">{pendingCount.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                {renderTrend(kpiTrends.pending, "#b45309", "#16a34a")}
                <span className="wz-kpi-subtext">from last week</span>
              </div>
            </div>

            {/* Card 2: Ongoing Bookings */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <path d="M9 16l2 2 4-4" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Ongoing Bookings</span>
                  <span className="wz-kpi-value">{ongoingCount.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                {renderTrend(kpiTrends.ongoing, "#16a34a", "#dc2626")}
                <span className="wz-kpi-subtext">from last week</span>
              </div>
            </div>

            {/* Card 3: Canceled Bookings */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Canceled Bookings</span>
                  <span className="wz-kpi-value">{canceledCount.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                {renderTrend(kpiTrends.canceled, "#dc2626", "#16a34a")}
                <span className="wz-kpi-subtext">from last week</span>
              </div>
            </div>

            {/* Card 4: Completed Bookings */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Completed Bookings</span>
                  <span className="wz-kpi-value">{completedCount.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                {renderTrend(kpiTrends.completed, "#16a34a", "#dc2626")}
                <span className="wz-kpi-subtext">from last week</span>
              </div>
            </div>
          </div>

          {/* Right Column: Bookings Overview Chart */}
          <div className="wz-overview-card">
            <div className="wz-overview-header">
              <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                <h3 className="wz-card-title">Bookings Overview</h3>
                <div className="wz-chart-legend">
                  <span className="wz-legend-pill">
                    <span className="wz-dot-done" /> Done
                  </span>
                  <span className="wz-legend-pill">
                    <span className="wz-dot-canceled" /> Canceled
                  </span>
                </div>

                {/* Clicked year/month stat pill */}
                {clickedItemIndex !== null && chartData[clickedItemIndex] && (
                  <div className="wz-overview-clicked-pill">
                    <span style={{ color: "#475569", fontWeight: 600 }}>
                      {chartPeriod === "This Year"
                        ? `${chartData[clickedItemIndex].label}: `
                        : `Year ${chartData[clickedItemIndex].label}: `}
                    </span>
                    <span style={{ color: "var(--wz-primary-red)", fontWeight: 700 }}>
                      {chartData[clickedItemIndex].doneCount} done
                    </span>
                    <span style={{ color: "#94a3b8", margin: "0 2px" }}>,</span>
                    <span style={{ color: "var(--wz-primary-navy)", fontWeight: 700 }}>
                      {chartData[clickedItemIndex].canceledCount} cancel
                    </span>
                    <button
                      type="button"
                      className="wz-pill-close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setClickedItemIndex(null);
                      }}
                      title="Clear selection"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <select
                className="wz-dropdown-select"
                value={chartPeriod}
                onChange={(e) => {
                  const val = e.target.value;
                  setChartPeriod(val);
                  setClickedItemIndex(null); // Clear selection on period change
                }}
              >
                <option value="This Year">This Year</option>
                <option value="By Year">All Years</option>
              </select>
            </div>

            {/* Bars Chart */}
            <div className="wz-bidi-chart">
              {/* Y Axis Guide: strictly 100, 60, 30, 0 */}
              <div className="wz-chart-y-axis">
                <span>100</span>
                <span>60</span>
                <span>30</span>
                <span>0</span>
              </div>

              {/* Bars Grid */}
              <div
                className="wz-chart-bars-wrap"
                style={{
                  gridTemplateColumns: chartData.length > 0 ? `repeat(${chartData.length}, 1fr)` : "1fr",
                }}
              >
                {/* Horizontal Guide Lines */}
                <div className="wz-chart-grid-line" style={{ top: 0 }} />
                <div className="wz-chart-grid-line" style={{ bottom: "60%" }} />
                <div className="wz-chart-grid-line" style={{ bottom: "30%" }} />
                <div className="wz-chart-baseline" />

                {chartData.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: "0.8rem", gridColumn: "1 / -1" }}>
                    No booking data for this period
                  </div>
                ) : (
                  chartData.map((item, idx) => {
                    const isClicked = clickedItemIndex === idx;
                    // Max is 100
                    const doneHeight = `${Math.min(Math.max((item.doneCount / 100) * 100, item.doneCount > 0 ? 8 : 0), 100)}%`;
                    const cancelHeight = `${Math.min(Math.max((item.canceledCount / 100) * 100, item.canceledCount > 0 ? 8 : 0), 100)}%`;

                    return (
                      <div
                        key={item.label}
                        className={`wz-month-col ${isClicked ? "active-month clicked-month" : ""}`}
                        onClick={() => setClickedItemIndex(clickedItemIndex === idx ? null : idx)}
                        style={{ cursor: "pointer" }}
                        title={`Click to view ${item.label} details`}
                      >
                        {/* Floating tooltip ONLY shown when clicked */}
                        {isClicked && (
                          <div className="wz-chart-tooltip wz-chart-tooltip-clicked" style={{ top: "-54px" }}>
                            <div className="wz-chart-tooltip-title">
                              {chartPeriod === "This Year" ? `${item.label} Bookings` : `Year ${item.label}`}
                            </div>
                            <div className="wz-chart-tooltip-summary" style={{ whiteSpace: "nowrap" }}>
                              <span style={{ color: "var(--wz-primary-red)" }}>{item.doneCount} done</span>,{" "}
                              <span style={{ color: "var(--wz-primary-navy)" }}>{item.canceledCount} cancel</span>
                            </div>
                          </div>
                        )}

                        {/* Side-by-side Bars Container */}
                        <div className="wz-month-bars-group">
                          {/* Done Bar (Red) */}
                          <div
                            className="wz-bar-done"
                            style={{ height: doneHeight }}
                            title={`${item.doneCount} done`}
                          />
                          {/* Canceled Bar (Navy) */}
                          <div
                            className="wz-bar-canceled"
                            style={{ height: cancelHeight }}
                            title={`${item.canceledCount} canceled`}
                          />
                        </div>

                        {/* Label (e.g. Aug, Sep, Oct) */}
                        <span className="wz-month-label">{item.label}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ================= Bookings Toolbar & Action Bar (Outside Table Card, matching Units & Drivers) ================= */}
        <div className="wz-units-toolbar" style={{ marginBottom: "14px" }}>
          <div className="wz-units-left-filters">
            <ManagerSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              placeholder={
                isHistoryView
                  ? "Search history by member, machinery, ID, phone..."
                  : "Search member, machinery, ID, phone..."
              }
              filters={[
                {
                  id: "machineryType",
                  label: "Machinery Type",
                  value: filterType,
                  defaultValue: "All",
                  onChange: setFilterType,
                  options: [
                    { value: "All", label: "All Machinery Types" },
                    { value: "Tractor", label: "Tractor" },
                    { value: "Harvester", label: "Harvester" },
                    { value: "Baler", label: "Baler" },
                    { value: "Mower", label: "Mower / Rake" },
                    { value: "Sprayer", label: "Sprayer" },
                    { value: "Transport", label: "Transport" },
                  ],
                },
                {
                  id: "status",
                  label: "Status",
                  value: filterStatus,
                  defaultValue: "All",
                  onChange: setFilterStatus,
                  options: isHistoryView
                    ? [
                        { value: "All", label: "All History Statuses" },
                        { value: "Returned", label: "Returned" },
                        { value: "Completed", label: "Completed" },
                        { value: "Done", label: "Done" },
                        { value: "Cancelled", label: "Cancelled" },
                        { value: "Rejected", label: "Rejected" },
                        { value: "Voided", label: "Voided" },
                      ]
                    : [
                        { value: "All", label: "All Statuses" },
                        { value: "Pending", label: "Pending" },
                        { value: "Approved", label: "Approved" },
                        { value: "Ongoing", label: "Ongoing" },
                        { value: "Returned", label: "Returned" },
                        { value: "Rescheduled", label: "Rescheduled" },
                        { value: "Rejected", label: "Rejected" },
                        { value: "Voided", label: "Voided" },
                        { value: "Cancelled", label: "Cancelled" },
                      ],
                },
              ]}
              sort={{
                value: sortBy,
                defaultValue: "date_desc",
                onChange: setSortBy,
                options: [
                  { value: "date_desc", label: "Newest Date" },
                  { value: "date_asc", label: "Oldest Date" },
                  { value: "id_asc", label: "Booking ID" },
                  { value: "client_asc", label: "Member (A-Z)" },
                  { value: "client_desc", label: "Member (Z-A)" },
                ],
              }}
            />
          </div>

          <div className="wz-units-right-actions">
            {/* Booking Transaction History Toggle Icon Button (3+ month Completed, Done, Canceled) */}
            <button
              type="button"
              onClick={() => {
                setIsHistoryView((prev) => {
                  const next = !prev;
                  if (next) setHistoryScope("archived");
                  return next;
                });
                setFilterStatus("All");
              }}
              title={
                isHistoryView
                  ? "Return to Active Bookings"
                  : "Booking History (Auto-archived after 3 months for Completed, Done & Canceled)"
              }
              aria-label={isHistoryView ? "Return to active bookings" : "Open booking transaction history"}
              aria-pressed={isHistoryView}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                height: "36px",
                padding: "0 12px",
                borderRadius: "9px",
                border: isHistoryView ? "1px solid #0f172a" : "1px solid var(--wz-border)",
                background: isHistoryView ? "#0f172a" : "#ffffff",
                color: isHistoryView ? "#ffffff" : "#334155",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l3 2" />
              </svg>
              {archivedHistoryBookings.length > 0 && (
                <span
                  style={{
                    background: isHistoryView ? "#ffffff" : "#0f172a",
                    color: isHistoryView ? "#0f172a" : "#ffffff",
                    borderRadius: "999px",
                    padding: "1px 6px",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    lineHeight: 1.3,
                  }}
                >
                  {archivedHistoryBookings.length}
                </span>
              )}
            </button>

            {/* Add Booking Action Button */}
            <button
              className="wz-btn-add-unit"
              onClick={handleOpenAddModal}
            >
              + Add Booking
            </button>
          </div>
        </div>

        {/* ================= Bottom Section: Machinery Bookings Table Card ================= */}
        <section className="wz-table-card" style={{ padding: 0, overflow: "hidden" }}>
          {isHistoryView && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                padding: "14px 20px",
                background: "#f8fafc",
                borderBottom: "1px solid var(--wz-border)",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a" }}>
                    Booking Transaction History
                  </span>
                  <span
                    style={{
                      background: "#e2e8f0",
                      color: "#334155",
                      borderRadius: "999px",
                      padding: "2px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                    }}
                  >
                    {historyScope === "archived"
                      ? `${archivedHistoryBookings.length} Archived`
                      : `${closedHistoryBookings.length} Closed`}
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: "0.76rem", color: "#64748b" }}>
                  Completed, Done (Returned), and Canceled bookings automatically move here after 3 months.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ display: "inline-flex", background: "#e2e8f0", padding: "3px", borderRadius: "9px", gap: "3px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryScope("archived");
                      setFilterStatus("All");
                    }}
                    style={{
                      border: "none",
                      borderRadius: "7px",
                      padding: "5px 11px",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      background: historyScope === "archived" ? "#ffffff" : "transparent",
                      color: historyScope === "archived" ? "#0f172a" : "#475569",
                      boxShadow: historyScope === "archived" ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                    }}
                  >
                    Auto-Archived (3+ Months) ({archivedHistoryBookings.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryScope("all_closed");
                      setFilterStatus("All");
                    }}
                    style={{
                      border: "none",
                      borderRadius: "7px",
                      padding: "5px 11px",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      background: historyScope === "all_closed" ? "#ffffff" : "transparent",
                      color: historyScope === "all_closed" ? "#0f172a" : "#475569",
                      boxShadow: historyScope === "all_closed" ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                    }}
                  >
                    All Completed &amp; Canceled ({closedHistoryBookings.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsHistoryView(false);
                    setFilterStatus("All");
                  }}
                  style={{
                    border: "1px solid var(--wz-border)",
                    borderRadius: "8px",
                    padding: "6px 12px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    background: "#ffffff",
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  &larr; Active Bookings
                </button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="wz-table-responsive">
            <table className="wz-table wz-bookings-table">
              <thead>
                <tr>
                  <th style={{ width: "12%" }}>Status <span className="wz-sort-arrow">↕</span></th>
                  <th style={{ width: "12%" }}>Booking ID <span className="wz-sort-arrow">↕</span></th>
                  <th style={{ width: "22%" }}>Member <span className="wz-sort-arrow">↕</span></th>
                  <th style={{ width: "16%" }}>Phone Number <span className="wz-sort-arrow">↕</span></th>
                  <th style={{ width: "20%" }}>Machinery Model <span className="wz-sort-arrow">↕</span></th>
                  <th style={{ width: "18%" }}>Date <span className="wz-sort-arrow">↕</span></th>
                  <th style={{ width: "10%", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "36px", textAlign: "center", color: "#64748b" }}>
                      {isHistoryView && historyScope === "archived" ? (
                        <div>
                          <div style={{ fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                            No 3+ month archived booking transactions found.
                          </div>
                          <div style={{ fontSize: "0.8rem", marginBottom: closedHistoryBookings.length > 0 ? "12px" : 0 }}>
                            Completed, Done (Returned), and Canceled bookings automatically move here after 3 months.
                          </div>
                          {closedHistoryBookings.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setHistoryScope("all_closed")}
                              style={{
                                background: "#0f172a",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "8px",
                                padding: "7px 14px",
                                fontSize: "0.78rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              View All {closedHistoryBookings.length} Completed &amp; Canceled
                            </button>
                          )}
                        </div>
                      ) : isHistoryView ? (
                        "No completed, done, or canceled booking transactions found matching your search."
                      ) : (
                        "No machinery bookings found matching your search."
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedBookings.map((b) => (
                    <tr key={b.id}>
                      {/* Status Pill (First Column - No Dot) */}
                      <td>
                        <span
                          className={`wz-status-pill wz-status-${b.status.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {b.status}
                        </span>
                      </td>

                      {/* Booking ID */}
                      <td className="wz-booking-id">{b.id}</td>

                      {/* Member Name */}
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <img
                            src={
                              b.clientAvatar ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(b.clientName || "Member")}&background=0284c7&color=fff&bold=true`
                            }
                            alt={b.clientName}
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "50%",
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(b.clientName || "Member")}&background=0284c7&color=fff&bold=true`;
                            }}
                          />
                          <span className="wz-client-name" style={{ whiteSpace: "nowrap" }}>
                            {b.clientName || "Member"}
                          </span>
                        </div>
                      </td>

                      {/* Client Phone Number */}
                      <td style={{ fontSize: "0.78rem", color: "#334155", fontWeight: 600 }}>
                        {b.clientPhone && b.clientPhone !== "—" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#16a34a", flexShrink: 0 }}>
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            <span>{b.clientPhone}</span>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>

                      {/* Machinery Model + Category Badge */}
                      <td>
                        <div className="wz-machinery-cell">
                          <span style={{ fontWeight: 600 }}>{b.machineryModel}</span>
                          <span className="wz-machinery-badge">{b.category}</span>
                        </div>
                      </td>

                      {/* Date Range */}
                      <td style={{ fontSize: "0.82rem", color: "#64748b" }}>
                        <div>{b.dateRange}</div>
                        {isHistoryView && (
                          <div
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              marginTop: "2px",
                              color: isBookingOlderThanThreeMonths(b, mountNow) ? "#059669" : "#64748b",
                            }}
                          >
                            {isBookingOlderThanThreeMonths(b, mountNow)
                              ? "Auto-Archived (3+ mo)"
                              : "Closed (< 3 mo)"}
                          </div>
                        )}
                      </td>

                      {/* Action: 1 action only -> View Details */}
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => handleOpenViewModal(b)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "4px 8px",
                            color: "#059669",
                            fontSize: "0.82rem",
                            fontWeight: "700",
                            cursor: "pointer",
                            display: "inline-block",
                            textDecoration: "none",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#047857";
                            e.currentTarget.style.textDecoration = "underline";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#059669";
                            e.currentTarget.style.textDecoration = "none";
                          }}
                          title="View Details"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Table Footer with Pagination Controls */}
        <div className="wz-table-footer" style={{ marginTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#64748b" }}>
            <span>Results per page:</span>
            <select
              className="wz-dropdown-select"
              value={pageSize}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPageSize(val);
                setCurrentPage(1);
                localStorage.setItem("kimpc_manager_pageSize", String(val));
              }}
            >
              <option value="8">8</option>
              <option value="16">16</option>
              <option value="24">24</option>
              <option value="50">50</option>
            </select>
            <span style={{ marginLeft: "12px" }}>
              Showing {filteredBookings.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filteredBookings.length)} of {filteredBookings.length}{" "}
              {isHistoryView ? "history transactions" : "bookings"}
            </span>
          </div>

          <div className="wz-pagination-btns">
            <button
              className="wz-page-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Previous Page"
            >
              &lt;
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`wz-page-btn ${p === currentPage ? "active" : ""}`}
                onClick={() => setCurrentPage(p)}
              >
                {p}
              </button>
            ))}

            <button
              className="wz-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="Next Page"
            >
              &gt;
            </button>
          </div>
        </div>
      </main>

      {/* ================= Add Booking Modal (Minimalist Member-Parity Design) ================= */}
      {showAddModal && (
        <div
          className="wz-addbook-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAddModal(false);
          }}
        >
          <section
            className="wz-addbook-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wz-addbook-title"
          >
            <div className="wz-addbook-header">
              {selectedAddUnit?.imageUrl ? (
                <img
                  className="wz-addbook-thumb"
                  src={selectedAddUnit.imageUrl}
                  alt={selectedAddUnit.name}
                />
              ) : (
                <div className="wz-addbook-thumb-fallback" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              )}
              <div className="wz-addbook-head-main">
                <h3 id="wz-addbook-title" className="wz-addbook-title">
                  Add New Machinery Booking
                </h3>
                <p className="wz-addbook-meta">
                  {selectedAddUnit
                    ? [selectedAddUnit.name, selectedAddUnit.category, selectedAddUnit.brand, selectedAddUnit.model]
                        .filter(Boolean)
                        .join(" · ")
                    : "Select member account and machinery unit"}
                </p>
              </div>
              {selectedAddUnit && (
                <span className="wz-addbook-rate-pill">
                  {formatAddBookPrice(addUnitRatePerHectare)} / ha
                </span>
              )}
              <button
                type="button"
                className="wz-addbook-close"
                aria-label="Close booking dialog"
                onClick={() => setShowAddModal(false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form className="wz-addbook-form" onSubmit={handleCreateBooking}>
              <div className="wz-addbook-body">
                {/* Section 1: Member & Machinery */}
                <div className="wz-addbook-section">
                  <div className="wz-addbook-section-head">
                    <h4 className="wz-addbook-section-title">Member & Machinery</h4>
                    {selectedMember && (
                      <button
                        type="button"
                        className="wz-addbook-link-btn"
                        onClick={() => {
                          setSelectedMemberEmail("");
                          setMemberSearch("");
                          setAddFormError("");
                        }}
                      >
                        Change member
                      </button>
                    )}
                  </div>

                  <div className="wz-addbook-field">
                    <label className="wz-addbook-label" htmlFor="addbook-member-search">
                      <span>
                        Members <span className="wz-addbook-label-req">*</span>
                      </span>
                      {!selectedMember && (
                        <span className="wz-addbook-unit-tag">
                          {memberAccounts.length} registered
                        </span>
                      )}
                    </label>

                    {!selectedMember ? (
                      <>
                        <div className="wz-addbook-input-wrap">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <input
                            id="addbook-member-search"
                            className="wz-addbook-input"
                            type="search"
                            placeholder="Search member by name, email, or Coop ID..."
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                          />
                        </div>

                        <div className="wz-addbook-member-list" role="listbox" aria-label="Registered system members">
                          {filteredMembers.length > 0 ? (
                            filteredMembers.map((member) => (
                              <button
                                key={member.id || member.email}
                                type="button"
                                className="wz-addbook-member-option"
                                onClick={() => handleSelectMemberAccount(member)}
                              >
                                {member.avatar ? (
                                  <img
                                    src={member.avatar}
                                    alt={member.fullName}
                                    className="wz-addbook-member-avatar"
                                  />
                                ) : (
                                  <span className="wz-addbook-member-avatar">
                                    {getMemberInitials(member.fullName, member.email)}
                                  </span>
                                )}
                                <div className="wz-addbook-member-info">
                                  <div className="wz-addbook-member-name">
                                    <span>{member.fullName}</span>
                                    {member.cooperativeId && (
                                      <span className="wz-addbook-member-badge">
                                        {member.cooperativeId}
                                      </span>
                                    )}
                                  </div>
                                  <div className="wz-addbook-member-sub">
                                    {[member.email, member.phone || "No phone"].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="wz-addbook-member-empty">
                              {memberAccounts.length === 0
                                ? "No active member accounts found in the system."
                                : "No matching member account found."}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="wz-addbook-member-card">
                        <div className="wz-addbook-member-card-left">
                          {selectedMember.avatar ? (
                            <img
                              src={selectedMember.avatar}
                              alt={selectedMember.fullName}
                              className="wz-addbook-member-avatar"
                            />
                          ) : (
                            <span className="wz-addbook-member-avatar">
                              {getMemberInitials(selectedMember.fullName, selectedMember.email)}
                            </span>
                          )}
                          <div className="wz-addbook-member-info">
                            <div className="wz-addbook-member-name">
                              <span>{selectedMember.fullName}</span>
                              {selectedMember.cooperativeId && (
                                <span className="wz-addbook-member-badge">
                                  {selectedMember.cooperativeId}
                                </span>
                              )}
                            </div>
                            <div className="wz-addbook-member-sub">
                              {selectedMember.email}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedMember && (
                    <div className="wz-addbook-field">
                      <label className="wz-addbook-label" htmlFor="addbook-phone">
                        <span>
                          Mobile Number <span className="wz-addbook-label-req">*</span>
                        </span>
                      </label>
                      <div className="wz-addbook-input-wrap">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                        <input
                          id="addbook-phone"
                          className="wz-addbook-input"
                          type="tel"
                          required
                          placeholder="0917 123 4567"
                          value={newBooking.memberPhone}
                          onChange={(e) =>
                            setNewBooking((prev) => ({ ...prev, memberPhone: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="wz-addbook-field">
                    <label className="wz-addbook-label" htmlFor="addbook-machinery">
                      <span>
                        Machinery <span className="wz-addbook-label-req">*</span>
                      </span>
                    </label>
                    <div className="wz-addbook-input-wrap">
                      <select
                        id="addbook-machinery"
                        className="wz-addbook-select"
                        required
                        value={
                          selectedAddUnit?.unitId ||
                          selectedAddUnit?._id ||
                          selectedAddUnit?.name ||
                          ""
                        }
                        onChange={(e) => handleSelectAddUnit(e.target.value)}
                      >
                        {machineryUnits.length > 0 ? (
                          machineryUnits.map((u) => {
                            const avail = getAddUnitAvailability(u);
                            const rate = Number(u.ratePerHectare || u.memberRate || 2500);
                            return (
                              <option
                                key={u.unitId || u._id}
                                value={u.unitId || u._id || u.name}
                                disabled={avail !== "Available"}
                              >
                                {u.name} ({u.category || "Equipment"}) — {formatAddBookPrice(rate)} / ha
                                {avail !== "Available" ? ` (${u.operatingCondition || avail})` : ""}
                              </option>
                            );
                          })
                        ) : (
                          <option value="">No machinery units added yet</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Farmland & Location (matches Member Portal Book Now) */}
                <div className="wz-addbook-section">
                  <div className="wz-addbook-section-head">
                    <h4 className="wz-addbook-section-title">Farmland & Location</h4>
                    <span className="wz-addbook-subtotal">
                      {formatAddBookPrice(addUnitRatePerHectare)} × {addRequestedHectares} ha ={" "}
                      {formatAddBookPrice(addEstimatedCost)}
                    </span>
                  </div>

                  <div className="wz-addbook-field">
                    <label className="wz-addbook-label" htmlFor="addbook-hectares">
                      <span>
                        Area <span className="wz-addbook-label-req">*</span>
                      </span>
                    </label>
                    <div className="wz-addbook-input-wrap">
                      <input
                        id="addbook-hectares"
                        className="wz-addbook-input"
                        type="number"
                        min="0.1"
                        step="0.1"
                        required
                        placeholder="1.0"
                        value={newBooking.hectares}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setNewBooking((prev) => ({
                            ...prev,
                            hectares: isNaN(val) ? "" : Math.max(0.1, val),
                          }));
                        }}
                      />
                      <span className="wz-addbook-unit-tag">ha</span>
                    </div>

                    <div className="wz-addbook-presets">
                      {[0.5, 1, 2, 3, 5, 10].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewBooking((prev) => ({ ...prev, hectares: preset }))}
                          className={`wz-addbook-preset-btn${
                            Number(newBooking.hectares) === preset ? " active" : ""
                          }`}
                        >
                          {preset} ha
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="wz-addbook-field">
                    <label className="wz-addbook-label" htmlFor="addbook-location">
                      <span>
                        Farm Location <span className="wz-addbook-label-req">*</span>
                      </span>
                    </label>
                    <div className="wz-addbook-input-wrap">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <input
                        id="addbook-location"
                        className="wz-addbook-input"
                        type="text"
                        required
                        placeholder="Barangay, Purok / Sitio, Landmark"
                        value={newBooking.location || ""}
                        onChange={(e) =>
                          setNewBooking((prev) => ({ ...prev, location: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Schedule (matches Member Portal Book Now) */}
                <div className="wz-addbook-section">
                  <div className="wz-addbook-section-head">
                    <h4 className="wz-addbook-section-title">Schedule</h4>
                    {newBooking.startDate && (
                      <button
                        type="button"
                        className="wz-addbook-link-btn"
                        onClick={handleAddClearDates}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="wz-addbook-cal-box">
                    <div className="wz-addbook-cal-head">
                      <span className="wz-addbook-cal-month">{addMonthNameYear}</span>
                      <div className="wz-addbook-cal-nav">
                        <button
                          type="button"
                          className="wz-addbook-cal-nav-btn"
                          onClick={handleAddPrevMonth}
                          disabled={isAddPrevDisabled}
                          aria-label="Previous month"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="15 18 9 12 15 6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="wz-addbook-cal-nav-btn"
                          onClick={handleAddNextMonth}
                          aria-label="Next month"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="wz-addbook-cal-weekdays">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                        <div key={dayName}>{dayName}</div>
                      ))}
                    </div>

                    <div className="wz-addbook-cal-grid">
                      {addCalendarGrid.map((d) => {
                        if (d.isBlank) {
                          return <div key={d.key} className="wz-addbook-cal-day is-blank" />;
                        }
                        if (d.isPast) {
                          return (
                            <button
                              key={d.key}
                              type="button"
                              disabled
                              className="wz-addbook-cal-day is-past"
                            >
                              {d.dayNum}
                            </button>
                          );
                        }
                        if (d.isBooked) {
                          return (
                            <button
                              key={d.key}
                              type="button"
                              disabled
                              title="Reserved"
                              className="wz-addbook-cal-day is-booked"
                            >
                              {d.dayNum}
                            </button>
                          );
                        }

                        const isSelectedPoint =
                          newBooking.startDate === d.key || newBooking.endDate === d.key;
                        const inRange = Boolean(
                          newBooking.startDate &&
                            newBooking.endDate &&
                            d.key >= newBooking.startDate &&
                            d.key <= newBooking.endDate
                        );

                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => handleAddCalendarDayClick(d.key)}
                            className={`wz-addbook-cal-day${
                              isSelectedPoint ? " is-selected" : inRange ? " is-in-range" : ""
                            }`}
                          >
                            {d.dayNum}
                          </button>
                        );
                      })}
                    </div>

                    <div className="wz-addbook-cal-legend">
                      <span className="wz-addbook-cal-legend-item">
                        <span className="wz-addbook-cal-dot" />
                        Available
                      </span>
                      <span className="wz-addbook-cal-legend-item">
                        <span className="wz-addbook-cal-dot selected" />
                        Selected
                      </span>
                      <span className="wz-addbook-cal-legend-item">
                        <span className="wz-addbook-cal-dot booked" />
                        Booked
                      </span>
                    </div>
                  </div>

                  <div className="wz-addbook-date-row">
                    <div className="wz-addbook-field">
                      <label className="wz-addbook-label" htmlFor="addbook-start">
                        Start Date
                      </label>
                      <div
                        className="wz-addbook-input-wrap"
                        style={isAddStartBooked ? { borderColor: "#dc2626" } : undefined}
                      >
                        <input
                          id="addbook-start"
                          className="wz-addbook-input"
                          required
                          type="date"
                          min={addMinDate}
                          value={newBooking.startDate}
                          onChange={(e) => handleAddStartDateChange(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="wz-addbook-field">
                      <label className="wz-addbook-label" htmlFor="addbook-end">
                        End Date
                      </label>
                      <div
                        className="wz-addbook-input-wrap"
                        style={
                          isAddEndBooked || isAddRangeBlocked
                            ? { borderColor: "#dc2626" }
                            : undefined
                        }
                      >
                        <input
                          id="addbook-end"
                          className="wz-addbook-input"
                          required
                          type="date"
                          min={newBooking.startDate || addMinDate}
                          value={newBooking.endDate}
                          onChange={(e) => handleAddEndDateChange(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {newBooking.startDate && newBooking.endDate && !isAddDatesInvalid ? (
                    <div className="wz-addbook-status-pill">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>
                        {addScheduledDaysCount} day{addScheduledDaysCount > 1 ? "s" : ""} ·{" "}
                        {formatAddDisplayDate(newBooking.startDate)} –{" "}
                        {formatAddDisplayDate(newBooking.endDate)}
                      </span>
                    </div>
                  ) : newBooking.startDate &&
                    (!newBooking.endDate || newBooking.startDate === newBooking.endDate) ? (
                    <div className="wz-addbook-status-pill">
                      <span>
                        Start: {formatAddDisplayDate(newBooking.startDate)} — tap an end date
                      </span>
                    </div>
                  ) : null}

                  {addDateError && (
                    <div className="wz-addbook-status-pill is-warn">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{addDateError}</span>
                    </div>
                  )}
                </div>

                {/* Section 4: Payment (matches Member Portal Book Now) */}
                <div className="wz-addbook-section">
                  <div className="wz-addbook-section-head">
                    <h4 className="wz-addbook-section-title">Payment</h4>
                  </div>

                  <div className="wz-addbook-pay-tabs">
                    <button
                      type="button"
                      onClick={() => setAddPaymentMethod("Cash")}
                      className={`wz-addbook-pay-tab${addPaymentMethod === "Cash" ? " active" : ""}`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <circle cx="12" cy="12" r="2" />
                        <path d="M6 12h.01M18 12h.01" />
                      </svg>
                      <div>
                        <span className="wz-addbook-pay-tab-title">Cash</span>
                        <span className="wz-addbook-pay-tab-sub">Depot or field</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAddPaymentMethod("GCash")}
                      className={`wz-addbook-pay-tab${addPaymentMethod === "GCash" ? " active" : ""}`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                      <div>
                        <span className="wz-addbook-pay-tab-title">GCash</span>
                        <span className="wz-addbook-pay-tab-sub">Upload receipt</span>
                      </div>
                    </button>
                  </div>

                  {addPaymentMethod === "Cash" && (
                    <div className="wz-addbook-pay-subrow">
                      <button
                        type="button"
                        onClick={() => setAddCashTiming("Upon Pickup")}
                        className={`wz-addbook-pay-subbtn${
                          addCashTiming === "Upon Pickup" ? " active" : ""
                        }`}
                      >
                        Upon Pickup
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddCashTiming("Upon Return")}
                        className={`wz-addbook-pay-subbtn${
                          addCashTiming === "Upon Return" ? " active" : ""
                        }`}
                      >
                        Upon Return
                      </button>
                    </div>
                  )}

                  {addPaymentMethod === "GCash" && (
                    <div className="wz-addbook-gcash-panel">
                      <div className="wz-addbook-gcash-bar">
                        <div>
                          <div className="wz-addbook-gcash-num">0926 463 8983</div>
                          <div className="wz-addbook-gcash-name">
                            KIMPC · Kalilangan Irrigators MPC
                          </div>
                        </div>
                        <button
                          type="button"
                          className="wz-addbook-gcash-copy-btn"
                          onClick={handleAddCopyGcash}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>{addCopiedGcash ? "Copied" : "Copy"}</span>
                        </button>
                      </div>

                      {!addGcashPreview ? (
                        <label className="wz-addbook-gcash-upload">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="16 16 12 12 8 16" />
                            <line x1="12" y1="12" x2="12" y2="21" />
                            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                          </svg>
                          <span>Upload GCash receipt (PNG/JPG, max 5MB)</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAddGCashFileChange}
                            style={{ display: "none" }}
                          />
                        </label>
                      ) : (
                        <div className="wz-addbook-gcash-preview">
                          <div className="wz-addbook-gcash-preview-left">
                            <img
                              className="wz-addbook-gcash-preview-img"
                              src={addGcashPreview}
                              alt="GCash receipt"
                            />
                            <span className="wz-addbook-gcash-preview-name">
                              Receipt attached
                            </span>
                          </div>
                          <button
                            type="button"
                            className="wz-addbook-link-btn"
                            style={{ color: "#dc2626" }}
                            onClick={() => {
                              setAddGcashProof("");
                              setAddGcashPreview("");
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section 5: Booking Summary (matches Member Portal Book Now) */}
                <div className="wz-addbook-summary">
                  <div className="wz-addbook-summary-row">
                    <span>Member</span>
                    <span className="wz-addbook-summary-val">
                      {selectedMember ? selectedMember.fullName : "Not selected"}
                    </span>
                  </div>
                  <div className="wz-addbook-summary-row">
                    <span>
                      Rate ({formatAddBookPrice(addUnitRatePerHectare)} × {addRequestedHectares} ha)
                    </span>
                    <span className="wz-addbook-summary-val">
                      {formatAddBookPrice(addEstimatedCost)}
                    </span>
                  </div>
                  <div className="wz-addbook-summary-row">
                    <span>Operator</span>
                    <span className="wz-addbook-summary-val">
                      {selectedAddUnit?.operatorIncluded === false
                        ? Number(selectedAddUnit?.additionalOperatorFee) > 0
                          ? selectedAddUnit?.operatorFeeBasis === "per %"
                            ? `${Number(selectedAddUnit.additionalOperatorFee)}% of rate`
                            : `+${formatAddBookPrice(selectedAddUnit.additionalOperatorFee)} ${
                                selectedAddUnit.operatorFeeBasis || "per day"
                              }`
                          : "Not included"
                        : "Included"}
                    </span>
                  </div>
                  <div className="wz-addbook-summary-row">
                    <span>Payment</span>
                    <span className="wz-addbook-summary-val">
                      {addPaymentMethod === "Cash"
                        ? `Cash (${addCashTiming})`
                        : addGcashProof
                        ? "GCash (Attached)"
                        : "GCash (Receipt needed)"}
                    </span>
                  </div>
                  <div className="wz-addbook-summary-total">
                    <span>Total Estimate</span>
                    <span className="wz-addbook-summary-amount">
                      {formatAddBookPrice(addEstimatedCost)}
                    </span>
                  </div>
                </div>

                {addFormError && (
                  <div className="wz-addbook-error">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{addFormError}</span>
                  </div>
                )}
              </div>

              <div className="wz-addbook-footer">
                <button
                  type="button"
                  className="wz-addbook-btn-cancel"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wz-addbook-btn-submit"
                  disabled={
                    addSubmitting ||
                    !selectedMember ||
                    !selectedAddUnit ||
                    getAddUnitAvailability(selectedAddUnit) !== "Available" ||
                    isAddDatesInvalid ||
                    (addPaymentMethod === "GCash" && !addGcashProof)
                  }
                >
                  {addSubmitting
                    ? "Submitting…"
                    : !selectedMember
                    ? "Select Member"
                    : !selectedAddUnit
                    ? "Select Machinery"
                    : isAddDatesInvalid
                    ? "Select Dates"
                    : addPaymentMethod === "GCash" && !addGcashProof
                    ? "Attach GCash Receipt"
                    : `Confirm Booking · ${formatAddBookPrice(addEstimatedCost)}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ================= MODAL: VIEW BOOKING, RECEIPT & PROFILE DETAILS ================= */}
      {viewingBooking && (
        <div
          className="wz-booking-modal-overlay"
          onClick={handleCloseViewModal}
        >
          <div
            className="wz-booking-modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="wz-booking-modal-header" style={{ padding: "16px 24px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "800", color: "#0f172a" }}>
                    {viewingBooking.id}
                  </h3>
                  <span
                    className={`wz-status-pill wz-status-${viewingBooking.status.toLowerCase().replace(/\s+/g, "-")}`}
                    style={{ fontSize: "0.74rem" }}
                  >
                    {viewingBooking.status}
                  </span>
                  <span
                    className={
                      viewingBooking.paymentStatus === "Paid"
                        ? "wz-payment-badge-paid"
                        : viewingBooking.paymentStatus === "Partially Paid" || viewingBooking.paymentStatus === "Partial"
                        ? "wz-payment-badge-partial"
                        : "wz-payment-badge-pending"
                    }
                    style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                  >
                    {viewingBooking.paymentStatus}
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "3px" }}>
                  Booked on {viewingBooking.bookingDate} • {viewingBooking.machineryModel}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseViewModal}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  color: "#64748b",
                  transition: "all 0.15s ease",
                }}
                title="Close without saving"
              >
                ✕
              </button>
            </div>

            {/* Clean Segmented Tab Bar */}
            <div className="wz-modal-tab-bar">
              <button
                type="button"
                className={`wz-modal-tab-btn ${viewModalTab === "overview" ? "active" : ""}`}
                onClick={() => setViewModalTab("overview")}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                <span>Overview</span>
              </button>

              <button
                type="button"
                className={`wz-modal-tab-btn ${viewModalTab === "payment" ? "active" : ""}`}
                onClick={() => setViewModalTab("payment")}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <span>Payment Summary</span>
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: viewingBooking.paymentStatus === "Paid" ? "#059669" : "#d97706",
                  }}
                />
              </button>

              <button
                type="button"
                className={`wz-modal-tab-btn ${viewModalTab === "history" ? "active" : ""}`}
                onClick={() => setViewModalTab("history")}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Activity History</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="wz-booking-modal-body" style={{ padding: "18px 24px", gap: "16px" }}>
              {viewModalTab === "overview" && (
                <>
                  {/* 1. Clean Booking Summary Strip */}
                  <div className="wz-clean-summary-strip">
                    <div>
                      <span className="wz-clean-kv-label">Booking Placed</span>
                      <span className="wz-clean-kv-value">{viewingBooking.bookingDate}</span>
                    </div>
                    <div>
                      <span className="wz-clean-kv-label">Rental Schedule</span>
                      <span className="wz-clean-kv-value">{viewingBooking.dateRange}</span>
                    </div>
                    <div>
                      <span className="wz-clean-kv-label">Duration &amp; Scope</span>
                      <span className="wz-clean-kv-value" style={{ color: "#059669" }}>{viewingBooking.plan}</span>
                    </div>
                    <div>
                      <span className="wz-clean-kv-label">Total Payable</span>
                      <span className="wz-clean-kv-value">{viewingBooking.paymentAmount || "₱0.00"}</span>
                    </div>
                  </div>

                  {/* Cancellation Requested Alert & Actions */}
                  {(viewingBooking.status === "Cancellation Requested" || viewingBooking.cancellationRequested) && (
                    <div
                      style={{
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        borderRadius: "10px",
                        padding: "14px 16px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <strong style={{ color: "#9f1239", fontSize: "0.9rem" }}>
                            Member Requested Booking Cancellation
                          </strong>
                        </div>
                        {viewingBooking.cancellationRequestedAt && (
                          <span style={{ fontSize: "0.75rem", color: "#9f1239" }}>
                            Requested {new Date(viewingBooking.cancellationRequestedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: "6px 0 12px", fontSize: "0.83rem", color: "#881337" }}>
                        <strong>Reason given:</strong>{" "}
                        {viewingBooking.cancellationReason || "Member requested cancellation through the member portal."}
                      </p>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => handleGrantCancellation(viewingBooking.rawId || viewingBooking.id)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "8px",
                            border: "none",
                            background: "#dc2626",
                            color: "#ffffff",
                            fontWeight: "600",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Grant Cancellation
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeclineCancellation(viewingBooking.rawId || viewingBooking.id)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#334155",
                            fontWeight: "600",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          Decline Request
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2 & 3. Two-Column Clean Grid: Member & Request | Unit & Operator */}
                  <div className="wz-clean-two-col">
                    {/* Left Card: Member & Rental Request */}
                    <div className="wz-clean-card">
                      <h5 className="wz-clean-card-title">
                        <span>Member &amp; Farm Site</span>
                        <span className="wz-modal-coop-badge" style={{ fontSize: "0.68rem", padding: "2px 8px" }}>
                          {viewingBooking.coopId || "COOP MEMBER"}
                        </span>
                      </h5>

                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <img
                          src={
                            viewingBooking.clientAvatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(viewingBooking.clientName)}&background=0284c7&color=fff&bold=true`
                          }
                          alt={viewingBooking.clientName}
                          style={{
                            width: "44px",
                            height: "44px",
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "1px solid #e2e8f0",
                            flexShrink: 0,
                          }}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(viewingBooking.clientName)}&background=0284c7&color=fff&bold=true`;
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {viewingBooking.clientName}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {viewingBooking.clientPhone || "No phone"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8rem", color: "#475569" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ flexShrink: 0 }}>
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {viewingBooking.clientEmail || "client@example.com"}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ flexShrink: 0 }}>
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>{viewingBooking.clientAddress || "Kalilangan, Bukidnon"}</span>
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px", marginTop: "2px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <span className="wz-clean-kv-label">Service Area</span>
                          <span className="wz-clean-kv-value" style={{ fontSize: "0.82rem" }}>
                            {viewingBooking.hectares ? `${viewingBooking.hectares} Hectare${viewingBooking.hectares === 1 ? "" : "s"}` : viewingBooking.plan}
                          </span>
                        </div>
                        <div>
                          <span className="wz-clean-kv-label">Farm Location</span>
                          <span className="wz-clean-kv-value" style={{ fontSize: "0.82rem", display: "block" }}>
                            {viewingBooking.farmFormattedAddress || viewingBooking.farmLocation || "Kalilangan, Bukidnon"}
                          </span>
                          {viewingBooking.farmCoordinates?.lat && viewingBooking.farmCoordinates?.lng && (
                            <a
                              href={`https://www.google.com/maps?q=${viewingBooking.farmCoordinates.lat},${viewingBooking.farmCoordinates.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: "0.72rem", color: "#0284c7", textDecoration: "none", fontWeight: 600, display: "inline-block", marginTop: "2px" }}
                            >
                              Open Map ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Card: Unit & Operator Assignment */}
                    <div className="wz-clean-card">
                      <h5 className="wz-clean-card-title">
                        <span>Unit &amp; Operator</span>
                        <span className="wz-machinery-badge" style={{ fontSize: "0.68rem" }}>
                          {viewingBooking.category}
                        </span>
                      </h5>

                      <div>
                        <span className="wz-clean-kv-label">Machinery Model</span>
                        <div style={{ fontSize: "0.94rem", fontWeight: 700, color: "#0f172a" }}>
                          {viewingBooking.machineryModel}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                          {viewingBooking.machineryUnitId && (
                            <span style={{ fontSize: "0.72rem", color: "#0284c7", background: "#f0f9ff", padding: "2px 7px", borderRadius: "4px", fontWeight: 600, border: "1px solid #bae6fd" }}>
                              Unit: {viewingBooking.machineryUnitId}
                            </span>
                          )}
                          <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                            Rate: <strong style={{ color: "#0f172a" }}>₱{Number(viewingBooking.dailyRate || 2800).toLocaleString()}</strong>/day
                          </span>
                        </div>
                      </div>

                      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "10px", marginTop: "auto" }}>
                        <span className="wz-clean-kv-label">Assigned Operator</span>
                        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>
                          {viewingBooking.hasDriver
                            ? (viewingBooking.assignedDriver || "Coop Operator Assigned")
                            : "Self-Operated by Member"}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                          <span style={{ fontSize: "0.74rem", color: viewingBooking.hasDriver ? "#059669" : "#64748b", fontWeight: 600 }}>
                            {viewingBooking.hasDriver ? "Coop Operator Included" : "Member Certified"}
                          </span>
                          <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                            {viewingBooking.driverPhone || (viewingBooking.hasDriver ? "+63 917 123 4567" : viewingBooking.clientPhone || "N/A")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Clean Status Switcher Toolbar */}
                  <div className="wz-clean-card" style={{ background: "#f8fafc", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                        Update Booking Status
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        Selected: <strong style={{ color: "#0f172a" }}>{modalStatus}</strong>
                        {modalStatus !== viewingBooking.status && (
                          <span style={{ marginLeft: "6px", color: "#059669", fontWeight: 600, fontSize: "0.74rem" }}>
                            (Unsaved change)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="wz-status-btn-group">
                      {["Pending", "Approved", "Ongoing", "Returned", "Rescheduled", "Rejected", "Voided"].map((s) => {
                        const isSelected = modalStatus.toLowerCase() === s.toLowerCase();
                        return (
                          <button
                            key={s}
                            type="button"
                            className={`wz-status-switch-btn ${isSelected ? "active" : ""}`}
                            onClick={() => setModalStatus(s)}
                            title={`Select status ${s}`}
                          >
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                            {s}
                          </button>
                        );
                      })}
                    </div>

                    {/* Subpanel: Reason for Rejection */}
                    {modalStatus === "Rejected" && (
                      <div className="wz-modal-subpanel">
                        <div className="wz-subpanel-title">Specify Reason for Rejection:</div>
                        <div className="wz-quick-preset-chips">
                          {[
                            "Machinery Under Maintenance",
                            "Schedule Conflict / Unavailable",
                            "Incomplete Documentation",
                            "Operator Unavailable",
                            "Adverse Weather Conditions",
                            "Member Requested Cancellation",
                          ].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`wz-preset-chip ${modalRejectionReason === preset ? "active" : ""}`}
                              onClick={() => setModalRejectionReason(preset)}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="wz-modal-textarea"
                          placeholder="Type or select a reason for rejecting this booking..."
                          value={modalRejectionReason}
                          onChange={(e) => setModalRejectionReason(e.target.value)}
                          rows={2}
                        />
                      </div>
                    )}

                    {/* Subpanel: Reschedule Dates */}
                    {modalStatus === "Rescheduled" && (
                      <div className="wz-modal-subpanel">
                        <div className="wz-subpanel-title">Select New Booking Schedule Dates:</div>
                        <div className="wz-modal-date-grid">
                          <div className="wz-modal-date-field">
                            <label className="wz-modal-date-label">New Start Date</label>
                            <input
                              type="date"
                              className="wz-modal-date-input"
                              value={modalStartDate}
                              onChange={(e) => setModalStartDate(e.target.value)}
                            />
                          </div>
                          <div className="wz-modal-date-field">
                            <label className="wz-modal-date-label">New End Date</label>
                            <input
                              type="date"
                              className="wz-modal-date-input"
                              value={modalEndDate}
                              min={modalStartDate}
                              onChange={(e) => setModalEndDate(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="wz-reschedule-calc-badge">
                          <span>
                            Updated Duration: <strong>{rescheduleDays} Day{rescheduleDays === 1 ? "" : "s"}</strong>
                          </span>
                          <span>
                            Recalculated Total: <strong style={{ color: "var(--wz-primary-red)" }}>{rescheduleAmount}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Subpanel: Void Booking */}
                    {modalStatus === "Voided" && (
                      <div className="wz-modal-subpanel">
                        <div className="wz-void-notice-banner">
                          <strong>Void Warning:</strong> Voiding will permanently invalidate this machinery rental transaction, cancel driver assignments, and release the unit.
                        </div>
                        <div className="wz-subpanel-title">Reason for Voiding:</div>
                        <div className="wz-quick-preset-chips">
                          {[
                            "Administrative Cancellation",
                            "Duplicate Billing Entry",
                            "Member Clerical Error",
                            "Equipment Decommissioned",
                          ].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`wz-preset-chip ${modalVoidReason === preset ? "active" : ""}`}
                              onClick={() => setModalVoidReason(preset)}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="wz-modal-textarea"
                          placeholder="Type or select reason for voiding..."
                          value={modalVoidReason}
                          onChange={(e) => setModalVoidReason(e.target.value)}
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {viewModalTab === "payment" && (
                <>
                  {/* 4. Clean Payment Summary Card */}
                  <div className="wz-clean-card">
                    <div className="wz-clean-card-title">
                      <span>Payment Summary</span>
                      <span
                        className={
                          viewingBooking.paymentStatus === "Paid"
                            ? "wz-payment-badge-paid"
                            : viewingBooking.paymentStatus === "Partially Paid" || viewingBooking.paymentStatus === "Partial"
                            ? "wz-payment-badge-partial"
                            : "wz-payment-badge-pending"
                        }
                        style={{ fontSize: "0.72rem", padding: "3px 9px" }}
                      >
                        {viewingBooking.paymentStatus}
                      </span>
                    </div>

                    {/* Top Highlight Strip: Total Payable & Settlement Guidance */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", background: "#f8fafc", padding: "12px 16px", borderRadius: "10px", border: "1px solid #f1f5f9" }}>
                      <div>
                        <span className="wz-clean-kv-label">Total Payable</span>
                        <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#0f172a", lineHeight: 1.15 }}>
                          {viewingBooking.paymentAmount || "₱0.00"}
                        </div>
                        {(viewingBooking.paymentStatus === "Partially Paid" || viewingBooking.paymentStatus === "Partial") && (
                          <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "#b45309", marginTop: "3px" }}>
                            Paid ₱{Number(viewingBooking.paidAmountNum || 0).toLocaleString()} · Balance ₱{Number(viewingBooking.balanceAmountNum || 0).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span className="wz-clean-kv-label">Settlement</span>
                        {viewingBooking.paymentStatus === "Paid" ? (
                          <div style={{ fontSize: "0.78rem", color: "#059669", fontWeight: 700 }}>
                            Settled
                          </div>
                        ) : (
                          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 500 }}>
                            Manage in{" "}
                            <Link
                              to="/manager/financials/payments"
                              onClick={handleCloseViewModal}
                              style={{ color: "#0284c7", fontWeight: 600, textDecoration: "none" }}
                            >
                              Financials › Payments
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Clean 4-column Metadata Grid */}
                    <div className="wz-clean-summary-strip" style={{ background: "#ffffff", padding: "10px 14px" }}>
                      <div>
                        <span className="wz-clean-kv-label">Method</span>
                        <span className="wz-clean-kv-value" style={{ fontSize: "0.84rem", color: "#0284c7" }}>
                          {viewingBooking.paymentMethod || "Cash"}
                        </span>
                      </div>
                      <div>
                        <span className="wz-clean-kv-label">Date Received</span>
                        <span className="wz-clean-kv-value" style={{ fontSize: "0.84rem" }}>
                          {viewingBooking.dateReceived
                            ? (String(viewingBooking.dateReceived).includes("T") && !isNaN(new Date(viewingBooking.dateReceived).getTime())
                              ? new Date(viewingBooking.dateReceived).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                              : viewingBooking.dateReceived)
                            : (viewingBooking.paymentStatus === "Paid" ? viewingBooking.bookingDate : "Pending")}
                        </span>
                      </div>
                      <div>
                        <span className="wz-clean-kv-label">OR / Ref No.</span>
                        <span className="wz-clean-kv-value" style={{ fontSize: "0.82rem", fontFamily: "monospace" }}>
                          {viewingBooking.receiptNo || viewingBooking.id}
                          {viewingBooking.referenceNumber ? (
                            <span style={{ display: "block", fontSize: "0.72rem", color: "#0284c7" }}>
                              Ref: {viewingBooking.referenceNumber}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div>
                        <span className="wz-clean-kv-label">Received By</span>
                        <span className="wz-clean-kv-value" style={{ fontSize: "0.82rem", color: "#059669" }}>
                          {viewingBooking.recordedBy || user?.fullName || "Manager"}
                        </span>
                      </div>
                    </div>

                    {/* Attached Proof of Payment (GCash) if exists */}
                    {(viewingBooking.proofOfPayment || viewingBooking.gcashProof) && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <img
                            src={viewingBooking.proofOfPayment || viewingBooking.gcashProof}
                            alt="Proof of Payment"
                            onClick={() => setPreviewGcashImage(viewingBooking.proofOfPayment || viewingBooking.gcashProof)}
                            style={{
                              width: "40px",
                              height: "40px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              border: "1px solid #059669",
                              cursor: "pointer",
                            }}
                          />
                          <div>
                            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#166534" }}>GCash / Transfer Proof Attached</div>
                            <div style={{ fontSize: "0.72rem", color: "#475569" }}>Click thumbnail to verify screenshot</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewGcashImage(viewingBooking.proofOfPayment || viewingBooking.gcashProof)}
                          style={{
                            background: "#ffffff",
                            color: "#0f172a",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            padding: "5px 12px",
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          View Proof
                        </button>
                      </div>
                    )}
                    {/* Compact Rate & Scope Breakdown */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", paddingTop: "8px", borderTop: "1px solid #f1f5f9", fontSize: "0.8rem", color: "#475569" }}>
                      <span>
                        <strong>{viewingBooking.machineryModel}</strong> ({viewingBooking.plan})
                      </span>
                      <span>
                        Daily Rate: <strong style={{ color: "#0f172a" }}>₱{Number(viewingBooking.dailyRate || 2800).toLocaleString()} / day</strong>
                      </span>
                    </div>

                    {/* Status Notice Banners */}
                    {(viewingBooking.status === "Rejected" || modalStatus === "Rejected") && (
                      <div style={{ padding: "8px 12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "8px", fontSize: "0.78rem", color: "#991b1b" }}>
                        <strong>Rejected:</strong> {modalRejectionReason || viewingBooking.rejectionReason || "No reason specified"}
                      </div>
                    )}
                    {(viewingBooking.status === "Voided" || modalStatus === "Voided") && (
                      <div style={{ padding: "8px 12px", background: "#f1f5f9", border: "1px dashed #cbd5e1", borderRadius: "8px", fontSize: "0.78rem", color: "#475569" }}>
                        <strong>Voided:</strong> {modalVoidReason || viewingBooking.voidReason || "Administrative Cancellation"}
                      </div>
                    )}
                    {(viewingBooking.status === "Rescheduled" || modalStatus === "Rescheduled") && (
                      <div style={{ padding: "8px 12px", background: "#f3e8ff", border: "1px solid #d8b4fe", borderRadius: "8px", fontSize: "0.78rem", color: "#6b21a8" }}>
                        <strong>Rescheduled:</strong> {modalStartDate && modalEndDate ? `${modalStartDate} to ${modalEndDate}` : viewingBooking.dateRange} ({rescheduleDays} Days)
                      </div>
                    )}
                  </div>
                </>
              )}

              {viewModalTab === "history" && (
                /* 5. Clean Activity History */
                <div className="wz-clean-card">
                  <div className="wz-clean-card-title">
                    <span>Activity History</span>
                    <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>Chronological audit trail</span>
                  </div>

                  <div className="app-timeline-container" style={{ marginTop: 0, padding: "12px 14px", background: "#f8fafc" }}>
                    <ul className="app-timeline-list">
                      {getBookingTimelineEvents(viewingBooking).map((ev, evIdx) => (
                        <li key={evIdx} className="app-timeline-item">
                          <div className={`app-timeline-node node-${ev.status || "created"}`}>
                            {ev.status === "approved" || ev.status === "returned" ? "✓" : ev.status === "rejected" || ev.status === "voided" ? "✕" : "•"}
                          </div>
                          <div className="app-timeline-card">
                            <div className="app-timeline-card-header">
                              <span className="app-timeline-item-title">{ev.title}</span>
                              <span className="app-timeline-item-time">
                                {ev.timestamp ? (
                                  typeof ev.timestamp === "string" && !ev.timestamp.includes("T") && !ev.timestamp.includes("-")
                                    ? ev.timestamp
                                    : new Date(ev.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                ) : "—"}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#059669", fontWeight: 700, marginBottom: "3px" }}>
                              By: {ev.actor || "System"}
                            </div>
                            <p className="app-timeline-item-note">{ev.note}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer: Save and Close */}
            <div className="wz-booking-modal-footer" style={{ justifyContent: "flex-end" }}>
              <div className="wz-modal-footer-actions">
                <button
                  type="button"
                  className="wz-modal-btn-close"
                  onClick={handleCloseViewModal}
                  title="Discard changes and close"
                >
                  Close
                </button>
                <button
                  type="button"
                  className="wz-modal-btn-save"
                  style={{
                    backgroundColor: getConfirmationButtonDetails().bg,
                  }}
                  onClick={handleSaveModalStatus}
                  title={`${getConfirmationButtonDetails().label} for booking ${viewingBooking?.id || ""}`}
                >
                  {modalStatus === "Approved" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {modalStatus === "Rescheduled" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  )}
                  {modalStatus === "Rejected" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                  {modalStatus === "Voided" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                  )}
                  {modalStatus !== "Approved" && modalStatus !== "Rescheduled" && modalStatus !== "Rejected" && modalStatus !== "Voided" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {getConfirmationButtonDetails().label}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* GCash Screenshot Lightbox Modal */}
      {previewGcashImage && (
        <div
          className="wz-booking-modal-overlay"
          style={{ zIndex: 10000, background: "rgba(15, 23, 42, 0.85)" }}
          onClick={() => setPreviewGcashImage(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              padding: "20px",
              maxWidth: "520px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              textAlign: "center",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>📱</span>
                <strong style={{ fontSize: "1rem", color: "#0f172a" }}>GCash Payment Proof Screenshot</strong>
              </div>
              <button
                type="button"
                onClick={() => setPreviewGcashImage(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "30px",
                  height: "30px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  color: "#64748b",
                }}
              >
                ✕
              </button>
            </div>
            <img
              src={previewGcashImage}
              alt="Uploaded GCash Screenshot"
              style={{
                width: "100%",
                maxHeight: "70vh",
                objectFit: "contain",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
              }}
            />
            <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPreviewGcashImage(null)}
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  fontWeight: 600,
                  fontSize: "0.84rem",
                  cursor: "pointer",
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
