import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

const INITIAL_INVOICES = [
  {
    id: "INV-WZ1001",
    clientName: "Alice Johnson",
    machineryModel: "Toyota Corolla (or Kubota M7060)",
    ratePerDay: 50,
    rentalPeriod: "3 Days",
    daysCount: 3,
    amount: 150,
    dueDate: "2024-08-05",
    status: "Completed",
  },
  {
    id: "INV-WZ1002",
    clientName: "Bob Smith",
    machineryModel: "Honda Civic (or John Deere 5075E)",
    ratePerDay: 45,
    rentalPeriod: "5 Days",
    daysCount: 5,
    amount: 225,
    dueDate: "2024-08-06",
    status: "Awaiting",
  },
  {
    id: "INV-WZ1003",
    clientName: "Charlie Davis",
    machineryModel: "Ford Focus (or Yanmar Combine)",
    ratePerDay: 55,
    rentalPeriod: "2 Days",
    daysCount: 2,
    amount: 110,
    dueDate: "2024-08-07",
    status: "Overdue",
  },
  {
    id: "INV-WZ1004",
    clientName: "Diana White",
    machineryModel: "Chevrolet Malibu (or Massey Ferguson)",
    ratePerDay: 50,
    rentalPeriod: "1 Day",
    daysCount: 1,
    amount: 50,
    dueDate: "2024-08-08",
    status: "Completed",
  },
  {
    id: "INV-WZ1005",
    clientName: "Edward Green",
    machineryModel: "Nissan Altima (or New Holland TT4)",
    ratePerDay: 50,
    rentalPeriod: "4 Days",
    daysCount: 4,
    amount: 200,
    dueDate: "2024-08-09",
    status: "Awaiting",
  },
  {
    id: "INV-WZ1006",
    clientName: "Fiona Brown",
    machineryModel: "BMW X5 (or CAT 320 Excavator)",
    ratePerDay: 120,
    rentalPeriod: "3 Days",
    daysCount: 3,
    amount: 360,
    dueDate: "2024-08-10",
    status: "Overdue",
  },
  {
    id: "INV-WZ1007",
    clientName: "George Clark",
    machineryModel: "Audi Q7 (or Mahindra 575 DI)",
    ratePerDay: 65,
    rentalPeriod: "4 Days",
    daysCount: 4,
    amount: 260,
    dueDate: "2024-08-11",
    status: "Completed",
  },
  {
    id: "INV-WZ1008",
    clientName: "Helen Martinez",
    machineryModel: "Mazda 3 (or Claas Dominator 130)",
    ratePerDay: 90,
    rentalPeriod: "2 Days",
    daysCount: 2,
    amount: 180,
    dueDate: "2024-08-12",
    status: "Awaiting",
  },
];

export default function Payments() {
  const navigate = useNavigate();

  // Navigation sub-menu toggle
  const [financialsOpen, setFinancialsOpen] = useState(true);

  // Invoices state
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [selectedIds, setSelectedIds] = useState(["INV-WZ1004"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRangeFilter, setDateRangeFilter] = useState("1 Aug - 20 Aug 2028");
  const [sortBy, setSortBy] = useState("date_desc");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [formData, setFormData] = useState({
    id: "",
    clientName: "",
    machineryModel: "",
    ratePerDay: 50,
    daysCount: 3,
    dueDate: "2024-08-15",
    status: "Awaiting",
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    let result = invoices.filter((inv) => {
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
      if (sortBy === "amount_desc") return (b.ratePerDay * b.daysCount || 0) - (a.ratePerDay * a.daysCount || 0);
      if (sortBy === "amount_asc") return (a.ratePerDay * a.daysCount || 0) - (b.ratePerDay * b.daysCount || 0);
      if (sortBy === "client_asc") return (a.clientName || "").localeCompare(b.clientName || "");
      return 0;
    });

    return result;
  }, [invoices, searchQuery, statusFilter, sortBy]);

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
      id: `INV-WZ${1000 + invoices.length + 1}`,
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
    if (window.confirm(`Are you sure you want to delete invoice ${id}?`)) {
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
                  <span className="wz-payments-kpi-val">₱22,450</span>
                </div>
                <div className="wz-payments-kpi-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
              </div>
              <div className="wz-payments-kpi-bottom">
                <span className="wz-payments-kpi-subtext">350 invoices</span>
                <span className="wz-trend-positive">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                  +2.71% from last week
                </span>
              </div>
            </div>

            {/* Card 2: Awaiting Payment */}
            <div className="wz-payments-kpi-card">
              <div className="wz-payments-kpi-top">
                <div className="wz-payments-kpi-info">
                  <span className="wz-payments-kpi-label">Awaiting Payment</span>
                  <span className="wz-payments-kpi-val">₱15,300</span>
                </div>
                <div className="wz-payments-kpi-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
              <div className="wz-payments-kpi-bottom">
                <span className="wz-payments-kpi-subtext">215 invoices</span>
                <span className="wz-trend-negative">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                  -1.25% from last week
                </span>
              </div>
            </div>

            {/* Card 3: Overdue */}
            <div className="wz-payments-kpi-card">
              <div className="wz-payments-kpi-top">
                <div className="wz-payments-kpi-info">
                  <span className="wz-payments-kpi-label">Overdue</span>
                  <span className="wz-payments-kpi-val">₱12,730</span>
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
                <span className="wz-payments-kpi-subtext">150 invoices</span>
                <span className="wz-trend-positive">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                  +3.45% from last week
                </span>
              </div>
            </div>
          </section>

          {/* Filter & Actions Bar */}
          <section className="wz-fin-filter-bar">
            <div className="wz-fin-filter-left">
              <ManagerSearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search invoice, client name, etc"
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
                    <th style={{ width: "40px", textAlign: "center" }}>
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
                    <th>Invoice ID ↕</th>
                    <th>Client Name ↕</th>
                    <th>Machinery Model ↕</th>
                    <th>Rate per Day ↕</th>
                    <th>Rental Period ↕</th>
                    <th>Amount ↕</th>
                    <th>Due Date ↕</th>
                    <th>Status ↕</th>
                    <th style={{ textAlign: "center" }}>Action ↕</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        No invoices found matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const isChecked = selectedIds.includes(inv.id);
                      return (
                        <tr
                          key={inv.id}
                          style={{
                            backgroundColor: isChecked ? "#f0f9ff" : undefined,
                          }}
                        >
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleSelectOne(inv.id)}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ fontWeight: "700", color: "#0f172a" }}>
                            {inv.id}
                          </td>
                          <td style={{ fontWeight: "600" }}>{inv.clientName}</td>
                          <td style={{ color: "#475569" }}>{inv.machineryModel}</td>
                          <td>₱{inv.ratePerDay}</td>
                          <td>{inv.rentalPeriod}</td>
                          <td style={{ fontWeight: "800", color: "#0f172a" }}>
                            ₱{inv.amount}
                          </td>
                          <td style={{ color: "#64748b" }}>{inv.dueDate}</td>
                          <td>
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
                              className="wz-fin-action-btn"
                              onClick={() => openEditModal(inv)}
                              title="Edit invoice"
                            >
                              Edit
                            </button>
                            <button
                              className="wz-fin-action-btn delete"
                              onClick={() => handleDelete(inv.id)}
                              title="Delete invoice"
                            >
                              Delete
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
            <div
              style={{
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: "1px solid #f1f5f9",
                fontSize: "0.82rem",
                color: "#64748b",
              }}
            >
              <span>Showing 1 to {filteredInvoices.length} of {invoices.length} entries</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: "600",
                  }}
                >
                  &lt;
                </button>
                <button
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#ff3b5c",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: "700",
                  }}
                >
                  1
                </button>
                <button
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: "600",
                  }}
                >
                  2
                </button>
                <button
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: "600",
                  }}
                >
                  3
                </button>
                <button
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "0.78rem",
                    fontWeight: "600",
                  }}
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
                {editingInvoice ? `Edit Invoice (${editingInvoice.id})` : "Create New Invoice"}
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
                  {editingInvoice ? "Save Changes" : "Create Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

