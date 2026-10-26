/**
 * workers/archiveAuditLogs.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Monthly background worker that:
 *   1. Queries audit-log entries older than 6 months (that haven't already
 *      been archived).
 *   2. Exports them to a date-stamped JSON file in  /archive/audit-logs/.
 *   3. Also writes a CSV copy for spreadsheet consumption.
 *   4. Hard-deletes the exported rows from the active collection to keep the
 *      working set small and queries fast.
 *   5. Writes one final audit-log entry recording the archive run itself.
 *
 * Schedule: runs at 00:05 on the 1st of every month  →  "5 0 1 * *"
 *
 * The worker is imported and started by server.js.  It uses node-cron and
 * does NOT require any external message queue.
 *
 * Archive files are written to:
 *   <project-root>/archive/audit-logs/YYYY-MM-DD_HH-mm-ss/
 *     ├── audit_archive.json
 *     └── audit_archive.csv
 */

"use strict";

const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const AuditLog = require("../models/AuditLog");
const { logAudit } = require("../services/auditLogger");

// ─── configuration ───────────────────────────────────────────────────────────

/** How many months back to keep in the active collection. */
const RETENTION_MONTHS = 6;

/** Cron expression: 00:05 on the 1st of every month */
const CRON_SCHEDULE = "5 0 1 * *";

/** Root directory where archive bundles are written */
const ARCHIVE_ROOT = path.join(__dirname, "..", "archive", "audit-logs");

// ─── helpers ─────────────────────────────────────────────────────────────────

function isoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function cutoffDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d;
}

/**
 * Convert an array of audit-log objects to a CSV string.
 * Uses only scalar fields so the file is easy to open in Excel.
 */
function toCsv(logs) {
  const headers = [
    "id", "createdAt", "action",
    "actorEmail", "actorRole",
    "targetEmail", "targetName", "targetRole", "targetAccount",
    "details", "status", "ip"
  ];

  const escape = (v) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };

  const rows = logs.map((log) => {
    const detailsStr =
      log.details !== null && typeof log.details === "object"
        ? JSON.stringify(log.details)
        : String(log.details ?? "");

    return headers.map((h) => {
      if (h === "details") return escape(detailsStr);
      if (h === "id") return escape(log._id || log.id || "");
      return escape(log[h]);
    }).join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

// ─── core archive job ─────────────────────────────────────────────────────────

async function runArchiveJob() {
  const startedAt = new Date();
  const cutoff = cutoffDate();

  console.log(`[AuditArchive] Starting monthly archive run at ${startedAt.toISOString()}`);
  console.log(`[AuditArchive] Archiving entries older than ${cutoff.toISOString()}`);

  let exportedCount = 0;
  let archivePath = "";

  try {
    // 1. Query logs that are old enough and not yet archived
    const logsToArchive = await AuditLog.find({
      createdAt: { $lt: cutoff },
      isArchived: { $ne: true }
    }).lean();

    exportedCount = logsToArchive.length;
    console.log(`[AuditArchive] Found ${exportedCount} log(s) eligible for archival.`);

    if (exportedCount === 0) {
      console.log("[AuditArchive] Nothing to archive. Job complete.");
      return;
    }

    // 2. Write export files
    const dirName = isoTimestamp();
    archivePath = path.join(ARCHIVE_ROOT, dirName);
    fs.mkdirSync(archivePath, { recursive: true });

    const jsonPath = path.join(archivePath, "audit_archive.json");
    const csvPath = path.join(archivePath, "audit_archive.csv");

    fs.writeFileSync(jsonPath, JSON.stringify(logsToArchive, null, 2), "utf-8");
    fs.writeFileSync(csvPath, toCsv(logsToArchive), "utf-8");

    console.log(`[AuditArchive] Exported ${exportedCount} records to:\n  JSON: ${jsonPath}\n  CSV:  ${csvPath}`);

    // 3. Hard-delete the archived rows from the active collection
    const ids = logsToArchive.map((l) => l._id);
    const deleteResult = await AuditLog.deleteMany({ _id: { $in: ids } });
    console.log(`[AuditArchive] Deleted ${deleteResult.deletedCount} record(s) from active collection.`);

    // 4. Record the archive run itself as an audit entry
    await logAudit({
      action: "AUDIT_LOGS_ARCHIVED",
      actorEmail: "system@minders.internal",
      actorRole: "system",
      details: {
        recordsExported: exportedCount,
        recordsDeleted: deleteResult.deletedCount,
        cutoffDate: cutoff.toISOString(),
        archivePath: archivePath,
        jsonFile: jsonPath,
        csvFile: csvPath,
        ranAt: startedAt.toISOString()
      },
      status: "Success"
    });

    console.log("[AuditArchive] Monthly archive job completed successfully.");
  } catch (err) {
    console.error("[AuditArchive] Archive job encountered an error:", err);

    // Record the failure
    await logAudit({
      action: "AUDIT_LOGS_ARCHIVED",
      actorEmail: "system@minders.internal",
      actorRole: "system",
      details: {
        error: err.message,
        recordsAttempted: exportedCount,
        archivePath: archivePath || "(not created)",
        ranAt: startedAt.toISOString()
      },
      status: "Failed"
    });
  }
}

// ─── scheduler ────────────────────────────────────────────────────────────────

/**
 * Register the cron job.  Called once from server.js after MongoDB connects.
 *
 * @param {Object} [options]
 * @param {boolean} [options.runImmediately=false]  Run once immediately on startup
 *   (useful for development/testing without waiting for the 1st of the month).
 */
function startAuditArchiveWorker({ runImmediately = false } = {}) {
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error("[AuditArchive] Invalid cron expression:", CRON_SCHEDULE);
    return;
  }

  cron.schedule(CRON_SCHEDULE, runArchiveJob, {
    scheduled: true,
    timezone: "Asia/Manila"  // Adjust to your cooperative's timezone
  });

  console.log(`[AuditArchive] Monthly archive worker scheduled → "${CRON_SCHEDULE}" (Asia/Manila)`);
  console.log(`[AuditArchive] Archive directory: ${ARCHIVE_ROOT}`);

  if (runImmediately) {
    console.log("[AuditArchive] Running immediate test archive...");
    runArchiveJob();
  }
}

// Allow manual triggering via CLI: node workers/archiveAuditLogs.js --run
if (require.main === module) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const mongoose = require("mongoose");

  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log("[AuditArchive] Connected to MongoDB (manual run).");
      return runArchiveJob();
    })
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error("[AuditArchive] Manual run failed:", err);
      process.exit(1);
    });
}

module.exports = { startAuditArchiveWorker, runArchiveJob };
