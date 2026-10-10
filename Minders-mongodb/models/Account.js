const mongoose = require("mongoose");

// One document per person (member, manager, or admin).
// Profile details live on the account itself, so no separate "profiles" collection is needed.
const accountSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["member", "manager", "admin"], default: "member" },
    cooperativeId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    verifiedAt: Date,
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    address2: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    country: { type: String, default: "" },
    // Profile edits wait here until the member confirms them by email.
    pendingUpdate: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash; // never send password hashes to the browser
        return ret;
      }
    }
  }
);

module.exports = mongoose.model("Account", accountSchema);
