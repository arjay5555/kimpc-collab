import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import ManagerSidebar from "../../components/ManagerSidebar";
import ManagerTopbar from "../../components/ManagerTopbar";
import "../../styles/admin-kimpc.css";

export default function ManagerMessages() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // "all" | "unread" | "replied"
  const [search, setSearch] = useState("");
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", isError: false });

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const res = await api("/manager/messages");
    if (res.ok && res.data) {
      setMessages(res.data.messages || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSendReply = async (id) => {
    if (!replyText.trim()) return;
    setSubmittingReply(true);
    setFeedback({ message: "", isError: false });

    const res = await api(`/manager/messages/${id}/reply`, {
      method: "PATCH",
      body: { reply: replyText.trim() },
    });

    setSubmittingReply(false);
    if (!res.ok) {
      setFeedback({ message: res.data?.error || "Failed to send reply.", isError: true });
    } else {
      setFeedback({ message: "Reply sent to member successfully!", isError: false });
      setReplyText("");
      setActiveReplyId(null);
      fetchMessages();
      setTimeout(() => setFeedback({ message: "", isError: false }), 4000);
    }
  };

  const handleMarkAsRead = async (id) => {
    await api(`/manager/messages/${id}/read`, { method: "PATCH" });
    fetchMessages();
  };

  const unreadCount = messages.filter((m) => m.status === "unread").length;
  const repliedCount = messages.filter((m) => m.status === "replied").length;

  const filteredMessages = messages.filter((m) => {
    if (filter === "unread" && m.status !== "unread") return false;
    if (filter === "replied" && m.status !== "replied") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = (m.memberName || "").toLowerCase().includes(q);
      const matchEmail = (m.memberEmail || "").toLowerCase().includes(q);
      const matchSubject = (m.subject || "").toLowerCase().includes(q);
      const matchMsg = (m.message || "").toLowerCase().includes(q);
      return matchName || matchEmail || matchSubject || matchMsg;
    }
    return true;
  });

  return (
    <div className="wz-dashboard-container">
      <ManagerSidebar />

      <main className="wz-content-wrapper">
        <ManagerTopbar
          title="Member Messages & Inquiries"
          subtitle="Respond to member questions, booking concerns, and equipment inquiries."
        />

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
            }}
          >
            {feedback.message}
          </div>
        )}

        {/* Metrics Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
          <div className="wz-card" style={{ padding: "18px 20px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
              Total Inquiries
            </span>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
              {messages.length}
            </div>
          </div>
          <div className="wz-card" style={{ padding: "18px 20px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#d97706", textTransform: "uppercase" }}>
              Unread Questions
            </span>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#b45309", marginTop: "4px" }}>
              {unreadCount}
            </div>
          </div>
          <div className="wz-card" style={{ padding: "18px 20px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#16a34a", textTransform: "uppercase" }}>
              Replied Questions
            </span>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#15803d", marginTop: "4px" }}>
              {repliedCount}
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          className="wz-card"
          style={{
            padding: "14px 20px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            {[
              { key: "all", label: `All (${messages.length})` },
              { key: "unread", label: `Unread (${unreadCount})` },
              { key: "replied", label: `Replied (${repliedCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "20px",
                  border: filter === tab.key ? "1px solid #0f766e" : "1px solid #cbd5e1",
                  background: filter === tab.key ? "#0f766e" : "transparent",
                  color: filter === tab.key ? "#ffffff" : "#475569",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search member, subject, question..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 14px",
                borderRadius: "20px",
                border: "1px solid #cbd5e1",
                fontSize: "0.84rem",
                width: "260px",
                outline: "none",
              }}
            />
            <button
              type="button"
              className="wz-button"
              onClick={fetchMessages}
              style={{ padding: "8px 14px", fontSize: "0.82rem" }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Messages List */}
        {loading ? (
          <div className="wz-card" style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            Loading member inquiries...
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="wz-card" style={{ padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>💬</div>
            <strong style={{ fontSize: "1rem", color: "#0f172a" }}>No member messages found</strong>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.84rem" }}>
              {search ? "No inquiries matched your search keyword." : "When members ask questions, they will appear here."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {filteredMessages.map((msg) => {
              const isUnread = msg.status === "unread";
              const isReplying = activeReplyId === (msg.id || msg._id);

              return (
                <div
                  key={msg.id || msg._id}
                  className="wz-card"
                  style={{
                    padding: "20px",
                    borderLeft: isUnread ? "4px solid #f59e0b" : msg.reply ? "4px solid #10b981" : "4px solid #cbd5e1",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          background: "#0f766e",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.88rem",
                        }}
                      >
                        {(msg.memberName || "M")[0].toUpperCase()}
                      </div>
                      <div>
                        <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{msg.memberName}</strong>
                        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{msg.memberEmail}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          background:
                            msg.status === "unread"
                              ? "#fef3c7"
                              : msg.status === "replied"
                              ? "#dcfce7"
                              : "#e0f2fe",
                          color:
                            msg.status === "unread"
                              ? "#92400e"
                              : msg.status === "replied"
                              ? "#15803d"
                              : "#0369a1",
                        }}
                      >
                        {msg.status === "unread" ? "Unread Question" : msg.status === "replied" ? "Replied" : "Read"}
                      </span>
                      <span style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                        {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "Recently"}
                      </span>
                    </div>
                  </div>

                  {/* Subject & Question Content */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "#1e293b", marginBottom: "6px" }}>
                      {msg.subject}
                    </div>
                    <div
                      style={{
                        padding: "12px 16px",
                        background: "#f8fafc",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "0.88rem",
                        color: "#334155",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {msg.message}
                    </div>
                  </div>

                  {/* Existing Reply Display */}
                  {msg.reply && (
                    <div
                      style={{
                        padding: "14px 16px",
                        background: "#f0fdf4",
                        borderRadius: "8px",
                        border: "1px solid #bbf7d0",
                        marginBottom: "14px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <strong style={{ fontSize: "0.82rem", color: "#166534" }}>
                          ✓ Manager Reply ({msg.repliedBy || "Cooperative Manager"})
                        </strong>
                        <span style={{ fontSize: "0.74rem", color: "#15803d" }}>
                          {msg.repliedAt ? new Date(msg.repliedAt).toLocaleString() : ""}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.86rem", color: "#14532d", lineHeight: 1.5 }}>
                        {msg.reply}
                      </p>
                    </div>
                  )}

                  {/* Action / Reply Controls */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {!isReplying && (
                      <button
                        type="button"
                        className="wz-button wz-button-primary"
                        onClick={() => {
                          setActiveReplyId(msg.id || msg._id);
                          setReplyText(msg.reply ? msg.reply : "");
                          if (isUnread) handleMarkAsRead(msg.id || msg._id);
                        }}
                        style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                      >
                        {msg.reply ? "Edit Reply" : "Reply to Member"}
                      </button>
                    )}

                    {isUnread && !isReplying && (
                      <button
                        type="button"
                        className="wz-button"
                        onClick={() => handleMarkAsRead(msg.id || msg._id)}
                        style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                      >
                        Mark as Read
                      </button>
                    )}
                  </div>

                  {/* Inline Reply Form */}
                  {isReplying && (
                    <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #e2e8f0" }}>
                      <textarea
                        rows={3}
                        placeholder={`Type reply to ${msg.memberName}...`}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.86rem",
                          fontFamily: "inherit",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: "10px", marginTop: "8px", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="wz-button"
                          onClick={() => {
                            setActiveReplyId(null);
                            setReplyText("");
                          }}
                          style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="wz-button wz-button-primary"
                          disabled={submittingReply || !replyText.trim()}
                          onClick={() => handleSendReply(msg.id || msg._id)}
                          style={{ padding: "6px 16px", fontSize: "0.8rem" }}
                        >
                          {submittingReply ? "Sending..." : "Send Reply"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

