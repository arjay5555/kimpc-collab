import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { formatRentalPeriod, getApplicationProgress, getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";

const filters = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
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
    if (filter === "pending") return status === "pending";
    if (filter === "approved") return ["approved", "checked-out", "returned"].includes(status);
    if (filter === "rejected") return ["rejected", "cancelled"].includes(status);
    return true;
  }), [applications, filter]);

  const cancelApplication = async (application) => {
    const id = application._id || application.id;
    if (!id || !window.confirm(`Cancel your booking request for ${application.equipment}?`)) return;

    setCancellingId(id);
    setActionError("");
    const response = await api(`/applications/${encodeURIComponent(id)}`, { method: "DELETE" });
    setCancellingId("");
    if (!response.ok) {
      setActionError(response.data?.error || "Could not cancel this booking request.");
      return;
    }
    const updatedApplication = response.data?.application;
    if (updatedApplication) {
      setApplications((current) => current.map((item) => (item._id || item.id) === id ? updatedApplication : item));
    }
  };

  return (
    <div className="member-page">
      <header className="member-page-heading">
        <div>
          <p className="member-eyebrow">MEMBER PORTAL / BOOKINGS</p>
          <h1>Your applications</h1>
          <p className="member-muted">Track requests and review their current status.</p>
        </div>
        <Link className="member-button member-button-primary" to="/member/book">Book equipment <span aria-hidden="true">→</span></Link>
      </header>

      <div className="member-filter-tabs" role="tablist" aria-label="Filter applications">
        {filters.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={filter === item.key} className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>
            {item.label}<span>{item.key === "all" ? applications.length : applications.filter((app) => {
              const status = (app.status || "Pending").toLowerCase();
              if (item.key === "pending") return status === "pending";
              if (item.key === "approved") return ["approved", "checked-out", "returned"].includes(status);
              return ["rejected", "cancelled"].includes(status);
            }).length}</span>
          </button>
        ))}
      </div>

      {actionError && <p className="member-form-feedback" role="alert">{actionError}</p>}
      {loading ? (
        <div className="member-app-table"><div className="member-table-skeleton" /><div className="member-table-skeleton" /><div className="member-table-skeleton" /></div>
      ) : error ? (
        <div className="member-empty-state" role="alert"><strong>Couldn’t load your applications</strong><p>{error}</p><button className="member-button member-button-outline" type="button" onClick={fetchApplications}>Try again</button></div>
      ) : visibleApplications.length === 0 ? (
        <div className="member-empty-state"><span className="member-empty-icon" aria-hidden="true">▧</span><strong>No applications in this view</strong><p>Submitted booking requests will appear here with their latest status.</p><Link className="member-button member-button-primary" to="/member/book">Browse equipment</Link></div>
      ) : (
        <div className="member-app-table">
          <div className="member-app-table-head"><span>Equipment</span><span>Rental period</span><span>Submitted</span><span>Status</span><span /></div>
          {visibleApplications.map((application) => (
            <article className="member-app-row" key={application._id || application.id}>
              <div className="member-app-equipment"><span className="member-activity-icon" aria-hidden="true">▰</span><strong>{application.equipment}</strong></div>
              <span>{formatRentalPeriod(application)}</span>
              <span className="member-muted">{application.createdAt ? new Date(application.createdAt).toLocaleDateString() : "Recently"}</span>
              <span className={`member-status member-status-${getApplicationProgress(application).tone}`}>{application.status || "Pending"}</span>
              <div className="member-application-actions">
                <button className="member-text-button" type="button" onClick={() => setSelected(application)}>Details</button>
                {(application.status || "Pending").toLowerCase() === "pending" && <button className="member-text-button member-cancel-button" type="button" disabled={cancellingId === (application._id || application.id)} onClick={() => cancelApplication(application)}>{cancellingId === (application._id || application.id) ? "Cancelling…" : "Cancel"}</button>}
              </div>
              {(application.status || "").toLowerCase() === "rejected" && application.managerRemarks && <p className="member-rejection-note"><strong>Reason:</strong> {application.managerRemarks}</p>}
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div className="member-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="member-modal" role="dialog" aria-modal="true" aria-labelledby="application-detail-title">
            <button className="member-modal-close" type="button" aria-label="Close details" onClick={() => setSelected(null)}>×</button>
            <p className="member-eyebrow">APPLICATION DETAILS</p>
            <h2 id="application-detail-title">{selected.equipment}</h2>
            <p className="member-modal-status"><span className={`member-status member-status-${getApplicationProgress(selected).tone}`}>{selected.status || "Pending"}</span></p>
            <dl className="member-detail-list">
              <div><dt>Rental period</dt><dd>{formatRentalPeriod(selected)}</dd></div>
              <div><dt>Submitted</dt><dd>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "Recently"}</dd></div>
              {selected.farmLocation && <div><dt>Farm location</dt><dd>{selected.farmLocation}</dd></div>}
              {selected.managerRemarks && <div><dt>Manager remarks</dt><dd>{selected.managerRemarks}</dd></div>}
            </dl>
            <button className="member-button member-button-outline" type="button" onClick={() => setSelected(null)}>Close</button>
          </section>
        </div>
      )}
    </div>
  );
}
