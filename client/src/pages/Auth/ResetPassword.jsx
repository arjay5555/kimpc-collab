import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import "../../styles/login-coop.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  // Extract reset token from URL query string
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get("token") || "";

  // Component states
  const [tokenStatus, setTokenStatus] = useState("verifying"); // "verifying" | "valid" | "invalid"
  const [targetEmail, setTargetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", isError: false });
  const [resetSuccess, setResetSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // Apply no-referrer policy dynamically to protect reset token from leaking
  useEffect(() => {
    document.body.classList.add("coop-login-page");

    let meta = document.querySelector('meta[name="referrer"]');
    let created = false;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "referrer";
      meta.content = "no-referrer";
      document.head.appendChild(meta);
      created = true;
    } else {
      meta.content = "no-referrer";
    }

    return () => {
      document.body.classList.remove("coop-login-page");
      if (created && meta?.parentNode) {
        meta.parentNode.removeChild(meta);
      }
    };
  }, []);

  // Verify token validity on initial mount
  useEffect(() => {
    if (!token) {
      setTokenStatus("invalid");
      setFeedback({
        message: "No password reset token was provided in the link. Please request a new link.",
        isError: true,
      });
      return;
    }

    let isMounted = true;
    api(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!isMounted) return;
        if (res.ok && res.data?.valid) {
          setTokenStatus("valid");
          if (res.data?.email) setTargetEmail(res.data.email);
        } else {
          setTokenStatus("invalid");
          setFeedback({
            message:
              res.data?.error ||
              "This password reset link is invalid, has expired, or has already been used.",
            isError: true,
          });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setTokenStatus("invalid");
        setFeedback({
          message: "Could not verify token. Please check your network connection.",
          isError: true,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle countdown and auto-redirect upon successful password reset
  useEffect(() => {
    if (!resetSuccess) return;
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate("/login", { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [resetSuccess, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setFeedback({ message: "Please fill in all password fields.", isError: true });
      return;
    }

    if (newPassword.length < 6) {
      setFeedback({ message: "Password must be at least 6 characters.", isError: true });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ message: "Confirmation password does not match.", isError: true });
      return;
    }

    setIsSubmitting(true);
    setFeedback({ message: "", isError: false });

    try {
      const res = await api("/auth/reset-password", {
        method: "POST",
        body: {
          token,
          newPassword,
          confirmPassword,
        },
      });

      setIsSubmitting(false);

      if (res.ok) {
        setResetSuccess(true);
      } else {
        setFeedback({
          message: res.data?.error || "Could not reset password. Please request a new link.",
          isError: true,
        });
      }
    } catch {
      setIsSubmitting(false);
      setFeedback({
        message: "An unexpected error occurred. Please try again.",
        isError: true,
      });
    }
  };

  return (
    <div className="coop-login-page" style={{ minHeight: "100vh" }}>
      {/* Top Navigation Header */}
      <header className="coop-top-header">
        <div className="coop-header-left">
          <Link className="coop-brand-wrap" to="/">
            <img src="/images/kimpc logo.png" alt="KIMPC Logo" className="coop-brand-logo" />
            <div className="coop-brand-text">
              <span className="coop-brand-name">KIMPC</span>
              <span className="coop-brand-slash">/</span>
              <span className="coop-brand-dept">Machinery Rental</span>
            </div>
          </Link>
        </div>

        <nav className="coop-nav-links" aria-label="Main Navigation">
          <Link className="coop-nav-link" to="/login">Sign In</Link>
          <Link className="coop-nav-link" to="/forgot-password">Request Link</Link>
        </nav>
      </header>

      {/* Main Hero Stage Layout */}
      <main className="coop-login-stage">
        {/* Left Column: Reset Card */}
        <section className="coop-login-card" style={{ maxWidth: "480px" }}>
          <div className="coop-auth-view active">
            <div>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#166534",
                  marginBottom: "16px",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-1-1l2 2" />
                  <path d="M15.5 8.5l3.5 3.5" />
                  <circle cx="7.5" cy="16.5" r="4.5" />
                  <path d="M10.5 13.5L19 5" />
                </svg>
              </div>

              <h1 className="coop-login-headline" style={{ fontSize: "1.6rem" }}>
                Reset Your Password
              </h1>

              {tokenStatus === "verifying" && (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div
                    style={{
                      display: "inline-block",
                      width: "32px",
                      height: "32px",
                      border: "3px solid #e2e8f0",
                      borderTopColor: "#166534",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  ></div>
                  <p style={{ marginTop: "16px", fontSize: "0.88rem", color: "#64748b" }}>
                    Validating your secure reset link...
                  </p>
                </div>
              )}

              {tokenStatus === "invalid" && (
                <div>
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "12px",
                      padding: "20px",
                      textAlign: "center",
                      margin: "18px 0",
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        background: "#fee2e2",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 12px",
                        color: "#dc2626",
                      }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <h3 style={{ margin: "0 0 6px", fontSize: "1rem", color: "#991b1b", fontWeight: 700 }}>
                      Invalid or Expired Link
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.84rem", color: "#7f1d1d", lineHeight: 1.45 }}>
                      {feedback.message}
                    </p>
                  </div>

                  <Link
                    to="/forgot-password"
                    className="btn-coop-harvest"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                      marginTop: "16px",
                    }}
                  >
                    <span>Request a New Reset Link</span>
                  </Link>

                  <p className="coop-card-footer" style={{ marginTop: "20px" }}>
                    <Link className="coop-join-link" to="/login">
                      &larr; Back to Sign In
                    </Link>
                  </p>
                </div>
              )}

              {tokenStatus === "valid" && !resetSuccess && (
                <div>
                  <p className="coop-auth-subtext" style={{ marginBottom: "20px" }}>
                    {targetEmail ? (
                      <>
                        Resetting password for: <strong>{targetEmail}</strong>
                      </>
                    ) : (
                      "Please choose a strong, new password for your account."
                    )}
                  </p>

                  <form className="coop-login-form" onSubmit={handleSubmit} autoComplete="off">
                    {/* Dummy fields to avoid auto-fill */}
                    <input type="text" name="fake_user" style={{ display: "none" }} tabIndex="-1" autoComplete="off" />
                    <input type="password" name="fake_pwd" style={{ display: "none" }} tabIndex="-1" autoComplete="new-password" />

                    <div className="coop-pill-input-wrap">
                      <input
                        id="reset-new-password"
                        name="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        className="coop-pill-input coop-password-input"
                        placeholder="New Password (at least 6 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        required
                        autoFocus
                        autoComplete="new-password"
                        aria-label="New Password"
                      />
                      <button
                        type="button"
                        className="coop-pwd-eye-btn"
                        title={showNewPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        tabIndex="-1"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {showNewPassword ? (
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

                    <div className="coop-pill-input-wrap">
                      <input
                        id="reset-confirm-password"
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        className="coop-pill-input coop-password-input"
                        placeholder="Confirm New Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={6}
                        required
                        autoComplete="new-password"
                        aria-label="Confirm New Password"
                      />
                      <button
                        type="button"
                        className="coop-pwd-eye-btn"
                        title={showConfirmPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        tabIndex="-1"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {showConfirmPassword ? (
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

                    <button
                      className="btn-coop-harvest"
                      type="submit"
                      disabled={isSubmitting}
                      id="btn-reset-submit"
                      style={{ marginTop: "12px" }}
                    >
                      <span>{isSubmitting ? "Updating Password..." : "Set New Password"}</span>
                    </button>

                    {feedback.message && feedback.isError && (
                      <div
                        className="form-feedback error"
                        style={{
                          background: "#fef2f2",
                          color: "#991b1b",
                          border: "1px solid #fecaca",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          fontSize: "0.84rem",
                          marginTop: "12px",
                        }}
                        role="alert"
                      >
                        {feedback.message}
                      </div>
                    )}
                  </form>

                  <p className="coop-card-footer" style={{ marginTop: "24px" }}>
                    Remembered password?{" "}
                    <Link className="coop-join-link" to="/login">
                      Back to Sign In
                    </Link>
                  </p>
                </div>
              )}

              {resetSuccess && (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      background: "#dcfce7",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                      color: "#166534",
                    }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 style={{ margin: "0 0 8px", fontSize: "1.2rem", color: "#166534", fontWeight: 700 }}>
                    Password Reset Complete!
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "#334155", lineHeight: 1.5 }}>
                    Your password has been successfully updated. All previous active sessions have been signed out.
                  </p>
                  <p style={{ margin: "16px 0 20px", fontSize: "0.82rem", color: "#64748b" }}>
                    Redirecting to sign in page in <strong>{redirectCountdown}</strong> seconds...
                  </p>

                  <Link
                    to="/login"
                    className="btn-coop-harvest"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                    }}
                  >
                    <span>Log In Now</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
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
    </div>
  );
}
