import React, { useEffect, useState } from "react";
import { reloadLatest } from "../services/api";

/** Global, non-blocking notice for 409 VERSION_CONFLICT responses (dispatched by services/api.js). */
export default function VersionConflictBanner() {
  const [conflict, setConflict] = useState(null);

  useEffect(() => {
    const handleConflict = (event) => setConflict(event.detail);
    window.addEventListener("kimpc:version-conflict", handleConflict);
    return () => window.removeEventListener("kimpc:version-conflict", handleConflict);
  }, []);

  if (!conflict) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: 10000,
        maxWidth: "min(420px, calc(100vw - 32px))",
        padding: "12px 14px",
        borderRadius: 10,
        background: "#fffbeb",
        color: "#78350f",
        border: "1px solid #f59e0b",
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        fontSize: "0.88rem",
      }}
    >
      <strong style={{ display: "block", marginBottom: 4 }}>This item was updated by someone else.</strong>
      <span>Your changes were not saved and are still on screen. Reload the latest version, then re-apply them.</span>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            reloadLatest(conflict);
            setConflict(null);
          }}
          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#b45309", color: "#fff", cursor: "pointer", fontWeight: 600 }}
        >
          Reload latest
        </button>
        <button
          type="button"
          onClick={() => setConflict(null)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d97706", background: "transparent", color: "#78350f", cursor: "pointer" }}
        >
          Keep my edits
        </button>
      </div>
    </div>
  );
}
