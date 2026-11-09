import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerSearchBar from "../../components/ManagerSearchBar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

const INITIAL_TRANSACTIONS = [];

const MONTHS_DATA = [
  { month: "Jan", income: 14000, expense: 9500 },
  { month: "Feb", income: 15500, expense: 11000 },
  { month: "Mar", income: 17200, expense: 10200 },
  { month: "Apr", income: 19800, expense: 12800 },
  { month: "May", income: 18450, expense: 14200 }, // Highlighted in reference
  { month: "Jun", income: 20500, expense: 11500 },
  { month: "Jul", income: 21800, expense: 12100 },
  { month: "Aug", income: 23400, expense: 13900 },
  { month: "Sep", income: 19500, expense: 10800 },
  { month: "Oct", income: 20800, expense: 12400 },
  { month: "Nov", income: 18200, expense: 11100 },
  { month: "Dec", income: 22100, expense: 13500 },
];

export default function Expenses() {
  const navigate = useNavigate();

  // Navigation sub-menu toggle
  const [financialsOpen, setFinancialsOpen] = useState(true);

  // Transactions state with localStorage persistence
  const [transactions, setTransactions] = useState(() => {
    try {
      const saved = localStorage.getItem("kimpc_manager_expenses");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("kimpc_manager_expenses", JSON.stringify(transactions));
    } catch (e) {}
  }, [transactions]);

  // Live financial metrics from database bookings & transactions
  const [liveIncome, setLiveIncome] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchFinancials = async () => {
      try {
        const [appsRes, txRes] = await Promise.all([
          api("/applications").catch(() => ({ ok: false })),
          api("/transactions").catch(() => ({ ok: false })),
        ]);

        let incomeTotal = 0;
        if (appsRes.ok && Array.isArray(appsRes.data)) {
          const appPaid = appsRes.data
            .filter((a) => a.paymentStatus === "Paid" || a.financials?.isSettled)
            .reduce((sum, a) => sum + (Number(a.totalAmount) || Number(a.financials?.totalPaid) || 0), 0);
          incomeTotal += appPaid;
        }

        if (txRes.ok) {
          const txList = Array.isArray(txRes.data)
            ? txRes.data
            : (Array.isArray(txRes.data?.transactions) ? txRes.data.transactions : []);
          const txTotal = txList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          incomeTotal += txTotal;
        }

        if (isMounted) {
          setLiveIncome(incomeTotal);
        }
      } catch (err) {
        console.error("Error loading income metrics:", err);
      }
    };

    fetchFinancials();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalExpenseSum = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions]);

  const displayIncome = liveIncome > 0 ? liveIncome : 25700;
  const displayExpense = totalExpenseSum > 0 ? totalExpenseSum : 14575;
  const displayBalance = displayIncome - displayExpense > 0 ? displayIncome - displayExpense : 155820;

  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRangeFilter, setDateRangeFilter] = useState("All Time");
  const [sortBy, setSortBy] = useState("date_desc");
  const [pageSize, setPageSize] = useState(8);
  const [currentPage, setCurrentPage] = useState(1);

  // Chart hover month
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState(4); // Default May (index 4)

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    category: "Machinery Maintenance",
    quantity: 1,
    amount: 100,
    date: new Date().toISOString().slice(0, 10),
    status: "Completed",
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    let result = transactions.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "All" || t.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      if (sortBy === "date_asc") return (a.date || "").localeCompare(b.date || "");
      if (sortBy === "date_desc") return (b.date || "").localeCompare(a.date || "");
      if (sortBy === "amount_desc") return (b.amount || 0) - (a.amount || 0);
      if (sortBy === "amount_asc") return (a.amount || 0) - (b.amount || 0);
      if (sortBy === "title_asc") return (a.title || "").localeCompare(b.title || "");
      return 0;
    });

    return result;
  }, [transactions, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1;
  const paginatedTransactions = useMemo(() => {
    return filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortBy]);

  // Select all checkbox
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredTransactions.map((t) => t.id));
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
    setEditingExpense(null);
    setFormData({
      title: "",
      category: "Machinery Maintenance",
      quantity: 1,
      amount: 150,
      date: new Date().toISOString().slice(0, 10),
      status: "Completed",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingExpense(item);
    setFormData({
      title: item.title,
      category: item.category,
      quantity: item.quantity,
      amount: item.amount,
      date: item.date,
      status: item.status,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this expense record?")) {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleSaveModal = (e) => {
    e.preventDefault();
    const colorMap = {
      "Machinery Maintenance": "#ff3b5c",
      "Vehicle Maintenance": "#ff3b5c",
      "Staff Salaries": "#182538",
      "Fuel": "#38bdf8",
      "Insurance": "#93c5fd",
      "Office Supplies": "#94a3b8",
      "Marketing": "#cbd5e1",
    };

    if (editingExpense) {
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === editingExpense.id
            ? {
                ...t,
                title: formData.title,
                category: formData.category,
                categoryColor: colorMap[formData.category] || "#64748b",
                quantity: Number(formData.quantity) || 1,
                amount: Number(formData.amount) || 0,
                date: formData.date,
                status: formData.status,
              }
            : t
        )
      );
    } else {
      const newExp = {
        id: `EXP-${100 + transactions.length + 1}`,
        title: formData.title,
        category: formData.category,
        categoryColor: colorMap[formData.category] || "#64748b",
        quantity: Number(formData.quantity) || 1,
        amount: Number(formData.amount) || 0,
        date: formData.date,
        status: formData.status,
      };
      setTransactions((prev) => [newExp, ...prev]);
    }
    setIsModalOpen(false);
  };

  // CSV Download export
  const handleDownloadCsv = () => {
    const headers = ["Expense ID", "Expense Title", "Category", "Quantity", "Amount (PHP)", "Date", "Status"];
    const rows = filteredTransactions.map((t) => [
      t.id,
      `"${t.title.replace(/"/g, '""')}"`,
      `"${t.category}"`,
      t.quantity,
      t.amount,
      t.date,
      t.status,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `expenses_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Tooltip details for hover point
  const currentHovered = MONTHS_DATA[hoveredMonthIndex] || MONTHS_DATA[4];

  // SVG dimensions for cashflow chart
  const svgWidth = 650;
  const svgHeight = 155;
  const maxVal = 24000;

  const pointsIncome = MONTHS_DATA.map((d, i) => {
    const x = 50 + i * ((svgWidth - 70) / (MONTHS_DATA.length - 1));
    const y = svgHeight - 26 - (d.income / maxVal) * (svgHeight - 48);
    return { x, y, ...d };
  });

  const pointsExpense = MONTHS_DATA.map((d, i) => {
    const x = 50 + i * ((svgWidth - 70) / (MONTHS_DATA.length - 1));
    const y = svgHeight - 26 - (d.expense / maxVal) * (svgHeight - 48);
    return { x, y, ...d };
  });

  // Build SVG path
  const buildSmoothPath = (pts) => {
    if (pts.length === 0) return "";
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const incomePath = buildSmoothPath(pointsIncome);
  const expensePath = buildSmoothPath(pointsExpense);
  const expenseAreaPath = `${expensePath} L ${pointsExpense[pointsExpense.length - 1].x} ${svgHeight - 26} L ${pointsExpense[0].x} ${svgHeight - 26} Z`;

  const activeIncomePt = pointsIncome[hoveredMonthIndex];
  const activeExpensePt = pointsExpense[hoveredMonthIndex];

  return (
    <div className="wz-dashboard-container">
      {/* ================= LEFT SIDEBAR ================= */}
      <ManagerSidebar />

      {/* ================= MAIN CONTENT ================= */}
      <main className="wz-content-wrapper">
        {/* Top bar header */}
        <ManagerTopbar title="Expenses" />

        {/* ================= EXPENSES BODY ================= */}
        <div className="wz-expenses-page-wrapper">
          {/* Top 2-Column Split: KPIs & Cashflow Chart (Left) + Expense Breakdown Donut (Right) */}
          <section className="wz-expenses-top-grid">
            {/* Left Column */}
            <div className="wz-expenses-left-col">
              {/* Row of 3 KPI Cards */}
              <div className="wz-expenses-kpi-row">
                {/* Card 1: Balance */}
                <div className="wz-booking-kpi-card">
                  <div className="wz-kpi-left">
                    <div className="wz-kpi-circle-icon" style={{ background: "#eff6ff", borderColor: "#dbeafe", color: "#1d4ed8" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    </div>
                    <div className="wz-kpi-meta">
                      <span className="wz-kpi-label">Balance</span>
                      <span className="wz-kpi-value">₱{displayBalance.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="wz-kpi-right">
                    <span className="wz-kpi-trend-plain" style={{ color: "#16a34a" }}>
                      ↑ +4.82%
                    </span>
                    <span className="wz-kpi-subtext">from last week</span>
                  </div>
                </div>

                {/* Card 2: Income */}
                <div className="wz-booking-kpi-card">
                  <div className="wz-kpi-left">
                    <div className="wz-kpi-circle-icon" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#059669" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                        <polyline points="17 6 23 6 23 12" />
                      </svg>
                    </div>
                    <div className="wz-kpi-meta">
                      <span className="wz-kpi-label">Income</span>
                      <span className="wz-kpi-value">₱{displayIncome.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="wz-kpi-right">
                    <span className="wz-kpi-trend-plain" style={{ color: "#16a34a" }}>
                      ↑ +2.73%
                    </span>
                    <span className="wz-kpi-subtext">from last week</span>
                  </div>
                </div>

                {/* Card 3: Expenses */}
                <div className="wz-booking-kpi-card">
                  <div className="wz-kpi-left">
                    <div className="wz-kpi-circle-icon" style={{ background: "#fff1f2", borderColor: "#fecdd3", color: "#e11d48" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                        <polyline points="17 18 23 18 23 12" />
                      </svg>
                    </div>
                    <div className="wz-kpi-meta">
                      <span className="wz-kpi-label">Expenses</span>
                      <span className="wz-kpi-value">₱{displayExpense.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="wz-kpi-right">
                    <span className="wz-kpi-trend-plain" style={{ color: "#dc2626" }}>
                      ↓ -5.70%
                    </span>
                    <span className="wz-kpi-subtext">from last week</span>
                  </div>
                </div>
              </div>

              {/* Cashflow Chart Card */}
              <div className="wz-cashflow-card">
                <div className="wz-cashflow-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                    <span className="wz-cashflow-title">Cashflow</span>
                    <div className="wz-cashflow-legend">
                      <span className="wz-legend-income">Income</span>
                      <span className="wz-legend-expense">Expense</span>
                    </div>
                  </div>

                  <select
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      fontWeight: "600",
                      color: "#475569",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="This Year">This Year</option>
                    <option value="Last Year">Last Year</option>
                  </select>
                </div>

                {/* SVG Spline Cashflow Chart */}
                <div style={{ width: "100%", overflowX: "auto" }}>
                  <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    style={{ width: "100%", height: "auto", display: "block" }}
                  >
                    <defs>
                      <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff3b5c" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#ff3b5c" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Y-axis grid lines & labels */}
                    {[24000, 18000, 12000, 6000, 0].map((val) => {
                      const y = svgHeight - 26 - (val / maxVal) * (svgHeight - 48);
                      return (
                        <g key={val}>
                          <line
                            x1="45"
                            y1={y}
                            x2={svgWidth - 10}
                            y2={y}
                            stroke="#f1f5f9"
                            strokeWidth="1"
                            strokeDasharray={val === 0 ? "none" : "3,3"}
                          />
                          <text
                            x="40"
                            y={y + 4}
                            textAnchor="end"
                            fill="#94a3b8"
                            fontSize="9"
                            fontWeight="500"
                          >
                            ₱{val === 0 ? "0" : `${val / 1000}K`}
                          </text>
                        </g>
                      );
                    })}

                    {/* X-axis Month Labels */}
                    {MONTHS_DATA.map((d, i) => {
                      const x = 50 + i * ((svgWidth - 70) / (MONTHS_DATA.length - 1));
                      return (
                        <text
                          key={d.month}
                          x={x}
                          y={svgHeight - 8}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="9"
                          fontWeight="500"
                        >
                          {d.month}
                        </text>
                      );
                    })}

                    {/* Expense Area Gradient Fill */}
                    <path d={expenseAreaPath} fill="url(#expenseGradient)" />

                    {/* Spline Lines */}
                    <path
                      d={expensePath}
                      fill="none"
                      stroke="#ff3b5c"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <path
                      d={incomePath}
                      fill="none"
                      stroke="#182538"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Vertical dashed line for hovered month */}
                    {activeIncomePt && (
                      <line
                        x1={activeIncomePt.x}
                        y1={activeIncomePt.y}
                        x2={activeIncomePt.x}
                        y2={svgHeight - 26}
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}

                    {/* Interactive Points & Hit Areas */}
                    {pointsIncome.map((pt, i) => (
                      <g key={i}>
                        {/* Invisible larger hover target */}
                        <circle
                          cx={pt.x}
                          cy={(pt.y + pointsExpense[i].y) / 2}
                          r="18"
                          fill="transparent"
                          style={{ cursor: "pointer" }}
                          onMouseEnter={() => setHoveredMonthIndex(i)}
                        />
                        {/* Visible circles if hovered */}
                        {hoveredMonthIndex === i && (
                          <>
                            <circle cx={pt.x} cy={pt.y} r="5" fill="#182538" stroke="#ffffff" strokeWidth="2" />
                            <circle cx={pointsExpense[i].x} cy={pointsExpense[i].y} r="5" fill="#ff3b5c" stroke="#ffffff" strokeWidth="2" />
                          </>
                        )}
                      </g>
                    ))}

                    {/* May 2028 Callout Tooltip */}
                    {activeIncomePt && (
                      <g
                        transform={`translate(${Math.min(
                          Math.max(activeIncomePt.x - 65, 45),
                          svgWidth - 145
                        )}, ${Math.max(activeIncomePt.y - 58, 4)})`}
                      >
                        <rect
                          width="130"
                          height="56"
                          rx="8"
                          fill="#ffffff"
                          stroke="#e2e8f0"
                          strokeWidth="1"
                          filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))"
                        />
                        <text x="12" y="18" fill="#64748b" fontSize="10" fontWeight="700">
                          {currentHovered.month} 2028
                        </text>
                        {/* Income row */}
                        <circle cx="16" cy="30" r="3" fill="#182538" />
                        <text x="25" y="33" fill="#64748b" fontSize="9.5" fontWeight="500">
                          Income:
                        </text>
                        <text x="118" y="33" textAnchor="end" fill="#0f172a" fontSize="9.5" fontWeight="800">
                          ₱{currentHovered.income.toLocaleString()}
                        </text>
                        {/* Expense row */}
                        <circle cx="16" cy="44" r="3" fill="#ff3b5c" />
                        <text x="25" y="47" fill="#64748b" fontSize="9.5" fontWeight="500">
                          Expense:
                        </text>
                        <text x="118" y="47" textAnchor="end" fill="#ff3b5c" fontSize="9.5" fontWeight="800">
                          ₱{currentHovered.expense.toLocaleString()}
                        </text>
                      </g>
                    )}
                  </svg>
                </div>
              </div>
            </div>

            {/* Right Column: Expense Breakdown Card */}
            <div className="wz-expense-breakdown-card">
              <div className="wz-breakdown-header">
                <span style={{ fontSize: "0.95rem", fontWeight: "800", color: "#0f172a" }}>
                  Expense Breakdown
                </span>
                <button style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1rem" }}>
                  •••
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <select
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "4px 10px",
                    fontSize: "0.76rem",
                    fontWeight: "600",
                    color: "#475569",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="This Year">This Year</option>
                </select>
              </div>

              {/* SVG Donut Chart */}
              <div className="wz-donut-container">
                <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                  {/* Total circle circum = 2 * PI * 38 ≈ 238.76 */}
                  {/* Segments: 
                      Machinery Maint: 30% -> 71.6
                      Staff Salaries: 25% -> 59.7
                      Fuel: 20% -> 47.8
                      Insurance: 15% -> 35.8
                      Office Supplies: 5% -> 11.9
                      Marketing: 5% -> 11.9
                  */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#ff3b5c"
                    strokeWidth="15"
                    strokeDasharray="71.6 167.2"
                    strokeDashoffset="0"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#182538"
                    strokeWidth="15"
                    strokeDasharray="59.7 179.1"
                    strokeDashoffset="-71.6"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="15"
                    strokeDasharray="47.8 191.0"
                    strokeDashoffset="-131.3"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#93c5fd"
                    strokeWidth="15"
                    strokeDasharray="35.8 203.0"
                    strokeDashoffset="-179.1"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="15"
                    strokeDasharray="11.9 226.9"
                    strokeDashoffset="-214.9"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="15"
                    strokeDasharray="11.9 226.9"
                    strokeDashoffset="-226.8"
                  />
                </svg>

                <div className="wz-donut-center-text">
                  <div className="wz-donut-center-sub">Total Expenses</div>
                  <div className="wz-donut-center-amount">₱10,000</div>
                </div>
              </div>

              {/* Category Breakdown List */}
              <div className="wz-breakdown-list">
                <div className="wz-breakdown-row">
                  <div className="wz-breakdown-row-left">
                    <span className="wz-breakdown-pct-pill" style={{ background: "#ff3b5c" }}>30%</span>
                    <span>Machinery Maintenance</span>
                  </div>
                  <span className="wz-breakdown-amount">₱3,000</span>
                </div>

                <div className="wz-breakdown-row">
                  <div className="wz-breakdown-row-left">
                    <span className="wz-breakdown-pct-pill" style={{ background: "#182538" }}>25%</span>
                    <span>Staff Salaries</span>
                  </div>
                  <span className="wz-breakdown-amount">₱2,500</span>
                </div>

                <div className="wz-breakdown-row">
                  <div className="wz-breakdown-row-left">
                    <span className="wz-breakdown-pct-pill" style={{ background: "#38bdf8" }}>20%</span>
                    <span>Fuel</span>
                  </div>
                  <span className="wz-breakdown-amount">₱2,000</span>
                </div>

                <div className="wz-breakdown-row">
                  <div className="wz-breakdown-row-left">
                    <span className="wz-breakdown-pct-pill" style={{ background: "#93c5fd" }}>15%</span>
                    <span>Insurance</span>
                  </div>
                  <span className="wz-breakdown-amount">₱1,500</span>
                </div>

                <div className="wz-breakdown-row">
                  <div className="wz-breakdown-row-left">
                    <span className="wz-breakdown-pct-pill" style={{ background: "#94a3b8" }}>5%</span>
                    <span>Office Supplies</span>
                  </div>
                  <span className="wz-breakdown-amount">₱500</span>
                </div>

                <div className="wz-breakdown-row">
                  <div className="wz-breakdown-row-left">
                    <span className="wz-breakdown-pct-pill" style={{ background: "#cbd5e1", color: "#334155" }}>5%</span>
                    <span>Marketing</span>
                  </div>
                  <span className="wz-breakdown-amount">₱500</span>
                </div>
              </div>
            </div>
          </section>

          {/* Bottom Full-Width Section: Recent Transactions Card */}
          <section className="wz-recent-transactions-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <span style={{ fontSize: "1.05rem", fontWeight: "800", color: "#0f172a" }}>
                Recent Transactions
              </span>
            </div>

            {/* Consistent Toolbar: Search Bar on LEFT, followed by Filters and Sort, Actions on RIGHT */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flex: 1 }}>
                <ManagerSearchBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  placeholder="Search invoice, title, ID..."
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
                        { value: "Pending", label: "Pending" },
                      ],
                    },
                    {
                      id: "dateRange",
                      label: "Date Range",
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
                      { value: "amount_desc", label: "Amount (High to Low)" },
                      { value: "amount_asc", label: "Amount (Low to High)" },
                      { value: "title_asc", label: "Title (A-Z)" },
                    ],
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  onClick={handleDownloadCsv}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#f8fafc",
                    border: "1px solid var(--wz-border)",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontSize: "0.82rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    color: "#334155",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download CSV
                </button>

                <button
                  onClick={openCreateModal}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#182538",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "9px 16px",
                    fontSize: "0.82rem",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  + Add Expense
                </button>
              </div>
            </div>

            {/* Transactions Table */}
            <div style={{ overflowX: "auto" }}>
              <table className="wz-fin-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredTransactions.length > 0 &&
                          selectedIds.length === filteredTransactions.length
                        }
                        onChange={handleSelectAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th>Expenses ↕</th>
                    <th>Category ↕</th>
                    <th style={{ textAlign: "center" }}>Quantity ↕</th>
                    <th>Amount ↕</th>
                    <th>Date ↕</th>
                    <th>Status ↕</th>
                    <th style={{ textAlign: "center" }}>Action ↕</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        No transactions found matching your search.
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map((item) => {
                      const isChecked = selectedIds.includes(item.id);
                      return (
                        <tr
                          key={item.id}
                          style={{
                            backgroundColor: isChecked ? "#f0f9ff" : undefined,
                          }}
                        >
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleSelectOne(item.id)}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ fontWeight: "700", color: "#0f172a" }}>
                            {item.title}
                          </td>
                          <td>
                            <span className="wz-category-tag">
                              <span
                                className="wz-cat-dot"
                                style={{ backgroundColor: item.categoryColor || "#ff3b5c" }}
                              />
                              <span style={{ color: "#334155" }}>{item.category}</span>
                            </span>
                          </td>
                          <td style={{ textAlign: "center", fontWeight: "600", color: "#475569" }}>
                            {item.quantity}
                          </td>
                          <td style={{ fontWeight: "800", color: "#0f172a" }}>
                            ₱{item.amount.toLocaleString()}
                          </td>
                          <td style={{ color: "#64748b" }}>{item.date}</td>
                          <td>
                            {item.status === "Completed" ? (
                              <span className="wz-badge-trans-completed">Completed</span>
                            ) : (
                              <span className="wz-badge-trans-pending">Pending</span>
                            )}
                          </td>
                          <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                            <button
                              className="wz-fin-action-btn"
                              onClick={() => openEditModal(item)}
                              title="Edit item"
                            >
                              Edit
                            </button>
                            <button
                              className="wz-fin-action-btn delete"
                              onClick={() => handleDelete(item.id)}
                              title="Delete item"
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

            {/* Pagination Controls */}
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
                  Showing {filteredTransactions.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filteredTransactions.length)} of {filteredTransactions.length} expenses
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

      {/* ================= MODAL: ADD / EDIT EXPENSE ================= */}
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
              maxWidth: "500px",
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
                {editingExpense ? "Edit Expense Entry" : "Add New Expense"}
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
                  Expense Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Engine Oil Replacement"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                    outline: "none",
                  }}
                >
                  <option value="Machinery Maintenance">Machinery Maintenance</option>
                  <option value="Staff Salaries">Staff Salaries</option>
                  <option value="Fuel">Fuel</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Office Supplies">Office Supplies</option>
                  <option value="Marketing">Marketing</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "700", color: "#475569", marginBottom: "6px" }}>
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
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
                    Amount (₱) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
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
                    <option value="Pending">Pending</option>
                  </select>
                </div>
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
                  {editingExpense ? "Save Changes" : "Add Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

