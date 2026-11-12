import React, { useState, useEffect, useRef } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import AdminSidebar from "../../components/AdminSidebar";
import AdminTopbar from "../../components/AdminTopbar";
import "../../styles/admin-kimpc.css";

function ApiSourceBadge({ isCustom }) {
  return (
    <span
      title={isCustom ? "Currently using your saved Custom API credentials" : "Currently using system Default API credentials"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "0.7rem",
        fontWeight: 800,
        padding: "2px 9px",
        borderRadius: "999px",
        border: `1px solid ${isCustom ? "#86efac" : "#cbd5e1"}`,
        background: isCustom ? "#dcfce7" : "#f1f5f9",
        color: isCustom ? "#15803d" : "#475569",
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: isCustom ? "#16a34a" : "#64748b",
        }}
      />
      {isCustom ? "Custom" : "Default"}
    </span>
  );
}

export default function AdminIntegrations() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    googleLoginEnabled: true,
    facebookLoginEnabled: false,
    recaptchaEnabled: true,
    weatherEnabled: true,
    oneSignalEnabled: true,
    cloudinaryEnabled: true,
    emailResetEnabled: true,
    googleCalendarEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  // Customizable API Keys State
  const [apiKeys, setApiKeys] = useState({
    google: { clientId: "", clientSecret: "", isCustom: false, source: "default" },
    facebook: { appId: "", appSecret: "", isCustom: false, source: "default" },
    recaptcha: { siteKey: "", secretKey: "", isCustom: false, source: "default" },
    weather: { apiKey: "", isCustom: false, source: "default" },
    oneSignal: { appId: "", restApiKey: "", isCustom: false, source: "default" },
    cloudinary: { cloudName: "", apiKey: "", apiSecret: "", isCustom: false, source: "default" },
    email: { user: "", pass: "", from: "", isCustom: false, source: "default" },
    calendar: { clientId: "", clientSecret: "", redirectUri: "", isCustom: false, source: "default" },
  });

  // Key form inputs
  const [keyInputs, setKeyInputs] = useState({
    google: { clientId: "", clientSecret: "" },
    facebook: { appId: "", appSecret: "" },
    recaptcha: { siteKey: "", secretKey: "" },
    weather: { apiKey: "" },
    oneSignal: { appId: "", restApiKey: "" },
    cloudinary: { cloudName: "", apiKey: "", apiSecret: "" },
    email: { user: "", pass: "", from: "" },
    calendar: { clientId: "", clientSecret: "", redirectUri: "" },
  });

  // Drawer expansion state (toggled via Edit icon)
  const [expandedKeys, setExpandedKeys] = useState({
    google: false,
    facebook: false,
    recaptcha: false,
    weather: false,
    oneSignal: false,
    cloudinary: false,
    email: false,
    calendar: false,
  });

  // Reveal / Hide secrets toggle
  const [revealSecrets, setRevealSecrets] = useState({
    google: false,
    facebook: false,
    recaptcha: false,
    weather: false,
    oneSignal: false,
    cloudinary: false,
    email: false,
    calendar: false,
  });

  // Individual saving state & feedback
  const [keySaving, setKeySaving] = useState({});
  const [keyFeedback, setKeyFeedback] = useState({});

  // 6-Digit PIN Security Modal State
  const [pinModal, setPinModal] = useState({
    open: false,
    actionDescription: "",
    onSuccess: null,
    isFirstPin: false,
  });
  // Page-session PIN authorization (persists across actions while on this page, resets upon navigating away)
  const [isPinAuthorized, setIsPinAuthorized] = useState(false);
  const [adminHasPin, setAdminHasPin] = useState(null);
  const [pinDigits, setPinDigits] = useState(["", "", "", "", "", ""]);
  const [confirmPinDigits, setConfirmPinDigits] = useState(["", "", "", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const pinInputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
  ];
  const confirmPinInputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
  ];

  // System Developer Dual-Control Authorization State
  const [devAuthStep, setDevAuthStep] = useState(false);
  const [devAuthRequestId, setDevAuthRequestId] = useState(null);
  const [devAuthMaskedEmail, setDevAuthMaskedEmail] = useState("");
  const [devAuthStatus, setDevAuthStatus] = useState("PENDING"); // "PENDING" | "APPROVED" | "DENIED" | "EXPIRED"
  const [devAuthOtpDigits, setDevAuthOtpDigits] = useState(["", "", "", "", "", ""]);
  const [devAuthOtpError, setDevAuthOtpError] = useState("");
  const [devAuthOtpLoading, setDevAuthOtpLoading] = useState(false);
  const [showDevOtpInput, setShowDevOtpInput] = useState(true);
  const [resendCooldown, setResendCooldown] = useState(0);
  const devPollTimerRef = useRef(null);
  const devPollResolvedRef = useRef(false);
  const devAuthCallbackRef = useRef(null);
  const [devAuthChecking, setDevAuthChecking] = useState(false);
  const devOtpInputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
  ];

  // Reset page-level authorization whenever this component unmounts (admin navigates to another page)
  useEffect(() => {
    return () => {
      setIsPinAuthorized(false);
      if (devPollTimerRef.current) {
        clearInterval(devPollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleClosePinModal = () => {
    if (devPollTimerRef.current) {
      clearInterval(devPollTimerRef.current);
    }
    devPollResolvedRef.current = true;
    devAuthCallbackRef.current = null;
    setPinModal({ open: false, actionDescription: "", onSuccess: null, isFirstPin: false });
    setDevAuthStep(false);
    setDevAuthStatus("PENDING");
    setDevAuthOtpDigits(["", "", "", "", "", ""]);
    setDevAuthOtpError("");
    setPinLoading(false);
  };

  const checkDeveloperAuthStatus = async (reqId) => {
    if (!reqId || devPollResolvedRef.current) return;
    try {
      const statusRes = await api(`/admin/integrations/dev-auth/status/${reqId}`, { skipCache: true });
      if (statusRes.ok && statusRes.data && !devPollResolvedRef.current) {
        const st = statusRes.data.status;
        if (st === "APPROVED") {
          devPollResolvedRef.current = true;
          if (devPollTimerRef.current) clearInterval(devPollTimerRef.current);
          setDevAuthStatus("APPROVED");
          const callback = devAuthCallbackRef.current;
          setTimeout(() => {
            setIsPinAuthorized(true);
            setPinModal({ open: false, actionDescription: "", onSuccess: null, isFirstPin: false });
            setDevAuthStep(false);
            if (typeof callback === "function") {
              callback();
            }
          }, 900);
        } else if (st === "DENIED") {
          devPollResolvedRef.current = true;
          if (devPollTimerRef.current) clearInterval(devPollTimerRef.current);
          setDevAuthStatus("DENIED");
        } else if (st === "EXPIRED") {
          devPollResolvedRef.current = true;
          if (devPollTimerRef.current) clearInterval(devPollTimerRef.current);
          setDevAuthStatus("EXPIRED");
        }
      }
    } catch {
      // ignore transient poll failure
    }
  };

  // Re-check immediately if browser tab regains focus after clicking email link
  useEffect(() => {
    if (!devAuthStep || devAuthStatus !== "PENDING" || !devAuthRequestId) return;
    const handleFocusCheck = () => {
      checkDeveloperAuthStatus(devAuthRequestId);
    };
    window.addEventListener("focus", handleFocusCheck);
    return () => window.removeEventListener("focus", handleFocusCheck);
  }, [devAuthStep, devAuthStatus, devAuthRequestId]);

  const startDeveloperAuthorization = async (actionDesc, callback) => {
    devPollResolvedRef.current = false;
    devAuthCallbackRef.current = callback;
    setDevAuthStep(true);
    setDevAuthStatus("PENDING");
    setDevAuthOtpDigits(["", "", "", "", "", ""]);
    setDevAuthOtpError("");
    setPinLoading(true);

    try {
      const adminEmail = user?.email || JSON.parse(localStorage.getItem("kimpc_user") || "{}")?.email || "admin@kimpc.test";
      const res = await api("/admin/integrations/dev-auth/request", {
        method: "POST",
        body: {
          adminEmail,
          actionDescription: actionDesc || "Modify System Integrations",
        },
      });

      setPinLoading(false);
      if (!res.ok) {
        setPinError(res.data?.error || "Failed to dispatch request to System Developer.");
        setDevAuthStep(false);
        return;
      }

      const reqId = res.data.requestId;
      setDevAuthRequestId(reqId);
      setDevAuthMaskedEmail(res.data.devEmailMasked || "ar••••••••••@gmail.com");
      setResendCooldown(60);

      // Start uncached polling of developer approval status every 2 seconds
      if (devPollTimerRef.current) clearInterval(devPollTimerRef.current);
      devPollTimerRef.current = setInterval(() => {
        checkDeveloperAuthStatus(reqId);
      }, 2000);
    } catch {
      setPinError("Network error contacting developer authorization service.");
      setDevAuthStep(false);
      setPinLoading(false);
    }
  };

  const handleManualCheckDevAuth = async () => {
    if (!devAuthRequestId || devAuthChecking) return;
    setDevAuthChecking(true);
    await checkDeveloperAuthStatus(devAuthRequestId);
    setDevAuthChecking(false);
  };

  const handleVerifyDevOtp = async (eOrOtp) => {
    if (eOrOtp && typeof eOrOtp.preventDefault === "function") {
      eOrOtp.preventDefault();
    }
    const otp = (typeof eOrOtp === "string" ? eOrOtp : devAuthOtpDigits.join("")).trim();
    if (otp.length !== 6) {
      setDevAuthOtpError("Please enter the complete 6-digit Developer OTP.");
      return;
    }

    setDevAuthOtpLoading(true);
    setDevAuthOtpError("");

    try {
      const res = await api("/admin/integrations/dev-auth/verify-otp", {
        method: "POST",
        body: {
          requestId: devAuthRequestId,
          otpCode: otp,
        },
      });

      setDevAuthOtpLoading(false);
      if (!res.ok) {
        setDevAuthOtpError(res.data?.error || "Incorrect 6-digit Developer OTP.");
        return;
      }

      if (devPollTimerRef.current) clearInterval(devPollTimerRef.current);
      setDevAuthStatus("APPROVED");
      const callback = pinModal.onSuccess;
      setTimeout(() => {
        setIsPinAuthorized(true);
        setPinModal({ open: false, actionDescription: "", onSuccess: null, isFirstPin: false });
        setDevAuthStep(false);
        if (typeof callback === "function") {
          callback();
        }
      }, 1200);
    } catch (err) {
      setDevAuthOtpLoading(false);
      setDevAuthOtpError("Network error verifying Developer OTP.");
    }
  };

  const handleDevOtpDigitChange = (index, value) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const next = [...devAuthOtpDigits];
      next[index] = "";
      setDevAuthOtpDigits(next);
      return;
    }

    if (cleaned.length > 1) {
      const next = [...devAuthOtpDigits];
      const digits = cleaned.slice(0, 6).split("");
      digits.forEach((d, i) => {
        if (index + i < 6) next[index + i] = d;
      });
      setDevAuthOtpDigits(next);
      const nextIdx = Math.min(index + digits.length, 5);
      devOtpInputRefs[nextIdx]?.current?.focus();
      const fullOtp = next.join("");
      if (fullOtp.length === 6) {
        handleVerifyDevOtp(fullOtp);
      }
      return;
    }

    const next = [...devAuthOtpDigits];
    next[index] = cleaned;
    setDevAuthOtpDigits(next);
    setDevAuthOtpError("");
    if (index < 5) {
      devOtpInputRefs[index + 1]?.current?.focus();
    } else {
      const fullOtp = next.join("");
      if (fullOtp.length === 6) {
        handleVerifyDevOtp(fullOtp);
      }
    }
  };

  const handleDevOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !devAuthOtpDigits[index] && index > 0) {
      devOtpInputRefs[index - 1]?.current?.focus();
    } else if (e.key === "Enter") {
      handleVerifyDevOtp();
    }
  };

  const handleDevOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDevAuthOtpDigits(next);
    const nextIdx = Math.min(pasted.length, 5);
    devOtpInputRefs[nextIdx]?.current?.focus();
    if (pasted.length === 6) {
      handleVerifyDevOtp(pasted);
    }
  };

  const checkPinStatus = async () => {
    try {
      const email = user?.email || JSON.parse(localStorage.getItem("kimpc_user") || "{}")?.email || "admin@kimpc.test";
      const res = await api(`/admin/pin-status?email=${encodeURIComponent(email)}`, { skipCache: true });
      if (res.ok && res.data) {
        setAdminHasPin(Boolean(res.data.hasPin));
        return Boolean(res.data.hasPin);
      }
    } catch (e) {
      console.warn("Could not check pin status:", e);
    }
    return false;
  };

  useEffect(() => {
    checkPinStatus();
  }, [user?.email]);

  const requestPinAuthorization = async (actionDescription, onSuccess) => {
    // If already authorized during this visit on the integrations page, proceed immediately!
    if (isPinAuthorized) {
      if (typeof onSuccess === "function") {
        onSuccess();
      }
      return;
    }

    setPinDigits(["", "", "", "", "", ""]);
    setConfirmPinDigits(["", "", "", "", "", ""]);
    setPinError("");
    setPinLoading(false);

    // Refresh PIN status from backend to verify if this admin account has set their PIN
    let hasPin = adminHasPin;
    try {
      const email = user?.email || JSON.parse(localStorage.getItem("kimpc_user") || "{}")?.email || "admin@kimpc.test";
      const res = await api(`/admin/pin-status?email=${encodeURIComponent(email)}`, { skipCache: true });
      if (res.ok && res.data) {
        hasPin = Boolean(res.data.hasPin);
        setAdminHasPin(hasPin);
      }
    } catch (e) {}

    setPinModal({
      open: true,
      actionDescription,
      onSuccess,
      isFirstPin: !hasPin,
    });
    setTimeout(() => {
      pinInputRefs[0]?.current?.focus();
    }, 100);
  };

  // 1. Verify existing 6-digit PIN
  const handleVerifyPin = async (eOrPin) => {
    if (eOrPin && typeof eOrPin.preventDefault === "function") {
      eOrPin.preventDefault();
    }
    const pin = (typeof eOrPin === "string" ? eOrPin : pinDigits.join("")).trim();
    if (pin.length !== 6) {
      setPinError("Please enter all 6 digits of your PIN.");
      return;
    }

    setPinLoading(true);
    setPinError("");

    try {
      const adminEmail = user?.email || JSON.parse(localStorage.getItem("kimpc_user") || "{}")?.email || "admin@kimpc.test";
      const res = await api("/admin/verify-pin", {
        method: "POST",
        body: {
          adminEmail,
          pin,
          actionDescription: pinModal.actionDescription,
        },
      });

      if (!res.ok) {
        setPinError(res.data?.error || "Incorrect 6-digit admin security PIN.");
        setPinLoading(false);
        setPinDigits(["", "", "", "", "", ""]);
        pinInputRefs[0]?.current?.focus();
        return;
      }

      // PIN Verified successfully! Now proceed to Step 2: System Developer Dual-Control Authorization
      await startDeveloperAuthorization(pinModal.actionDescription, pinModal.onSuccess);
    } catch (err) {
      setPinError("Network error while verifying PIN.");
      setPinLoading(false);
    }
  };

  // 2. Set initial 6-digit PIN (for admin account with no PIN yet)
  const handleSetInitialPin = async (e) => {
    if (e) e.preventDefault();
    const newPin = pinDigits.join("").trim();
    const confirmPin = confirmPinDigits.join("").trim();

    if (newPin.length !== 6) {
      setPinError("New PIN must be exactly 6 digits.");
      return;
    }
    if (confirmPin.length !== 6) {
      setPinError("Please repeat all 6 digits in the confirmation field.");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("New PIN and confirmation PIN do not match.");
      return;
    }

    setPinLoading(true);
    setPinError("");

    try {
      const adminEmail = user?.email || JSON.parse(localStorage.getItem("kimpc_user") || "{}")?.email || "admin@kimpc.test";
      const res = await api("/admin/set-initial-pin", {
        method: "POST",
        body: {
          email: adminEmail,
          newPin,
          confirmPin,
        },
      });

      if (!res.ok) {
        setPinError(res.data?.error || "Failed to set security PIN.");
        setPinLoading(false);
        return;
      }

      setAdminHasPin(true);
      // Initial PIN set! Now proceed to Step 2: System Developer Dual-Control Authorization
      await startDeveloperAuthorization(pinModal.actionDescription, pinModal.onSuccess);
    } catch (err) {
      setPinError("Network error while setting initial PIN.");
      setPinLoading(false);
    }
  };

  const handleConfirmPinDigitChange = (index, value) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const next = [...confirmPinDigits];
      next[index] = "";
      setConfirmPinDigits(next);
      return;
    }

    if (cleaned.length > 1) {
      const next = [...confirmPinDigits];
      const chars = cleaned.slice(0, 6).split("");
      chars.forEach((c, i) => {
        if (index + i < 6) next[index + i] = c;
      });
      setConfirmPinDigits(next);
      const targetIdx = Math.min(5, index + chars.length);
      confirmPinInputRefs[targetIdx]?.current?.focus();
      return;
    }

    const next = [...confirmPinDigits];
    next[index] = cleaned[0];
    setConfirmPinDigits(next);

    if (index < 5) {
      confirmPinInputRefs[index + 1]?.current?.focus();
    }
  };

  const handleConfirmPinKeyDown = (index, e) => {
    if (e.key === "Backspace" && !confirmPinDigits[index] && index > 0) {
      confirmPinInputRefs[index - 1]?.current?.focus();
    } else if (e.key === "Enter") {
      handleSetInitialPin();
    }
  };

  const handleConfirmPinPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    pasted.split("").forEach((c, i) => {
      next[i] = c;
    });
    setConfirmPinDigits(next);
    const targetIdx = Math.min(5, pasted.length);
    confirmPinInputRefs[targetIdx]?.current?.focus();
  };

  const handlePinDigitChange = (index, value) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const next = [...pinDigits];
      next[index] = "";
      setPinDigits(next);
      return;
    }

    if (cleaned.length > 1) {
      const next = [...pinDigits];
      const chars = cleaned.slice(0, 6).split("");
      chars.forEach((c, i) => {
        if (index + i < 6) next[index + i] = c;
      });
      setPinDigits(next);
      const targetIdx = Math.min(5, index + chars.length);
      pinInputRefs[targetIdx]?.current?.focus();
      const full = next.join("");
      if (full.length === 6 && !pinModal.isFirstPin) {
        handleVerifyPin(full);
      }
      return;
    }

    const next = [...pinDigits];
    next[index] = cleaned[0];
    setPinDigits(next);

    if (index < 5) {
      pinInputRefs[index + 1]?.current?.focus();
    } else {
      const full = next.join("");
      if (full.length === 6 && !pinModal.isFirstPin) {
        handleVerifyPin(full);
      }
    }
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1]?.current?.focus();
    } else if (e.key === "Enter") {
      handleVerifyPin();
    }
  };

  const handlePinPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    pasted.split("").forEach((c, i) => {
      next[i] = c;
    });
    setPinDigits(next);
    const targetIdx = Math.min(5, pasted.length);
    pinInputRefs[targetIdx]?.current?.focus();
    if (pasted.length === 6 && !pinModal.isFirstPin) {
      handleVerifyPin(pasted);
    }
  };

  const handleRequestEdit = (serviceKey, serviceName) => {
    if (expandedKeys[serviceKey]) {
      setExpandedKeys((p) => ({ ...p, [serviceKey]: false }));
    } else {
      requestPinAuthorization(`edit ${serviceName} credentials`, () => {
        setExpandedKeys((p) => ({ ...p, [serviceKey]: true }));
      });
    }
  };

  // 1. Fetch current integration switches & customizable keys
  const fetchSettingsAndKeys = async () => {
    setLoading(true);
    try {
      const res = await api("/admin/settings", { skipCache: true });
      if (res.ok && res.data) {
        setSettings({
          googleLoginEnabled: res.data.googleLoginEnabled ?? true,
          facebookLoginEnabled: res.data.facebookLoginEnabled ?? false,
          recaptchaEnabled: res.data.recaptchaEnabled ?? true,
          weatherEnabled: res.data.weatherEnabled ?? true,
          oneSignalEnabled: res.data.oneSignalEnabled ?? true,
          cloudinaryEnabled: res.data.cloudinaryEnabled ?? true,
          emailResetEnabled: res.data.emailResetEnabled ?? true,
          googleCalendarEnabled: res.data.googleCalendarEnabled ?? true,
        });
      }

      const keysRes = await api("/admin/integrations/keys", { skipCache: true });
      if (keysRes.ok && keysRes.data?.data) {
        const d = keysRes.data?.data || keysRes.data || {};
        setApiKeys({
          google: d.google || {},
          facebook: d.facebook || {},
          recaptcha: d.recaptcha || {},
          weather: d.weather || {},
          oneSignal: d.oneSignal || {},
          cloudinary: d.cloudinary || {},
          email: d.email || {},
          calendar: d.calendar || {},
        });

        setKeyInputs({
          google: {
            clientId: d.google?.isCustom ? (d.google?.customClientId || "") : (d.google?.defaultClientId || ""),
            clientSecret: d.google?.isCustom ? (d.google?.customClientSecret || "") : (d.google?.defaultClientSecret || ""),
          },
          facebook: {
            appId: d.facebook?.isCustom ? (d.facebook?.customAppId || "") : (d.facebook?.defaultAppId || ""),
            appSecret: d.facebook?.isCustom ? (d.facebook?.customAppSecret || "") : (d.facebook?.defaultAppSecret || ""),
          },
          recaptcha: {
            siteKey: d.recaptcha?.isCustom ? (d.recaptcha?.customSiteKey || "") : (d.recaptcha?.defaultSiteKey || ""),
            secretKey: d.recaptcha?.isCustom ? (d.recaptcha?.customSecretKey || "") : (d.recaptcha?.defaultSecretKey || ""),
          },
          weather: {
            apiKey: d.weather?.isCustom ? (d.weather?.customKey || "") : (d.weather?.defaultKey || ""),
          },
          oneSignal: {
            appId: d.oneSignal?.isCustom ? (d.oneSignal?.customAppId || "") : (d.oneSignal?.defaultAppId || ""),
            restApiKey: d.oneSignal?.isCustom ? (d.oneSignal?.customRestApiKey || "") : (d.oneSignal?.defaultRestKey || ""),
          },
          cloudinary: {
            cloudName: d.cloudinary?.isCustom ? (d.cloudinary?.customCloudName || "") : (d.cloudinary?.defaultCloudName || ""),
            apiKey: d.cloudinary?.isCustom ? (d.cloudinary?.customApiKey || "") : (d.cloudinary?.defaultApiKey || ""),
            apiSecret: d.cloudinary?.isCustom ? (d.cloudinary?.customApiSecret || "") : (d.cloudinary?.defaultApiSecret || ""),
          },
          email: {
            user: d.email?.isCustom ? (d.email?.customUser || "") : (d.email?.defaultUser || ""),
            pass: d.email?.isCustom ? (d.email?.customPass || "") : (d.email?.defaultPass || ""),
            from: d.email?.isCustom ? (d.email?.customFrom || "") : (d.email?.defaultFrom || ""),
          },
          calendar: {
            clientId: d.calendar?.isCustom ? (d.calendar?.customClientId || "") : (d.calendar?.defaultClientId || ""),
            clientSecret: d.calendar?.isCustom ? (d.calendar?.customClientSecret || "") : (d.calendar?.defaultClientSecret || ""),
            redirectUri: d.calendar?.isCustom ? (d.calendar?.customRedirectUri || "") : (d.calendar?.defaultRedirectUri || ""),
          },
        });
      }
    } catch (err) {
      console.error("Error fetching integrations:", err);
      setFeedback({ message: "Could not load integration settings.", isError: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndKeys();
  }, []);

  // Update a single setting switch with dual-route guarantee (dedicated endpoint + fallback PUT)
  const updateSetting = async (endpoint, key, value, label) => {
    const previous = settings[key];
    setSettings((prev) => ({ ...prev, [key]: value }));
    setFeedback({ message: `Updating ${label}...`, isError: false });

    try {
      // 1. Try dedicated endpoint first (e.g. /admin/settings/google-login)
      let res = await api(endpoint, {
        method: "POST",
        body: { enabled: value },
      });

      // 2. Also try PUT /admin/settings as reliable fallback
      if (!res.ok) {
        res = await api("/admin/settings", {
          method: "PUT",
          body: { [key]: value },
        });
      }

      if (!res.ok) {
        setSettings((prev) => ({ ...prev, [key]: previous }));
        setFeedback({ message: res.data?.error || `Failed to update ${label}.`, isError: true });
      } else {
        setFeedback({
          message: `${label} has been ${value ? "enabled" : "disabled"} successfully.`,
          isError: false,
        });
        setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
      }
    } catch (err) {
      console.error(`Error updating ${label}:`, err);
      setSettings((prev) => ({ ...prev, [key]: previous }));
      setFeedback({ message: `Network error updating ${label}.`, isError: true });
    }
  };

  // Toggle handlers mapped to both dedicated routes and PUT with 6-digit PIN protection
  const handleToggleGoogle = () => {
    const nextState = !settings.googleLoginEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} Google Sign-In`, () => {
      updateSetting("/admin/settings/google-login", "googleLoginEnabled", nextState, "Google Sign-In");
    });
  };
  const handleToggleFacebook = () => {
    const nextState = !settings.facebookLoginEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} Facebook Sign-In`, () => {
      updateSetting("/admin/settings/facebook-login", "facebookLoginEnabled", nextState, "Facebook Sign-In");
    });
  };
  const handleToggleRecaptcha = () => {
    const nextState = !settings.recaptchaEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} Google reCAPTCHA v2`, () => {
      updateSetting("/admin/settings/recaptcha", "recaptchaEnabled", nextState, "Google reCAPTCHA v2");
    });
  };
  const handleToggleWeather = () => {
    const nextState = !settings.weatherEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} Kalilangan Weather Forecast API`, () => {
      updateSetting("/admin/settings/weather", "weatherEnabled", nextState, "Kalilangan Weather Forecast API");
    });
  };
  const handleToggleOneSignal = () => {
    const nextState = !settings.oneSignalEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} OneSignal Web Push`, () => {
      updateSetting("/admin/settings/onesignal", "oneSignalEnabled", nextState, "OneSignal Web Push");
    });
  };
  const handleToggleCloudinary = () => {
    const nextState = !settings.cloudinaryEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} Cloudinary Media Storage`, () => {
      updateSetting("/admin/settings/cloudinary", "cloudinaryEnabled", nextState, "Cloudinary Media Storage");
    });
  };
  const handleToggleEmailReset = () => {
    const nextState = !settings.emailResetEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} Gmail Password Reset Service`, () => {
      updateSetting("/admin/settings/email-reset", "emailResetEnabled", nextState, "Gmail Password Reset Service");
    });
  };
  const handleToggleGoogleCalendar = () => {
    const nextState = !settings.googleCalendarEnabled;
    requestPinAuthorization(`${nextState ? "enable" : "disable"} Google Calendar Integration`, () => {
      updateSetting("/admin/settings/google-calendar", "googleCalendarEnabled", nextState, "Google Calendar Integration");
    });
  };

  // Save / Reset Handlers for Customizable Keys
  const handleSaveGoogleKeys = async () => {
    setKeySaving((p) => ({ ...p, google: true }));
    setKeyFeedback((p) => ({ ...p, google: null }));
    try {
      const res = await api("/admin/integrations/keys/google", {
        method: "POST",
        body: {
          clientId: keyInputs.google.clientId.trim(),
          clientSecret: keyInputs.google.clientSecret.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, google: { isError: true, message: res.data?.error || "Failed to update Google credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, google: { isError: false, message: "Google credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, google: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, google: { isError: true, message: "Network error saving Google credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, google: false }));
    }
  };

  const handleResetGoogleKeys = async () => {
    if (!window.confirm("Reset Google credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, google: true }));
    try {
      const res = await api("/admin/integrations/keys/google/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          clientId: apiKeys.google?.defaultClientId || "",
          clientSecret: apiKeys.google?.defaultClientSecret || "",
        };
        setKeyInputs((p) => ({
          ...p,
          google: {
            clientId: defs.clientId || "",
            clientSecret: defs.clientSecret || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, google: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, google: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, google: { isError: true, message: res.data?.error || "Failed to reset Google credentials." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, google: { isError: true, message: "Network error resetting Google credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, google: false }));
    }
  };

  const handleSaveFacebookKeys = async () => {
    setKeySaving((p) => ({ ...p, facebook: true }));
    setKeyFeedback((p) => ({ ...p, facebook: null }));
    try {
      const res = await api("/admin/integrations/keys/facebook", {
        method: "POST",
        body: {
          appId: keyInputs.facebook.appId.trim(),
          appSecret: keyInputs.facebook.appSecret.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, facebook: { isError: true, message: res.data?.error || "Failed to update Facebook credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, facebook: { isError: false, message: "Facebook credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, facebook: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, facebook: { isError: true, message: "Network error saving Facebook credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, facebook: false }));
    }
  };

  const handleResetFacebookKeys = async () => {
    if (!window.confirm("Reset Facebook credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, facebook: true }));
    try {
      const res = await api("/admin/integrations/keys/facebook/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          appId: apiKeys.facebook?.defaultAppId || "",
          appSecret: apiKeys.facebook?.defaultAppSecret || "",
        };
        setKeyInputs((p) => ({
          ...p,
          facebook: {
            appId: defs.appId || "",
            appSecret: defs.appSecret || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, facebook: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, facebook: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, facebook: { isError: true, message: res.data?.error || "Failed to reset Facebook credentials." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, facebook: { isError: true, message: "Network error resetting Facebook credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, facebook: false }));
    }
  };

  const handleSaveRecaptchaKeys = async () => {
    setKeySaving((p) => ({ ...p, recaptcha: true }));
    setKeyFeedback((p) => ({ ...p, recaptcha: null }));
    try {
      const res = await api("/admin/integrations/keys/recaptcha", {
        method: "POST",
        body: {
          siteKey: keyInputs.recaptcha.siteKey.trim(),
          secretKey: keyInputs.recaptcha.secretKey.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, recaptcha: { isError: true, message: res.data?.error || "Failed to update reCAPTCHA keys." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, recaptcha: { isError: false, message: "reCAPTCHA keys saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, recaptcha: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, recaptcha: { isError: true, message: "Network error saving reCAPTCHA keys." } }));
    } finally {
      setKeySaving((p) => ({ ...p, recaptcha: false }));
    }
  };

  const handleResetRecaptchaKeys = async () => {
    if (!window.confirm("Reset reCAPTCHA keys to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, recaptcha: true }));
    try {
      const res = await api("/admin/integrations/keys/recaptcha/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          siteKey: apiKeys.recaptcha?.defaultSiteKey || "",
          secretKey: apiKeys.recaptcha?.defaultSecretKey || "",
        };
        setKeyInputs((p) => ({
          ...p,
          recaptcha: {
            siteKey: defs.siteKey || "",
            secretKey: defs.secretKey || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, recaptcha: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, recaptcha: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, recaptcha: { isError: true, message: res.data?.error || "Failed to reset reCAPTCHA keys." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, recaptcha: { isError: true, message: "Network error resetting reCAPTCHA keys." } }));
    } finally {
      setKeySaving((p) => ({ ...p, recaptcha: false }));
    }
  };

  const handleSaveWeatherKey = async () => {
    setKeySaving((p) => ({ ...p, weather: true }));
    setKeyFeedback((p) => ({ ...p, weather: null }));
    try {
      const res = await api("/admin/integrations/keys/weather", {
        method: "POST",
        body: {
          apiKey: keyInputs.weather.apiKey.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, weather: { isError: true, message: res.data?.error || "Failed to update Weather API key." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, weather: { isError: false, message: "Weather API key saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, weather: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, weather: { isError: true, message: "Network error saving Weather API key." } }));
    } finally {
      setKeySaving((p) => ({ ...p, weather: false }));
    }
  };

  const handleResetWeatherKey = async () => {
    if (!window.confirm("Reset Weather API key to default system code key?")) return;
    setKeySaving((p) => ({ ...p, weather: true }));
    try {
      const res = await api("/admin/integrations/keys/weather/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          apiKey: apiKeys.weather?.defaultKey || "",
        };
        setKeyInputs((p) => ({
          ...p,
          weather: {
            apiKey: defs.apiKey || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, weather: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, weather: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, weather: { isError: true, message: res.data?.error || "Failed to reset Weather API key." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, weather: { isError: true, message: "Network error resetting Weather API key." } }));
    } finally {
      setKeySaving((p) => ({ ...p, weather: false }));
    }
  };

  const handleSaveOneSignalKeys = async () => {
    setKeySaving((p) => ({ ...p, oneSignal: true }));
    setKeyFeedback((p) => ({ ...p, oneSignal: null }));
    try {
      const res = await api("/admin/integrations/keys/onesignal", {
        method: "POST",
        body: {
          appId: keyInputs.oneSignal.appId.trim(),
          restApiKey: keyInputs.oneSignal.restApiKey.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, oneSignal: { isError: true, message: res.data?.error || "Failed to update OneSignal credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, oneSignal: { isError: false, message: "OneSignal credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, oneSignal: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, oneSignal: { isError: true, message: "Network error saving OneSignal credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, oneSignal: false }));
    }
  };

  const handleResetOneSignalKeys = async () => {
    if (!window.confirm("Reset OneSignal credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, oneSignal: true }));
    try {
      const res = await api("/admin/integrations/keys/onesignal/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          appId: apiKeys.oneSignal?.defaultAppId || "",
          restApiKey: apiKeys.oneSignal?.defaultRestKey || "",
        };
        setKeyInputs((p) => ({
          ...p,
          oneSignal: {
            appId: defs.appId || "",
            restApiKey: defs.restApiKey || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, oneSignal: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, oneSignal: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, oneSignal: { isError: true, message: res.data?.error || "Failed to reset OneSignal credentials." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, oneSignal: { isError: true, message: "Network error resetting OneSignal credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, oneSignal: false }));
    }
  };

  const handleSaveCloudinaryKeys = async () => {
    setKeySaving((p) => ({ ...p, cloudinary: true }));
    setKeyFeedback((p) => ({ ...p, cloudinary: null }));
    try {
      const res = await api("/admin/integrations/keys/cloudinary", {
        method: "POST",
        body: {
          cloudName: keyInputs.cloudinary.cloudName.trim(),
          apiKey: keyInputs.cloudinary.apiKey.trim(),
          apiSecret: keyInputs.cloudinary.apiSecret.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, cloudinary: { isError: true, message: res.data?.error || "Failed to update Cloudinary credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, cloudinary: { isError: false, message: "Cloudinary credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, cloudinary: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, cloudinary: { isError: true, message: "Network error saving Cloudinary credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, cloudinary: false }));
    }
  };

  const handleResetCloudinaryKeys = async () => {
    if (!window.confirm("Reset Cloudinary credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, cloudinary: true }));
    try {
      const res = await api("/admin/integrations/keys/cloudinary/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          cloudName: apiKeys.cloudinary?.defaultCloudName || "",
          apiKey: apiKeys.cloudinary?.defaultApiKey || "",
          apiSecret: apiKeys.cloudinary?.defaultApiSecret || "",
        };
        setKeyInputs((p) => ({
          ...p,
          cloudinary: {
            cloudName: defs.cloudName || "",
            apiKey: defs.apiKey || "",
            apiSecret: defs.apiSecret || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, cloudinary: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, cloudinary: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, cloudinary: { isError: true, message: res.data?.error || "Failed to reset Cloudinary credentials." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, cloudinary: { isError: true, message: "Network error resetting Cloudinary credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, cloudinary: false }));
    }
  };

  const handleSaveEmailKeys = async () => {
    setKeySaving((p) => ({ ...p, email: true }));
    setKeyFeedback((p) => ({ ...p, email: null }));
    try {
      const res = await api("/admin/integrations/keys/email", {
        method: "POST",
        body: {
          user: keyInputs.email.user.trim(),
          pass: keyInputs.email.pass.trim(),
          from: keyInputs.email.from.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, email: { isError: true, message: res.data?.error || "Failed to update Gmail SMTP credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, email: { isError: false, message: "Gmail SMTP credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, email: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, email: { isError: true, message: "Network error saving Gmail SMTP credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, email: false }));
    }
  };

  const handleResetEmailKeys = async () => {
    if (!window.confirm("Reset Gmail SMTP credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, email: true }));
    try {
      const res = await api("/admin/integrations/keys/email/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          user: apiKeys.email?.defaultUser || "",
          pass: apiKeys.email?.defaultPass || "",
          from: apiKeys.email?.defaultFrom || "",
        };
        setKeyInputs((p) => ({
          ...p,
          email: {
            user: defs.user || "",
            pass: defs.pass || "",
            from: defs.from || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, email: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, email: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, email: { isError: true, message: res.data?.error || "Failed to reset Gmail SMTP credentials." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, email: { isError: true, message: "Network error resetting Gmail SMTP credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, email: false }));
    }
  };

  const handleSaveCalendarKeys = async () => {
    setKeySaving((p) => ({ ...p, calendar: true }));
    setKeyFeedback((p) => ({ ...p, calendar: null }));
    try {
      const res = await api("/admin/integrations/keys/calendar", {
        method: "POST",
        body: {
          clientId: keyInputs.calendar.clientId.trim(),
          clientSecret: keyInputs.calendar.clientSecret.trim(),
          redirectUri: keyInputs.calendar.redirectUri.trim(),
        },
      });
      if (!res.ok) {
        setKeyFeedback((p) => ({ ...p, calendar: { isError: true, message: res.data?.error || "Failed to update Google Calendar credentials." } }));
      } else {
        setKeyFeedback((p) => ({ ...p, calendar: { isError: false, message: "Google Calendar credentials saved & written to server/.env successfully!" } }));
        fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, calendar: null })), 4000);
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, calendar: { isError: true, message: "Network error saving Google Calendar credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, calendar: false }));
    }
  };

  const handleResetCalendarKeys = async () => {
    if (!window.confirm("Reset Google Calendar credentials to default system code keys?")) return;
    setKeySaving((p) => ({ ...p, calendar: true }));
    try {
      const res = await api("/admin/integrations/keys/calendar/reset", { method: "POST" });
      if (res.ok) {
        const defs = res.data?.defaultKeys || {
          clientId: apiKeys.calendar?.defaultClientId || "",
          clientSecret: apiKeys.calendar?.defaultClientSecret || "",
          redirectUri: apiKeys.calendar?.defaultRedirectUri || "",
        };
        setKeyInputs((p) => ({
          ...p,
          calendar: {
            clientId: defs.clientId || "",
            clientSecret: defs.clientSecret || "",
            redirectUri: defs.redirectUri || "",
          },
        }));
        setKeyFeedback((p) => ({ ...p, calendar: { isError: false, message: "Reset to default system credentials." } }));
        await fetchSettingsAndKeys();
        setTimeout(() => setKeyFeedback((p) => ({ ...p, calendar: null })), 4000);
      } else {
        setKeyFeedback((p) => ({ ...p, calendar: { isError: true, message: res.data?.error || "Failed to reset Google Calendar credentials." } }));
      }
    } catch {
      setKeyFeedback((p) => ({ ...p, calendar: { isError: true, message: "Network error resetting Google Calendar credentials." } }));
    } finally {
      setKeySaving((p) => ({ ...p, calendar: false }));
    }
  };

  return (
    <div className="wz-dashboard-container">
      {/* ================= Left Navigation Sidebar ================= */}
      <AdminSidebar />

      {/* ================= Center Content Area ================= */}
      <main className="wz-content-wrapper">
        {/* Top Header Bar */}
        <AdminTopbar
          title="API & Service Integrations"
          subtitle="Configure third-party service connections, custom API credentials (.env), and operational switches."
          settings={settings}
          onToggleGoogle={handleToggleGoogle}
          onToggleFacebook={handleToggleFacebook}
          onToggleRecaptcha={handleToggleRecaptcha}
          onToggleWeather={handleToggleWeather}
          onToggleOneSignal={handleToggleOneSignal}
          onToggleCloudinary={handleToggleCloudinary}
        />

        {/* Global Feedback Banner */}
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

        {/* Component-level override to disable browser inner reveal eye and clear buttons */}
        <style>{`
          input::-ms-reveal,
          input::-ms-clear,
          .wz-form-input::-ms-reveal,
          .wz-form-input::-ms-clear {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          input::-webkit-credentials-auto-fill-button,
          input::-webkit-contacts-auto-fill-button {
            visibility: hidden !important;
            display: none !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important;
            margin: 0 !important;
          }
        `}</style>

        {/* Decoy hidden inputs to divert aggressive browser password autofill away from integration keys */}
        <div style={{ position: "absolute", top: "-9999px", left: "-9999px", opacity: 0, pointerEvents: "none" }} aria-hidden="true">
          <input type="text" name="decoy_username" tabIndex="-1" autoComplete="off" />
          <input type="password" name="decoy_password" tabIndex="-1" autoComplete="off" />
        </div>

        {/* ================= Single Seamless Container for All Integrations ================= */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--wz-border, #edf2f7)",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
            overflow: "hidden",
            marginBottom: "28px",
          }}
        >
          {/* ================= 1. Google Sign-In ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/google logo.png"
                    alt="Google"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Google Sign-In</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.google?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("google", "Google Sign-In")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.google
                      ? "#166534"
                      : apiKeys.google?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.google?.isCustom
                      ? "Custom Google credentials active (Click to edit)"
                      : "Edit Google credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.google?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.googleLoginEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.googleLoginEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.googleLoginEnabled)}
                    onChange={handleToggleGoogle}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Google Keys Expandable Drawer */}
            {expandedKeys.google && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Google OAuth Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.google?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.google?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.google?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      GOOGLE_CLIENT_ID
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_google_client_id"
                      id="kimpc_custom_google_client_id"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.google?.defaultClientIdMasked ? `Example (Default): ${apiKeys.google.defaultClientIdMasked}` : "e.g. 1047648325603-...apps.googleusercontent.com"}
                      value={keyInputs.google.clientId}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, google: { ...p.google, clientId: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      GOOGLE_CLIENT_SECRET
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.google ? "text" : "password"}
                        name="kimpc_custom_google_client_secret"
                        id="kimpc_custom_google_client_secret"
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.google?.defaultClientSecretMasked ? `Example (Default): ${apiKeys.google.defaultClientSecretMasked}` : "e.g. GOCSPX-..."}
                        value={keyInputs.google.clientSecret}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, google: { ...p.google, clientSecret: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, google: !p.google }))}
                        title={revealSecrets.google ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.google ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.google ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.google?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetGoogleKeys}
                        disabled={keySaving.google}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveGoogleKeys}
                      disabled={keySaving.google}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.google ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.google && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.google.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.google.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 2. Facebook Sign-In ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/FB LOGO.webp"
                    alt="Facebook"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Facebook Sign-In</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.facebook?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("facebook", "Facebook Sign-In")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.facebook
                      ? "#166534"
                      : apiKeys.facebook?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.facebook?.isCustom
                      ? "Custom Facebook credentials active (Click to edit)"
                      : "Edit Facebook credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.facebook?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.facebookLoginEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.facebookLoginEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.facebookLoginEnabled)}
                    onChange={handleToggleFacebook}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Facebook Keys Expandable Drawer */}
            {expandedKeys.facebook && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Facebook App Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.facebook?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.facebook?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.facebook?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      FACEBOOK_APP_ID
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_facebook_app_id"
                      id="kimpc_custom_facebook_app_id"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.facebook?.defaultAppIdMasked ? `Example (Default): ${apiKeys.facebook.defaultAppIdMasked}` : "e.g. 19582..."}
                      value={keyInputs.facebook.appId}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, facebook: { ...p.facebook, appId: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      FACEBOOK_APP_SECRET
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.facebook ? "text" : "password"}
                        name="kimpc_custom_facebook_app_secret"
                        id="kimpc_custom_facebook_app_secret"
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.facebook?.defaultAppSecretMasked ? `Example (Default): ${apiKeys.facebook.defaultAppSecretMasked}` : "e.g. 38d9f..."}
                        value={keyInputs.facebook.appSecret}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, facebook: { ...p.facebook, appSecret: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, facebook: !p.facebook }))}
                        title={revealSecrets.facebook ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.facebook ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.facebook ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.facebook?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetFacebookKeys}
                        disabled={keySaving.facebook}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveFacebookKeys}
                      disabled={keySaving.facebook}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.facebook ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.facebook && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.facebook.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.facebook.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 3. Google reCAPTCHA v2 ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/recaptcha.jpg"
                    alt="reCAPTCHA"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Google reCAPTCHA v2</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.recaptcha?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("recaptcha", "Google reCAPTCHA v2")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.recaptcha
                      ? "#166534"
                      : apiKeys.recaptcha?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.recaptcha?.isCustom
                      ? "Custom reCAPTCHA keys active (Click to edit)"
                      : "Edit reCAPTCHA keys"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.recaptcha?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.recaptchaEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.recaptchaEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.recaptchaEnabled)}
                    onChange={handleToggleRecaptcha}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom reCAPTCHA Keys Expandable Drawer */}
            {expandedKeys.recaptcha && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Google reCAPTCHA v2 Keys (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.recaptcha?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.recaptcha?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.recaptcha?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      RECAPTCHA_SITE_KEY (Frontend)
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_recaptcha_site_key"
                      id="kimpc_custom_recaptcha_site_key"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.recaptcha?.defaultSiteKeyMasked ? `Example (Default): ${apiKeys.recaptcha.defaultSiteKeyMasked}` : "e.g. 6Ldxq..."}
                      value={keyInputs.recaptcha.siteKey}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, recaptcha: { ...p.recaptcha, siteKey: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      RECAPTCHA_SECRET_KEY (Backend Verification)
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.recaptcha ? "text" : "password"}
                        name="kimpc_custom_recaptcha_secret_key"
                        id="kimpc_custom_recaptcha_secret_key"
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.recaptcha?.defaultSecretKeyMasked ? `Example (Default): ${apiKeys.recaptcha.defaultSecretKeyMasked}` : "e.g. 6Ldxq..."}
                        value={keyInputs.recaptcha.secretKey}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, recaptcha: { ...p.recaptcha, secretKey: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, recaptcha: !p.recaptcha }))}
                        title={revealSecrets.recaptcha ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.recaptcha ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.recaptcha ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.recaptcha?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetRecaptchaKeys}
                        disabled={keySaving.recaptcha}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveRecaptchaKeys}
                      disabled={keySaving.recaptcha}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.recaptcha ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.recaptcha && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.recaptcha.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.recaptcha.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 4. Kalilangan Weather Forecast API ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#f0f9ff",
                    border: "1px solid #e0f2fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  </svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Kalilangan Weather Forecast API</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.weather?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("weather", "Kalilangan Weather Forecast API")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.weather
                      ? "#166534"
                      : apiKeys.weather?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.weather?.isCustom
                      ? "Custom Weather API key active (Click to edit)"
                      : "Edit Weather API key"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.weather?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.weatherEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.weatherEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.weatherEnabled)}
                    onChange={handleToggleWeather}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Weather Key Expandable Drawer */}
            {expandedKeys.weather && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom WeatherAPI Key (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.weather?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.weather?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.weather?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                    WEATHER_API_KEY (WeatherAPI.com Token)
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type={revealSecrets.weather ? "text" : "password"}
                      name="kimpc_custom_weather_api_key"
                      id="kimpc_custom_weather_api_key"
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                      placeholder={apiKeys.weather?.defaultKeyMasked ? `Example (Default): ${apiKeys.weather.defaultKeyMasked}` : "e.g. 7145472cabdc45fe8f414215260611"}
                      value={keyInputs.weather.apiKey}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, weather: { ...p.weather, apiKey: e.target.value } }))}
                    />
                    <button
                      type="button"
                      onClick={() => setRevealSecrets((p) => ({ ...p, weather: !p.weather }))}
                      title={revealSecrets.weather ? "Hide secret" : "Reveal secret"}
                      style={{
                        width: "38px",
                        height: "38px",
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: revealSecrets.weather ? "#166534" : "#64748b",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {revealSecrets.weather ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.weather?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetWeatherKey}
                        disabled={keySaving.weather}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveWeatherKey}
                      disabled={keySaving.weather}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.weather ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.weather && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.weather.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.weather.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 5. OneSignal Web Push Notifications ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/one signal logo.webp"
                    alt="OneSignal"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>OneSignal Web Push Notifications</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.oneSignal?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("oneSignal", "OneSignal Web Push")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.oneSignal
                      ? "#166534"
                      : apiKeys.oneSignal?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.oneSignal?.isCustom
                      ? "Custom OneSignal credentials active (Click to edit)"
                      : "Edit OneSignal credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.oneSignal?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.oneSignalEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.oneSignalEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.oneSignalEnabled)}
                    onChange={handleToggleOneSignal}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom OneSignal Keys Expandable Drawer */}
            {expandedKeys.oneSignal && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom OneSignal Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.oneSignal?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.oneSignal?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.oneSignal?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      ONESIGNAL_APP_ID
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_onesignal_app_id"
                      id="kimpc_custom_onesignal_app_id"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.oneSignal?.defaultAppIdMasked ? `Example (Default): ${apiKeys.oneSignal.defaultAppIdMasked}` : "e.g. fc811113-559c-40c3-ba59-e703db896839"}
                      value={keyInputs.oneSignal.appId}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, oneSignal: { ...p.oneSignal, appId: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      ONESIGNAL_REST_API_KEY
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.oneSignal ? "text" : "password"}
                        name="kimpc_custom_onesignal_rest_key"
                        id="kimpc_custom_onesignal_rest_key"
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.oneSignal?.defaultRestKeyMasked ? `Example (Default): ${apiKeys.oneSignal.defaultRestKeyMasked}` : "e.g. os_v2_app_..."}
                        value={keyInputs.oneSignal.restApiKey}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, oneSignal: { ...p.oneSignal, restApiKey: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, oneSignal: !p.oneSignal }))}
                        title={revealSecrets.oneSignal ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.oneSignal ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.oneSignal ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.oneSignal?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetOneSignalKeys}
                        disabled={keySaving.oneSignal}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveOneSignalKeys}
                      disabled={keySaving.oneSignal}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.oneSignal ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.oneSignal && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.oneSignal.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.oneSignal.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 6. Cloudinary Cloud Media Storage ================= */}
          <div style={{ borderBottom: "none" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/Cloudinary logo.webp"
                    alt="Cloudinary"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Cloudinary Cloud Media Storage</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.cloudinary?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("cloudinary", "Cloudinary Media Storage")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.cloudinary
                      ? "#166534"
                      : apiKeys.cloudinary?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.cloudinary?.isCustom
                      ? "Custom Cloudinary credentials active (Click to edit)"
                      : "Edit Cloudinary credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.cloudinary?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.cloudinaryEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.cloudinaryEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.cloudinaryEnabled)}
                    onChange={handleToggleCloudinary}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Cloudinary Keys Expandable Drawer */}
            {expandedKeys.cloudinary && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Cloudinary Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.cloudinary?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.cloudinary?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.cloudinary?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      CLOUDINARY_CLOUD_NAME
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_cloudinary_cloud_name"
                      id="kimpc_custom_cloudinary_cloud_name"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.cloudinary?.defaultCloudName ? `Example (Default): ${apiKeys.cloudinary.defaultCloudName}` : "e.g. kimpc"}
                      value={keyInputs.cloudinary.cloudName}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, cloudinary: { ...p.cloudinary, cloudName: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      CLOUDINARY_API_KEY
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_cloudinary_api_key"
                      id="kimpc_custom_cloudinary_api_key"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.cloudinary?.defaultApiKeyMasked ? `Example (Default): ${apiKeys.cloudinary.defaultApiKeyMasked}` : "e.g. 691365116427346"}
                      value={keyInputs.cloudinary.apiKey}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, cloudinary: { ...p.cloudinary, apiKey: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      CLOUDINARY_API_SECRET
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.cloudinary ? "text" : "password"}
                        name="kimpc_custom_cloudinary_api_secret"
                        id="kimpc_custom_cloudinary_api_secret"
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.cloudinary?.defaultApiSecretMasked ? `Example (Default): ${apiKeys.cloudinary.defaultApiSecretMasked}` : "e.g. ••••••••••••••••"}
                        value={keyInputs.cloudinary.apiSecret}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, cloudinary: { ...p.cloudinary, apiSecret: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, cloudinary: !p.cloudinary }))}
                        title={revealSecrets.cloudinary ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.cloudinary ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.cloudinary ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.cloudinary?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetCloudinaryKeys}
                        disabled={keySaving.cloudinary}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveCloudinaryKeys}
                      disabled={keySaving.cloudinary}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.cloudinary ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.cloudinary && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.cloudinary.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.cloudinary.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 7. Gmail SMTP Service (Password Reset & OTP) ================= */}
          <div style={{ borderBottom: "1px solid #f1f5f9" }}>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "6px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/gmail logo.png"
                    alt="Gmail"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Gmail SMTP Service (Password Reset &amp; OTP)</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.email?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("email", "Gmail Password Reset Service")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.email
                      ? "#166534"
                      : apiKeys.email?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.email?.isCustom
                      ? "Custom Gmail SMTP credentials active (Click to edit)"
                      : "Edit Gmail SMTP credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.email?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.emailResetEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.emailResetEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.emailResetEnabled)}
                    onChange={handleToggleEmailReset}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Gmail SMTP Keys Expandable Drawer */}
            {expandedKeys.email && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Gmail SMTP Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.email?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.email?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.email?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      SMTP_USER (Gmail Address)
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_smtp_user"
                      id="kimpc_custom_smtp_user"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.email?.defaultUserMasked ? `Example (Default): ${apiKeys.email.defaultUserMasked}` : "e.g. kimpc.system@gmail.com"}
                      value={keyInputs.email.user}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, email: { ...p.email, user: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      SMTP_PASS (App Password)
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.email ? "text" : "password"}
                        name="kimpc_custom_smtp_pass"
                        id="kimpc_custom_smtp_pass"
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.email?.defaultPassMasked ? `Example (Default): ${apiKeys.email.defaultPassMasked}` : "e.g. ••••••••••••••••"}
                        value={keyInputs.email.pass}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, email: { ...p.email, pass: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, email: !p.email }))}
                        title={revealSecrets.email ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.email ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.email ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      SMTP_FROM (Sender Header)
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_smtp_from"
                      id="kimpc_custom_smtp_from"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.email?.defaultFrom ? `Example (Default): ${apiKeys.email.defaultFrom}` : 'e.g. "KIMPC Security" <kimpc.system@gmail.com>'}
                      value={keyInputs.email.from}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, email: { ...p.email, from: e.target.value } }))}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.email?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetEmailKeys}
                        disabled={keySaving.email}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveEmailKeys}
                      disabled={keySaving.email}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.email ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.email && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.email.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.email.message}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 8. Google Calendar Integration ================= */}
          <div>
            <div
              className="wz-integration-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #edf2f7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/images/google logo.png"
                    alt="Google Calendar"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>Google Calendar Integration</strong>
                  <ApiSourceBadge isCustom={Boolean(apiKeys.calendar?.isCustom)} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Edit customizable credentials icon button */}
                <button
                  type="button"
                  onClick={() => handleRequestEdit("calendar", "Google Calendar Integration")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: expandedKeys.calendar
                      ? "#166534"
                      : apiKeys.calendar?.isCustom
                      ? "#15803d"
                      : "#64748b",
                    position: "relative",
                    transition: "color 0.15s ease",
                  }}
                  title={
                    apiKeys.calendar?.isCustom
                      ? "Custom Google Calendar credentials active (Click to edit)"
                      : "Edit Google Calendar credentials"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  {apiKeys.calendar?.isCustom && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1px",
                        right: "0px",
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#16a34a",
                        border: "1px solid #ffffff",
                      }}
                      title="Custom key active"
                    />
                  )}
                </button>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: settings.googleCalendarEnabled ? "#16a34a" : "#64748b",
                    minWidth: "55px",
                    textAlign: "right",
                  }}
                >
                  {settings.googleCalendarEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="wz-switch-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.googleCalendarEnabled)}
                    onChange={handleToggleGoogleCalendar}
                  />
                  <span className="wz-switch-slider" />
                </label>
              </div>
            </div>

            {/* Custom Google Calendar Keys Expandable Drawer */}
            {expandedKeys.calendar && (
              <div
                style={{
                  background: "#f8fafc",
                  padding: "18px 24px",
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#334155" }}>
                    Configure Custom Google Calendar OAuth Credentials (.env)
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: apiKeys.calendar?.isCustom ? "#dcfce7" : "#e2e8f0",
                      color: apiKeys.calendar?.isCustom ? "#15803d" : "#475569",
                    }}
                  >
                    Active API: {apiKeys.calendar?.isCustom ? "Custom" : "Default"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      GOOGLE_CALENDAR_CLIENT_ID
                    </label>
                    <input
                      type="text"
                      name="kimpc_custom_calendar_client_id"
                      id="kimpc_custom_calendar_client_id"
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="wz-form-input"
                      style={{ fontSize: "0.82rem", background: "#ffffff" }}
                      placeholder={apiKeys.calendar?.defaultClientIdMasked ? `Example (Default): ${apiKeys.calendar.defaultClientIdMasked}` : "e.g. 1047648325603-...apps.googleusercontent.com"}
                      value={keyInputs.calendar.clientId}
                      onChange={(e) => setKeyInputs((p) => ({ ...p, calendar: { ...p.calendar, clientId: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                      GOOGLE_CALENDAR_CLIENT_SECRET
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input
                        type={revealSecrets.calendar ? "text" : "password"}
                        name="kimpc_custom_calendar_client_secret"
                        id="kimpc_custom_calendar_client_secret"
                        autoComplete="new-password"
                        autoCorrect="off"
                        spellCheck="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        className="wz-form-input"
                        style={{ fontSize: "0.82rem", background: "#ffffff", flex: 1 }}
                        placeholder={apiKeys.calendar?.defaultClientSecretMasked ? `Example (Default): ${apiKeys.calendar.defaultClientSecretMasked}` : "e.g. GOCSPX-..."}
                        value={keyInputs.calendar.clientSecret}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, calendar: { ...p.calendar, clientSecret: e.target.value } }))}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealSecrets((p) => ({ ...p, calendar: !p.calendar }))}
                        title={revealSecrets.calendar ? "Hide secret" : "Reveal secret"}
                        style={{
                          width: "38px",
                          height: "38px",
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: revealSecrets.calendar ? "#166534" : "#64748b",
                          flexShrink: 0,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {revealSecrets.calendar ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", display: "block", marginBottom: "4px" }}>
                    GOOGLE_CALENDAR_REDIRECT_URI
                  </label>
                  <input
                    type="text"
                    name="kimpc_custom_calendar_redirect_uri"
                    id="kimpc_custom_calendar_redirect_uri"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    className="wz-form-input"
                    style={{ fontSize: "0.82rem", background: "#ffffff" }}
                    placeholder={apiKeys.calendar?.defaultRedirectUri ? `Example (Default): ${apiKeys.calendar.defaultRedirectUri}` : "e.g. http://localhost:3000/api/calendar/callback"}
                    value={keyInputs.calendar.redirectUri}
                    onChange={(e) => setKeyInputs((p) => ({ ...p, calendar: { ...p.calendar, redirectUri: e.target.value } }))}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                    Leave blank or click Reset to Default to revert back to system code keys.
                  </span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    {apiKeys.calendar?.isCustom && (
                      <button
                        type="button"
                        onClick={handleResetCalendarKeys}
                        disabled={keySaving.calendar}
                        style={{
                          padding: "7px 14px",
                          background: "#fff1f2",
                          color: "#be123c",
                          border: "1px solid #fecdd3",
                          borderRadius: "8px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveCalendarKeys}
                      disabled={keySaving.calendar}
                      style={{
                        padding: "7px 16px",
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {keySaving.calendar ? "Saving to .env..." : "Save Credentials"}
                    </button>
                  </div>
                </div>

                {keyFeedback.calendar && (
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: keyFeedback.calendar.isError ? "#b91c1c" : "#15803d",
                      fontWeight: 600,
                    }}
                  >
                    {keyFeedback.calendar.message}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= 6-DIGIT ADMIN PIN & DEVELOPER DUAL-CONTROL MODAL ================= */}
        {pinModal.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: "20px",
            }}
            onClick={handleClosePinModal}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                width: "100%",
                maxWidth: devAuthStep ? "500px" : pinModal.isFirstPin ? "500px" : "460px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                border: "1px solid #e2e8f0",
                overflow: "hidden",
                transition: "max-width 0.2s ease",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {devAuthStep ? (
                /* ================= STEP 2: SYSTEM DEVELOPER DUAL-CONTROL AUTHORIZATION ================= */
                <div>
                  {/* Modal Header */}
                  <div
                    style={{
                      padding: "20px 24px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      background: "#f8fafc",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "12px",
                          background: devAuthStatus === "APPROVED" ? "#ecfdf5" : devAuthStatus === "DENIED" ? "#fef2f2" : "#fef3c7",
                          border: `1px solid ${devAuthStatus === "APPROVED" ? "#a7f3d0" : devAuthStatus === "DENIED" ? "#fecaca" : "#fde68a"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.3rem",
                          flexShrink: 0,
                        }}
                      >
                        {devAuthStatus === "APPROVED" ? "✓" : devAuthStatus === "DENIED" ? "✕" : "🛡️"}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                          {devAuthStatus === "APPROVED"
                            ? "Developer Authorization Granted"
                            : devAuthStatus === "DENIED"
                            ? "Authorization Denied"
                            : "System Developer Authorization"}
                        </h3>
                        <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                          Step 2 of 2: Developer Sign-Off Required
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClosePinModal}
                      style={{
                        background: "#f1f5f9",
                        border: "none",
                        borderRadius: "50%",
                        width: "30px",
                        height: "30px",
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        color: "#64748b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div style={{ padding: "22px 24px" }}>
                    {devAuthStatus === "APPROVED" ? (
                      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "24px 20px", textAlign: "center" }}>
                        <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", margin: "0 auto 12px", fontWeight: 900 }}>
                          ✓
                        </div>
                        <h4 style={{ margin: "0 0 6px", color: "#166534", fontSize: "1.08rem", fontWeight: 800 }}>
                          Authorized by System Developer!
                        </h4>
                        <p style={{ margin: 0, color: "#15803d", fontSize: "0.82rem" }}>
                          Developer approval confirmed. Unlocking integration configuration...
                        </p>
                      </div>
                    ) : devAuthStatus === "DENIED" ? (
                      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "24px 20px", textAlign: "center" }}>
                        <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", margin: "0 auto 12px", fontWeight: 900 }}>
                          ✕
                        </div>
                        <h4 style={{ margin: "0 0 6px", color: "#991b1b", fontSize: "1.08rem", fontWeight: 800 }}>
                          Authorization Request Denied
                        </h4>
                        <p style={{ margin: "0 0 16px", color: "#7f1d1d", fontSize: "0.82rem" }}>
                          The System Developer has blocked this modification request. Action aborted.
                        </p>
                        <button
                          type="button"
                          onClick={handleClosePinModal}
                          style={{
                            padding: "8px 20px",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#475569",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Close
                        </button>
                      </div>
                    ) : devAuthStatus === "EXPIRED" ? (
                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "24px 20px", textAlign: "center" }}>
                        <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⏱️</div>
                        <h4 style={{ margin: "0 0 6px", color: "#92400e", fontSize: "1.05rem", fontWeight: 800 }}>
                          Authorization Request Expired
                        </h4>
                        <p style={{ margin: "0 0 16px", color: "#b45309", fontSize: "0.82rem" }}>
                          The 15-minute authorization window elapsed before the developer responded.
                        </p>
                        <button
                          type="button"
                          onClick={() => startDeveloperAuthorization(pinModal.actionDescription, pinModal.onSuccess)}
                          style={{
                            padding: "8px 20px",
                            borderRadius: "8px",
                            border: "none",
                            background: "#d97706",
                            color: "#ffffff",
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ↻ Send New Request
                        </button>
                      </div>
                    ) : (
                      <div>
                        {/* Status info box */}
                        <div
                          style={{
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            borderRadius: "10px",
                            padding: "12px 14px",
                            marginBottom: "16px",
                            fontSize: "0.80rem",
                            color: "#166534",
                            lineHeight: 1.45,
                          }}
                        >
                          <strong>✓ Admin PIN Verified!</strong> An authorization request has been dispatched to the System Developer:
                          <div style={{ marginTop: "4px", fontFamily: "monospace", fontWeight: 700, color: "#0f172a", fontSize: "0.85rem" }}>
                            📧 {devAuthMaskedEmail}
                          </div>
                        </div>

                        {/* Animated pulsing spinner waiting card */}
                        <div
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                            padding: "20px 16px",
                            textAlign: "center",
                            marginBottom: "16px",
                          }}
                        >
                          <div
                            style={{
                              display: "inline-block",
                              width: "28px",
                              height: "28px",
                              border: "3px solid #cbd5e1",
                              borderTopColor: "#166534",
                              borderRadius: "50%",
                              animation: "spin 1s linear infinite",
                              marginBottom: "10px",
                            }}
                          />
                          <div style={{ fontSize: "0.90rem", fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>
                            Waiting for Developer to Click Authorize in Email...
                          </div>
                          <p style={{ margin: "0 0 12px", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.45 }}>
                            The System Developer can approve this request with a single click from their phone or computer. This window will automatically unlock.
                          </p>
                          <button
                            type="button"
                            onClick={handleManualCheckDevAuth}
                            disabled={devAuthChecking}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#0f172a",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              cursor: devAuthChecking ? "not-allowed" : "pointer",
                            }}
                          >
                            {devAuthChecking ? "Checking..." : "↻ Check Approval Status Now"}
                          </button>
                        </div>

                        {/* Alternative Direct OTP Entry */}
                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: showDevOtpInput ? "10px" : "0",
                            }}
                          >
                            <span style={{ fontSize: "0.80rem", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                              <span>🔑</span>
                              <span>Alternative: Enter 6-Digit Developer OTP</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowDevOtpInput(!showDevOtpInput)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#0284c7",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                padding: "2px 6px",
                              }}
                            >
                              {showDevOtpInput ? "Hide ▲" : "Show ▼"}
                            </button>
                          </div>

                          {showDevOtpInput && (
                            <form onSubmit={handleVerifyDevOtp} style={{ marginTop: "14px", textAlign: "center" }}>
                              <p style={{ margin: "0 0 10px", fontSize: "0.74rem", color: "#64748b" }}>
                                If the developer provided the 6-digit OTP code directly:
                              </p>
                              <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "10px" }} onPaste={handleDevOtpPaste}>
                                {devAuthOtpDigits.map((digit, idx) => (
                                  <input
                                    key={idx}
                                    ref={devOtpInputRefs[idx]}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handleDevOtpDigitChange(idx, e.target.value)}
                                    onKeyDown={(e) => handleDevOtpKeyDown(idx, e)}
                                    disabled={devAuthOtpLoading}
                                    autoFocus={idx === 0}
                                    style={{
                                      width: "42px",
                                      height: "48px",
                                      textAlign: "center",
                                      fontSize: "1.3rem",
                                      fontWeight: 800,
                                      color: "#0f172a",
                                      borderRadius: "10px",
                                      border: digit ? "2px solid #166534" : "1.5px solid #cbd5e1",
                                      background: digit ? "#f0fdf4" : "#ffffff",
                                      outline: "none",
                                    }}
                                  />
                                ))}
                              </div>

                              {devAuthOtpError && (
                                <div style={{ color: "#991b1b", fontSize: "0.76rem", fontWeight: 600, marginBottom: "10px" }}>
                                  ⚠️ {devAuthOtpError}
                                </div>
                              )}

                              <button
                                type="submit"
                                disabled={devAuthOtpLoading || devAuthOtpDigits.join("").length !== 6}
                                style={{
                                  padding: "8px 20px",
                                  borderRadius: "8px",
                                  border: "none",
                                  background: devAuthOtpDigits.join("").length === 6 ? "#166534" : "#94a3b8",
                                  color: "#ffffff",
                                  fontSize: "0.80rem",
                                  fontWeight: 700,
                                  cursor: devAuthOtpDigits.join("").length === 6 && !devAuthOtpLoading ? "pointer" : "not-allowed",
                                }}
                              >
                                {devAuthOtpLoading ? "Verifying OTP..." : "✓ Authorize with Developer OTP"}
                              </button>
                            </form>
                          )}
                        </div>

                        {/* Modal Footer Controls */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "18px", paddingTop: "14px", borderTop: "1px solid #f1f5f9" }}>
                          <button
                            type="button"
                            onClick={() => startDeveloperAuthorization(pinModal.actionDescription, pinModal.onSuccess)}
                            disabled={resendCooldown > 0 || pinLoading}
                            style={{
                              background: "none",
                              border: "none",
                              color: resendCooldown > 0 ? "#94a3b8" : "#166534",
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                              padding: 0,
                            }}
                          >
                            {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : "↻ Resend Authorization Email"}
                          </button>

                          <button
                            type="button"
                            onClick={handleClosePinModal}
                            style={{
                              padding: "8px 16px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#475569",
                              fontSize: "0.80rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ================= STEP 1: ADMIN 6-DIGIT PIN VERIFICATION ================= */
                <div>
                  {/* Modal Header */}
                  <div
                    style={{
                      padding: "20px 24px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      background: "#f8fafc",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "12px",
                          background: pinModal.isFirstPin ? "#eff6ff" : "#ecfdf5",
                          border: `1px solid ${pinModal.isFirstPin ? "#bfdbfe" : "#a7f3d0"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.3rem",
                          color: pinModal.isFirstPin ? "#2563eb" : "#059669",
                          flexShrink: 0,
                        }}
                      >
                        {pinModal.isFirstPin ? "🔑" : "🔒"}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>
                          {pinModal.isFirstPin ? "Create 6-Digit Admin PIN" : "6-Digit Security PIN"}
                        </h3>
                        <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                          {pinModal.isFirstPin
                            ? `First-time setup for ${user?.email || "administrator"}`
                            : "Step 1 of 2: Administrator Authorization"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={pinLoading}
                      onClick={handleClosePinModal}
                      style={{
                        background: "#f1f5f9",
                        border: "none",
                        borderRadius: "50%",
                        width: "30px",
                        height: "30px",
                        cursor: "pointer",
                        fontSize: "0.95rem",
                        color: "#64748b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Modal Body */}
                  <form onSubmit={pinModal.isFirstPin ? handleSetInitialPin : handleVerifyPin} style={{ padding: "22px 24px" }}>
                    {pinModal.isFirstPin ? (
                      <div
                        style={{
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: "10px",
                          padding: "12px 14px",
                          marginBottom: "18px",
                          fontSize: "0.80rem",
                          color: "#1e40af",
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>First-Time Setup:</strong> This admin account does not have a security PIN yet. Please create and confirm your personal 6-digit PIN before you can{" "}
                        <span style={{ fontWeight: 800, textDecoration: "underline" }}>
                          {pinModal.actionDescription}
                        </span>.
                      </div>
                    ) : (
                      <div
                        style={{
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: "10px",
                          padding: "12px 14px",
                          marginBottom: "18px",
                          fontSize: "0.80rem",
                          color: "#1e40af",
                          lineHeight: 1.4,
                        }}
                      >
                        <strong>Security Protection:</strong> Please enter your 6-digit PIN before you can{" "}
                        <span style={{ fontWeight: 800, textDecoration: "underline" }}>
                          {pinModal.actionDescription}
                        </span>.
                      </div>
                    )}

                    {/* 1st PIN Input Row */}
                    <div style={{ marginBottom: pinModal.isFirstPin ? "16px" : "14px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: "8px",
                          textAlign: "center",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {pinModal.isFirstPin ? "Step 1: Choose 6-Digit PIN" : "Enter 6-Digit Admin PIN"}
                      </label>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                        onPaste={handlePinPaste}
                      >
                        {pinDigits.map((digit, idx) => (
                          <input
                            key={idx}
                            ref={pinInputRefs[idx]}
                            type={showPin ? "text" : "password"}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                            onKeyDown={(e) => handlePinKeyDown(idx, e)}
                            disabled={pinLoading}
                            autoFocus={idx === 0}
                            style={{
                              width: "44px",
                              height: "50px",
                              textAlign: "center",
                              fontSize: "1.35rem",
                              fontWeight: "800",
                              color: "#0f172a",
                              borderRadius: "10px",
                              border: digit ? "2px solid #059669" : "1.5px solid #cbd5e1",
                              background: digit ? "#f0fdf4" : "#ffffff",
                              outline: "none",
                              transition: "all 0.15s ease",
                              boxShadow: digit ? "0 2px 4px rgba(5, 150, 105, 0.15)" : "none",
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* 2nd PIN Input Row (Only shown if isFirstPin) */}
                    {pinModal.isFirstPin && (
                      <div style={{ marginBottom: "16px" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.76rem",
                            fontWeight: 700,
                            color: "#475569",
                            marginBottom: "8px",
                            textAlign: "center",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Step 2: Confirm 6-Digit PIN
                        </label>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            gap: "8px",
                          }}
                          onPaste={handleConfirmPinPaste}
                        >
                          {confirmPinDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={confirmPinInputRefs[idx]}
                              type={showPin ? "text" : "password"}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handleConfirmPinDigitChange(idx, e.target.value)}
                              onKeyDown={(e) => handleConfirmPinKeyDown(idx, e)}
                              disabled={pinLoading}
                              style={{
                                width: "44px",
                                height: "50px",
                                textAlign: "center",
                                fontSize: "1.35rem",
                                fontWeight: "800",
                                color: "#0f172a",
                                borderRadius: "10px",
                                border: digit ? "2px solid #2563eb" : "1.5px solid #cbd5e1",
                                background: digit ? "#eff6ff" : "#ffffff",
                                outline: "none",
                                transition: "all 0.15s ease",
                                boxShadow: digit ? "0 2px 4px rgba(37, 99, 235, 0.15)" : "none",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show / Hide PIN Toggle & Helper note */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "16px",
                        padding: "0 4px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#0284c7",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {showPin ? "🙈 Hide digits" : "👁️ Show digits"}
                      </button>

                      <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {pinModal.isFirstPin ? "Must be exactly 6 digits" : (
                          <span>Default PIN: <strong style={{ color: "#0f172a" }}>123456</strong></span>
                        )}
                      </span>
                    </div>

                    {/* Error Message */}
                    {pinError && (
                      <div
                        style={{
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          color: "#991b1b",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          padding: "8px 12px",
                          borderRadius: "8px",
                          marginBottom: "16px",
                          textAlign: "center",
                        }}
                      >
                        ⚠️ {pinError}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
                      <button
                        type="button"
                        disabled={pinLoading}
                        onClick={handleClosePinModal}
                        style={{
                          padding: "9px 16px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#475569",
                          fontWeight: 600,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>

                      {pinModal.isFirstPin ? (
                        <button
                          type="submit"
                          disabled={pinLoading || pinDigits.join("").length !== 6 || confirmPinDigits.join("").length !== 6}
                          style={{
                            padding: "9px 20px",
                            borderRadius: "8px",
                            border: "none",
                            background: (pinDigits.join("").length === 6 && confirmPinDigits.join("").length === 6) ? "#2563eb" : "#94a3b8",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            cursor: (pinDigits.join("").length === 6 && confirmPinDigits.join("").length === 6) && !pinLoading ? "pointer" : "not-allowed",
                            boxShadow: (pinDigits.join("").length === 6 && confirmPinDigits.join("").length === 6) ? "0 2px 6px rgba(37, 99, 235, 0.25)" : "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {pinLoading ? "Setting PIN..." : "✓ Set PIN & Continue"}
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={pinLoading || pinDigits.join("").length !== 6}
                          style={{
                            padding: "9px 20px",
                            borderRadius: "8px",
                            border: "none",
                            background: pinDigits.join("").length === 6 ? "#059669" : "#94a3b8",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            cursor: pinDigits.join("").length === 6 && !pinLoading ? "pointer" : "not-allowed",
                            boxShadow: pinDigits.join("").length === 6 ? "0 2px 6px rgba(5, 150, 105, 0.25)" : "none",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {pinLoading ? "Verifying PIN..." : "✓ Verify PIN & Request Dev Auth"}
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
