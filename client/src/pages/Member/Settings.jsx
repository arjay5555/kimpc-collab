import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import MemberTopbar from "../../components/MemberTopbar";
import { setPushEnabled, getPushStatus, isPushSupported } from "../../services/oneSignal";

const initialPreferences = {
  theme: "light",
  defaultFarmLocation: "",
  notifications: { email: true, inApp: true, bookingReminders: true, systemUpdates: true, push: true },
};

export default function Settings() {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();
  const fileInputRef = useRef(null);

  const [preferences, setPreferences] = useState(initialPreferences);
  const [profile, setProfile] = useState({
    fullName: "",
    phone: "",
    address: "",
    city: "",
    region: "",
    avatar: "",
    cooperativeId: "",
  });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [language, setLanguage] = useState(localStorage.getItem("member-language") || "en");
  const [timezone, setTimezone] = useState(localStorage.getItem("member-timezone") || "Asia/Manila");
  const [supportContact, setSupportContact] = useState({ email: "", phone: "" });
  const [supportRequest, setSupportRequest] = useState({ subject: "", message: "" });
  const [myMessages, setMyMessages] = useState([]);
  const [isSendingSupport, setIsSendingSupport] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pushInfo, setPushInfo] = useState({ supported: true, permission: "default", optedIn: false });
  const [isTestingPush, setIsTestingPush] = useState(false);

  const fetchMyMessages = useCallback(async () => {
    try {
      const res = await api("/member/messages");
      if (res.ok && res.data) {
        setMyMessages(res.data.messages || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      api("/member/preferences"),
      api(`/accounts/${encodeURIComponent(user?.email || "")}`),
      api("/member/messages"),
    ])
      .then(([preferencesResponse, profileResponse, messagesResponse]) => {
        if (!active) return;
        if (preferencesResponse.ok) {
          const value = preferencesResponse.data;
          setPreferences({
            ...initialPreferences,
            ...value,
            notifications: { ...initialPreferences.notifications, ...value.notifications },
          });
          setSupportContact({ email: value.supportEmail || "", phone: value.supportPhone || "" });
          localStorage.setItem("member-theme", value.theme || "light");
          localStorage.setItem("member-default-location", value.defaultFarmLocation || "");
          window.dispatchEvent(new CustomEvent("member-theme-change", { detail: value.theme || "light" }));
        }

        if (profileResponse.ok) {
          const d = profileResponse.data || {};
          const savedAvatar =
            d.avatar || localStorage.getItem(`kimpc-avatar-${user?.email || "current"}`) || "";
          setProfile({
            fullName: d.fullName || user?.fullName || "",
            phone: d.phone || "",
            address: d.address || "",
            city: d.city || "",
            region: d.region || "",
            avatar: savedAvatar,
            cooperativeId: d.cooperativeId || "",
          });
          if (savedAvatar) {
            updateProfile({ avatar: savedAvatar });
          }
        }

        if (messagesResponse.ok && messagesResponse.data) {
          setMyMessages(messagesResponse.data.messages || []);
        }

        if (!preferencesResponse.ok) {
          setError(preferencesResponse.data?.error || "Could not load saved settings.");
        }
        setLoading(false);
        getPushStatus().then((info) => {
          if (active) setPushInfo(info);
        });
      })
      .catch(() => {
        if (active) {
          setError("Could not load saved settings.");
          setLoading(false);
        getPushStatus().then((info) => {
          if (active) setPushInfo(info);
        });
        }
      });

    return () => {
      active = false;
    };
  }, [user?.email, updateProfile, user?.fullName]);

  // Save Preferences
  const savePreferences = async (patch) => {
    setFeedback("");
    setError("");
    const response = await api("/member/preferences", { method: "PATCH", body: patch });
    if (!response.ok) {
      setError(response.data?.error || "Could not save your settings.");
      return false;
    }
    const value = response.data;
    setPreferences((current) => ({
      ...current,
      ...value,
      notifications: { ...current.notifications, ...value.notifications },
    }));
    if (patch.defaultFarmLocation !== undefined) {
      localStorage.setItem("member-default-location", value.defaultFarmLocation || "");
    }
    if (patch.theme) {
      localStorage.setItem("member-theme", patch.theme);
      window.dispatchEvent(new CustomEvent("member-theme-change", { detail: patch.theme }));
    }
    setFeedback("Preferences updated successfully.");
    return true;
  };

  // Save Personal Information
  const saveProfile = async (event) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setFeedback("");
    setError("");
    try {
      const response = await api("/member/profile", { method: "PATCH", body: profile });
      if (!response.ok) {
        setError(response.data?.error || "Could not update your profile.");
        setIsSavingProfile(false);
        return;
      }
      updateProfile({ fullName: response.data.fullName, avatar: profile.avatar });
      setFeedback("Personal information saved successfully.");
    } catch {
      setError("An unexpected error occurred while saving your profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Change Profile Picture Handler
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose a valid image file (JPG, PNG, WebP).");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError("Image size exceeds 8MB. Please choose a smaller picture.");
      return;
    }

    setIsUploadingAvatar(true);
    setError("");
    setFeedback("");

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement("canvas");
          const maxSize = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);

          setProfile((p) => ({ ...p, avatar: compressedDataUrl }));
          updateProfile({ avatar: compressedDataUrl });

          const patchRes = await api("/member/profile", {
            method: "PATCH",
            body: { ...profile, avatar: compressedDataUrl },
          });

          if (patchRes.ok && patchRes.data?.avatar) {
            const uploadedUrl = patchRes.data.avatar;
            setProfile((p) => ({ ...p, avatar: uploadedUrl }));
            updateProfile({ avatar: uploadedUrl });
            localStorage.setItem(`kimpc-avatar-${user?.email || "current"}`, uploadedUrl);
          }

          setFeedback("Profile picture updated successfully!");
        } catch {
          setError("Failed to process the uploaded photo.");
        } finally {
          setIsUploadingAvatar(false);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    setProfile((p) => ({ ...p, avatar: "" }));
    updateProfile({ avatar: "" });
    localStorage.removeItem(`kimpc-avatar-${user?.email || "current"}`);
    await api("/member/profile", {
      method: "PATCH",
      body: { ...profile, avatar: "" },
    });
    setFeedback("Profile picture removed.");
  };

  // Change Password
  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (passwords.confirmPassword && passwords.newPassword !== passwords.confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setIsSavingPassword(true);
    setError("");
    setFeedback("");

    try {
      const response = await api("/member/change-password", {
        method: "POST",
        body: {
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
        },
      });
      if (!response.ok) {
        setError(response.data?.error || "Could not update password.");
        setIsSavingPassword(false);
        return;
      }
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setFeedback("Password updated successfully.");
    } catch {
      setError("Failed to update password.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Send Question to Manager
  const sendSupportRequest = async (event) => {
    event.preventDefault();
    setIsSendingSupport(true);
    setError("");
    setFeedback("");
    try {
      const response = await api("/member/support-request", { method: "POST", body: supportRequest });
      if (!response.ok) {
        setError(response.data?.error || "Could not send your support inquiry.");
        setIsSendingSupport(false);
        return;
      }
      setSupportRequest({ subject: "", message: "" });
      setFeedback(response.data?.message || "Your inquiry has been sent to the cooperative manager.");
      fetchMyMessages();
    } catch {
      setError("Failed to send inquiry.");
    } finally {
      setIsSendingSupport(false);
    }
  };

  const updateNotification = (key, value) => {
    const notifications = { ...preferences.notifications, [key]: value };
    setPreferences((current) => ({ ...current, notifications }));
    savePreferences({ notifications });
  };

  const handlePushToggle = async (checked) => {
    setError("");
    setFeedback("");
    if (checked) {
      const res = await setPushEnabled(true);
      if (res.permission === "denied") {
        setError("Browser notifications are blocked. Please enable notification permissions in your browser's site settings.");
        updateNotification("push", false);
      } else {
        updateNotification("push", true);
        setFeedback("Push notifications enabled! You will receive live updates when your booking status changes.");
      }
    } else {
      await setPushEnabled(false);
      updateNotification("push", false);
      setFeedback("Push notifications turned off.");
    }
    const updated = await getPushStatus();
    setPushInfo(updated);
  };

  const handleTestPush = async () => {
    setIsTestingPush(true);
    setError("");
    setFeedback("");
    try {
      const res = await api("/member/push/test", { method: "POST" });
      if (res.ok) {
        setFeedback("Test push notification dispatched! Check your device or notification tray.");
      } else {
        setError(res.data?.error || "Could not trigger test push.");
      }
    } catch {
      setError("Error sending test push notification.");
    } finally {
      setIsTestingPush(false);
    }
  };

  const saveLocale = () => {
    localStorage.setItem("member-language", language);
    localStorage.setItem("member-timezone", timezone);
    setFeedback("Language preference saved on this device.");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="member-page" style={{ width: "100%", maxWidth: "1000px", margin: "0 auto", paddingBottom: "100px" }}>
        <MemberTopbar title="Profile & Settings" />
        <div className="member-rental-skeleton" style={{ height: "260px", borderRadius: "16px", marginTop: "20px" }} />
      </div>
    );
  }

  const userInitial = profile.fullName
    ? profile.fullName.trim()[0].toUpperCase()
    : user?.fullName
    ? user.fullName.trim()[0].toUpperCase()
    : "M";

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1000px", margin: "0 auto", paddingBottom: "110px" }}>
      {/* Top Header */}
      <MemberTopbar title="Profile & Settings" />

      {/* Global Status Banner (Feedback or Error) */}
      {feedback && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 18px",
            marginBottom: "20px",
            borderRadius: "12px",
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontSize: "0.86rem",
            fontWeight: 600,
            boxShadow: "0 2px 6px rgba(16, 185, 129, 0.08)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 18px",
            marginBottom: "20px",
            borderRadius: "12px",
            background: "#fef2f2",
            border: "1px solid #fecdd3",
            color: "#b91c1c",
            fontSize: "0.86rem",
            fontWeight: 600,
            boxShadow: "0 2px 6px rgba(239, 68, 68, 0.08)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ======================== 1. Member Hero Profile Card ===================== */}
      {/* ========================================================================= */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          padding: "24px 28px",
          marginBottom: "22px",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
          display: "flex",
          alignItems: "center",
          gap: "24px",
          flexWrap: "wrap",
        }}
      >
        {/* Avatar with Camera Upload Overlay */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              width: "92px",
              height: "92px",
              borderRadius: "50%",
              overflow: "hidden",
              border: "3px solid #16a34a",
              boxShadow: "0 4px 14px rgba(22, 163, 74, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #15803d 0%, #166534 100%)",
              color: "#ffffff",
              fontSize: "2.2rem",
              fontWeight: 800,
            }}
          >
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.fullName || "Member Avatar"}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span>{userInitial}</span>
            )}
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleAvatarChange}
          />

          {/* Camera Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            title="Upload Profile Picture"
            aria-label="Upload Profile Picture"
            style={{
              position: "absolute",
              bottom: "0",
              right: "0",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "#166534",
              color: "#ffffff",
              border: "2px solid #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              transition: "transform 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        </div>

        {/* Member Name, Role & Badges */}
        <div style={{ flex: 1, minWidth: "220px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
            <h1 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
              {profile.fullName || user?.fullName || "KIMPC Member"}
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 10px",
                borderRadius: "20px",
                background: "#dcfce7",
                color: "#166534",
                fontSize: "0.72rem",
                fontWeight: 750,
              }}
            >
              ✓ Verified Member
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", color: "#64748b", fontSize: "0.82rem", marginBottom: "10px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              {user?.email || "member@kimpc.coop"}
            </span>

            {profile.phone && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {profile.phone}
              </span>
            )}
          </div>

          {/* Action buttons for avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                color: "#334155",
                fontSize: "0.76rem",
                fontWeight: 700,
                padding: "5px 12px",
                borderRadius: "7px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {isUploadingAvatar ? "Processing…" : "Change Photo"}
            </button>

            {profile.avatar && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#dc2626",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Remove Photo
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* ======================== 2. Personal Information ======================== */}
      {/* ========================================================================= */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          padding: "24px 28px",
          marginBottom: "22px",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#ecfdf5",
              color: "#166534",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
              Personal Information
            </h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.8rem" }}>
              Official contact details associated with your cooperative membership.
            </p>
          </div>
        </div>

        <form onSubmit={saveProfile} style={{ marginTop: "20px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              marginBottom: "18px",
            }}
          >
            {/* Full Name */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Full Name <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                required
                type="text"
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                placeholder="First name and last name"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  background: "#ffffff",
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Email (Disabled / Read-only) */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Email Address <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500 }}>(Official account)</span>
              </label>
              <input
                disabled
                type="email"
                value={user?.email || ""}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #e2e8f0",
                  fontSize: "0.88rem",
                  background: "#f8fafc",
                  color: "#64748b",
                  cursor: "not-allowed",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Mobile Phone */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Mobile Phone Number
              </label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="e.g. 0917 123 4567"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  background: "#ffffff",
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Street / Purok Address */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Purok / Street Address
              </label>
              <input
                type="text"
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                placeholder="e.g. Purok 4, Barangay Poblacion"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  background: "#ffffff",
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Municipality / City */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Municipality / City
              </label>
              <input
                type="text"
                value={profile.city}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                placeholder="e.g. Kalilangan"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  background: "#ffffff",
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Province / Region */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Province / Region
              </label>
              <input
                type="text"
                value={profile.region}
                onChange={(e) => setProfile({ ...profile, region: e.target.value })}
                placeholder="e.g. Bukidnon, Region X"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  background: "#ffffff",
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={isSavingProfile}
              style={{
                background: "#166534",
                color: "#ffffff",
                border: "none",
                borderRadius: "9px",
                padding: "11px 24px",
                fontSize: "0.88rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 2px 8px rgba(22, 101, 52, 0.2)",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{isSavingProfile ? "Saving Changes…" : "Save Personal Information"}</span>
            </button>
          </div>
        </form>
      </section>

      {/* ========================================================================= */}
      {/* ================= 3. Farm Preferences & System Settings ================= */}
      {/* ========================================================================= */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          padding: "24px 28px",
          marginBottom: "22px",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#eff6ff",
              color: "#1d4ed8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20v-6M6 20V10M18 20V4" />
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
              Farm &amp; System Preferences
            </h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.8rem" }}>
              Configure your default farm delivery location, theme appearance, and notifications.
            </p>
          </div>
        </div>

        {/* Default Farm Location Subcard */}
        <div style={{ marginTop: "20px", padding: "16px 18px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
            Default Farm Location / Landmark
          </label>
          <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: "0.78rem" }}>
            This location will automatically prefill new machinery booking applications to save you time.
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              type="text"
              maxLength={240}
              placeholder="e.g. Ninoy Aquino, Kalilangan, Bukidnon (near public elementary school)"
              value={preferences.defaultFarmLocation}
              onChange={(e) => setPreferences({ ...preferences, defaultFarmLocation: e.target.value })}
              style={{
                flex: "1 1 280px",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
                background: "#ffffff",
              }}
            />
            <button
              type="button"
              onClick={() => savePreferences({ defaultFarmLocation: preferences.defaultFarmLocation })}
              style={{
                background: "#ffffff",
                border: "1.5px solid #166534",
                color: "#166534",
                fontWeight: 700,
                fontSize: "0.84rem",
                padding: "10px 20px",
                borderRadius: "8px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              Save Farm Location
            </button>
          </div>
        </div>

        {/* Theme Appearance & Language Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginTop: "16px" }}>
          {/* Theme */}
          <div style={{ padding: "16px 18px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
              Theme Appearance
            </label>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => savePreferences({ theme: "light" })}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: preferences.theme === "light" ? "2px solid #166534" : "1px solid #cbd5e1",
                  background: preferences.theme === "light" ? "#ecfdf5" : "#ffffff",
                  color: preferences.theme === "light" ? "#166534" : "#475569",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>☀️ Light</span>
              </button>
              <button
                type="button"
                onClick={() => savePreferences({ theme: "dark" })}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: preferences.theme === "dark" ? "2px solid #166534" : "1px solid #cbd5e1",
                  background: preferences.theme === "dark" ? "#1e293b" : "#ffffff",
                  color: preferences.theme === "dark" ? "#ffffff" : "#475569",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>🌙 Dark</span>
              </button>
            </div>
          </div>

          {/* Language Selection */}
          <div style={{ padding: "16px 18px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
              Language Preference
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.84rem",
                  background: "#ffffff",
                  color: "#0f172a",
                }}
              >
                <option value="en">English (Official)</option>
                <option value="fil">Filipino / Tagalog</option>
              </select>
              <button
                type="button"
                onClick={saveLocale}
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "9px 14px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div style={{ marginTop: "16px", padding: "16px 18px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
              Notification Channels
            </label>
            {isPushSupported() && (
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                Push Permission:{" "}
                <strong
                  style={{
                    color:
                      pushInfo.permission === "granted"
                        ? "#166534"
                        : pushInfo.permission === "denied"
                        ? "#dc2626"
                        : "#d97706",
                  }}
                >
                  {pushInfo.permission === "granted"
                    ? "Allowed ✓"
                    : pushInfo.permission === "denied"
                    ? "Blocked ✕"
                    : "Not Prompted"}
                </strong>
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
            {[
              ["email", "Email Notifications"],
              ["inApp", "In-App Notifications"],
              ["push", "Web Push Notifications (OneSignal)"],
              ["bookingReminders", "Booking Schedule Reminders"],
              ["systemUpdates", "Cooperative Announcements"],
            ].map(([key, label]) => (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "#ffffff",
                  border: key === "push" && preferences.notifications.push ? "1.5px solid #16a34a" : "1px solid #e2e8f0",
                  fontSize: "0.8rem",
                  color: "#334155",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(preferences.notifications[key])}
                  onChange={(e) => {
                    if (key === "push") {
                      handlePushToggle(e.target.checked);
                    } else {
                      updateNotification(key, e.target.checked);
                    }
                  }}
                  style={{ width: "18px", height: "18px", accentColor: "#166534", cursor: "pointer" }}
                />
              </label>
            ))}
          </div>

          {/* Web Push Status & Live Test */}
          <div
            style={{
              marginTop: "12px",
              padding: "12px 14px",
              background: preferences.notifications.push ? "#f0fdf4" : "#f1f5f9",
              border: preferences.notifications.push ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>{preferences.notifications.push ? "🔔" : "🔕"}</span>
              <div>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: preferences.notifications.push ? "#166534" : "#475569" }}>
                  OneSignal Web Push: {preferences.notifications.push ? "Enabled & Linked" : "Turned Off"}
                </div>
                <div style={{ fontSize: "0.72rem", color: preferences.notifications.push ? "#15803d" : "#64748b" }}>
                  {preferences.notifications.push
                    ? "You will receive instant desktop/mobile push alerts when your bookings are Approved, Dispatched, or Rescheduled."
                    : "Enable Web Push to stay updated in real-time when managers review your booking requests."}
                </div>
              </div>
            </div>
            {preferences.notifications.push && (
              <button
                type="button"
                onClick={handleTestPush}
                disabled={isTestingPush}
                style={{
                  background: "#166534",
                  color: "#ffffff",
                  border: "none",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  cursor: isTestingPush ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                {isTestingPush ? "Dispatching..." : "Send Test Push"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* ======================== 4. Account Security ============================ */}
      {/* ========================================================================= */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          padding: "24px 28px",
          marginBottom: "22px",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#fffbeb",
              color: "#b45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
              Account Security &amp; Password
            </h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.8rem" }}>
              Change your password to ensure your member account remains protected.
            </p>
          </div>
        </div>

        <form onSubmit={changePassword} style={{ marginTop: "20px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "14px",
              marginBottom: "16px",
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Current Password <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                required
                type="password"
                autoComplete="current-password"
                placeholder="Enter existing password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  background: "#ffffff",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                New Password (minimum 8 characters) <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                placeholder="Enter new strong password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.88rem",
                  background: "#ffffff",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={isSavingPassword}
              style={{
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                borderRadius: "9px",
                padding: "10px 22px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {isSavingPassword ? "Updating Password…" : "Update Password"}
            </button>
          </div>
        </form>
      </section>

      {/* ========================================================================= */}
      {/* =================== 5. Cooperative Contact & Support ==================== */}
      {/* ========================================================================= */}
      <section
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          border: "1px solid #e2e8f0",
          padding: "24px 28px",
          marginBottom: "22px",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "#f0fdf4",
              color: "#15803d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0f172a" }}>
              Cooperative Contact &amp; Inquiries
            </h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.8rem" }}>
              Direct hotline and manager support for rental bookings, billing, and scheduling.
            </p>
          </div>
        </div>

        {/* Support Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginTop: "18px", marginBottom: "20px" }}>
          <a
            href={`mailto:${supportContact.email || "operations@kimpc.coop"}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "14px 16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              textDecoration: "none",
              color: "#0f172a",
              transition: "transform 0.15s ease",
            }}
          >
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ecfdf5", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Official Email</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#166534" }}>
                {supportContact.email || "operations@kimpc.coop"}
              </div>
            </div>
          </a>

          <a
            href={`tel:${supportContact.phone || "+639171234567"}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "14px 16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              textDecoration: "none",
              color: "#0f172a",
              transition: "transform 0.15s ease",
            }}
          >
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#eff6ff", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Helpline Phone</div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1d4ed8" }}>
                {supportContact.phone || "+63 917 123 4567"}
              </div>
            </div>
          </a>
        </div>

        {/* Inquiry Form */}
        <form onSubmit={sendSupportRequest} style={{ background: "#f8fafc", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "18px 20px", marginBottom: "22px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 750, color: "#0f172a" }}>
            Send a Question Directly to Cooperative Managers
          </h3>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Inquiry Subject
            </label>
            <input
              required
              maxLength={120}
              placeholder="e.g. Schedule adjustment, harvester arrival time, deposit confirmation"
              value={supportRequest.subject}
              onChange={(e) => setSupportRequest({ ...supportRequest, subject: e.target.value })}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
                background: "#ffffff",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "14px" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Message Details
            </label>
            <textarea
              required
              maxLength={3000}
              rows={4}
              placeholder="Provide specific details about your farm location or rental question so managers can assist you quickly..."
              value={supportRequest.message}
              onChange={(e) => setSupportRequest({ ...supportRequest, message: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "0.88rem",
                background: "#ffffff",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={isSendingSupport}
              style={{
                background: "#166534",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>{isSendingSupport ? "Sending Inquiry…" : "Submit Question to Manager"}</span>
            </button>
          </div>
        </form>

        {/* Questions History */}
        {myMessages.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <h4 style={{ margin: "0 0 12px", fontSize: "0.92rem", fontWeight: 750, color: "#0f172a" }}>
              Your Inquiries &amp; Manager Replies ({myMessages.length})
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {myMessages.slice(0, 5).map((msg) => (
                <div key={msg._id || msg.id} style={{ padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                    <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>{msg.subject}</strong>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "10px",
                        background: msg.status === "replied" ? "#dcfce7" : "#fef3c7",
                        color: msg.status === "replied" ? "#166534" : "#92400e",
                      }}
                    >
                      {msg.status === "replied" ? "✓ Replied" : "⏳ Pending"}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: "0.82rem", color: "#475569" }}>{msg.message}</p>
                  {msg.status === "replied" && msg.reply && (
                    <div style={{ padding: "10px 12px", background: "#ffffff", borderRadius: "8px", borderLeft: "3px solid #16a34a", marginTop: "8px" }}>
                      <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#166534", marginBottom: "2px" }}>
                        Manager Reply ({msg.repliedBy || "Operations"})
                      </div>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#1e293b" }}>{msg.reply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Frequently Asked Questions */}
        <div style={{ marginTop: "24px", borderTop: "1px solid #f1f5f9", paddingTop: "18px" }}>
          <h4 style={{ margin: "0 0 10px", fontSize: "0.9rem", fontWeight: 750, color: "#0f172a" }}>
            Frequently Asked Questions
          </h4>
          <details style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 0" }}>
            <summary style={{ fontSize: "0.82rem", fontWeight: 650, color: "#1e293b", cursor: "pointer" }}>
              How long does machinery booking approval take?
            </summary>
            <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
              Bookings are evaluated by cooperative dispatch managers within 2 to 24 hours depending on farm field schedule.
            </p>
          </details>
          <details style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 0" }}>
            <summary style={{ fontSize: "0.82rem", fontWeight: 650, color: "#1e293b", cursor: "pointer" }}>
              Can I modify my reservation dates or farm location?
            </summary>
            <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
              Yes. While the booking status is Pending, you can click "Edit Booking" in My Bookings. If already Approved, please contact management or request cancellation.
            </p>
          </details>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* ==================== 6. Sign Out Button (Very Bottom) =================== */}
      {/* ========================================================================= */}
      <section
        style={{
          background: "#fff5f5",
          borderRadius: "18px",
          border: "1px solid #fed7d7",
          padding: "24px 28px",
          boxShadow: "0 2px 6px rgba(220, 38, 38, 0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "18px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 800, color: "#991b1b" }}>
            Log Out of Member Portal
          </h2>
          <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.82rem" }}>
            End your cooperative session on this device. You will need to log back in to access your bookings.
          </p>
        </div>

        {!showLogoutConfirm ? (
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            style={{
              background: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              padding: "11px 24px",
              fontSize: "0.88rem",
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 8px rgba(220, 38, 38, 0.25)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#b91c1c")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#dc2626")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Log Out</span>
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#991b1b" }}>Confirm Log Out?</span>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: "#dc2626",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "0.84rem",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Yes, Log Out
            </button>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(false)}
              style={{
                background: "#ffffff",
                color: "#475569",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "0.84rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
