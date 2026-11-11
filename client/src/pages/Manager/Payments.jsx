import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getCachedApiData } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
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

function formatPaymentDateTimeDisplay(value) {
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
  });
}

const INITIAL_INVOICES = [];

export default function Payments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const activeReceiverName = user?.fullName || user?.name || user?.email || "Operations Manager";

  // Navigation sub-menu toggle
  const [financialsOpen, setFinancialsOpen] = useState(true);

  // Live applications & Invoices state
  const [liveApplications, setLiveApplications] = useState(() => {
    const cached = getCachedApiData("/applications");
    return Array.isArray(cached) ? cached : [];
  });
  const [loading, setLoading] = useState(() => !getCachedApiData("/applications"));
  const [feedback, setFeedback] = useState("");
  const [receiptInvoice, setReceiptInvoice] = useState(null);
  const [previewGcashImage, setPreviewGcashImage] = useState(null);

  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRangeFilter, setDateRangeFilter] = useState("All Dates");
  const [sortBy, setSortBy] = useState("date_desc");
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("kimpc_manager_pageSize");
    return saved ? Number(saved) : 8;
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch live applications to connect member bookings to manager financials
  const fetchApplications = async () => {
    try {
      if (!getCachedApiData("/applications")) {
        setLoading(true);
      }
      const res = await api("/applications");
      if (res.ok && Array.isArray(res.data)) {
        setLiveApplications(res.data);
      }
    } catch (err) {
      console.error("Error loading applications for payments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    const interval = setInterval(fetchApplications, 15000);
    return () => clearInterval(interval);
  }, []);

  // Merge live applications into invoices (strictly 1 transaction row per booking)
  const allInvoices = useMemo(() => {
    let storedPayments = {};
    try {
      storedPayments = JSON.parse(localStorage.getItem("kimpc_booking_payments") || "{}");
    } catch (e) {}

    const formattedLive = liveApplications.map((app, idx) => {
      const dailyRate = app.financials?.dailyRate || app.ratePerHectare || 2800;
      const days = getDaysCount(app.startDate, app.endDate);
      const total = Number(app.totalAmount || (dailyRate * days) || app.financials?.totalPaid) || 0;

      const bookingId =
        app.displayId || (app._id ? `BK-${String(app._id).slice(-6).toUpperCase()}` : `BK-WZ${1010 + idx}`);
      const rawId = app._id || app.id;
      const pRec = storedPayments[bookingId] || (rawId && storedPayments[rawId]) || null;

      const dbHistory = Array.isArray(app.paymentHistory) ? app.paymentHistory : [];
      const localHistory = Array.isArray(pRec?.paymentHistory) ? pRec.paymentHistory : [];
      const paymentHistory = dbHistory.length >= localHistory.length ? dbHistory : localHistory;
      const activeDbHistory = dbHistory.filter((entry) => !entry.isVoided);
      const activeLocalHistory = localHistory.filter((entry) => !entry.isVoided);
      const activeHistory = paymentHistory.filter((entry) => !entry.isVoided);

      const dbStatusLower = String(app.paymentStatus || "").toLowerCase();
      const dbSettled =
        dbStatusLower === "paid" ||
        dbStatusLower === "settled" ||
        (!dbStatusLower && Boolean(app.financials?.isSettled) && Number(app.paymentAmount || 0) > 0);

      let dbPaid = 0;
      if (dbHistory.length > 0) {
        dbPaid = activeDbHistory.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      } else if (dbSettled) {
        dbPaid = total;
      } else if (dbStatusLower === "partial") {
        dbPaid = Number(app.financials?.totalPaid ?? app.paymentAmount ?? 0) || 0;
      }

      let localPaid = 0;
      if (pRec) {
        if (localHistory.length > 0) {
          localPaid = activeLocalHistory.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        } else if (pRec.amountPaid !== undefined) {
          localPaid = Number(pRec.amountPaid) || 0;
        } else if (pRec.status === "Completed" && pRec.totalAmount !== undefined) {
          localPaid = Number(pRec.totalAmount) || total;
        }
      }

      const useLocalAhead =
        localHistory.length > dbHistory.length ||
        (dbHistory.length === 0 && pRec?.amountPaid !== undefined && localPaid > dbPaid);
      const rawPaid = useLocalAhead ? localPaid : dbPaid;
      const amountPaid = total > 0 ? Math.min(total, Math.max(0, rawPaid)) : Math.max(0, rawPaid);
      const balance = Math.max(0, total - amountPaid);

      const isPaid = (dbSettled && dbHistory.length === 0) || (total > 0 && amountPaid >= total);
      const isPartial = !isPaid && amountPaid > 0;
      const isOverdue = !isPaid && !isPartial && app.endDate && new Date(app.endDate) < new Date();
      const finalStatus = isPaid ? "Completed" : isPartial ? "Partial" : isOverdue ? "Overdue" : "Awaiting";

      const latestInstallment = activeHistory.length > 0 ? activeHistory[activeHistory.length - 1] : null;
      const finalMethod =
        latestInstallment?.paymentMethod || pRec?.paymentMethod || app.paymentMethod || "Cash";
      const finalType =
        isPartial ? "Partial Rental Payment" : isPaid ? (pRec?.paymentType || "Full Rental Payment") : "Awaiting Payment";
      const finalDateReceived =
        latestInstallment?.dateTime ||
        pRec?.dateReceived ||
        app.paymentDateTime ||
        (finalStatus === "Completed" ? app.endDate || app.startDate || new Date().toISOString().slice(0, 10) : "");
      const finalReceiptNo =
        latestInstallment?.receiptNo ||
        pRec?.receiptNo ||
        app.receiptNo ||
        `OR-${new Date().getFullYear()}-${String(app._id || idx).slice(-4).toUpperCase()}`;
      const finalReferenceNumber =
        latestInstallment?.referenceNumber ??
        pRec?.referenceNumber ??
        app.paymentReference ??
        app.referenceNumber ??
        "";
      const finalProof = pRec?.proofOfPayment || app.gcashProof || null;
      const finalNotes = pRec?.notes || "";
      const finalRecordedBy =
        latestInstallment?.receivedBy ||
        pRec?.receivedBy ||
        pRec?.recordedBy ||
        app.receivedBy ||
        activeReceiverName;

      return {
        id: bookingId,
        bookingId: bookingId,
        rawId,
        clientName: app.memberName || app.farmerName || app.memberEmail || "Member",
        clientPhone: app.farmerPhone || app.memberPhone || app.clientPhone || "—",
        clientEmail: app.memberEmail || "",
        machineryModel: app.equipment || "Machinery Unit",
        ratePerDay: dailyRate,
        daysCount: days,
        hectares: app.hectares || 1,
        rentalPeriod: app.hectares ? `${app.hectares} ha (${days}d)` : `${days} Day${days > 1 ? "s" : ""}`,
        amount: total,
        totalAmount: total,
        amountPaid,
        balance,
        paymentHistory,
        dueDate: app.endDate || app.startDate || "2028-08-15",
        paymentMethod: finalMethod,
        paymentType: finalType,
        dateReceived: finalDateReceived,
        receiptNo: finalReceiptNo,
        referenceNumber: finalReferenceNumber,
        proofOfPayment: finalProof,
        notes: finalNotes,
        receivedBy: finalRecordedBy,
        recordedBy: finalRecordedBy,
        cashPaymentOption: app.cashPaymentOption || (finalMethod === "Cash" ? "Upon Pickup" : ""),
        gcashProof: finalProof,
        status: finalStatus,
        assignedDriver: app.assignedDriver || "Self-Operated",
        startDate: app.startDate,
        endDate: app.endDate,
        createdAt: app.createdAt,
        isLive: true,
      };
    });

    const liveIdSet = new Set(formattedLive.map((item) => item.id));
    const liveRawIdSet = new Set(formattedLive.map((item) => String(item.rawId || "")).filter(Boolean));

    const formattedMock = invoices
      .filter((inv) => !liveIdSet.has(inv.id) && (!inv.rawId || !liveRawIdSet.has(String(inv.rawId))))
      .map((inv) => {
        const pRec = storedPayments[inv.id] || null;
        const baseTotal = Number(inv.totalAmount ?? inv.amount ?? 0) || 0;
        const localHist = Array.isArray(pRec?.paymentHistory)
          ? pRec.paymentHistory
          : Array.isArray(inv.paymentHistory)
          ? inv.paymentHistory
          : [];
        const localPaidVal =
          localHist.length > 0
            ? localHist.filter((entry) => !entry.isVoided).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
            : undefined;
        const mockPaid =
          pRec?.amountPaid !== undefined
            ? Number(pRec.amountPaid) || 0
            : localPaidVal !== undefined
            ? localPaidVal
            : inv.amountPaid !== undefined
            ? Number(inv.amountPaid) || 0
            : pRec?.status === "Completed" || inv.status === "Completed"
            ? baseTotal
            : 0;
        const amountPaid = baseTotal > 0 ? Math.min(baseTotal, Math.max(0, mockPaid)) : Math.max(0, mockPaid);
        const balance = Math.max(0, baseTotal - amountPaid);
        const finalStatus =
          baseTotal > 0 && amountPaid >= baseTotal
            ? "Completed"
            : amountPaid > 0
            ? "Partial"
            : pRec?.status || inv.status;
        const finalMethod = pRec?.paymentMethod || inv.paymentMethod || "Cash";
        const finalType =
          finalStatus === "Partial" ? "Partial Rental Payment" : pRec?.paymentType || "Full Rental Payment";
        const finalDateReceived = pRec?.dateReceived || (finalStatus === "Completed" ? inv.dueDate : "");
        const finalReceiptNo =
          pRec?.receiptNo ||
          inv.receiptNo ||
          `OR-${new Date().getFullYear()}-${String(inv.id).replace(/\D/g, "")}`;
        const finalReferenceNumber = pRec?.referenceNumber || inv.referenceNumber || "";
        const finalProof = pRec?.proofOfPayment || inv.gcashProof || null;
        const finalNotes = pRec?.notes || "";
        const finalRecordedBy = pRec?.receivedBy || pRec?.recordedBy || inv.receivedBy || activeReceiverName;

        return {
          ...inv,
          amount: baseTotal,
          totalAmount: baseTotal,
          amountPaid,
          balance,
          paymentHistory: localHist,
          status: finalStatus,
          paymentMethod: finalMethod,
          paymentType: finalType,
          dateReceived: finalDateReceived,
          receiptNo: finalReceiptNo,
          referenceNumber: finalReferenceNumber,
          proofOfPayment: finalProof,
          gcashProof: finalProof,
          notes: finalNotes,
          receivedBy: finalRecordedBy,
          recordedBy: finalRecordedBy,
        };
      });

    return [...formattedLive, ...formattedMock];
  }, [liveApplications, invoices, activeReceiverName]);

  // Compute live KPI metrics (collected cash vs remaining balances)
  const kpiStats = useMemo(() => {
    let completedSum = 0;
    let completedCount = 0;
    let awaitingSum = 0;
    let awaitingCount = 0;
    let overdueSum = 0;
    let overdueCount = 0;

    allInvoices.forEach((inv) => {
      const total = Number(inv.amount) || 0;
      const paid = Number(inv.amountPaid ?? (inv.status === "Completed" ? total : 0)) || 0;
      const remaining = Math.max(0, total - paid);

      completedSum += paid;
      if (inv.status === "Completed") {
        completedCount += 1;
      } else if (inv.status === "Overdue") {
        overdueSum += remaining;
        overdueCount += 1;
      } else {
        awaitingSum += remaining;
        awaitingCount += 1;
      }
    });

    return {
      completedSum,
      completedCount,
      awaitingSum,
      awaitingCount,
      overdueSum,
      overdueCount,
    };
  }, [allInvoices]);

  // Settle remaining invoice balance directly from manager financials
  const handleSettleInvoice = async (inv) => {
    const settledAt = toLocalDateTimeInputValue();
    const total = Number(inv.amount) || 0;
    const paidSoFar = Number(inv.amountPaid || 0) || 0;
    const remaining = Math.max(0, total - paidSoFar);
    const updatedHistory =
      remaining > 0
        ? [
            ...(Array.isArray(inv.paymentHistory) ? inv.paymentHistory : []),
            {
              receiptNo: inv.receiptNo || `OR-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
              amount: remaining,
              paymentMethod: inv.paymentMethod || "Cash",
              referenceNumber: inv.referenceNumber || "",
              dateTime: settledAt,
              receivedBy: activeReceiverName,
            },
          ]
        : inv.paymentHistory || [];

    if (!inv.rawId) {
      setInvoices((prev) =>
        prev.map((item) =>
          item.id === inv.id
            ? {
                ...item,
                status: "Completed",
                amountPaid: total,
                balance: 0,
                paymentHistory: updatedHistory,
                dateReceived: settledAt,
                receivedBy: activeReceiverName,
                recordedBy: activeReceiverName,
              }
            : item
        )
      );
      if (viewingPayment && viewingPayment.id === inv.id) {
        setViewingPayment((prev) => ({
          ...prev,
          status: "Completed",
          amountPaid: total,
          balance: 0,
          paymentHistory: updatedHistory,
          dateReceived: settledAt,
          receivedBy: activeReceiverName,
          recordedBy: activeReceiverName,
        }));
      }
      setFeedback(`Payment for booking ${inv.id} marked as Completed.`);
      return;
    }

    if (
      !window.confirm(
        `Mark remaining balance (₱${remaining.toLocaleString()}) for booking ${inv.id} (${inv.clientName}) as Completed (Paid)?`
      )
    ) {
      return;
    }

    setFeedback(`Settling payment for ${inv.id}...`);
    try {
      const res = await api(`/applications/${inv.rawId}`, {
        method: "PATCH",
        body: {
          paymentStatus: "Paid",
          paymentDateTime: settledAt,
          receivedBy: activeReceiverName,
          recordedBy: activeReceiverName,
        },
      });
      if (res.ok) {
        try {
          const stored = JSON.parse(localStorage.getItem("kimpc_booking_payments") || "{}");
          const settledRecord = {
            bookingId: inv.id,
            rawId: inv.rawId,
            clientName: inv.clientName,
            machineryModel: inv.machineryModel,
            totalAmount: total,
            amount: total,
            amountPaid: total,
            balance: 0,
            paymentType: "Full Rental Payment",
            paymentMethod: inv.paymentMethod || "Cash",
            referenceNumber: inv.referenceNumber || "",
            dateReceived: settledAt,
            receiptNo: inv.receiptNo,
            receivedBy: activeReceiverName,
            recordedBy: activeReceiverName,
            status: "Completed",
            paymentHistory: updatedHistory,
          };
          stored[inv.id] = settledRecord;
          stored[inv.rawId] = settledRecord;
          localStorage.setItem("kimpc_booking_payments", JSON.stringify(stored));
        } catch (err) {}
        setFeedback(`Payment settled for ${inv.id}! Member notified and receipt ready.`);
        if (viewingPayment && viewingPayment.id === inv.id) {
          setViewingPayment((prev) => ({
            ...prev,
            status: "Completed",
            amountPaid: total,
            balance: 0,
            paymentHistory: updatedHistory,
            dateReceived: settledAt,
            receivedBy: activeReceiverName,
            recordedBy: activeReceiverName,
          }));
        }
        fetchApplications();
      } else {
        setFeedback(res.data?.error || "Failed to settle payment.");
      }
    } catch (err) {
      setFeedback("Network error settling payment.");
    }
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    let result = allInvoices.filter((inv) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        inv.id.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.machineryModel.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "All" || inv.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      if (sortBy === "date_asc") return (a.dueDate || "").localeCompare(b.dueDate || "");
      if (sortBy === "date_desc") return (b.dueDate || "").localeCompare(a.dueDate || "");
      if (sortBy === "amount_desc") return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === "amount_asc") return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      if (sortBy === "client_asc") return (a.clientName || "").localeCompare(b.clientName || "");
      return 0;
    });

    return result;
  }, [allInvoices, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredInvoices.length / pageSize) || 1;
  const paginatedInvoices = useMemo(() => {
    return filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredInvoices, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortBy]);

  // Checkbox handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredInvoices.map((inv) => inv.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Download individual transaction receipt summary (.txt)
  const handleDownloadSingleTransaction = (inv) => {
    if (!inv) return;
    const totalFee = Number(inv.amount || 0);
    const paidTotal = Number(inv.amountPaid ?? (inv.status === "Completed" ? totalFee : 0)) || 0;
    const remainingBal = Math.max(0, totalFee - paidTotal);
    const historyLines =
      Array.isArray(inv.paymentHistory) && inv.paymentHistory.length > 0
        ? [
            "-----------------------------------------------------------",
            "INSTALLMENT HISTORY:",
            ...inv.paymentHistory.map(
              (h, idx) =>
                `  #${idx + 1} ${h.receiptNo || "OR"} | PHP ${Number(h.amount || 0).toLocaleString()} | ${h.paymentMethod || "Cash"}${h.referenceNumber ? ` (Ref: ${h.referenceNumber})` : ""} | ${formatPaymentDateTimeDisplay(h.dateTime)} | By: ${h.receivedBy || activeReceiverName}${h.isVoided ? " [VOIDED]" : ""}`
            ),
          ]
        : [];
    const lines = [
      "===========================================================",
      "  KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE (KIMPC)  ",
      "             OFFICIAL PAYMENT TRANSACTION RECEIPT          ",
      "===========================================================",
      `OR / Receipt No:  ${inv.receiptNo || inv.id}`,
      `Booking Ref:      ${inv.id}`,
      ...(inv.referenceNumber ? [`GCash Ref No:     ${inv.referenceNumber}`] : []),
      `Date & Time Paid: ${formatPaymentDateTimeDisplay(inv.dateReceived || inv.dueDate)}`,
      `Payment Status:   ${inv.status}`,
      "-----------------------------------------------------------",
      `Client / Member:  ${inv.clientName}`,
      `Contact Phone:    ${inv.clientPhone || "—"}`,
      `Machinery:        ${inv.machineryModel}`,
      `Daily Rate:       PHP ${Number(inv.ratePerDay || 0).toLocaleString()}`,
      `Rental Period:    ${inv.rentalPeriod || "Standard Rental"}`,
      `Driver:           ${inv.assignedDriver || "Self-Operated"}`,
      "-----------------------------------------------------------",
      `Payment Method:   ${inv.paymentMethod || "Cash"} ${inv.cashPaymentOption ? `(${inv.cashPaymentOption})` : ""}`,
      `Payment Type:     ${inv.paymentType || "Full Rental Payment"}`,
      `Total Booking:    PHP ${totalFee.toLocaleString()}`,
      `Amount Paid:      PHP ${paidTotal.toLocaleString()}`,
      `Balance Due:      PHP ${remainingBal.toLocaleString()}`,
      `Received By:      ${inv.receivedBy || inv.recordedBy || activeReceiverName}`,
      `Notes:            ${inv.notes || "None"}`,
      ...historyLines,
      "===========================================================",
      "  This document serves as an electronic transaction copy   ",
      "        Pursuant to CDA & RA 9520 Cooperative Rules        ",
      "===========================================================",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Receipt_${(inv.receiptNo || inv.id).replace(/[^a-zA-Z0-9-_]/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFeedback(`Downloaded transaction receipt for ${inv.id}.`);
  };

  // Modal State for Record Payment & View Details
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [viewingPayment, setViewingPayment] = useState(null);
  const [voidingEntryKey, setVoidingEntryKey] = useState(null);

  // Bookings available for recording payment (strictly exclude already Completed or Paid bookings)
  const availableBookingsForPayment = useMemo(() => {
    return allInvoices.filter((b) => {
      // If editing an existing payment record, keep it visible in the list
      if (editingInvoice && (b.id === editingInvoice.id || b.rawId === editingInvoice.rawId)) return true;
      const st = (b.status || "").toLowerCase();
      return st !== "completed" && st !== "paid";
    });
  }, [allInvoices, editingInvoice]);

  const [formData, setFormData] = useState({
    bookingId: "",
    rawId: "",
    clientName: "",
    machineryModel: "",
    amount: "",
    paymentType: "Full Rental Payment",
    paymentMethod: "Cash",
    referenceNumber: "",
    dateReceived: toLocalDateTimeInputValue(),
    receiptNo: "",
    proofOfPayment: "",
    notes: "",
  });

  const selectedBookingForForm = useMemo(() => {
    return allInvoices.find((inv) => inv.id === formData.bookingId) || null;
  }, [allInvoices, formData.bookingId]);

  const handleBookingSelect = (bId) => {
    const selected = allInvoices.find((inv) => inv.id === bId);
    const currentYear = new Date().getFullYear();
    if (selected) {
      const isPartialSelected = (selected.status || "").toLowerCase() === "partial";
      const remaining =
        selected.balance !== undefined
          ? Number(selected.balance)
          : Math.max(0, Number(selected.amount || 0) - Number(selected.amountPaid || 0));
      setFormData((prev) => ({
        ...prev,
        bookingId: selected.id,
        rawId: selected.rawId || "",
        clientName: selected.clientName || "",
        machineryModel: selected.machineryModel || "",
        amount: remaining > 0 ? remaining : selected.amount || "",
        paymentType: isPartialSelected ? "Partial Rental Payment" : "Full Rental Payment",
        paymentMethod: selected.paymentMethod || "Cash",
        referenceNumber: isPartialSelected ? "" : selected.referenceNumber || "",
        receiptNo: isPartialSelected
          ? `OR-${currentYear}-${Date.now().toString().slice(-4)}`
          : selected.receiptNo || `OR-${currentYear}-${String(selected.id).replace(/\D/g, "") || "0001"}`,
        proofOfPayment: selected.proofOfPayment || selected.gcashProof || "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        bookingId: "",
        rawId: "",
        clientName: "",
        machineryModel: "",
        amount: "",
        referenceNumber: "",
        proofOfPayment: "",
      }));
    }
  };

  const openRecordModalForBooking = (targetBooking = null) => {
    setEditingInvoice(null);
    const nowLocal = toLocalDateTimeInputValue();
    const currentYear = new Date().getFullYear();
    // Pick specific booking if passed, else first unsettled (Awaiting, Overdue, or Partial) booking
    const fallbackBooking =
      allInvoices.find((i) => {
        const st = (i.status || "").toLowerCase();
        return st !== "completed" && st !== "paid";
      }) || null;
    const picked = targetBooking && targetBooking.id ? targetBooking : fallbackBooking;
    const isPartialPicked = (picked?.status || "").toLowerCase() === "partial";
    const payable = picked
      ? picked.balance !== undefined
        ? Number(picked.balance)
        : Math.max(0, Number(picked.amount || 0) - Number(picked.amountPaid || 0))
      : "";

    setFormData({
      bookingId: picked ? picked.id : "",
      rawId: picked?.rawId || "",
      clientName: picked?.clientName || "",
      machineryModel: picked?.machineryModel || "",
      amount: payable > 0 ? payable : picked?.amount || "",
      paymentType: isPartialPicked ? "Partial Rental Payment" : "Full Rental Payment",
      paymentMethod: picked?.paymentMethod || "Cash",
      referenceNumber: isPartialPicked ? "" : picked?.referenceNumber || "",
      dateReceived: nowLocal,
      receiptNo: picked
        ? isPartialPicked
          ? `OR-${currentYear}-${Date.now().toString().slice(-4)}`
          : picked.receiptNo || `OR-${currentYear}-${String(picked.id).replace(/\D/g, "") || "0001"}`
        : `OR-${currentYear}-${Date.now().toString().slice(-4)}`,
      proofOfPayment: picked?.proofOfPayment || picked?.gcashProof || "",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => openRecordModalForBooking(null);

  const openEditModal = (inv) => {
    setEditingInvoice(inv);
    setFormData({
      bookingId: inv.id,
      rawId: inv.rawId || "",
      clientName: inv.clientName || "",
      machineryModel: inv.machineryModel || "",
      amount: inv.amountPaid ?? inv.amount ?? "",
      paymentType: inv.paymentType || "Full Rental Payment",
      paymentMethod: inv.paymentMethod || "Cash",
      referenceNumber: inv.referenceNumber || "",
      dateReceived: toLocalDateTimeInputValue(inv.dateReceived || inv.dueDate),
      receiptNo: inv.receiptNo || inv.id,
      proofOfPayment: inv.proofOfPayment || inv.gcashProof || "",
      notes: inv.notes || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm(`Are you sure you want to delete payment record for booking ${id}?`)) {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  // Void a wrong payment entry from Payment History and recalculate balance due
  const handleVoidPaymentEntry = async (paymentRow, entry, idx, isLegacyFallback = false) => {
    if (!paymentRow || entry?.isVoided) return;
    const entryAmt = Number(entry?.amount || 0);
    const orLabel = entry?.receiptNo || paymentRow.receiptNo || "OR";
    if (
      !window.confirm(
        `Void transaction #${idx + 1} (${orLabel} · ₱${entryAmt.toLocaleString()})?\n\nThis will mark the entry as voided and restore ₱${entryAmt.toLocaleString()} to the remaining balance.`
      )
    ) {
      return;
    }

    const rowKey = `${paymentRow.id}-${idx}`;
    setVoidingEntryKey(rowKey);

    const applyLocalSync = (updatedHistory, nextPaid, updatedApp) => {
      const totalFee = Number(paymentRow.amount || updatedApp?.totalAmount || 0) || 0;
      const nextBalance = totalFee > 0 ? Math.max(0, totalFee - nextPaid) : 0;
      const isOverdue =
        nextPaid <= 0 && paymentRow.endDate && new Date(paymentRow.endDate) < new Date();
      const nextStatus =
        nextPaid > 0 && (totalFee <= 0 || nextBalance <= 0)
          ? "Completed"
          : nextPaid > 0
          ? "Partial"
          : isOverdue
          ? "Overdue"
          : "Awaiting";
      const activeEntries = updatedHistory.filter((h) => !h.isVoided);
      const latestActive =
        activeEntries.length > 0 ? activeEntries[activeEntries.length - 1] : null;
      const nextMethod = latestActive?.paymentMethod || paymentRow.paymentMethod || "Cash";
      const nextRef = latestActive?.referenceNumber || "";
      const nextDate = latestActive?.dateTime || "";
      const nextReceipt = latestActive?.receiptNo || updatedApp?.receiptNo || paymentRow.receiptNo;
      const nextReceiver = latestActive?.receivedBy || "";

      try {
        const stored = JSON.parse(localStorage.getItem("kimpc_booking_payments") || "{}");
        const updatedRecord = {
          bookingId: paymentRow.id,
          rawId: paymentRow.rawId,
          clientName: paymentRow.clientName,
          machineryModel: paymentRow.machineryModel,
          totalAmount: totalFee,
          amount: totalFee,
          amountPaid: nextPaid,
          balance: nextBalance,
          paymentType:
            nextStatus === "Completed"
              ? "Full Rental Payment"
              : nextStatus === "Partial"
              ? "Partial Rental Payment"
              : "Awaiting Payment",
          paymentMethod: nextMethod,
          referenceNumber: nextRef,
          dateReceived: nextDate,
          receiptNo: nextReceipt,
          receivedBy: nextReceiver,
          recordedBy: nextReceiver,
          status: nextStatus,
          paymentHistory: updatedHistory,
        };
        if (paymentRow.id) stored[paymentRow.id] = updatedRecord;
        if (paymentRow.rawId) stored[paymentRow.rawId] = updatedRecord;
        localStorage.setItem("kimpc_booking_payments", JSON.stringify(stored));
      } catch (err) {}

      setViewingPayment((prev) =>
        prev && prev.id === paymentRow.id
          ? {
              ...prev,
              amountPaid: nextPaid,
              balance: nextBalance,
              status: nextStatus,
              paymentHistory: updatedHistory,
              paymentMethod: nextMethod,
              referenceNumber: nextRef,
              dateReceived: nextDate,
              receiptNo: nextReceipt,
              receivedBy: nextReceiver || activeReceiverName,
              recordedBy: nextReceiver || activeReceiverName,
            }
          : prev
      );
    };

    try {
      if (paymentRow.rawId) {
        const res = await api(`/applications/${paymentRow.rawId}/void-payment`, {
          method: "POST",
          body: {
            entryId: entry?._id,
            index: idx,
            legacyFallback: Boolean(isLegacyFallback),
          },
        });
        if (!res.ok) {
          setFeedback(res.data?.error || "Failed to void payment transaction.");
          return;
        }
        const updatedApp = res.data?.application;
        const nextHistory = Array.isArray(updatedApp?.paymentHistory)
          ? updatedApp.paymentHistory
          : [];
        const nextPaid = Number(updatedApp?.paymentAmount ?? updatedApp?.financials?.totalPaid ?? 0) || 0;

        if (updatedApp) {
          setLiveApplications((prev) =>
            prev.map((app) =>
              String(app._id || app.id) === String(paymentRow.rawId) ? updatedApp : app
            )
          );
        }
        applyLocalSync(nextHistory, nextPaid, updatedApp);
        setFeedback(`Voided payment of ₱${entryAmt.toLocaleString()} (${orLabel}) for ${paymentRow.id}.`);
        fetchApplications();
      } else {
        const existingHist = Array.isArray(paymentRow.paymentHistory)
          ? paymentRow.paymentHistory
          : [];
        const baseHist =
          existingHist.length > 0
            ? existingHist
            : [
                {
                  receiptNo: orLabel,
                  amount: entryAmt,
                  paymentMethod: paymentRow.paymentMethod || "Cash",
                  referenceNumber: paymentRow.referenceNumber || "",
                  dateTime: paymentRow.dateReceived || paymentRow.dueDate || new Date().toISOString(),
                  receivedBy: paymentRow.receivedBy || activeReceiverName,
                },
              ];
        const nextHistory = baseHist.map((item, i) =>
          i === idx
            ? {
                ...item,
                isVoided: true,
                voidedAt: new Date().toISOString(),
                voidedBy: activeReceiverName,
              }
            : item
        );
        const nextPaid = nextHistory
          .filter((h) => !h.isVoided)
          .reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
        applyLocalSync(nextHistory, nextPaid, null);
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === paymentRow.id
              ? {
                  ...inv,
                  amountPaid: nextPaid,
                  balance: Math.max(0, (Number(inv.amount) || 0) - nextPaid),
                  paymentHistory: nextHistory,
                }
              : inv
          )
        );
        setFeedback(`Voided payment of ₱${entryAmt.toLocaleString()} (${orLabel}) for ${paymentRow.id}.`);
      }
    } catch (err) {
      setFeedback("Network error while voiding payment transaction.");
    } finally {
      setVoidingEntryKey(null);
    }
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    const receiverName = activeReceiverName;
    const amountNum = Number(formData.amount) || 0;
    if (!formData.bookingId || amountNum <= 0) {
      setFeedback("Please select a booking and enter a payment amount greater than ₱0.");
      return;
    }

    const method = formData.paymentMethod || "Cash";
    const gcashRef = method === "GCash" ? (formData.referenceNumber || "").trim() : "";
    const resolvedDateTime = formData.dateReceived || toLocalDateTimeInputValue();
    const resolvedOrNo =
      (formData.receiptNo || "").trim() ||
      `OR-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const resolvedClientName = selectedBookingForForm?.clientName || formData.clientName;
    const resolvedMachineryModel = selectedBookingForForm?.machineryModel || formData.machineryModel;
    const resolvedRawId = selectedBookingForForm?.rawId || formData.rawId;

    const totalBookingFee =
      Number(selectedBookingForForm?.totalAmount ?? selectedBookingForForm?.amount ?? amountNum) || amountNum;
    const existingPaid = Number(selectedBookingForForm?.amountPaid || 0) || 0;
    const remainingBefore = totalBookingFee > 0 ? Math.max(0, totalBookingFee - existingPaid) : 0;

    if (!editingInvoice && selectedBookingForForm && remainingBefore > 0 && amountNum > remainingBefore) {
      setFeedback(
        `Amount entered (₱${amountNum.toLocaleString()}) exceeds remaining balance of ₱${remainingBefore.toLocaleString()}.`
      );
      return;
    }

    const appliedPayment =
      !editingInvoice && remainingBefore > 0 ? Math.min(amountNum, remainingBefore) : amountNum;
    const newAmountPaid = editingInvoice
      ? Math.min(totalBookingFee || amountNum, amountNum)
      : existingPaid + appliedPayment;
    const newBalance = totalBookingFee > 0 ? Math.max(0, totalBookingFee - newAmountPaid) : 0;
    const newTableStatus =
      newBalance <= 0 && newAmountPaid > 0
        ? "Completed"
        : newAmountPaid > 0
        ? "Partial"
        : "Awaiting";
    const newBackendStatus =
      newTableStatus === "Completed" ? "Paid" : newTableStatus === "Partial" ? "Partial" : "Pending";

    const existingHistory = Array.isArray(selectedBookingForForm?.paymentHistory)
      ? selectedBookingForForm.paymentHistory
      : [];
    const installmentEntry = {
      receiptNo: resolvedOrNo,
      amount: appliedPayment,
      paymentMethod: method,
      referenceNumber: gcashRef,
      dateTime: resolvedDateTime,
      receivedBy: receiverName,
    };
    const updatedHistory = editingInvoice ? existingHistory : [...existingHistory, installmentEntry];

    const paymentRecord = {
      bookingId: formData.bookingId,
      rawId: resolvedRawId,
      clientName: resolvedClientName,
      machineryModel: resolvedMachineryModel,
      totalAmount: totalBookingFee,
      amount: totalBookingFee,
      amountPaid: newAmountPaid,
      balance: newBalance,
      lastPaymentAmount: appliedPayment,
      paymentType: newBalance <= 0 ? "Full Rental Payment" : "Partial Rental Payment",
      paymentMethod: method,
      referenceNumber: gcashRef,
      dateReceived: resolvedDateTime,
      receiptNo: resolvedOrNo,
      proofOfPayment: formData.proofOfPayment || "",
      notes: formData.notes || "",
      receivedBy: receiverName,
      recordedBy: receiverName,
      status: newTableStatus,
      paymentHistory: updatedHistory,
    };

    // Store in shared localStorage for Bookings & immediate reload sync
    try {
      const stored = JSON.parse(localStorage.getItem("kimpc_booking_payments") || "{}");
      if (formData.bookingId) stored[formData.bookingId] = paymentRecord;
      if (resolvedRawId) stored[resolvedRawId] = paymentRecord;
      localStorage.setItem("kimpc_booking_payments", JSON.stringify(stored));
    } catch (err) {
      console.warn("Storage warning:", err);
    }

    // If backend application, update the existing booking record cleanly without duplicating rows
    if (resolvedRawId) {
      setLiveApplications((prev) =>
        prev.map((app) =>
          String(app._id || app.id) === String(resolvedRawId)
            ? {
                ...app,
                paymentStatus: newBackendStatus,
                paymentAmount: newAmountPaid,
                paymentMethod: method,
                receiptNo: resolvedOrNo,
                paymentReference: gcashRef,
                paymentDateTime: resolvedDateTime,
                receivedBy: receiverName,
                paymentHistory: updatedHistory,
                financials: {
                  ...(app.financials || {}),
                  isSettled: newBackendStatus === "Paid",
                  totalPaid: newAmountPaid,
                  paymentMethod: method,
                },
              }
            : app
        )
      );

      try {
        await api(`/applications/${resolvedRawId}`, {
          method: "PATCH",
          body: {
            paymentStatus: newBackendStatus,
            paymentMode: editingInvoice ? "override" : "installment",
            installmentAmount: appliedPayment,
            paymentAmount: newAmountPaid,
            financials: { isSettled: newBackendStatus === "Paid", totalPaid: newAmountPaid },
            receiptNo: paymentRecord.receiptNo,
            paymentDate: paymentRecord.dateReceived,
            paymentDateTime: paymentRecord.dateReceived,
            paymentMethod: paymentRecord.paymentMethod,
            paymentReference: gcashRef,
            referenceNumber: gcashRef,
            paymentNotes: paymentRecord.notes,
            receivedBy: receiverName,
            recordedBy: receiverName,
          },
        });
        fetchApplications();
      } catch (err) {
        console.error("Error updating application:", err);
      }
    } else {
      // Offline / manual-only rows update in-place without duplicating live bookings
      setInvoices((prev) => {
        const exists = prev.some((inv) => inv.id === formData.bookingId);
        if (exists) {
          return prev.map((inv) =>
            inv.id === formData.bookingId
              ? {
                  ...inv,
                  clientName: resolvedClientName,
                  machineryModel: resolvedMachineryModel,
                  amount: totalBookingFee,
                  totalAmount: totalBookingFee,
                  amountPaid: newAmountPaid,
                  balance: newBalance,
                  paymentHistory: updatedHistory,
                  paymentMethod: paymentRecord.paymentMethod,
                  paymentType: paymentRecord.paymentType,
                  referenceNumber: gcashRef,
                  status: newTableStatus,
                  receiptNo: paymentRecord.receiptNo,
                  dateReceived: paymentRecord.dateReceived,
                  dueDate: paymentRecord.dateReceived.slice(0, 10),
                  notes: paymentRecord.notes,
                  proofOfPayment: paymentRecord.proofOfPayment,
                  receivedBy: receiverName,
                  recordedBy: receiverName,
                }
              : inv
          );
        }
        return [
          {
            id: formData.bookingId,
            rawId: resolvedRawId,
            clientName: resolvedClientName,
            machineryModel: resolvedMachineryModel,
            ratePerDay: totalBookingFee,
            daysCount: 1,
            rentalPeriod: selectedBookingForForm?.rentalPeriod || "1 Day",
            amount: totalBookingFee,
            totalAmount: totalBookingFee,
            amountPaid: newAmountPaid,
            balance: newBalance,
            paymentHistory: updatedHistory,
            dueDate: paymentRecord.dateReceived.slice(0, 10),
            dateReceived: paymentRecord.dateReceived,
            paymentMethod: paymentRecord.paymentMethod,
            paymentType: paymentRecord.paymentType,
            referenceNumber: gcashRef,
            status: newTableStatus,
            receiptNo: paymentRecord.receiptNo,
            notes: paymentRecord.notes,
            proofOfPayment: paymentRecord.proofOfPayment,
            receivedBy: receiverName,
            recordedBy: receiverName,
          },
          ...prev,
        ];
      });
    }

    setIsModalOpen(false);
    setFeedback(
      newTableStatus === "Partial"
        ? `Partial payment of ₱${appliedPayment.toLocaleString()} recorded for ${formData.bookingId}. Paid: ₱${newAmountPaid.toLocaleString()} · Balance: ₱${newBalance.toLocaleString()}.`
        : `Payment of ₱${appliedPayment.toLocaleString()} settled for ${formData.bookingId} (Received by ${receiverName}).`
    );
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= LEFT SIDEBAR ================= */}
      <ManagerSidebar />

      {/* ================= MAIN CONTENT ================= */}
      <main className="wz-content-wrapper">
        {/* Top bar header */}
        <ManagerTopbar title="Payments" />

        {/* ================= PAYMENTS BODY ================= */}
        <div className="wz-payments-page-wrapper">
          {/* Top 3 Metric Cards */}
          <section className="wz-payments-kpi-grid">
            {/* Card 1: Completed Payment */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Completed Payment</span>
                  <span className="wz-kpi-value">₱{kpiStats.completedSum.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                <span className="wz-kpi-trend-plain" style={{ color: "#16a34a" }}>
                  ↑ +4.82%
                </span>
                <span className="wz-kpi-subtext">from last week</span>
              </div>
            </div>

            {/* Card 2: Awaiting Payment */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Awaiting Payment</span>
                  <span className="wz-kpi-value">₱{kpiStats.awaitingSum.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                <span className="wz-kpi-trend-plain" style={{ color: "#16a34a" }}>
                  ↑ +2.73%
                </span>
                <span className="wz-kpi-subtext">from last week</span>
              </div>
            </div>

            {/* Card 3: Overdue */}
            <div className="wz-booking-kpi-card">
              <div className="wz-kpi-left">
                <div className="wz-kpi-circle-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="wz-kpi-meta">
                  <span className="wz-kpi-label">Overdue</span>
                  <span className="wz-kpi-value">₱{kpiStats.overdueSum.toLocaleString()}</span>
                </div>
              </div>
              <div className="wz-kpi-right">
                <span className="wz-kpi-trend-plain" style={{ color: "#dc2626" }}>
                  ↓ -5.70%
                </span>
                <span className="wz-kpi-subtext">from last week</span>
              </div>
            </div>
          </section>

          {/* Feedback banner */}
          {feedback && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "10px",
                padding: "10px 16px",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "#166534",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              <span>{feedback}</span>
              <button
                type="button"
                onClick={() => setFeedback("")}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#166534", fontSize: "1rem" }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Filter & Actions Bar */}
          <section className="wz-fin-filter-bar">
            <div className="wz-fin-filter-left">
              <ManagerSearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search booking ID, client name, etc"
                filters={[
                  {
                    id: "status",
                    label: "Status",
                    value: statusFilter,
                    defaultValue: "All",
                    onChange: setStatusFilter,
                    options: [
                      { value: "All", label: "All Statuses" },
                      { value: "Completed", label: "Completed" },
                      { value: "Partial", label: "Partial" },
                      { value: "Awaiting", label: "Awaiting" },
                      { value: "Overdue", label: "Overdue" },
                    ],
                  },
                  {
                    id: "dateRange",
                    label: "Date Range",
                    value: dateRangeFilter,
                    defaultValue: "All Time",
                    onChange: setDateRangeFilter,
                    options: [
                      { value: "1 Aug - 20 Aug 2028", label: "1 Aug - 20 Aug 2028" },
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
                    { value: "amount_desc", label: "Amount (High to Low)" },
                    { value: "amount_asc", label: "Amount (Low to High)" },
                    { value: "client_asc", label: "Client Name (A-Z)" },
                  ],
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={openCreateModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#ff3b5c",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 18px",
                  fontSize: "0.85rem",
                  fontWeight: "700",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(255, 59, 92, 0.25)",
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

          {/* Invoices Table Card */}
          <section className="wz-fin-table-card">
            <div style={{ overflowX: "auto" }}>
              <table className="wz-fin-table">
                <thead>
                  <tr>
                    <th>Status ↕</th>
                    <th>Booking ID ↕</th>
                    <th>Client ↕</th>
                    <th>Machinery ↕</th>
                    <th>Payment ↕</th>
                    <th>Rate ↕</th>
                    <th>Period ↕</th>
                    <th>Amount ↕</th>
                    <th>Due Date ↕</th>
                    <th style={{ textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        No payment records found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedInvoices.map((inv) => {
                      return (
                        <tr key={inv.id}>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {inv.status === "Completed" && (
                              <span className="wz-status-completed">Completed</span>
                            )}
                            {inv.status === "Partial" && (
                              <span className="wz-status-partial">Partial</span>
                            )}
                            {inv.status === "Awaiting" && (
                              <span className="wz-status-awaiting">Awaiting</span>
                            )}
                            {inv.status === "Overdue" && (
                              <span className="wz-status-overdue">Overdue</span>
                            )}
                          </td>
                          <td style={{ fontWeight: "700", color: "#0f172a", whiteSpace: "nowrap" }}>
                            {inv.id}
                          </td>
                          <td>
                            <div style={{ fontWeight: "600", color: "#0f172a", lineHeight: 1.25 }}>{inv.clientName}</div>
                            {inv.clientPhone && inv.clientPhone !== "—" && (
                              <div style={{ fontSize: "0.70rem", color: "#64748b" }}>📞 {inv.clientPhone}</div>
                            )}
                          </td>
                          <td style={{ color: "#334155", fontWeight: 500, fontSize: "0.76rem" }}>{inv.machineryModel}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <strong style={{ color: "#0f172a", fontWeight: "600" }}>{inv.paymentMethod || "Cash"}</strong>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>₱{Number(inv.ratePerDay).toLocaleString()}</td>
                          <td style={{ whiteSpace: "nowrap", fontSize: "0.74rem" }}>{inv.rentalPeriod}</td>
                          <td style={{ fontWeight: "800", color: "#0f172a", whiteSpace: "nowrap" }}>
                            ₱{Number(inv.amount).toLocaleString()}
                            {inv.status === "Partial" && (
                              <span className="wz-fin-amt-sub">
                                Paid ₱{Number(inv.amountPaid || 0).toLocaleString()} · Bal ₱{Number(inv.balance || 0).toLocaleString()}
                              </span>
                            )}
                          </td>
                          <td style={{ color: "#64748b", whiteSpace: "nowrap", fontSize: "0.74rem" }}>{inv.dueDate}</td>
                          <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={() => setViewingPayment(inv)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: "4px 6px",
                                color: "#059669",
                                fontSize: "0.78rem",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
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
                              <span>View Details</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
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
                  Showing {filteredInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filteredInvoices.length)} of {filteredInvoices.length} payments
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
          </section>
        </div>
      </main>

      {/* ================= MODAL: RECORD / EDIT MEMBER PAYMENT ================= */}
      {isModalOpen && (
        <div
          className="wz-payrec-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <section
            className="wz-payrec-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-title"
          >
            <div className="wz-payrec-header">
              <h3 id="record-payment-title" className="wz-payrec-title">
                {editingInvoice ? `Edit Payment (${editingInvoice.id})` : "Record Member Payment"}
              </h3>
              <button
                type="button"
                className="wz-payrec-close"
                aria-label="Close payment modal"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form className="wz-payrec-form" onSubmit={handleSaveModal}>
              <div className="wz-payrec-body">
                <div className="wz-payrec-field">
                  <label className="wz-payrec-label" htmlFor="rec-booking">
                    <span>
                      Select Booking <span className="wz-payrec-req">*</span>
                    </span>
                  </label>
                  <select
                    id="rec-booking"
                    className="wz-payrec-control"
                    required
                    value={formData.bookingId}
                    onChange={(e) => handleBookingSelect(e.target.value)}
                  >
                    <option value="">
                      {availableBookingsForPayment.length === 0
                        ? "No unpaid bookings available"
                        : "Choose a booking..."}
                    </option>
                    {availableBookingsForPayment.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.clientName} ({b.machineryModel}) ·{" "}
                        {b.status === "Partial"
                          ? `Bal ₱${Number(b.balance || 0).toLocaleString()} of ₱${Number(b.amount || 0).toLocaleString()}`
                          : `₱${Number(b.amount || 0).toLocaleString()}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="wz-payrec-row">
                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-or-number">
                      <span>
                        Official Receipt (OR) Number: <span className="wz-payrec-req">*</span>
                      </span>
                    </label>
                    <input
                      id="rec-or-number"
                      className="wz-payrec-control mono"
                      type="text"
                      required
                      placeholder="OR-2026-0001"
                      value={formData.receiptNo}
                      onChange={(e) => setFormData((prev) => ({ ...prev, receiptNo: e.target.value }))}
                    />
                  </div>

                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-datetime">
                      <span>
                        Date and Time <span className="wz-payrec-req">*</span>
                      </span>
                    </label>
                    <input
                      id="rec-datetime"
                      className="wz-payrec-control"
                      type="datetime-local"
                      required
                      value={formData.dateReceived}
                      onChange={(e) => setFormData((prev) => ({ ...prev, dateReceived: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="wz-payrec-row">
                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-amount">
                      <span>
                        Amount Paid <span className="wz-payrec-req">*</span>
                      </span>
                    </label>
                    <div className="wz-payrec-input-wrap">
                      <span className="wz-payrec-prefix">₱</span>
                      <input
                        id="rec-amount"
                        className="wz-payrec-amount-input"
                        type="number"
                        min="1"
                        max={
                          !editingInvoice && selectedBookingForForm?.balance > 0
                            ? selectedBookingForForm.balance
                            : undefined
                        }
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                      />
                    </div>
                    {selectedBookingForForm && !editingInvoice && (
                      <div className="wz-payrec-hint">
                        <span>
                          Remaining balance:{" "}
                          <strong>
                            ₱{Number(selectedBookingForForm.balance ?? selectedBookingForForm.amount ?? 0).toLocaleString()}
                          </strong>
                        </span>
                        {Number(selectedBookingForForm.balance ?? selectedBookingForForm.amount ?? 0) > 0 && (
                          <button
                            type="button"
                            className="wz-payrec-max-btn"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                amount: Number(selectedBookingForForm.balance ?? selectedBookingForForm.amount ?? 0),
                              }))
                            }
                          >
                            Full balance
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="wz-payrec-field">
                    <label className="wz-payrec-label" htmlFor="rec-method">
                      <span>
                        Payment Method <span className="wz-payrec-req">*</span>
                      </span>
                    </label>
                    <select
                      id="rec-method"
                      className="wz-payrec-control"
                      value={formData.paymentMethod}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value,
                          referenceNumber: e.target.value === "GCash" ? prev.referenceNumber : "",
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

                {formData.paymentMethod === "GCash" && (
                  <div className="wz-payrec-gcash-box">
                    <div className="wz-payrec-field">
                      <label className="wz-payrec-label" htmlFor="rec-gcash-ref">
                        <span>
                          GCash Reference Number <span className="wz-payrec-req">*</span>
                        </span>
                      </label>
                      <input
                        id="rec-gcash-ref"
                        className="wz-payrec-control mono"
                        type="text"
                        required
                        placeholder="Enter GCash reference number"
                        value={formData.referenceNumber}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, referenceNumber: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="wz-payrec-summary">
                  <div className="wz-payrec-summary-head">
                    <span className="wz-payrec-summary-title">Booking Summary</span>
                    {selectedBookingForForm && (
                      <span className="wz-payrec-summary-status">
                        {selectedBookingForForm.status}
                      </span>
                    )}
                  </div>

                  {selectedBookingForForm ? (
                    (() => {
                      const totalFee = Number(selectedBookingForForm.amount || 0);
                      const alreadyPaid = Number(selectedBookingForForm.amountPaid || 0);
                      const enteredAmt = Math.max(0, Number(formData.amount) || 0);
                      const balanceAfter = editingInvoice
                        ? Math.max(0, totalFee - enteredAmt)
                        : Math.max(0, totalFee - alreadyPaid - enteredAmt);
                      return (
                        <div className="wz-payrec-summary-grid">
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Member</span>
                            <span className="wz-payrec-v">{selectedBookingForForm.clientName}</span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Machinery</span>
                            <span className="wz-payrec-v">{selectedBookingForForm.machineryModel}</span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Booking Total</span>
                            <span className="wz-payrec-v">
                              ₱{totalFee.toLocaleString()} ({selectedBookingForForm.rentalPeriod})
                            </span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Paid So Far</span>
                            <span className="wz-payrec-v wz-payrec-v-paid">
                              ₱{alreadyPaid.toLocaleString()}
                            </span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Schedule</span>
                            <span className="wz-payrec-v">
                              {formatBookingDateRange(
                                selectedBookingForForm.startDate,
                                selectedBookingForForm.endDate
                              )}
                            </span>
                          </div>
                          <div className="wz-payrec-kv">
                            <span className="wz-payrec-k">Balance After Payment</span>
                            <span className={`wz-payrec-v ${balanceAfter > 0 ? "wz-payrec-v-bal" : "wz-payrec-v-paid"}`}>
                              ₱{balanceAfter.toLocaleString()}
                              {balanceAfter > 0 && enteredAmt > 0
                                ? " (Partial)"
                                : balanceAfter === 0 && totalFee > 0
                                ? " (Settled)"
                                : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="wz-payrec-summary-empty">
                      Select a booking above to view its summary.
                    </div>
                  )}
                </div>

                <div className="wz-payrec-receiver" aria-label="Received by account">
                  <div className="wz-payrec-receiver-left">
                    <span className="wz-payrec-receiver-label">Received by:</span>
                    <span className="wz-payrec-receiver-name">{activeReceiverName}</span>
                  </div>
                  <span className="wz-payrec-readonly-tag">Account · Read-only</span>
                </div>
              </div>

              <div className="wz-payrec-footer">
                <button
                  type="button"
                  className="wz-payrec-btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="wz-payrec-btn-save">
                  {editingInvoice ? "Save Changes" : "Record Payment"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ================= MODAL: PAYMENT VIEW DETAILS ================= */}
      {viewingPayment &&
        (() => {
          const totalFee = Number(viewingPayment.amount || 0);
          const paidAmount = Number(
            viewingPayment.amountPaid ?? (viewingPayment.status === "Completed" ? totalFee : 0)
          );
          const balanceDue = Math.max(0, totalFee - paidAmount);
          const history = Array.isArray(viewingPayment.paymentHistory)
            ? viewingPayment.paymentHistory
            : [];
          const activeHistoryCount = history.filter((entry) => !entry.isVoided).length;
          const voidedHistoryCount = history.length - activeHistoryCount;
          const proofSrc = viewingPayment.proofOfPayment || viewingPayment.gcashProof;
          const scheduleDisplay = formatBookingDateRange(
            viewingPayment.startDate,
            viewingPayment.endDate
          );

          return (
            <div
              className="wz-payview-overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setViewingPayment(null);
              }}
            >
              <section
                className="wz-payview-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="payment-view-title"
              >
                <div className="wz-payview-header">
                  <div>
                    <div className="wz-payview-kicker">Payment Details</div>
                    <div className="wz-payview-title-row">
                      <h3 id="payment-view-title" className="wz-payview-title">
                        {viewingPayment.id}
                      </h3>
                      {viewingPayment.status === "Completed" && (
                        <span className="wz-status-completed">Completed</span>
                      )}
                      {viewingPayment.status === "Partial" && (
                        <span className="wz-status-partial">Partial</span>
                      )}
                      {viewingPayment.status === "Awaiting" && (
                        <span className="wz-status-awaiting">Awaiting</span>
                      )}
                      {viewingPayment.status === "Overdue" && (
                        <span className="wz-status-overdue">Overdue</span>
                      )}
                    </div>
                    <p className="wz-payview-sub">
                      {viewingPayment.clientName}
                      {viewingPayment.clientPhone && viewingPayment.clientPhone !== "—"
                        ? ` · ${viewingPayment.clientPhone}`
                        : ""}{" "}
                      · {viewingPayment.machineryModel}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="wz-payview-close"
                    aria-label="Close payment details"
                    onClick={() => setViewingPayment(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="wz-payview-body">
                  {/* Financial Summary */}
                  <div className="wz-payview-metrics">
                    <div className="wz-payview-metric">
                      <span className="wz-payview-metric-label">Total Booking</span>
                      <span className="wz-payview-metric-val">
                        ₱{totalFee.toLocaleString()}
                      </span>
                    </div>
                    <div className="wz-payview-metric">
                      <span className="wz-payview-metric-label">Amount Paid</span>
                      <span
                        className={`wz-payview-metric-val ${
                          paidAmount > 0 ? "is-paid" : ""
                        }`}
                      >
                        ₱{paidAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="wz-payview-metric">
                      <span className="wz-payview-metric-label">Balance Due</span>
                      <span
                        className={`wz-payview-metric-val ${
                          balanceDue > 0 ? "is-balance" : ""
                        }`}
                      >
                        ₱{balanceDue.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Transaction Info */}
                  <div className="wz-payview-card">
                    <div className="wz-payview-section-title">
                      <span>Transaction Information</span>
                    </div>
                    <div className="wz-payview-grid">
                      <div className="wz-payview-kv">
                        <span className="wz-payview-k">Official Receipt (OR) No.</span>
                        <span className="wz-payview-v mono">
                          {viewingPayment.receiptNo || viewingPayment.id}
                        </span>
                      </div>
                      <div className="wz-payview-kv">
                        <span className="wz-payview-k">Date &amp; Time</span>
                        <span className="wz-payview-v">
                          {formatPaymentDateTimeDisplay(
                            viewingPayment.dateReceived || viewingPayment.dueDate
                          )}
                        </span>
                      </div>
                      <div className="wz-payview-kv">
                        <span className="wz-payview-k">Payment Method</span>
                        <span className="wz-payview-v">
                          {viewingPayment.paymentMethod || "Cash"}
                          {viewingPayment.paymentMethod === "Cash" &&
                          viewingPayment.cashPaymentOption
                            ? ` (${viewingPayment.cashPaymentOption})`
                            : ""}
                        </span>
                      </div>
                      {viewingPayment.referenceNumber ? (
                        <div className="wz-payview-kv">
                          <span className="wz-payview-k">GCash Reference No.</span>
                          <span className="wz-payview-v mono">
                            {viewingPayment.referenceNumber}
                          </span>
                        </div>
                      ) : (
                        <div className="wz-payview-kv">
                          <span className="wz-payview-k">Scope</span>
                          <span className="wz-payview-v">
                            {viewingPayment.rentalPeriod || "Standard Rental"}
                          </span>
                        </div>
                      )}
                      <div className="wz-payview-kv">
                        <span className="wz-payview-k">Received By</span>
                        <span className="wz-payview-v accent">
                          {viewingPayment.receivedBy ||
                            viewingPayment.recordedBy ||
                            activeReceiverName}
                        </span>
                      </div>
                      <div className="wz-payview-kv">
                        <span className="wz-payview-k">Rental Schedule</span>
                        <span className="wz-payview-v">
                          {scheduleDisplay !== "—"
                            ? scheduleDisplay
                            : viewingPayment.dueDate || "—"}
                        </span>
                      </div>
                      {viewingPayment.notes && (
                        <div className="wz-payview-kv" style={{ gridColumn: "1 / -1" }}>
                          <span className="wz-payview-k">Notes</span>
                          <span className="wz-payview-v">{viewingPayment.notes}</span>
                        </div>
                      )}
                    </div>

                    {proofSrc && (
                      <div className="wz-payview-proof">
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <img
                            src={proofSrc}
                            alt="Proof of Payment"
                            className="wz-payview-proof-thumb"
                          />
                          <div className="wz-payview-kv">
                            <span className="wz-payview-k">Payment Proof</span>
                            <span className="wz-payview-v">Screenshot attached</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="wz-payview-btn-ghost"
                          onClick={() => setPreviewGcashImage(proofSrc)}
                        >
                          View Image
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Payment Installment History */}
                  <div className="wz-payview-card">
                    <div className="wz-payview-section-title">
                      <span>Payment History</span>
                      <span>
                        {history.length > 0
                          ? `${activeHistoryCount} ${activeHistoryCount === 1 ? "payment" : "payments"}${
                              voidedHistoryCount > 0 ? ` · ${voidedHistoryCount} voided` : ""
                            }`
                          : paidAmount > 0
                          ? "1 payment"
                          : "0 payments"}
                      </span>
                    </div>

                    {history.length > 0 ? (
                      <div className="wz-payview-history-list">
                        {history.map((entry, idx) => {
                          const entryKey = `${viewingPayment.id}-${idx}`;
                          const isVoided = Boolean(entry.isVoided);
                          return (
                            <div
                              key={`${entry.receiptNo || "pay"}-${idx}`}
                              className={`wz-payview-history-item${isVoided ? " is-voided" : ""}`}
                            >
                              <div className="wz-payview-history-left">
                                <div className="wz-payview-history-top" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  <span>
                                    #{idx + 1} · {entry.receiptNo || "OR"} ·{" "}
                                    {entry.paymentMethod || "Cash"}
                                    {entry.referenceNumber
                                      ? ` · Ref ${entry.referenceNumber}`
                                      : ""}
                                  </span>
                                  {isVoided && (
                                    <span className="wz-payview-void-badge">Voided</span>
                                  )}
                                </div>
                                <div className="wz-payview-history-sub">
                                  {formatPaymentDateTimeDisplay(entry.dateTime)} · Received by{" "}
                                  {entry.receivedBy || activeReceiverName}
                                  {isVoided && entry.voidedBy
                                    ? ` · Voided by ${entry.voidedBy}`
                                    : ""}
                                </div>
                              </div>
                              <div className="wz-payview-history-right">
                                <span className="wz-payview-history-amt">
                                  +₱{Number(entry.amount || 0).toLocaleString()}
                                </span>
                                {!isVoided && (
                                  <button
                                    type="button"
                                    className="wz-payview-void-btn"
                                    title="Void transaction"
                                    aria-label="Void transaction"
                                    disabled={Boolean(voidingEntryKey)}
                                    onClick={() =>
                                      handleVoidPaymentEntry(viewingPayment, entry, idx, false)
                                    }
                                  >
                                    <svg
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <circle cx="12" cy="12" r="9" />
                                      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : paidAmount > 0 ? (
                      <div className="wz-payview-history-list">
                        <div className="wz-payview-history-item">
                          <div className="wz-payview-history-left">
                            <div className="wz-payview-history-top">
                              {viewingPayment.receiptNo || viewingPayment.id} ·{" "}
                              {viewingPayment.paymentMethod || "Cash"}
                            </div>
                            <div className="wz-payview-history-sub">
                              {formatPaymentDateTimeDisplay(
                                viewingPayment.dateReceived || viewingPayment.dueDate
                              )}{" "}
                              · Received by{" "}
                              {viewingPayment.receivedBy ||
                                viewingPayment.recordedBy ||
                                activeReceiverName}
                            </div>
                          </div>
                          <div className="wz-payview-history-right">
                            <span className="wz-payview-history-amt">
                              ₱{paidAmount.toLocaleString()}
                            </span>
                            <button
                              type="button"
                              className="wz-payview-void-btn"
                              title="Void transaction"
                              aria-label="Void transaction"
                              disabled={Boolean(voidingEntryKey)}
                              onClick={() =>
                                handleVoidPaymentEntry(
                                  viewingPayment,
                                  {
                                    receiptNo: viewingPayment.receiptNo || viewingPayment.id,
                                    amount: paidAmount,
                                    paymentMethod: viewingPayment.paymentMethod || "Cash",
                                    referenceNumber: viewingPayment.referenceNumber || "",
                                    dateTime:
                                      viewingPayment.dateReceived || viewingPayment.dueDate,
                                    receivedBy:
                                      viewingPayment.receivedBy ||
                                      viewingPayment.recordedBy ||
                                      activeReceiverName,
                                  },
                                  0,
                                  true
                                )
                              }
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <circle cx="12" cy="12" r="9" />
                                <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="wz-payview-empty">
                        No payment has been recorded for this booking yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="wz-payview-footer">
                  <div className="wz-payview-footer-group">
                    <button
                      type="button"
                      className="wz-payview-btn-ghost"
                      onClick={() => handleDownloadSingleTransaction(viewingPayment)}
                    >
                      Download (.txt)
                    </button>
                    <button
                      type="button"
                      className="wz-payview-btn-ghost"
                      onClick={() => setReceiptInvoice(viewingPayment)}
                    >
                      Receipt Voucher
                    </button>
                  </div>

                  <div className="wz-payview-footer-group">
                    {balanceDue > 0 && viewingPayment.status !== "Completed" && (
                      <button
                        type="button"
                        className="wz-payview-btn-primary"
                        onClick={() => {
                          const target = viewingPayment;
                          setViewingPayment(null);
                          openRecordModalForBooking(target);
                        }}
                      >
                        Record Payment
                      </button>
                    )}
                    <button
                      type="button"
                      className="wz-payview-btn-ghost"
                      onClick={() => setViewingPayment(null)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </section>
            </div>
          );
        })()}

      {/* ================= MODAL: OFFICIAL KIMPC RECEIPT & BILLING VOUCHER ================= */}
      {receiptInvoice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() => setReceiptInvoice(null)}
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
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setReceiptInvoice(null)}
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
                  KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE (KIMPC)
                </h3>
              </div>
              <p style={{ margin: "2px 0", fontSize: "0.78rem", color: "#475569" }}>
                CDA Registration No. 9520-10012480 • Kalilangan, Bukidnon, Philippines
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", fontWeight: "700", color: "#059669", textTransform: "uppercase", letterSpacing: "1px" }}>
                Official Machinery Rental Billing Voucher &amp; Receipt
              </p>
            </div>

            {/* Receipt Meta Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", background: "#f8fafc", padding: "14px 16px", borderRadius: "10px", marginBottom: "18px", border: "1px solid #e2e8f0" }}>
              <div>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Billed To Member</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.95rem" }}>
                  {receiptInvoice.clientName}
                </div>
                {receiptInvoice.clientPhone && (
                  <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "2px" }}>
                    📞 {receiptInvoice.clientPhone}
                  </div>
                )}
                {receiptInvoice.clientEmail && (
                  <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    ✉️ {receiptInvoice.clientEmail}
                  </div>
                )}
              </div>

              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Receipt Voucher No.</span>
                <div style={{ fontFamily: "monospace", fontWeight: 900, color: "#0f172a", fontSize: "1.1rem" }}>
                  {receiptInvoice.receiptNo || receiptInvoice.id}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "2px" }}>
                  Booking ID: <strong>{receiptInvoice.id}</strong>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "1px" }}>
                  Due Date: <strong>{receiptInvoice.dueDate}</strong>
                </div>
                <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                  Status: <strong>{receiptInvoice.status}</strong>
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
                    <strong style={{ color: "#0f172a", display: "block" }}>{receiptInvoice.machineryModel}</strong>
                    <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
                      Daily Rate: ₱{Number(receiptInvoice.ratePerDay).toLocaleString()} / unit
                    </span>
                  </td>
                  <td style={{ padding: "12px", color: "#334155" }}>
                    {receiptInvoice.rentalPeriod}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                    ₱{Number(receiptInvoice.amount).toLocaleString()}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px", color: "#475569" }}>
                    Assigned Field Operator Service
                    <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                      {receiptInvoice.assignedDriver || "Self-Operated"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#64748b" }}>Included</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669" }}>₱0.00</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px", color: "#475569" }}>CDA RA 9520 Member Tax Exemption</td>
                  <td style={{ padding: "10px 12px", color: "#64748b" }}>Tax Exempt</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669" }}>₱0.00</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="2" style={{ padding: "14px 12px", fontWeight: 800, fontSize: "0.98rem", color: "#0f172a" }}>
                    Total Rental Amount:
                  </td>
                  <td style={{ padding: "14px 12px", textAlign: "right", fontWeight: 900, fontSize: "1.15rem", color: "#059669" }}>
                    ₱{Number(receiptInvoice.amount).toLocaleString()}
                  </td>
                </tr>
                {receiptInvoice.status === "Partial" && (
                  <tr>
                    <td colSpan="2" style={{ padding: "4px 12px 12px", fontSize: "0.82rem", color: "#475569", fontWeight: 600 }}>
                      Amount Paid / Remaining Balance:
                    </td>
                    <td style={{ padding: "4px 12px 12px", textAlign: "right", fontSize: "0.84rem", fontWeight: 700, color: "#b45309" }}>
                      Paid ₱{Number(receiptInvoice.amountPaid || 0).toLocaleString()} · Balance ₱{Number(receiptInvoice.balance || 0).toLocaleString()}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>

            {/* Payment Mode Strip */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", padding: "12px 16px", background: receiptInvoice.status === "Completed" ? "#f0fdf4" : "#fffbeb", border: `1px solid ${receiptInvoice.status === "Completed" ? "#bbf7d0" : "#fef3c7"}`, borderRadius: "10px", marginBottom: "18px" }}>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Payment Method:</span>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.9rem", marginTop: "2px" }}>
                  {receiptInvoice.paymentMethod === "GCash" ? "GCash (0926 463 8983 - KIMPC)" : `Cash (${receiptInvoice.cashPaymentOption === "Upon Return" ? "Upon Return" : "Upon Pickup"})`}
                </div>
              </div>

              <div>
                {receiptInvoice.status === "Completed" ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#059669", color: "#ffffff", padding: "6px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.5px" }}>
                    <span>✓</span> PAID &amp; SETTLED
                  </div>
                ) : receiptInvoice.status === "Partial" ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#b45309", color: "#ffffff", padding: "6px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.5px" }}>
                    PARTIAL PAYMENT
                  </div>
                ) : (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#d97706", color: "#ffffff", padding: "6px 14px", borderRadius: "8px", fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.5px" }}>
                    <span>⏳</span> AWAITING SETTLEMENT
                  </div>
                )}
              </div>
            </div>

            {/* Signoff */}
            <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "14px", fontSize: "0.75rem", color: "#64748b" }}>
              <div>
                <p style={{ margin: "0 0 2px", fontWeight: 600, color: "#334155" }}>✓ Digitally Verified by Cooperative Accounting</p>
                <p style={{ margin: 0 }}>Official electronic copy pursuant to CDA &amp; RA 9520 regulations.</p>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "cursive", fontSize: "1.1rem", color: "#0f172a", fontWeight: 700 }}>KIMPC Administration</div>
                <div style={{ borderTop: "1px solid #94a3b8", width: "160px", marginTop: "4px", paddingTop: "2px" }}>Authorized Signatory</div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ marginTop: "22px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setReceiptInvoice(null)}
                style={{
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingleTransaction(receiptInvoice)}
                style={{
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Download Receipt File"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Receipt (.txt)
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#0f172a",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print / Save Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: GCASH SCREENSHOT PREVIEW ================= */}
      {previewGcashImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
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
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
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
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
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

