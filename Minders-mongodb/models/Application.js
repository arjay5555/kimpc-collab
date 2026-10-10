const mongoose = require("mongoose");

// One document per equipment rental request.
const applicationSchema = new mongoose.Schema(
  {
    memberEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    memberName: { type: String, required: true, trim: true },
    equipment: { type: String, required: true, trim: true },
    startDate: { type: String, required: true }, // "YYYY-MM-DD", straight from <input type="date">
    endDate: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.displayId = `APP-${ret.id.slice(-6).toUpperCase()}`;
        ret.submittedAt = ret.createdAt.toISOString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model("Application", applicationSchema);
