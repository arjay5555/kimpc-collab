import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
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

const INITIAL_INVOICES = [
  {
    id: "BK-WZ1001",
    clientName: "Alice Johnson",
    clientPhone: "+63 917 123 4567",
    machineryModel: "John Deere 5075E Utility Tractor",
    ratePerDay: 2800,
    rentalPeriod: "2 Days",
    daysCount: 2,
    amount: 5600,
    dueDate: "2028-08-05",
    paymentMethod: "Cash",
    cashPaymentOption: "Upon Pickup",
    status: "Completed",
  },
  {
    id: "BK-WZ1002",
    clientName: "Bob Smith",
    clientPhone: "+63 928 234 5678",
    machineryModel: "Kubota DC-70 Plus Combine Harvester",
    ratePerDay: 5500,
    rentalPeriod: "7 Days",
    daysCount: 7,
    amount: 38500,
    dueDate: "2028-08-08",
    paymentMethod: "GCash",
    status: "Awaiting",
  },
  {
    id: "BK-WZ1003",
    clientName: "Charlie Davis",
    clientPhone: "+63 939 345 6789",
    machineryModel: "New Holland Roll-Belt 450 Round Baler",
    ratePerDay: 3200,
    rentalPeriod: "31 Days",
    daysCount: 31,
    amount: 99200,
    dueDate: "2028-09-02",
    paymentMethod: "Bank Transfer",
    status: "Completed",
  },
  {
    id: "BK-WZ1004",
    clientName: "Diana White",
    clientPhone: "+63 915 456 7890",
    machineryModel: "Case IH Farmall 90JX 4WD Tractor",
    ratePerDay: 3600,
    rentalPeriod: "1 Day",
    daysCount: 1,
    amount: 3600,
    dueDate: "2028-08-03",
    paymentMethod: "Cash",
    cashPaymentOption: "Upon Pickup",
    status: "Completed",
  },
  {
    id: "BK-WZ1005",
    clientName: "Edward Green",
    clientPhone: "+63 920 567 8901",
    machineryModel: "Kuhn GA 4121 GM Rotary Rake",
    ratePerDay: 1900,
    rentalPeriod: "8 Days",
    daysCount: 8,
    amount: 15200,
    dueDate: "2028-08-10",
    paymentMethod: "GCash",
    status: "Awaiting",
  },
  {
    id: "BK-WZ1006",
    clientName: "Fiona Brown",
    clientPhone: "+63 916 678 9012",
    machineryModel: "Ag Leader Precision Boom Sprayer",
    ratePerDay: 2100,
    rentalPeriod: "32 Days",
    daysCount: 32,
    amount: 67200,
    dueDate: "2028-09-03",
    paymentMethod: "Bank Transfer",
    status: "Completed",
  },
  {
    id: "BK-WZ1007",
    clientName: "George Clark",
    clientPhone: "+63 927 789 0123",
    machineryModel: "Isuzu Forward Flatbed Hauler",
    ratePerDay: 4200,
    rentalPeriod: "2 Days",
    daysCount: 2,
    amount: 8400,
    dueDate: "2028-08-05",
    paymentMethod: "Cash",
    cashPaymentOption: "Upon Return",
    status: "Completed",
  },
  {
    id: "BK-WZ1008",
    clientName: "Helen Martinez",
    clientPhone: "+63 918 890 1234",
    machineryModel: "John Deere 5075E Utility Tractor",
    ratePerDay: 2800,
    rentalPeriod: "7 Days",
    daysCount: 7,
    amount: 19600,
    dueDate: "2028-08-11",
    paymentMethod: "GCash",
    status: "Overdue",
  },
];

export default function Payments() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Navigation sub-menu toggle
  const [financialsOpen, setFinancialsOpen] = useState(true);

  // Live applications & Invoices state
  const [liveApplications, setLiveApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [receiptInvoice, setReceiptInvoice] = useState(null);
  const [previewGcashImage, setPreviewGcashImage] = useState(null);

  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [selectedIds, setSelectedIds] = useState(["INV-WZ1004"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRangeFilter, setDateRangeFilter] = useState("1 Aug - 20 Aug 2028");
  const [sortBy, setSortBy] = useState("date_desc");
  const [pageSize, setPageSize] = useState(8);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch live applications to connect member bookings to manager financials
  const fetchApplications = async () => {
    try {
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

  // Merge live applications into invoices
  const allInvoices = useMemo(() => {
    let storedPayments = {};
    try {
      storedPayments = JSON.parse(localStorage.getItem("kimpc_booking_payments") || "{}");
    } catch (e) {}

    const formattedLive = liveApplications.map((app, idx) => {
      const dailyRate = app.financials?.dailyRate || app.ratePerHectare || 2800;
      const days = getDaysCount(app.startDate, app.endDate);
      const total = app.totalAmount || app.financials?.totalPaid || dailyRate * days;
      const isPaid = app.paymentStatus === "Paid" || app.financials?.isSettled;
      const isOverdue = !isPaid && app.endDate && new Date(app.endDate) < new Date();

      const bookingId = app.displayId || (app._id ? `BK-${String(app._id).slice(-6).toUpperCase()}` : `BK-WZ${1010 + idx}`);
      const rawId = app._id || app.id;
      const pRec = storedPayments[bookingId] || (rawId && storedPayments[rawId]) || null;

      const finalStatus = pRec?.status || (isPaid ? "Completed" : (isOverdue ? "Overdue" : "Awaiting"));
      const finalAmount = pRec?.amount !== undefined ? Number(pRec.amount) : total;
      const finalMethod = pRec?.paymentMethod || app.paymentMethod || "Cash";
      const finalType = pRec?.paymentType || "Full Rental Payment";
      const finalDateReceived = pRec?.dateReceived || (finalStatus === "Completed" ? (app.endDate || app.startDate || new Date().toISOString().slice(0, 10)) : "");
      const finalReceiptNo = pRec?.receiptNo || app.receiptNo || `REC-2026-${String(app._id || idx).slice(-4).toUpperCase()}`;
      const finalProof = pRec?.proofOfPayment || app.gcashProof || null;
      const finalNotes = pRec?.notes || "";
      const finalRecordedBy = pRec?.recordedBy || user?.fullName || user?.email || "Manager";

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
        amount: finalAmount,
        dueDate: app.endDate || app.startDate || "2028-08-15",
        paymentMethod: finalMethod,
        paymentType: finalType,
        dateReceived: finalDateReceived,
        receiptNo: finalReceiptNo,
        proofOfPayment: finalProof,
        notes: finalNotes,
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

    const formattedMock = invoices.map((inv) => {
      const pRec = storedPayments[inv.id] || null;
      const finalStatus = pRec?.status || inv.status;
      const finalAmount = pRec?.amount !== undefined ? Number(pRec.amount) : inv.amount;
      const finalMethod = pRec?.paymentMethod || inv.paymentMethod || "Cash";
      const finalType = pRec?.paymentType || "Full Rental Payment";
      const finalDateReceived = pRec?.dateReceived || (finalStatus === "Completed" ? inv.dueDate : "");
      const finalReceiptNo = pRec?.receiptNo || inv.receiptNo || `REC-2026-${String(inv.id).replace(/\D/g, "")}`;
      const finalProof = pRec?.proofOfPayment || inv.gcashProof || null;
      const finalNotes = pRec?.notes || "";
      const finalRecordedBy = pRec?.recordedBy || user?.fullName || user?.email || "Manager";

      return {
        ...inv,
        amount: finalAmount,
        status: finalStatus,
        paymentMethod: finalMethod,
        paymentType: finalType,
        dateReceived: finalDateReceived,
        receiptNo: finalReceiptNo,
        proofOfPayment: finalProof,
        gcashProof: finalProof,
        notes: finalNotes,
        recordedBy: finalRecordedBy,
      };
    });

    return [...formattedLive, ...formattedMock];
  }, [liveApplications, invoices, user]);

  // Compute live KPI metrics
  const kpiStats = useMemo(() => {
    let completedSum = 0;
    let completedCount = 0;
    let awaitingSum = 0;
    let awaitingCount = 0;
    let overdueSum = 0;
    let overdueCount = 0;

    allInvoices.forEach((inv) => {
      const amt = Number(inv.amount) || 0;
      if (inv.status === "Completed") {
        completedSum += amt;
        completedCount += 1;
      } else if (inv.status === "Overdue") {
        overdueSum += amt;
        overdueCount += 1;
      } else {
        awaitingSum += amt;
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

  // Settle invoice directly from manager financials
  const handleSettleInvoice = async (inv) => {
    if (!inv.rawId) {
      setInvoices((prev) =>
        prev.map((item) => (item.id === inv.id ? { ...item, status: "Completed" } : item))
      );
      if (viewingPayment && viewingPayment.id === inv.id) {
        setViewingPayment((prev) => ({ ...prev, status: "Completed" }));
      }
      setFeedback(`Payment for booking ${inv.id} marked as Completed.`);
      return;
    }

    if (
      !window.confirm(
        `Mark payment for booking ${inv.id} (${inv.clientName}) as Completed (Paid)? This will verify payment, issue official receipt, and notify the member.`
      )
    ) {
      return;
    }

    setFeedback(`Settling payment for ${inv.id}...`);
    try {
      const res = await api(`/applications/${inv.rawId}`, {
        method: "PATCH",
        body: { paymentStatus: "Paid" },
      });
      if (res.ok) {
        setFeedback(`Payment settled for ${inv.id}! Member notified and receipt ready.`);
        if (viewingPayment && viewingPayment.id === inv.id) {
          setViewingPayment((prev) => ({ ...prev, status: "Completed" }));
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

  // Modal State for Record Payment & View Details
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [viewingPayment, setViewingPayment] = useState(null);
  const [formData, setFormData] = useState({
    bookingId: "",
    rawId: "",
    clientName: "",
    machineryModel: "",
    amount: "",
    paymentType: "Full Rental Payment",
    paymentMethod: "Cash",
    dateReceived: new Date().toISOString().slice(0, 10),
    receiptNo: "",
    proofOfPayment: "",
    notes: "",
    recordedBy: "",
  });

  const handleBookingSelect = (bId) => {
    const selected = allInvoices.find((inv) => inv.id === bId);
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        bookingId: selected.id,
        rawId: selected.rawId || "",
        clientName: selected.clientName || "",
        machineryModel: selected.machineryModel || "",
        amount: selected.amount || "",
        paymentMethod: selected.paymentMethod || "Cash",
        receiptNo: selected.receiptNo || `REC-2026-${String(selected.id).replace(/\D/g, "") || "0001"}`,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        bookingId: bId,
      }));
    }
  };

  const handleProofUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, proofOfPayment: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const openCreateModal = () => {
    setEditingInvoice(null);
    const today = new Date().toISOString().slice(0, 10);
    const pendingBooking = allInvoices.find((i) => i.status !== "Completed") || allInvoices[0];
    setFormData({
      bookingId: pendingBooking ? pendingBooking.id : "",
      rawId: pendingBooking?.rawId || "",
      clientName: pendingBooking?.clientName || "",
      machineryModel: pendingBooking?.machineryModel || "",
      amount: pendingBooking?.amount || "",
      paymentType: "Full Rental Payment",
      paymentMethod: pendingBooking?.paymentMethod || "Cash",
      dateReceived: today,
      receiptNo: pendingBooking ? (pendingBooking.receiptNo || `REC-2026-${String(pendingBooking.id).replace(/\D/g, "") || "0001"}`) : `REC-2026-${Date.now().toString().slice(-4)}`,
      proofOfPayment: "",
      notes: "",
      recordedBy: user?.fullName || user?.email || "Manager",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (inv) => {
    setEditingInvoice(inv);
    setFormData({
      bookingId: inv.id,
      rawId: inv.rawId || "",
      clientName: inv.clientName || "",
      machineryModel: inv.machineryModel || "",
      amount: inv.amount || "",
      paymentType: inv.paymentType || "Full Rental Payment",
      paymentMethod: inv.paymentMethod || "Cash",
      dateReceived: inv.dueDate || new Date().toISOString().slice(0, 10),
      receiptNo: inv.receiptNo || inv.id,
      proofOfPayment: inv.proofOfPayment || inv.gcashProof || "",
      notes: inv.notes || "",
      recordedBy: inv.recordedBy || user?.fullName || user?.email || "Manager",
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm(`Are you sure you want to delete payment record for booking ${id}?`)) {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    const managerName = user?.fullName || user?.email || "Manager";
    const amountNum = Number(formData.amount) || 0;
    const paymentRecord = {
      bookingId: formData.bookingId,
      rawId: formData.rawId,
      clientName: formData.clientName,
      machineryModel: formData.machineryModel,
      amount: amountNum,
      paymentType: formData.paymentType || "Full Rental Payment",
      paymentMethod: formData.paymentMethod || "Cash",
      dateReceived: formData.dateReceived || new Date().toISOString().slice(0, 10),
      receiptNo: formData.receiptNo || `REC-2026-${Date.now().toString().slice(-4)}`,
      proofOfPayment: formData.proofOfPayment || "",
      notes: formData.notes || "",
      recordedBy: managerName,
      status: "Completed",
    };

    // Store in shared localStorage for Bookings
    try {
      const stored = JSON.parse(localStorage.getItem("kimpc_booking_payments") || "{}");
      if (formData.bookingId) stored[formData.bookingId] = paymentRecord;
      if (formData.rawId) stored[formData.rawId] = paymentRecord;
      localStorage.setItem("kimpc_booking_payments", JSON.stringify(stored));
    } catch (err) {
      console.warn("Storage warning:", err);
    }

    // If backend application, PATCH backend
    if (formData.rawId) {
      try {
        await api(`/applications/${formData.rawId}`, {
          method: "PATCH",
          body: {
            paymentStatus: "Paid",
            financials: { isSettled: true, totalPaid: amountNum },
            receiptNo: paymentRecord.receiptNo,
            paymentDate: paymentRecord.dateReceived,
            paymentMethod: paymentRecord.paymentMethod,
            paymentNotes: paymentRecord.notes,
            recordedBy: managerName,
          },
        });
        fetchApplications();
      } catch (err) {
        console.error("Error updating application:", err);
      }
    }

    // Update in invoices state
    setInvoices((prev) => {
      const exists = prev.some((inv) => inv.id === formData.bookingId);
      if (exists) {
        return prev.map((inv) =>
          inv.id === formData.bookingId
            ? {
                ...inv,
                clientName: formData.clientName,
                machineryModel: formData.machineryModel,
                amount: amountNum,
                paymentMethod: paymentRecord.paymentMethod,
                status: "Completed",
                receiptNo: paymentRecord.receiptNo,
                dueDate: paymentRecord.dateReceived,
                notes: paymentRecord.notes,
                proofOfPayment: paymentRecord.proofOfPayment,
                recordedBy: managerName,
              }
            : inv
        );
      } else {
        return [
          {
            id: formData.bookingId,
            rawId: formData.rawId,
            clientName: formData.clientName,
            machineryModel: formData.machineryModel,
            ratePerDay: amountNum,
            daysCount: 1,
            rentalPeriod: "1 Day",
            amount: amountNum,
            dueDate: paymentRecord.dateReceived,
            paymentMethod: paymentRecord.paymentMethod,
            status: "Completed",
            receiptNo: paymentRecord.receiptNo,
            notes: paymentRecord.notes,
            proofOfPayment: paymentRecord.proofOfPayment,
            recordedBy: managerName,
          },
          ...prev,
        ];
      }
    });

    setIsModalOpen(false);
    setFeedback(`Payment of ₱${amountNum.toLocaleString()} for booking ${formData.bookingId} recorded as Completed by ${managerName}!`);
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
            <div className="wz-payments-kpi-card">
              <div className="wz-payments-kpi-top">
                <div className="wz-payments-kpi-info">
                  <span className="wz-payments-kpi-label">Completed Payment</span>
                  <span className="wz-payments-kpi-val">₱{kpiStats.completedSum.toLocaleString()}</span>
                </div>
                <div className="wz-payments-kpi-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
              </div>
              <div className="wz-payments-kpi-bottom">
                <span className="wz-payments-kpi-subtext">{kpiStats.completedCount} payments settled</span>
                <span className="wz-trend-positive">
                  ✓ Verified &amp; Paid
                </span>
              </div>
            </div>

            {/* Card 2: Awaiting Payment */}
            <div className="wz-payments-kpi-card">
              <div className="wz-payments-kpi-top">
                <div className="wz-payments-kpi-info">
                  <span className="wz-payments-kpi-label">Awaiting Payment</span>
                  <span className="wz-payments-kpi-val">₱{kpiStats.awaitingSum.toLocaleString()}</span>
                </div>
                <div className="wz-payments-kpi-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
              <div className="wz-payments-kpi-bottom">
                <span className="wz-payments-kpi-subtext">{kpiStats.awaitingCount} payments pending</span>
                <span className="wz-trend-neutral" style={{ color: "#d97706" }}>
                  ⏳ Pending verification
                </span>
              </div>
            </div>

            {/* Card 3: Overdue */}
            <div className="wz-payments-kpi-card">
              <div className="wz-payments-kpi-top">
                <div className="wz-payments-kpi-info">
                  <span className="wz-payments-kpi-label">Overdue</span>
                  <span className="wz-payments-kpi-val">₱{kpiStats.overdueSum.toLocaleString()}</span>
                </div>
                <div className="wz-payments-kpi-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
              </div>
              <div className="wz-payments-kpi-bottom">
                <span className="wz-payments-kpi-subtext">{kpiStats.overdueCount} payments past due</span>
                <span className="wz-trend-negative">
                  ⚠️ Action required
                </span>
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
          </section>

          {/* Invoices Table Card */}
          <section className="wz-fin-table-card">
            <div style={{ overflowX: "auto" }}>
              <table className="wz-fin-table">
                <thead>
                  <tr>
                    <th style={{ width: "32px", textAlign: "center", padding: "10px 4px" }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredInvoices.length > 0 &&
                          selectedIds.length === filteredInvoices.length
                        }
                        onChange={handleSelectAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th>Booking ID ↕</th>
                    <th>Client ↕</th>
                    <th>Machinery ↕</th>
                    <th>Payment ↕</th>
                    <th>Rate ↕</th>
                    <th>Period ↕</th>
                    <th>Amount ↕</th>
                    <th>Due Date ↕</th>
                    <th>Status ↕</th>
                    <th style={{ textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="11" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        No payment records found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedInvoices.map((inv) => {
                      const isChecked = selectedIds.includes(inv.id);
                      return (
                        <tr
                          key={inv.id}
                          style={{
                            backgroundColor: isChecked ? "#f0f9ff" : undefined,
                          }}
                        >
                          <td style={{ textAlign: "center", padding: "10px 4px" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleSelectOne(inv.id)}
                              style={{ cursor: "pointer" }}
                            />
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
                          </td>
                          <td style={{ color: "#64748b", whiteSpace: "nowrap", fontSize: "0.74rem" }}>{inv.dueDate}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {inv.status === "Completed" && (
                              <span className="wz-status-completed">Completed</span>
                            )}
                            {inv.status === "Awaiting" && (
                              <span className="wz-status-awaiting">Awaiting</span>
                            )}
                            {inv.status === "Overdue" && (
                              <span className="wz-status-overdue">Overdue</span>
                            )}
                          </td>
                          <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={() => setViewingPayment(inv)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                background: "#f8fafc",
                                color: "#0f172a",
                                border: "1px solid #cbd5e1",
                                borderRadius: "8px",
                                padding: "6px 12px",
                                fontSize: "0.75rem",
                                fontWeight: "700",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#e2e8f0";
                                e.currentTarget.style.borderColor = "#94a3b8";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#f8fafc";
                                e.currentTarget.style.borderColor = "#cbd5e1";
                              }}
                              title="View payment record audit and details"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              View Details
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
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
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

      {/* ================= MODAL: CREATE / EDIT INVOICE ================= */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: "800", color: "#0f172a" }}>
                  {editingInvoice ? `Edit Payment Record (${editingInvoice.id})` : "Record Member Payment"}
                </h3>
                <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                  Record official payment, reference details, and issue verified receipt for a booking.
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  color: "#94a3b8",
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Select Booking */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                  Select Booking *
                </label>
                <select
                  required
                  value={formData.bookingId}
                  onChange={(e) => handleBookingSelect(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                    outline: "none",
                    background: "#ffffff",
                    fontWeight: "600",
                    color: "#0f172a",
                  }}
                >
                  <option value="">-- Choose a booking to record payment --</option>
                  {allInvoices.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} — {b.clientName} ({b.machineryModel}) • ₱{Number(b.amount).toLocaleString()} [{b.status}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Client & Machinery Info (Prefilled) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Client / Member Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alice Johnson"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Machinery / Equipment *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Deere 5075E"
                    value={formData.machineryModel}
                    onChange={(e) => setFormData({ ...formData, machineryModel: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Payment Amount & Payment Method */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Payment Amount (₱ PHP) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 5600"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                      fontWeight: "800",
                      color: "#0f172a",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Payment Method *
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                      outline: "none",
                      background: "#ffffff",
                      fontWeight: "600",
                    }}
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
              </div>

              {/* Date Received & Receipt or Reference Number */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Date Received *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dateReceived}
                    onChange={(e) => setFormData({ ...formData, dateReceived: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Receipt or Reference Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. REC-2026-0001 or GCash Ref #"
                    value={formData.receiptNo}
                    onChange={(e) => setFormData({ ...formData, receiptNo: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                      outline: "none",
                      fontFamily: "monospace",
                      fontWeight: "700",
                    }}
                  />
                </div>
              </div>

              {/* Proof of Payment (Optional) */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                  Proof of Payment (Optional Upload)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProofUpload}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px dashed #cbd5e1",
                    fontSize: "0.82rem",
                    outline: "none",
                    background: "#f8fafc",
                    cursor: "pointer",
                  }}
                />
                {formData.proofOfPayment && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                    <img
                      src={formData.proofOfPayment}
                      alt="Proof preview"
                      style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, proofOfPayment: "" }))}
                      style={{
                        background: "#fee2e2",
                        color: "#991b1b",
                        border: "1px solid #fca5a5",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Remove Uploaded Image
                    </button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                  Notes &amp; Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Paid in cash at office, verified by cashier on duty..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Recorded By (Filled automatically what account of manager used) */}
              <div
                style={{
                  background: "#f8fafc",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.70rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                    Recorded By (Manager Account)
                  </span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#166534" }}>
                    👤 {user?.fullName || user?.email || "Manager"}
                  </span>
                </div>
                <span style={{ fontSize: "0.70rem", background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "6px", fontWeight: 700 }}>
                  Auto-Filled
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: "transparent",
                    color: "#64748b",
                    fontWeight: "600",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#059669",
                    color: "#ffffff",
                    fontWeight: "700",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)",
                  }}
                >
                  {editingInvoice ? "Save Changes" : "✓ Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: PAYMENT VIEW DETAILS & AUDIT ================= */}
      {viewingPayment && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() => setViewingPayment(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "640px",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              border: "1px solid #e2e8f0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 24px",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
                borderRadius: "16px 16px 0 0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ecfdf5",
                    color: "#059669",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.3rem",
                    fontWeight: 800,
                    border: "1px solid #a7f3d0",
                  }}
                >
                  💳
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "800", color: "#0f172a" }}>
                      Payment Audit &amp; Details
                    </h3>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontFamily: "monospace",
                        background: "#e2e8f0",
                        color: "#334155",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: 700,
                      }}
                    >
                      {viewingPayment.id}
                    </span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    Official transaction breakdown and payment verification record
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingPayment(null)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: "50%",
                  width: "32px",
                  height: "32px",
                  fontSize: "1rem",
                  color: "#64748b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Close details"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
              {/* Status Strip & Member Quick Glance */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                    Billed Member
                  </span>
                  <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "1rem" }}>
                    {viewingPayment.clientName}
                  </div>
                  {viewingPayment.clientPhone && viewingPayment.clientPhone !== "—" && (
                    <div style={{ fontSize: "0.76rem", color: "#475569" }}>📞 {viewingPayment.clientPhone}</div>
                  )}
                </div>

                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                    Settlement Status
                  </span>
                  <div style={{ marginTop: "4px" }}>
                    {viewingPayment.status === "Completed" && (
                      <span className="wz-status-completed" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>
                        ✓ Paid &amp; Completed
                      </span>
                    )}
                    {viewingPayment.status === "Awaiting" && (
                      <span className="wz-status-awaiting" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>
                        ⏳ Awaiting Payment
                      </span>
                    )}
                    {viewingPayment.status === "Overdue" && (
                      <span className="wz-status-overdue" style={{ fontSize: "0.78rem", padding: "4px 10px" }}>
                        ⚠️ Overdue Settlement
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Machinery & Rental Context */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  padding: "12px 16px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Rented Machinery Unit:</span>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.85rem", marginTop: "2px" }}>
                    🚜 {viewingPayment.machineryModel}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Rental Period / Schedule:</span>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.85rem", marginTop: "2px" }}>
                    📅 {viewingPayment.rentalPeriod || "Standard Rental"}
                  </div>
                </div>
              </div>

              {/* The 7 Core Requested Audit Fields */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1.5px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "18px",
                  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #f1f5f9", paddingBottom: "10px", marginBottom: "14px" }}>
                  <span style={{ fontSize: "1.1rem" }}>📋</span>
                  <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: "800", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Payment Information &amp; Audit Trail
                  </h4>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
                  {/* 1. Payment Amount */}
                  <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "10px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#047857", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      1. Payment Amount
                    </span>
                    <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#065f46", marginTop: "4px" }}>
                      ₱{Number(viewingPayment.amount || 0).toLocaleString()}
                    </div>
                  </div>

                  {/* 2. Payment Type */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      2. Payment Type
                    </span>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                      {viewingPayment.paymentType || "Full Rental Payment"}
                    </div>
                  </div>

                  {/* 3. Payment Method */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      3. Payment Method
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                      <span
                        style={{
                          background: viewingPayment.paymentMethod === "GCash" ? "#ecfdf5" : (viewingPayment.paymentMethod === "Bank Transfer" ? "#eff6ff" : "#f1f5f9"),
                          color: viewingPayment.paymentMethod === "GCash" ? "#047857" : (viewingPayment.paymentMethod === "Bank Transfer" ? "#1d4ed8" : "#334155"),
                          border: `1px solid ${viewingPayment.paymentMethod === "GCash" ? "#a7f3d0" : (viewingPayment.paymentMethod === "Bank Transfer" ? "#bfdbfe" : "#cbd5e1")}`,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontWeight: 800,
                          fontSize: "0.80rem",
                        }}
                      >
                        {viewingPayment.paymentMethod || "Cash"}
                      </span>
                      {viewingPayment.cashPaymentOption && viewingPayment.paymentMethod === "Cash" && (
                        <span style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 600 }}>• {viewingPayment.cashPaymentOption}</span>
                      )}
                    </div>
                  </div>

                  {/* 4. Date Received */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      4. Date Received
                    </span>
                    <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0f172a", marginTop: "6px" }}>
                      📅 {viewingPayment.dateReceived || viewingPayment.dueDate || "—"}
                    </div>
                  </div>

                  {/* 5. Receipt or Reference Number */}
                  <div style={{ gridColumn: "span 2", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      5. Receipt or Reference Number
                    </span>
                    <div style={{ fontSize: "0.95rem", fontWeight: 900, fontFamily: "monospace", color: "#0f172a", marginTop: "4px" }}>
                      {viewingPayment.receiptNo || viewingPayment.referenceNumber || viewingPayment.id}
                    </div>
                  </div>

                  {/* 6. Proof of Payment or Notes with View button */}
                  <div style={{ gridColumn: "span 2", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "8px" }}>
                      6. Proof of Payment or Notes
                    </span>
                    
                    <div style={{ display: "grid", gridTemplateColumns: (viewingPayment.proofOfPayment || viewingPayment.gcashProof) ? "1fr 1fr" : "1fr", gap: "12px" }}>
                      {/* Notes box */}
                      <div>
                        <span style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                          📝 Remarks / Payment Notes:
                        </span>
                        <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 10px", fontSize: "0.80rem", color: "#334155", minHeight: "42px" }}>
                          {viewingPayment.notes || "Standard payment record for KIMPC machinery rental."}
                        </div>
                      </div>

                      {/* Proof of Payment with View button */}
                      {(viewingPayment.proofOfPayment || viewingPayment.gcashProof) ? (
                        <div>
                          <span style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                            📷 Attached Proof Screenshot:
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 10px" }}>
                            <img
                              src={viewingPayment.proofOfPayment || viewingPayment.gcashProof}
                              alt="Proof of Payment"
                              onClick={() => setPreviewGcashImage(viewingPayment.proofOfPayment || viewingPayment.gcashProof)}
                              style={{
                                width: "44px",
                                height: "44px",
                                objectFit: "cover",
                                borderRadius: "6px",
                                border: "2px solid #059669",
                                cursor: "pointer",
                              }}
                              title="Click to view full image"
                            />
                            <div>
                              <div style={{ fontSize: "0.72rem", color: "#065f46", fontWeight: 700, marginBottom: "3px" }}>
                                ✓ Proof Uploaded
                              </div>
                              <button
                                type="button"
                                onClick={() => setPreviewGcashImage(viewingPayment.proofOfPayment || viewingPayment.gcashProof)}
                                style={{
                                  background: "#0284c7",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "5px",
                                  padding: "3px 8px",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                🔍 View Proof
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#f1f5f9", border: "1px dashed #cbd5e1", borderRadius: "6px", padding: "8px 10px", fontSize: "0.75rem", color: "#64748b" }}>
                          <span>ℹ️</span> No digital screenshot attached (Cash / In-person payment recorded).
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 7. Recorded By (Filled automatically what account of manager used) */}
                  <div style={{ gridColumn: "span 2", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        7. Recorded By
                      </span>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "12px", border: "1px solid #86efac" }}>
                        ✓ Auto-filled with active manager account
                      </span>
                    </div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#14532d", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>👤</span>
                      <span>{viewingPayment.recordedBy || user?.fullName || user?.name || user?.email || "Manager"}</span>
                      {user?.role && (
                        <span style={{ fontSize: "0.70rem", background: "#bbf7d0", color: "#166534", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                          {user.role}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer with Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                padding: "16px 24px",
                borderTop: "1px solid #e2e8f0",
                background: "#f8fafc",
                borderRadius: "0 0 16px 16px",
              }}
            >
              <div>
                {viewingPayment.status !== "Completed" ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleSettleInvoice(viewingPayment);
                      setViewingPayment(null);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "#059669",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 16px",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(5, 150, 105, 0.25)",
                    }}
                  >
                    ✓ Confirm &amp; Settle Payment
                  </button>
                ) : (
                  <span style={{ fontSize: "0.76rem", color: "#059669", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    ✓ Verified &amp; Settled in Cooperative Ledger
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setReceiptInvoice(viewingPayment);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                  }}
                >
                  🖨️ Receipt Voucher
                </button>
                <button
                  type="button"
                  onClick={() => setViewingPayment(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#64748b",
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

