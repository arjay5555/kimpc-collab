const mongoose = require("mongoose");

const machineryMaintenanceSchema = new mongoose.Schema(
  {
    equipmentUnitId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    equipmentName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    startDate: {
      type: String, // "YYYY-MM-DD"
      required: true,
      index: true
    },
    endDate: {
      type: String, // "YYYY-MM-DD"
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["Out of Service", "In Repair", "Scheduled Maintenance", "Completed"],
      default: "Out of Service",
      index: true
    },
    maintenanceType: {
      type: String,
      enum: ["Routine Servicing", "Emergency Breakdown", "Hydraulic Repair", "Tire Replacement", "General Overhaul"],
      default: "Routine Servicing"
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    assignedMechanic: {
      type: String,
      default: "In-house Co-op Technician"
    },
    loggedByManager: {
      type: String,
      default: "manager@minders.test"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("MachineryMaintenance", machineryMaintenanceSchema);
