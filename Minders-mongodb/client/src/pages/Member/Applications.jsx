import React, { useState, useEffect } from "react";
import Header from "../../components/Header";
import { api } from "../../services/api";

export default function Applications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchApps = async () => {
    const res = await api("/applications");
    if (res.ok && Array.isArray(res.data)) {
      setApplications(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchApps();
  }, []);

  return (
    <div>
      <Header activePage="applications" />

      <main className="app-shell" style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        <section className="page-intro" style={{ marginBottom: "20px" }}>
          <p className="eyebrow">MEMBER PORTAL / BOOKINGS</p>
          <h1>My Equipment Applications</h1>
          <p className="muted">Track the approval and dispatch status of your machinery requests.</p>
        </section>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                <th style={{ padding: "12px 16px" }}>Equipment</th>
                <th style={{ padding: "12px 16px" }}>Rental Period</th>
                <th style={{ padding: "12px 16px" }}>Submitted Date</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    Loading your applications...
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                    You have not submitted any equipment booking applications yet.
                  </td>
                </tr>
              ) : (
                applications.map((item) => (
                  <tr key={item._id || item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px", fontWeight: "600" }}>{item.equipment}</td>
                    <td style={{ padding: "12px 16px" }}>{item.startDate} &rarr; {item.endDate}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b" }}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Recent"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`status-pill status-${(item.status || "pending").toLowerCase()}`} style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "0.75rem", textTransform: "capitalize", fontWeight: "600" }}>
                        {item.status || "Pending"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
