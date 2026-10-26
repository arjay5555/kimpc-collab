/**
 * services/auditLogger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable, async audit-logging helper for use inside any Express route or
 * background worker.  Import and call  logAudit({...})  — it never throws so
 * it won't break the request that calls it.
 *
 * Usage in a controller:
 *   const { logAudit } = require("../services/auditLogger");
 *
 *   await logAudit({
 *     action:      "BOOKING_APPROVED",          // required – constant key
 *     actorEmail:  "manager@minders.test",       // required
 *     actorRole:   "manager",
 *     actorId:     req.body.actorId || null,     // optional ObjectId
 *     targetEmail: application.memberEmail,
 *     targetName:  application.memberName,
 *     targetRole:  "member",
 *     details: {                                 // can be a string or any object
 *       equipment: application.equipment,
 *       dateRange: `${application.startDate} – ${application.endDate}`,
 *       previousStatus: "Pending",
 *       newStatus: "Approved"
 *     },
 *     status: "Success",                         // "Success" | "Failed" | "Denied"
 *     req                                        // Express Request (for IP)
 *   });
 */

const AuditLog = require("../models/AuditLog");

/**
 * Extract the client IP from an Express request object.
 * Falls back to an empty string when called from background workers.
 */
function extractIp(req) {
  if (!req) return "";
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    ""
  );
}

/**
 * Normalise a string value: trim, convert null/undefined → "".
 */
const clean = (v) => String(v ?? "").trim();
const cleanEmail = (v) => clean(v).toLowerCase();

/**
 * Write one audit-log entry to MongoDB.
 * This function is intentionally fire-and-forget safe — it catches all errors
 * internally and only logs them to the console so that a logging failure never
 * breaks the business operation that called it.
 *
 * @param {Object} opts
 * @param {string}  opts.action        Constant action key (e.g. "ACCOUNT_DELETED")
 * @param {string}  opts.actorEmail    Email of the user performing the action
 * @param {string}  [opts.actorRole]   Role of the actor (default: "admin")
 * @param {*}       [opts.actorId]     MongoDB ObjectId of the actor Account (optional)
 * @param {string}  [opts.targetEmail] Email of the affected account
 * @param {string}  [opts.targetName]  Full name of the affected account
 * @param {string}  [opts.targetRole]  Role of the affected account
 * @param {*}       [opts.details]     String description or JSON object of changes
 * @param {string}  [opts.status]      "Success" | "Failed" | "Denied"
 * @param {Object}  [opts.req]         Express Request object (for IP extraction)
 */
async function logAudit({
  action,
  actorEmail,
  actorRole = "admin",
  actorId = null,
  targetEmail = "",
  targetName = "",
  targetRole = "",
  details = "",
  status = "Success",
  req = null
} = {}) {
  try {
    const email = cleanEmail(actorEmail) || "system";
    const ip = extractIp(req);

    // Serialise the details payload.
    // • If it's already a plain string, store it as-is.
    // • If it's an object / array, store the raw value (Mongoose Mixed).
    const detailsValue =
      details !== null && typeof details === "object"
        ? details
        : String(details || "");

    await AuditLog.create({
      action: clean(action),

      // Structured actor sub-document
      actor: {
        userId: actorId || null,
        email,
        role: cleanEmail(actorRole) || "admin"
      },

      // Flat copies for backward-compat queries
      actorEmail: email,
      actorRole: clean(actorRole) || "admin",

      // Target
      targetAccount: cleanEmail(targetEmail),
      targetEmail: cleanEmail(targetEmail),
      targetName: clean(targetName),
      targetRole: clean(targetRole),

      // Payload
      details: detailsValue,
      status: ["Success", "Failed", "Denied"].includes(status) ? status : "Success",
      ip
    });
  } catch (err) {
    // Logging must never crash the caller.
    console.error("[AuditLogger] Failed to write audit log entry:", err.message);
  }
}

module.exports = { logAudit, logSystemEvent: logAudit };
