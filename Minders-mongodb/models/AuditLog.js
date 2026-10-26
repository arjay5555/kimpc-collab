const mongoose = require("mongoose");

/**
 * AuditLog — records every critical system event performed by a Manager or Admin.
 *
 * Fields
 * -------
 * timestamp   – indexed creation time (auto via timestamps: true -> createdAt)
 * action      – constant string key, e.g. "ACCOUNT_DELETED", "BOOKING_APPROVED"
 * actor       – who performed the action: { userId, email, role }
 * actorEmail  – (flat copy for legacy queries / text search)
 * actorRole   – (flat copy)
 * targetAccount – email of the affected account (if applicable)
 * targetEmail – alias kept for backwards compat
 * targetName  – human-readable name of the target
 * targetRole  – role of the target account
 * details     – Mixed JSON object (or plain string) for change payload
 * status      – "Success" | "Failed" | "Denied"
 * ip          – originating IP address of the request
 * isArchived  – set to true by the monthly cron after export; soft-delete marker
 * archivedAt  – timestamp when the record was moved to the archive
 */
const auditLogSchema = new mongoose.Schema(
  {
    // --- action ---
    action: {
      type: String,
      required: true,
      index: true
    },

    // --- structured actor object (new) ---
    actor: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
      email: { type: String, default: "" },
      role: { type: String, default: "admin" }
    },

    // --- flat copies kept for text-search & legacy routes ---
    actorEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    actorRole: {
      type: String,
      default: "admin"
    },

    // --- target account ---
    targetAccount: { type: String, default: "" },  // canonical "target" field
    targetEmail: { type: String, lowercase: true, trim: true },
    targetName: { type: String, default: "" },
    targetRole: { type: String, default: "" },

    // --- change payload (flexible JSON or plain string) ---
    details: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    // --- result ---
    status: {
      type: String,
      enum: ["Success", "Failed", "Denied"],
      default: "Success"
    },

    // --- network ---
    ip: { type: String, default: "" },

    // --- archival (set by the monthly cron worker) ---
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null }
  },
  {
    timestamps: true,     // createdAt is our canonical "timestamp"
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound index for fast dashboard queries (recent non-archived events by action)
auditLogSchema.index({ createdAt: -1, isArchived: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
