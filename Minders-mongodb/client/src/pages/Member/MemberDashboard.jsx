import React, { useState, useEffect } from "react";
import Header from "../../components/Header";
import { useAuth } from "../../context/AuthContext";
import { api, getSignedInEmail } from "../../services/api";

const EQUIPMENT_OPTIONS = [
  "Precision Seeder",
  "Round Baler",
  "Irrigation System",
  "Combine Harvester",
  "Field Tractor",
  "Co-op Attachments",
];

export default function MemberDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("active");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAvailableEquip, setShowAvailableEquip] = useState(false);

  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookEquipment, setBookEquipment] = useState("");
  const [bookStart, setBookStart] = useState("");
  const [bookEnd, setBookEnd] = useState("");
  const [bookingFeedback, setBookingFeedback] = useState({ message: "", isError: false });
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    address2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  });
  const [profileFeedback, setProfileFeedback] = useState({ message: "", isError: false });

  const fetchApplications = async () => {
    const res = await api("/applications");
    if (res.ok && Array.isArray(res.data)) {
      setApplications(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchApplications();
    const interval = setInterval(fetchApplications, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const email = getSignedInEmail();
    if (email) {
      api(`/accounts/${encodeURIComponent(email)}`).then((res) => {
        if (res.ok && res.data) {
          setProfileData({
            fullName: res.data.fullName || "",
            email: res.data.email || "",
            phone: res.data.phone || "",
            address: res.data.address || "",
            address2: res.data.address2 || "",
            city: res.data.city || "",
            region: res.data.region || "",
            postalCode: res.data.postalCode || "",
            country: res.data.country || "",
          });
        }
      });
    }
  }, []);

  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!bookEquipment || !bookStart || !bookEnd) {
      setBookingFeedback({ message: "Please fill in all fields.", isError: true });
      return;
    }

    setIsSubmittingBooking(true);
    setBookingFeedback({ message: "Submitting booking...", isError: false });

    const email = getSignedInEmail();
    const res = await api("/applications", {
      method: "POST",
      body: {
        applicantEmail: email,
        applicantName: user?.fullName || email,
        equipment: bookEquipment,
        startDate: bookStart,
        endDate: bookEnd,
      },
    });

    setIsSubmittingBooking(false);

    if (!res.ok) {
      setBookingFeedback({ message: res.data.error || "Could not create booking.", isError: true });
      return;
    }

    setBookingFeedback({ message: "Booking requested successfully!", isError: false });
    setTimeout(() => {
      setShowBookingModal(false);
      setBookEquipment("");
      setBookStart("");
      setBookEnd("");
      setBookingFeedback({ message: "", isError: false });
      fetchApplications();
      setActiveTab("pending");
    }, 1000);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileFeedback({ message: "Updating profile...", isError: false });

    const email = getSignedInEmail();
    const res = await api(`/accounts/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: profileData,
    });

    if (!res.ok) {
      setProfileFeedback({ message: res.data.error || "Could not update profile.", isError: true });
      return;
    }

    setProfileFeedback({ message: "Profile updated successfully!", isError: false });
    setTimeout(() => {
      setShowProfileModal(false);
      setProfileFeedback({ message: "", isError: false });
    }, 1200);
  };

  const pendingCount = applications.filter((a) => (a.status || "").toLowerCase() === "pending").length;
  const activeCount = applications.filter((a) => (a.status || "").toLowerCase() === "approved" || (a.status || "").toLowerCase() === "active").length;
  const upcomingCount = applications.filter((a) => (a.status || "").toLowerCase() === "upcoming").length;
  const pastCount = applications.filter((a) => (a.status || "").toLowerCase() === "completed" || (a.status || "").toLowerCase() === "rejected" || (a.status || "").toLowerCase() === "cancelled").length;

  const filteredApps = applications.filter((app) => {
    const s = (app.status || "").toLowerCase();
    if (activeTab === "pending") return s === "pending";
    if (activeTab === "active") return s === "approved" || s === "active";
    if (activeTab === "upcoming") return s === "upcoming";
    if (activeTab === "past") return s === "completed" || s === "rejected" || s === "cancelled";
    return true;
  });

  return (
    <div>
      <Header activePage="member" />

      <main className="app-shell member-shell">
        <section className="page-intro">
          <div>
            <p className="eyebrow">MEMBER PORTAL / GOOD MORNING</p>
            <h1>Let's get the next job moving.</h1>
            <p className="muted">Your equipment schedule and cooperative activity, all in one place.</p>
          </div>
          <div className="page-intro-actions">
            <button className="button button-primary" onClick={() => setShowBookingModal(true)} type="button">
              Book equipment <span aria-hidden="true">&#8594;</span>
            </button>
            <button className="button button-outline" onClick={() => setShowProfileModal(true)} type="button">
              Edit Profile
            </button>
          </div>
        </section>

        <section className="dashboard-section" id="dashboard">
          <div className="section-heading dashboard-heading">
            <div>
              <p className="eyebrow">YOUR ACTIVITY / LIVE VIEW</p>
              <h2>Rental dashboard</h2>
            </div>
            <div className="dashboard-actions">
              <button
                className="button button-outline"
                type="button"
                onClick={() => setShowAvailableEquip(!showAvailableEquip)}
              >
                {showAvailableEquip ? "Hide equipment" : "Available equipment"}
              </button>
              <span className="sync-label">
                <span className="status-dot"></span> Synced live
              </span>
            </div>
          </div>

          {showAvailableEquip && (
            <div className="available-equipment-grid" style={{ marginBottom: "20px" }}>
              {EQUIPMENT_OPTIONS.map((eq) => (
                <div key={eq} className="equipment-card" style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  <div style={{ fontWeight: "600" }}>{eq}</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Standard Cooperative Fleet</div>
                </div>
              ))}
            </div>
          )}

          <div className="tabs" role="tablist">
            <button
              className={`tab ${activeTab === "pending" ? "active" : ""}`}
              onClick={() => setActiveTab("pending")}
            >
              Pending <span id="pending-tab-badge">{pendingCount}</span>
            </button>
            <button
              className={`tab ${activeTab === "active" ? "active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              Active <span>{activeCount}</span>
            </button>
            <button
              className={`tab ${activeTab === "upcoming" ? "active" : ""}`}
              onClick={() => setActiveTab("upcoming")}
            >
              Upcoming <span>{upcomingCount}</span>
            </button>
            <button
              className={`tab ${activeTab === "past" ? "active" : ""}`}
              onClick={() => setActiveTab("past")}
            >
              Past history <span>{pastCount}</span>
            </button>
          </div>

          <div className="rental-list">
            {loading ? (
              <p style={{ padding: "20px", color: "#64748b" }}>Loading rental bookings...</p>
            ) : filteredApps.length === 0 ? (
              <p style={{ padding: "24px", color: "#64748b", textAlign: "center", background: "#f8fafc", borderRadius: "8px" }}>
                No bookings found under this tab.
              </p>
            ) : (
              filteredApps.map((item) => (
                <article key={item._id || item.id} className="rental-card" style={{ padding: "16px", marginBottom: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "1.05rem" }}>{item.equipment}</h3>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                      Dates: {item.startDate} to {item.endDate}
                    </p>
                  </div>
                  <div>
                    <span className={`status-pill status-${(item.status || "pending").toLowerCase()}`} style={{ padding: "4px 10px", borderRadius: "12px", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "700" }}>
                      {item.status || "Pending"}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Book Equipment Modal */}
      {showBookingModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: "460px", padding: "24px", borderRadius: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Book Equipment</h2>
              <button onClick={() => setShowBookingModal(false)} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer" }}>&times;</button>
            </div>
            <form onSubmit={handleCreateBooking} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "4px" }}>Select Equipment</label>
                <select
                  value={bookEquipment}
                  onChange={(e) => setBookEquipment(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                >
                  <option value="">Choose equipment</option>
                  {EQUIPMENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "4px" }}>Start Date</label>
                <input
                  type="date"
                  value={bookStart}
                  onChange={(e) => setBookStart(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "4px" }}>End Date</label>
                <input
                  type="date"
                  value={bookEnd}
                  onChange={(e) => setBookEnd(e.target.value)}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </div>

              {bookingFeedback.message && (
                <p className={`form-feedback ${bookingFeedback.isError ? "error" : ""}`}>{bookingFeedback.message}</p>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowBookingModal(false)} className="button button-outline" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSubmittingBooking} className="button button-primary" style={{ flex: 1.5 }}>
                  {isSubmittingBooking ? "Submitting..." : "Submit Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showProfileModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: "520px", padding: "24px", borderRadius: "12px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Personal Information</h2>
              <button onClick={() => setShowProfileModal(false)} style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer" }}>&times;</button>
            </div>
            <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "4px" }}>Full Name</label>
                <input
                  type="text"
                  value={profileData.fullName}
                  onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "4px" }}>Phone Number</label>
                <input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "4px" }}>Street Address</label>
                <input
                  type="text"
                  value={profileData.address}
                  onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
                />
              </div>

              {profileFeedback.message && (
                <p className={`form-feedback ${profileFeedback.isError ? "error" : ""}`}>{profileFeedback.message}</p>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button type="button" onClick={() => setShowProfileModal(false)} className="button button-outline" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" style={{ flex: 1.5 }}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
