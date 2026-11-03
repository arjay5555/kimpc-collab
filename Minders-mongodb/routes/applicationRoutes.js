const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Account = require("../models/Account");
const Application = require("../models/Application");
const MachineryUnit = require("../models/MachineryUnit");
const MachineryMaintenance = require("../models/MachineryMaintenance");
const Notification = require("../models/Notification");
const authenticate = require("../middleware/authenticate");

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

function optionalAuthentication(req, res, next) {
  if (!(req.headers.authorization || "").startsWith("Bearer ")) return next();
  return authenticate(req, res, next);
}

function bookingTimestamp(value, endOfDate = false) {
  const raw = clean(value);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T${endOfDate ? "23:59:59.999" : "00:00:00.000"}Z`
    : raw;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

// ---------- Equipment applications ----------

// ?memberEmail=... returns one member's requests; without it, everything (manager/admin queue).
router.get("/applications", optionalAuthentication, async (req, res) => {
  try {
    const memberEmail = req.user?.role === "member" ? req.user.email : cleanEmail(req.query.memberEmail);
    const filter = memberEmail ? { memberEmail } : {};
    res.json(await Application.find(filter).sort({ createdAt: -1 }));
  } catch (error) {
    console.error("Error fetching applications:", error);
    res.status(500).json({ error: "Failed to fetch applications." });
  }
});

router.post("/applications", optionalAuthentication, async (req, res) => {
  try {
    const memberEmail = req.user?.role === "member" ? req.user.email : cleanEmail(req.body.memberEmail);
    const equipment = clean(req.body.equipment);
    const machineryUnitId = clean(req.body.machineryUnitId);
    const startDate = clean(req.body.startDate);
    const endDate = clean(req.body.endDate);
    const bookingType = clean(req.body.bookingType).toLowerCase() === "hourly" ? "hourly" : "daily";
    const farmLocation = clean(req.body.farmLocation);
    if (!equipment || !startDate || !endDate || (req.user?.role === "member" && !farmLocation)) {
      return fail(res, 400, "Equipment, dates, and farm location are required.");
    }
    if (farmLocation.length > 240) return fail(res, 400, "Farm location must be 240 characters or fewer.");
    const startTimestamp = bookingTimestamp(startDate);
    const endTimestamp = bookingTimestamp(endDate, bookingType === "daily");
    if (startTimestamp === null || endTimestamp === null) return fail(res, 400, "Enter valid booking dates and times.");
    if (endTimestamp <= startTimestamp) return fail(res, 400, "The end time must be after the start time.");
    if (bookingType === "daily" && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      return fail(res, 400, "Daily bookings require valid start and end dates.");
    }

    // Block new assignments to units under maintenance or retired
    let targetUnit = null;
    if (machineryUnitId || equipment) {
      targetUnit = await MachineryUnit.findOne(
        machineryUnitId ? { unitId: machineryUnitId } : { name: equipment }
      );
      if (machineryUnitId && !targetUnit) return fail(res, 404, "Selected machinery unit was not found.");
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
    });
    const maintenanceConflict = overlappingMaints.find((m) =>
      isSameMachineryMatch(m.equipmentUnitId, m.equipmentName, machineryUnitId, equipment) &&
      m.startDate <= endDate &&
      m.endDate >= startDate
    );

    if (maintenanceConflict) {
      return fail(
        res,
        409,
        `Cannot book "${equipment}": Unit is scheduled for ${maintenanceConflict.maintenanceType} from ${maintenanceConflict.startDate} to ${maintenanceConflict.endDate}.`
      );
    }

    // Quantity: 1 Enforcement — Cannot book an already APPROVED or CHECKED-OUT machinery unit
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
        `Cannot book "${equipment}": This machinery unit is already reserved from ${bookingConflict.startDate} to ${bookingConflict.endDate}. Please choose different dates.`
      );
    }

    let memberName = clean(req.body.memberName);
    if (!memberName && memberEmail) {
      const acct = await Account.findOne({ email: memberEmail }).select("fullName").lean();
      memberName = acct?.fullName || memberEmail;
    }

    const application = await Application.create({
      memberEmail: memberEmail || "walkin@kimpc.test",
      memberName: memberName || "Cooperative Member",
      equipment,
      machineryUnitId: machineryUnitId || targetUnit?.unitId || "",
      startDate,
      endDate,
      bookingType,
      farmLocation,
      status: "Pending",
      isWalkIn: Boolean(req.body.isWalkIn),
      farmerPhone: clean(req.body.farmerPhone),
      financials: {
        dailyRate: Number(req.body.dailyRate) || Number(targetUnit?.memberRate) || 0,
        paymentMethod: clean(req.body.paymentMethod) || "Cash",
      },
    });

    await logAudit({
      action: "BOOKING_REQUESTED",
      actorEmail: memberEmail || req.user?.email || "anonymous",
      actorRole: req.user?.role || "member",
      targetEmail: memberEmail,
      targetName: memberName,
      targetRole: "member",
      details: {
        applicationId: application.id,
        equipment,
        machineryUnitId: application.machineryUnitId,
        dateRange: `${startDate} – ${endDate}`,
        bookingType,
        farmLocation,
      },
      req,
    });

    res.status(201).json(application);
  } catch (error) {
    console.error("Error creating application:", error);
    res.status(500).json({ error: "Failed to create application." });
  }
});

router.get("/applications/:id", optionalAuthentication, async (req, res) => {
  try {
    let app = null;
    if (mongoose.isValidObjectId(req.params.id)) {
      app = await Application.findById(req.params.id);
    }
    if (!app) {
      app = await Application.findOne({
        $or: [
          { displayId: req.params.id },
          { displayId: req.params.id.toUpperCase() },
        ],
      });
    }
    if (!app) return fail(res, 404, "Application not found.");
    res.json(app);
  } catch (error) {
    console.error("Error fetching application:", error);
    res.status(500).json({ error: "Failed to fetch application." });
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

    // Check if member is editing booking details (farm location, equipment, startDate, endDate, bookingType)
    const isEditingDetails = Boolean(
      req.body.equipment ||
      req.body.startDate ||
      req.body.endDate ||
      req.body.farmLocation !== undefined ||
      req.body.bookingType
    );
    if (isEditingDetails && !req.body.status) {
      if (existing.status !== "Pending") {
        return fail(
          res,
          400,
          `Only pending booking requests can be edited. Approved or in-progress bookings cannot be edited (current status: ${existing.status}).`
        );
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
      const previousLocation = existing.farmLocation;

      existing.equipment = newEquipment;
      existing.startDate = newStartDate;
      existing.endDate = newEndDate;
      if (req.body.farmLocation !== undefined) {
        existing.farmLocation = clean(req.body.farmLocation);
      }
      if (req.body.bookingType) {
        existing.bookingType = clean(req.body.bookingType);
      }
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
          previousLocation,
          newLocation: existing.farmLocation,
          updatedBy: actorEmail,
          updatedAt: new Date().toISOString(),
        },
        req,
      });

      return res.json({ ok: true, message: "Booking updated successfully.", application: existing });
    }

    // Otherwise, handle status change
    const newStatus = clean(req.body.status);
    if (!newStatus || !STATUSES.includes(newStatus)) return fail(res, 400, "Invalid status.");

    const isManagerOrAdmin = ["manager", "admin"].includes(actorRole) || Boolean(req.body.isVoid || req.body.voidedByManager);

    // Cancellation prior to manager approval check (members can only cancel pending requests; managers/admins can void anytime)
    if (newStatus === "Cancelled" && !isManagerOrAdmin && existing.status !== "Pending") {
      return fail(res, 400, `Only pending booking requests can be cancelled directly. Approved bookings require manager approval.`);
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
    if (newStatus === "Rejected" && req.body.managerRemarks !== undefined) {
      existing.managerRemarks = clean(req.body.managerRemarks);
    }
    if (newStatus === "Cancelled") {
      existing.cancellationRequested = false;
    }
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
      "Cancellation Requested": "CANCELLATION_REQUESTED",
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

    if (["Approved", "Rejected"].includes(newStatus)) {
      const member = await Account.findOne({ email: existing.memberEmail }).select("memberSettings").lean();
      if (member?.memberSettings?.notifications?.inApp !== false) {
        await Notification.create({
          memberEmail: existing.memberEmail,
          title: newStatus === "Approved" ? "Booking approved" : "Booking request update",
          message: newStatus === "Approved"
            ? `Your request for ${existing.equipment} has been approved.`
            : `Your request for ${existing.equipment} was declined.${existing.managerRemarks ? ` Reason: ${existing.managerRemarks}` : ""}`,
          type: "booking",
          relatedApplicationId: existing._id,
        });
      }
    }

    res.json(existing);
  } catch (error) {
    console.error("Error updating application:", error);
    res.status(500).json({ error: "Failed to update application." });
  }
};

router.patch("/applications/:id", handleApplicationUpdate);
router.put("/applications/:id", handleApplicationUpdate);

// Cancel or request cancellation
router.delete("/applications/:id", authenticate, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
    const existing = await Application.findById(req.params.id);
    if (!existing) return fail(res, 404, "Application not found.");

    const actorEmail = cleanEmail(req.user.email);
    const actorRole = clean(req.user.role).toLowerCase();
    const isManagerOrAdmin = ["manager", "admin"].includes(actorRole);
    if (!isManagerOrAdmin && (actorRole !== "member" || actorEmail !== cleanEmail(existing.memberEmail))) {
      return fail(res, 403, "You can only cancel your own booking requests.");
    }

    // Direct cancel for Pending requests
    if (existing.status === "Pending") {
      existing.status = "Cancelled";
      existing.cancellationRequested = false;
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
          type: "Direct pending cancellation",
        },
        req,
      });

      return res.json({ ok: true, direct: true, message: "Booking request cancelled successfully.", application: existing });
    }

    // For Approved bookings: member must request manager approval!
    if (existing.status === "Approved") {
      existing.status = "Cancellation Requested";
      existing.cancellationRequested = true;
      existing.cancellationReason = clean(req.body?.reason || req.query?.reason) || "Member requested cancellation of approved booking";
      existing.cancellationRequestedAt = new Date();
      await existing.save();

      // Notify managers
      const managers = await Account.find({ role: "manager" }).select("email").lean();
      if (managers.length > 0) {
        await Notification.insertMany(
          managers.map((m) => ({
            memberEmail: m.email,
            title: "Cancellation Request Received",
            message: `${existing.memberName} requested cancellation for approved booking ${existing.equipment} (${existing.startDate} to ${existing.endDate}).`,
            type: "alert",
            relatedApplicationId: existing._id,
          }))
        );
      }

      await logAudit({
        action: "CANCELLATION_REQUESTED",
        actorEmail,
        actorRole,
        targetEmail: existing.memberEmail,
        targetName: existing.memberName,
        targetRole: "member",
        details: {
          applicationId: existing.id,
          equipment: existing.equipment,
          dateRange: `${existing.startDate} – ${existing.endDate}`,
          reason: existing.cancellationReason,
        },
        req,
      });

      return res.json({
        ok: true,
        direct: false,
        pendingGrant: true,
        message: "Cancellation request submitted. The manager has been notified to grant cancellation.",
        application: existing,
      });
    }

    return fail(res, 400, `Cannot cancel booking with current status "${existing.status}".`);
  } catch (error) {
    console.error("Error cancelling application:", error);
    res.status(500).json({ error: "Failed to cancel application." });
  }
});

// Explicit Request Cancellation endpoint
router.post("/applications/:id/request-cancellation", authenticate, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
    const existing = await Application.findById(req.params.id);
    if (!existing) return fail(res, 404, "Application not found.");

    const actorEmail = cleanEmail(req.user.email);
    if (req.user.role === "member" && actorEmail !== cleanEmail(existing.memberEmail)) {
      return fail(res, 403, "You can only request cancellation for your own bookings.");
    }

    if (existing.status === "Pending") {
      // Pending cancels directly
      existing.status = "Cancelled";
      await existing.save();
      return res.json({ ok: true, direct: true, message: "Booking request cancelled successfully.", application: existing });
    }

    if (existing.status !== "Approved") {
      return fail(res, 400, `Cannot request cancellation for booking with status "${existing.status}".`);
    }

    existing.status = "Cancellation Requested";
    existing.cancellationRequested = true;
    existing.cancellationReason = clean(req.body.reason) || "Member requested cancellation";
    existing.cancellationRequestedAt = new Date();
    await existing.save();

    // Notify managers
    const managers = await Account.find({ role: "manager" }).select("email").lean();
    if (managers.length > 0) {
      await Notification.insertMany(
        managers.map((m) => ({
          memberEmail: m.email,
          title: "Cancellation Request Received",
          message: `${existing.memberName} requested cancellation for approved booking ${existing.equipment} (${existing.startDate} to ${existing.endDate}).`,
          type: "alert",
          relatedApplicationId: existing._id,
        }))
      );
    }

    return res.json({
      ok: true,
      direct: false,
      pendingGrant: true,
      message: "Cancellation request submitted. Waiting for manager approval.",
      application: existing,
    });
  } catch (err) {
    console.error("Error requesting cancellation:", err);
    res.status(500).json({ error: "Failed to request cancellation." });
  }
});

// Manager Grants Cancellation for Approved Booking
router.post("/applications/:id/grant-cancellation", authManager, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
    const existing = await Application.findById(req.params.id);
    if (!existing) return fail(res, 404, "Application not found.");

    existing.status = "Cancelled";
    existing.cancellationRequested = false;
    existing.managerRemarks = "Cancellation granted by manager.";
    await existing.save();

    // Remove from Google Calendar if scheduled
    deleteBookingFromGoogleCalendar(existing, req.user).catch((err) => {
      console.warn("[GoogleCalendar] Booking cancellation deletion note:", err.message);
    });

    // Notify member
    await Notification.create({
      memberEmail: existing.memberEmail,
      title: "Cancellation Request Granted",
      message: `Your cancellation request for ${existing.equipment} (${existing.startDate} to ${existing.endDate}) was granted by the manager.`,
      type: "system",
      relatedApplicationId: existing._id,
    });

    await logAudit({
      action: "CANCELLATION_GRANTED",
      actorEmail: req.user?.email || "manager",
      actorRole: req.user?.role || "manager",
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      targetRole: "member",
      details: { applicationId: existing.id, equipment: existing.equipment },
      req,
    });

    res.json({ ok: true, message: "Booking cancellation granted successfully.", application: existing });
  } catch (err) {
    console.error("Error granting cancellation:", err);
    res.status(500).json({ error: "Failed to grant cancellation." });
  }
});

// Manager Declines Cancellation for Approved Booking
router.post("/applications/:id/decline-cancellation", authManager, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
    const existing = await Application.findById(req.params.id);
    if (!existing) return fail(res, 404, "Application not found.");

    const reason = clean(req.body.reason) || "Booking schedule must proceed as confirmed.";
    existing.status = "Approved";
    existing.cancellationRequested = false;
    existing.managerRemarks = `Cancellation request declined: ${reason}`;
    await existing.save();

    // Notify member
    await Notification.create({
      memberEmail: existing.memberEmail,
      title: "Cancellation Request Declined",
      message: `Your cancellation request for ${existing.equipment} was declined by the manager: ${reason}`,
      type: "alert",
      relatedApplicationId: existing._id,
    });

    await logAudit({
      action: "CANCELLATION_DECLINED",
      actorEmail: req.user?.email || "manager",
      actorRole: req.user?.role || "manager",
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      targetRole: "member",
      details: { applicationId: existing.id, equipment: existing.equipment, reason },
      req,
    });

    res.json({ ok: true, message: "Cancellation request declined.", application: existing });
  } catch (err) {
    console.error("Error declining cancellation:", err);
    res.status(500).json({ error: "Failed to decline cancellation." });
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
