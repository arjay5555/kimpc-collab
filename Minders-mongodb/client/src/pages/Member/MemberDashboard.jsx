import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { formatRentalPeriod, getApplicationProgress, getApplicationsUrl, unwrapListResponse } from "../../services/memberPortal";

const rentalGroups = [
  { key: "active", title: "Active rentals", icon: "↗", matches: (app) => ["In-use"].includes(getApplicationProgress(app).label) },
  { key: "upcoming", title: "Upcoming rentals", icon: "◷", matches: (app) => getApplicationProgress(app).label === "Scheduled" },
  { key: "past", title: "Past rentals", icon: "✓", matches: (app) => ["Completed", "Rejected", "Cancelled"].includes(getApplicationProgress(app).label) },
];

function StatusBadge({ application }) {
  const progress = getApplicationProgress(application);
  return <span className={`member-status member-status-${progress.tone}`}>{progress.label}</span>;
}

export default function MemberDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [flipped, setFlipped] = useState({});

  const fetchApplications = useCallback(async () => {
    const response = await api(getApplicationsUrl(user?.email));
    if (response.ok) {
      setApplications(unwrapListResponse(response));
      setLoadError("");
    } else {
      setLoadError(response.data?.error || "Could not load your rental activity.");
    }
    setLoading(false);
  }, [user?.email]);

  useEffect(() => {
    fetchApplications();
    const interval = window.setInterval(fetchApplications, 12000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  const rentals = useMemo(() => rentalGroups.map((group) => ({
    ...group,
    items: applications.filter(group.matches).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))),
  })), [applications]);

  const pendingCount = applications.filter((app) => getApplicationProgress(app).label === "Pending Approval").length;

  return (
    <div className="member-page">
      <header className="member-page-heading">
        <div>
          <p className="member-eyebrow">MEMBER PORTAL</p>
          <h1>Welcome back, {user?.fullName?.split(/\s+/)[0] || "Member"}</h1>
          <p className="member-muted">Your equipment rentals and booking requests at a glance.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="member-button member-button-outline"
            onClick={handleLogout}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#dc2626", borderColor: "#fca5a5" }}
            title="Log out of Member Portal"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Log Out</span>
          </button>
          <Link className="member-button member-button-primary" to="/member/book">Book equipment <span aria-hidden="true">→</span></Link>
        </div>
      </header>

      <section className="member-section">
        <div className="member-section-heading">
          <div><p className="member-eyebrow">YOUR MACHINERY</p><h2>Rental overview</h2></div>
          <span className="member-live-indicator"><i /> Updates every 12 seconds</span>
        </div>
        {loading ? (
          <div className="member-rental-grid" aria-label="Loading rentals">
            {rentalGroups.map((group) => <div className="member-rental-skeleton" key={group.key}><span /><span /><span /></div>)}
          </div>
        ) : loadError ? (
          <div className="member-empty-state" role="alert"><strong>Couldn’t load your rentals</strong><p>{loadError}</p><button className="member-button member-button-outline" onClick={fetchApplications}>Try again</button></div>
        ) : (
          <div className="member-rental-grid">
            {rentals.map((group) => {
              const application = group.items[0];
              const isFlipped = Boolean(flipped[group.key]);
              return (
                <article className={`member-flip-card${isFlipped ? " is-flipped" : ""}`} key={group.key}>
                  <div className="member-flip-inner">
                    <div className="member-flip-face member-flip-front">
                      <button className="member-flip-trigger" type="button" aria-label={`Show details for ${group.title}`} aria-pressed={isFlipped} onClick={() => setFlipped((current) => ({ ...current, [group.key]: !current[group.key] }))}>
                        <span className="member-flip-icon" aria-hidden="true">{group.icon}</span>
                        <span className="member-flip-title">{group.title}</span>
                        <strong className="member-flip-count">{group.items.length}</strong>
                        <span className="member-flip-hint">{application ? "Tap to view latest rental" : "No rentals yet"}</span>
                      </button>
                    </div>
                    <div className="member-flip-face member-flip-back">
                      <button className="member-flip-close" type="button" aria-label="Show rental count" onClick={() => setFlipped((current) => ({ ...current, [group.key]: false }))}>×</button>
                      {application ? (
                        <>
                          <p className="member-eyebrow">{group.title}</p>
                          <h3>{application.equipment}</h3>
                          <p className="member-muted">{formatRentalPeriod(application)}</p>
                          <StatusBadge application={application} />
                          <Link className="member-inline-link" to="/applications">View details →</Link>
                        </>
                      ) : (
                        <><p className="member-muted">When you book equipment, it will appear here.</p><Link className="member-inline-link" to="/member/book">Browse equipment →</Link></>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="member-section">
        <div className="member-section-heading">
          <div><p className="member-eyebrow">BOOKING REQUESTS</p><h2>Latest activity</h2></div>
          <Link className="member-inline-link" to="/applications">View all applications →</Link>
        </div>
        {!loading && !loadError && applications.length === 0 ? (
          <div className="member-empty-state"><span className="member-empty-icon" aria-hidden="true">▧</span><strong>No applications yet</strong><p>Browse the fleet and submit your first equipment request.</p><Link className="member-button member-button-primary" to="/member/book">Explore equipment</Link></div>
        ) : (
          <div className="member-activity-list">
            {loading ? [0, 1, 2].map((id) => <div className="member-activity-skeleton" key={id} />) : applications.slice(0, 5).map((application) => (
              <article className="member-activity-row" key={application._id || application.id}>
                <div className="member-activity-icon" aria-hidden="true">▰</div>
                <div className="member-activity-copy"><strong>{application.equipment}</strong><span>{formatRentalPeriod(application)}</span></div>
                <StatusBadge application={application} />
              </article>
            ))}
          </div>
        )}
        {pendingCount > 0 && <p className="member-pending-note">{pendingCount} request{pendingCount === 1 ? "" : "s"} awaiting manager approval.</p>}
      </section>
    </div>
  );
}
