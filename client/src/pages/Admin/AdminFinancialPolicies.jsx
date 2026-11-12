import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

export default function AdminFinancialPolicies() {
  const [activeTab, setActiveTab] = useState("deposit"); // "deposit" | "payments" | "refunds"
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // 1. Deposit & Cancellation Policies State
  const [depositPolicies, setDepositPolicies] = useState({
    depositRequirementType: "percentage",
    depositPercentage: 20,
    depositFlatAmount: 1000,
    depositPaymentWindowHours: 24,
    depositRefundWindowDays: 3,
    freeCancellationHours: 48,
    lateCancellationFeePercent: 15,
    sameDayCancellationFeePercent: 50,
    allowWeatherEmergencyCancellation: true,
    inspectionCheckRequiredForDepositRefund: true,
    policyNotes: "",
  });
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesSaving, setPoliciesSaving] = useState(false);

  // 2. Payment Methods & Instructions State
  const [paymentData, setPaymentData] = useState({
    methods: [],
    generalInstructions: "",
  });
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsSaving, setPaymentsSaving] = useState(false);

  // 3. Refunds & Corrections State
  const [refundsData, setRefundsData] = useState({ transactions: [], cancellations: [] });
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    farmer: "",
    amount: "",
    type: "Payment Correction",
    paymentMethod: "Bank Transfer",
    reason: "",
  });
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

  // Fetch data
  const fetchPolicies = async () => {
    setPoliciesLoading(true);
    const res = await api("/admin/deposit-cancellation-policies");
    if (res.ok && res.data) {
      setDepositPolicies(res.data);
    }
    setPoliciesLoading(false);
  };

  const fetchPayments = async () => {
    setPaymentsLoading(true);
    const res = await api("/admin/payment-methods");
    if (res.ok && res.data) {
      setPaymentData(res.data);
    }
    setPaymentsLoading(false);
  };

  const fetchRefunds = async () => {
    setRefundsLoading(true);
    const res = await api("/admin/refunds");
    if (res.ok && res.data) {
      setRefundsData(res.data);
    }
    setRefundsLoading(false);
  };

  useEffect(() => {
    fetchPolicies();
    fetchPayments();
    fetchRefunds();
  }, []);

  // Save Deposit & Cancellation Policies
  const handleSavePolicies = async (e) => {
    e.preventDefault();
    setPoliciesSaving(true);
    setFeedback({ message: "Saving deposit requirements and cancellation policies...", isError: false });

    const res = await api("/admin/deposit-cancellation-policies", {
      method: "POST",
      body: { policies: depositPolicies },
    });

    setPoliciesSaving(false);
    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Failed to save policies.", isError: true });
    } else {
      setFeedback({ message: "Deposit requirements and cancellation policies updated successfully!", isError: false });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  // Save Payment Methods
  const handleSavePayments = async (e) => {
    e.preventDefault();
    setPaymentsSaving(true);
    setFeedback({ message: "Saving accepted payment methods and instructions...", isError: false });

    const res = await api("/admin/payment-methods", {
      method: "POST",
      body: { paymentData },
    });

    setPaymentsSaving(false);
    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Failed to save payment methods.", isError: true });
    } else {
      setFeedback({ message: "Accepted payment channels and instructions updated successfully!", isError: false });
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  // Toggle single payment method
  const handleToggleMethod = (methodId) => {
    setPaymentData((prev) => ({
      ...prev,
      methods: prev.methods.map((m) => (m.id === methodId ? { ...m, enabled: !m.enabled } : m)),
    }));
  };

  // Update single method field
  const handleUpdateMethodField = (methodId, field, value) => {
    setPaymentData((prev) => ({
      ...prev,
      methods: prev.methods.map((m) => (m.id === methodId ? { ...m, [field]: value } : m)),
    }));
  };

  // Submit Authorized Payment Correction
  const handleRecordCorrection = async (e) => {
    e.preventDefault();
    if (!correctionForm.farmer.trim() || !correctionForm.amount) {
      setFeedback({ message: "Member name and valid amount are required.", isError: true });
      return;
    }
    if (!correctionForm.reason.trim() || correctionForm.reason.trim().length < 5) {
      setFeedback({ message: "A detailed authorized reason is mandatory for all corrections.", isError: true });
      return;
    }

    setCorrectionSubmitting(true);
    const res = await api("/admin/payment-corrections", {
      method: "POST",
      body: {
        farmer: correctionForm.farmer.trim(),
        amount: Number(correctionForm.amount),
        type: correctionForm.type,
        paymentMethod: correctionForm.paymentMethod,
        reason: correctionForm.reason.trim(),
      },
    });

    setCorrectionSubmitting(false);
    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Failed to record payment correction.", isError: true });
    } else {
      setFeedback({
        message: `Authorized ${correctionForm.type} of ₱${Number(correctionForm.amount).toLocaleString()} recorded successfully!`,
        isError: false,
      });
      setCorrectionForm({
        farmer: "",
        amount: "",
        type: "Payment Correction",
        paymentMethod: "Bank Transfer",
        reason: "",
      });
      fetchRefunds();
      setTimeout(() => setFeedback({ message: "", isError: false }), 5000);
    }
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        <AdminTopbar
          title="Financial Policies &amp; Payments"
          subtitle="Configure deposit terms, cancellation penalties, accepted payment channels, and authorized refunds."
        />

        {/* Global Feedback Alert */}
        {feedback.message && (
          <div
            style={{
              padding: "12px 18px",
              marginBottom: "20px",
              borderRadius: "10px",
              background: feedback.isError ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${feedback.isError ? "#fca5a5" : "#86efac"}`,
              color: feedback.isError ? "#991b1b" : "#166534",
              fontSize: "0.86rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback({ message: "", isError: false })}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Tab Navigation */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid var(--wz-border, #e2e8f0)", paddingBottom: "10px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("deposit")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "deposit" ? "#166534" : "transparent",
              color: activeTab === "deposit" ? "#ffffff" : "var(--wz-text, #475569)",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Deposit &amp; Cancellation Policies</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("payments")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "payments" ? "#166534" : "transparent",
              color: activeTab === "payments" ? "#ffffff" : "var(--wz-text, #475569)",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <span>Accepted Payment Channels &amp; Instructions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("refunds")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "refunds" ? "#166534" : "transparent",
              color: activeTab === "refunds" ? "#ffffff" : "var(--wz-text, #475569)",
              fontWeight: 700,
              fontSize: "0.86rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>Review Refunds &amp; Payment Corrections</span>
          </button>
        </div>

        {/* ================= TAB 1: DEPOSIT & CANCELLATION POLICIES ================= */}
        {activeTab === "deposit" && (
          <form onSubmit={handleSavePolicies} className="wz-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <h3 className="wz-card-title" style={{ fontSize: "1.15rem", margin: 0 }}>
                  Equipment Deposit &amp; Booking Cancellation Policies
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                  Define binding security requirements, refund thresholds, and penalty rates for KIMPC fleet bookings.
                </p>
              </div>

              <button
                type="submit"
                className="wz-btn-submit"
                disabled={policiesSaving || policiesLoading}
              >
                {policiesSaving ? "Saving..." : "Save Policies"}
              </button>
            </div>

            {/* Section 1: Security Deposit Rules */}
            <div style={{ marginBottom: "28px" }}>
              <h4 style={{ fontSize: "0.92rem", fontWeight: 800, color: "var(--wz-text, #0f172a)", marginBottom: "12px" }}>
                1. Security Deposit Requirements
              </h4>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                <div className="wz-form-group">
                  <label className="wz-form-label">Deposit Requirement Rate (%)</label>
                  <input
                    type="number"
                    className="wz-form-input"
                    value={depositPolicies.depositPercentage}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, depositPercentage: Number(e.target.value) })}
                    min={0}
                    max={100}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Recommended: 20% of total estimated rental fee</span>
                </div>

                <div className="wz-form-group">
                  <label className="wz-form-label">Payment Due Prior to Dispatch (Hours)</label>
                  <input
                    type="number"
                    className="wz-form-input"
                    value={depositPolicies.depositPaymentWindowHours}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, depositPaymentWindowHours: Number(e.target.value) })}
                    min={1}
                    max={168}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Hours before dispatch member must clear deposit</span>
                </div>

                <div className="wz-form-group">
                  <label className="wz-form-label">Deposit Refund Release Window (Days)</label>
                  <input
                    type="number"
                    className="wz-form-input"
                    value={depositPolicies.depositRefundWindowDays}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, depositRefundWindowDays: Number(e.target.value) })}
                    min={1}
                    max={30}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Days after post-return inspection to refund deposit</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={depositPolicies.inspectionCheckRequiredForDepositRefund}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, inspectionCheckRequiredForDepositRefund: e.target.checked })}
                  />
                  <span className="wz-switch-slider" />
                </label>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--wz-text, #0f172a)" }}>
                  Require Verified Machinery Inspection Checklist prior to Deposit Release
                </span>
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--wz-border, #e2e8f0)", margin: "24px 0" }} />

            {/* Section 2: Cancellation & Penalty Rules */}
            <div style={{ marginBottom: "28px" }}>
              <h4 style={{ fontSize: "0.92rem", fontWeight: 800, color: "var(--wz-text, #0f172a)", marginBottom: "12px" }}>
                2. Booking Cancellation Rules &amp; Penalties
              </h4>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                <div className="wz-form-group">
                  <label className="wz-form-label">Free Cancellation Notice Window (Hours)</label>
                  <input
                    type="number"
                    className="wz-form-input"
                    value={depositPolicies.freeCancellationHours}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, freeCancellationHours: Number(e.target.value) })}
                    min={0}
                    max={168}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Cancellations before this window receive 100% deposit refund</span>
                </div>

                <div className="wz-form-group">
                  <label className="wz-form-label">Late Cancellation Penalty Rate (%)</label>
                  <input
                    type="number"
                    className="wz-form-input"
                    value={depositPolicies.lateCancellationFeePercent}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, lateCancellationFeePercent: Number(e.target.value) })}
                    min={0}
                    max={100}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Deducted if cancelled within notice window</span>
                </div>

                <div className="wz-form-group">
                  <label className="wz-form-label">Same-Day / No-Show Penalty Rate (%)</label>
                  <input
                    type="number"
                    className="wz-form-input"
                    value={depositPolicies.sameDayCancellationFeePercent}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, sameDayCancellationFeePercent: Number(e.target.value) })}
                    min={0}
                    max={100}
                    required
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Deducted if cancelled on scheduled start date</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={depositPolicies.allowWeatherEmergencyCancellation}
                    onChange={(e) => setDepositPolicies({ ...depositPolicies, allowWeatherEmergencyCancellation: e.target.checked })}
                  />
                  <span className="wz-switch-slider" />
                </label>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--wz-text, #0f172a)" }}>
                  Exempt cancellation penalties for certified Severe Weather / Typhoon Signal Warnings
                </span>
              </div>
            </div>

            <div className="wz-form-group">
              <label className="wz-form-label">Public Policy Notice (Shown to Members on Booking)</label>
              <textarea
                className="wz-form-input"
                rows={3}
                value={depositPolicies.policyNotes}
                onChange={(e) => setDepositPolicies({ ...depositPolicies, policyNotes: e.target.value })}
                placeholder="Notice to members regarding deposit protection, return inspections, and cooperative guidelines."
              />
            </div>
          </form>
        )}

        {/* ================= TAB 2: ACCEPTED PAYMENT CHANNELS & INSTRUCTIONS ================= */}
        {activeTab === "payments" && (
          <form onSubmit={handleSavePayments} className="wz-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <h3 className="wz-card-title" style={{ fontSize: "1.15rem", margin: 0 }}>
                  Accepted Payment Channels &amp; Instructions
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                  Configure available payment methods, cooperative treasury accounts, and member checkout instructions.
                </p>
              </div>

              <button
                type="submit"
                className="wz-btn-submit"
                disabled={paymentsSaving || paymentsLoading}
              >
                {paymentsSaving ? "Saving..." : "Save Payment Methods"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px" }}>
              {(paymentData.methods || []).map((method) => (
                <div
                  key={method.id}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: `1px solid ${method.enabled ? "var(--wz-border, #cbd5e1)" : "#f1f5f9"}`,
                    background: method.enabled ? "var(--wz-card-bg, #ffffff)" : "#f8fafc",
                    opacity: method.enabled ? 1 : 0.75,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "1.1rem" }}>
                        {method.id === "gcash" ? "📱" : method.id === "maya" ? "💳" : method.id.startsWith("bank") ? "🏦" : "💵"}
                      </span>
                      <strong style={{ fontSize: "0.95rem", color: "var(--wz-text, #0f172a)" }}>{method.name}</strong>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: method.enabled ? "#166534" : "#64748b" }}>
                        {method.enabled ? "Active" : "Disabled"}
                      </span>
                      <label className="wz-switch-toggle">
                        <input
                          type="checkbox"
                          checked={method.enabled}
                          onChange={() => handleToggleMethod(method.id)}
                        />
                        <span className="wz-switch-slider" />
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                    <div>
                      <label className="wz-form-label">Account Name / Beneficiary</label>
                      <input
                        type="text"
                        className="wz-form-input"
                        value={method.accountName || ""}
                        onChange={(e) => handleUpdateMethodField(method.id, "accountName", e.target.value)}
                        placeholder="e.g. KIMPC Treasury"
                      />
                    </div>
                    <div>
                      <label className="wz-form-label">Account Number / Mobile</label>
                      <input
                        type="text"
                        className="wz-form-input"
                        value={method.accountNumber || ""}
                        onChange={(e) => handleUpdateMethodField(method.id, "accountNumber", e.target.value)}
                        placeholder="e.g. 0917-XXX-XXXX"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="wz-form-label">Payment Instructions for Member</label>
                    <input
                      type="text"
                      className="wz-form-input"
                      value={method.instructions || ""}
                      onChange={(e) => handleUpdateMethodField(method.id, "instructions", e.target.value)}
                      placeholder="Step-by-step instructions shown to member during booking checkout."
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="wz-form-group">
              <label className="wz-form-label">General Checkout Instructions &amp; Receipt Verification Guidelines</label>
              <textarea
                className="wz-form-input"
                rows={3}
                value={paymentData.generalInstructions}
                onChange={(e) => setPaymentData({ ...paymentData, generalInstructions: e.target.value })}
                placeholder="General guidelines for reference number submission and cooperative clearing."
              />
            </div>
          </form>
        )}

        {/* ================= TAB 3: REVIEW REFUNDS & PAYMENT CORRECTIONS ================= */}
        {activeTab === "refunds" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px" }}>
            {/* Left Column: Refunds & Corrections Ledger */}
            <div className="wz-table-card">
              <div className="wz-table-toolbar">
                <div>
                  <h3 className="wz-table-title" style={{ margin: 0 }}>Refunds &amp; Corrections Ledger</h3>
                  <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    Audit record of deposit returns, authorized adjustments, and fee waivers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchRefunds}
                  style={{
                    padding: "6px 12px",
                    background: "var(--wz-card-bg, #ffffff)",
                    border: "1px solid var(--wz-border, #cbd5e1)",
                    borderRadius: "8px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                >
                  Refresh
                </button>
              </div>

              <div className="wz-table-responsive">
                <table className="wz-table">
                  <thead>
                    <tr>
                      <th>Ref ID / Time</th>
                      <th>Member / Account</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Authorized Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundsLoading ? (
                      <tr>
                        <td colSpan="5" style={{ padding: "28px", textAlign: "center", color: "#64748b" }}>
                          Loading refund records...
                        </td>
                      </tr>
                    ) : (refundsData.transactions || []).length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ padding: "28px", textAlign: "center", color: "#64748b" }}>
                          No refund or payment correction transactions recorded.
                        </td>
                      </tr>
                    ) : (
                      refundsData.transactions.map((tx) => (
                        <tr key={tx._id || tx.txId}>
                          <td>
                            <div style={{ fontFamily: "monospace", color: "#0f766e", fontWeight: 700, fontSize: "0.82rem" }}>
                              {tx.txId}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                              {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "Recent"}
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, fontSize: "0.84rem" }}>{tx.farmer}</td>
                          <td>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "8px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: "#fef3c7",
                                color: "#b45309",
                              }}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, color: "#166534", fontSize: "0.88rem" }}>
                            ₱{Number(tx.amount).toLocaleString()}
                          </td>
                          <td style={{ fontSize: "0.78rem", color: "#475569" }}>
                            {tx.notes || tx.equipment || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Record Authorized Payment Correction Form */}
            <div className="wz-card" style={{ padding: "24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <h3 className="wz-card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                  Record Authorized Payment Correction
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" }}>
                  Record a formal balance adjustment, fee waiver, or manual refund. A detailed justification reason is mandatory.
                </p>
              </div>

              <form onSubmit={handleRecordCorrection}>
                <div className="wz-form-group">
                  <label className="wz-form-label">Member / Account Name</label>
                  <input
                    type="text"
                    className="wz-form-input"
                    value={correctionForm.farmer}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, farmer: e.target.value })}
                    placeholder="Enter member or farmer name"
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div className="wz-form-group">
                    <label className="wz-form-label">Adjustment Amount (₱)</label>
                    <input
                      type="number"
                      className="wz-form-input"
                      value={correctionForm.amount}
                      onChange={(e) => setCorrectionForm({ ...correctionForm, amount: e.target.value })}
                      placeholder="e.g. 1500"
                      min={1}
                      required
                    />
                  </div>

                  <div className="wz-form-group">
                    <label className="wz-form-label">Correction Type</label>
                    <select
                      className="wz-form-input"
                      value={correctionForm.type}
                      onChange={(e) => setCorrectionForm({ ...correctionForm, type: e.target.value })}
                    >
                      <option value="Payment Correction">Payment Correction</option>
                      <option value="Deposit Refund">Deposit Refund</option>
                      <option value="Credit Adjustment">Credit Adjustment</option>
                      <option value="Fee Waiver">Fee Waiver</option>
                    </select>
                  </div>
                </div>

                <div className="wz-form-group">
                  <label className="wz-form-label">Settlement Channel</label>
                  <select
                    className="wz-form-input"
                    value={correctionForm.paymentMethod}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, paymentMethod: e.target.value })}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash / Office Cashier</option>
                    <option value="Co-op Credit">Co-op Credit</option>
                  </select>
                </div>

                <div className="wz-form-group">
                  <label className="wz-form-label">
                    Mandatory Reason / Justification <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <textarea
                    className="wz-form-input"
                    rows={4}
                    value={correctionForm.reason}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                    placeholder="Provide specific reason (e.g. Verified machinery mechanical fault after 2 hours operation; late cancellation fee waived due to documented typhoon warning)."
                    required
                  />
                  <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "3px" }}>
                    * Logged permanently in KIMPC audit trail with your admin identity.
                  </div>
                </div>

                <button
                  type="submit"
                  className="wz-btn-submit"
                  style={{ width: "100%", padding: "10px" }}
                  disabled={correctionSubmitting}
                >
                  {correctionSubmitting ? "Recording Correction..." : "Authorize & Record Correction"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

