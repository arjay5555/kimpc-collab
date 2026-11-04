import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { formatRentalPeriod, getApplicationProgress, getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";
import MemberTopbar from "../../components/MemberTopbar";

const filters = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "cancellation", label: "Cancellation Pending" },
  { key: "rejected", label: "Rejected / Cancelled" },
];

export default function Applications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [cancellingId, setCancellingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Editing state for Pending bookings
  const [editingApp, setEditingApp] = useState(null);
  const [editForm, setEditForm] = useState({
    farmLocation: "",
    startDate: "",
    endDate: "",
    bookingType: "daily",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Cancellation Request state for Approved bookings
  const [cancellationRequestApp, setCancellationRequestApp] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);

  const fetchApplications = useCallback(async () => {
    const response = await api(getApplicationsUrl(user?.email));
    if (response.ok) {
      setApplications(unwrapListResponse(response));
      setError("");
    } else {
      setError(response.data?.error || "Could not load your applications.");
    }
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    fetchApplications();
    const interval = window.setInterval(fetchApplications, 12000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  const visibleApplications = useMemo(() => applications.filter((application) => {
    const status = (application.status || "Pending").toLowerCase();
    const isCancelPending = status === "cancellation requested" || application.cancellationRequested;
    if (filter === "pending") return status === "pending" && !isCancelPending;
    if (filter === "approved") return ["approved", "checked-out", "returned"].includes(status) && !isCancelPending;
    if (filter === "cancellation") return isCancelPending;
    if (filter === "rejected") return ["rejected", "cancelled"].includes(status);
    return true;
  }), [applications, filter]);

  // Direct cancel for Pending bookings
  const cancelPendingApplication = async (application) => {
    const id = application._id || application.id;
    if (!id || !window.confirm(`Cancel your pending booking request for ${application.equipment}?`)) return;

    setCancellingId(id);
    setActionError("");
    setActionSuccess("");
    const response = await api(`/applications/${encodeURIComponent(id)}`, { method: "DELETE" });
    setCancellingId("");
    if (!response.ok) {
      setActionError(response.data?.error || "Could not cancel this booking request.");
      return;
    }
    setActionSuccess("Booking cancelled successfully.");
    const updatedApplication = response.data?.application;
    if (updatedApplication) {
      setApplications((current) => current.map((item) => (item._id || item.id) === id ? updatedApplication : item));
    } else {
      fetchApplications();
    }
  };

  // Open Edit Modal for Pending booking
  const handleOpenEdit = (application) => {
    const status = (application.status || "Pending").toLowerCase();
    if (status !== "pending") {
      setActionError("Only pending bookings can be edited. Approved bookings cannot be edited.");
      return;
    }
    setEditingApp(application);
    setEditForm({
      farmLocation: application.farmLocation || "",
      startDate: application.startDate || "",
      endDate: application.endDate || "",
      bookingType: application.bookingType || "daily",
    });
    setActionError("");
    setActionSuccess("");
  };

  // Submit Edit for Pending booking
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingApp) return;
    const id = editingApp._id || editingApp.id;

    if (!editForm.startDate || !editForm.endDate) {
      setActionError("Start date and end date are required.");
      return;
    }
    if (editForm.startDate > editForm.endDate) {
      setActionError("End date must be on or after start date.");
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
        bookingType: editForm.bookingType,
      },
    });

    setIsSavingEdit(false);
    if (!response.ok) {
      setActionError(response.data?.error || "Failed to update booking.");
    } else {
      setActionSuccess("Booking updated successfully.");
      setEditingApp(null);
      fetchApplications();
    }
  };

  // Open Cancellation Request Modal for Approved booking
  const handleOpenCancellationRequest = (application) => {
    setCancellationRequestApp(application);
    setCancellationReason("");
    setActionError("");
    setActionSuccess("");
  };

  // Submit Cancellation Request for Approved booking
  const handleSubmitCancellationRequest = async (e) => {
    e.preventDefault();
    if (!cancellationRequestApp) return;
    const id = cancellationRequestApp._id || cancellationRequestApp.id;

    if (!cancellationReason.trim()) {
      setActionError("Please provide a reason for cancelling this approved booking.");
      return;
    }

    setIsSubmittingCancellation(true);
    setActionError("");
    setActionSuccess("");

    const response = await api(`/applications/${encodeURIComponent(id)}/request-cancellation`, {
      method: "POST",
      body: { reason: cancellationReason.trim() },
    });

    setIsSubmittingCancellation(false);
    if (!response.ok) {
      setActionError(response.data?.error || "Failed to submit cancellation request.");
    } else {
      setActionSuccess("Cancellation request submitted to manager. Awaiting manager approval.");
      setCancellationRequestApp(null);
      fetchApplications();
    }
  };

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
      <MemberTopbar
        title="Your Applications"
        subtitle="Track booking requests, edit pending details, or request cancellations."
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div className="member-filter-tabs" role="tablist" aria-label="Filter applications" style={{ margin: 0 }}>
          {filters.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={filter === item.key} className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>
              {item.label}<span>{item.key === "all" ? applications.length : applications.filter((app) => {
                const status = (app.status || "Pending").toLowerCase();
                const isCancelPending = status === "cancellation requested" || app.cancellationRequested;
                if (item.key === "pending") return status === "pending" && !isCancelPending;
                if (item.key === "approved") return ["approved", "checked-out", "returned"].includes(status) && !isCancelPending;
                if (item.key === "cancellation") return isCancelPending;
                return ["rejected", "cancelled"].includes(status);
              }).length}</span>
            </button>
          ))}
        </div>
        <Link className="wz-btn wz-btn-primary" to="/member/book" style={{ borderRadius: "8px", textDecoration: "none", padding: "8px 18px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span>Book equipment</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {actionError && <p className="member-form-feedback" role="alert" style={{ color: "#dc2626", background: "#fef2f2", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fecdd3" }}>{actionError}</p>}
      {actionSuccess && <p className="member-form-feedback" role="status" style={{ color: "#166534", background: "#f0fdf4", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>{actionSuccess}</p>}

      {loading ? (
        <div className="member-app-table"><div className="member-table-skeleton" /><div className="member-table-skeleton" /><div className="member-table-skeleton" /></div>
      ) : error ? (
        <div className="member-empty-state" role="alert"><strong>Couldn’t load your applications</strong><p>{error}</p><button className="member-button member-button-outline" type="button" onClick={fetchApplications}>Try again</button></div>
      ) : visibleApplications.length === 0 ? (
        <div className="member-empty-state"><span className="member-empty-icon" aria-hidden="true">▧</span><strong>No applications in this view</strong><p>Submitted booking requests will appear here with their latest status.</p><Link className="member-button member-button-primary" to="/member/book">Browse equipment</Link></div>
      ) : (
        <div className="member-app-table">
          <div className="member-app-table-head"><span>Equipment</span><span>Rental period</span><span>Submitted</span><span>Status</span><span /></div>
          {visibleApplications.map((application) => {
            const statusLower = (application.status || "Pending").toLowerCase();
            const isPending = statusLower === "pending";
            const isApproved = statusLower === "approved";
            const isCancellationRequested = statusLower === "cancellation requested" || application.cancellationRequested;

            return (
              <article className="member-app-row" key={application._id || application.id}>
                <div className="member-app-equipment"><span className="member-activity-icon" aria-hidden="true">▰</span><strong>{application.equipment}</strong></div>
                <span>{formatRentalPeriod(application)}</span>
                <span className="member-muted">{application.createdAt ? new Date(application.createdAt).toLocaleDateString() : "Recently"}</span>
                <span className={`member-status member-status-${getApplicationProgress(application).tone}`}>
                  {isCancellationRequested ? "Cancellation Pending" : application.status || "Pending"}
                </span>

                <div className="member-application-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button className="member-text-button" type="button" onClick={() => setSelected(application)}>Details</button>
                  
                  {/* Pending: Edit details and Direct Cancel */}
                  {isPending && !isCancellationRequested && (
                    <>
                      <button
                        className="member-text-button"
                        type="button"
                        onClick={() => handleOpenEdit(application)}
                        title="Edit farm location and dates"
                      >
                        Edit
                      </button>
                      <button
                        className="member-text-button member-cancel-button"
                        type="button"
                        disabled={cancellingId === (application._id || application.id)}
                        onClick={() => cancelPendingApplication(application)}
                      >
                        {cancellingId === (application._id || application.id) ? "Cancelling…" : "Cancel"}
                      </button>
                    </>
                  )}

                  {/* Approved: Request Cancellation (Manager review required) */}
                  {isApproved && !isCancellationRequested && (
                    <button
                      className="member-text-button"
                      type="button"
                      style={{ color: "#d97706" }}
                      onClick={() => handleOpenCancellationRequest(application)}
                      title="Request booking cancellation from cooperative manager"
                    >
                      Request Cancel
                    </button>
                  )}

                  {/* Cancellation Pending */}
                  {isCancellationRequested && (
                    <span style={{ fontSize: "0.76rem", color: "#b45309", fontWeight: 600 }}>
                      Pending Review
                    </span>
                  )}
                </div>

                {statusLower === "rejected" && application.managerRemarks && (
                  <p className="member-rejection-note"><strong>Reason:</strong> {application.managerRemarks}</p>
                )}
                {isCancellationRequested && application.cancellationReason && (
                  <p className="member-rejection-note" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                    <strong>Cancellation Requested:</strong> {application.cancellationReason} (Awaiting Manager Review)
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* ================= Details Modal ================= */}
      {selected && (
        <div className="member-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="application-detail-title">
            <button className="member-modal-close" type="button" aria-label="Close details" onClick={() => setSelected(null)}>×</button>
            <p className="member-eyebrow">APPLICATION DETAILS</p>
            <h2 id="application-detail-title">{selected.equipment}</h2>
            <p className="member-modal-status">
              <span className={`member-status member-status-${getApplicationProgress(selected).tone}`}>
                {(selected.status || "Pending").toLowerCase() === "cancellation requested" || selected.cancellationRequested
                  ? "Cancellation Pending"
                  : selected.status || "Pending"}
              </span>
            </p>
            <dl className="member-detail-list">
              <div><dt>Rental period</dt><dd>{formatRentalPeriod(selected)}</dd></div>
              <div><dt>Submitted</dt><dd>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "Recently"}</dd></div>
              <div><dt>Farm location</dt><dd>{selected.farmLocation || "Not specified"}</dd></div>
              <div><dt>Booking Type</dt><dd style={{ textTransform: "capitalize" }}>{selected.bookingType || "Daily"}</dd></div>
              {selected.cancellationReason && (
                <div><dt>Cancellation Reason</dt><dd style={{ color: "#b45309" }}>{selected.cancellationReason}</dd></div>
              )}
              {selected.managerRemarks && <div><dt>Manager remarks</dt><dd>{selected.managerRemarks}</dd></div>}
            </dl>

            <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {(selected.status || "Pending").toLowerCase() === "pending" && !selected.cancellationRequested && (
                <button
                  className="member-button member-button-primary"
                  type="button"
                  onClick={() => {
                    const app = selected;
                    setSelected(null);
                    handleOpenEdit(app);
                  }}
                >
                  Edit Booking Details
                </button>
              )}
              <button className="member-button member-button-outline" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
          </section>
        </div>
      )}

      {/* ================= Edit Pending Booking Modal ================= */}
      {editingApp && (
        <div className="member-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingApp(null); }}>
          <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="edit-booking-title">
            <button className="member-modal-close" type="button" aria-label="Close edit" onClick={() => setEditingApp(null)}>×</button>
            <p className="member-eyebrow">EDIT PENDING BOOKING</p>
            <h2 id="edit-booking-title">{editingApp.equipment}</h2>
            <p className="member-muted" style={{ fontSize: "0.84rem", marginBottom: "16px" }}>
              You can update your farm location and rental dates while this booking is still Pending. Once approved by the manager, changes are locked.
            </p>

            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px" }}>
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
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px" }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    min={editForm.startDate}
                    value={editForm.endDate}
                    onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px" }}>
                  Booking Type
                </label>
                <select
                  value={editForm.bookingType}
                  onChange={(e) => setEditForm({ ...editForm, bookingType: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                >
                  <option value="daily">Daily Rental</option>
                  <option value="hourly">Hourly Rental</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="member-button member-button-outline"
                  onClick={() => setEditingApp(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="member-button member-button-primary"
                >
                  {isSavingEdit ? "Saving Changes…" : "Save Changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ================= Request Cancellation Modal (for Approved bookings) ================= */}
      {cancellationRequestApp && (
        <div className="member-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCancellationRequestApp(null); }}>
          <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title">
            <button className="member-modal-close" type="button" aria-label="Close request" onClick={() => setCancellationRequestApp(null)}>×</button>
            <p className="member-eyebrow" style={{ color: "#d97706" }}>REQUEST CANCELLATION</p>
            <h2 id="cancel-booking-title">{cancellationRequestApp.equipment}</h2>
            
            <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "0.84rem", color: "#92400e" }}>
              ⚠️ <strong>Manager Approval Required:</strong> Because this booking was already approved by cooperative management, your cancellation request will be submitted to the manager to review and grant.
            </div>

            <form onSubmit={handleSubmitCancellationRequest}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", marginBottom: "6px" }}>
                  Reason for Cancellation
                </label>
                <textarea
                  required
                  rows="3"
                  maxLength={500}
                  placeholder="Please describe why you need to cancel this approved booking (e.g. weather delay, field condition, change of harvest plan)..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="member-button member-button-outline"
                  onClick={() => setCancellationRequestApp(null)}
                >
                  Keep Booking
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCancellation}
                  className="member-button"
                  style={{ background: "#dc2626", color: "#ffffff", border: "none" }}
                >
                  {isSubmittingCancellation ? "Submitting Request…" : "Submit Cancellation Request"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
