const mongoose = require("mongoose");

// One document per equipment rental request.
const applicationSchema = new mongoose.Schema(
  {
    memberEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    memberName: { type: String, required: true, trim: true },
    equipment: { type: String, required: true, trim: true },
    machineryUnitId: { type: String, default: "", trim: true, index: true },
    startDate: { type: String, required: true }, // "YYYY-MM-DD", straight from <input type="date">
    endDate: { type: String, required: true },
    status: { 
      type: String, 
      enum: ["Pending", "Approved", "Checked-Out", "Returned", "Rejected", "Cancelled"], 
      default: "Pending",
      index: true 
    },
    managerRemarks: { type: String, default: "", trim: true },
    isWalkIn: { type: Boolean, default: false },
    farmerPhone: { type: String, default: "" },
    checkoutInspection: {
      odometerHours: { type: Number, default: 0 },
      fuelLevel: { type: String, default: "100%" },
      notes: { type: String, default: "" },
      photoCount: { type: Number, default: 0 },
      inspectedAt: { type: Date }
    },
    checkinInspection: {
      odometerHours: { type: Number, default: 0 },
      fuelLevel: { type: String, default: "100%" },
      notes: { type: String, default: "" },
      photoCount: { type: Number, default: 0 },
      inspectedAt: { type: Date }
    },
    financials: {
      dailyRate: { type: Number, default: 0 },
      deposit: { type: Number, default: 0 },
      lateFee: { type: Number, default: 0 },
      repairDeduction: { type: Number, default: 0 },
      fuelCharge: { type: Number, default: 0 },
      totalPaid: { type: Number, default: 0 },
      refundAmount: { type: Number, default: 0 },
      paymentMethod: { type: String, default: "Cash" },
      isSettled: { type: Boolean, default: false }
    },
    // Google Calendar 2-Way Synchronization
    googleCalendarEventId: { type: String, default: "", index: true }
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
