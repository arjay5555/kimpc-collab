import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api, getDashboardForRole } from "../../services/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, register, verifyEmail, forgotPassword, changeTempPassword, completeSignIn } = useAuth();

  // Mode: "login" | "signup" | "verify"
  const [mode, setMode] = useState("login");

  // Form states
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState({ message: "", isError: false });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Sign up form states
  const [regFullName, setRegFullName] = useState("");
  const [regCoopId, setRegCoopId] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regTerms, setRegTerms] = useState(true);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [signupFeedback, setSignupFeedback] = useState({ message: "", isError: false });
  const [isRegistering, setIsRegistering] = useState(false);

  // Verification state
  const [verifyTargetEmail, setVerifyTargetEmail] = useState("");
  const [verifyFeedback, setVerifyFeedback] = useState({ message: "", isError: false });
  const [isVerifying, setIsVerifying] = useState(false);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotFeedback, setForgotFeedback] = useState({ message: "", isError: false });
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);

  // Social login flags
  const DEFAULT_GOOGLE_CLIENT_ID = "1042055157169-ijq2fs7mffqjscvro4eli4928iq0nii4.apps.googleusercontent.com";
  const [googleEnabled, setGoogleEnabled] = useState(true);
  const [googleClientId, setGoogleClientId] = useState(DEFAULT_GOOGLE_CLIENT_ID);
  const [facebookEnabled, setFacebookEnabled] = useState(true);
  const [facebookAppId, setFacebookAppId] = useState("4031349940338782");
  const [recaptchaEnabled, setRecaptchaEnabled] = useState(true);
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState("6LfrJe0tAAAAAIIeW87yfUlJuzJOokkWT4KM6UG5");
  const recaptchaWidgetRef = useRef(null);

  // Set body class for background image styling
  useEffect(() => {
    document.body.classList.add("coop-login-page");
    return () => {
      document.body.classList.remove("coop-login-page");
    };
  }, []);

  useEffect(() => {
    if (user && user.role) {
      navigate(getDashboardForRole(user.role), { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (location.hash === "#signup" || location.hash === "#register") {
      setMode("signup");
    } else {
      setMode("login");
    }
    setLoginIdentifier("");
    setLoginPassword("");
  }, [location.hash]);

  useEffect(() => {
    api("/config").then(({ ok, data }) => {
      if (ok && data) {
        setGoogleEnabled(data.googleLoginEnabled !== false);
        setFacebookEnabled(data.facebookLoginEnabled !== false);
        setRecaptchaEnabled(data.recaptchaEnabled !== false);
        if (data.recaptchaSiteKey) setRecaptchaSiteKey(data.recaptchaSiteKey);
        if (data.googleClientId) setGoogleClientId(data.googleClientId.trim());
        if (data.facebookAppId) setFacebookAppId(data.facebookAppId.trim());
      }
    });
  }, []);

  // Dynamically render reCAPTCHA v2 widget
  useEffect(() => {
    if (mode !== "login" || !recaptchaEnabled) return;

    let timer;
    const tryRender = () => {
      const container = document.getElementById("login-recaptcha");
      if (container && window.grecaptcha && typeof window.grecaptcha.render === "function") {
        if (!container.hasChildNodes()) {
          try {
            recaptchaWidgetRef.current = window.grecaptcha.render("login-recaptcha", {
              sitekey: recaptchaSiteKey,
            });
          } catch {
            // Already rendered or in progress
          }
        }
      }
    };

    timer = setInterval(tryRender, 400);
    return () => clearInterval(timer);
  }, [mode, recaptchaEnabled, recaptchaSiteKey]);

  useEffect(() => {
    if (mode === "signup" && !regCoopId) {
      api("/cooperative-id/next").then((res) => {
        if (res.ok && res.data?.cooperativeId) {
          setRegCoopId(res.data.cooperativeId);
        }
      }).catch(() => {});
    }
  }, [mode, regCoopId]);

  useEffect(() => {
    window.fbAsyncInit = function () {
      if (typeof window.FB !== "undefined") {
        window.FB.init({
          appId: facebookAppId,
          cookie: true,
          xfbml: true,
          version: "v20.0",
        });
      }
    };
  }, [facebookAppId]);

  useEffect(() => {
    if (!googleEnabled || !googleClientId) return;

    let timer;
    const tryInitGoogle = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCallback,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          clearInterval(timer);
        } catch (err) {
          console.error("Google init error", err);
        }
      }
    };

    timer = setInterval(tryInitGoogle, 300);
    return () => clearInterval(timer);
  }, [googleEnabled, googleClientId]);

  const handleGoogleCallback = async (response) => {
    if (!response.credential) return;
    setLoginFeedback({ message: "Verifying Google account with KIMPC...", isError: false });

    const { ok, data } = await api("/auth/google", {
      method: "POST",
      body: { credential: response.credential },
    });

    if (!ok) {
      const errMsg = data.error || "Google sign-in failed.";
      const isWaiting = errMsg.toLowerCase().includes("waiting for verification");
      setLoginFeedback({
        message: isWaiting ? "waiting for verification" : errMsg,
        isWaitingVerification: isWaiting,
        isError: true,
      });
      return;
    }

    const signedInUser = completeSignIn(data);
    navigate(getDashboardForRole(signedInUser.role));
  };

  const handleQuickGoogle = async () => {
    if (!googleEnabled) {
      alert("Log in with Google is currently disabled by administrator.");
      return;
    }

    let activeClientId = (googleClientId || DEFAULT_GOOGLE_CLIENT_ID).trim();
    if (!activeClientId) {
      try {
        const { ok, data } = await api("/config");
        if (ok && data?.googleClientId) {
          activeClientId = data.googleClientId.trim();
          setGoogleClientId(activeClientId);
        }
      } catch (err) {
        console.warn("Could not retrieve config", err);
      }
    }

    if (!activeClientId) {
      activeClientId = DEFAULT_GOOGLE_CLIENT_ID;
      setGoogleClientId(activeClientId);
    }

    setLoginFeedback({ message: "Opening Google Sign-In...", isError: false });

    // Ensure Google Identity Services script is loaded
    if (!window.google?.accounts?.oauth2) {
      setLoginFeedback({ message: "Connecting to Google...", isError: false });
      let loaded = false;
      for (let i = 0; i < 20; i++) {
        if (window.google?.accounts?.oauth2) {
          loaded = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    // Prefer OAuth2 popup client for custom circular button
    if (window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: activeClientId,
          scope: "email profile openid",
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              setLoginFeedback({ message: `Google Sign-In canceled or closed (${tokenResponse.error}).`, isError: true });
              return;
            }
            try {
              setLoginFeedback({ message: "Verifying Google account with KIMPC...", isError: false });
              const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              const profile = await userRes.json();
              if (!profile.email) {
                setLoginFeedback({ message: "Could not retrieve email from Google account.", isError: true });
                return;
              }

              const { ok, data } = await api("/auth/google", {
                method: "POST",
                body: {
                  email: profile.email,
                  fullName: profile.name || profile.given_name || "Google Member",
                },
              });

              if (!ok) {
                const errMsg = data.error || "Google sign-in failed.";
                const isWaiting = errMsg.toLowerCase().includes("waiting for verification");
                setLoginFeedback({
                  message: isWaiting ? "waiting for verification" : errMsg,
                  isWaitingVerification: isWaiting,
                  isError: true,
                });
                return;
              }

              const signedInUser = completeSignIn(data);
              navigate(getDashboardForRole(signedInUser.role));
            } catch (err) {
              console.error(err);
              setLoginFeedback({ message: "Failed to process Google sign-in response.", isError: true });
            }
          },
        });
        tokenClient.requestAccessToken({ prompt: "select_account" });
        return;
      } catch (err) {
        console.warn("OAuth2 initTokenClient error:", err);
      }
    }

    // Fallback to Google One Tap
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          setLoginFeedback({
            message: `Google Sign-In could not be displayed (${notification.getNotDisplayedReason() || "origin_mismatch"}).`,
            isError: true,
          });
        }
      });
    } else {
      setLoginFeedback({ message: "Google Sign-In is still loading. Please retry in a moment.", isError: true });
    }
  };

  const handleQuickFacebook = () => {
    if (!facebookEnabled) {
      alert("Log in with Facebook is currently disabled by administrator.");
      return;
    }

    setLoginFeedback({ message: "Opening Facebook login...", isError: false });

    if (typeof window.FB === "undefined") {
      setLoginFeedback({ message: "Facebook SDK loading. Please ensure ad-blocker is disabled or retry in a moment.", isError: true });
      return;
    }

    window.FB.login(
      (response) => {
        if (response.authResponse) {
          const { accessToken, userID } = response.authResponse;
          setLoginFeedback({ message: "Verifying Facebook credentials with KIMPC...", isError: false });

          api("/auth/facebook", {
            method: "POST",
            body: { accessToken, userID },
          }).then(({ ok, data }) => {
            if (!ok) {
              const errMsg = data.error || "Facebook sign-in failed.";
              const isWaiting = errMsg.toLowerCase().includes("waiting for verification");
              setLoginFeedback({
                message: isWaiting ? "waiting for verification" : errMsg,
                isWaitingVerification: isWaiting,
                isError: true,
              });
              return;
            }
            const signedInUser = completeSignIn(data);
            navigate(getDashboardForRole(signedInUser.role));
          });
        } else {
          setLoginFeedback({ message: "Facebook login was cancelled or not authorized.", isError: true });
        }
      },
      { scope: "public_profile,email" }
    );
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) {
      setLoginFeedback({ message: "Please fill in all required fields.", isError: true });
      return;
    }

    let recaptchaToken = "";
    if (recaptchaEnabled) {
      if (typeof window.grecaptcha !== "undefined" && window.grecaptcha.getResponse) {
        try {
          recaptchaToken =
            (recaptchaWidgetRef.current !== null
              ? window.grecaptcha.getResponse(recaptchaWidgetRef.current)
              : "") || window.grecaptcha.getResponse();
        } catch {
          recaptchaToken = window.grecaptcha.getResponse();
        }
      }
      if (!recaptchaToken) {
        setLoginFeedback({ message: "Please check the 'I\'m not a robot' reCAPTCHA box.", isError: true });
        return;
      }
    }

    setIsLoggingIn(true);
    setLoginFeedback({ message: "Signing in...", isError: false });

    const { ok, data } = await login(loginIdentifier.trim(), loginPassword, recaptchaToken);
    setIsLoggingIn(false);

    if (!ok) {
      const errMsg = data.error || "Could not sign in.";
      const isWaiting = errMsg.toLowerCase().includes("waiting for verification");
      setLoginFeedback({
        message: isWaiting ? "waiting for verification" : errMsg,
        isWaitingVerification: isWaiting,
        isError: true,
      });
      if (typeof window.grecaptcha !== "undefined" && window.grecaptcha.reset) {
        window.grecaptcha.reset();
      }
      return;
    }

    const signedInUser = completeSignIn(data);
    navigate(getDashboardForRole(signedInUser.role));
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regFullName.trim()) {
      setSignupFeedback({ message: "Please enter your full name.", isError: true });
      return;
    }
    if (!regCoopId.trim() || !/^M\d{2}\d{4}$/i.test(regCoopId.trim())) {
      setSignupFeedback({
        message: "Cooperative No ID must follow the format M(Year)(Sequence), for example M260001.",
        isError: true,
      });
      return;
    }
    if (!regEmail.trim()) {
      setSignupFeedback({ message: "Please enter your email address.", isError: true });
      return;
    }
    if (regPassword.length < 6) {
      setSignupFeedback({ message: "Password must be at least 6 characters.", isError: true });
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setSignupFeedback({ message: "Passwords do not match.", isError: true });
      return;
    }

    setIsRegistering(true);
    setSignupFeedback({ message: "Creating your member account...", isError: false });

    const { ok, data } = await register({
      fullName: regFullName.trim(),
      cooperativeId: regCoopId.trim(),
      email: regEmail.trim().toLowerCase(),
      password: regPassword,
    });

    setIsRegistering(false);

    if (!ok) {
      setSignupFeedback({ message: data.error || "Could not create account.", isError: true });
      return;
    }

    setMode("login");
    setLoginIdentifier("");
    setLoginPassword("");
    setLoginFeedback({
      message: "waiting for verification",
      isWaitingVerification: true,
      isError: true,
    });
  };

  const handleVerifySubmit = async () => {
    if (!verifyTargetEmail) {
      setVerifyFeedback({ message: "No email found to verify.", isError: true });
      return;
    }

    setIsVerifying(true);
    setVerifyFeedback({ message: "Verifying member account...", isError: false });

    const { ok, data } = await verifyEmail(verifyTargetEmail);
    setIsVerifying(false);

    if (!ok) {
      setVerifyFeedback({ message: data.error || "Could not verify account.", isError: true });
      return;
    }

    setVerifyFeedback({ message: "Account verified! Redirecting to login...", isError: false });
    setTimeout(() => {
      setMode("login");
      setLoginIdentifier("");
      setLoginPassword("");
      setLoginFeedback({
        message: `Account activated! You can now log in using your Cooperative No. ID (${data.cooperativeId || verifyTargetEmail}) or Email.`,
        isError: false,
      });
    }, 900);
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    const cleanId = forgotIdentifier.trim();
    if (!cleanId) {
      setForgotFeedback({ message: "Please enter your registered email address.", isError: true });
      return;
    }

    setIsSubmittingForgot(true);
    setForgotFeedback({ message: "Sending password reset link...", isError: false });

    try {
      const res = await api("/auth/forgot-password", {
        method: "POST",
        body: { email: cleanId },
      });
      setIsSubmittingForgot(false);

      if (res.ok) {
        setForgotFeedback({
          message: res.data?.message || "If an eligible account exists for this email, we’ll send a password reset link.",
          isError: false,
        });
        setTimeout(() => {
          setShowForgotModal(false);
        }, 3000);
      } else {
        setForgotFeedback({
          message: res.data?.error || "Could not process request. Please try again.",
          isError: true,
        });
      }
    } catch {
      setIsSubmittingForgot(false);
      setForgotFeedback({ message: "Network error. Please try again.", isError: true });
    }
  };

  return (
    <div className="coop-login-page" style={{ minHeight: "100vh" }}>
      {/* Top Navigation Header */}
      <header className="coop-top-header">
        <div className="coop-header-left">
          <a className="coop-brand-wrap" href="/">
            <img src="/images/kimpc logo.png" alt="KIMPC Logo" className="coop-brand-logo" />
            <div className="coop-brand-text">
              <span className="coop-brand-name">KIMPC</span>
              <span className="coop-brand-slash">/</span>
              <span className="coop-brand-dept">Machinery Rental</span>
            </div>
          </a>
        </div>

        <nav className="coop-nav-links" aria-label="Main Navigation">
          <a className="coop-nav-link" href="#machinery">Available Fleet</a>
          <a className="coop-nav-link" href="#how-it-works">How It Works</a>
          <a className="coop-nav-link" href="#cooperative">Cooperative Benefits</a>
          <a className="coop-nav-link" href="#contact">Contact</a>
        </nav>
      </header>

      {/* Main Hero Stage Layout */}
      <main className="coop-login-stage">
        {/* Left Column: Unified Auth Card */}
        <section className={`coop-login-card ${mode === "signup" ? "signup-mode" : ""}`} id="login">
          {/* VIEW 1: Log In Container */}
          {mode === "login" && (
            <div id="login-view" className="coop-auth-view active">
              <div>
                <h1 className="coop-login-headline">Welcome to KIMPC</h1>
                <p className="coop-auth-subtext">Access your cooperative machinery rental portal.</p>

                <form id="member-login-form" className="coop-login-form" onSubmit={handleLoginSubmit} autoComplete="off">
                  {/* Hidden dummy fields to prevent aggressive browser autofill */}
                  <input type="text" name="prevent_autofill_user" style={{ display: "none" }} aria-hidden="true" tabIndex="-1" autoComplete="off" />
                  <input type="password" name="prevent_autofill_pwd" style={{ display: "none" }} aria-hidden="true" tabIndex="-1" autoComplete="new-password" />

                  <div className="coop-pill-input-wrap">
                    <input
                      id="member-login-identifier"
                      name="loginIdentifier"
                      type="text"
                      className="coop-pill-input"
                      placeholder="Cooperative No. ID or Email"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      autoComplete="off"
                      required
                      aria-label="Cooperative No. ID or Email"
                    />
                  </div>

                  <div className="coop-pill-input-wrap">
                    <input
                      id="member-login-password"
                      name="loginPassword"
                      type={showLoginPassword ? "text" : "password"}
                      className="coop-pill-input coop-password-input"
                      placeholder="Password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      aria-label="Password"
                    />
                    <button
                      type="button"
                      id="toggle-password-btn"
                      className="coop-pwd-eye-btn"
                      title={showLoginPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {showLoginPassword ? (
                          <>
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                            <line x1="2" y1="2" x2="22" y2="22"></line>
                          </>
                        ) : (
                          <>
                            <path d="M1 12s4-8 11-8 8 8 8 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </>
                        )}
                      </svg>
                    </button>
                  </div>

                  <div className="coop-login-meta">
                    <label className="coop-remember-label">
                      <input
                        type="checkbox"
                        id="remember-me"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Remember me</span>
                    </label>
                    <Link
                      to="/forgot-password"
                      className="coop-forgot-link"
                    >
                      Forgot Password?
                    </Link>
                  </div>

                  {recaptchaEnabled && (
                    <div className="coop-recaptcha-wrap">
                      <div className="g-recaptcha" id="login-recaptcha" data-sitekey="6LfrJe0tAAAAAIIeW87yfUlJuzJOokkWT4KM6UG5"></div>
                    </div>
                  )}

                  <button className="btn-coop-harvest" type="submit" disabled={isLoggingIn} id="btn-login-submit">
                    <span>{isLoggingIn ? "Logging in..." : "Log In"}</span>
                  </button>

                  {loginFeedback.message && (
                    <div
                      className={`form-feedback ${loginFeedback.isError ? "error" : ""}`}
                      style={
                        loginFeedback.isWaitingVerification || loginFeedback.message.toLowerCase().includes("waiting for verification")
                          ? {
                              background: "#fef3c7",
                              color: "#92400e",
                              border: "1px solid #fde68a",
                              padding: "10px 14px",
                              borderRadius: "10px",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              justifyContent: "center",
                              marginTop: "12px",
                              fontSize: "0.86rem",
                            }
                          : {}
                      }
                      role="status"
                    >
                      {(loginFeedback.isWaitingVerification || loginFeedback.message.toLowerCase().includes("waiting for verification")) && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 14 14" />
                        </svg>
                      )}
                      <span>{loginFeedback.message}</span>
                    </div>
                  )}
                </form>

                {(googleEnabled || facebookEnabled) && (
                  <div className="coop-auth-divider" id="login-google-divider">
                    <span>or continue with</span>
                  </div>
                )}

                <div className="coop-social-row">
                  {googleEnabled && (
                    <button type="button" className="coop-circle-btn btn-google" onClick={handleQuickGoogle} title="Sign in with Google">
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                      </svg>
                    </button>
                  )}

                  {facebookEnabled && (
                    <button type="button" className="coop-circle-btn btn-facebook" onClick={handleQuickFacebook} title="Sign in with Facebook">
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <p className="coop-card-footer">
                First time here?{" "}
                <a
                  className="coop-join-link"
                  href="#signup"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("signup");
                  }}
                >
                  Set up your Member Account
                </a>
              </p>
            </div>
          )}

          {/* VIEW 2: Sign Up Container */}
          {mode === "signup" && (
            <div id="signup-view" className="coop-auth-view active">
              <div>
                <h1 className="coop-login-headline">Register an Account</h1>
                <p className="coop-auth-subtext">Register your account to access cooperative machinery.</p>

                <form id="coop-registration-form" className="coop-login-form" onSubmit={handleRegisterSubmit} autoComplete="off">
                  <div className="coop-pill-input-wrap">
                    <input
                      id="reg-full-name"
                      name="fullName"
                      type="text"
                      className="coop-pill-input"
                      placeholder="Full Name"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>

                  <div className="coop-pill-input-wrap">
                    <input
                      id="reg-coop-id"
                      name="cooperativeId"
                      type="text"
                      className="coop-pill-input"
                      placeholder="Cooperative No ID (e.g. M260001)"
                      value={regCoopId}
                      onChange={(e) => setRegCoopId(e.target.value)}
                      pattern="^[Mm]\d{6}$"
                      title="Format: M followed by 2-digit year and 4-digit sequence, e.g. M260001"
                      required
                    />
                  </div>

                  <div className="coop-pill-input-wrap">
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      className="coop-pill-input"
                      placeholder="Email Address"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="coop-input-row">
                    <div className="coop-pill-input-wrap">
                      <input
                        id="reg-password"
                        name="password"
                        type={showRegPassword ? "text" : "password"}
                        className="coop-pill-input coop-password-input"
                        placeholder="Create Password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        className="coop-pwd-eye-btn"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 8 8 8 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                    </div>

                    <div className="coop-pill-input-wrap">
                      <input
                        id="reg-confirm-password"
                        name="confirmPassword"
                        type={showRegConfirmPassword ? "text" : "password"}
                        className="coop-pill-input coop-password-input"
                        placeholder="Confirm Password"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        className="coop-pwd-eye-btn"
                        onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 8 8 8 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="coop-login-meta" style={{ marginBottom: "12px" }}>
                    <label className="coop-remember-label">
                      <input
                        type="checkbox"
                        checked={regTerms}
                        onChange={(e) => setRegTerms(e.target.checked)}
                        required
                      />
                      <span>I agree to the terms for creating a digital account</span>
                    </label>
                  </div>

                  <button className="btn-coop-harvest" type="submit" disabled={isRegistering} id="btn-register-submit">
                    <span>{isRegistering ? "Creating Account..." : "Create Member Account"}</span>
                  </button>

                  {signupFeedback.message && (
                    <p className={`form-feedback ${signupFeedback.isError ? "error" : ""}`} role="status">
                      {signupFeedback.message}
                    </p>
                  )}
                </form>

                {(googleEnabled || facebookEnabled) && (
                  <>
                    <div className="coop-auth-divider">
                      <span>or sign up with</span>
                    </div>
                    <div className="coop-social-row">
                      {googleEnabled && (
                        <button type="button" className="coop-circle-btn btn-google" onClick={handleQuickGoogle} title="Sign up with Google">
                          <svg viewBox="0 0 24 24" width="22" height="22">
                            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                          </svg>
                        </button>
                      )}
                      {facebookEnabled && (
                        <button type="button" className="coop-circle-btn btn-facebook" onClick={handleQuickFacebook} title="Sign up with Facebook">
                          <svg viewBox="0 0 24 24" width="22" height="22">
                            <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              <p className="coop-card-footer">
                Already a registered member?{" "}
                <a
                  className="coop-join-link"
                  href="#login"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("login");
                  }}
                >
                  Log In
                </a>
              </p>
            </div>
          )}

          {/* VIEW 3: Email Verification */}
          {mode === "verify" && (
            <div id="verify-view" className="coop-auth-view active">
              <div>
                <div className="coop-verify-card">
                  <div className="coop-verify-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                  </div>
                  <h2 className="coop-verify-title">Verify Your Email</h2>
                  <p className="coop-verify-desc">
                    Your member account was created. Please confirm your email address to activate your account:
                  </p>
                  <div className="coop-verify-email-badge">{verifyTargetEmail}</div>
                </div>

                <button
                  className="btn-coop-harvest"
                  type="button"
                  onClick={handleVerifySubmit}
                  disabled={isVerifying}
                  id="btn-verify-submit"
                >
                  <span>{isVerifying ? "Verifying..." : "Confirm Email & Activate Account"}</span>
                </button>

                {verifyFeedback.message && (
                  <p className={`form-feedback ${verifyFeedback.isError ? "error" : ""}`} role="status">
                    {verifyFeedback.message}
                  </p>
                )}
              </div>

              <p className="coop-card-footer">
                <a
                  className="coop-join-link"
                  href="#login"
                  onClick={(e) => {
                    e.preventDefault();
                    setMode("login");
                  }}
                >
                  &larr; Return to Sign In
                </a>
              </p>
            </div>
          )}
        </section>

        {/* Right Column: Floating Active Fleet Stats Card (Glassmorphism) */}
        <div className="coop-floating-widget-wrap">
          <aside className="coop-floating-card">
            <div className="coop-float-header">
              <span className="coop-float-title">Active Fleet This Week</span>
              <div className="coop-float-nav">
                <span className="coop-nav-dot active"></span>
                <span className="coop-nav-dot"></span>
                <span className="coop-nav-dot"></span>
                <span style={{ marginLeft: "2px", fontWeight: "700", cursor: "pointer" }}>&rsaquo;</span>
              </div>
            </div>

            <div className="coop-stats-grid">
              <div className="coop-stat-cell">
                <strong className="coop-stat-num">14</strong>
                <span className="coop-stat-lbl">Tractors<br />Available</span>
              </div>
              <div className="coop-stat-cell">
                <strong className="coop-stat-num">6</strong>
                <span className="coop-stat-lbl">Harvesters</span>
              </div>
              <div className="coop-stat-cell">
                <strong className="coop-stat-num">20+</strong>
                <span className="coop-stat-lbl">Implements</span>
              </div>
              <div className="coop-stat-cell">
                <strong className="coop-stat-num">24/7</strong>
                <span className="coop-stat-lbl">Happy<br />Farmers</span>
              </div>
            </div>

            <p className="coop-floating-quote">
              Fast, reliable, and<br />
              shared by our<br />
              community.
            </p>
          </aside>
        </div>
      </main>

      {/* Forgot Password Request Dialog */}
      {showForgotModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              width: "100%",
              maxWidth: "440px",
              padding: "24px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#0d9488", margin: "0 0 4px" }}>
                  Account Recovery
                </p>
                <h3 style={{ margin: 0, fontSize: "1.2rem", color: "#0f172a" }}>Forgot Password?</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#64748b", lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
            <p style={{ fontSize: "0.82rem", color: "#475569", margin: "0 0 16px", lineHeight: 1.45 }}>
              Enter your Cooperative No. ID or registered email address. We will send a secure link to reset your password to the registered email associated with your account.
            </p>
            <form onSubmit={handleForgotSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Cooperative No. ID or Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="Cooperative No. ID or Email"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: "0.86rem", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box" }}
                />
              </div>

              {forgotFeedback.message && (
                <p className={`form-feedback ${forgotFeedback.isError ? "error" : ""}`} style={{ margin: 0, fontSize: "0.78rem" }}>
                  {forgotFeedback.message}
                </p>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="button button-outline"
                  style={{ flex: 1, padding: "8px 14px", fontSize: "0.82rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForgot}
                  className="button button-primary"
                  style={{ flex: 1.4, padding: "8px 14px", fontSize: "0.82rem" }}
                >
                  {isSubmittingForgot ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Password / Set Permanent Password Modal */}
      {showTempModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              width: "100%",
              maxWidth: "440px",
              padding: "24px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ marginBottom: "14px" }}>
              <div style={{ display: "inline-block", padding: "3px 8px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", background: "#fef3c7", color: "#92400e", borderRadius: "4px", marginBottom: "6px" }}>
                Temporary Access Key Detected
              </div>
              <h3 style={{ margin: 0, fontSize: "1.22rem", color: "#0f172a" }}>Set Permanent Password</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#475569", lineHeight: 1.45 }}>
                You logged in using a temporary One-Time Password. For your security, you must choose a new permanent password to access your dashboard.
              </p>
            </div>
            <form onSubmit={handleSaveTempPassword} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  New Password
                </label>
                <input
                  type="password"
                  minLength={6}
                  required
                  placeholder="At least 6 characters"
                  value={tempNewPassword}
                  onChange={(e) => setTempNewPassword(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: "0.86rem", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  minLength={6}
                  required
                  placeholder="Re-type new password"
                  value={tempConfirmPassword}
                  onChange={(e) => setTempConfirmPassword(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: "0.86rem", border: "1px solid #cbd5e1", borderRadius: "8px", boxSizing: "border-box" }}
                />
              </div>

              {tempFeedback.message && (
                <p className={`form-feedback ${tempFeedback.isError ? "error" : ""}`} style={{ margin: 0, fontSize: "0.78rem" }}>
                  {tempFeedback.message}
                </p>
              )}

              <button
                type="submit"
                disabled={isSavingTemp}
                className="button button-primary"
                style={{ width: "100%", padding: "9px 16px", fontSize: "0.84rem", marginTop: "4px" }}
              >
                {isSavingTemp ? "Setting Password..." : "Set Password & Continue →"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
