import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { formatRentalPeriod, getApplicationProgress, getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";
import MemberTopbar from "../../components/MemberTopbar";

const temporaryCompletedBookings = [
  { id: "sample-1", equipment: "Ag Leader Precision Boom Sprayer", startDate: "2026-10-25", endDate: "2026-10-26", status: "Returned" },
  { id: "sample-2", equipment: "John Deere 5075E Tractor", startDate: "2026-10-18", endDate: "2026-10-19", status: "Returned" },
  { id: "sample-3", equipment: "Kubota DC-70 Combine Harvester", startDate: "2026-10-11", endDate: "2026-10-12", status: "Returned" },
  { id: "sample-4", equipment: "Rice Transplanter", startDate: "2026-10-04", endDate: "2026-10-05", status: "Returned" },
  { id: "sample-5", equipment: "Four-Wheel Drive Farm Tractor", startDate: "2026-09-27", endDate: "2026-09-28", status: "Returned" },
];

function isHistoryBooking(application) {
  return ["Completed", "Rejected", "Cancelled"].includes(getApplicationProgress(application).label);
}

export default function BookingHistory() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchApplications = useCallback(async () => {
    const response = await api(getApplicationsUrl(user?.email));
    if (response.ok) {
      setApplications(unwrapListResponse(response));
      setError("");
    } else {
      setError(response.data?.error || "Could not load your booking history.");
    }
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    fetchApplications();
    const interval = window.setInterval(fetchApplications, 12000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  const history = useMemo(() => applications.filter(isHistoryBooking), [applications]);

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
      <MemberTopbar
        title="Booking History"
        subtitle="Review equipment bookings that were completed, rejected, or cancelled."
      />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <Link className="wz-btn wz-btn-primary" to="/member/book" style={{ borderRadius: "8px", textDecoration: "none", padding: "8px 18px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span>Book equipment</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {error && !loading ? (
        <div className="member-empty-state" role="alert">
          <strong>Couldn’t load your booking history</strong>
          <p>{error}</p>
          <button className="member-button member-button-outline" type="button" onClick={fetchApplications}>Try again</button>
        </div>
      ) : (
        <>
          <section className="member-section">
            <div className="member-section-heading">
              <div><p className="member-eyebrow">YOUR BOOKINGS</p><h2>Past equipment bookings</h2></div>
              {!loading && <span className="member-live-indicator">{history.length} saved {history.length === 1 ? "booking" : "bookings"}</span>}
            </div>
            {loading ? (
              <div className="member-app-table" aria-label="Loading booking history"><div className="member-table-skeleton" /></div>
            ) : history.length === 0 ? (
              <div className="member-empty-state">
                <strong>No past bookings yet</strong>
                <p>Completed, rejected, and cancelled equipment requests will appear here.</p>
              </div>
            ) : (
              <div className="member-app-table">
                <div className="member-app-table-head"><span>Equipment</span><span>Rental period</span><span>Submitted</span><span>Status</span><span /></div>
                {history.map((application) => (
                  <article className="member-app-row" key={application._id || application.id}>
                    <div className="member-app-equipment"><span className="member-activity-icon" aria-hidden="true">▰</span><strong>{application.equipment}</strong></div>
                    <span>{formatRentalPeriod(application)}</span>
                    <span className="member-muted">{application.createdAt ? new Date(application.createdAt).toLocaleDateString() : "Recently"}</span>
                    <span className={`member-status member-status-${getApplicationProgress(application).tone}`}>{getApplicationProgress(application).label}</span>
                    <span>{application.managerRemarks ? `Note: ${application.managerRemarks}` : ""}</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="member-section">
            <div className="member-section-heading">
              <div><p className="member-eyebrow">PREVIEW ONLY</p><h2>Temporary completed bookings</h2></div>
            </div>
            <p className="member-muted">These sample entries are for preview only and are not saved to your account.</p>
            <div className="member-app-table">
              <div className="member-app-table-head"><span>Equipment</span><span>Rental period</span><span>Submitted</span><span>Status</span><span>Record</span></div>
              {temporaryCompletedBookings.map((booking) => (
                <article className="member-app-row" key={booking.id}>
                  <div className="member-app-equipment"><span className="member-activity-icon" aria-hidden="true">▰</span><strong>{booking.equipment}</strong></div>
                  <span>{formatRentalPeriod(booking)}</span>
                  <span className="member-muted">Sample</span>
                  <span className={`member-status member-status-${getApplicationProgress(booking).tone}`}>Completed</span>
                  <span>Temporary</span>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
