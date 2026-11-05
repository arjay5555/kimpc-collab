import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";
import MemberTopbar from "../../components/MemberTopbar";

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

export default function MemberPayments() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Modal states
  const [receiptApp, setReceiptApp] = useState(null);
  const [previewGcash, setPreviewGcash] = useState(null);

  const fetchApplications = useCallback(async () => {
    try {
      const response = await api(getApplicationsUrl(user?.email));
      if (response.ok) {
        setApplications(unwrapListResponse(response));
        setError("");
      } else {
        setError(response.data?.error || "Could not load payments data.");
      }
    } catch (err) {
      setError("An unexpected error occurred while loading payment records.");
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchApplications();
    const interval = window.setInterval(fetchApplications, 15000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  // Financial aggregates
  const stats = useMemo(() => {
    let totalPaid = 0;
    let pendingDue = 0;
    let paidCount = 0;
    let pendingCount = 0;

    applications.forEach((app) => {
      const totalAmount = Number(
        app.totalAmount ||
          app.financials?.totalPaid ||
          (app.ratePerHectare || app.dailyRate || 2500) * (app.hectares || 1)
      ) || 0;

      const isPaid = (app.paymentStatus || "").toLowerCase() === "paid" || app.isPaid;
      if (isPaid) {
        totalPaid += totalAmount;
        paidCount++;
      } else if (!["rejected", "cancelled", "voided"].includes((app.status || "").toLowerCase())) {
        pendingDue += totalAmount;
        pendingCount++;
      }
    });

    return { totalPaid, pendingDue, paidCount, pendingCount };
  }, [applications]);

  // Filtered payments list
  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      const pStatus = (app.paymentStatus || "pending").toLowerCase();
      const isPaid = pStatus === "paid" || app.isPaid;

      if (filter === "paid" && !isPaid) return false;
      if (filter === "pending" && isPaid) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const displayId = (app.displayId || app._id || "").toLowerCase();
        const equip = (app.machineryModel || app.equipment || "").toLowerCase();
        const method = (app.paymentMethod || "").toLowerCase();
        const receiptNo = (app.receiptNo || "").toLowerCase();
        if (!displayId.includes(q) && !equip.includes(q) && !method.includes(q) && !receiptNo.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [applications, filter, search]);

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto", paddingBottom: "40px" }}>
      <MemberTopbar
        title="Payments"
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search receipts, booking ID, machinery..."
      />

      {/* KPI Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
          marginBottom: "20px",
        }}
      >
        {/* Total Paid */}
        <div
          style={{
            background: "#ffffff",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Total Paid
            </span>
            <span style={{ fontSize: "1.2rem" }}>✅</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#166534", marginTop: "4px" }}>
            ₱{stats.totalPaid.toLocaleString()}
          </div>
          <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
            {stats.paidCount} settled invoice{stats.paidCount === 1 ? "" : "s"}
          </span>
        </div>

        {/* Pending Due */}
        <div
          style={{
            background: "#ffffff",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Pending Balance
            </span>
            <span style={{ fontSize: "1.2rem" }}>⏳</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#d97706", marginTop: "4px" }}>
            ₱{stats.pendingDue.toLocaleString()}
          </div>
          <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
            {stats.pendingCount} awaiting settlement
          </span>
        </div>

        {/* Total Bookings / Invoices */}
        <div
          style={{
            background: "#ffffff",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Total Invoices
            </span>
            <span style={{ fontSize: "1.2rem" }}>📄</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#0f172a", marginTop: "4px" }}>
            {applications.length}
          </div>
          <span style={{ fontSize: "0.74rem", color: "#64748b" }}>
            Rental transactions on record
          </span>
        </div>
      </div>

      {/* Filter Tabs & Quick Action Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div className="member-filter-tabs" role="tablist" aria-label="Filter payments" style={{ margin: 0 }}>
          <button
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            ALL <span>{applications.length}</span>
          </button>
          <button
            type="button"
            className={filter === "pending" ? "active" : ""}
            onClick={() => setFilter("pending")}
          >
            Pending <span>{stats.pendingCount}</span>
          </button>
          <button
            type="button"
            className={filter === "paid" ? "active" : ""}
            onClick={() => setFilter("paid")}
          >
            Paid <span>{stats.paidCount}</span>
          </button>
        </div>

        <Link
          className="wz-btn wz-btn-outline"
          to="/applications"
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
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5h6a1.5 1.5 0 0 0-3-1 1.5 1.5 0 0 0-3 1Z" />
            <path d="m9 13 2 2 4-4" />
          </svg>
          <span>View My Bookings</span>
        </Link>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="member-app-table" style={{ background: "#ffffff", borderRadius: "12px", padding: "20px" }}>
          <div className="member-table-skeleton" />
          <div className="member-table-skeleton" />
        </div>
      ) : error ? (
        <div className="member-empty-state" role="alert" style={{ background: "#ffffff", borderRadius: "12px", padding: "40px 20px" }}>
          <strong>Couldn’t load payment history</strong>
          <p>{error}</p>
          <button className="member-button member-button-outline" type="button" onClick={fetchApplications}>
            Try again
          </button>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="member-empty-state" style={{ background: "#ffffff", borderRadius: "12px", padding: "40px 20px", textAlign: "center" }}>
          <span className="member-empty-icon" aria-hidden="true" style={{ fontSize: "2rem", display: "block", marginBottom: "10px" }}>💳</span>
          <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>No payment records found</strong>
          <p style={{ color: "#64748b", margin: "6px 0 16px" }}>
            When you reserve machinery, your invoices, billing breakdowns, and official receipts will appear here.
          </p>
          <Link className="member-button member-button-primary" to="/member/book" style={{ display: "inline-block", textDecoration: "none" }}>
            Browse Machinery
          </Link>
        </div>
      ) : (
        <div
          className="wz-table-responsive"
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            overflowX: "auto",
          }}
        >
          <table className="wz-table wz-bookings-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Receipt / Invoice</th>
                <th>Machinery</th>
                <th>Rental Dates</th>
                <th>Method</th>
                <th>Total Amount</th>
                <th style={{ textAlign: "center" }}>Receipt &amp; Proof</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => {
                const isPaid = (app.paymentStatus || "").toLowerCase() === "paid" || app.isPaid;
                const totalAmount = Number(
                  app.totalAmount ||
                    app.financials?.totalPaid ||
                    (app.ratePerHectare || app.dailyRate || 2500) * (app.hectares || 1)
                ) || 0;
                const receiptNo =
                  app.receiptNo ||
                  `REC-2026-${String(app._id || "1001").slice(-4).toUpperCase()}`;

                return (
                  <tr key={app._id || app.id}>
                    {/* 1. Status */}
                    <td>
                      <span
                        className={
                          isPaid
                            ? "wz-payment-badge-paid"
                            : "wz-payment-badge-pending"
                        }
                        style={{
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          display: "inline-block",
                        }}
                      >
                        {isPaid ? "Paid" : "Pending"}
                      </span>
                    </td>

                    {/* 2. Receipt / Invoice */}
                    <td>
                      <strong style={{ color: "#0f172a", fontFamily: "monospace", fontSize: "0.86rem" }}>
                        {receiptNo}
                      </strong>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                        Booking ID: {app.displayId || `APP-${String(app._id || "").slice(-6).toUpperCase()}`}
                      </span>
                    </td>

                    {/* 3. Machinery */}
                    <td>
                      <strong style={{ color: "#0f172a", fontSize: "0.85rem" }}>
                        {app.machineryModel || app.equipment}
                      </strong>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                        {app.hectares ? `${app.hectares} ha` : "Standard Area"}
                      </span>
                    </td>

                    {/* 4. Rental Dates */}
                    <td>
                      <span style={{ fontSize: "0.82rem", color: "#334155", fontWeight: 500 }}>
                        {formatBookingDateRange(app.startDate, app.endDate)}
                      </span>
                      <span style={{ display: "block", fontSize: "0.72rem", color: "#64748b" }}>
                        {getDaysCount(app.startDate, app.endDate)} day{getDaysCount(app.startDate, app.endDate) === 1 ? "" : "s"}
                      </span>
                    </td>

                    {/* 5. Method */}
                    <td>
                      <span style={{ fontWeight: 600, color: "#334155", fontSize: "0.82rem" }}>
                        {app.paymentMethod || "Cash"}
                      </span>
                      {app.paymentMethod === "Cash" && app.cashPaymentOption && (
                        <span style={{ display: "block", fontSize: "0.72rem", color: "#0284c7", fontWeight: 600 }}>
                          {app.cashPaymentOption}
                        </span>
                      )}
                      {app.paymentMethod === "GCash" && (
                        <span style={{ display: "block", fontSize: "0.72rem", color: "#059669", fontWeight: 600 }}>
                          Direct GCash
                        </span>
                      )}
                    </td>

                    {/* 6. Total Amount */}
                    <td>
                      <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                        ₱{totalAmount.toLocaleString()}
                      </strong>
                    </td>

                    {/* 7. Action: Receipt Voucher Modal */}
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                        <button
                          type="button"
                          className="wz-btn wz-btn-outline"
                          onClick={() => setReceiptApp(app)}
                          title="View official KIMPC printable receipt voucher"
                          style={{
                            padding: "5px 12px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            borderRadius: "6px",
                            borderColor: "#cbd5e1",
                            color: "#1e293b",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          <span>Official Receipt</span>
                        </button>

                        {app.paymentProofUrl && (
                          <button
                            type="button"
                            className="wz-action-icon-btn"
                            onClick={() => setPreviewGcash(app.paymentProofUrl)}
                            title="View GCash payment confirmation screenshot"
                            style={{ color: "#0284c7", background: "#f0f9ff" }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
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

      {/* ================= Official Cooperative Receipt Modal ==================== */}
      {receiptApp && (
        <div
          className="member-modal-backdrop wz-receipt-print-backdrop"
          role="presentation"
          onClick={() => setReceiptApp(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}
        >
          <div
            className="wz-receipt-voucher-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-voucher-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "32px",
              boxShadow: "0 20px 40px -15px rgba(0,0,0,0.3)",
              position: "relative",
              color: "#0f172a",
              fontFamily: "'Inter', -apple-system, sans-serif",
            }}
          >
            {/* Close Button */}
            <button
              type="button"
              className="wz-receipt-close-btn"
              onClick={() => setReceiptApp(null)}
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
                <h3 id="receipt-voucher-title" style={{ margin: 0, fontSize: "1.15rem", fontWeight: "900", color: "#0f172a", letterSpacing: "0.5px" }}>
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
              </tbody>
              <tfoot>
                <tr style={{ background: "#f8fafc", fontWeight: 800 }}>
                  <td colSpan={2} style={{ padding: "12px", textAlign: "right", textTransform: "uppercase", fontSize: "0.82rem", color: "#334155" }}>
                    Total Rental Fee Due / Paid:
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "#15803d", fontSize: "1.15rem", fontWeight: 900 }}>
                    ₱{Number(receiptApp.totalAmount || (receiptApp.ratePerHectare || 2500) * (receiptApp.hectares || 1)).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Payment Method & Verified Stamp Strip */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", padding: "12px 16px", background: (receiptApp.paymentStatus || "").toLowerCase() === "paid" ? "#f0fdf4" : "#fffbeb", border: `1px solid ${(receiptApp.paymentStatus || "").toLowerCase() === "paid" ? "#bbf7d0" : "#fef3c7"}`, borderRadius: "10px", marginBottom: "18px" }}>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Payment Method:</span>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.9rem" }}>
                  {receiptApp.paymentMethod === "GCash" ? "GCash (Account: 0926 463 8983 - Kalilangan Irrigators MPC)" : `Cash (${receiptApp.cashPaymentOption === "Upon Return" ? "Upon Return" : "Upon Pickup"})`}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {(receiptApp.paymentStatus || "").toLowerCase() === "paid" ? (
                  <span style={{ background: "#166534", color: "#ffffff", padding: "6px 14px", borderRadius: "20px", fontWeight: 800, fontSize: "0.78rem", letterSpacing: "1px", textTransform: "uppercase" }}>
                    ✓ PAID
                  </span>
                ) : (
                  <span style={{ background: "#d97706", color: "#ffffff", padding: "6px 14px", borderRadius: "20px", fontWeight: 800, fontSize: "0.78rem", letterSpacing: "1px", textTransform: "uppercase" }}>
                    PENDING
                  </span>
                )}
              </div>
            </div>

            {/* Signatures Strip */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", paddingTop: "14px", borderTop: "1px dashed #cbd5e1", marginBottom: "20px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: "40px" }} />
                <div style={{ borderTop: "1px solid #475569", paddingTop: "4px", fontWeight: 700, fontSize: "0.82rem", color: "#0f172a" }}>
                  {receiptApp.memberName || user?.fullName || "Member Signature"}
                </div>
                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Renter / Cooperative Member</span>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: "40px" }} />
                <div style={{ borderTop: "1px solid #475569", paddingTop: "4px", fontWeight: 700, fontSize: "0.82rem", color: "#0f172a" }}>
                  KIMPC Operations Management
                </div>
                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Authorized Cooperative Officer</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="wz-receipt-modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="wz-btn wz-btn-outline"
                onClick={() => setReceiptApp(null)}
                style={{ padding: "8px 18px", borderRadius: "8px", fontWeight: 600 }}
              >
                Close
              </button>
              <button
                type="button"
                className="wz-btn wz-btn-primary"
                onClick={() => window.print()}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  background: "#166534",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🖨️</span>
                <span>Print / Download PDF Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= GCash Proof Screenshot Modal ================= */}
      {previewGcash && (
        <div
          className="member-modal-backdrop"
          role="presentation"
          onClick={() => setPreviewGcash(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: "16px" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="GCash Proof Preview"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#ffffff", borderRadius: "12px", padding: "16px", maxWidth: "480px", width: "100%", textAlign: "center" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>GCash Payment Proof</strong>
              <button
                type="button"
                onClick={() => setPreviewGcash(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "#64748b" }}
              >
                ✕
              </button>
            </div>
            <img
              src={previewGcash}
              alt="GCash Screenshot"
              style={{ width: "100%", maxHeight: "65vh", objectFit: "contain", borderRadius: "8px", border: "1px solid #e2e8f0" }}
            />
            <button
              type="button"
              className="wz-btn wz-btn-outline"
              onClick={() => setPreviewGcash(null)}
              style={{ marginTop: "14px", width: "100%", padding: "8px" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

