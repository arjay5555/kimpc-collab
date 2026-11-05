const mongoose = require("mongoose");

const machineryUnitSchema = new mongoose.Schema(
  {
    // ================= 1. Basic Information =================
    unitId: {
      type: String,
      required: [true, "Asset Code / Unit ID is required"],
      unique: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: [true, "Machinery Name is required"],
      trim: true,
      index: true
    },
    category: {
      type: String,
      enum: ["Tractor", "Harvester", "Baler", "Planter / Seeder", "Sprayer", "Mower / Rake", "Transport / Truck", "Other"],
      default: "Tractor",
      required: true,
      index: true
    },
    brand: {
      type: String,
      required: [true, "Brand is required"],
      trim: true,
      default: "Generic"
    },
    model: {
      type: String,
      required: [true, "Model is required"],
      trim: true,
      default: "Standard"
    },
    serialNumber: {
      type: String,
      default: "",
      trim: true
    },
    modelYear: {
      type: String,
      default: () => String(new Date().getFullYear())
    },
    imageUrl: {
      type: String,
      default: ""
    },
    photos: {
      type: [String],
      default: []
    },

    // ================= 2. Specifications =================
    horsepower: {
      type: Number,
      min: [0, "Horsepower cannot be negative"],
      default: null
    },
    capacity: {
      type: String,
      default: "",
      trim: true
    },
    fuelType: {
      type: String,
      enum: ["Diesel", "Gasoline", "Electric", "Hybrid", "Biofuel", "Other"],
      default: "Diesel"
    },
    attachments: {
      type: [String],
      default: []
    },

    // ================= 3. Rental & Pricing =================
    pricingUnit: {
      type: String,
      enum: ["Per Hectare", "Per Hour", "Per Day"],
      default: "Per Hectare",
      required: true
    },
    memberRate: {
      type: Number,
      required: [true, "Member Rental Rate is required"],
      min: [0, "Rental rate cannot be negative"],
      default: 2500
    },
    nonmemberRate: {
      type: Number,
      min: [0, "Non-member rate cannot be negative"],
      default: null
    },
    minRentalQuantity: {
      type: Number,
      min: [0.01, "Minimum rental quantity must be greater than zero"],
      default: 1
    },
    operatorRequired: {
      type: Boolean,
      default: false
    },
    operatorIncluded: {
      type: Boolean,
      default: false
    },
    fuelIncluded: {
      type: Boolean,
      default: false
    },
    transportIncluded: {
      type: Boolean,
      default: false
    },
    additionalOperatorFee: {
      type: Number,
      min: [0, "Additional operator fee cannot be negative"],
      default: 0
    },
    operatorFeeBasis: {
      type: String,
      enum: ["per booking", "per hectare", "per hour", "per day", "per trip"],
      default: "per day"
    },
    additionalTransportFee: {
      type: Number,
      min: [0, "Additional transport fee cannot be negative"],
      default: 0
    },
    transportFeeBasis: {
      type: String,
      enum: ["per booking", "per hectare", "per hour", "per day", "per trip"],
      default: "per trip"
    },

    // Rental pricing fields:
    ratePerHectare: {
      type: Number,
      min: 0,
      default: 2500
    },
    ratePerDay: {
      type: Number,
      min: 0,
      default: 2500
    },
    ratePerHour: {
      type: Number,
      min: 0,
      default: 400
    },
    depositRequired: { type: Number, min: 0, default: 0 },
    lateFeePerDay: { type: Number, min: 0, default: 0 },
    assignedDriver: { type: String, default: "Unassigned", trim: true },
    driverPhone: { type: String, default: "" },

    // ================= 4. Condition & Maintenance =================
    operatingCondition: {
      type: String,
      enum: ["Operational", "Under Maintenance", "Retired"],
      default: "Operational",
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["Available", "Maintenance", "Repair", "Dispose", "Operational", "Under Maintenance", "Retired"],
      default: "Operational",
      index: true
    },
    currentMeterReading: {
      type: Number,
      min: [0, "Current meter reading cannot be negative"],
      default: 0
    },
    operatingHours: {
      type: Number,
      min: 0,
      default: 0
    },
    meterReadingUnit: {
      type: String,
      enum: ["Hours", "Kilometers", "Hectares"],
      default: "Hours"
    },
    lastServiceDate: {
      type: String,
      default: ""
    },
    lastServiceMeterReading: {
      type: Number,
      min: 0,
      default: null
    },
    nextServiceDate: {
      type: String,
      default: ""
    },
    nextServiceMeterReading: {
      type: Number,
      min: 0,
      default: null
    },
    conditionNotes: {
      type: String,
      default: ""
    },

    // ================= 5. Ownership & Location =================
    acquisitionDate: {
      type: String,
      default: ""
    },
    acquisitionCost: {
      type: Number,
      min: [0, "Acquisition cost cannot be negative"],
      default: 0
    },
    acquisitionSource: {
      type: String,
      enum: ["Purchased New", "Purchased Used", "Government Grant", "Donated", "Leased", "Other", ""],
      default: "Purchased New"
    },
    storageLocation: {
      type: String,
      default: "Main Co-op Depot, Malaybalay",
      trim: true
    },

    // ================= 6. Other Information =================
    operatingRestrictions: {
      type: String,
      default: "",
      trim: true
    },
    notes: {
      type: String,
      default: "",
      trim: true
    },

    // Lifecycle soft-delete / archival
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Unique serial number when provided (allows blank/empty strings without uniqueness collision)
machineryUnitSchema.index(
  { serialNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { serialNumber: { $type: "string", $gt: "" } }
  }
);

// Pre-save synchronization hook to preserve full backward compatibility with legacy routes & bookings
machineryUnitSchema.pre("save", function () {
  // Sync rates
  if (this.memberRate !== undefined && !isNaN(this.memberRate)) {
    this.ratePerDay = this.memberRate;
    if (this.pricingUnit === "Per Hour") {
      this.ratePerHour = this.memberRate;
    } else if (!this.ratePerHour || this.ratePerHour === 400) {
      this.ratePerHour = Math.round(this.memberRate / 6);
    }
  }

  // Sync operatingCondition with status
  if (this.operatingCondition) {
    if (this.operatingCondition === "Operational") {
      this.status = "Available";
    } else if (this.operatingCondition === "Under Maintenance") {
      this.status = "Maintenance";
    } else if (this.operatingCondition === "Retired") {
      this.status = "Dispose";
    }
  } else if (this.status) {
    if (this.status === "Available") {
      this.operatingCondition = "Operational";
    } else if (this.status === "Maintenance" || this.status === "Repair") {
      this.operatingCondition = "Under Maintenance";
    } else if (this.status === "Dispose") {
      this.operatingCondition = "Retired";
    }
  }

  // Sync currentMeterReading and operatingHours
  if (this.currentMeterReading !== undefined && !isNaN(this.currentMeterReading)) {
    this.operatingHours = this.currentMeterReading;
  } else if (this.operatingHours !== undefined && !isNaN(this.operatingHours)) {
    this.currentMeterReading = this.operatingHours;
  }

  // Business rule: prevent charging additional fees if service is included in rate
  if (this.operatorIncluded) {
    this.additionalOperatorFee = 0;
  }
  if (this.transportIncluded) {
    this.additionalTransportFee = 0;
  }
});

module.exports = mongoose.model("MachineryUnit", machineryUnitSchema);
