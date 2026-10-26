const mongoose = require("mongoose");
const Application = require("../models/Application");
const MachineryMaintenance = require("../models/MachineryMaintenance");
const MachineryUnit = require("../models/MachineryUnit");
const MachineryUsage = require("../models/MachineryUsage");
const { logAudit } = require("../services/auditLogger");

const MAINTENANCE_TYPES = [
  "Routine Servicing",
  "Emergency Breakdown",
  "Hydraulic Repair",
  "Tire Replacement",
  "General Overhaul"
];

function clean(value) {
  return String(value ?? "").trim();
}

function parseNonNegativeNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return { error: `${field} must be a non-negative number.` };
  }
  return { value: number };
}

async function findMachinery(identifier) {
  if (mongoose.isValidObjectId(identifier)) {
    const byId = await MachineryUnit.findById(identifier);
    if (byId) return byId;
  }
  return MachineryUnit.findOne({ unitId: clean(identifier) });
}

async function createMachinery(req, res) {
  const body = req.body || {};
  const unitId = clean(body.unitId);
  const name = clean(body.name);
  if (!unitId || !name) return res.status(400).json({ error: "unitId and name are required." });

  const unit = new MachineryUnit({
    unitId,
    name,
    category: clean(body.category) || "Tractor",
    imageUrl: clean(body.imageUrl),
    assignedDriver: clean(body.assignedDriver) || "Unassigned",
    driverPhone: clean(body.driverPhone),
    ratePerDay: body.ratePerDay === undefined ? 2500 : Number(body.ratePerDay),
    ratePerHour: body.ratePerHour === undefined ? 400 : Number(body.ratePerHour),
    depositRequired: body.depositRequired === undefined ? 0 : Number(body.depositRequired),
    lateFeePerDay: body.lateFeePerDay === undefined ? 0 : Number(body.lateFeePerDay),
    status: clean(body.status) || "Available",
    conditionNotes: clean(body.conditionNotes),
    serialNumber: clean(body.serialNumber),
    modelYear: clean(body.modelYear) || String(new Date().getUTCFullYear()),
    fuelType: clean(body.fuelType) || "Diesel",
    operatingHours: body.operatingHours === undefined ? 0 : Number(body.operatingHours)
  });

  try {
    await unit.save();
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: `Machinery unit "${unitId}" already exists.` });
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  await logAudit({
    action: "MACHINERY_UNIT_CREATED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: { unitId, name, category: unit.category },
    req
  });
  return res.status(201).json({ data: unit });
}

async function updateMachineryPricing(req, res) {
  const unit = await findMachinery(req.params.id);
  if (!unit || unit.isArchived) return res.status(404).json({ error: "Active machinery unit not found." });

  const fields = ["ratePerDay", "ratePerHour", "depositRequired", "lateFeePerDay"];
  const providedFields = fields.filter((field) => req.body?.[field] !== undefined);
  if (!providedFields.length) {
    return res.status(400).json({ error: `Provide at least one of: ${fields.join(", ")}.` });
  }

  const previous = {};
  for (const field of providedFields) {
    const parsed = parseNonNegativeNumber(req.body[field], field);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    previous[field] = unit[field];
    unit[field] = parsed.value;
  }
  await unit.save();

  await logAudit({
    action: "MACHINERY_PRICING_UPDATED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: {
      unitId: unit.unitId,
      previous,
      updated: Object.fromEntries(providedFields.map((field) => [field, unit[field]]))
    },
    req
  });
  return res.json({ data: unit });
}

async function archiveMachinery(req, res) {
  const unit = await findMachinery(req.params.id);
  if (!unit || unit.isArchived) return res.status(404).json({ error: "Active machinery unit not found." });

  const today = new Date().toISOString().slice(0, 10);
  const activeBooking = await Application.findOne({
    status: { $in: ["Approved", "Checked-Out"] },
    $and: [
      {
        $or: [
          { machineryUnitId: unit.unitId },
          { equipment: unit.name, machineryUnitId: { $in: ["", null] } }
        ]
      },
      {
        $or: [
          { status: "Checked-Out" },
          { status: "Approved", endDate: { $gte: today } }
        ]
      }
    ]
  }).select("_id status startDate endDate");
  if (activeBooking) {
    return res.status(409).json({
      error: "Machinery with an approved or active rental cannot be archived.",
      activeBooking
    });
  }

  unit.isArchived = true;
  unit.archivedAt = new Date();
  unit.status = "Dispose";
  await unit.save();
  await logAudit({
    action: "MACHINERY_UNIT_ARCHIVED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: { unitId: unit.unitId, name: unit.name, reason: clean(req.body?.reason) },
    req
  });
  return res.json({ data: unit, message: "Machinery unit archived." });
}

async function listMaintenanceLogs(req, res) {
  const unit = await findMachinery(req.params.id);
  if (!unit) return res.status(404).json({ error: "Machinery unit not found." });
  const records = await MachineryMaintenance.find({ equipmentUnitId: unit.unitId })
    .sort({ createdAt: -1 })
    .limit(200);
  const totalCost = records.reduce((total, record) => total + (record.maintenanceCost || 0), 0);
  const costGroups = new Map();
  for (const record of records) {
    const key = `${record.logType}: ${record.maintenanceType}`;
    costGroups.set(key, (costGroups.get(key) || 0) + (record.maintenanceCost || 0));
  }
  const costBreakdown = [...costGroups.entries()].map(([type, amount]) => ({ type, amount }));
  return res.json({ unitId: unit.unitId, count: records.length, totalCost, costBreakdown, data: records });
}

async function createMaintenanceLog(req, res) {
  const unit = await findMachinery(req.params.id);
  if (!unit || unit.isArchived) return res.status(404).json({ error: "Active machinery unit not found." });

  const reason = clean(req.body?.reason);
  const maintenanceType = clean(req.body?.maintenanceType) || "Routine Servicing";
  const logType = clean(req.body?.logType) || "Maintenance";
  if (!reason) return res.status(400).json({ error: "reason is required." });
  if (!MAINTENANCE_TYPES.includes(maintenanceType)) {
    return res.status(400).json({ error: "Invalid maintenanceType." });
  }
  if (!["Repair", "Maintenance"].includes(logType)) {
    return res.status(400).json({ error: "logType must be Repair or Maintenance." });
  }
  const cost = parseNonNegativeNumber(req.body?.maintenanceCost ?? 0, "maintenanceCost");
  if (cost.error) return res.status(400).json({ error: cost.error });
  let runtimeHours = null;
  if (req.body?.runtimeHours !== undefined && req.body.runtimeHours !== null && req.body.runtimeHours !== "") {
    const parsedHours = parseNonNegativeNumber(req.body.runtimeHours, "runtimeHours");
    if (parsedHours.error) return res.status(400).json({ error: parsedHours.error });
    runtimeHours = parsedHours.value;
  }

  const today = new Date().toISOString().slice(0, 10);
  const record = await MachineryMaintenance.create({
    equipmentUnitId: unit.unitId,
    equipmentName: unit.name,
    startDate: today,
    endDate: today,
    status: "Completed",
    maintenanceType,
    reason,
    maintenanceCost: cost.value,
    runtimeHours,
    logType,
    loggedByManager: req.user.email,
    assignedMechanic: clean(req.body?.assignedMechanic) || "In-house Co-op Technician"
  });

  await logAudit({
    action: "MACHINERY_MAINTENANCE_LOGGED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: {
      maintenanceId: String(record._id),
      unitId: unit.unitId,
      logType,
      maintenanceType,
      maintenanceCost: cost.value,
      runtimeHours
    },
    req
  });
  return res.status(201).json({ data: record });
}

async function listUsageLogs(req, res) {
  const unit = await findMachinery(req.params.id);
  if (!unit) return res.status(404).json({ error: "Machinery unit not found." });
  const filter = { unitId: unit.unitId };
  if (req.query.startDate || req.query.endDate) {
    const startDate = clean(req.query.startDate);
    const endDate = clean(req.query.endDate);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (
      !datePattern.test(startDate) || !datePattern.test(endDate) ||
      Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
      start.toISOString().slice(0, 10) !== startDate ||
      end.toISOString().slice(0, 10) !== endDate ||
      endDate < startDate
    ) {
      return res.status(400).json({ error: "Provide a valid startDate and endDate range in YYYY-MM-DD format." });
    }
    const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    filter.startAt = { $lt: endExclusive };
    filter.endAt = { $gte: new Date(`${startDate}T00:00:00.000Z`) };
  }
  const logs = await MachineryUsage.find(filter).sort({ startAt: -1 }).limit(500).lean();
  return res.json({
    unitId: unit.unitId,
    count: logs.length,
    totalRuntimeHours: logs.reduce((sum, log) => sum + log.runtimeHours, 0),
    totalIdleHours: logs.reduce((sum, log) => sum + log.idleHours, 0),
    data: logs
  });
}

async function createUsageLog(req, res) {
  const unit = await findMachinery(req.params.id);
  if (!unit || unit.isArchived) return res.status(404).json({ error: "Active machinery unit not found." });
  const operator = clean(req.body?.operator);
  const startAt = new Date(req.body?.startAt);
  const endAt = new Date(req.body?.endAt);
  if (!operator || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt || endAt > new Date()) {
    return res.status(400).json({ error: "operator, a valid startAt, and an endAt later than startAt are required." });
  }
  const runtime = parseNonNegativeNumber(req.body?.runtimeHours, "runtimeHours");
  const idle = parseNonNegativeNumber(req.body?.idleHours ?? 0, "idleHours");
  if (runtime.error) return res.status(400).json({ error: runtime.error });
  if (idle.error) return res.status(400).json({ error: idle.error });

  const elapsedHours = (endAt - startAt) / 3600000;
  if (runtime.value + idle.value > elapsedHours + 0.01) {
    return res.status(400).json({ error: "runtimeHours plus idleHours cannot exceed the elapsed time." });
  }
  let applicationId = null;
  if (req.body?.applicationId) {
    if (!mongoose.isValidObjectId(req.body.applicationId)) {
      return res.status(400).json({ error: "Invalid applicationId." });
    }
    const application = await Application.findById(req.body.applicationId);
    if (!application) return res.status(404).json({ error: "Related booking was not found." });
    if (
      application.machineryUnitId
        ? application.machineryUnitId !== unit.unitId
        : application.equipment !== unit.name
    ) {
      return res.status(400).json({ error: "Related booking does not match this machinery unit." });
    }
    applicationId = application._id;
  }

  const usage = await MachineryUsage.create({
    unitId: unit.unitId,
    equipmentName: unit.name,
    applicationId,
    operator,
    startAt,
    endAt,
    runtimeHours: runtime.value,
    idleHours: idle.value,
    notes: clean(req.body?.notes),
    loggedBy: req.user.email
  });
  unit.operatingHours += runtime.value;
  await unit.save();
  await logAudit({
    action: "MACHINERY_USAGE_LOGGED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: {
      usageId: String(usage._id),
      unitId: unit.unitId,
      operator,
      runtimeHours: runtime.value,
      idleHours: idle.value,
      applicationId: applicationId ? String(applicationId) : null
    },
    req
  });
  return res.status(201).json({ data: usage, cumulativeOperatingHours: unit.operatingHours });
}

module.exports = {
  createMachinery,
  updateMachineryPricing,
  archiveMachinery,
  listMaintenanceLogs,
  createMaintenanceLog,
  listUsageLogs,
  createUsageLog
};
