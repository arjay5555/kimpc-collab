const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Driver name is required"],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["On Duty", "Available", "Sick Leave", "Half-Day Leave", "Off Duty"],
      default: "On Duty",
      index: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    workHours: {
      type: Number,
      default: 160,
    },
    performance: {
      type: Number,
      default: 4.5,
    },
    performanceLabel: {
      type: String,
      default: "Excellent",
    },
    licenseNumber: {
      type: String,
      default: "",
      trim: true,
    },
    dutyDays: {
      type: [Number],
      default: [1, 2, 6, 8, 9, 13, 14, 18, 20, 21, 28],
    },
    schedule: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Driver", driverSchema);

