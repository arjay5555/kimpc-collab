const mongoose = require("mongoose");

// One document per person (member, manager, or admin).
// Profile details live on the account itself, so no separate "profiles" collection is needed.
const accountSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: "", trim: true },
    middleName: { type: String, default: "", trim: true },
    lastName: { type: String, default: "", trim: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["member", "manager", "admin"], default: "member" },
    cooperativeId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    verificationStatus: { type: String, enum: ["pending", "verified", "declined"], default: "pending" },
    verifiedAt: Date,
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },
    address: { type: String, default: "" },
    address2: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    country: { type: String, default: "" },
    memberSettings: {
      theme: { type: String, enum: ["light", "dark"], default: "light" },
      defaultFarmLocation: { type: String, default: "", maxlength: 240 },
      notifications: {
        email: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
        bookingReminders: { type: Boolean, default: true },
        systemUpdates: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
      }
    },
    // Profile edits wait here until the member confirms them by email.
    pendingUpdate: { type: mongoose.Schema.Types.Mixed, default: null },
    // Archive status
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    // Suspension status
    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: "" },
    // 6-digit administrative action PIN
    adminPinHash: { type: String, default: null },
    mustChangePin: { type: Boolean, default: false },
    pinSetAt: { type: Date, default: null },
    // One-Time Password (OTP) & Forgot Password recovery
    mustChangePassword: { type: Boolean, default: false },
    forgotPasswordRequested: { type: Boolean, default: false },
    oneTimePasswordSetAt: { type: Date, default: null },
    // Email Password Reset Link Recovery
    resetPasswordToken: { type: String, default: null, index: true },
    resetPasswordExpires: { type: Date, default: null, index: true },
    // Token / Session version for revoking active JWTs upon password change
    tokenVersion: { type: Number, default: 0 },
    // Google Calendar OAuth & Synchronization credentials
    googleOAuth: {
      accessToken: { type: String, default: "" },
      refreshToken: { type: String, default: "" },
      calendarId: { type: String, default: "primary" },
      channelId: { type: String, default: "", index: true },
      resourceId: { type: String, default: "" },
      channelExpiration: { type: Date, default: null },
      connectedAt: { type: Date, default: null }
    },
    accessToken: { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    calendarId: { type: String, default: "primary" },
    channelId: { type: String, default: "", index: true },
    resourceId: { type: String, default: "" }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.hasAdminPin = Boolean(ret.adminPinHash);
        ret.mustChangePassword = Boolean(ret.mustChangePassword);
        ret.forgotPasswordRequested = Boolean(ret.forgotPasswordRequested);
        ret.hasGoogleCalendar = Boolean(
          (ret.googleOAuth && ret.googleOAuth.refreshToken) || ret.refreshToken
        );
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.resetPasswordToken; // never send reset token hash
        delete ret.resetPasswordExpires; // never send password hashes to the browser
        delete ret.adminPinHash; // never send PIN hash to the browser
        if (ret.googleOAuth) {
          delete ret.googleOAuth.accessToken;
          delete ret.googleOAuth.refreshToken;
        }
        delete ret.accessToken;
        delete ret.refreshToken;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model("Account", accountSchema);
