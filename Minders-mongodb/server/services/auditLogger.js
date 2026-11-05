/**
 * services/auditLogger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable, async audit-logging helper for use inside any Express route or
 * background worker. Import and call logAudit({...}) — it never throws so
 * it won't break the request that calls it.
 */

const AuditLog = require("../models/AuditLog");

/**
 * Extract the client IP from an Express request object.
 */
function extractIp(req) {
  if (!req) return "";
  return (
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    ""
  );
}

/**
 * Normalise strings.
 */
const clean = (v) => String(v ?? "").trim();
const cleanEmail = (v) => clean(v).toLowerCase();

/**
 * Derive the standard module name from the action key.
 */
function deriveModule(action = "") {
  const a = String(action || "").toUpperCase();
  if (
    a.includes("PAYMENT") ||
    a.includes("FINANCIAL") ||
    a.includes("REFUND") ||
    a.includes("POLICY") ||
    a.includes("CORRECTION") ||
    a.includes("EXPENSE") ||
    a.includes("DEPOSIT")
  ) {
    return "Financial Policies";
  }
  if (
    a.includes("ACCOUNT") ||
    a.includes("USER_REGISTER") ||
    a.includes("USER_DEACT") ||
    a.includes("USER_ACT") ||
    a.includes("ROLE") ||
    a.includes("PERMISSION") ||
    a.includes("IMPERSONATE") ||
    a.includes("PROFILE")
  ) {
    return "Accounts & Roles";
  }
  if (
    a.includes("BOOKING") ||
    a.includes("APPLICATION") ||
    a.includes("RENTAL") ||
    a.includes("CANCEL") ||
    a.includes("SCHEDULE")
  ) {
    return "Bookings";
  }
  if (
    a.includes("LOGIN") ||
    a.includes("LOGOUT") ||
    a.includes("AUTH") ||
    a.includes("PASSWORD") ||
    a.includes("OTP") ||
    a.includes("VERIFY_EMAIL") ||
    a.includes("SESSION")
  ) {
    return "Authentication";
  }
  if (
    a.includes("RECAPTCHA") ||
    a.includes("GOOGLE_LOGIN") ||
    a.includes("FACEBOOK_LOGIN") ||
    a.includes("SECURITY") ||
    a.includes("SETTING") ||
    a.includes("CONFIG")
  ) {
    return "Security Settings";
  }
  if (
    a.includes("MACHINERY") ||
    a.includes("UNIT") ||
    a.includes("EQUIPMENT") ||
    a.includes("DRIVER") ||
    a.includes("FLEET")
  ) {
    return "Machinery Fleet";
  }
  if (
    a.includes("PAYMENT") ||
    a.includes("FINANCIAL") ||
    a.includes("REFUND") ||
    a.includes("POLICY") ||
    a.includes("CORRECTION") ||
    a.includes("EXPENSE") ||
    a.includes("DEPOSIT")
  ) {
    return "Financial Policies";
  }
  if (
    a.includes("BACKUP") ||
    a.includes("RESTORE") ||
    a.includes("SNAPSHOT")
  ) {
    return "Database Backups";
  }
  if (
    a.includes("REPORT") ||
    a.includes("EXPORT")
  ) {
    return "Financial Reports";
  }
  if (
    a.includes("MESSAGE") ||
    a.includes("INQUIRY") ||
    a.includes("SUPPORT") ||
    a.includes("TICKET")
  ) {
    return "Member Messages";
  }
  return "System";
}

/**
 * Derive human-readable Affected Record description.
 */
function deriveAffectedRecord({
  affectedRecord,
  targetEmail,
  targetName,
  targetAccount,
  targetRole,
  details,
  action,
}) {
  if (affectedRecord && String(affectedRecord).trim()) {
    return String(affectedRecord).trim();
  }

  // Target account info
  const name = clean(targetName);
  const email = cleanEmail(targetEmail || targetAccount);
  if (name && email) return `${name} (${email})`;
  if (email) return email;
  if (name) return name;

  // Derive from details payload if available
  if (details && typeof details === "object") {
    if (details.bookingId) return `Booking #${details.bookingId}`;
    if (details.equipment) return `Unit: ${details.equipment}`;
    if (details.machineryModel) return `Unit: ${details.machineryModel}`;
    if (details.targetEmail) return details.targetEmail;
    if (details.role) return `Role: ${details.role}`;
    if (details.setting) return `Setting: ${details.setting}`;
    if (details.key) return `Config: ${details.key}`;
  }

  if (typeof details === "string" && details.length > 0) {
    const match = details.match(/(?:account|booking|unit|setting|user|file|policy)\s+["']?([^"',)]+)["']?/i);
    if (match) return match[0];
  }

  // Fallback based on action
  const act = String(action || "").toUpperCase();
  if (act.includes("BACKUP") || act.includes("SNAPSHOT")) return "MongoDB Database Snapshot";
  if (act.includes("REPORT")) return "Cooperative Operations Report";
  if (act.includes("POLICY")) return "Cooperative Financial Policies";
  if (act.includes("RECAPTCHA")) return "Google reCAPTCHA Security";

  return "—";
}

/**
 * Write one audit-log entry to MongoDB.
 *
 * @param {Object} opts
 * @param {string}  opts.action         Constant action key (e.g. "ACCOUNT_ACTIVATED")
 * @param {string}  [opts.module]       Module (auto-derived if omitted)
 * @param {string}  [opts.actorEmail]   Email of actor (extracted from req if omitted)
 * @param {string}  [opts.actorName]    Full name of actor (extracted from req if omitted)
 * @param {string}  [opts.actorRole]    Role of actor (default: "admin")
 * @param {*}       [opts.actorId]      MongoDB ObjectId of actor (optional)
 * @param {string}  [opts.affectedRecord] Human-readable affected entity
 * @param {string}  [opts.targetEmail]  Email of affected target
 * @param {string}  [opts.targetName]   Full name of affected target
 * @param {string}  [opts.targetRole]   Role of affected target
 * @param {*}       opts.details        String description or JSON object of changes
 * @param {string}  [opts.status]       "Success" | "Failed" | "Denied" (Result)
 * @param {Object}  [opts.req]          Express Request object (for IP & actor extraction)
 */
async function logAudit({
  action,
  module = "",
  actorEmail = "",
  actorName = "",
  actorRole = "",
  actorId = null,
  affectedRecord = "",
  targetEmail = "",
  targetName = "",
  targetRole = "",
  details = "",
  status = "Success",
  req = null,
} = {}) {
  try {
    // Extract actor information from req if not explicitly provided
    const reqUser = req?.admin || req?.user;
    const email = cleanEmail(actorEmail || reqUser?.email || req?.headers?.["x-admin-email"] || "system");
    const name = clean(actorName || reqUser?.fullName || (email !== "system" ? email.split("@")[0] : "System Administrator"));
    const role = clean(actorRole || reqUser?.role || "admin");
    const id = actorId || reqUser?._id || reqUser?.id || null;
    const ip = extractIp(req);

    // Derive module and affected record
    const resolvedModule = clean(module) || deriveModule(action);
    const resolvedAffected = deriveAffectedRecord({
      affectedRecord,
      targetEmail,
      targetName,
      targetAccount: targetEmail,
      targetRole,
      details,
      action,
    });

    // Details payload
    const detailsValue =
      details !== null && typeof details === "object"
        ? details
        : String(details || "");

    const normalizedStatus = ["Success", "Failed", "Denied"].includes(status)
      ? status
      : "Success";

    await AuditLog.create({
      action: clean(action),
      module: resolvedModule,

      // Actor sub-document
      actor: {
        userId: id,
        email,
        fullName: name,
        role,
      },

      // Flat copies for backward compatibility
      actorEmail: email,
      actorName: name,
      actorRole: role,

      // Affected Record / Target
      affectedRecord: resolvedAffected,
      targetAccount: cleanEmail(targetEmail),
      targetEmail: cleanEmail(targetEmail),
      targetName: clean(targetName),
      targetRole: clean(targetRole),

      // Payload
      details: detailsValue,
      status: normalizedStatus,
      ip,
    });
  } catch (err) {
    // Logging must never crash the caller.
    console.error("[AuditLogger] Failed to write audit log entry:", err.message);
  }
}

module.exports = {
  logAudit,
  logSystemEvent: logAudit,
  deriveModule,
  deriveAffectedRecord,
};
