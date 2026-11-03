const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    memberEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    type: { type: String, enum: ["booking", "reminder", "system"], default: "system", index: true },
    relatedApplicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    dedupeKey: { type: String, default: undefined, unique: true, sparse: true },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
