import React, { useState } from "react";

export default function GcashOcrBadge({
  ocr,
  scanning = false,
  error = "",
  expectedAmount = null,
  onScanClick = null,
  onApplyToForm = null,
}) {
  const [showRaw, setShowRaw] = useState(false);

  if (scanning) {
    return (
      <div
        style={{
          marginTop: "8px",
          padding: "8px 12px",
          borderRadius: "8px",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          color: "#1d4ed8",
          fontSize: "0.78rem",
          fontWeight: 600,
        }}
      >
        Scanning GCash receipt with OCR.space...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          marginTop: "8px",
          padding: "8px 12px",
          borderRadius: "8px",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#b91c1c",
          fontSize: "0.78rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span>OCR scan note: {error}</span>
        {onScanClick && (
          <button
            type="button"
            onClick={onScanClick}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid #fca5a5",
              background: "#ffffff",
              color: "#991b1b",
              fontSize: "0.74rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry OCR
          </button>
        )}
      </div>
    );
  }

  const hasScan = Boolean(ocr && (ocr.referenceNumber || ocr.amount != null || ocr.rawText));
  if (!hasScan) {
    if (!onScanClick) return null;
    return (
      <div style={{ marginTop: "8px" }}>
        <button
          type="button"
          onClick={onScanClick}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid #0284c7",
            background: "#f0f9ff",
            color: "#0369a1",
            fontSize: "0.76rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Scan Receipt (OCR.space)
        </button>
      </div>
    );
  }

  const expNum = Number(expectedAmount);
  const amountMismatch =
    ocr.amount != null && Number.isFinite(expNum) && expNum > 0
      ? Math.abs(Number(ocr.amount) - expNum) >= 1
      : ocr.amountMatchesExpected === false;

  const hasWarning = Boolean(ocr.isDuplicateReference || amountMismatch);

  return (
    <div
      style={{
        marginTop: "8px",
        padding: "10px 12px",
        borderRadius: "8px",
        background: hasWarning ? "#fffbeb" : "#f0fdf4",
        border: `1px solid ${hasWarning ? "#fde68a" : "#bbf7d0"}`,
        fontSize: "0.78rem",
        display: "grid",
        gap: "6px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <strong style={{ color: hasWarning ? "#92400e" : "#166534" }}>
          OCR.space Receipt Scan
        </strong>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {ocr.matchesKimpcNumber && (
            <span style={{ background: "#dcfce7", color: "#15803d", padding: "2px 7px", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700 }}>
              KIMPC GCash Verified
            </span>
          )}
          {ocr.isDuplicateReference && (
            <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 7px", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700 }}>
              Duplicate Reference Detected
            </span>
          )}
          {amountMismatch && (
            <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 7px", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700 }}>
              Amount Differs from ₱{expNum.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", color: "#334155" }}>
        <span>
          <strong>Ref No.:</strong>{" "}
          <code style={{ fontFamily: "monospace", fontWeight: 700 }}>
            {ocr.referenceNumber || "Not detected"}
          </code>
        </span>
        <span>
          <strong>Detected Amount:</strong>{" "}
          <strong>
            {ocr.amount != null ? `₱${Number(ocr.amount).toLocaleString()}` : "Not detected"}
          </strong>
        </span>
        {ocr.dateTime && (
          <span>
            <strong>Date:</strong> {ocr.dateTime}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {onApplyToForm && (ocr.referenceNumber || ocr.amount != null) && (
          <button
            type="button"
            onClick={() => onApplyToForm(ocr)}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid #16a34a",
              background: "#16a34a",
              color: "#ffffff",
              fontSize: "0.74rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Auto-fill Ref &amp; Amount
          </button>
        )}
        {onScanClick && (
          <button
            type="button"
            onClick={onScanClick}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontSize: "0.74rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Re-scan
          </button>
        )}
        {ocr.rawText && (
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#0284c7",
              fontSize: "0.74rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showRaw ? "Hide raw OCR text" : "View raw OCR text"}
          </button>
        )}
      </div>

      {showRaw && ocr.rawText && (
        <pre
          style={{
            margin: 0,
            padding: "8px",
            borderRadius: "6px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            fontSize: "0.72rem",
            whiteSpace: "pre-wrap",
            maxHeight: "120px",
            overflowY: "auto",
            color: "#334155",
          }}
        >
          {ocr.rawText}
        </pre>
      )}
    </div>
  );
}

