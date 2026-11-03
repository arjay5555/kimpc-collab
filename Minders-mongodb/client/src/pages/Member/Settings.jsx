import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";

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
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api("/member/preferences"),
      api(`/accounts/${encodeURIComponent(user?.email || "")}`),
    ]).then(([preferencesResponse, profileResponse]) => {
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
    const response = await api("/member/support-request", { method: "POST", body: supportRequest });
    if (!response.ok) { setError(response.data?.error || "Could not send your support request."); return; }
    setSupportRequest({ subject: "", message: "" });
    setFeedback(response.data?.message || "Support request sent.");
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
    <div className="member-page">
      <header className="member-page-heading"><div><p className="member-eyebrow">MEMBER PORTAL / PREFERENCES</p><h1>Settings</h1><p className="member-muted">Manage your profile, notifications, and portal preferences.</p></div></header>
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

      <section className="member-settings-section">
        <h2>Customer service</h2><p className="member-muted">Need help with your booking? Contact the cooperative.</p>
        <div className="member-support-links">
          {supportContact.email ? <a href={`mailto:${supportContact.email}`}>Email {supportContact.email}</a> : <span>Support email is not configured.</span>}
          {supportContact.phone ? <a href={`tel:${supportContact.phone}`}>Call {supportContact.phone}</a> : <span>Support phone is not configured.</span>}
        </div>
        <form className="member-support-form" onSubmit={sendSupportRequest}>
          <label>Subject<input required maxLength={120} value={supportRequest.subject} onChange={(event) => setSupportRequest({ ...supportRequest, subject: event.target.value })} /></label>
          <label>Message<textarea required maxLength={3000} rows="4" value={supportRequest.message} onChange={(event) => setSupportRequest({ ...supportRequest, message: event.target.value })} /></label>
          <button className="member-button member-button-outline" type="submit">Send support request</button>
        </form>
        <div className="member-faq"><h3>Frequently asked questions</h3>
          <details><summary>How long does booking approval take?</summary><p>Requests are reviewed by the cooperative team. You can check the current status in Your Applications.</p></details>
          <details><summary>Can I change my submitted rental dates?</summary><p>Contact the cooperative if a request has already been submitted. Changes depend on equipment availability and approval status.</p></details>
          <details><summary>What should I include as my farm location?</summary><p>Enter the barangay, municipality, and a farm name or landmark to help coordinate equipment delivery.</p></details>
        </div>
      </section>

      <section className="member-settings-section member-about-section"><h2>Privacy and about</h2><p className="member-muted">Your profile and booking details are used to manage cooperative equipment rentals. Contact support to request help with your account data.</p><span>KIMPC Member Portal · Version 1.0.0</span></section>
    </div>
  );
}
