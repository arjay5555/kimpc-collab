import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import MemberTopbar from "../../components/MemberTopbar";

const initialPreferences = { theme: "light", defaultFarmLocation: "", notifications: { email: true, inApp: true, bookingReminders: true, systemUpdates: true } };

export default function Settings() {
  const { user, updateProfile } = useAuth();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [profile, setProfile] = useState({ fullName: "", phone: "", address: "", city: "", region: "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [language, setLanguage] = useState(localStorage.getItem("member-language") || "en");
  const [timezone, setTimezone] = useState(localStorage.getItem("member-timezone") || "Asia/Manila");
  const [supportContact, setSupportContact] = useState({ email: "", phone: "" });
  const [supportRequest, setSupportRequest] = useState({ subject: "", message: "" });
  const [myMessages, setMyMessages] = useState([]);
  const [isSendingSupport, setIsSendingSupport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const fetchMyMessages = useCallback(async () => {
    try {
      const res = await api("/member/messages");
      if (res.ok && res.data) {
        setMyMessages(res.data.messages || []);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api("/member/preferences"),
      api(`/accounts/${encodeURIComponent(user?.email || "")}`),
      api("/member/messages"),
    ]).then(([preferencesResponse, profileResponse, messagesResponse]) => {
      if (!active) return;
      if (preferencesResponse.ok) {
        const value = preferencesResponse.data;
        setPreferences({ ...initialPreferences, ...value, notifications: { ...initialPreferences.notifications, ...value.notifications } });
        setSupportContact({ email: value.supportEmail || "", phone: value.supportPhone || "" });
        localStorage.setItem("member-theme", value.theme || "light");
        localStorage.setItem("member-default-location", value.defaultFarmLocation || "");
        window.dispatchEvent(new CustomEvent("member-theme-change", { detail: value.theme || "light" }));
      }
      if (profileResponse.ok) setProfile({ fullName: profileResponse.data.fullName || "", phone: profileResponse.data.phone || "", address: profileResponse.data.address || "", city: profileResponse.data.city || "", region: profileResponse.data.region || "" });
      if (messagesResponse.ok && messagesResponse.data) {
        setMyMessages(messagesResponse.data.messages || []);
      }
      if (!preferencesResponse.ok) setError(preferencesResponse.data?.error || "Could not load saved settings.");
      setLoading(false);
    }).catch(() => {
      if (active) { setError("Could not load saved settings."); setLoading(false); }
    });
    return () => { active = false; };
  }, [user?.email]);

  const savePreferences = async (patch) => {
    setFeedback("");
    setError("");
    const response = await api("/member/preferences", { method: "PATCH", body: patch });
    if (!response.ok) { setError(response.data?.error || "Could not save your settings."); return false; }
    const value = response.data;
    setPreferences((current) => ({ ...current, ...value, notifications: { ...current.notifications, ...value.notifications } }));
    if (patch.defaultFarmLocation !== undefined) localStorage.setItem("member-default-location", value.defaultFarmLocation || "");
    if (patch.theme) {
      localStorage.setItem("member-theme", patch.theme);
      window.dispatchEvent(new CustomEvent("member-theme-change", { detail: patch.theme }));
    }
    setFeedback("Settings saved.");
    return true;
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const response = await api("/member/profile", { method: "PATCH", body: profile });
    if (!response.ok) { setError(response.data?.error || "Could not update your profile."); return; }
    updateProfile({ fullName: response.data.fullName });
    setFeedback("Personal information saved.");
  };

  const changePassword = async (event) => {
    event.preventDefault();
    const response = await api("/member/change-password", { method: "POST", body: passwords });
    if (!response.ok) { setError(response.data?.error || "Could not update password."); return; }
    setPasswords({ currentPassword: "", newPassword: "" });
    setFeedback("Password updated.");
  };

  const sendSupportRequest = async (event) => {
    event.preventDefault();
    setIsSendingSupport(true);
    setError("");
    setFeedback("");
    const response = await api("/member/support-request", { method: "POST", body: supportRequest });
    setIsSendingSupport(false);
    if (!response.ok) { setError(response.data?.error || "Could not send your support request."); return; }
    setSupportRequest({ subject: "", message: "" });
    setFeedback(response.data?.message || "Your question has been sent to the cooperative manager.");
    fetchMyMessages();
  };

  const updateNotification = (key, value) => {
    const notifications = { ...preferences.notifications, [key]: value };
    setPreferences((current) => ({ ...current, notifications }));
    savePreferences({ notifications });
  };

  const saveLocale = () => {
    localStorage.setItem("member-language", language);
    localStorage.setItem("member-timezone", timezone);
    setFeedback("Language and time zone saved on this device.");
  };

  if (loading) return <div className="member-page"><div className="member-rental-skeleton" /></div>;

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
      <MemberTopbar title="Settings" />

      {(feedback || error) && <p className={error ? "member-form-feedback" : "member-settings-feedback"} role={error ? "alert" : "status"}>{error || feedback}</p>}

      <section className="member-settings-section">
        <h2>Appearance</h2><p className="member-muted">Choose the look that works best for you.</p>
        <div className="member-theme-choice">
          {["light", "dark"].map((theme) => <button key={theme} type="button" className={preferences.theme === theme ? "active" : ""} onClick={() => savePreferences({ theme })}><span className={`member-theme-swatch ${theme}`} />{theme === "light" ? "Light theme" : "Dark theme"}</button>)}
        </div>
      </section>

      <section className="member-settings-section">
        <h2>Personal information</h2><p className="member-muted">Update the details associated with your cooperative account.</p>
        <form className="member-settings-grid" onSubmit={saveProfile}>
          <label>Full name<input required value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} /></label>
          <label>Email address<input disabled value={user?.email || ""} /></label>
          <label>Phone<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
          <label>Address<input value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} /></label>
          <label>City / municipality<input value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} /></label>
          <label>Region<input value={profile.region} onChange={(event) => setProfile({ ...profile, region: event.target.value })} /></label>
          <button className="member-button member-button-primary" type="submit">Save personal information</button>
        </form>
      </section>

      <section className="member-settings-section">
        <h2>Notification preferences</h2><p className="member-muted">Choose which updates you want to receive.</p>
        <div className="member-toggle-list">
          {[["email", "Email notifications"], ["inApp", "In-app notifications"], ["bookingReminders", "Booking reminders"], ["systemUpdates", "System updates and announcements"]].map(([key, label]) => <label key={key} className="member-toggle-row"><span>{label}</span><input type="checkbox" checked={Boolean(preferences.notifications[key])} onChange={(event) => updateNotification(key, event.target.checked)} /></label>)}
        </div>
      </section>

      <section className="member-settings-section">
        <h2>Default farm location</h2><p className="member-muted">Used to prefill the booking form. You can change it for each request.</p>
        <form className="member-inline-settings" onSubmit={(event) => { event.preventDefault(); savePreferences({ defaultFarmLocation: preferences.defaultFarmLocation }); }}>
          <input maxLength={240} placeholder="Barangay, municipality, farm name" value={preferences.defaultFarmLocation} onChange={(event) => setPreferences({ ...preferences, defaultFarmLocation: event.target.value })} />
          <button className="member-button member-button-outline" type="submit">Save location</button>
        </form>
      </section>

      <section className="member-settings-section">
        <h2>Language and time zone</h2><p className="member-muted">These preferences are saved in this browser.</p>
        <div className="member-inline-settings">
          <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="fil">Filipino</option></select>
          <select aria-label="Time zone" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Manila">Asia/Manila</option><option value="UTC">UTC</option><option value="Asia/Singapore">Asia/Singapore</option></select>
          <button className="member-button member-button-outline" type="button" onClick={saveLocale}>Save preferences</button>
        </div>
      </section>

      <section className="member-settings-section">
        <h2>Change password</h2><p className="member-muted">Use at least 8 characters for your new password.</p>
        <form className="member-inline-settings member-password-form" onSubmit={changePassword}>
          <input required type="password" autoComplete="current-password" placeholder="Current password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} />
          <input required minLength={8} type="password" autoComplete="new-password" placeholder="New password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} />
          <button className="member-button member-button-outline" type="submit">Update password</button>
        </form>
      </section>

      {/* Customer Service & Questions */}
      <section className="member-settings-section">
        <h2>Customer service &amp; Inquiries</h2>
        <p className="member-muted">Have a question about machinery, billing, or your booking? Send a message directly to cooperative managers.</p>
        
        <div className="member-support-links">
          {supportContact.email ? <a href={`mailto:${supportContact.email}`}>Email {supportContact.email}</a> : <span>Support email: operations@kimpc.coop</span>}
          {supportContact.phone ? <a href={`tel:${supportContact.phone}`}>Call {supportContact.phone}</a> : <span>Support phone: +63 917 123 4567</span>}
        </div>

        <form className="member-support-form" onSubmit={sendSupportRequest}>
          <label>
            Question Subject
            <input
              required
              maxLength={120}
              placeholder="e.g. Question regarding tractor schedule / farm location change"
              value={supportRequest.subject}
              onChange={(event) => setSupportRequest({ ...supportRequest, subject: event.target.value })}
            />
          </label>
          <label>
            Message / Inquiries
            <textarea
              required
              maxLength={3000}
              rows="4"
              placeholder="Describe your inquiry in detail. Cooperative managers will be notified and reply directly to your account..."
              value={supportRequest.message}
              onChange={(event) => setSupportRequest({ ...supportRequest, message: event.target.value })}
            />
          </label>
          <button className="member-button member-button-primary" type="submit" disabled={isSendingSupport}>
            {isSendingSupport ? "Sending inquiry…" : "Send Question to Manager"}
          </button>
        </form>

        {/* Member Question History & Manager Replies */}
        <div style={{ marginTop: "32px" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", color: "#0f172a" }}>
            Your Questions &amp; Manager Responses ({myMessages.length})
          </h3>

          {myMessages.length === 0 ? (
            <p className="member-muted" style={{ fontSize: "0.85rem", fontStyle: "italic" }}>
              You haven't submitted any questions yet. Your questions and manager replies will appear here.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {myMessages.map((msg) => (
                <article
                  key={msg._id || msg.id}
                  style={{
                    padding: "16px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                    <div>
                      <strong style={{ fontSize: "0.92rem", color: "#0f172a" }}>{msg.subject}</strong>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                        Sent {new Date(msg.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {msg.status === "replied" ? (
                      <span style={{ fontSize: "0.74rem", fontWeight: "700", padding: "3px 10px", borderRadius: "12px", background: "#dcfce7", color: "#166534" }}>
                        ✓ Manager Replied
                      </span>
                    ) : (
                      <span style={{ fontSize: "0.74rem", fontWeight: "600", padding: "3px 10px", borderRadius: "12px", background: "#fef3c7", color: "#92400e" }}>
                        ⏳ Waiting for Manager
                      </span>
                    )}
                  </div>

                  <p style={{ margin: "0 0 10px", fontSize: "0.86rem", color: "#334155", whiteSpace: "pre-wrap" }}>
                    {msg.message}
                  </p>

                  {/* Manager Reply Display */}
                  {msg.status === "replied" && msg.reply && (
                    <div
                      style={{
                        marginTop: "12px",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        background: "#f8fafc",
                        borderLeft: "3px solid #059669",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "#065f46" }}>
                          💬 Manager Reply from {msg.repliedBy || "Operations Manager"}
                        </span>
                        {msg.repliedAt && (
                          <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                            {new Date(msg.repliedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#1e293b", whiteSpace: "pre-wrap" }}>
                        {msg.reply}
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="member-faq" style={{ marginTop: "32px" }}>
          <h3>Frequently asked questions</h3>
          <details><summary>How long does booking approval take?</summary><p>Requests are reviewed by the cooperative team. You can check the current status in Your Applications.</p></details>
          <details><summary>Can I change my submitted rental dates or location?</summary><p>You can edit your farm location and dates directly while the booking status is Pending. If the booking is already Approved, changes are locked—please contact management or submit a cancellation request.</p></details>
          <details><summary>What happens when I cancel a booking?</summary><p>Pending bookings are cancelled immediately. For bookings already approved by the manager, cancellation requires manager review and approval.</p></details>
          <details><summary>What should I include as my farm location?</summary><p>Enter the barangay, municipality, and a farm name or landmark to help coordinate equipment delivery.</p></details>
        </div>
      </section>

      <section className="member-settings-section member-about-section"><h2>Privacy and about</h2><p className="member-muted">Your profile and booking details are used to manage cooperative equipment rentals. Contact support to request help with your account data.</p><span>KIMPC Member Portal · Version 1.0.0</span></section>
    </div>
  );
}
