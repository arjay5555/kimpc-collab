const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Account = require("../models/Account");
const Application = require("../models/Application");
const MachineryMaintenance = require("../models/MachineryMaintenance");

const authManager = require("../middleware/authManager");
const { logAudit } = require("../services/auditLogger");
const {
  syncBookingToGoogleCalendar,
  deleteBookingFromGoogleCalendar,
} = require("../services/googleCalendarService");

const {
  STATUSES,
  clean,
  cleanEmail,
  fail,
  isSameMachineryMatch,
} = require("./routeHelpers");

// ---------- Equipment applications ----------

// ?memberEmail=... returns one member's requests; without it, everything (manager/admin queue).
router.get("/applications", async (req, res) => {
  try {
    const filter = req.query.memberEmail ? { memberEmail: cleanEmail(req.query.memberEmail) } : {};
    res.json(await Application.find(filter).sort({ createdAt: -1 }));
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: "Failed to fetch applications." });
  }
});

router.post("/applications", async (req, res) => {
  try {
    const memberEmail = cleanEmail(req.body.memberEmail);
    const equipment = clean(req.body.equipment);
    const machineryUnitId = clean(req.body.machineryUnitId);
    const startDate = clean(req.body.startDate);
    const endDate = clean(req.body.endDate);
    if (!equipment || !startDate || !endDate) return fail(res, 400, "Equipment and both dates are required.");
    if (endDate < startDate) return fail(res, 400, "End date must be on or after the start date.");

    // Block new assignments to units under maintenance or retired
    if (machineryUnitId || equipment) {
      const targetUnit = await MachineryUnit.findOne(
        machineryUnitId ? { unitId: machineryUnitId } : { name: equipment }
      );
      if (targetUnit) {
        const cond = targetUnit.operatingCondition || targetUnit.status;
        if (["Under Maintenance", "Maintenance", "Repair", "Retired", "Dispose"].includes(cond)) {
          return fail(
            res,
            400,
            `Cannot book machinery unit "${targetUnit.unitId || equipment}": Unit is currently ${cond}.`
          );
        }
      }
    }

    // Automatic Maintenance Overlap Protection:
    const overlappingMaints = await MachineryMaintenance.find({
      status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });
    const maintenanceConflict = overlappingMaints.find((m) =>
      isSameMachineryMatch(m.equipmentUnitId, m.equipmentName, machineryUnitId, equipment)
    );

    if (maintenanceConflict) {
      return fail(
        res,
        409,
        `Equipment "${equipment}" is currently Out of Service for ${maintenanceConflict.maintenanceType} (${maintenanceConflict.startDate} to ${maintenanceConflict.endDate}). Bookings are temporarily blocked for these dates.`
      );
    }

    // Automatic Unique Unit Conflict Protection (Quantity: 1):
    const overlappingBookings = await Application.find({
      status: { $in: ["Approved", "Checked-Out"] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });
    const bookingConflict = overlappingBookings.find((b) =>
      isSameMachineryMatch(b.machineryUnitId, b.equipment, machineryUnitId, equipment)
    );

    if (bookingConflict) {
      return fail(
        res,
        409,
        `Equipment "${equipment}" (Quantity: 1) is already booked by ${bookingConflict.memberName} from ${bookingConflict.startDate} to ${bookingConflict.endDate}. Each unit is unique. Please select other dates.`
      );
    }

    const account = await Account.findOne({ email: memberEmail });
    if (!account) return fail(res, 404, "Account not found.");
    const application = await Application.create({
      memberEmail,
      memberName: account.fullName,
      equipment,
      startDate,
      endDate,
    });

    await logAudit({
      action: "BOOKING_CREATED",
      actorEmail: memberEmail,
      actorRole: "member",
      targetEmail: memberEmail,
      targetName: account.fullName,
      targetRole: "member",
      details: {
        applicationId: application.id,
        equipment,
        startDate,
        endDate,
        dateRange: `${startDate} – ${endDate}`,
        submittedAt: new Date().toISOString(),
      },
      req,
    });

    res.status(201).json(application);
  } catch (error) {
    console.error("Error creating application:", error);
    res.status(500).json({ error: "Failed to create application." });
  }
});

const handleApplicationUpdate = async (req, res) => {
  try {
    let existing = null;
    const rawId = (req.params.id || "").trim();
    if (mongoose.isValidObjectId(rawId)) {
      existing = await Application.findById(rawId);
    }
    if (!existing) {
      existing = await Application.findOne({
        $or: [
          { displayId: rawId },
          { displayId: rawId.toUpperCase() },
        ],
      });
    }
    if (!existing) {
      const suffix = rawId.replace(/^APP-/i, "").toLowerCase();
      const apps = await Application.find().sort({ createdAt: -1 }).limit(200);
      existing = apps.find((a) => String(a._id).slice(-6).toLowerCase() === suffix || String(a._id) === rawId);
    }
    if (!existing) return fail(res, 404, "Application not found.");

    const actorEmail = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || existing.memberEmail);
    const actorRole = clean(req.body.actorRole || req.headers["x-actor-role"] || "member");

    // Check if member is editing booking details (equipment, startDate, endDate)
    const isEditingDetails = Boolean(req.body.equipment || req.body.startDate || req.body.endDate);
    if (isEditingDetails) {
      if (existing.status !== "Pending") {
        return fail(res, 400, `Only pending booking requests can be edited prior to manager approval (current status: ${existing.status}).`);
      }

      const newEquipment = clean(req.body.equipment || existing.equipment);
      const newStartDate = clean(req.body.startDate || existing.startDate);
      const newEndDate = clean(req.body.endDate || existing.endDate);

      if (!newEquipment || !newStartDate || !newEndDate) {
        return fail(res, 400, "Equipment and both dates are required.");
      }
      if (newEndDate < newStartDate) {
        return fail(res, 400, "End date must be on or after the start date.");
      }

      // Automatic Maintenance Overlap Protection
      const maintenanceConflict = await MachineryMaintenance.findOne({
        equipmentName: { $regex: new RegExp(newEquipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
        startDate: { $lte: newEndDate },
        endDate: { $gte: newStartDate },
      });

      if (maintenanceConflict) {
        return fail(
          res,
          409,
          `Equipment "${newEquipment}" is currently Out of Service for ${maintenanceConflict.maintenanceType} (${maintenanceConflict.startDate} to ${maintenanceConflict.endDate}). Bookings are temporarily blocked for these dates.`
        );
      }

      const previousEquipment = existing.equipment;
      const previousDates = `${existing.startDate} – ${existing.endDate}`;

      existing.equipment = newEquipment;
      existing.startDate = newStartDate;
      existing.endDate = newEndDate;
      await existing.save();

      await logAudit({
        action: "BOOKING_UPDATED",
        actorEmail,
        actorRole,
        targetEmail: existing.memberEmail,
        targetName: existing.memberName,
        targetRole: "member",
        details: {
          applicationId: existing.id,
          previousEquipment,
          newEquipment,
          previousDates,
          newDates: `${newStartDate} – ${newEndDate}`,
          updatedBy: actorEmail,
          updatedAt: new Date().toISOString(),
        },
        req,
      });

      return res.json(existing);
    }

    // Otherwise, handle status change
    const newStatus = clean(req.body.status);
    if (!newStatus || !STATUSES.includes(newStatus)) return fail(res, 400, "Invalid status.");

    const isManagerOrAdmin = ["manager", "admin"].includes(actorRole) || Boolean(req.body.isVoid || req.body.voidedByManager);

    // Cancellation prior to manager approval check (members can only cancel pending requests; managers/admins can void anytime)
    if (newStatus === "Cancelled" && !isManagerOrAdmin && existing.status !== "Pending") {
      return fail(res, 400, `Only pending booking requests can be cancelled prior to manager approval (current status: ${existing.status}).`);
    }

    // If approving, enforce that no other booking is already approved on overlapping dates (Quantity: 1)
    if (newStatus === "Approved") {
      const overlappingBookings = await Application.find({
        _id: { $ne: existing._id },
        status: { $in: ["Approved", "Checked-Out"] },
        startDate: { $lte: existing.endDate },
        endDate: { $gte: existing.startDate },
      });
      const existingConflict = overlappingBookings.find((b) =>
        isSameMachineryMatch(b.machineryUnitId, b.equipment, existing.machineryUnitId, existing.equipment)
      );
      if (existingConflict) {
        return fail(
          res,
          409,
          `Cannot approve: "${existing.equipment}" (Quantity: 1) is already booked by ${existingConflict.memberName} from ${existingConflict.startDate} to ${existingConflict.endDate}.`
        );
      }
    }

    const previousStatus = existing.status;
    existing.status = newStatus;
    await existing.save();

    // Push approved bookings to Google Calendar (try/catch safe)
    if (newStatus === "Approved") {
      syncBookingToGoogleCalendar(existing, req.user).catch((err) => {
        console.warn("[GoogleCalendar] Background booking approval sync note:", err.message);
      });
    } else if (newStatus === "Cancelled" || newStatus === "Rejected") {
      // Delete event from Google Calendar if voided or rejected
      deleteBookingFromGoogleCalendar(existing, req.user).catch((err) => {
        console.warn("[GoogleCalendar] Background booking deletion note:", err.message);
      });
    }

    // Use specific action constants for each status transition
    const isVoid = isManagerOrAdmin && newStatus === "Cancelled" && previousStatus !== "Pending";
    const actionMap = {
      Approved: "BOOKING_APPROVED",
      Rejected: "BOOKING_REJECTED",
      Pending: "BOOKING_STATUS_UPDATED",
      Cancelled: isVoid ? "BOOKING_VOIDED" : "BOOKING_CANCELLED",
    };
    const action = actionMap[newStatus] || "BOOKING_STATUS_UPDATED";

    await logAudit({
      action,
      actorEmail,
      actorRole,
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      targetRole: "member",
      details: {
        applicationId: existing.id,
        equipment: existing.equipment,
        dateRange: `${existing.startDate} – ${existing.endDate}`,
        previousStatus,
        newStatus,
        changedBy: actorEmail,
        changedAt: new Date().toISOString(),
      },
      req,
    });

    res.json(existing);
  } catch (error) {
    console.error("Error updating application:", error);
    res.status(500).json({ error: "Failed to update application." });
  }
};

router.patch("/applications/:id", handleApplicationUpdate);
router.put("/applications/:id", handleApplicationUpdate);

router.delete("/applications/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
    const existing = await Application.findById(req.params.id);
    if (!existing) return fail(res, 404, "Application not found.");

    if (existing.status !== "Pending") {
      return fail(res, 400, `Only pending booking requests can be cancelled prior to manager approval (current status: ${existing.status}).`);
    }

    const actorEmail = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || existing.memberEmail);
    const actorRole = clean(req.body.actorRole || req.headers["x-actor-role"] || "member");

    existing.status = "Cancelled";
    await existing.save();

    await logAudit({
      action: "BOOKING_CANCELLED",
      actorEmail,
      actorRole,
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      targetRole: "member",
      details: {
        applicationId: existing.id,
        equipment: existing.equipment,
        dateRange: `${existing.startDate} – ${existing.endDate}`,
        cancelledBy: actorEmail,
        cancelledAt: new Date().toISOString(),
      },
      req,
    });

    res.json({ ok: true, message: "Booking request cancelled successfully.", application: existing });
  } catch (error) {
    console.error("Error cancelling application:", error);
    res.status(500).json({ error: "Failed to cancel application." });
  }
});

// ---------- MANAGER RENTAL OPERATIONS & INSPECTIONS ----------

/**
 * PATCH /api/applications/:id/inspection
 * Log pre-rental checkout or post-rental check-in condition inspections.
 */
router.patch("/applications/:id/inspection", authManager, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
    const { type, odometerHours, fuelLevel, notes, photoCount } = req.body;
    const isCheckout = type === "checkout";

    const application = await Application.findById(req.params.id);
    if (!application) return fail(res, 404, "Application not found.");

    const inspectionData = {
      odometerHours: Number(odometerHours) || 0,
      fuelLevel: clean(fuelLevel) || "100%",
      notes: clean(notes) || "Routine inspection passed.",
      photoCount: Number(photoCount) || 0,
      inspectedAt: new Date(),
    };

    if (isCheckout) {
      application.checkoutInspection = inspectionData;
      application.status = "Checked-Out";
    } else {
      application.checkinInspection = inspectionData;
      application.status = "Returned";
    }

    await application.save();

    await logAudit({
      action: isCheckout ? "RENTAL_HANDOVER_CHECKOUT" : "RENTAL_RETURN_CHECKIN",
      actorEmail: req.user?.email || "manager",
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      targetEmail: application.memberEmail,
      targetName: application.memberName,
      details: {
        applicationId: application.id,
        equipment: application.equipment,
        type: isCheckout ? "Pre-Rental Check-Out Handover" : "Post-Rental Check-In Return",
        odometerHours: inspectionData.odometerHours,
        fuelLevel: inspectionData.fuelLevel,
        notes: inspectionData.notes,
        photoCount: inspectionData.photoCount,
      },
      req,
    });

    res.json({ ok: true, application, message: isCheckout ? "Check-out inspection recorded." : "Check-in return completed." });
  } catch (error) {
    console.error("Error updating inspection:", error);
    res.status(500).json({ error: "Failed to record inspection." });
  }
});

module.exports = router;

