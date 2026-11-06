const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const router = express.Router();

const MachineryUnit = require("../models/MachineryUnit");
const MachineryMaintenance = require("../models/MachineryMaintenance");
const Application = require("../models/Application");
const Account = require("../models/Account");

const authManager = require("../middleware/authManager");
const { logAudit } = require("../services/auditLogger");
const { syncMaintenanceToGoogleCalendar } = require("../services/googleCalendarService");
const cloudinaryService = require("../services/cloudinaryService");
const { getMachineryUtilization } = require("../controllers/managerAnalyticsController");
const { clean, fail, isSameMachineryMatch } = require("./routeHelpers");

const JWT_SECRET = process.env.JWT_SECRET || "minders-secret-jwt-key-cooperative-2026";

/**
 * Optional authentication helper: identifies user role if Bearer token present.
 * Does not block anonymous visitors, but allows manager/admin views.
 */
async function optionalAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    try {
      const token = authorization.slice("Bearer ".length).trim();
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.id || payload.email) {
        const account = await Account.findOne(
          payload.id ? { _id: payload.id } : { email: String(payload.email).trim().toLowerCase() }
        ).select("_id email fullName role");
        if (account) req.user = account;
      }
    } catch {
      // Continue without user object on token error
    }
  }
  next();
}

/**
 * Seed default farm machinery units if database is empty
 */
async function seedDefaultMachineryUnits() {
  try {
    const count = await MachineryUnit.countDocuments();
    if (count > 0) return;

    const initialUnits = [
      {
        unitId: "JD-5075-01",
        name: "5075E Utility Tractor",
        brand: "John Deere",
        model: "5075E",
        category: "Tractor",
        imageUrl: "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Hectare",
        memberRate: 2800,
        nonmemberRate: 3500,
        ratePerDay: 2800,
        ratePerHour: 450,
        minRentalQuantity: 1,
        operatorRequired: false,
        operatorIncluded: false,
        fuelIncluded: false,
        transportIncluded: false,
        additionalOperatorFee: 600,
        operatorFeeBasis: "per day",
        additionalTransportFee: 1200,
        transportFeeBasis: "per trip",
        operatingCondition: "Operational",
        status: "Available",
        horsepower: 75,
        capacity: "Cat II 3-Point Hitch",
        fuelType: "Diesel",
        attachments: ["Rotary Tiller", "Disc Plough", "Front Loader"],
        currentMeterReading: 640,
        operatingHours: 640,
        meterReadingUnit: "Hours",
        modelYear: "2023",
        serialNumber: "1PY5075EKP012894",
        lastServiceDate: "2026-08-15",
        lastServiceMeterReading: 500,
        nextServiceDate: "2027-02-15",
        nextServiceMeterReading: 750,
        acquisitionDate: "2023-04-10",
        acquisitionCost: 1850000,
        acquisitionSource: "Purchased New",
        storageLocation: "Main Depot Shed A, Malaybalay",
        operatingRestrictions: "Maximum operating incline 20°. Requires experienced driver for road transit.",
        notes: "Routine 500-hr overhaul completed. Oil filters in stock in storage bin 4.",
      },
      {
        unitId: "KB-DC70-02",
        name: "DC-70 Plus Combine Harvester",
        brand: "Kubota",
        model: "DC-70 Plus",
        category: "Harvester",
        imageUrl: "https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Hectare",
        memberRate: 5500,
        nonmemberRate: 6800,
        ratePerDay: 5500,
        ratePerHour: 850,
        minRentalQuantity: 1,
        operatorRequired: true,
        operatorIncluded: true,
        fuelIncluded: false,
        transportIncluded: false,
        additionalOperatorFee: 0,
        operatorFeeBasis: "per day",
        additionalTransportFee: 2500,
        transportFeeBasis: "per trip",
        operatingCondition: "Operational",
        status: "Available",
        horsepower: 70,
        capacity: "2.075m cutting width, 1.4-ton grain tank",
        fuelType: "Diesel",
        attachments: ["Standard Rice Cutter Bar", "Corn Header Attachment"],
        currentMeterReading: 820,
        operatingHours: 820,
        meterReadingUnit: "Hours",
        modelYear: "2022",
        serialNumber: "KBDC70-99231-PH",
        lastServiceDate: "2026-09-01",
        lastServiceMeterReading: 750,
        nextServiceDate: "2027-03-01",
        nextServiceMeterReading: 1000,
        acquisitionDate: "2022-09-12",
        acquisitionCost: 2950000,
        acquisitionSource: "Purchased New",
        storageLocation: "Main Depot Shed B, Malaybalay",
        operatingRestrictions: "Operates strictly in drained paddy conditions. Flatbed hauler transport required.",
        notes: "Certified operator provided by co-op pool. Hydrostatic drive inspected.",
      },
      {
        unitId: "NH-RB450-03",
        name: "Roll-Belt 450 Round Baler",
        brand: "New Holland",
        model: "Roll-Belt 450",
        category: "Baler",
        imageUrl: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Day",
        memberRate: 3200,
        nonmemberRate: 4000,
        ratePerDay: 3200,
        ratePerHour: 500,
        minRentalQuantity: 1,
        operatorRequired: false,
        operatorIncluded: false,
        fuelIncluded: false,
        transportIncluded: false,
        additionalOperatorFee: 500,
        operatorFeeBasis: "per day",
        additionalTransportFee: 1000,
        transportFeeBasis: "per trip",
        operatingCondition: "Under Maintenance",
        status: "Maintenance",
        horsepower: 55,
        capacity: "4x5 ft round bales",
        fuelType: "Diesel",
        attachments: ["Bale Ramp", "Wide Pickup Assembly"],
        currentMeterReading: 410,
        operatingHours: 410,
        meterReadingUnit: "Hours",
        modelYear: "2023",
        serialNumber: "NHRB450-7712",
        lastServiceDate: "2026-10-10",
        lastServiceMeterReading: 400,
        nextServiceDate: "2026-11-15",
        nextServiceMeterReading: 500,
        acquisitionDate: "2023-01-20",
        acquisitionCost: 1400000,
        acquisitionSource: "Purchased New",
        storageLocation: "Workshop Bay 2, Malaybalay",
        operatingRestrictions: "Requires 55+ HP tractor PTO connection at 540 RPM.",
        notes: "Routine belt tensioning and knotter adjustment scheduled.",
      },
      {
        unitId: "CASE-90JX-04",
        name: "Farmall 90JX 4WD Tractor",
        brand: "Case IH",
        model: "Farmall 90JX",
        category: "Tractor",
        imageUrl: "https://images.unsplash.com/photo-1594771804886-a933bb2d609b?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Hectare",
        memberRate: 3600,
        nonmemberRate: 4500,
        ratePerDay: 3600,
        ratePerHour: 550,
        minRentalQuantity: 1,
        operatorRequired: false,
        operatorIncluded: false,
        fuelIncluded: false,
        transportIncluded: false,
        additionalOperatorFee: 650,
        operatorFeeBasis: "per day",
        additionalTransportFee: 1500,
        transportFeeBasis: "per trip",
        operatingCondition: "Operational",
        status: "Available",
        horsepower: 90,
        capacity: "Heavy 3-Point Lift (3,565 kg)",
        fuelType: "Diesel",
        attachments: ["Heavy Duty Subsoiler", "Disc Harrow 24-Blade"],
        currentMeterReading: 1120,
        operatingHours: 1120,
        meterReadingUnit: "Hours",
        modelYear: "2021",
        serialNumber: "CIH90JX-55021",
        lastServiceDate: "2026-07-20",
        lastServiceMeterReading: 1000,
        nextServiceDate: "2027-01-20",
        nextServiceMeterReading: 1250,
        acquisitionDate: "2021-03-15",
        acquisitionCost: 2200000,
        acquisitionSource: "Purchased New",
        storageLocation: "Main Depot Shed A, Malaybalay",
        operatingRestrictions: "Heavy field operations. Soil moisture inspection mandatory prior to deep tillage.",
        notes: "High demand during land preparation season.",
      },
      {
        unitId: "KH-GA4121-05",
        name: "GA 4121 GM Rotary Hay Rake",
        brand: "Kuhn",
        model: "GA 4121 GM",
        category: "Mower / Rake",
        imageUrl: "https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Day",
        memberRate: 1900,
        nonmemberRate: 2400,
        ratePerDay: 1900,
        ratePerHour: 320,
        minRentalQuantity: 1,
        operatorRequired: false,
        operatorIncluded: false,
        fuelIncluded: false,
        transportIncluded: false,
        additionalOperatorFee: 0,
        operatorFeeBasis: "per day",
        additionalTransportFee: 800,
        transportFeeBasis: "per trip",
        operatingCondition: "Under Maintenance",
        status: "Repair",
        horsepower: 35,
        capacity: "4.1m Working Width",
        fuelType: "Diesel",
        attachments: ["Swath Board", "Tandem Axle Wheels"],
        currentMeterReading: 350,
        operatingHours: 350,
        meterReadingUnit: "Hours",
        modelYear: "2022",
        serialNumber: "KH-GA4121-8841",
        lastServiceDate: "2026-05-12",
        lastServiceMeterReading: 300,
        nextServiceDate: "2026-11-20",
        nextServiceMeterReading: 400,
        acquisitionDate: "2022-04-18",
        acquisitionCost: 650000,
        acquisitionSource: "Purchased New",
        storageLocation: "Workshop Bay 1, Malaybalay",
        operatingRestrictions: "Hydraulic lift cylinder seal kit ordered. Keep off-field until repair verified.",
        notes: "Hydraulic leak identified during inspection.",
      },
      {
        unitId: "ISZ-FWD-06",
        name: "Forward 6-Wheeler Flatbed Hauler",
        brand: "Isuzu",
        model: "Forward",
        category: "Transport / Truck",
        imageUrl: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Day",
        memberRate: 4200,
        nonmemberRate: 5200,
        ratePerDay: 4200,
        ratePerHour: 650,
        minRentalQuantity: 1,
        operatorRequired: true,
        operatorIncluded: true,
        fuelIncluded: false,
        transportIncluded: true,
        additionalOperatorFee: 0,
        operatorFeeBasis: "per day",
        additionalTransportFee: 0,
        transportFeeBasis: "per trip",
        operatingCondition: "Operational",
        status: "Available",
        horsepower: 190,
        capacity: "8-Ton Payload Flatbed with Heavy Ramps",
        fuelType: "Diesel",
        attachments: ["Winch 12,000 lbs", "Steel Wheel Chocks"],
        currentMeterReading: 1450,
        operatingHours: 1450,
        meterReadingUnit: "Kilometers",
        modelYear: "2020",
        serialNumber: "ISZ-FWD-6602-PH",
        lastServiceDate: "2026-08-30",
        lastServiceMeterReading: 1380,
        nextServiceDate: "2027-02-28",
        nextServiceMeterReading: 1600,
        acquisitionDate: "2020-06-25",
        acquisitionCost: 2600000,
        acquisitionSource: "Purchased Used",
        storageLocation: "Depot Logistics Bay, Malaybalay",
        operatingRestrictions: "Restricted to authorized co-op truck drivers with LTO Professional License.",
        notes: "Dedicated machinery transport truck for cluster farms.",
      },
      {
        unitId: "AG-SPR600-07",
        name: "Precision Boom Sprayer (600L)",
        brand: "Ag Leader",
        model: "Boom Sprayer 600L",
        category: "Sprayer",
        imageUrl: "https://images.unsplash.com/photo-1530267981375-f0de937f5f13?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Hectare",
        memberRate: 2100,
        nonmemberRate: 2700,
        ratePerDay: 2100,
        ratePerHour: 340,
        minRentalQuantity: 1,
        operatorRequired: false,
        operatorIncluded: false,
        fuelIncluded: false,
        transportIncluded: false,
        additionalOperatorFee: 450,
        operatorFeeBasis: "per day",
        additionalTransportFee: 900,
        transportFeeBasis: "per trip",
        operatingCondition: "Operational",
        status: "Available",
        horsepower: 40,
        capacity: "600-Liter Poly Tank, 12m Boom",
        fuelType: "Diesel",
        attachments: ["Triple Nozzle Assembly", "Chemical Induction Hopper"],
        currentMeterReading: 290,
        operatingHours: 290,
        meterReadingUnit: "Hours",
        modelYear: "2023",
        serialNumber: "AG-SPR600-4319",
        lastServiceDate: "2026-09-10",
        lastServiceMeterReading: 250,
        nextServiceDate: "2027-03-10",
        nextServiceMeterReading: 350,
        acquisitionDate: "2023-05-02",
        acquisitionCost: 880000,
        acquisitionSource: "Government Grant",
        storageLocation: "Main Depot Shed B, Malaybalay",
        operatingRestrictions: "Triple clean flush required immediately after herbicide/pesticide application.",
        notes: "Calibration certificate renewed August 2026.",
      },
      {
        unitId: "MF-1840-08",
        name: "1840 Square Baler",
        brand: "Massey Ferguson",
        model: "1840",
        category: "Baler",
        imageUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=700&q=80",
        pricingUnit: "Per Day",
        memberRate: 2400,
        nonmemberRate: 3000,
        ratePerDay: 2400,
        ratePerHour: 380,
        minRentalQuantity: 1,
        operatorRequired: false,
        operatorIncluded: false,
        fuelIncluded: false,
        transportIncluded: false,
        additionalOperatorFee: 0,
        operatorFeeBasis: "per day",
        additionalTransportFee: 0,
        transportFeeBasis: "per trip",
        operatingCondition: "Retired",
        status: "Dispose",
        horsepower: 50,
        capacity: "Small square bales 14x18 in",
        fuelType: "Diesel",
        attachments: ["Standard Chute"],
        currentMeterReading: 3200,
        operatingHours: 3200,
        meterReadingUnit: "Hours",
        modelYear: "2016",
        serialNumber: "MF-1840-22019",
        lastServiceDate: "2025-11-05",
        lastServiceMeterReading: 3150,
        nextServiceDate: "",
        nextServiceMeterReading: null,
        acquisitionDate: "2016-08-10",
        acquisitionCost: 950000,
        acquisitionSource: "Purchased New",
        storageLocation: "Salvage Yard Depot, Malaybalay",
        operatingRestrictions: "End of lifecycle. Knotter drive gearbox beyond economic repair. Co-op liquidation pending.",
        notes: "Preserved for historical booking audit. Not available for new bookings.",
      },
    ];

    await MachineryUnit.insertMany(initialUnits);
    console.log("Seeded initial Machinery Units collection successfully with full specs.");
  } catch (err) {
    console.error("Error seeding default machinery units:", err);
  }
}

/**
 * Normalizes a unit document ensuring all new fields have clean fallbacks.
 */
function normalizeUnit(unit) {
  const obj = unit.toObject ? unit.toObject() : { ...unit };
  if (!obj.brand || !obj.model || obj.brand === "Generic" || obj.model === "Standard") {
    const rawName = obj.name || "";
    if (rawName.includes("John Deere")) {
      obj.brand = "John Deere";
      obj.model = rawName.replace("John Deere", "").trim();
    } else if (rawName.includes("Kubota")) {
      obj.brand = "Kubota";
      obj.model = rawName.replace("Kubota", "").trim();
    } else if (rawName.includes("New Holland")) {
      obj.brand = "New Holland";
      obj.model = rawName.replace("New Holland", "").trim();
    } else if (rawName.includes("Case IH")) {
      obj.brand = "Case IH";
      obj.model = rawName.replace("Case IH", "").trim();
    } else if (rawName.includes("Kuhn")) {
      obj.brand = "Kuhn";
      obj.model = rawName.replace("Kuhn", "").trim();
    } else if (rawName.includes("Isuzu")) {
      obj.brand = "Isuzu";
      obj.model = rawName.replace("Isuzu", "").trim();
    } else if (rawName.includes("Ag Leader")) {
      obj.brand = "Ag Leader";
      obj.model = rawName.replace("Ag Leader", "").trim();
    } else if (rawName.includes("Massey Ferguson")) {
      obj.brand = "Massey Ferguson";
      obj.model = rawName.replace("Massey Ferguson", "").trim();
    } else {
      const parts = rawName.split(" ");
      obj.brand = parts[0] || obj.category || "Standard";
      obj.model = parts.slice(1).join(" ") || "Model";
    }
  }

  obj.pricingUnit = obj.pricingUnit || "Per Hectare";
  obj.memberRate = obj.memberRate !== undefined ? obj.memberRate : (obj.ratePerDay || 2500);
  obj.nonmemberRate = obj.nonmemberRate !== undefined ? obj.nonmemberRate : Math.round(obj.memberRate * 1.25);
  obj.minRentalQuantity = obj.minRentalQuantity || 1;

  if (!obj.operatingCondition || obj.operatingCondition === "Operational") {
    if (obj.status === "Maintenance" || obj.status === "Repair") {
      obj.operatingCondition = "Under Maintenance";
    } else if (["Dispose", "Unavailable", "Retired"].includes(obj.status)) {
      obj.operatingCondition = "Retired";
    } else {
      obj.operatingCondition = "Operational";
    }
  }

  obj.currentMeterReading = obj.currentMeterReading !== undefined ? obj.currentMeterReading : (obj.operatingHours || 0);
  obj.meterReadingUnit = obj.meterReadingUnit || "Hours";
  obj.assignedDriver = obj.assignedDriver || "Unassigned";
  obj.driverPhone = obj.driverPhone || "";
  return obj;
}

/**
 * POST /api/machinery-units/upload-photo
 * Handles image upload to Cloudinary (with automatic local fallback)
 */
router.post("/machinery-units/upload-photo", authManager, async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image || typeof image !== "string") {
      return fail(res, 400, "Image data payload is required.");
    }

    const uploadResult = await cloudinaryService.uploadImage(image, {
      folder: "kimpc/machinery",
      filename: filename || "machinery-unit",
    });

    return res.status(201).json({
      ok: true,
      imageUrl: uploadResult.url,
      publicId: uploadResult.publicId || "",
      provider: uploadResult.provider,
      message: `Machinery photo uploaded successfully via ${uploadResult.provider}.`
    });
  } catch (err) {
    console.error("Error uploading machinery photo:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to upload machinery photo." });
  }
});

/**
 * GET /api/machinery-units
 * Returns machinery units with summary counts, search, filtering, and role-based data scrubbing.
 */
router.get("/machinery-units", optionalAuth, async (req, res) => {
  try {
    await seedDefaultMachineryUnits();

    const {
      search,
      type,
      category,
      condition,
      status,
      page = 1,
      limit = 0, // 0 returns all
    } = req.query;

    const filter = { isArchived: { $ne: true } };

    // Search by asset code (unitId), name, brand, model, or serial number
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { unitId: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
        { brand: { $regex: q, $options: "i" } },
        { model: { $regex: q, $options: "i" } },
        { serialNumber: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
      ];
    }

    // Filter by machinery type
    const targetType = type || category;
    if (targetType && targetType !== "All") {
      filter.category = targetType;
    }

    // Filter by operating condition
    const targetCond = condition || status;
    if (targetCond && targetCond !== "All") {
      if (targetCond === "Operational" || targetCond === "Available") {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [{ operatingCondition: "Operational" }, { status: "Available" }]
        });
      } else if (targetCond === "Under Maintenance" || targetCond === "Maintenance") {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { operatingCondition: "Under Maintenance" },
            { status: { $in: ["Maintenance", "Repair"] } }
          ]
        });
      } else if (targetCond === "Retired" || targetCond === "Dispose") {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { operatingCondition: "Retired" },
            { status: { $in: ["Dispose", "Unavailable", "Retired"] } }
          ]
        });
      } else {
        filter.operatingCondition = targetCond;
      }
    }

    // Calculate Summary Counts (Total, Operational, Under Maintenance, Retired)
    const allActiveUnits = await MachineryUnit.find({ isArchived: { $ne: true } }).select("operatingCondition status");
    const counts = {
      total: allActiveUnits.length,
      operational: 0,
      underMaintenance: 0,
      retired: 0,
    };

    allActiveUnits.forEach((u) => {
      let cond = u.operatingCondition;
      if (!cond || cond === "Operational") {
        if (u.status === "Maintenance" || u.status === "Repair") cond = "Under Maintenance";
        else if (["Dispose", "Unavailable", "Retired"].includes(u.status)) cond = "Retired";
        else cond = "Operational";
      }
      if (cond === "Operational") counts.operational++;
      else if (cond === "Under Maintenance") counts.underMaintenance++;
      else if (cond === "Retired") counts.retired++;
    });

    let query = MachineryUnit.find(filter).sort({ createdAt: -1 });

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = parseInt(limit, 10) || 0;

    const totalMatching = await MachineryUnit.countDocuments(filter);

    if (limitNum > 0) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const rawUnits = await query;
    let units = rawUnits.map(normalizeUnit);

    // Role-based redaction: only manager or admin can see acquisition costs and private staff notes
    const isManagerOrAdmin = req.user && (req.user.role === "manager" || req.user.role === "admin");
    if (!isManagerOrAdmin) {
      units = units.map((u) => {
        delete u.acquisitionCost;
        delete u.notes;
        return u;
      });
    }

    res.json({
      ok: true,
      data: units,
      total: totalMatching,
      counts,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error("Error fetching machinery units:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch machinery units" });
  }
});

/**
 * GET /api/machinery-units/:id/availability
 * Returns privacy-safe booking and maintenance periods for the next year.
 */
router.get("/machinery-units/:id/availability", optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const unit = mongoose.isValidObjectId(id)
      ? await MachineryUnit.findById(id)
      : await MachineryUnit.findOne({ unitId: clean(id) });
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found" });

    const timestamp = (value, endOfDate = false) => {
      const raw = String(value || "").trim();
      const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T${endOfDate ? "23:59:59.999" : "00:00:00.000"}Z`
        : raw;
      const result = new Date(normalized).getTime();
      return Number.isFinite(result) ? result : null;
    };
    const now = Date.now();
    const horizon = now + 366 * 24 * 60 * 60 * 1000;
    const overlapsHorizon = (startDate, endDate) => {
      const start = timestamp(startDate);
      const end = timestamp(endDate, !String(endDate || "").includes("T"));
      return start !== null && end !== null && start <= horizon && end >= now;
    };

    const [applications, maintenance] = await Promise.all([
      Application.find({
        $or: [{ machineryUnitId: unit.unitId }, { equipment: unit.name }],
        status: { $in: ["Pending", "Approved", "Checked-Out"] },
      }).select("startDate endDate status").lean(),
      MachineryMaintenance.find({
        equipmentUnitId: unit.unitId,
        status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
      }).select("startDate endDate status").lean(),
    ]);

    const data = [
      ...applications.filter((item) => overlapsHorizon(item.startDate, item.endDate)).map((item) => ({
        type: "booking",
        startDate: item.startDate,
        endDate: item.endDate,
        status: item.status,
      })),
      ...maintenance.filter((item) => overlapsHorizon(item.startDate, item.endDate)).map((item) => ({
        type: "maintenance",
        startDate: item.startDate,
        endDate: item.endDate,
        status: item.status,
      })),
    ].sort((a, b) => timestamp(a.startDate) - timestamp(b.startDate));

    res.json({ ok: true, data });
  } catch (error) {
    console.error("Error fetching machinery availability:", error);
    res.status(500).json({ ok: false, error: "Failed to fetch machinery availability." });
  }
});

/**
 * GET /api/machinery-units/:id
 * Returns single unit details, maintenance history, and active bookings.
 */
router.get("/machinery-units/:id", optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    let unit = null;

    if (mongoose.isValidObjectId(id)) {
      unit = await MachineryUnit.findById(id);
    }
    if (!unit) {
      unit = await MachineryUnit.findOne({ unitId: clean(id) });
    }
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found" });

    const normalized = normalizeUnit(unit);

    // Role-based redaction for non-managers
    const isManagerOrAdmin = req.user && (req.user.role === "manager" || req.user.role === "admin");
    if (!isManagerOrAdmin) {
      delete normalized.acquisitionCost;
      delete normalized.notes;
    }

    // Attach maintenance records from MachineryMaintenance collection
    const maintenanceHistory = await MachineryMaintenance.find({
      equipmentUnitId: unit.unitId
    }).sort({ startDate: -1 });

    // Attach recent/active bookings from Application collection
    let bookingsQuery = Application.find({
      $or: [{ machineryUnitId: unit.unitId }, { equipment: unit.name }]
    })
      .sort({ startDate: -1 })
      .limit(10);
    bookingsQuery = isManagerOrAdmin
      ? bookingsQuery.select("displayId memberName startDate endDate status financials createdAt")
      : bookingsQuery.select("startDate endDate status createdAt");
    const bookings = await bookingsQuery.lean();

    res.json({
      ok: true,
      data: normalized,
      maintenanceHistory,
      bookings
    });
  } catch (err) {
    console.error("Error fetching machinery unit details:", err);
    res.status(500).json({ ok: false, error: "Error fetching unit details" });
  }
});

/**
 * POST /api/machinery-units
 * Registers a new machinery unit with strict validation.
 */
router.post("/machinery-units", authManager, async (req, res) => {
  try {
    const body = req.body || {};
    const unitId = clean(body.unitId);
    const name = clean(body.name);
    const category = clean(body.category) || "Tractor";
    const brand = clean(body.brand);
    const model = clean(body.model);
    const pricingUnit = clean(body.pricingUnit) || "Per Hectare";
    const memberRate = Number(body.memberRate !== undefined ? body.memberRate : body.ratePerDay);
    const operatingCondition = clean(body.operatingCondition) || "Operational";

    // Required fields check
    if (!unitId || !name || !brand || !model) {
      return fail(res, 400, "Asset Code (Unit ID), Machinery Name, Brand, and Model are required.");
    }
    if (!category) {
      return fail(res, 400, "Machinery Type / Category is required.");
    }
    if (!pricingUnit) {
      return fail(res, 400, "Pricing Unit (Per Hectare, Per Hour, Per Day) is required.");
    }
    if (isNaN(memberRate) || memberRate < 0) {
      return fail(res, 400, "Member Rental Rate is required and must be a non-negative number.");
    }
    if (!["Operational", "Under Maintenance", "Retired"].includes(operatingCondition)) {
      return fail(res, 400, "Operating condition must be Operational, Under Maintenance, or Retired.");
    }

    // Numeric validation checks
    const nonmemberRate = body.nonmemberRate !== undefined && body.nonmemberRate !== "" ? Number(body.nonmemberRate) : null;
    if (nonmemberRate !== null && (isNaN(nonmemberRate) || nonmemberRate < 0)) {
      return fail(res, 400, "Non-member rate cannot be negative.");
    }

    const minRentalQuantity = Number(body.minRentalQuantity || 1);
    if (isNaN(minRentalQuantity) || minRentalQuantity <= 0) {
      return fail(res, 400, "Minimum rental quantity must be greater than zero.");
    }

    const horsepower = body.horsepower !== undefined && body.horsepower !== "" ? Number(body.horsepower) : null;
    if (horsepower !== null && (isNaN(horsepower) || horsepower < 0)) {
      return fail(res, 400, "Horsepower cannot be negative.");
    }

    const currentMeterReading = Number(body.currentMeterReading || body.operatingHours || 0);
    if (isNaN(currentMeterReading) || currentMeterReading < 0) {
      return fail(res, 400, "Current meter reading cannot be negative.");
    }

    const acquisitionCost = Number(body.acquisitionCost || 0);
    if (isNaN(acquisitionCost) || acquisitionCost < 0) {
      return fail(res, 400, "Acquisition cost cannot be negative.");
    }

    // Operator and Transport business rules:
    const operatorIncluded = Boolean(body.operatorIncluded);
    const fuelIncluded = Boolean(body.fuelIncluded);
    const transportIncluded = Boolean(body.transportIncluded);
    const operatorRequired = Boolean(body.operatorRequired);

    let additionalOperatorFee = Number(body.additionalOperatorFee || 0);
    if (operatorIncluded) {
      additionalOperatorFee = 0; // Prevent charging if included in rate
    } else if (additionalOperatorFee < 0) {
      return fail(res, 400, "Additional operator fee cannot be negative.");
    }

    let additionalTransportFee = Number(body.additionalTransportFee || 0);
    if (transportIncluded) {
      additionalTransportFee = 0; // Prevent charging if included in rate
    } else if (additionalTransportFee < 0) {
      return fail(res, 400, "Additional transport fee cannot be negative.");
    }

    // Serial number uniqueness check
    const serialNumber = clean(body.serialNumber);
    if (serialNumber) {
      const serialExists = await MachineryUnit.findOne({ serialNumber });
      if (serialExists) {
        return fail(res, 409, `A machinery unit with Serial Number "${serialNumber}" already exists.`);
      }
    }

    // Asset code uniqueness check
    const existing = await MachineryUnit.findOne({ unitId });
    if (existing) {
      return fail(res, 409, `A machinery unit with Asset Code "${unitId}" already exists.`);
    }

    const attachments = Array.isArray(body.attachments)
      ? body.attachments
      : typeof body.attachments === "string" && body.attachments.trim()
      ? body.attachments.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const newUnit = await MachineryUnit.create({
      unitId,
      name,
      category,
      brand,
      model,
      serialNumber,
      modelYear: clean(body.modelYear) || String(new Date().getFullYear()),
      imageUrl: clean(body.imageUrl),
      photos: Array.isArray(body.photos) ? body.photos : (body.imageUrl ? [body.imageUrl] : []),
      horsepower,
      capacity: clean(body.capacity),
      fuelType: clean(body.fuelType) || "Diesel",
      attachments,
      pricingUnit,
      memberRate,
      nonmemberRate,
      ratePerDay: memberRate,
      ratePerHour: pricingUnit === "Per Hour" ? memberRate : Math.round(memberRate / 6),
      minRentalQuantity,
      operatorRequired,
      operatorIncluded,
      fuelIncluded,
      transportIncluded,
      additionalOperatorFee,
      operatorFeeBasis: clean(body.operatorFeeBasis) || "per day",
      additionalTransportFee,
      transportFeeBasis: clean(body.transportFeeBasis) || "per trip",
      operatingCondition,
      status: operatingCondition === "Operational" ? "Available" : operatingCondition === "Under Maintenance" ? "Maintenance" : "Dispose",
      currentMeterReading,
      operatingHours: currentMeterReading,
      meterReadingUnit: clean(body.meterReadingUnit) || "Hours",
      lastServiceDate: clean(body.lastServiceDate),
      lastServiceMeterReading: body.lastServiceMeterReading ? Number(body.lastServiceMeterReading) : null,
      nextServiceDate: clean(body.nextServiceDate),
      nextServiceMeterReading: body.nextServiceMeterReading ? Number(body.nextServiceMeterReading) : null,
      conditionNotes: clean(body.conditionNotes),
      acquisitionDate: clean(body.acquisitionDate),
      acquisitionCost,
      acquisitionSource: clean(body.acquisitionSource) || "Purchased New",
      storageLocation: clean(body.storageLocation) || "Main Co-op Depot, Malaybalay",
      operatingRestrictions: clean(body.operatingRestrictions),
      notes: clean(body.notes),
      assignedDriver: clean(body.assignedDriver) || "Unassigned",
      driverPhone: clean(body.driverPhone) || "",
    });

    const managerEmail = req.user?.email || "manager";
    await logAudit({
      action: "MACHINERY_UNIT_CREATED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: `Registered machinery unit ${unitId} (${name}, ${brand} ${model}). Condition: ${operatingCondition}, Rate: ₱${memberRate}/${pricingUnit}.`,
      req,
    });

    res.status(201).json({
      ok: true,
      data: normalizeUnit(newUnit),
      message: `Machinery unit ${unitId} successfully registered.`,
    });
  } catch (err) {
    console.error("Error creating machinery unit:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to create machinery unit." });
  }
});

/**
 * PUT /api/machinery-units/:id
 * Updates an existing machinery unit with full validation and active-booking guards.
 */
router.put("/machinery-units/:id", authManager, async (req, res) => {
  try {
    const id = req.params.id;
    let unit = null;

    if (mongoose.isValidObjectId(id)) {
      unit = await MachineryUnit.findById(id);
    }
    if (!unit) {
      unit = await MachineryUnit.findOne({ unitId: clean(id) });
    }
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    const body = req.body || {};
    const oldCondition = unit.operatingCondition || (unit.status === "Available" ? "Operational" : "Under Maintenance");
    const newCondition = clean(body.operatingCondition) || oldCondition;

    // Check if transitioning away from Operational to Under Maintenance or Retired:
    const isRetiringOrMaintenance = (newCondition === "Under Maintenance" || newCondition === "Retired") && oldCondition === "Operational";
    if (isRetiringOrMaintenance) {
      const todayIso = new Date().toISOString().split("T")[0];
      const activeBookings = await Application.find({
        status: { $in: ["Approved", "Checked-Out"] },
        endDate: { $gte: todayIso },
        $or: [{ machineryUnitId: unit.unitId }, { equipment: unit.name }]
      }).select("displayId memberName startDate endDate status");

      if (activeBookings.length > 0) {
        return fail(
          res,
          400,
          `Cannot change operating condition to "${newCondition}". Unit has ${activeBookings.length} active/ongoing booking(s): [${activeBookings
            .map((b) => `${b.displayId || "APP"} (${b.startDate} to ${b.endDate}, ${b.memberName})`)
            .join("; ")}]. Please resolve or reassign these booking assignments first before taking the unit out of service.`
        );
      }
    }

    // Check serial number uniqueness if changing
    const newSerial = clean(body.serialNumber);
    if (newSerial && newSerial !== unit.serialNumber) {
      const serialExists = await MachineryUnit.findOne({
        _id: { $ne: unit._id },
        serialNumber: newSerial
      });
      if (serialExists) {
        return fail(res, 409, `Another machinery unit already has Serial Number "${newSerial}".`);
      }
    }

    // Update Basic Information
    if (body.name) unit.name = clean(body.name);
    if (body.category) unit.category = clean(body.category);
    if (body.brand) unit.brand = clean(body.brand);
    if (body.model) unit.model = clean(body.model);
    if (body.serialNumber !== undefined) unit.serialNumber = newSerial;
    if (body.modelYear !== undefined) unit.modelYear = clean(body.modelYear);
    if (body.imageUrl !== undefined) unit.imageUrl = clean(body.imageUrl);
    if (body.photos !== undefined) {
      unit.photos = Array.isArray(body.photos) ? body.photos : (body.imageUrl ? [body.imageUrl] : []);
    }

    // Update Specifications
    if (body.horsepower !== undefined) {
      const hp = Number(body.horsepower);
      if (hp < 0) return fail(res, 400, "Horsepower cannot be negative.");
      unit.horsepower = isNaN(hp) ? null : hp;
    }
    if (body.capacity !== undefined) unit.capacity = clean(body.capacity);
    if (body.fuelType !== undefined) unit.fuelType = clean(body.fuelType);
    if (body.attachments !== undefined) {
      unit.attachments = Array.isArray(body.attachments)
        ? body.attachments
        : typeof body.attachments === "string"
        ? body.attachments.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    }

    // Update Rental & Pricing
    if (body.pricingUnit) unit.pricingUnit = clean(body.pricingUnit);
    if (body.memberRate !== undefined || body.ratePerDay !== undefined) {
      const rate = Number(body.memberRate !== undefined ? body.memberRate : body.ratePerDay);
      if (isNaN(rate) || rate < 0) return fail(res, 400, "Member rental rate cannot be negative.");
      unit.memberRate = rate;
      unit.ratePerDay = rate;
      unit.ratePerHour = unit.pricingUnit === "Per Hour" ? rate : Math.round(rate / 6);
    }
    if (body.nonmemberRate !== undefined) {
      const nmRate = Number(body.nonmemberRate);
      if (isNaN(nmRate) || nmRate < 0) return fail(res, 400, "Non-member rate cannot be negative.");
      unit.nonmemberRate = nmRate;
    }
    if (body.minRentalQuantity !== undefined) {
      const minQty = Number(body.minRentalQuantity);
      if (isNaN(minQty) || minQty <= 0) return fail(res, 400, "Minimum rental quantity must be greater than zero.");
      unit.minRentalQuantity = minQty;
    }

    if (body.operatorRequired !== undefined) unit.operatorRequired = Boolean(body.operatorRequired);
    if (body.operatorIncluded !== undefined) unit.operatorIncluded = Boolean(body.operatorIncluded);
    if (body.fuelIncluded !== undefined) unit.fuelIncluded = Boolean(body.fuelIncluded);
    if (body.transportIncluded !== undefined) unit.transportIncluded = Boolean(body.transportIncluded);

    if (unit.operatorIncluded) {
      unit.additionalOperatorFee = 0;
    } else if (body.additionalOperatorFee !== undefined) {
      const fee = Number(body.additionalOperatorFee);
      if (fee < 0) return fail(res, 400, "Additional operator fee cannot be negative.");
      unit.additionalOperatorFee = fee;
    }
    if (body.operatorFeeBasis) unit.operatorFeeBasis = clean(body.operatorFeeBasis);

    if (unit.transportIncluded) {
      unit.additionalTransportFee = 0;
    } else if (body.additionalTransportFee !== undefined) {
      const fee = Number(body.additionalTransportFee);
      if (fee < 0) return fail(res, 400, "Additional transport fee cannot be negative.");
      unit.additionalTransportFee = fee;
    }
    if (body.transportFeeBasis) unit.transportFeeBasis = clean(body.transportFeeBasis);

    // Update Condition & Maintenance
    if (body.operatingCondition) {
      unit.operatingCondition = newCondition;
      unit.status = newCondition === "Operational" ? "Available" : newCondition === "Under Maintenance" ? "Maintenance" : "Dispose";
    }
    if (body.currentMeterReading !== undefined || body.operatingHours !== undefined) {
      const curReading = Number(body.currentMeterReading !== undefined ? body.currentMeterReading : body.operatingHours);
      if (curReading < 0) return fail(res, 400, "Meter reading cannot be negative.");
      unit.currentMeterReading = curReading;
      unit.operatingHours = curReading;
    }
    if (body.meterReadingUnit) unit.meterReadingUnit = clean(body.meterReadingUnit);
    if (body.lastServiceDate !== undefined) unit.lastServiceDate = clean(body.lastServiceDate);
    if (body.lastServiceMeterReading !== undefined) {
      unit.lastServiceMeterReading = body.lastServiceMeterReading ? Number(body.lastServiceMeterReading) : null;
    }
    if (body.nextServiceDate !== undefined) unit.nextServiceDate = clean(body.nextServiceDate);
    if (body.nextServiceMeterReading !== undefined) {
      unit.nextServiceMeterReading = body.nextServiceMeterReading ? Number(body.nextServiceMeterReading) : null;
    }
    if (body.conditionNotes !== undefined) unit.conditionNotes = clean(body.conditionNotes);

    // Update Ownership & Location
    if (body.acquisitionDate !== undefined) unit.acquisitionDate = clean(body.acquisitionDate);
    if (body.acquisitionCost !== undefined) {
      const cost = Number(body.acquisitionCost);
      if (cost < 0) return fail(res, 400, "Acquisition cost cannot be negative.");
      unit.acquisitionCost = cost;
    }
    if (body.acquisitionSource !== undefined) unit.acquisitionSource = clean(body.acquisitionSource);
    if (body.storageLocation !== undefined) unit.storageLocation = clean(body.storageLocation);

    // Update Other Information
    if (body.operatingRestrictions !== undefined) unit.operatingRestrictions = clean(body.operatingRestrictions);
    if (body.notes !== undefined) unit.notes = clean(body.notes);
    if (body.assignedDriver !== undefined) unit.assignedDriver = clean(body.assignedDriver) || "Unassigned";
    if (body.driverPhone !== undefined) unit.driverPhone = clean(body.driverPhone) || "";

    await unit.save();

    const managerEmail = req.user?.email || "manager";
    await logAudit({
      action: "MACHINERY_UNIT_UPDATED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: `Updated machinery unit ${unit.unitId} (${unit.name}). Condition: ${oldCondition} -> ${unit.operatingCondition}.`,
      req,
    });

    res.json({
      ok: true,
      data: normalizeUnit(unit),
      message: `Machinery unit ${unit.unitId} successfully updated.`,
    });
  } catch (err) {
    console.error("Error updating machinery unit:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to update machinery unit." });
  }
});

/**
 * PATCH /api/machinery-units/:id/status
 * Quick endpoint to update operating condition (Operational, Under Maintenance, Retired).
 */
router.patch("/machinery-units/:id/status", authManager, async (req, res) => {
  try {
    const id = req.params.id;
    let unit = null;

    if (mongoose.isValidObjectId(id)) {
      unit = await MachineryUnit.findById(id);
    }
    if (!unit) {
      unit = await MachineryUnit.findOne({ unitId: clean(id) });
    }
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    const newCondition = clean(req.body.operatingCondition);
    if (!["Operational", "Under Maintenance", "Retired"].includes(newCondition)) {
      return fail(res, 400, "Invalid operating condition. Allowed: Operational, Under Maintenance, Retired.");
    }

    const oldCondition = unit.operatingCondition || (unit.status === "Available" ? "Operational" : "Under Maintenance");

    // Guard: If transitioning away from Operational, check active bookings
    if ((newCondition === "Under Maintenance" || newCondition === "Retired") && oldCondition === "Operational") {
      const todayIso = new Date().toISOString().split("T")[0];
      const activeBookings = await Application.find({
        status: { $in: ["Approved", "Checked-Out"] },
        endDate: { $gte: todayIso },
        $or: [{ machineryUnitId: unit.unitId }, { equipment: unit.name }]
      }).select("displayId memberName startDate endDate status");

      if (activeBookings.length > 0) {
        return fail(
          res,
          400,
          `Cannot change operating condition to "${newCondition}". Unit ${unit.unitId} has ${activeBookings.length} active/ongoing booking(s): [${activeBookings
            .map((b) => `${b.displayId || "APP"} (${b.startDate} to ${b.endDate})`)
            .join("; ")}]. Please resolve or reassign these booking assignments first.`
        );
      }
    }

    unit.operatingCondition = newCondition;
    unit.status = newCondition === "Operational" ? "Available" : newCondition === "Under Maintenance" ? "Maintenance" : "Dispose";
    if (req.body.conditionNotes !== undefined) {
      unit.conditionNotes = clean(req.body.conditionNotes);
    }
    await unit.save();

    const managerEmail = req.user?.email || "manager";
    await logAudit({
      action: "MACHINERY_STATUS_UPDATED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: `Updated condition of unit ${unit.unitId} (${unit.name}) from "${oldCondition}" to "${newCondition}".`,
      req,
    });

    res.json({
      ok: true,
      data: normalizeUnit(unit),
      message: `Unit ${unit.unitId} condition updated to ${newCondition}.`,
    });
  } catch (err) {
    console.error("Error updating unit condition:", err);
    res.status(500).json({ ok: false, error: "Failed to update machinery condition." });
  }
});

/**
 * PATCH /api/machinery-units/:id/driver
 * Quick endpoint to update assigned driver and driver phone number.
 */
router.patch("/machinery-units/:id/driver", authManager, async (req, res) => {
  try {
    const id = req.params.id;
    let unit = null;

    if (mongoose.isValidObjectId(id)) {
      unit = await MachineryUnit.findById(id);
    }
    if (!unit) {
      unit = await MachineryUnit.findOne({ unitId: clean(id) });
    }
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    const body = req.body || {};
    const oldDriver = unit.assignedDriver || "Unassigned";
    const newDriver = clean(body.assignedDriver) || "Unassigned";
    const newPhone = clean(body.driverPhone) || "";

    unit.assignedDriver = newDriver;
    unit.driverPhone = newPhone;

    await unit.save();

    const managerEmail = req.user?.email || "manager";
    await logAudit({
      action: "MACHINERY_UNIT_DRIVER_UPDATED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: `Updated driver for ${unit.unitId} (${unit.name}): ${oldDriver} -> ${newDriver}.`,
      req,
    });

    res.json({
      ok: true,
      data: normalizeUnit(unit),
      message: `Assigned driver for ${unit.unitId} updated to "${newDriver}".`,
    });
  } catch (err) {
    console.error("Error updating unit driver:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to update assigned driver." });
  }
});

/**
 * PATCH /api/machinery-units/:id/retire
 * Dedicated retire endpoint that checks active bookings before retiring.
 */
router.patch("/machinery-units/:id/retire", authManager, async (req, res) => {
  try {
    const id = req.params.id;
    let unit = null;

    if (mongoose.isValidObjectId(id)) {
      unit = await MachineryUnit.findById(id);
    }
    if (!unit) {
      unit = await MachineryUnit.findOne({ unitId: clean(id) });
    }
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    // Check active bookings
    const todayIso = new Date().toISOString().split("T")[0];
    const activeBookings = await Application.find({
      status: { $in: ["Approved", "Checked-Out"] },
      endDate: { $gte: todayIso },
      $or: [{ machineryUnitId: unit.unitId }, { equipment: unit.name }]
    }).select("displayId memberName startDate endDate status");

    if (activeBookings.length > 0) {
      return fail(
        res,
        400,
        `Cannot retire unit ${unit.unitId}. It currently has ${activeBookings.length} active/ongoing booking(s): [${activeBookings
          .map((b) => `${b.displayId || "APP"} (${b.startDate} to ${b.endDate})`)
          .join(", ")}]. Please resolve these assignments before retiring the unit.`
      );
    }

    unit.operatingCondition = "Retired";
    unit.status = "Dispose";
    await unit.save();

    const managerEmail = req.user?.email || "manager";
    await logAudit({
      action: "MACHINERY_UNIT_RETIRED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: `Retired machinery unit ${unit.unitId} (${unit.name}) from active co-op fleet.`,
      req,
    });

    res.json({
      ok: true,
      data: normalizeUnit(unit),
      message: `Machinery unit ${unit.unitId} retired successfully.`,
    });
  } catch (err) {
    console.error("Error retiring machinery unit:", err);
    res.status(500).json({ ok: false, error: "Failed to retire machinery unit." });
  }
});

/**
 * DELETE /api/machinery-units/:id
 * Delete a machinery unit, guarding against historical booking deletion.
 */
router.delete("/machinery-units/:id", authManager, async (req, res) => {
  try {
    const id = req.params.id;
    let unit = null;

    if (mongoose.isValidObjectId(id)) {
      unit = await MachineryUnit.findById(id);
    }
    if (!unit) {
      unit = await MachineryUnit.findOne({ unitId: clean(id) });
    }
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    // Check if unit has ANY booking history in Application collection
    const bookingCount = await Application.countDocuments({
      $or: [{ machineryUnitId: unit.unitId }, { equipment: unit.name }]
    });

    if (bookingCount > 0) {
      return fail(
        res,
        400,
        `Unit "${unit.unitId}" (${unit.name}) has ${bookingCount} historical rental booking record(s). To preserve booking audit integrity, this unit cannot be deleted. Please use "Retire Unit" instead.`
      );
    }

    await MachineryUnit.findByIdAndDelete(unit._id);

    const managerEmail = req.user?.email || "manager";
    await logAudit({
      action: "MACHINERY_UNIT_DELETED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: `Permanently deleted machinery unit ${unit.unitId} (${unit.name}) with 0 historical bookings.`,
      req,
    });

    res.json({ ok: true, message: `Machinery unit ${unit.unitId} removed from fleet.` });
  } catch (err) {
    console.error("Error deleting unit:", err);
    res.status(500).json({ ok: false, error: "Failed to delete unit." });
  }
});

/**
 * GET /api/machinery-availability and /api/manager/machinery-availability
 * Returns list of booked and maintenance units for given date range.
 * Calculates availability for requested dates from approved/ongoing bookings and maintenance schedules.
 * Blocks units under maintenance or retired regardless of date range.
 */
const handleMachineryAvailability = async (req, res) => {
  try {
    const startDate = clean(req.query.startDate);
    const endDate = clean(req.query.endDate) || startDate;
    const todayIso = new Date().toISOString().split("T")[0];

    // Find units that are inherently unavailable due to condition (Under Maintenance or Retired)
    const conditionBlockedUnits = await MachineryUnit.find({
      isArchived: { $ne: true },
      $or: [
        { operatingCondition: { $in: ["Under Maintenance", "Retired"] } },
        { status: { $in: ["Maintenance", "Repair", "Dispose"] } }
      ]
    }).select("unitId name category operatingCondition status");

    const activeBookings = await Application.find({
      status: { $in: ["Approved", "Checked-Out"] },
      endDate: { $gte: todayIso },
    }).select("equipment machineryUnitId startDate endDate memberName status");

    const activeMaintenances = await MachineryMaintenance.find({
      status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
      endDate: { $gte: todayIso },
    }).select("equipmentName equipmentUnitId startDate endDate maintenanceType status");

    let bookedUnits = [];
    let maintenanceUnits = [];

    if (startDate && endDate) {
      bookedUnits = activeBookings
        .filter((b) => b.startDate <= endDate && b.endDate >= startDate)
        .map((b) => ({
          equipment: b.equipment,
          unitId: b.machineryUnitId,
          startDate: b.startDate,
          endDate: b.endDate,
          memberName: b.memberName,
          status: b.status,
        }));

      maintenanceUnits = activeMaintenances
        .filter((m) => m.startDate <= endDate && m.endDate >= startDate)
        .map((m) => ({
          equipment: m.equipmentName,
          unitId: m.equipmentUnitId,
          startDate: m.startDate,
          endDate: m.endDate,
          reason: m.maintenanceType,
          status: m.status,
        }));
    }

    res.json({
      bookedUnits,
      maintenanceUnits,
      unavailableConditionUnits: conditionBlockedUnits.map((u) => ({
        unitId: u.unitId,
        name: u.name,
        condition: u.operatingCondition || u.status,
      })),
      allActiveBookings: activeBookings.map((b) => ({
        equipment: b.equipment,
        unitId: b.machineryUnitId,
        startDate: b.startDate,
        endDate: b.endDate,
        memberName: b.memberName,
        status: b.status,
      })),
      allActiveMaintenance: activeMaintenances.map((m) => ({
        equipment: m.equipmentName,
        unitId: m.equipmentUnitId,
        startDate: m.startDate,
        endDate: m.endDate,
        reason: m.maintenanceType,
        status: m.status,
      })),
    });
  } catch (error) {
    console.error("Error in machinery availability:", error);
    res.status(500).json({ error: "Failed to check machinery availability." });
  }
};

router.get("/machinery-availability", handleMachineryAvailability);
router.get("/manager/machinery-availability", handleMachineryAvailability);

/**
 * GET /api/manager/machinery-maintenance
 * Returns all machinery maintenance schedules.
 */
router.get("/manager/machinery-maintenance", async (req, res) => {
  try {
    const records = await MachineryMaintenance.find({}).sort({ startDate: -1 });
    res.json(records);
  } catch (error) {
    console.error("Error fetching maintenance records:", error);
    res.status(500).json({ error: "Failed to fetch maintenance records." });
  }
});

/**
 * POST /api/manager/machinery-maintenance
 * Puts an equipment unit 'Out of Service' and blocks farmer bookings.
 */
router.post("/manager/machinery-maintenance", authManager, async (req, res) => {
  try {
    const equipmentUnitId = clean(req.body.equipmentUnitId);
    const equipmentName = clean(req.body.equipmentName);
    const startDate = clean(req.body.startDate);
    const endDate = clean(req.body.endDate);
    const reason = clean(req.body.reason);
    const maintenanceType = clean(req.body.maintenanceType) || "Routine Servicing";
    const managerEmail = req.user?.email || "manager";

    if (!equipmentUnitId || !equipmentName || !startDate || !endDate || !reason) {
      return fail(res, 400, "All fields (unit ID, machinery name, start date, end date, reason) are required.");
    }

    if (endDate < startDate) return fail(res, 400, "End date must be on or after start date.");

    // Check if any existing approved/pending applications collide
    const collidingBookings = await Application.find({
      equipment: equipmentName,
      status: { $in: ["Approved", "Pending", "Checked-Out"] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    const record = await MachineryMaintenance.create({
      equipmentUnitId,
      equipmentName,
      startDate,
      endDate,
      status: "Out of Service",
      maintenanceType,
      reason,
      assignedMechanic: clean(req.body.assignedMechanic) || "In-house Co-op Technician",
      loggedByManager: managerEmail,
    });

    // Also update the unit's operatingCondition to "Under Maintenance"
    await MachineryUnit.updateOne(
      { unitId: equipmentUnitId },
      { $set: { operatingCondition: "Under Maintenance", status: "Maintenance" } }
    );

    syncMaintenanceToGoogleCalendar(record, req.user).catch((err) => {
      console.warn("[GoogleCalendar] Background maintenance sync note:", err.message);
    });

    await logAudit({
      action: "EQUIPMENT_OUT_OF_SERVICE",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: {
        equipmentUnitId,
        equipmentName,
        maintenanceType,
        dateRange: `${startDate} to ${endDate}`,
        reason,
        collidingBookingsCount: collidingBookings.length,
      },
      req,
    });

    res.status(201).json({
      ok: true,
      record,
      collidingBookingsCount: collidingBookings.length,
      message: `Unit ${equipmentUnitId} (${equipmentName}) set to Out of Service.`,
    });
  } catch (error) {
    console.error("Error creating maintenance record:", error);
    res.status(500).json({ error: "Failed to schedule maintenance." });
  }
});

/**
 * DELETE /api/manager/machinery-maintenance/:id
 * Removes or restores maintenance record back to operational status.
 */
router.delete("/manager/machinery-maintenance/:id", authManager, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid maintenance record id.");
    const record = await MachineryMaintenance.findByIdAndDelete(req.params.id);
    if (!record) return fail(res, 404, "Maintenance record not found.");

    // Check if there are other active maintenance schedules for this unit
    const remainingMaint = await MachineryMaintenance.countDocuments({
      equipmentUnitId: record.equipmentUnitId,
      status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] }
    });

    if (remainingMaint === 0) {
      await MachineryUnit.updateOne(
        { unitId: record.equipmentUnitId },
        { $set: { operatingCondition: "Operational", status: "Available" } }
      );
    }

    await logAudit({
      action: "EQUIPMENT_RETURNED_TO_SERVICE",
      actorEmail: req.user?.email || "manager",
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: `Equipment unit ${record.equipmentUnitId} (${record.equipmentName}) completed ${record.maintenanceType} and is back in service.`,
      req,
    });

    res.json({ ok: true, message: "Maintenance completed. Equipment back in operational service." });
  } catch (error) {
    console.error("Error deleting maintenance record:", error);
    res.status(500).json({ error: "Failed to remove maintenance record." });
  }
});

/**
 * GET /api/manager/utilization
 * Returns equipment utilization rates across categories.
 */
router.get("/manager/utilization", async (req, res) => {
  return getMachineryUtilization(req, res);
});

module.exports = router;
