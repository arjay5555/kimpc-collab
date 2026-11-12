import React, { useState, useMemo, useEffect } from "react";
import { api, getCachedApiData } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { computePaymentSummary } from "../../utils/paymentSummary";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

function getDaysCount(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const d1 = new Date(startDate.includes("T") ? startDate : `${startDate}T00:00:00`);
  const d2 = new Date(endDate.includes("T") ? endDate : `${endDate}T00:00:00`);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1;
  const diff = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function formatBookingDateRange(startDate, endDate) {
  if (!startDate) return "—";
  if (!endDate || startDate === endDate) return startDate;
  return `${startDate} to ${endDate}`;
}

function toLocalDateTimeInputValue(value) {
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const currentHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (!value) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${currentHHMM}`;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T${currentHHMM}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    return str.slice(0, 16);
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${currentHHMM}`;
}

function formatDateTimeDisplay(value) {
  if (!value) return "—";
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T00:00:00`);
    return isNaN(d.getTime())
      ? str
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function makeRequestKey(prefix = "req") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getPaymentBadgeClass(paymentStatus) {
  switch (paymentStatus) {
    case "Paid":
      return "wz-pay-pill is-paid";
    case "Partially Paid":
      return "wz-pay-pill is-partial";
    case "Refund Pending":
      return "wz-pay-pill is-refund-pending";
    case "Partially Refunded":
      return "wz-pay-pill is-partial-refund";
    case "Fully Refunded":
      return "wz-pay-pill is-refunded";
    case "No Balance":
      return "wz-pay-pill is-closed";
    case "Unpaid":
    default:
      return "wz-pay-pill is-unpaid";
  }
}

export default function Payments() {
  const { user } = useAuth();
  const activeReceiverName = user?.fullName || user?.name || user?.email || "Operations Manager";

  const [liveApplications, setLiveApplications] = useState(() => {
    const cached = getCachedApiData("/applications");
    return Array.isArray(cached) ? cached : [];
  });
  const [loading, setLoading] = useState(() => !getCachedApiData("/applications"));
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // Filters, sorting, pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRangeFilter, setDateRangeFilter] = useState("All Time");
  const [sortBy, setSortBy] = useState("date_desc");
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("kimpc_manager_pageSize");
    return saved ? Number(saved) : 8;
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Active modals by booking ID
  const [viewingBookingId, setViewingBookingId] = useState(null);
  const [receiptBooking, setReceiptBooking] = useState(null);
  const [previewGcashImage, setPreviewGcashImage] = useState(null);

  // Record Payment (and Refund Payment) modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentFormError, setPaymentFormError] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentRequestKey, setPaymentRequestKey] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    bookingId: "",
    rawId: "",
    amount: "",
    paymentType: "Full Rental Payment",
    linkedPaymentId: "",
    paymentMethod: "Cash",
    referenceNumber: "",
    dateReceived: toLocalDateTimeInputValue(),
    receiptNo: "",
    notes: "",
  });

  // Void Payment confirmation modal state
  const [voidModalTarget, setVoidModalTarget] = useState(null); // { bookingId, rawId, entry, index, linkedRefunds }
  const [voidReason, setVoidReason] = useState("");
  const [voidRefundReviewed, setVoidRefundReviewed] = useState(false);
  const [voidRefundReviewNote, setVoidRefundReviewNote] = useState("");
  const [voidModalError, setVoidModalError] = useState("");
  const [isSubmittingVoid, setIsSubmittingVoid] = useState(false);
  const [voidRequestKey, setVoidRequestKey] = useState("");

  // Flagged payment review state inside Payment History
  const [reviewingEntryId, setReviewingEntryId] = useState("");

  const fetchApplications = async () => {
    try {
      const res = await api("/applications");
      if (res.ok && Array.isArray(res.data)) {
        setLiveApplications(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch booking applications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    const interval = setInterval(fetchApplications, 15000);
    return () => clearInterval(interval);
  }, []);

  const showBanner = (message, isError = false) => {
    setFeedback({ message, isError });
  };

  const replaceApplicationInState = (updatedApp) => {
    if (!updatedApp) return;
    const targetId = String(updatedApp._id || updatedApp.id || "");
    if (!targetId) return;
    setLiveApplications((prev) => {
      const idx = prev.findIndex((item) => String(item._id || item.id || "") === targetId);
      if (idx === -1) return [updatedApp, ...prev];
      const next = [...prev];
      next[idx] = updatedApp;
      return next;
    });
  };

  // Canonical summary row per booking (single source of truth)
  const allBookings = useMemo(() => {
    return liveApplications.map((app) => {
      const rawId = String(app._id || app.id || "");
      const bookingId = app.displayId || (rawId ? `APP-${rawId.slice(-6).toUpperCase()}` : "APP-BOOKING");
      const summary = computePaymentSummary(app);
      const days = getDaysCount(app.startDate, app.endDate);
      const ratePerUnit = Number(app.ratePerHectare || app.financials?.ratePerHectare || app.financials?.dailyRate || 0);
      const rentalPeriod = app.hectares
        ? `${app.hectares} ha · ${days} day${days === 1 ? "" : "s"}`
        : `${days} day${days === 1 ? "" : "s"}`;

      return {
        rawId,
        id: bookingId,
        clientName: app.memberName || app.memberEmail || "Cooperative Member",
        clientEmail: app.memberEmail || "",
        clientPhone: app.memberPhone || app.farmerPhone || app.clientPhone || "",
        machineryModel: app.equipment || app.machineryModel || "Machinery Unit",
        ratePerUnit,
        rentalPeriod,
        startDate: app.startDate || "",
        endDate: app.endDate || "",
        createdAt: app.createdAt || app.submittedAt || "",
        assignedDriver: app.assignedDriver || "Self-Operated",
        paymentMethod: app.paymentMethod || app.financials?.paymentMethod || "Cash",
        cashPaymentOption: app.cashPaymentOption || "",
        gcashProof: app.gcashProof || "",
        receiptNo: app.receiptNo || "",
        cancellationReason: app.cancellationReason || "",
        bookingVoidReason: app.bookingVoidReason || "",
        bookingVoidedBy: app.bookingVoidedBy || "",
        bookingVoidedAt: app.bookingVoidedAt || null,
        refundDecisionNote: app.refundDecisionNote || "",
        refundDecidedBy: app.refundDecidedBy || "",
        refundDecidedAt: app.refundDecidedAt || null,
        paymentHistory: Array.isArray(app.paymentHistory) ? app.paymentHistory : [],
        refunds: Array.isArray(app.refunds) ? app.refunds : [],
        summary,
        // Direct convenience aliases
        bookingStatus: summary.bookingStatus,
        paymentStatus: summary.paymentStatus,
        rentalCharge: summary.rentalCharge,
        totalPaid: summary.grossPaid,
        totalRefunded: summary.totalRefunded,
        netCollected: summary.netCollected,
        balanceDue: summary.balanceDue,
        maxPayableAmount: summary.maxPayableAmount ?? summary.balanceDue,
        refundableRemaining: summary.refundableRemaining ?? 0,
        cancellationFee: summary.cancellationFee,
        refundDueRemaining: summary.refundDueRemaining,
        refundDetermination: summary.refundDetermination,
        isVoidedBooking: summary.isVoidedBooking,
        isCancelled: summary.isCancelled,
        isClosedBooking: summary.isClosedBooking,
        hasFlaggedPayments: summary.hasFlaggedPayments,
        canRecordPayment: summary.canRecordPayment,
        canRecordRefund: summary.canRecordRefund,
      };
    });
  }, [liveApplications]);

  const viewingBooking = useMemo(
    () => allBookings.find((b) => b.id === viewingBookingId) || null,
    [allBookings, viewingBookingId]
  );

  const isClosedBookingStatus = (b) =>
    Boolean(b && (b.isClosedBooking || ["Cancelled", "Rejected", "Voided"].includes(b.bookingStatus)));

  const activePayableBookings = useMemo(
    () => allBookings.filter((b) => !isClosedBookingStatus(b) && b.canRecordPayment),
    [allBookings]
  );

  const closedPayableBookings = useMemo(
    () => allBookings.filter((b) => isClosedBookingStatus(b) && b.canRecordPayment),
    [allBookings]
  );

  const refundableBookings = useMemo(
    () => allBookings.filter((b) => isClosedBookingStatus(b) && b.canRecordRefund),
    [allBookings]
  );

  const modalSelectableBookings = useMemo(
    () => allBookings.filter((b) => b.canRecordPayment || b.canRecordRefund),
    [allBookings]
  );

  const bookingsForCurrentPaymentType = useMemo(() => {
    if (paymentForm.paymentType === "Refund Payment") return refundableBookings;
    if (paymentForm.paymentType === "Cancellation Fee Payment") return closedPayableBookings;
    return activePayableBookings;
  }, [paymentForm.paymentType, refundableBookings, closedPayableBookings, activePayableBookings]);

  const selectedBookingForPayment = useMemo(
    () => allBookings.find((b) => b.id === paymentForm.bookingId) || null,
    [allBookings, paymentForm.bookingId]
  );

  const openViewDetails = (booking) => {
    setViewingBookingId(booking.id);
  };

  // KPI metrics
  const kpiStats = useMemo(() => {
    let netCollectedSum = 0;
    let totalRefundedSum = 0;
    let balanceDueSum = 0;
    let paidCount = 0;
    let outstandingCount = 0;
    let refundedCount = 0;
    let flaggedCount = 0;

    allBookings.forEach((b) => {
      netCollectedSum += b.netCollected;
      totalRefundedSum += b.totalRefunded;
      if (b.balanceDue > 0) {
        balanceDueSum += b.balanceDue;
        outstandingCount += 1;
      }
      if (b.paymentStatus === "Paid") {
        paidCount += 1;
      }
      if (b.totalRefunded > 0) {
        refundedCount += 1;
      }
      if (b.hasFlaggedPayments) {
        flaggedCount += 1;
      }
    });

    return {
      netCollectedSum,
      totalRefundedSum,
      balanceDueSum,
      paidCount,
      outstandingCount,
      refundedCount,
      flaggedCount,
    };
  }, [allBookings]);

  // Filtered and sorted rows
  const [mountNow] = useState(() => new Date());
  const filteredBookings = useMemo(() => {
    const thisMonthKey = `${mountNow.getFullYear()}-${String(mountNow.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthDate = new Date(mountNow.getFullYear(), mountNow.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const q = searchQuery.trim().toLowerCase();

    const list = allBookings.filter((b) => {
      if (q) {
        const matchesHistory = b.paymentHistory.some(
          (h) =>
            String(h.receiptNo || "").toLowerCase().includes(q) ||
            String(h.referenceNumber || "").toLowerCase().includes(q)
        );
        const matchesRefund = b.refunds.some(
          (r) =>
            String(r.refundNo || "").toLowerCase().includes(q) ||
            String(r.referenceNumber || "").toLowerCase().includes(q)
        );
        const hit =
          b.id.toLowerCase().includes(q) ||
          b.clientName.toLowerCase().includes(q) ||
          b.machineryModel.toLowerCase().includes(q) ||
          String(b.receiptNo || "").toLowerCase().includes(q) ||
          matchesHistory ||
          matchesRefund;
        if (!hit) return false;
      }

      if (statusFilter === "Needs Review") {
        if (!b.hasFlaggedPayments) return false;
      } else if (statusFilter !== "All") {
        if (b.paymentStatus !== statusFilter) return false;
      }

      if (dateRangeFilter === "This Month") {
        const refDate = b.startDate || b.createdAt || "";
        if (!String(refDate).startsWith(thisMonthKey)) return false;
      } else if (dateRangeFilter === "Last Month") {
        const refDate = b.startDate || b.createdAt || "";
        if (!String(refDate).startsWith(lastMonthKey)) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "date_asc") return String(a.createdAt || a.startDate).localeCompare(String(b.createdAt || b.startDate));
      if (sortBy === "date_desc") return String(b.createdAt || b.startDate).localeCompare(String(a.createdAt || a.startDate));
      if (sortBy === "balance_desc") return b.balanceDue - a.balanceDue;
      if (sortBy === "amount_desc") return b.rentalCharge - a.rentalCharge;
      if (sortBy === "amount_asc") return a.rentalCharge - b.rentalCharge;
      if (sortBy === "client_asc") return a.clientName.localeCompare(b.clientName);
      return 0;
    });

    return list;
  }, [allBookings, searchQuery, statusFilter, dateRangeFilter, sortBy, mountNow]);

  const totalPages = Math.ceil(filteredBookings.length / pageSize) || 1;
  const paginatedBookings = useMemo(
    () => filteredBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredBookings, currentPage, pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateRangeFilter, sortBy]);

  // Helper to get default OR number for a booking payment entry
  const generateNextOrNo = (booking) => {
    const yr = new Date().getFullYear();
    const seq = String((booking?.paymentHistory?.length || 0) + 1).padStart(2, "0");
    const suffix = booking ? String(booking.id).replace(/\D/g, "") || booking.rawId.slice(-4).toUpperCase() : "0001";
    return `OR-${yr}-${suffix}-${seq}`;
  };

  // Build eligible original payments for Refund Payment mode
  const getRefundableEntryOptions = (booking) => {
    if (!booking) return [];
    const activeEntries = (booking.paymentHistory || []).filter((p) => !p.isVoided);
    return activeEntries.map((p) => {
      const entryId = String(p._id || "");
      const alreadyRefunded = (booking.refunds || [])
        .filter(
          (r) =>
            (entryId && String(r.linkedPaymentId || "") === entryId) ||
            (!r.linkedPaymentId && p.receiptNo && r.linkedReceiptNo === p.receiptNo)
        )
        .reduce((s, r) => s + Number(r.amount || 0), 0);
      const remainingOnEntry = Math.max(0, Math.round((Number(p.amount || 0) - alreadyRefunded) * 100) / 100);
      return { entry: p, entryId, alreadyRefunded, remainingOnEntry };
    });
  };

  // Open Record Payment / Refund modal
  const openRecordPaymentModal = (targetBooking = null, initialType = null) => {
    const picked =
      targetBooking && (targetBooking.canRecordPayment || targetBooking.canRecordRefund)
        ? targetBooking
        : activePayableBookings[0] || closedPayableBookings[0] || refundableBookings[0] || null;

    let defaultType = initialType;
    if (!defaultType) {
      if (picked && isClosedBookingStatus(picked)) {
        const preferRefund =
          (!picked.canRecordPayment && picked.canRecordRefund) ||
          (picked.canRecordRefund && picked.totalPaid > 0 && picked.cancellationFee === 0);
        defaultType = preferRefund ? "Refund Payment" : "Cancellation Fee Payment";
      } else {
        defaultType = picked && picked.totalPaid > 0 ? "Final Payment" : "Full Rental Payment";
      }
    }

    const isRefundMode = defaultType === "Refund Payment";
    const entryOptions = isRefundMode ? getRefundableEntryOptions(picked) : [];
    const firstRefundable = entryOptions.find((o) => o.remainingOnEntry > 0) || entryOptions[0];
    const refundMax = firstRefundable
      ? Math.min(firstRefundable.remainingOnEntry, picked?.refundableRemaining || 0)
      : picked?.refundableRemaining || 0;

    setPaymentFormError("");
    setPaymentRequestKey(makeRequestKey(isRefundMode ? "ref" : "pay"));
    setPaymentForm({
      bookingId: picked ? picked.id : "",
      rawId: picked?.rawId || "",
      amount: isRefundMode
        ? refundMax > 0
          ? String(refundMax)
          : ""
        : picked && picked.balanceDue > 0
        ? String(picked.balanceDue)
        : "",
      paymentType: defaultType,
      linkedPaymentId: firstRefundable?.entryId || "",
      paymentMethod: isRefundMode
        ? firstRefundable?.entry?.paymentMethod || picked?.paymentMethod || "Cash"
        : picked?.paymentMethod || "Cash",
      referenceNumber: "",
      dateReceived: toLocalDateTimeInputValue(),
      receiptNo: generateNextOrNo(picked),
      notes:
        isRefundMode && picked?.cancellationReason
          ? `Refund due to ${picked.bookingStatus.toLowerCase()} booking (${picked.cancellationReason})`
          : "",
    });
    setIsPaymentModalOpen(true);
  };

  const handlePaymentBookingSelect = (bookingId) => {
    const selected = allBookings.find((b) => b.id === bookingId) || null;
    const isRefundMode = paymentForm.paymentType === "Refund Payment";
    const isCancelFeeMode = paymentForm.paymentType === "Cancellation Fee Payment";

    const entryOptions = isRefundMode ? getRefundableEntryOptions(selected) : [];
    const firstRefundable = entryOptions.find((o) => o.remainingOnEntry > 0) || entryOptions[0];
    const refundMax = firstRefundable
      ? Math.min(firstRefundable.remainingOnEntry, selected?.refundableRemaining || 0)
      : selected?.refundableRemaining || 0;

    const isPartial = selected && selected.totalPaid > 0;
    setPaymentFormError("");
    setPaymentRequestKey(makeRequestKey(isRefundMode ? "ref" : "pay"));
    setPaymentForm((prev) => {
      const nextPaymentType = isRefundMode
        ? "Refund Payment"
        : isCancelFeeMode
        ? "Cancellation Fee Payment"
        : prev.paymentType === "Down Payment" || prev.paymentType === "Partial Rental Payment"
        ? prev.paymentType
        : isPartial
        ? "Final Payment"
        : "Full Rental Payment";

      return {
        ...prev,
        bookingId: selected ? selected.id : "",
        rawId: selected?.rawId || "",
        amount: isRefundMode
          ? refundMax > 0
            ? String(refundMax)
            : ""
          : selected && selected.balanceDue > 0
          ? String(selected.balanceDue)
          : "",
        paymentType: nextPaymentType,
        linkedPaymentId: firstRefundable?.entryId || "",
        paymentMethod: isRefundMode
          ? firstRefundable?.entry?.paymentMethod || selected?.paymentMethod || "Cash"
          : selected?.paymentMethod || "Cash",
        referenceNumber: "",
        receiptNo: generateNextOrNo(selected),
        notes:
          isRefundMode && selected?.cancellationReason
            ? `Refund due to ${selected.bookingStatus.toLowerCase()} booking (${selected.cancellationReason})`
            : "",
      };
    });
  };

  const handlePaymentTypeChange = (nextType) => {
    const isRefund = nextType === "Refund Payment";
    const isCancelFee = nextType === "Cancellation Fee Payment";
    const candidateList = isRefund
      ? refundableBookings
      : isCancelFee
      ? closedPayableBookings
      : activePayableBookings;

    const currentValid =
      selectedBookingForPayment &&
      candidateList.some((b) => b.id === selectedBookingForPayment.id);
    const target = currentValid ? selectedBookingForPayment : candidateList[0] || null;

    const entryOptions = isRefund ? getRefundableEntryOptions(target) : [];
    const firstRefundable = entryOptions.find((o) => o.remainingOnEntry > 0) || entryOptions[0];
    const refundMax = firstRefundable
      ? Math.min(firstRefundable.remainingOnEntry, target?.refundableRemaining || 0)
      : target?.refundableRemaining || 0;

    setPaymentFormError("");
    setPaymentRequestKey(makeRequestKey(isRefund ? "ref" : "pay"));
    setPaymentForm((prev) => ({
      ...prev,
      bookingId: target ? target.id : "",
      rawId: target?.rawId || "",
      paymentType: nextType,
      linkedPaymentId: isRefund ? firstRefundable?.entryId || "" : "",
      amount: isRefund
        ? refundMax > 0
          ? String(refundMax)
          : ""
        : target && target.balanceDue > 0
        ? String(target.balanceDue)
        : "",
      paymentMethod: isRefund
        ? firstRefundable?.entry?.paymentMethod || target?.paymentMethod || "Cash"
        : target?.paymentMethod || prev.paymentMethod,
      receiptNo: generateNextOrNo(target),
      notes:
        isRefund && target?.cancellationReason
          ? `Refund due to ${target.bookingStatus.toLowerCase()} booking (${target.cancellationReason})`
          : isRefund
          ? prev.notes
          : "",
    }));
  };

  const selectedPaymentRefundMeta = useMemo(() => {
    if (!selectedBookingForPayment || paymentForm.paymentType !== "Refund Payment") {
      return { entries: [], maxForSelected: 0 };
    }
    const entries = getRefundableEntryOptions(selectedBookingForPayment);
    const chosen = entries.find((e) => e.entryId === paymentForm.linkedPaymentId);
    const maxForSelected = chosen
      ? Math.min(chosen.remainingOnEntry, selectedBookingForPayment.refundableRemaining)
      : selectedBookingForPayment.refundableRemaining;
    return { entries, maxForSelected };
  }, [selectedBookingForPayment, paymentForm.paymentType, paymentForm.linkedPaymentId]);

  // Submit new payment or refund transaction from Record Payment modal (idempotent + validated)
  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (isSubmittingPayment) return;
    setPaymentFormError("");

    const target = selectedBookingForPayment;
    if (!target || !target.rawId) {
      setPaymentFormError("Please select a valid booking.");
      return;
    }

    const enteredAmt = Number(paymentForm.amount);
    if (!Number.isFinite(enteredAmt) || enteredAmt <= 0) {
      setPaymentFormError("Please enter a valid amount greater than ₱0.");
      return;
    }

    if (paymentForm.paymentType === "Refund Payment") {
      if (!target.canRecordRefund) {
        setPaymentFormError("This booking has no remaining refundable collected payment.");
        return;
      }
      if (!paymentForm.linkedPaymentId) {
        setPaymentFormError("Select the original payment record to link this refund to.");
        return;
      }
      if (enteredAmt - selectedPaymentRefundMeta.maxForSelected > 0.01) {
        setPaymentFormError(
          `Refund exceeds allowable limit (₱${selectedPaymentRefundMeta.maxForSelected.toLocaleString()}).`
        );
        return;
      }
      if (!paymentForm.referenceNumber.trim()) {
        setPaymentFormError("Refund reference number is required.");
        return;
      }
      if (!paymentForm.notes.trim()) {
        setPaymentFormError("Refund reason is required.");
        return;
      }

      setIsSubmittingPayment(true);
      try {
        const res = await api(`/applications/${encodeURIComponent(target.rawId)}/refunds`, {
          method: "POST",
          body: {
            linkedPaymentId: paymentForm.linkedPaymentId,
            amount: enteredAmt,
            refundDate: paymentForm.dateReceived,
            paymentMethod: paymentForm.paymentMethod,
            referenceNumber: paymentForm.referenceNumber.trim(),
            reason: paymentForm.notes.trim(),
            idempotencyKey: paymentRequestKey,
          },
        });

        if (!res.ok) {
          setPaymentFormError(res.data?.error || "Could not record refund payment.");
          return;
        }
        if (res.data?.application) replaceApplicationInState(res.data.application);
        else await fetchApplications();

        setIsPaymentModalOpen(false);
        showBanner(res.data?.message || `Recorded refund payment of ₱${enteredAmt.toLocaleString()} for ${target.id}.`);
      } catch {
        setPaymentFormError("Network error recording refund payment. You may retry safely.");
      } finally {
        setIsSubmittingPayment(false);
      }
      return;
    }

    if (!target.canRecordPayment || target.maxPayableAmount <= 0) {
      setPaymentFormError("This booking has reached its full payable amount.");
      return;
    }
    if (enteredAmt - target.maxPayableAmount > 0.01) {
      setPaymentFormError(`Amount exceeds remaining payable limit (₱${target.maxPayableAmount.toLocaleString()}).`);
      return;
    }
    if (paymentForm.paymentMethod !== "Cash" && !paymentForm.referenceNumber.trim()) {
      setPaymentFormError(`Please enter a ${paymentForm.paymentMethod} reference number.`);
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await api(`/applications/${encodeURIComponent(target.rawId)}/payments`, {
        method: "POST",
        body: {
          amount: enteredAmt,
          paymentType: paymentForm.paymentType,
          paymentMethod: paymentForm.paymentMethod,
          referenceNumber: paymentForm.referenceNumber.trim(),
          receiptNo: paymentForm.receiptNo.trim(),
          dateTime: paymentForm.dateReceived,
          notes: paymentForm.notes.trim(),
          idempotencyKey: paymentRequestKey,
        },
      });

      if (!res.ok) {
        setPaymentFormError(res.data?.error || "Could not record payment transaction.");
        return;
      }

      if (res.data?.application) {
        replaceApplicationInState(res.data.application);
      } else {
        await fetchApplications();
      }

      setIsPaymentModalOpen(false);
      showBanner(res.data?.message || `Recorded payment of ₱${enteredAmt.toLocaleString()} for ${target.id}.`);
    } catch {
      setPaymentFormError("Network error while recording payment. You may retry safely without creating duplicates.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open Void Payment Confirmation modal
  const openVoidPaymentModal = (booking, entry, index) => {
    const entryId = entry?._id ? String(entry._id) : "";
    const linkedRefunds = (booking.refunds || []).filter((r) => {
      if (entryId && String(r.linkedPaymentId || "") === entryId) return true;
      if (!r.linkedPaymentId && entry?.receiptNo && r.linkedReceiptNo === entry.receiptNo) return true;
      return false;
    });

    setVoidModalTarget({
      bookingId: booking.id,
      rawId: booking.rawId,
      entry,
      index,
      linkedRefunds,
    });
    setVoidReason("");
    setVoidRefundReviewed(false);
    setVoidRefundReviewNote("");
    setVoidModalError("");
    setVoidRequestKey(makeRequestKey("void"));
  };

  // Submit Void Payment confirmation
  const handleConfirmVoidPayment = async (e) => {
    e.preventDefault();
    if (isSubmittingVoid || !voidModalTarget) return;
    setVoidModalError("");

    const trimmedReason = voidReason.trim();
    if (!trimmedReason) {
      setVoidModalError("Please enter a clear reason why this payment is being voided.");
      return;
    }

    const hasLinkedRefunds = (voidModalTarget.linkedRefunds || []).length > 0;
    if (hasLinkedRefunds && !voidRefundReviewed) {
      setVoidModalError("You must review and acknowledge the linked refund record(s) before voiding.");
      return;
    }
    if (hasLinkedRefunds && !voidRefundReviewNote.trim()) {
      setVoidModalError("Please provide a review note explaining the linked refund adjustment.");
      return;
    }

    setIsSubmittingVoid(true);
    try {
      const res = await api(`/applications/${encodeURIComponent(voidModalTarget.rawId)}/void-payment`, {
        method: "POST",
        body: {
          entryId: voidModalTarget.entry?._id || undefined,
          index: voidModalTarget.index,
          reason: trimmedReason,
          refundReviewed: hasLinkedRefunds ? voidRefundReviewed : false,
          refundReviewNote: hasLinkedRefunds ? voidRefundReviewNote.trim() : "",
          idempotencyKey: voidRequestKey,
        },
      });

      if (!res.ok) {
        if (res.data?.code === "LINKED_REFUND_REVIEW_REQUIRED" && Array.isArray(res.data?.linkedRefunds)) {
          setVoidModalTarget((prev) => (prev ? { ...prev, linkedRefunds: res.data.linkedRefunds } : prev));
        }
        setVoidModalError(res.data?.error || "Failed to void payment transaction.");
        return;
      }

      if (res.data?.application) {
        replaceApplicationInState(res.data.application);
      } else {
        await fetchApplications();
      }

      setVoidModalTarget(null);
      showBanner(res.data?.message || "Payment transaction voided and balance recalculated.");
    } catch {
      setVoidModalError("Network error while voiding payment. Please retry.");
    } finally {
      setIsSubmittingVoid(false);
    }
  };

  // Confirm or discard flagged payment on a voided booking
  const handleConfirmFlaggedPaymentReceived = async (booking, entry, index) => {
    const entryId = entry?._id ? String(entry._id) : `idx-${index}`;
    if (reviewingEntryId) return;
    setReviewingEntryId(entryId);
    try {
      const res = await api(`/applications/${encodeURIComponent(booking.rawId)}/review-flagged-payment`, {
        method: "POST",
        body: {
          entryId: entry?._id || undefined,
          index,
          outcome: "confirmed_received",
          note: "Confirmed funds actually received by KIMPC management.",
          idempotencyKey: makeRequestKey("rev"),
        },
      });
      if (!res.ok) {
        showBanner(res.data?.error || "Could not confirm payment entry.", true);
        return;
      }
      if (res.data?.application) replaceApplicationInState(res.data.application);
      else await fetchApplications();
      showBanner(res.data?.message || "Flagged payment confirmed as received. You may now finalize refund disposition.");
    } catch {
      showBanner("Failed to review flagged payment.", true);
    } finally {
      setReviewingEntryId("");
    }
  };

  // Build unified chronological ledger entries (payments + refunds inside Payment History)
  const buildUnifiedPaymentHistory = (b) => {
    if (!b) return [];
    const items = [
      ...(b.paymentHistory || []).map((entry, idx) => ({
        kind: "payment",
        key: `${b.id}-p-${entry._id || idx}`,
        sortTime: new Date(entry.recordedAt || entry.dateTime || 0).getTime() || 0,
        entry,
        idx,
      })),
      ...(b.refunds || []).map((refund, idx) => ({
        kind: "refund",
        key: `${b.id}-r-${refund._id || idx}`,
        sortTime: new Date(refund.recordedAt || refund.refundDate || 0).getTime() || 0,
        refund,
        idx,
      })),
    ];
    items.sort((a, c) => a.sortTime - c.sortTime);
    return items;
  };

  // Download transaction summary (.txt)
  const handleDownloadReceiptText = (b) => {
    if (!b) return;
    const unified = buildUnifiedPaymentHistory(b);
    const historyLines =
      unified.length > 0
        ? [
            "-----------------------------------------------------------",
            "PAYMENT HISTORY:",
            ...unified.map((item, idx) => {
              if (item.kind === "refund") {
                const r = item.refund;
                return `  #${idx + 1} [REFUND] ${r.refundNo || "REF"} | -PHP ${Number(r.amount || 0).toLocaleString()} | ${r.paymentMethod || "Cash"} | Linked OR: ${r.linkedReceiptNo || "—"} | Ref: ${r.referenceNumber || "—"} | Reason: ${r.reason} | By: ${r.recordedBy || "Manager"}`;
              }
              const h = item.entry;
              return `  #${idx + 1} ${h.receiptNo || "OR"} | PHP ${Number(h.amount || 0).toLocaleString()} | ${h.paymentMethod || "Cash"}${h.referenceNumber ? ` (Ref: ${h.referenceNumber})` : ""} | ${formatDateTimeDisplay(h.dateTime)} | By: ${h.receivedBy || "Manager"}${h.isVoided ? ` [VOIDED: ${h.voidReason || "Voided"}]` : ""}`;
            }),
          ]
        : [];

    const lines = [
      "===========================================================",
      "  KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE (KIMPC)  ",
      "           BOOKING FINANCIAL & PAYMENT STATEMENT           ",
      "===========================================================",
      `Booking ID:       ${b.id}`,
      `Booking Status:   ${b.bookingStatus}`,
      `Payment Status:   ${b.paymentStatus}`,
      "-----------------------------------------------------------",
      `Member Name:      ${b.clientName}`,
      `Contact Phone:    ${b.clientPhone || "—"}`,
      `Machinery Unit:   ${b.machineryModel}`,
      `Rental Period:    ${b.rentalPeriod} (${formatBookingDateRange(b.startDate, b.endDate)})`,
      "-----------------------------------------------------------",
      `Rental Charge:    PHP ${b.rentalCharge.toLocaleString()}`,
      ...(b.cancellationFee > 0 ? [`Cancellation Fee: PHP ${b.cancellationFee.toLocaleString()}`] : []),
      `Total Paid:       PHP ${b.totalPaid.toLocaleString()}`,
      ...(b.totalRefunded > 0 ? [`Total Refunded:   PHP ${b.totalRefunded.toLocaleString()}`] : []),
      `Balance Due:      PHP ${b.balanceDue.toLocaleString()}`,
      ...historyLines,
      "===========================================================",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `KIMPC_Statement_${b.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="wz-dashboard-container">
      <ManagerSidebar />

      <main className="wz-content-wrapper">
        <ManagerTopbar title="Payments" />

        <div className="wz-payments-page-wrapper">
          {/* Top 3 KPI Metric Cards */}
          <section className="wz-payments-kpi-grid">
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Net Collected Revenue</span>
                  <span className="wz-kpi-value">₱{kpiStats.netCollectedSum.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                <span className="wz-kpi-trend-plain" style={{ color: "#16a34a" }}>
                  {kpiStats.paidCount} paid
                </span>
                <span className="wz-kpi-subtext">
                  {kpiStats.totalRefundedSum > 0
                    ? `₱${kpiStats.totalRefundedSum.toLocaleString()} refunded`
                    : `${allBookings.length} bookings synced`}
                </span>
              </div>
            </div>

            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Unpaid Balance Due</span>
                  <span className="wz-kpi-value">₱{kpiStats.balanceDueSum.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                <span className="wz-kpi-trend-plain" style={{ color: "#d97706" }}>
                  {kpiStats.outstandingCount} open
                </span>
                <span className="wz-kpi-subtext">awaiting collection</span>
              </div>
            </div>

            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Total Refunded</span>
                  <span className="wz-kpi-value">₱{kpiStats.totalRefundedSum.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                <span className="wz-kpi-trend-plain" style={{ color: kpiStats.flaggedCount > 0 ? "#c2410c" : "#6d28d9" }}>
                  {kpiStats.flaggedCount > 0
                    ? `${kpiStats.flaggedCount} flagged`
                    : `${kpiStats.refundedCount} booking${kpiStats.refundedCount === 1 ? "" : "s"}`}
                </span>
                <span className="wz-kpi-subtext">
                  {kpiStats.flaggedCount > 0 ? "awaiting entry check" : "recorded in payments"}
                </span>
              </div>
            </div>
          </section>

          {/* Feedback Banner */}
          {feedback.message && (
            <div
              role="status"
              style={{
                background: feedback.isError ? "#fef2f2" : "#f0fdf4",
                border: `1px solid ${feedback.isError ? "#fecaca" : "#bbf7d0"}`,
                borderRadius: "10px",
                padding: "10px 16px",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: feedback.isError ? "#b91c1c" : "#166534",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback({ message: "", isError: false })}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontSize: "1rem" }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Filters & Action Bar */}
          <section className="wz-fin-filter-bar">
            <div className="wz-fin-filter-left">
              <ManagerSearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search booking ID, member, machinery, OR / ref no"
                filters={[
                  {
                    id: "status",
                    label: "Payment Status",
                    value: statusFilter,
                    defaultValue: "All",
                    onChange: setStatusFilter,
                    options: [
                      { value: "All", label: "All Payment Statuses" },
                      { value: "Unpaid", label: "Unpaid" },
                      { value: "Partially Paid", label: "Partially Paid" },
                      { value: "Paid", label: "Paid" },
                      { value: "Refund Pending", label: "Refund Pending" },
                      { value: "Partially Refunded", label: "Partially Refunded" },
                      { value: "Fully Refunded", label: "Fully Refunded" },
                      { value: "No Balance", label: "No Balance (Closed)" },
                      { value: "Needs Review", label: "Flagged Payments" },
                    ],
                  },
                  {
                    id: "dateRange",
                    label: "Period",
                    value: dateRangeFilter,
                    defaultValue: "All Time",
                    onChange: setDateRangeFilter,
                    options: [
                      { value: "All Time", label: "All Time" },
                      { value: "This Month", label: "This Month" },
                      { value: "Last Month", label: "Last Month" },
                    ],
                  },
                ]}
                sort={{
                  value: sortBy,
                  defaultValue: "date_desc",
                  onChange: setSortBy,
                  options: [
                    { value: "date_desc", label: "Date (Newest)" },
                    { value: "date_asc", label: "Date (Oldest)" },
                    { value: "balance_desc", label: "Balance Due (High to Low)" },
                    { value: "amount_desc", label: "Rental Charge (High to Low)" },
                    { value: "amount_asc", label: "Rental Charge (Low to High)" },
                    { value: "client_asc", label: "Member Name (A-Z)" },
                  ],
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => openRecordPaymentModal(null)}
                disabled={modalSelectableBookings.length === 0}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: modalSelectableBookings.length === 0 ? "#cbd5e1" : "#ff3b5c",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 18px",
                  fontSize: "0.85rem",
                  fontWeight: "700",
                  cursor: modalSelectableBookings.length === 0 ? "not-allowed" : "pointer",
                  boxShadow: modalSelectableBookings.length === 0 ? "none" : "0 4px 12px rgba(255, 59, 92, 0.25)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Record Payment
              </button>
            </div>
          </section>

          {/* Booking Payment Summaries Table */}
          <section className="wz-fin-table-card">
            <div style={{ overflowX: "auto" }}>
              <table className="wz-fin-table">
                <thead>
                  <tr>
                    <th>Payment Status</th>
                    <th>Booking ID</th>
                    <th>Member Name</th>
                    <th>Machinery Unit</th>
                    <th>Booking Status</th>
                    <th>Rental Charge</th>
                    <th>Total Paid</th>
                    <th>Balance Due</th>
                    <th style={{ textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && allBookings.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        Loading bookings and payment summaries...
                      </td>
                    </tr>
                  ) : filteredBookings.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        No booking payment records found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedBookings.map((b) => (
                      <tr key={b.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span className={getPaymentBadgeClass(b.paymentStatus)}>
                            {b.paymentStatus}
                          </span>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => openViewDetails(b)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              fontWeight: 800,
                              color: "#0f172a",
                              cursor: "pointer",
                              textDecoration: "underline",
                              textDecorationColor: "#cbd5e1",
                            }}
                            title="Open payment history"
                          >
                            {b.id}
                          </button>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: "#0f172a", lineHeight: 1.25 }}>{b.clientName}</div>
                          {b.clientPhone && (
                            <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{b.clientPhone}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ color: "#334155", fontWeight: 600, fontSize: "0.78rem" }}>{b.machineryModel}</div>
                          <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                            {formatBookingDateRange(b.startDate, b.endDate)} · {b.rentalPeriod}
                          </div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 600, color: "#334155" }}>
                            {b.bookingStatus}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                          ₱{b.rentalCharge.toLocaleString()}
                          {b.cancellationFee > 0 && (
                            <span className="wz-fin-amt-sub">
                              Fee applied: ₱{b.cancellationFee.toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 700, color: b.totalPaid > 0 ? "#059669" : "#64748b", whiteSpace: "nowrap" }}>
                          ₱{b.totalPaid.toLocaleString()}
                          {b.totalRefunded > 0 && (
                            <span className="wz-fin-amt-sub" style={{ color: "#6d28d9" }}>
                              Refunded ₱{b.totalRefunded.toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 800, color: b.balanceDue > 0 ? "#d97706" : "#0f172a", whiteSpace: "nowrap" }}>
                          ₱{b.balanceDue.toLocaleString()}
                          {b.isClosedBooking && b.refundableRemaining > 0 && (
                            <span className="wz-fin-amt-sub" style={{ color: "#6d28d9" }}>
                              Refundable: ₱{b.refundableRemaining.toLocaleString()}
                            </span>
                          )}
                          {b.isClosedBooking && b.totalPaid === 0 && b.cancellationFee === 0 && (
                            <span className="wz-fin-amt-sub">Closed (No Fee)</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => openViewDetails(b)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: "4px 8px",
                              color: "#059669",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                            title="View payment details and history"
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

            {/* Pagination Footer */}
            <div className="wz-table-footer" style={{ padding: "14px 20px", borderTop: "1px solid var(--wz-border)", background: "#ffffff" }}>
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
                  {Math.min(currentPage * pageSize, filteredBookings.length)} of {filteredBookings.length} bookings
                </span>
              </div>

              <div className="wz-pagination-btns">
                <button
                  type="button"
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
                    type="button"
                    className={`wz-page-btn ${p === currentPage ? "active" : ""}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="wz-page-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Next Page"
                >
                  &gt;
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ================= MODAL 1: RECORD PAYMENT RECEIVED / REFUND ================= */}
      {isPaymentModalOpen && (
        <div
          className="wz-payrec-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingPayment) setIsPaymentModalOpen(false);
          }}
        >
          <section className="wz-payrec-modal" role="dialog" aria-modal="true" aria-labelledby="record-payment-title">
            <div className="wz-payrec-header">
              <h3 id="record-payment-title" className="wz-payrec-title">
                Record Payment
              </h3>
              <button
                type="button"
                className="wz-payrec-close"
                aria-label="Close payment modal"
                disabled={isSubmittingPayment}
                onClick={() => setIsPaymentModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form className="wz-payrec-form" onSubmit={handleSavePayment}>
              <div className="wz-payrec-body">
                {paymentFormError && <div className="wz-payrec-error" role="alert">{paymentFormError}</div>}

                <div className="wz-payrec-field">
                  <label className="wz-payrec-label" htmlFor="rec-booking">
                    <span>Select Booking <span className="wz-payrec-req">*</span></span>
                  </label>
                  <select
                    id="rec-booking"
                    className="wz-payrec-control"
                    required
                    value={paymentForm.bookingId}
                    onChange={(e) => handlePaymentBookingSelect(e.target.value)}
                  >
                    <option value="">
                      {bookingsForCurrentPaymentType.length === 0
                        ? paymentForm.paymentType === "Refund Payment"
                          ? "No cancelled or rejected bookings with refundable payments"
                          : paymentForm.paymentType === "Cancellation Fee Payment"
                          ? "No cancelled or rejected bookings available"
                          : "No active bookings with balance due"
                        : "Choose a booking..."}
                    </option>
                    {bookingsForCurrentPaymentType.map((b) => {
                      const amountHint =
                        paymentForm.paymentType === "Refund Payment"
                          ? `Refundable ₱${b.refundableRemaining.toLocaleString()}`
                          : b.balanceDue > 0
                          ? `Bal ₱${b.balanceDue.toLocaleString()}`
                          : `Max ₱${b.maxPayableAmount.toLocaleString()}`;
                      return (
                        <option key={b.id} value={b.id}>
                          {b.id} — {b.clientName} ({b.bookingStatus}) · {amountHint}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="wz-payrec-row">
                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-pay-type">
                      <span>Payment Type <span className="wz-payrec-req">*</span></span>
                    </label>
                    <select
                      id="rec-pay-type"
                      className="wz-payrec-control"
                      value={paymentForm.paymentType}
                      onChange={(e) => handlePaymentTypeChange(e.target.value)}
                    >
                      <option value="Full Rental Payment">Full Rental Payment</option>
                      <option value="Down Payment">Down Payment</option>
                      <option value="Partial Rental Payment">Partial Rental Payment</option>
                      <option value="Final Payment">Final Payment</option>
                      <option value="Cancellation Fee Payment">Cancellation Fee Payment</option>
                      <option value="Refund Payment">Refund Payment</option>
                    </select>
                  </div>

                  {paymentForm.paymentType === "Refund Payment" ? (
                    <div className="wz-payrec-field">
                      <label className="wz-payrec-label" htmlFor="rec-linked-payment">
                        <span>Link to Original Payment <span className="wz-payrec-req">*</span></span>
                      </label>
                      <select
                        id="rec-linked-payment"
                        className="wz-payrec-control"
                        required
                        value={paymentForm.linkedPaymentId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          const chosen = selectedPaymentRefundMeta.entries.find((item) => item.entryId === nextId);
                          const cap = chosen
                            ? Math.min(chosen.remainingOnEntry, selectedBookingForPayment?.refundableRemaining || 0)
                            : selectedBookingForPayment?.refundableRemaining || 0;
                          setPaymentForm((prev) => ({
                            ...prev,
                            linkedPaymentId: nextId,
                            amount: cap > 0 ? String(cap) : "",
                            paymentMethod: chosen?.entry?.paymentMethod || prev.paymentMethod,
                          }));
                        }}
                      >
                        <option value="">Select original payment...</option>
                        {selectedPaymentRefundMeta.entries.map(({ entry, entryId, remainingOnEntry }) => (
                          <option key={entryId} value={entryId} disabled={remainingOnEntry <= 0}>
                            {entry.receiptNo || "OR"} · Paid ₱{Number(entry.amount || 0).toLocaleString()} ({entry.paymentMethod}) · Refundable ₱{remainingOnEntry.toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="wz-payrec-field">
                      <label className="wz-payrec-label" htmlFor="rec-or-number">
                        <span>Official Receipt (OR) No. <span className="wz-payrec-req">*</span></span>
                      </label>
                      <input
                        id="rec-or-number"
                        className="wz-payrec-control mono"
                        type="text"
                        required
                        placeholder="OR-2026-0001"
                        value={paymentForm.receiptNo}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, receiptNo: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                <div className="wz-payrec-row">
                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-amount">
                      <span>
                        {paymentForm.paymentType === "Refund Payment" ? "Refund Amount" : "Amount Received"}{" "}
                        <span className="wz-payrec-req">*</span>
                      </span>
                    </label>
                    <div className="wz-payrec-input-wrap">
                      <span className="wz-payrec-prefix">₱</span>
                      <input
                        id="rec-amount"
                        className="wz-payrec-amount-input"
                        type="number"
                        min="0.01"
                        max={
                          paymentForm.paymentType === "Refund Payment"
                            ? selectedPaymentRefundMeta.maxForSelected || undefined
                            : selectedBookingForPayment
                            ? selectedBookingForPayment.maxPayableAmount
                            : undefined
                        }
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                      />
                    </div>
                    {paymentForm.paymentType === "Refund Payment" ? (
                      <div className="wz-payrec-hint">
                        <span>
                          Max refundable: <strong>₱{selectedPaymentRefundMeta.maxForSelected.toLocaleString()}</strong>
                        </span>
                        {selectedPaymentRefundMeta.maxForSelected > 0 && (
                          <button
                            type="button"
                            className="wz-payrec-max-btn"
                            onClick={() =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                amount: String(selectedPaymentRefundMeta.maxForSelected),
                              }))
                            }
                          >
                            Full refundable
                          </button>
                        )}
                      </div>
                    ) : selectedBookingForPayment ? (
                      <div className="wz-payrec-hint">
                        <span>
                          {selectedBookingForPayment.isClosedBooking && selectedBookingForPayment.balanceDue === 0
                            ? `Closed balance: ₱0 · Max receivable: `
                            : `Balance due: `}
                          <strong>
                            ₱{(selectedBookingForPayment.isClosedBooking && selectedBookingForPayment.balanceDue === 0
                              ? selectedBookingForPayment.maxPayableAmount
                              : selectedBookingForPayment.balanceDue
                            ).toLocaleString()}
                          </strong>
                        </span>
                        {selectedBookingForPayment.maxPayableAmount > 0 && (
                          <button
                            type="button"
                            className="wz-payrec-max-btn"
                            onClick={() =>
                              setPaymentForm((prev) => ({
                                ...prev,
                                amount: String(
                                  selectedBookingForPayment.balanceDue > 0
                                    ? selectedBookingForPayment.balanceDue
                                    : selectedBookingForPayment.maxPayableAmount
                                ),
                              }))
                            }
                          >
                            {selectedBookingForPayment.balanceDue > 0 ? "Full balance" : "Full amount"}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-method">
                      <span>
                        {paymentForm.paymentType === "Refund Payment" ? "Refund Method" : "Payment Method"}{" "}
                        <span className="wz-payrec-req">*</span>
                      </span>
                    </label>
                    <select
                      id="rec-method"
                      className="wz-payrec-control"
                      value={paymentForm.paymentMethod}
                      onChange={(e) =>
                        setPaymentForm((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value,
                        }))
                      }
                    >
                      <option value="Cash">Cash</option>
                      <option value="GCash">GCash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Check">Check</option>
                    </select>
                  </div>
                </div>

                <div className="wz-payrec-row">
                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-datetime">
                      <span>
                        {paymentForm.paymentType === "Refund Payment"
                          ? "Refund Date & Time"
                          : "Date and Time Received"}{" "}
                        <span className="wz-payrec-req">*</span>
                      </span>
                    </label>
                    <input
                      id="rec-datetime"
                      className="wz-payrec-control"
                      type="datetime-local"
                      required
                      value={paymentForm.dateReceived}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, dateReceived: e.target.value }))}
                    />
                  </div>

                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-ref">
                      <span>
                        {paymentForm.paymentType === "Refund Payment" ? "Refund Reference Number" : "Reference Number"}{" "}
                        {(paymentForm.paymentType === "Refund Payment" || paymentForm.paymentMethod !== "Cash") && (
                          <span className="wz-payrec-req">*</span>
                        )}
                      </span>
                    </label>
                    <input
                      id="rec-ref"
                      className="wz-payrec-control mono"
                      type="text"
                      required={paymentForm.paymentType === "Refund Payment" || paymentForm.paymentMethod !== "Cash"}
                      placeholder={
                        paymentForm.paymentType === "Refund Payment"
                          ? "Voucher / GCash / Transfer ref"
                          : paymentForm.paymentMethod === "Cash"
                          ? "Optional voucher/slip ref"
                          : "Enter reference number"
                      }
                      value={paymentForm.referenceNumber}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, referenceNumber: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="wz-payrec-field">
                  <label className="wz-payrec-label" htmlFor="rec-notes">
                    <span>
                      {paymentForm.paymentType === "Refund Payment" ? (
                        <>Refund Reason <span className="wz-payrec-req">*</span></>
                      ) : (
                        "Notes (optional)"
                      )}
                    </span>
                  </label>
                  <input
                    id="rec-notes"
                    className="wz-payrec-control"
                    type="text"
                    required={paymentForm.paymentType === "Refund Payment"}
                    placeholder={
                      paymentForm.paymentType === "Refund Payment"
                        ? "e.g., Cancellation refund returned to member"
                        : "e.g., 50% down payment upon approval"
                    }
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                {/* Live Summary */}
                <div className="wz-payrec-summary">
                  <div className="wz-payrec-summary-head">
                    <span className="wz-payrec-summary-title">Booking Financial Preview</span>
                    {selectedBookingForPayment && (
                      <span className="wz-payrec-summary-status">
                        {selectedBookingForPayment.bookingStatus} · {selectedBookingForPayment.paymentStatus}
                      </span>
                    )}
                  </div>
                  {selectedBookingForPayment ? (
                    (() => {
                      const entered = Math.max(0, Number(paymentForm.amount) || 0);
                      if (paymentForm.paymentType === "Refund Payment") {
                        const afterRefunded = Math.round((selectedBookingForPayment.totalRefunded + entered) * 100) / 100;
                        const remainingRefundable = Math.max(
                          0,
                          Math.round((selectedBookingForPayment.refundableRemaining - entered) * 100) / 100
                        );
                        return (
                          <div className="wz-payrec-summary-grid">
                            <div className="wz-payrec-kv">
                              <span className="wz-payrec-k">Member</span>
                              <span className="wz-payrec-v">{selectedBookingForPayment.clientName}</span>
                            </div>
                            <div className="wz-payrec-kv">
                              <span className="wz-payrec-k">Collected So Far</span>
                              <span className="wz-payrec-v wz-payrec-v-paid">
                                ₱{selectedBookingForPayment.totalPaid.toLocaleString()}
                              </span>
                            </div>
                            <div className="wz-payrec-kv">
                              <span className="wz-payrec-k">Refund Input Amount</span>
                              <span className="wz-payrec-v" style={{ color: "#6d28d9" }}>
                                {entered > 0 ? `-₱${entered.toLocaleString()}` : "₱0"}
                              </span>
                            </div>
                            <div className="wz-payrec-kv">
                              <span className="wz-payrec-k">Refunded After</span>
                              <span className="wz-payrec-v" style={{ color: "#6d28d9" }}>
                                ₱{afterRefunded.toLocaleString()}
                              </span>
                            </div>
                            <div className="wz-payrec-kv">
                              <span className="wz-payrec-k">Remaining Refundable</span>
                              <span className="wz-payrec-v">
                                ₱{remainingRefundable.toLocaleString()}
                                {remainingRefundable === 0 && entered > 0 ? " (Fully Refunded)" : entered > 0 ? " (Partially Refunded)" : ""}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      const baseTarget =
                        selectedBookingForPayment.balanceDue > 0
                          ? selectedBookingForPayment.balanceDue
                          : selectedBookingForPayment.maxPayableAmount;
                      const afterBalance = Math.max(
                        0,
                        Math.round((baseTarget - entered) * 100) / 100
                      );
                      return (
                        <div className="wz-payrec-summary-grid">
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Member</span>
                            <span className="wz-payrec-v">{selectedBookingForPayment.clientName}</span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Machinery</span>
                            <span className="wz-payrec-v">{selectedBookingForPayment.machineryModel}</span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Rental Charge</span>
                            <span className="wz-payrec-v">
                              ₱{selectedBookingForPayment.rentalCharge.toLocaleString()}
                            </span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Paid So Far</span>
                            <span className="wz-payrec-v wz-payrec-v-paid">
                              ₱{selectedBookingForPayment.totalPaid.toLocaleString()}
                            </span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Payment Input Amount</span>
                            <span className="wz-payrec-v wz-payrec-v-paid">
                              {entered > 0 ? `₱${entered.toLocaleString()}` : "₱0"}
                            </span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">
                              {selectedBookingForPayment.isClosedBooking ? "Remaining Receivable After" : "Remaining Balance After"}
                            </span>
                            <span className={`wz-payrec-v ${afterBalance > 0 ? "wz-payrec-v-bal" : "wz-payrec-v-paid"}`}>
                              ₱{afterBalance.toLocaleString()}
                              {afterBalance > 0 && entered > 0 ? " (Partially Paid)" : afterBalance === 0 && entered > 0 ? " (Paid)" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="wz-payrec-summary-empty">
                      Select a booking above to preview calculation.
                    </div>
                  )}
                </div>

                <div className="wz-payrec-receiver" aria-label="Processed by account">
                  <div className="wz-payrec-receiver-left">
                    <span className="wz-payrec-receiver-label">
                      {paymentForm.paymentType === "Refund Payment" ? "Recorded by:" : "Received by:"}
                    </span>
                    <span className="wz-payrec-receiver-name">{activeReceiverName}</span>
                  </div>
                  <span className="wz-payrec-readonly-tag">Manager Account</span>
                </div>
              </div>

              <div className="wz-payrec-footer">
                <button
                  type="button"
                  className="wz-payrec-btn-cancel"
                  disabled={isSubmittingPayment}
                  onClick={() => setIsPaymentModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="wz-payrec-btn-save" disabled={isSubmittingPayment}>
                  {isSubmittingPayment
                    ? "Saving..."
                    : paymentForm.paymentType === "Refund Payment"
                    ? "Save Refund Payment"
                    : "Save Payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ================= MODAL 2: VIEW PAYMENT DETAILS & HISTORY ================= */}
      {viewingBooking && (
        <div
          className="wz-payview-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewingBookingId(null);
          }}
        >
          <section className="wz-payview-modal" role="dialog" aria-modal="true" aria-labelledby="payview-title">
            <div className="wz-payview-header">
              <div>
                <div className="wz-payview-kicker">Booking Ledger &amp; Payment History</div>
                <div className="wz-payview-title-row">
                  <h3 id="payview-title" className="wz-payview-title">{viewingBooking.id}</h3>
                  <span className={getPaymentBadgeClass(viewingBooking.paymentStatus)}>
                    {viewingBooking.paymentStatus}
                  </span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#64748b" }}>
                    Booking Status: {viewingBooking.bookingStatus}
                  </span>
                </div>
                <p className="wz-payview-sub">
                  {viewingBooking.clientName} · {viewingBooking.machineryModel}
                </p>
              </div>
              <button
                type="button"
                className="wz-payview-close"
                aria-label="Close details"
                onClick={() => setViewingBookingId(null)}
              >
                ✕
              </button>
            </div>

            <div className="wz-payview-body">
              {/* Top Metric Strip */}
              <div className="wz-payview-metrics">
                <div className="wz-payview-metric">
                  <span className="wz-payview-metric-label">Rental Charge</span>
                  <span className="wz-payview-metric-val">
                    ₱{viewingBooking.rentalCharge.toLocaleString()}
                  </span>
                </div>
                <div className="wz-payview-metric">
                  <span className="wz-payview-metric-label">Total Paid</span>
                  <span className="wz-payview-metric-val is-paid">
                    ₱{viewingBooking.totalPaid.toLocaleString()}
                  </span>
                  {viewingBooking.totalRefunded > 0 && (
                    <span style={{ fontSize: "0.7rem", color: "#6d28d9", fontWeight: 700 }}>
                      Refunded ₱{viewingBooking.totalRefunded.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="wz-payview-metric">
                  <span className="wz-payview-metric-label">Balance Due</span>
                  <span
                    className={`wz-payview-metric-val ${
                      viewingBooking.balanceDue > 0 ? "is-balance" : ""
                    }`}
                  >
                    ₱{viewingBooking.balanceDue.toLocaleString()}
                  </span>
                  {viewingBooking.isClosedBooking && viewingBooking.refundableRemaining > 0 && (
                    <span style={{ fontSize: "0.7rem", color: "#6d28d9", fontWeight: 700 }}>
                      Refundable ₱{viewingBooking.refundableRemaining.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Booking Details */}
              <div className="wz-payview-card">
                <div className="wz-payview-section-title">Booking Information</div>
                <div className="wz-payview-grid">
                  <div className="wz-payview-kv">
                    <span className="wz-payview-k">Member</span>
                    <span className="wz-payview-v">{viewingBooking.clientName}</span>
                  </div>
                  <div className="wz-payview-kv">
                    <span className="wz-payview-k">Contact</span>
                    <span className="wz-payview-v">{viewingBooking.clientPhone || viewingBooking.clientEmail || "—"}</span>
                  </div>
                  <div className="wz-payview-kv">
                    <span className="wz-payview-k">Machinery &amp; Period</span>
                    <span className="wz-payview-v">{viewingBooking.machineryModel} ({viewingBooking.rentalPeriod})</span>
                  </div>
                  <div className="wz-payview-kv">
                    <span className="wz-payview-k">Schedule</span>
                    <span className="wz-payview-v">{formatBookingDateRange(viewingBooking.startDate, viewingBooking.endDate)}</span>
                  </div>
                </div>

                {viewingBooking.gcashProof && (
                  <div className="wz-payview-proof">
                    <button
                      type="button"
                      className="wz-payview-proof-thumb"
                      onClick={() => setPreviewGcashImage(viewingBooking.gcashProof)}
                    >
                      View Uploaded Payment Proof Screenshot
                    </button>
                  </div>
                )}
              </div>

              {/* Unified Payment History */}
              <div className="wz-payview-card">
                <div className="wz-payview-section-title">
                  <span>Payment History</span>
                  <span>
                    {viewingBooking.summary.activePaymentCount > 0 ||
                    viewingBooking.summary.voidedPaymentCount > 0 ||
                    viewingBooking.refunds.length > 0
                      ? [
                          viewingBooking.summary.activePaymentCount > 0
                            ? `${viewingBooking.summary.activePaymentCount} active`
                            : null,
                          viewingBooking.summary.voidedPaymentCount > 0
                            ? `${viewingBooking.summary.voidedPaymentCount} voided`
                            : null,
                          viewingBooking.refunds.length > 0
                            ? `${viewingBooking.refunds.length} refund${viewingBooking.refunds.length === 1 ? "" : "s"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "No payments recorded"}
                  </span>
                </div>

                {(() => {
                  const unifiedHistory = buildUnifiedPaymentHistory(viewingBooking);
                  if (unifiedHistory.length === 0) {
                    return (
                      <div className="wz-payview-empty">
                        No payment transactions saved for this booking yet.
                      </div>
                    );
                  }
                  return (
                    <div className="wz-payview-history-list">
                      {unifiedHistory.map((item) => {
                        if (item.kind === "refund") {
                          const ref = item.refund;
                          return (
                            <div key={item.key} className="wz-payview-refund-item">
                              <div className="wz-payview-history-left">
                                <div
                                  className="wz-payview-history-top"
                                  style={{ color: "#5b21b6", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}
                                >
                                  <span
                                    className="wz-pay-pill is-partial-refund"
                                    style={{ padding: "1px 6px", fontSize: "0.65rem" }}
                                  >
                                    Refund
                                  </span>
                                  <span>
                                    {ref.refundNo || `Refund #${item.idx + 1}`} · Linked OR: {ref.linkedReceiptNo || "Payment"}
                                  </span>
                                </div>
                                <div className="wz-payview-history-sub">
                                  {formatDateTimeDisplay(ref.refundDate)} · {ref.paymentMethod || "Cash"} · Ref: {ref.referenceNumber} · Recorded by {ref.recordedBy || "Manager"}
                                </div>
                                {ref.reason && (
                                  <div className="wz-payview-history-sub" style={{ color: "#334155", marginTop: "2px" }}>
                                    Reason: {ref.reason}
                                  </div>
                                )}
                              </div>
                              <span className="wz-payview-history-amt" style={{ color: "#6d28d9" }}>
                                -₱{Number(ref.amount || 0).toLocaleString()}
                              </span>
                            </div>
                          );
                        }

                        const entry = item.entry;
                        const idx = item.idx;
                        const isVoided = Boolean(entry.isVoided);
                        const needsFlagReview =
                          !isVoided && entry.flaggedForReview && entry.reviewStatus === "pending_review";
                        const rowId = entry._id ? String(entry._id) : `idx-${idx}`;

                        return (
                          <div
                            key={item.key}
                            className={`wz-payview-history-item${isVoided ? " is-voided" : ""}`}
                            style={{ flexDirection: "column", alignItems: "stretch" }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                              <div className="wz-payview-history-left">
                                <div className="wz-payview-history-top">
                                  <span>{entry.paymentType || `Payment #${idx + 1}`} · {entry.paymentMethod || "Cash"}</span>
                                  {isVoided && <span className="wz-payview-void-badge">Voided</span>}
                                  {needsFlagReview && (
                                    <span className="wz-pay-review-flag" style={{ marginTop: 0 }}>Flagged Review</span>
                                  )}
                                  {!isVoided && entry.reviewStatus === "confirmed_received" && (
                                    <span className="wz-pay-pill is-paid" style={{ padding: "1px 6px", fontSize: "0.65rem" }}>Verified</span>
                                  )}
                                </div>
                                <div className="wz-payview-history-sub">
                                  {formatDateTimeDisplay(entry.dateTime)}
                                  {entry.receiptNo ? ` · OR ${entry.receiptNo}` : ""}
                                  {entry.referenceNumber ? ` · Ref: ${entry.referenceNumber}` : ""}
                                  {entry.receivedBy ? ` · By ${entry.receivedBy}` : ""}
                                </div>
                              </div>

                              <div className="wz-payview-history-right">
                                <span className="wz-payview-history-amt">
                                  ₱{Number(entry.amount || 0).toLocaleString()}
                                </span>
                                {!isVoided && (
                                  <button
                                    type="button"
                                    className="wz-payview-void-btn"
                                    title="Void payment entry"
                                    aria-label={`Void payment ${entry.receiptNo || idx + 1}`}
                                    onClick={() => openVoidPaymentModal(viewingBooking, entry, idx)}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="9" />
                                      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>

                            {needsFlagReview && (
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                                <button
                                  type="button"
                                  className="wz-payview-inline-btn is-emerald"
                                  disabled={Boolean(reviewingEntryId)}
                                  onClick={() => handleConfirmFlaggedPaymentReceived(viewingBooking, entry, idx)}
                                >
                                  {reviewingEntryId === rowId ? "Confirming..." : "Confirm Money Received"}
                                </button>
                                <button
                                  type="button"
                                  className="wz-payview-inline-btn is-danger"
                                  disabled={Boolean(reviewingEntryId)}
                                  onClick={() => openVoidPaymentModal(viewingBooking, entry, idx)}
                                >
                                  Void Entry
                                </button>
                              </div>
                            )}

                            {isVoided && (
                              <div className="wz-payview-void-meta">
                                Voided by <strong>{entry.voidedBy || "Manager"}</strong>
                                {entry.voidedAt ? ` on ${formatDateTimeDisplay(entry.voidedAt)}` : ""} —{" "}
                                <span>{entry.voidReason || "Wrong entry"}</span>
                                {entry.linkedRefundReviewNote ? ` (Refund Review: ${entry.linkedRefundReviewNote})` : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="wz-payview-footer">
              <button
                type="button"
                className="wz-payview-btn-ghost"
                onClick={() => handleDownloadReceiptText(viewingBooking)}
              >
                Download Statement (.txt)
              </button>
              <div className="wz-payview-footer-group">
                <button
                  type="button"
                  className="wz-payview-btn-ghost"
                  onClick={() => setReceiptBooking(viewingBooking)}
                >
                  Official Voucher
                </button>
                {(viewingBooking.canRecordPayment || viewingBooking.canRecordRefund) && (
                  <button
                    type="button"
                    className="wz-payview-btn-primary"
                    onClick={() => openRecordPaymentModal(viewingBooking)}
                  >
                    Record Payment
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================= MODAL 3: VOID PAYMENT CONFIRMATION ================= */}
      {voidModalTarget && (
        <div
          className="wz-payrec-overlay"
          style={{ zIndex: 10020 }}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingVoid) setVoidModalTarget(null);
          }}
        >
          <section className="wz-payrec-modal" role="dialog" aria-modal="true" aria-labelledby="void-payment-title">
            <div className="wz-payrec-header">
              <h3 id="void-payment-title" className="wz-payrec-title">
                Void Payment Transaction
              </h3>
              <button
                type="button"
                className="wz-payrec-close"
                disabled={isSubmittingVoid}
                onClick={() => setVoidModalTarget(null)}
              >
                ✕
              </button>
            </div>

            <form className="wz-payrec-form" onSubmit={handleConfirmVoidPayment}>
              <div className="wz-payrec-body">
                {voidModalError && <div className="wz-payrec-error" role="alert">{voidModalError}</div>}

                <div className="wz-payrec-summary">
                  <div className="wz-payrec-summary-head">
                    <span className="wz-payrec-summary-title">Original Payment Details</span>
                    <span className="wz-payrec-summary-status">{voidModalTarget.bookingId}</span>
                  </div>
                  <div className="wz-payrec-summary-grid">
                    <div className="wz-payrec-kv">
                      <span className="wz-payrec-k">Original Amount</span>
                      <span className="wz-payrec-v" style={{ color: "#b91c1c" }}>
                        ₱{Number(voidModalTarget.entry?.amount || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="wz-payrec-kv">
                      <span className="wz-payrec-k">Reference Number</span>
                      <span className="wz-payrec-v mono">
                        {voidModalTarget.entry?.referenceNumber || voidModalTarget.entry?.receiptNo || "No Reference"}
                      </span>
                    </div>
                    <div className="wz-payrec-kv">
                      <span className="wz-payrec-k">OR / Receipt No.</span>
                      <span className="wz-payrec-v mono">{voidModalTarget.entry?.receiptNo || "—"}</span>
                    </div>
                    <div className="wz-payrec-kv">
                      <span className="wz-payrec-k">Recorded On</span>
                      <span className="wz-payrec-v">{formatDateTimeDisplay(voidModalTarget.entry?.dateTime)}</span>
                    </div>
                  </div>
                </div>

                {(voidModalTarget.linkedRefunds || []).length > 0 && (
                  <div className="wz-payrec-warn-box">
                    <strong>Linked Refund Review Required</strong>
                    <span>
                      This payment has {voidModalTarget.linkedRefunds.length} linked refund record(s):{" "}
                      {voidModalTarget.linkedRefunds
                        .map((r) => `${r.refundNo || "REF"} (₱${Number(r.amount || 0).toLocaleString()}, Ref: ${r.referenceNumber})`)
                        .join("; ")}
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={voidRefundReviewed}
                        onChange={(e) => setVoidRefundReviewed(e.target.checked)}
                      />
                      I have reviewed the linked refund record(s) above before voiding this payment.
                    </label>
                    <input
                      type="text"
                      className="wz-payrec-control"
                      placeholder="Required refund review note (e.g., Refund reconciled manually)"
                      value={voidRefundReviewNote}
                      onChange={(e) => setVoidRefundReviewNote(e.target.value)}
                    />
                  </div>
                )}

                <div className="wz-payrec-field">
                  <label className="wz-payrec-label" htmlFor="void-reason-input">
                    <span>Reason for Voiding <span className="wz-payrec-req">*</span></span>
                  </label>
                  <textarea
                    id="void-reason-input"
                    className="wz-payrec-control"
                    rows="3"
                    required
                    placeholder="e.g., Entered ₱3,000 instead of actual ₱2,500 received"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                  />
                </div>

                <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b", lineHeight: 1.45 }}>
                  The voided entry will remain visible in Payment History with a <strong>Voided</strong> badge, excluded from payment totals, and you can immediately record a new payment with the corrected details.
                </p>
              </div>

              <div className="wz-payrec-footer">
                <button
                  type="button"
                  className="wz-payrec-btn-cancel"
                  disabled={isSubmittingVoid}
                  onClick={() => setVoidModalTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wz-payrec-btn-save"
                  style={{ background: "#dc2626" }}
                  disabled={isSubmittingVoid}
                >
                  {isSubmittingVoid ? "Voiding..." : "Confirm Void Payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ================= MODAL 5: OFFICIAL KIMPC VOUCHER ================= */}
      {receiptBooking && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10030,
            padding: "20px",
          }}
          onClick={() => setReceiptBooking(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "28px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setReceiptBooking(null)}
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
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: "center", borderBottom: "2px solid #0f172a", paddingBottom: "16px", marginBottom: "18px" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900, color: "#0f172a" }}>
                KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE (KIMPC)
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>
                Official Machinery Rental Billing &amp; Payment Statement
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", background: "#f8fafc", padding: "14px 16px", borderRadius: "10px", marginBottom: "18px", border: "1px solid #e2e8f0" }}>
              <div>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Billed To Member</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.95rem" }}>{receiptBooking.clientName}</div>
                {receiptBooking.clientPhone && <div style={{ fontSize: "0.78rem", color: "#475569" }}>{receiptBooking.clientPhone}</div>}
                {receiptBooking.clientEmail && <div style={{ fontSize: "0.76rem", color: "#64748b" }}>{receiptBooking.clientEmail}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Booking Reference</span>
                <div style={{ fontFamily: "monospace", fontWeight: 900, color: "#0f172a", fontSize: "1.05rem" }}>{receiptBooking.id}</div>
                <div style={{ fontSize: "0.76rem", color: "#475569" }}>Booking Status: <strong>{receiptBooking.bookingStatus}</strong></div>
                <div style={{ fontSize: "0.76rem", color: "#475569" }}>Payment Status: <strong>{receiptBooking.paymentStatus}</strong></div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "18px", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#0f172a", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Machinery &amp; Period</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <strong>{receiptBooking.machineryModel}</strong> ({receiptBooking.rentalPeriod})
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>
                    ₱{receiptBooking.rentalCharge.toLocaleString()}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px", color: "#059669", fontWeight: 600 }}>Total Active Payments Collected</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669", fontWeight: 700 }}>
                    ₱{receiptBooking.totalPaid.toLocaleString()}
                  </td>
                </tr>
                {receiptBooking.totalRefunded > 0 && (
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 12px", color: "#6d28d9", fontWeight: 600 }}>Total Refunds Issued</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#6d28d9", fontWeight: 700 }}>
                      -₱{receiptBooking.totalRefunded.toLocaleString()}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: "12px", fontWeight: 800 }}>Balance Due</td>
                  <td style={{ padding: "12px", textAlign: "right", fontWeight: 900, color: receiptBooking.balanceDue > 0 ? "#d97706" : "#059669" }}>
                    ₱{receiptBooking.balanceDue.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="wz-payview-btn-ghost"
                onClick={() => handleDownloadReceiptText(receiptBooking)}
              >
                Download Statement (.txt)
              </button>
              <button
                type="button"
                className="wz-payview-btn-primary"
                onClick={() => window.print()}
              >
                Print Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 6: GCASH SCREENSHOT PREVIEW ================= */}
      {previewGcashImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10040,
            padding: "20px",
          }}
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
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <strong style={{ fontSize: "1rem", color: "#0f172a" }}>Uploaded Payment Proof</strong>
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
              alt="Uploaded payment proof"
              style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: "8px", border: "1px solid #cbd5e1" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
