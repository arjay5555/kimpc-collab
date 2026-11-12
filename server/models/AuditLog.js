const mongoose = require("mongoose");

/**
 * AuditLog — records every critical system event performed by a Member, Manager, or Admin.
 *
 * Fields
 * -------
 * action         – constant string key, e.g. "ACCOUNT_ACTIVATED", "BOOKING_APPROVED"
 * module         – system module: "Accounts & Roles" | "Bookings" | "Security Settings" | "Financial Policies" | "Database Backups" | "Machinery Fleet" | "Authentication" | "System"
 * actor          – who performed the action: { userId, email, fullName, role }
 * actorEmail     – flat copy for indexing and queries
 * actorName      – full name of the actor
 * actorRole      – role of the actor ("admin" | "manager" | "member" | "system")
 * affectedRecord – target entity affected (e.g. account, booking ID, machinery unit, setting)
 * targetAccount  – target account email (legacy field)
 * targetEmail    – alias kept for backwards compat
 * targetName     – human-readable name of the target
 * targetRole     – role of the target account
 * details        – Mixed JSON object or human-readable description string
 * status         – "Success" | "Failed" | "Denied" (Result)
 * ip             – originating IP address of the request
 * isArchived     – soft-delete marker for monthly cron archival
 * archivedAt     – timestamp when the record was archived
 */
const auditLogSchema = new mongoose.Schema(
  {
    // --- action ---
    action: {
      type: String,
      required: true,
      index: true,
    },

    // --- module category ---
    module: {
      type: String,
      default: "System",
      index: true,
    },

    // --- structured actor object ---
    actor: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
      email: { type: String, default: "" },
      fullName: { type: String, default: "" },
      role: { type: String, default: "admin" },
    },

    // --- flat copies kept for text-search & legacy routes ---
    actorEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    actorName: {
      type: String,
      default: "",
    },
    actorRole: {
      type: String,
      default: "admin",
    },

    // --- affected record / target entity ---
    affectedRecord: {
      type: String,
      default: "",
      index: true,
    },
    targetAccount: { type: String, default: "" },
    targetEmail: { type: String, lowercase: true, trim: true },
    targetName: { type: String, default: "" },
    targetRole: { type: String, default: "" },

    // --- change payload (flexible JSON or plain string) ---
    details: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // --- result / outcome ---
    status: {
      type: String,
      enum: ["Success", "Failed", "Denied"],
      default: "Success",
      index: true,
    },

    // --- network ---
    ip: { type: String, default: "" },

    // --- archival ---
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true, // createdAt is our canonical "timestamp"
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for fast dashboard queries
auditLogSchema.index({ createdAt: -1, isArchived: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
