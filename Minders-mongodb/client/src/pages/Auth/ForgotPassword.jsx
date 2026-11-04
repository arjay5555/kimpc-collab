import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import "../../styles/login-coop.css";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", isError: false, isSuccess: false });

  useEffect(() => {
    document.body.classList.add("coop-login-page");
    return () => {
      document.body.classList.remove("coop-login-page");
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanId = identifier.trim();

    if (!cleanId) {
      setFeedback({
        message: "Please enter your Cooperative No. ID or registered email.",
        isError: true,
        isSuccess: false,
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback({ message: "", isError: false, isSuccess: false });

    try {
      const res = await api("/auth/forgot-password", {
        method: "POST",
        body: { identifier: cleanId },
      });

      setIsSubmitting(false);

      if (res.ok) {
        setFeedback({
          message:
            res.data?.message ||
            "If an eligible account exists for this Cooperative No. ID or email, we’ve sent a password reset link to the registered email address.",
          isError: false,
          isSuccess: true,
        });
        setIdentifier("");
      } else {
        setFeedback({
          message: res.data?.error || "Could not process request. Please try again.",
          isError: true,
          isSuccess: false,
        });
      }
    } catch {
      setIsSubmitting(false);
      setFeedback({
        message: "Connection error. Please verify your network and try again.",
        isError: true,
        isSuccess: false,
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
          <Link className="coop-nav-link" to="/login#signup">Register</Link>
        </nav>
      </header>

      {/* Main Hero Stage Layout */}
      <main className="coop-login-stage">
        {/* Left Column: Auth Card */}
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
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>

              <h1 className="coop-login-headline" style={{ fontSize: "1.6rem" }}>
                Forgot Password?
              </h1>
              <p className="coop-auth-subtext" style={{ marginBottom: "22px" }}>
                Enter your Cooperative No. ID or registered email address. We will send a secure password reset link to the email linked to your account.
              </p>

              {feedback.isSuccess ? (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "12px",
                    padding: "20px",
                    textAlign: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "#dcfce7",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px",
                      color: "#166534",
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <h3 style={{ margin: "0 0 8px", fontSize: "1.05rem", color: "#166534", fontWeight: 700 }}>
                    Check Your Inbox
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#334155", lineHeight: 1.5 }}>
                    {feedback.message}
                  </p>
                  <p style={{ margin: "14px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                    The link will expire in 5 minutes. Be sure to check your spam or junk folder if you don't see it shortly.
                  </p>
                </div>
              ) : (
                <form className="coop-login-form" onSubmit={handleSubmit} autoComplete="off">
                  <div className="coop-pill-input-wrap">
                    <input
                      id="forgot-identifier"
                      name="identifier"
                      type="text"
                      className="coop-pill-input"
                      placeholder="Cooperative No. ID or Email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      autoFocus
                      aria-label="Cooperative No. ID or Email"
                    />
                  </div>

                  <button
                    className="btn-coop-harvest"
                    type="submit"
                    disabled={isSubmitting}
                    id="btn-send-reset-link"
                    style={{ marginTop: "12px" }}
                  >
                    <span>{isSubmitting ? "Sending Reset Link..." : "Send Reset Link"}</span>
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
              )}
            </div>

            <p className="coop-card-footer" style={{ marginTop: "24px" }}>
              Remember your credentials?{" "}
              <Link className="coop-join-link" to="/login">
                Back to Sign In
              </Link>
            </p>
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
