const mongoose = require("mongoose");

const machineryUnitSchema = new mongoose.Schema(
  {
    unitId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    category: {
      type: String,
      enum: ["Tractor", "Harvester", "Baler", "Planter / Seeder", "Sprayer", "Mower / Rake", "Transport / Truck", "Other"],
      default: "Tractor"
    },
    imageUrl: {
      type: String,
      default: ""
    },
    assignedDriver: {
      type: String,
      default: "Unassigned",
      trim: true
    },
    driverPhone: {
      type: String,
      default: ""
    },
    ratePerDay: {
      type: Number,
      required: true,
      min: 0,
      default: 2500
    },
    ratePerHour: {
      type: Number,
      required: true,
      min: 0,
      default: 400
    },
    depositRequired: { type: Number, min: 0, default: 0 },
    lateFeePerDay: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["Available", "Maintenance", "Repair", "Dispose"],
      default: "Available",
      index: true
    },
    conditionNotes: {
      type: String,
      default: ""
    },
    serialNumber: {
      type: String,
      default: ""
    },
    modelYear: {
      type: String,
      default: "2023"
    },
    fuelType: {
      type: String,
      default: "Diesel"
    },
    operatingHours: {
      type: Number,
      default: 0
    },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("MachineryUnit", machineryUnitSchema);
