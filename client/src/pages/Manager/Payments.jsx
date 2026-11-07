import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
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
    const formattedLive = liveApplications.map((app, idx) => {
      const dailyRate = app.financials?.dailyRate || app.ratePerHectare || 2800;
      const days = getDaysCount(app.startDate, app.endDate);
      const total = app.totalAmount || app.financials?.totalPaid || dailyRate * days;
      const isPaid = app.paymentStatus === "Paid" || app.financials?.isSettled;
      const isOverdue = !isPaid && app.endDate && new Date(app.endDate) < new Date();

      const bookingId = app.displayId || (app._id ? `BK-${String(app._id).slice(-6).toUpperCase()}` : `BK-WZ${1010 + idx}`);

      return {
        id: bookingId,
        bookingId: bookingId,
        rawId: app._id || app.id,
        clientName: app.memberName || app.farmerName || app.memberEmail || "Member",
        clientPhone: app.farmerPhone || app.memberPhone || app.clientPhone || "—",
        clientEmail: app.memberEmail || "",
        machineryModel: app.equipment || "Machinery Unit",
        ratePerDay: dailyRate,
        daysCount: days,
        hectares: app.hectares || 1,
        rentalPeriod: app.hectares ? `${app.hectares} ha (${days}d)` : `${days} Day${days > 1 ? "s" : ""}`,
        amount: total,
        dueDate: app.endDate || app.startDate || "2028-08-15",
        paymentMethod: app.paymentMethod || "Cash",
        cashPaymentOption: app.cashPaymentOption || (app.paymentMethod === "Cash" ? "Upon Pickup" : ""),
        gcashProof: app.gcashProof || null,
        receiptNo: app.receiptNo || `REC-2026-${String(app._id || idx).slice(-4).toUpperCase()}`,
        status: isPaid ? "Completed" : (isOverdue ? "Overdue" : "Awaiting"),
        assignedDriver: app.assignedDriver || "Self-Operated",
        startDate: app.startDate,
        endDate: app.endDate,
        createdAt: app.createdAt,
        isLive: true,
      };
    });

    return [...formattedLive, ...invoices];
  }, [liveApplications, invoices]);

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
        fetchApplications();
      } else {
        setFeedback(res.data?.error || "Failed to settle payment.");
      }
    } catch (err) {
      setFeedback("Network error settling payment.");
    }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [formData, setFormData] = useState({
    id: "",
    clientName: "",
    machineryModel: "",
    ratePerDay: 2800,
    daysCount: 3,
    dueDate: "2028-08-15",
    status: "Awaiting",
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
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

  // Modal actions
  const openCreateModal = () => {
    setEditingInvoice(null);
    setFormData({
      id: `BK-WZ${1000 + invoices.length + 1}`,
      clientName: "",
      machineryModel: "Kubota M7060 Tractor",
      ratePerDay: 60,
      daysCount: 3,
      dueDate: new Date().toISOString().slice(0, 10),
      status: "Awaiting",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (inv) => {
    setEditingInvoice(inv);
    setFormData({
      id: inv.id,
      clientName: inv.clientName,
      machineryModel: inv.machineryModel,
      ratePerDay: inv.ratePerDay,
      daysCount: inv.daysCount || 3,
      dueDate: inv.dueDate,
      status: inv.status,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm(`Are you sure you want to delete payment record for booking ${id}?`)) {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleSaveModal = (e) => {
    e.preventDefault();
    const rate = Number(formData.ratePerDay) || 50;
    const days = Number(formData.daysCount) || 1;
    const calculatedAmount = rate * days;

    if (editingInvoice) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === editingInvoice.id
            ? {
                ...inv,
                clientName: formData.clientName,
                machineryModel: formData.machineryModel,
                ratePerDay: rate,
                daysCount: days,
                rentalPeriod: `${days} Day${days > 1 ? "s" : ""}`,
                amount: calculatedAmount,
                dueDate: formData.dueDate,
                status: formData.status,
              }
            : inv
        )
      );
    } else {
      const newInv = {
        id: formData.id || `INV-WZ${Date.now().toString().slice(-4)}`,
        clientName: formData.clientName,
        machineryModel: formData.machineryModel,
        ratePerDay: rate,
        daysCount: days,
        rentalPeriod: `${days} Day${days > 1 ? "s" : ""}`,
        amount: calculatedAmount,
        dueDate: formData.dueDate,
        status: formData.status,
      };
      setInvoices((prev) => [newInv, ...prev]);
    }
    setIsModalOpen(false);
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
              Create Invoice
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
                            {inv.isLive && (
                              <span style={{ marginLeft: "4px", fontSize: "0.65rem", background: "#ecfdf5", color: "#059669", padding: "1px 4px", borderRadius: "3px", fontWeight: 700 }}>
                                LIVE
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: "600", color: "#0f172a", lineHeight: 1.25 }}>{inv.clientName}</div>
                            {inv.clientPhone && inv.clientPhone !== "—" && (
                              <div style={{ fontSize: "0.70rem", color: "#64748b" }}>📞 {inv.clientPhone}</div>
                            )}
                          </td>
                          <td style={{ color: "#334155", fontWeight: 500, fontSize: "0.76rem" }}>{inv.machineryModel}</td>
                          <td>
                            <div style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "3px", flexWrap: "wrap" }}>
                              <strong style={{ color: "#0f172a" }}>{inv.paymentMethod || "Cash"}</strong>
                              {inv.paymentMethod === "Cash" && inv.cashPaymentOption && (
                                <span style={{ color: "#0284c7", fontSize: "0.70rem" }}>• {inv.cashPaymentOption}</span>
                              )}
                              {inv.paymentMethod === "GCash" && (
                                inv.gcashProof ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewGcashImage(inv.gcashProof)}
                                    style={{
                                      background: "#ecfdf5",
                                      border: "1px solid #a7f3d0",
                                      borderRadius: "4px",
                                      padding: "1px 4px",
                                      color: "#047857",
                                      fontSize: "0.68rem",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    📷 Proof
                                  </button>
                                ) : (
                                  <span style={{ color: "#f59e0b", fontSize: "0.68rem" }}>• Pending</span>
                                )
                              )}
                            </div>
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
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              {inv.status !== "Completed" && (
                                <button
                                  className="wz-fin-action-btn"
                                  style={{ background: "#059669", color: "#ffffff", borderColor: "#059669", fontWeight: 700 }}
                                  onClick={() => handleSettleInvoice(inv)}
                                  title="Mark invoice as Paid & settled"
                                >
                                  ✓ Settle
                                </button>
                              )}
                              <button
                                className="wz-fin-action-btn"
                                onClick={() => setReceiptInvoice(inv)}
                                title="View & print official receipt voucher"
                              >
                                Receipt
                              </button>
                              <button
                                className="wz-fin-action-btn delete"
                                onClick={() => handleDelete(inv.id)}
                                title="Delete invoice"
                              >
                                Delete
                              </button>
                            </div>
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
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "800", color: "#0f172a" }}>
                {editingInvoice ? `Edit Payment Record (${editingInvoice.id})` : "Create New Payment Record"}
              </h3>
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
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                  Client Name *
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
                  Machinery / Equipment Model *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kubota M7060 Tractor"
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Rate per Day (₱) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.ratePerDay}
                    onChange={(e) => setFormData({ ...formData, ratePerDay: e.target.value })}
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
                    Rental Period (Days) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.daysCount}
                    onChange={(e) => setFormData({ ...formData, daysCount: e.target.value })}
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
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
                    Status *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                      outline: "none",
                    }}
                  >
                    <option value="Completed">Completed</option>
                    <option value="Awaiting">Awaiting</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>
              </div>

              {/* Calculated Summary Preview */}
              <div
                style={{
                  background: "#f8fafc",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "#64748b", fontWeight: "600" }}>Total Amount:</span>
                <span style={{ fontSize: "1.1rem", fontWeight: "800", color: "#0f172a" }}>
                  ₱{(Number(formData.ratePerDay) || 0) * (Number(formData.daysCount) || 1)}
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
                    background: "#ff3b5c",
                    color: "#ffffff",
                    fontWeight: "700",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  {editingInvoice ? "Save Changes" : "Create Payment Record"}
                </button>
              </div>
            </form>
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

