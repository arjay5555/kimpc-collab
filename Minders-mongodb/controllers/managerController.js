const mongoose = require("mongoose");
const Application = require("../models/Application");
const MachineryMaintenance = require("../models/MachineryMaintenance");
const MachineryUnit = require("../models/MachineryUnit");
const { logAudit } = require("../services/auditLogger");
const { syncBookingToGoogleCalendar } = require("../services/googleCalendarService");

const ACTIVE_BOOKING_STATUSES = ["Pending", "Approved", "Checked-Out"];
const RESERVED_BOOKING_STATUSES = ["Approved", "Checked-Out"];
const ACTIVE_MAINTENANCE_STATUSES = ["Out of Service", "In Repair", "Scheduled Maintenance"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function clean(value) {
  return String(value ?? "").trim();
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateDateRange(startDate, endDate, { required = false } = {}) {
  if (!startDate && !endDate && !required) return null;
  if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    return "Both startDate and endDate must be valid dates in YYYY-MM-DD format.";
  }
  if (endDate < startDate) return "endDate must be on or after startDate.";
  return null;
}

function toExclusiveEndDate(inclusiveEndDate) {
  const date = new Date(`${inclusiveEndDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function overlapQuery(startDate, endDate) {
  return { startDate: { $lte: endDate }, endDate: { $gte: startDate } };
}

async function getCalendarEvents(req, res) {
  const startDate = clean(req.query.startDate);
  const endDate = clean(req.query.endDate);
  const dateError = validateDateRange(startDate, endDate, { required: true });
  if (dateError) return res.status(400).json({ error: dateError });

  const [bookings, maintenanceRecords] = await Promise.all([
    Application.find({
      status: { $in: ACTIVE_BOOKING_STATUSES },
      ...overlapQuery(startDate, endDate)
    }).sort({ startDate: 1, equipment: 1 }).lean(),
    MachineryMaintenance.find({
      status: { $in: ACTIVE_MAINTENANCE_STATUSES },
      ...overlapQuery(startDate, endDate)
    }).sort({ startDate: 1, equipmentUnitId: 1 }).lean()
  ]);

  const bookingEvents = bookings.map((booking) => ({
    id: `booking-${booking._id}`,
    title: `${booking.equipment} — ${booking.status}`,
    start: booking.startDate,
    end: toExclusiveEndDate(booking.endDate),
    allDay: true,
    resourceId: booking.machineryUnitId || booking.equipment,
    color: booking.status === "Pending" ? "#d97706" : "#0d766e",
    extendedProps: {
      eventType: "booking",
      bookingId: String(booking._id),
      status: booking.status,
      memberName: booking.memberName,
      memberEmail: booking.memberEmail,
      equipment: booking.equipment,
      unitId: booking.machineryUnitId || "",
      requestedStartDate: booking.startDate,
      requestedEndDate: booking.endDate
    }
  }));

  const maintenanceEvents = maintenanceRecords.map((record) => ({
    id: `maintenance-${record._id}`,
    title: `${record.equipmentName} — ${record.status}`,
    start: record.startDate,
    end: toExclusiveEndDate(record.endDate),
    allDay: true,
    resourceId: record.equipmentUnitId,
    color: "#dc2626",
    extendedProps: {
      eventType: "maintenance",
      maintenanceId: String(record._id),
      status: record.status,
      unitId: record.equipmentUnitId,
      equipment: record.equipmentName,
      maintenanceType: record.maintenanceType,
      reason: record.reason
    }
  }));

  const events = [...bookingEvents, ...maintenanceEvents]
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  const resourcesById = new Map();
  for (const event of events) {
    if (!resourcesById.has(event.resourceId)) {
      resourcesById.set(event.resourceId, {
        id: event.resourceId,
        title: event.extendedProps.unitId
          ? `${event.extendedProps.equipment} (${event.extendedProps.unitId})`
          : event.extendedProps.equipment
      });
    }
  }

  return res.json({
    startDate,
    endDate,
    resources: [...resourcesById.values()],
    events
  });
}

async function listBookings(req, res) {
  const status = clean(req.query.status) || "Pending";
  if (status !== "All" && !ACTIVE_BOOKING_STATUSES.concat(["Returned", "Rejected", "Cancelled"]).includes(status)) {
    return res.status(400).json({ error: "Invalid booking status filter." });
  }

  const startDate = clean(req.query.startDate);
  const endDate = clean(req.query.endDate);
  const dateError = validateDateRange(startDate, endDate);
  if (dateError) return res.status(400).json({ error: dateError });

  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 50);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    return res.status(400).json({ error: "page must be positive and limit must be between 1 and 200." });
  }

  const filter = {};
  if (status !== "All") filter.status = status;
  if (startDate && endDate) Object.assign(filter, overlapQuery(startDate, endDate));

  const [bookings, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Application.countDocuments(filter)
  ]);

  return res.json({ data: bookings, page, limit, total });
}

async function approveBooking(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid booking id." });
  }

  const booking = await Application.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking request not found." });
  if (booking.status !== "Pending") {
    return res.status(409).json({ error: `Only pending requests can be approved (current status: ${booking.status}).` });
  }

  const bookingRange = overlapQuery(booking.startDate, booking.endDate);
  const conflictEquipmentFilter = booking.machineryUnitId
    ? {
        $or: [
          { machineryUnitId: booking.machineryUnitId },
          { equipment: booking.equipment, machineryUnitId: { $in: ["", null] } }
        ]
      }
    : { equipment: booking.equipment };
  const [bookingConflict, maintenanceConflict] = await Promise.all([
    Application.findOne({
      _id: { $ne: booking._id },
      ...conflictEquipmentFilter,
      status: { $in: RESERVED_BOOKING_STATUSES },
      ...bookingRange
    }).select("_id startDate endDate status"),
    MachineryMaintenance.findOne({
      ...(booking.machineryUnitId
        ? { equipmentUnitId: booking.machineryUnitId }
        : { equipmentName: { $regex: new RegExp(booking.equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } }),
      status: { $in: ACTIVE_MAINTENANCE_STATUSES },
      ...bookingRange
    }).select("_id startDate endDate status")
  ]);

  if (bookingConflict) {
    return res.status(409).json({
      error: "This booking overlaps an already approved or checked-out booking for the same equipment.",
      conflict: bookingConflict
    });
  }
  if (maintenanceConflict) {
    return res.status(409).json({
      error: "This booking overlaps an active maintenance schedule.",
      conflict: maintenanceConflict
    });
  }

  const managerRemarks = clean(req.body?.remarks);
  const approved = await Application.findOneAndUpdate(
    { _id: booking._id, status: "Pending" },
    { $set: { status: "Approved", managerRemarks } },
    { new: true, runValidators: true }
  );
  if (!approved) {
    return res.status(409).json({ error: "This booking request was updated by another manager. Refresh and try again." });
  }

  // Two-way sync: Push approved booking event to Manager Google Calendar
  syncBookingToGoogleCalendar(approved, req.user).catch((err) => {
    console.warn("[GoogleCalendar] Booking approval sync error:", err.message);
  });

  await logAudit({
    action: "BOOKING_APPROVED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    targetEmail: approved.memberEmail,
    targetName: approved.memberName,
    targetRole: "member",
    details: {
      applicationId: String(approved._id),
      equipment: approved.equipment,
      dateRange: `${approved.startDate} - ${approved.endDate}`,
      remarks: managerRemarks
    },
    req
  });

  return res.json({ data: approved });
}

async function rejectBooking(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid booking id." });
  }

  const managerRemarks = clean(req.body?.remarks);
  const rejected = await Application.findOneAndUpdate(
    { _id: req.params.id, status: "Pending" },
    { $set: { status: "Rejected", managerRemarks } },
    { new: true, runValidators: true }
  );

  if (!rejected) {
    const existing = await Application.findById(req.params.id).select("_id status");
    if (!existing) return res.status(404).json({ error: "Booking request not found." });
    return res.status(409).json({ error: `Only pending requests can be rejected (current status: ${existing.status}).` });
  }

  await logAudit({
    action: "BOOKING_REJECTED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    targetEmail: rejected.memberEmail,
    targetName: rejected.memberName,
    targetRole: "member",
    details: {
      applicationId: String(rejected._id),
      equipment: rejected.equipment,
      dateRange: `${rejected.startDate} - ${rejected.endDate}`,
      remarks: managerRemarks
    },
    req
  });

  return res.json({ data: rejected });
}

async function resolveBookingConflict(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid booking id." });
  }
  const booking = await Application.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking request not found." });
  if (!["Pending", "Approved"].includes(booking.status)) {
    return res.status(409).json({ error: "Only pending or approved bookings can be rescheduled or reassigned." });
  }

  const startDate = clean(req.body.startDate || booking.startDate);
  const endDate = clean(req.body.endDate || booking.endDate);
  const dateError = validateDateRange(startDate, endDate, { required: true });
  if (dateError) return res.status(400).json({ error: dateError });

  let unit = null;
  const requestedUnitId = clean(req.body.unitId || req.body.machineryUnitId);
  if (requestedUnitId) {
    unit = await MachineryUnit.findOne({ unitId: requestedUnitId, isArchived: { $ne: true } });
    if (!unit && mongoose.isValidObjectId(requestedUnitId)) {
      unit = await MachineryUnit.findOne({ _id: requestedUnitId, isArchived: { $ne: true } });
    }
    if (!unit) return res.status(404).json({ error: "Active machinery unit not found." });
    if (unit.status === "Dispose") return res.status(409).json({ error: "Disposed machinery cannot be assigned to a booking." });
    if (unit.status !== "Available") return res.status(409).json({ error: `Machinery unit is not available (current status: ${unit.status}).` });
  }

  const equipment = unit ? unit.name : clean(req.body.equipment || booking.equipment);
  if (!equipment) return res.status(400).json({ error: "Equipment is required." });
  const requestedEquipment = clean(req.body.equipment);
  const machineryUnitId = unit
    ? unit.unitId
    : requestedEquipment && requestedEquipment !== booking.equipment
      ? ""
      : booking.machineryUnitId;
  const range = overlapQuery(startDate, endDate);
  const assignmentFilter = machineryUnitId
    ? {
        $or: [
          { machineryUnitId },
          { equipment, machineryUnitId: { $in: ["", null] } }
        ]
      }
    : { equipment };

  const [bookingConflict, maintenanceConflict] = await Promise.all([
    Application.findOne({
      _id: { $ne: booking._id },
      status: { $in: RESERVED_BOOKING_STATUSES },
      ...assignmentFilter,
      ...range
    }).select("_id equipment machineryUnitId startDate endDate status"),
    MachineryMaintenance.findOne({
      status: { $in: ACTIVE_MAINTENANCE_STATUSES },
      ...(machineryUnitId
        ? { equipmentUnitId: machineryUnitId }
        : { equipmentName: { $regex: new RegExp(equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } }),
      ...range
    }).select("_id equipmentUnitId equipmentName startDate endDate status")
  ]);

  if (bookingConflict) {
    return res.status(409).json({ error: "The proposed schedule conflicts with another reserved booking.", conflict: bookingConflict });
  }
  if (maintenanceConflict) {
    return res.status(409).json({ error: "The proposed schedule conflicts with active maintenance.", conflict: maintenanceConflict });
  }

  const previous = {
    equipment: booking.equipment,
    machineryUnitId: booking.machineryUnitId,
    startDate: booking.startDate,
    endDate: booking.endDate
  };
  booking.equipment = equipment;
  booking.machineryUnitId = machineryUnitId;
  booking.startDate = startDate;
  booking.endDate = endDate;
  booking.managerRemarks = clean(req.body.remarks) || booking.managerRemarks;
  await booking.save();

  await logAudit({
    action: "BOOKING_SCHEDULE_RESOLVED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    targetEmail: booking.memberEmail,
    targetName: booking.memberName,
    targetRole: "member",
    details: {
      applicationId: String(booking._id),
      previous,
      updated: { equipment, machineryUnitId, startDate, endDate },
      remarks: clean(req.body.remarks)
    },
    req
  });
  return res.json({ data: booking });
}

async function extendBooking(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid booking id." });
  }
  const newEndDate = clean(req.body.endDate);
  if (!isValidDate(newEndDate)) {
    return res.status(400).json({ error: "endDate must be a valid date in YYYY-MM-DD format." });
  }

  const booking = await Application.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking request not found." });
  if (booking.status !== "Checked-Out") {
    return res.status(409).json({ error: "Only an active checked-out rental can be extended." });
  }
  if (newEndDate <= booking.endDate) {
    return res.status(400).json({ error: "The new endDate must be later than the current endDate." });
  }

  const assignmentFilter = booking.machineryUnitId
    ? {
        $or: [
          { machineryUnitId: booking.machineryUnitId },
          { equipment: booking.equipment, machineryUnitId: { $in: ["", null] } }
        ]
      }
    : { equipment: booking.equipment };
  const [bookingConflict, maintenanceConflict] = await Promise.all([
    Application.findOne({
      _id: { $ne: booking._id },
      status: { $in: RESERVED_BOOKING_STATUSES },
      ...assignmentFilter,
      startDate: { $lte: newEndDate },
      endDate: { $gt: booking.endDate }
    }).select("_id startDate endDate status"),
    MachineryMaintenance.findOne({
      status: { $in: ACTIVE_MAINTENANCE_STATUSES },
      ...(booking.machineryUnitId
        ? { equipmentUnitId: booking.machineryUnitId }
        : { equipmentName: { $regex: new RegExp(booking.equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } }),
      startDate: { $lte: newEndDate },
      endDate: { $gt: booking.endDate }
    }).select("_id startDate endDate status")
  ]);
  if (bookingConflict) {
    return res.status(409).json({ error: "The requested extension overlaps another reserved booking.", conflict: bookingConflict });
  }
  if (maintenanceConflict) {
    return res.status(409).json({ error: "The requested extension overlaps active maintenance.", conflict: maintenanceConflict });
  }

  const previousEndDate = booking.endDate;
  booking.endDate = newEndDate;
  booking.managerRemarks = clean(req.body.remarks) || booking.managerRemarks;
  await booking.save();
  await logAudit({
    action: "BOOKING_EXTENDED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    targetEmail: booking.memberEmail,
    targetName: booking.memberName,
    targetRole: "member",
    details: {
      applicationId: String(booking._id),
      equipment: booking.equipment,
      previousEndDate,
      newEndDate,
      remarks: clean(req.body.remarks)
    },
    req
  });
  return res.json({ data: booking });
}

module.exports = {
  getCalendarEvents,
  listBookings,
  approveBooking,
  rejectBooking,
  resolveBookingConflict,
  extendBooking
};
