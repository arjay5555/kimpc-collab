import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import MemberTopbar from "../../components/MemberTopbar";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    const response = await api("/notifications");
    if (response.ok) {
      setNotifications(Array.isArray(response.data?.notifications) ? response.data.notifications : []);
      setError("");
    } else {
      setError(response.data?.error || "Could not load notifications.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const updateNotification = async (id, method, path = "") => {
    const response = await api(`/notifications/${id}${path}`, { method });
    if (!response.ok) {
      setError(response.data?.error || "Could not update notification.");
      return;
    }
    await loadNotifications();
    window.dispatchEvent(new Event("member-notifications-updated"));
  };

  const markAllRead = async () => {
    const response = await api("/notifications/read-all", { method: "PATCH", body: {} });
    if (!response.ok) {
      setError(response.data?.error || "Could not mark notifications as read.");
      return;
    }
    await loadNotifications();
    window.dispatchEvent(new Event("member-notifications-updated"));
  };

  return (
    <div className="member-page" style={{ width: "100%", maxWidth: "1400px", margin: "0 auto" }}>
      <MemberTopbar title="Notifications" />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        {notifications.some((item) => !item.readAt) && (
          <button className="wz-btn wz-btn-outline" type="button" onClick={markAllRead} style={{ borderRadius: "8px", padding: "8px 16px", fontWeight: 600 }}>
            Mark all as read
          </button>
        )}
      </div>
      {error && <p className="member-form-feedback" role="alert">{error}</p>}
      {loading ? <div className="member-app-table"><div className="member-table-skeleton" /><div className="member-table-skeleton" /></div>
        : notifications.length === 0 ? <div className="member-empty-state"><span className="member-empty-icon" aria-hidden="true">♧</span><strong>You’re all caught up</strong><p>Important updates will appear here.</p></div>
          : <div className="member-notification-list">{notifications.map((item) => (
            <article key={item._id} className={`member-notification${item.readAt ? "" : " unread"}`}>
              <span className="member-notification-icon" aria-hidden="true">{item.type === "reminder" ? "◷" : item.type === "booking" ? "▰" : "i"}</span>
              <div className="member-notification-copy"><div><strong>{item.title}</strong>{!item.readAt && <span className="member-unread-dot" aria-label="Unread" />}</div><p>{item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
              <div className="member-notification-actions">
                {!item.readAt && <button className="member-text-button" type="button" onClick={() => updateNotification(item._id, "PATCH", "/read")}>Mark read</button>}
                <button className="member-text-button member-delete-button" type="button" onClick={() => updateNotification(item._id, "DELETE")} aria-label={`Delete ${item.title}`}>Delete</button>
              </div>
            </article>
          ))}</div>}
    </div>
  );
}
