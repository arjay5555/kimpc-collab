const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    memberEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    memberName: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    status: { type: String, enum: ["unread", "read", "replied"], default: "unread", index: true },
    reply: { type: String, default: "" },
    repliedBy: { type: String, default: "" },
    repliedAt: { type: Date, default: null }
  },
  {
    timestamps: true,
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

module.exports = mongoose.model("SupportMessage", supportMessageSchema);
