const mongoose = require("mongoose");

const machineryUsageSchema = new mongoose.Schema(
  {
    unitId: { type: String, required: true, trim: true, index: true },
    equipmentName: { type: String, required: true, trim: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    operator: { type: String, required: true, trim: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    runtimeHours: { type: Number, required: true, min: 0 },
    idleHours: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: "", trim: true },
    loggedBy: { type: String, required: true, lowercase: true, trim: true }
  },
  { timestamps: true }
);

machineryUsageSchema.index({ unitId: 1, startAt: -1 });

module.exports = mongoose.model("MachineryUsage", machineryUsageSchema);
