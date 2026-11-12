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
const cloudinaryService = require("../services/cloudinaryService");
const oneSignalService = require("../services/oneSignalService");

const {
  STATUSES,
  clean,
  cleanEmail,
  fail,
  isSameMachineryMatch,
} = require("./routeHelpers");
const {
  round2,
  computePaymentSummary,
  syncApplicationFinancials,
  applyCancellationFinancialEffects,
  findLinkedRefundsForPayment,
} = require("../utils/paymentSummary");

function serializeApplication(appDoc) {
  const obj = appDoc && typeof appDoc.toObject === "function" ? appDoc.toObject() : { ...(appDoc || {}) };
  if (obj._id && !obj.id) obj.id = String(obj._id);
  if (obj.id && !obj.displayId) obj.displayId = `APP-${String(obj.id).slice(-6).toUpperCase()}`;
  if (!obj.submittedAt && obj.createdAt) {
    obj.submittedAt = new Date(obj.createdAt).toISOString();
  }
  obj.financialSummary = computePaymentSummary(obj);
  return obj;
}

function getRequestIdempotencyKey(req) {
  return clean(req.body?.idempotencyKey || req.headers["idempotency-key"]);
}

function hasProcessedRequest(existing, idempotencyKey) {
  if (!idempotencyKey) return false;
  return Array.isArray(existing?.processedRequestIds) && existing.processedRequestIds.includes(idempotencyKey);
}

function recordProcessedRequest(existing, idempotencyKey) {
  if (!idempotencyKey) return;
  if (!Array.isArray(existing.processedRequestIds)) existing.processedRequestIds = [];
  if (!existing.processedRequestIds.includes(idempotencyKey)) {
    existing.processedRequestIds.push(idempotencyKey);
    if (existing.processedRequestIds.length > 50) {
      existing.processedRequestIds = existing.processedRequestIds.slice(-50);
    }
  }
}

function checkManagerUser(req, res) {
  if (!req.user) {
    fail(res, 401, "Authentication required.");
    return false;
  }
  const role = clean(req.user.role).toLowerCase();
  if (!["manager", "admin"].includes(role)) {
    fail(res, 403, "Access denied. Manager or administrator privileges required.");
    return false;
  }
  return true;
}

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
    const applications = await Application.find(filter).sort({ createdAt: -1 }).lean();

    // Ensure clientAvatar and memberPhone / farmerPhone / clientPhone are populated from Account
    const allEmails = [...new Set(applications.map((a) => a.memberEmail).filter(Boolean))];
    if (allEmails.length > 0) {
      const accounts = await Account.find({ email: { $in: allEmails } }).select("email phone avatar").lean();
      const accountMap = new Map(accounts.map((acc) => [acc.email.toLowerCase(), acc]));
      applications.forEach((a) => {
        if (a.memberEmail) {
          const acc = accountMap.get(a.memberEmail.toLowerCase());
          if (acc) {
            if (acc.avatar && !a.clientAvatar) {
              a.clientAvatar = acc.avatar;
              a.avatar = acc.avatar;
            }
            if (!a.farmerPhone && !a.memberPhone && acc.phone) {
              a.farmerPhone = acc.phone;
              a.memberPhone = acc.phone;
              a.clientPhone = acc.phone;
            }
          }
        }
      });
    }

    // Ensure machinery imageUrl is populated from MachineryUnit if missing
    const unitIds = [...new Set(applications.filter((a) => !a.imageUrl && a.machineryUnitId).map((a) => a.machineryUnitId))];
    const equipNames = [...new Set(applications.filter((a) => !a.imageUrl && a.equipment).map((a) => a.equipment))];
    if (unitIds.length > 0 || equipNames.length > 0) {
      const units = await MachineryUnit.find({
        $or: [
          ...(unitIds.length > 0 ? [{ unitId: { $in: unitIds } }] : []),
          ...(equipNames.length > 0 ? [{ name: { $in: equipNames } }] : []),
        ],
      }).select("unitId name imageUrl photos").lean();

      const unitMap = new Map();
      units.forEach((u) => {
        const img = u.imageUrl || (Array.isArray(u.photos) && u.photos[0]) || "";
        if (u.unitId && img) unitMap.set(u.unitId, img);
        if (u.name && img && !unitMap.has(u.name)) unitMap.set(u.name, img);
      });

      applications.forEach((a) => {
        if (!a.imageUrl) {
          a.imageUrl = unitMap.get(a.machineryUnitId) || unitMap.get(a.equipment) || "";
        }
      });
    }

    res.json(applications.map(serializeApplication));
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
    const hectares = Math.max(0.1, Number(req.body.hectares) || 1);
    const bookingType = clean(req.body.bookingType).toLowerCase() || "hectare";
    const farmLocation = clean(req.body.farmLocation || req.body.location);
    const farmFormattedAddress = clean(req.body.farmFormattedAddress || farmLocation);
    const farmCoordinates = {
      lat: req.body.farmCoordinates?.lat != null ? Number(req.body.farmCoordinates.lat) : (req.body.lat != null ? Number(req.body.lat) : null),
      lng: req.body.farmCoordinates?.lng != null ? Number(req.body.farmCoordinates.lng) : (req.body.lng != null ? Number(req.body.lng) : null),
    };
    if (!equipment || !startDate || !endDate) {
      return fail(res, 400, "Equipment and booking dates are required.");
    }
    if (farmLocation.length > 500) return fail(res, 400, "Farm location must be 500 characters or fewer.");
    const startTimestamp = bookingTimestamp(startDate);
    const endTimestamp = bookingTimestamp(endDate, true);
    if (startTimestamp === null || endTimestamp === null) return fail(res, 400, "Enter valid booking dates.");
    if (endTimestamp <= startTimestamp) return fail(res, 400, "The end date must be on or after the start date.");

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
    let memberPhone = clean(req.body.farmerPhone || req.body.memberPhone || req.body.phone || req.body.clientPhone);
    let memberAccount = null;

    if (memberEmail) {
      memberAccount = await Account.findOne({ email: memberEmail }).select("fullName phone role avatar").lean();
      if (!memberName) memberName = memberAccount?.fullName || memberEmail;
      if (!memberPhone) memberPhone = clean(memberAccount?.phone);
    }

    if ((req.user?.role === "manager" || req.user?.role === "admin") && (!memberEmail || !memberAccount || memberAccount.role !== "member")) {
      return fail(res, 400, "Please select a registered member account in the system.");
    }

    // ENFORCE: Members cannot proceed with booking if they have not input their mobile number in their profile!
    const isMemberBooking = req.user?.role === "member" || memberAccount?.role === "member" || (!req.user && memberEmail);
    if (isMemberBooking && !memberPhone) {
      return fail(
        res,
        400,
        "Mobile number required: The selected member account has no mobile number. Please enter a contact mobile number before proceeding."
      );
    }

    const ratePerHectare = Number(req.body.ratePerHectare) || Number(targetUnit?.memberRate) || Number(targetUnit?.ratePerHectare) || 2500;
    const totalAmount = Math.round(ratePerHectare * hectares);
    const unitBrandModel = [targetUnit?.brand, targetUnit?.model].map((s) => clean(s)).filter(Boolean).join(" ");
    const machineryModel = clean(unitBrandModel || req.body.machineryModel || targetUnit?.name || "Standard Model");
    const assignedDriver = clean(targetUnit?.assignedDriver || (targetUnit?.operatorIncluded ? "Coop Operator Assigned" : "Self-Operated"));
    const driverPhone = clean(targetUnit?.driverPhone || "");
    const now = new Date();

    const paymentMethod = clean(req.body.paymentMethod) === "GCash" ? "GCash" : "Cash";
    const cashPaymentOption = paymentMethod === "Cash" ? clean(req.body.cashPaymentOption) || "Upon Pickup" : "";
    let gcashProof = paymentMethod === "GCash" ? clean(req.body.gcashProof) : "";

    // Upload GCash receipt proof to Cloudinary if base64 data URI provided
    if (paymentMethod === "GCash" && gcashProof && gcashProof.startsWith("data:image/")) {
      try {
        const uploadResult = await cloudinaryService.uploadImage(gcashProof, {
          folder: "kimpc/receipts",
          filename: `gcash-${Date.now()}`,
        });
        gcashProof = uploadResult.url;
      } catch (err) {
        console.warn("Could not upload GCash proof to Cloudinary, saving local fallback/base64:", err.message);
      }
    }

    // Bookings always initialize with zero recorded payments until a manager saves payment received
    const receiptNo = `REC-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const initialTimeline = [
      {
        event: "created",
        title: "Booking Request Submitted",
        timestamp: now,
        actor:
          req.user?.role === "manager" || req.user?.role === "admin"
            ? clean(req.user.fullName) || "Manager"
            : "Member",
        note: `Requested for ${hectares} ha (${startDate} to ${endDate}). Payment: ${paymentMethod}${paymentMethod === "Cash" ? ` (${cashPaymentOption})` : (gcashProof ? " [GCash Proof Uploaded - Pending Verification]" : "")}`,
      },
    ];

    const application = await Application.create({
      memberEmail: memberEmail || "walkin@kimpc.test",
      memberName: memberName || "Cooperative Member",
      equipment,
      machineryUnitId: machineryUnitId || targetUnit?.unitId || "",
      machineryModel,
      imageUrl: targetUnit?.imageUrl || (Array.isArray(targetUnit?.photos) && targetUnit?.photos[0]) || "",
      clientAvatar: memberAccount?.avatar || "",
      assignedDriver,
      driverPhone,
      startDate,
      endDate,
      bookingType: "hectare",
      hectares,
      ratePerHectare,
      totalAmount,
      farmLocation,
      farmCoordinates,
      farmFormattedAddress,
      status: "Pending",
      paymentStatus: "Pending",
      paymentAmount: 0,
      paymentMethod,
      cashPaymentOption,
      gcashProof,
      receiptNo,
      paymentHistory: [],
      refunds: [],
      isWalkIn: Boolean(req.body.isWalkIn),
      farmerPhone: memberPhone,
      memberPhone,
      clientPhone: memberPhone,
      timeline: initialTimeline,
      financials: {
        dailyRate: ratePerHectare,
        ratePerHectare,
        hectares,
        totalPaid: 0,
        refundAmount: 0,
        paymentMethod,
        isSettled: false,
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
      farmCoordinates,
      farmFormattedAddress,
        paymentMethod,
        totalAmount,
      },
      req,
    });

    // Notify managers in-app about new member booking
    try {
      const managers = await Account.find({ role: "manager" }).select("email").lean();
      if (managers.length > 0) {
        await Notification.insertMany(
          managers.map((m) => ({
            memberEmail: m.email,
            title: "New Machinery Booking Placed",
            message: `${memberName || memberEmail} placed a booking for ${equipment} (${startDate} to ${endDate}). Payment: ${paymentMethod || "Cash"} (₱${Number(totalAmount).toLocaleString()}).`,
            type: "booking",
            relatedApplicationId: application._id,
          }))
        );
      }
    } catch (notifErr) {
      console.warn("Could not send manager notification for new booking:", notifErr.message);
    }

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
    const appObj = app.toObject ? app.toObject() : app;
    if (!appObj.imageUrl && (appObj.machineryUnitId || appObj.equipment)) {
      const u = await MachineryUnit.findOne({
        $or: [
          ...(appObj.machineryUnitId ? [{ unitId: appObj.machineryUnitId }] : []),
          ...(appObj.equipment ? [{ name: appObj.equipment }] : []),
        ],
      }).select("imageUrl photos").lean();
      if (u) {
        appObj.imageUrl = u.imageUrl || (Array.isArray(u.photos) && u.photos[0]) || "";
      }
    }
    if (appObj.memberEmail) {
      const acc = await Account.findOne({ email: appObj.memberEmail }).select("avatar phone").lean();
      if (acc) {
        if (acc.avatar && !appObj.clientAvatar) {
          appObj.clientAvatar = acc.avatar;
          appObj.avatar = acc.avatar;
        }
        if (!appObj.farmerPhone && !appObj.memberPhone && acc.phone) {
          appObj.farmerPhone = acc.phone;
          appObj.memberPhone = acc.phone;
          appObj.clientPhone = acc.phone;
        }
      }
    }
    res.json(serializeApplication(appObj));
  } catch (error) {
    console.error("Error fetching application:", error);
    res.status(500).json({ error: "Failed to fetch application." });
  }
});

async function findApplicationByAnyId(rawIdInput) {
  const rawId = clean(rawIdInput);
  if (!rawId) return null;
  let existing = null;
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
    existing = apps.find((a) => String(a._id).slice(-6).toLowerCase() === suffix || String(a._id) === rawId) || null;
  }
  return existing;
}

/**
 * Shared validated & idempotent payment recording helper used by POST /payments and legacy PATCH /applications/:id.
 */
async function recordApplicationPayment(existing, req) {
  if (!existing.financials) existing.financials = {};
  if (!Array.isArray(existing.paymentHistory)) existing.paymentHistory = [];
  if (!Array.isArray(existing.timeline)) existing.timeline = [];

  const now = new Date();
  const idempotencyKey = getRequestIdempotencyKey(req);
  if (
    hasProcessedRequest(existing, idempotencyKey) ||
    (idempotencyKey && existing.paymentHistory.some((p) => clean(p.idempotencyKey) === idempotencyKey))
  ) {
    const existingSummary = computePaymentSummary(existing);
    return { ok: true, deduplicated: true, summary: existingSummary, paymentEntry: null };
  }

  const preSummary = computePaymentSummary(existing);
  const payableCap = round2(preSummary.maxPayableAmount ?? preSummary.balanceDue);
  if (!preSummary.canRecordPayment || payableCap <= 0) {
    return {
      ok: false,
      status: 400,
      error: "This booking is already fully paid or has no remaining payable amount.",
    };
  }

  const incomingRequestedStatus = clean(req.body?.paymentStatus);
  const rawIncomingAmount =
    req.body?.amount !== undefined && req.body?.amount !== ""
      ? Number(req.body.amount)
      : req.body?.installmentAmount !== undefined && req.body?.installmentAmount !== ""
      ? Number(req.body.installmentAmount)
      : req.body?.paymentAmount !== undefined && req.body?.paymentAmount !== ""
      ? Number(req.body.paymentAmount)
      : incomingRequestedStatus === "Paid" || incomingRequestedStatus === "Settled"
      ? preSummary.balanceDue > 0
        ? preSummary.balanceDue
        : payableCap
      : NaN;

  if (!Number.isFinite(rawIncomingAmount) || rawIncomingAmount <= 0) {
    return { ok: false, status: 400, error: "Payment amount must be greater than ₱0." };
  }

  const roundedRequested = round2(rawIncomingAmount);
  if (roundedRequested - payableCap > 0.01) {
    return {
      ok: false,
      status: 400,
      error: `Payment amount (₱${roundedRequested.toLocaleString()}) exceeds remaining payable limit (₱${payableCap.toLocaleString()}).`,
    };
  }

  const appliedAmount = Math.min(roundedRequested, payableCap);
  const paymentMethod = clean(req.body?.paymentMethod) || existing.paymentMethod || "Cash";
  const referenceNumber = clean(req.body?.referenceNumber || req.body?.paymentReference);
  const dateTime = clean(req.body?.dateTime || req.body?.paymentDateTime || req.body?.paymentDate) || now.toISOString();
  const receiverName = clean(req.user?.fullName || req.user?.email) || "Manager";
  const seqSuffix = String(existing.paymentHistory.length + 1).padStart(2, "0");
  const receiptNo =
    clean(req.body?.receiptNo) ||
    `OR-${now.getFullYear()}-${String(existing._id).slice(-4).toUpperCase()}-${seqSuffix}`;

  const isCompleting = appliedAmount >= payableCap - 0.01;
  const defaultType = preSummary.isCancelled && preSummary.cancellationFee > 0
    ? "Cancellation Fee Payment"
    : isCompleting
    ? preSummary.activePaymentCount > 0
      ? "Final Payment"
      : "Full Rental Payment"
    : preSummary.activePaymentCount === 0
    ? "Down Payment"
    : "Partial Rental Payment";
  const paymentType = clean(req.body?.paymentType) || defaultType;
  const proofOfPayment = clean(req.body?.proofOfPayment);
  const notes = clean(req.body?.notes);

  existing.paymentHistory.push({
    receiptNo,
    amount: appliedAmount,
    paymentMethod,
    paymentType,
    referenceNumber,
    dateTime,
    receivedBy: receiverName,
    proofOfPayment,
    notes,
    idempotencyKey,
    recordedAt: now,
  });

  if (proofOfPayment && !existing.gcashProof) {
    existing.gcashProof = proofOfPayment;
  }

  recordProcessedRequest(existing, idempotencyKey);
  const postSummary = syncApplicationFinancials(existing);
  const effectiveTarget = postSummary.isClosedBooking
    ? Math.max(postSummary.rentalCharge, postSummary.cancellationFee)
    : postSummary.rentalCharge;

  existing.timeline.push({
    event: postSummary.balanceDue <= 0 ? "payment_settled" : "payment_partial",
    title: postSummary.balanceDue <= 0 ? "Payment Settled" : `${paymentType} Recorded`,
    timestamp: now,
    actor: receiverName,
    note: `${paymentType} of ₱${appliedAmount.toLocaleString()} (${paymentMethod}). Total Paid: ₱${postSummary.grossPaid.toLocaleString()} / ₱${effectiveTarget.toLocaleString()} · Balance Due: ₱${postSummary.balanceDue.toLocaleString()}. OR No: ${receiptNo}${referenceNumber ? ` · Ref: ${referenceNumber}` : ""}.`,
  });

  await existing.save();

  const createdEntry = existing.paymentHistory[existing.paymentHistory.length - 1];

  await logAudit({
    action: "PAYMENT_RECORDED",
    actorEmail: cleanEmail(req.user?.email || "manager"),
    actorRole: clean(req.user?.role || "manager"),
    actorId: req.user?._id,
    targetEmail: existing.memberEmail,
    targetName: existing.memberName,
    targetRole: "member",
    details: {
      applicationId: existing.id,
      receiptNo,
      amount: appliedAmount,
      paymentMethod,
      paymentType,
      referenceNumber,
      grossPaid: postSummary.grossPaid,
      balanceDue: postSummary.balanceDue,
      paymentStatus: postSummary.paymentStatus,
    },
    req,
  });

  try {
    await Notification.create({
      memberEmail: existing.memberEmail,
      title:
        postSummary.balanceDue <= 0
          ? "Payment Confirmed & Receipt Ready"
          : `${paymentType} Recorded`,
      message:
        postSummary.balanceDue <= 0
          ? `Your payment of ₱${appliedAmount.toLocaleString()} for ${existing.equipment} has been verified and settled (Total Paid: ₱${postSummary.grossPaid.toLocaleString()}). OR #${receiptNo}.`
          : `${paymentType} of ₱${appliedAmount.toLocaleString()} for ${existing.equipment} has been recorded (Total Paid: ₱${postSummary.grossPaid.toLocaleString()} of ₱${effectiveTarget.toLocaleString()}; Remaining balance: ₱${postSummary.balanceDue.toLocaleString()}). OR #${receiptNo}.`,
      type: "booking",
      relatedApplicationId: existing._id,
    });
  } catch (notifErr) {
    console.warn("Could not notify member of payment settlement:", notifErr.message);
  }

  return { ok: true, deduplicated: false, summary: postSummary, paymentEntry: createdEntry };
}

const handleApplicationUpdate = async (req, res) => {
  try {
    if (!req.user) {
      return fail(res, 401, "Authentication required.");
    }
    const existing = await findApplicationByAnyId(req.params.id);
    if (!existing) return fail(res, 404, "Application not found.");

    const actorEmail = cleanEmail(req.user.email);
    const actorRole = clean(req.user.role).toLowerCase();
    const isManagerOrAdmin = ["manager", "admin"].includes(actorRole);

    // Check if manager is updating payment status (requires manager/admin credentials)
    if (req.body.paymentStatus && !req.body.status && !req.body.startDate) {
      if (!checkManagerUser(req, res)) return;
      const result = await recordApplicationPayment(existing, req);
      if (!result.ok) {
        return fail(res, result.status || 400, result.error);
      }
      return res.json({
        ok: true,
        deduplicated: Boolean(result.deduplicated),
        message: result.deduplicated ? "Duplicate payment request ignored." : "Payment status updated.",
        paymentEntry: result.paymentEntry,
        application: existing,
      });
    }

    // Check if member is editing booking details (farm location, equipment, startDate, endDate, bookingType)
    const isEditingDetails = Boolean(
      req.body.equipment ||
      req.body.startDate ||
      req.body.endDate ||
      req.body.farmLocation !== undefined ||
      req.body.bookingType
    );
    if (isEditingDetails && !req.body.status) {
      if (!isManagerOrAdmin && actorEmail !== cleanEmail(existing.memberEmail)) {
        return fail(res, 403, "You can only edit your own booking requests.");
      }
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

      const isDatesChanged = newStartDate !== existing.startDate || newEndDate !== existing.endDate;
      if (isDatesChanged) {
        // Enforce conflict checking when rescheduling
        const overlappingBookings = await Application.find({
          _id: { $ne: existing._id },
          status: { $in: ["Pending", "Approved", "Checked-Out"] },
          startDate: { $lte: newEndDate },
          endDate: { $gte: newStartDate },
        });
        const conflict = overlappingBookings.find((b) =>
          isSameMachineryMatch(b.machineryUnitId, b.equipment, existing.machineryUnitId, existing.equipment)
        );
        if (conflict) {
          return fail(
            res,
            409,
            `Cannot reschedule to these dates: Machinery "${existing.equipment}" is already booked by another reservation from ${conflict.startDate} to ${conflict.endDate}. Please choose different dates.`
          );
        }

        existing.rescheduledAt = new Date();
        if (!existing.rescheduleHistory) existing.rescheduleHistory = [];
        existing.rescheduleHistory.push({
          previousStartDate: existing.startDate,
          previousEndDate: existing.endDate,
          newStartDate,
          newEndDate,
          rescheduledAt: new Date(),
          reason: clean(req.body.rescheduleReason || "Member rescheduled rental dates"),
        });

        if (!existing.timeline) existing.timeline = [];
        existing.timeline.push({
          event: "rescheduled",
          title: "Booking Rescheduled",
          timestamp: new Date(),
          actor: actorRole === "manager" ? "Manager" : "Member",
          note: `Dates moved from ${previousDates} ➔ ${newStartDate} – ${newEndDate} (${existing.hectares || 1} ha)`,
        });
      }

      existing.equipment = newEquipment;
      existing.startDate = newStartDate;
      existing.endDate = newEndDate;
      if (req.body.farmLocation !== undefined) {
        existing.farmLocation = clean(req.body.farmLocation);
      }
      if (req.body.bookingType) {
        existing.bookingType = clean(req.body.bookingType);
      }
      if (req.body.hectares !== undefined) {
        existing.hectares = Math.max(0.1, Number(req.body.hectares) || 1);
        const rate = existing.ratePerHectare || existing.financials?.ratePerHectare || existing.financials?.dailyRate || 2500;
        existing.totalAmount = Math.round(rate * existing.hectares);
        if (!existing.financials) existing.financials = {};
        existing.financials.hectares = existing.hectares;
        existing.financials.ratePerHectare = rate;
        syncApplicationFinancials(existing);
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

      if (previousDates !== `${newStartDate} – ${newEndDate}`) {
        oneSignalService.sendBookingStatusPush(existing, "Rescheduled").catch((err) => {
          console.warn("[OneSignal] Background booking reschedule push error:", err.message);
        });
        if (["Approved", "Checked-Out"].includes(existing.status)) {
          syncBookingToGoogleCalendar(existing, req.user).catch((err) => {
            console.warn("[GoogleCalendar] Rescheduled booking sync error:", err.message);
          });
        }
      }

      return res.json({ ok: true, message: "Booking updated successfully.", application: existing });
    }

    // Otherwise, handle status change
    const newStatus = clean(req.body.status);
    if (!newStatus || !STATUSES.includes(newStatus)) return fail(res, 400, "Invalid status.");

    const isVoidRequested = Boolean(req.body.isVoid || req.body.voidedByManager);

    if (!isManagerOrAdmin) {
      if (actorEmail !== cleanEmail(existing.memberEmail)) {
        return fail(res, 403, "You can only update your own booking requests.");
      }
      if (newStatus !== "Cancelled" || isVoidRequested) {
        return fail(res, 403, "Only cooperative managers or administrators can perform this booking status change.");
      }
    }

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
    const nowTs = new Date();

    if (newStatus === "Approved") {
      existing.approvedAt = nowTs;
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: "approved",
        title: "Booking Approved",
        timestamp: nowTs,
        actor: actorRole === "admin" ? "Admin" : "Manager",
        note: "Booking approved and scheduled for machinery dispatch.",
      });
    } else if (newStatus === "Checked-Out") {
      existing.dispatchedAt = nowTs;
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: "dispatched",
        title: "Machinery Given / Dispatched",
        timestamp: nowTs,
        actor: "Manager",
        note: `Machinery handed over and dispatched with ${existing.assignedDriver || "assigned driver"}.`,
      });
    } else if (newStatus === "Returned") {
      existing.returnedAt = nowTs;
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: "returned",
        title: "Machinery Returned",
        timestamp: nowTs,
        actor: "Manager",
        note: "Machinery safely returned to depot.",
      });
    } else if (newStatus === "Rejected") {
      if (req.body.managerRemarks !== undefined) {
        existing.managerRemarks = clean(req.body.managerRemarks);
      }
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: "rejected",
        title: "Booking Declined",
        timestamp: nowTs,
        actor: actorRole === "admin" ? "Admin" : "Manager",
        note: existing.managerRemarks || "Booking declined by management.",
      });
      applyCancellationFinancialEffects(existing, {
        isVoid: false,
        reason: existing.managerRemarks || "Booking declined by management.",
        actorName: clean(req.user?.fullName || actorEmail) || (actorRole === "admin" ? "Admin" : "Manager"),
        nowTs,
      });
    } else if (newStatus === "Cancelled") {
      existing.cancellationRequested = false;
      existing.cancelledAt = nowTs;
      const isVoid = isManagerOrAdmin && (isVoidRequested || previousStatus !== "Pending");
      const reason =
        clean(req.body.voidReason || req.body.reason || req.body.cancellationReason || existing.cancellationReason) ||
        (isVoid ? "Voided by manager" : "Cancelled by member");
      existing.cancellationReason = reason;
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: isVoid ? "voided" : "cancelled",
        title: isVoid ? "Booking Voided by Manager" : "Booking Cancelled",
        timestamp: nowTs,
        actor: isManagerOrAdmin ? clean(req.user?.fullName || actorEmail) || "Manager" : "Member",
        note: `Reason: ${reason}`,
      });
      applyCancellationFinancialEffects(existing, {
        isVoid,
        reason,
        actorName: clean(req.user?.fullName || actorEmail) || (isManagerOrAdmin ? "Manager" : "Member"),
        nowTs,
      });
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
    const isVoid = isManagerOrAdmin && newStatus === "Cancelled" && (isVoidRequested || previousStatus !== "Pending");
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

    // Dispatch OneSignal Web Push notification to member
    if (previousStatus !== newStatus) {
      oneSignalService.sendBookingStatusPush(existing, newStatus, existing.managerRemarks || existing.cancellationReason).catch((err) => {
        console.warn("[OneSignal] Background booking status push error:", err.message);
      });
    }

    res.json(existing);
  } catch (error) {
    console.error("Error updating application:", error);
    res.status(500).json({ error: "Failed to update application." });
  }
};

router.patch("/applications/:id", authenticate, handleApplicationUpdate);
router.put("/applications/:id", authenticate, handleApplicationUpdate);

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
      const nowTs = new Date();
      existing.cancelledAt = nowTs;
      const reason = clean(req.body?.reason || req.query?.reason) || "Direct cancellation by member";
      existing.cancellationReason = reason;
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: "cancelled",
        title: "Booking Cancelled",
        timestamp: nowTs,
        actor: "Member",
        note: `Reason: ${reason}`,
      });
      applyCancellationFinancialEffects(existing, {
        isVoid: false,
        reason,
        actorName: clean(req.user?.fullName || actorEmail) || "Member",
        nowTs,
      });
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
          cancelledAt: nowTs.toISOString(),
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
      const nowTs = new Date();
      existing.cancellationRequestedAt = nowTs;
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: "cancellation_requested",
        title: "Cancellation Requested",
        timestamp: nowTs,
        actor: "Member",
        note: `Reason: ${existing.cancellationReason}`,
      });
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
      const nowTs = new Date();
      existing.cancelledAt = nowTs;
      const reason = clean(req.body?.reason) || "Member cancelled booking request";
      existing.cancellationReason = reason;
      if (!existing.timeline) existing.timeline = [];
      existing.timeline.push({
        event: "cancelled",
        title: "Booking Cancelled",
        timestamp: nowTs,
        actor: "Member",
        note: `Reason: ${reason}`,
      });
      applyCancellationFinancialEffects(existing, {
        isVoid: false,
        reason,
        actorName: clean(req.user?.fullName || actorEmail) || "Member",
        nowTs,
      });
      await existing.save();

      await logAudit({
        action: "BOOKING_CANCELLED",
        module: "Bookings",
        actorEmail,
        actorName: req.user?.fullName || "",
        actorRole: req.user?.role || "member",
        actorId: req.user?._id,
        affectedRecord: `Booking #${existing.id} (${existing.equipment})`,
        targetEmail: existing.memberEmail,
        targetName: existing.memberName,
        targetRole: "member",
        details: {
          applicationId: existing.id,
          equipment: existing.equipment,
          dateRange: `${existing.startDate} – ${existing.endDate}`,
          reason,
        },
        req,
      });

      return res.json({ ok: true, direct: true, message: "Booking request cancelled successfully.", application: existing });
    }

    if (existing.status !== "Approved") {
      return fail(res, 400, `Cannot request cancellation for booking with status "${existing.status}".`);
    }

    const nowTs = new Date();
    existing.status = "Cancellation Requested";
    existing.cancellationRequested = true;
    existing.cancellationReason = clean(req.body.reason) || "Member requested cancellation";
    existing.cancellationRequestedAt = nowTs;
    if (!existing.timeline) existing.timeline = [];
    existing.timeline.push({
      event: "cancellation_requested",
      title: "Cancellation Requested",
      timestamp: nowTs,
      actor: "Member",
      note: `Reason: ${existing.cancellationReason}`,
    });
    await existing.save();

    await logAudit({
      action: "BOOKING_CANCELLATION_REQUESTED",
      module: "Bookings",
      actorEmail,
      actorName: req.user?.fullName || "",
      actorRole: req.user?.role || "member",
      actorId: req.user?._id,
      affectedRecord: `Booking #${existing.id} (${existing.equipment})`,
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
    const nowTs = new Date();
    existing.cancelledAt = nowTs;
    existing.managerRemarks = "Cancellation granted by manager.";
    if (!existing.timeline) existing.timeline = [];
    existing.timeline.push({
      event: "cancellation_granted",
      title: "Cancellation Granted by Manager",
      timestamp: nowTs,
      actor: clean(req.user?.fullName || req.user?.email) || "Manager",
      note: existing.cancellationReason ? `Cancellation granted. Reason: ${existing.cancellationReason}` : "Cancellation granted by manager.",
    });
    applyCancellationFinancialEffects(existing, {
      isVoid: false,
      reason: existing.cancellationReason || "Cancellation granted by manager",
      actorName: clean(req.user?.fullName || req.user?.email) || "Manager",
      nowTs,
    });
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

    oneSignalService.sendBookingStatusPush(existing, "Cancellation Granted").catch((err) => {
      console.warn("[OneSignal] Background grant cancellation push error:", err.message);
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
    const nowTs = new Date();
    if (!existing.timeline) existing.timeline = [];
    existing.timeline.push({
      event: "cancellation_declined",
      title: "Cancellation Declined by Manager",
      timestamp: nowTs,
      actor: "Manager",
      note: `Declined: ${reason}`,
    });
    await existing.save();

    // Notify member
    await Notification.create({
      memberEmail: existing.memberEmail,
      title: "Cancellation Request Declined",
      message: `Your cancellation request for ${existing.equipment} was declined by the manager: ${reason}`,
      type: "alert",
      relatedApplicationId: existing._id,
    });

    oneSignalService.sendBookingStatusPush(existing, "Cancellation Declined", reason).catch((err) => {
      console.warn("[OneSignal] Background decline cancellation push error:", err.message);
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
      application.dispatchedAt = inspectionData.inspectedAt;
      if (!application.timeline) application.timeline = [];
      application.timeline.push({
        event: "dispatched",
        title: "Machinery Given / Dispatched",
        timestamp: inspectionData.inspectedAt,
        actor: "Manager",
        note: `Pre-rental checkout inspection passed (${inspectionData.fuelLevel} fuel, ${inspectionData.odometerHours} hrs). Machinery given and handed over to driver/operator.`,
      });
    } else {
      application.checkinInspection = inspectionData;
      application.status = "Returned";
      application.returnedAt = inspectionData.inspectedAt;
      if (!application.timeline) application.timeline = [];
      application.timeline.push({
        event: "returned",
        title: "Machinery Returned & Inspected",
        timestamp: inspectionData.inspectedAt,
        actor: "Manager",
        note: `Post-rental check-in completed (${inspectionData.fuelLevel} fuel, ${inspectionData.odometerHours} hrs). Notes: ${inspectionData.notes}`,
      });
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

// Record an actual payment received for a booking (supports multiple installments, down payments, final payments)
router.post("/applications/:id/payments", authManager, async (req, res) => {
  try {
    const existing = await findApplicationByAnyId(req.params.id);
    if (!existing) return fail(res, 404, "Booking record not found.");

    const result = await recordApplicationPayment(existing, req);
    if (!result.ok) {
      return fail(res, result.status || 400, result.error);
    }

    return res.status(result.deduplicated ? 200 : 201).json({
      ok: true,
      deduplicated: Boolean(result.deduplicated),
      message: result.deduplicated
        ? "Duplicate payment request ignored."
        : `Recorded payment of ₱${Number(result.paymentEntry?.amount || 0).toLocaleString()}.`,
      paymentEntry: result.paymentEntry,
      application: existing,
    });
  } catch (error) {
    console.error("Error recording booking payment:", error);
    return res.status(500).json({ error: "Failed to record payment transaction." });
  }
});

// Void an incorrect payment transaction in paymentHistory and recalculate balances
router.post("/applications/:id/void-payment", authManager, async (req, res) => {
  try {
    const existing = await findApplicationByAnyId(req.params.id);
    if (!existing) return fail(res, 404, "Booking record not found.");
    if (!existing.financials) existing.financials = {};
    if (!Array.isArray(existing.paymentHistory)) existing.paymentHistory = [];
    if (!Array.isArray(existing.refunds)) existing.refunds = [];
    if (!Array.isArray(existing.timeline)) existing.timeline = [];

    const idempotencyKey = getRequestIdempotencyKey(req);
    if (hasProcessedRequest(existing, idempotencyKey)) {
      return res.json({
        ok: true,
        deduplicated: true,
        message: "Duplicate void request ignored.",
        application: existing,
      });
    }

    const reason = clean(req.body.reason);
    if (!reason) {
      return fail(res, 400, "A reason is required to void a payment transaction.");
    }

    const voidedBy = clean(req.user?.fullName || req.user?.email) || "Manager";
    const now = new Date();
    const preSummary = computePaymentSummary(existing);

    let target = null;
    if (req.body.entryId) {
      target = existing.paymentHistory.find((entry) => String(entry._id) === String(req.body.entryId));
    }
    if (!target && req.body.index !== undefined && req.body.index !== null) {
      const idx = Number(req.body.index);
      if (Number.isInteger(idx) && idx >= 0 && idx < existing.paymentHistory.length) {
        target = existing.paymentHistory[idx];
      }
    }

    let voidedAmount = 0;
    let voidedReceiptNo = "";
    let linkedRefunds = [];
    const refundReviewed = Boolean(req.body.refundReviewed);
    const refundReviewNote = clean(req.body.refundReviewNote);

    if (target) {
      if (target.isVoided) {
        return fail(res, 400, "This payment transaction has already been voided.");
      }

      linkedRefunds = findLinkedRefundsForPayment(existing, target);
      if (linkedRefunds.length > 0 && !refundReviewed) {
        return res.status(409).json({
          error: `This payment (${target.receiptNo || "entry"}) has ${linkedRefunds.length} linked refund record(s). Manager review is required before voiding.`,
          code: "LINKED_REFUND_REVIEW_REQUIRED",
          linkedRefunds,
        });
      }
      if (linkedRefunds.length > 0 && !refundReviewNote) {
        return fail(res, 400, "Please provide a refund review note confirming how linked refunds were reviewed.");
      }

      voidedAmount = Number(target.amount) || 0;
      voidedReceiptNo = clean(target.receiptNo) || existing.receiptNo || "";
      target.isVoided = true;
      target.voidedAt = now;
      target.voidedBy = voidedBy;
      target.voidReason = reason;
      if (linkedRefunds.length > 0) {
        target.linkedRefundReviewNote = refundReviewNote;
      }
      if (target.flaggedForReview) {
        target.reviewStatus = "voided";
        target.reviewedBy = voidedBy;
        target.reviewedAt = now;
        target.reviewNote = reason;
      }
    } else if (
      existing.paymentHistory.length === 0 &&
      (req.body.legacyFallback || preSummary.grossPaid > 0)
    ) {
      const prevPaid = preSummary.grossPaid;
      if (prevPaid <= 0) {
        return fail(res, 404, "No recorded payment amount found to void.");
      }
      voidedAmount = prevPaid;
      voidedReceiptNo =
        clean(existing.receiptNo) ||
        `OR-${now.getFullYear()}-${String(existing._id).slice(-4).toUpperCase()}`;
      existing.paymentHistory.push({
        receiptNo: voidedReceiptNo,
        amount: prevPaid,
        paymentMethod: existing.paymentMethod || "Cash",
        referenceNumber: existing.paymentReference || "",
        dateTime: existing.paymentDateTime || existing.createdAt?.toISOString() || now.toISOString(),
        receivedBy: existing.receivedBy || "System",
        recordedAt: existing.createdAt || now,
        isVoided: true,
        voidedAt: now,
        voidedBy,
        voidReason: reason,
        reviewStatus: "voided",
      });
    } else {
      return fail(res, 404, "Payment history transaction was not found.");
    }

    // Re-evaluate refundDetermination if voiding cleared all collected funds on a closed booking
    const intermediateSummary = computePaymentSummary(existing);
    if (intermediateSummary.isClosedBooking && intermediateSummary.grossPaid === 0 && intermediateSummary.totalRefunded === 0) {
      existing.refundDetermination = "not_applicable";
    }

    recordProcessedRequest(existing, idempotencyKey);
    const postSummary = syncApplicationFinancials(existing);

    existing.timeline.push({
      event: "payment_voided",
      title: "Payment Transaction Voided",
      timestamp: now,
      actor: voidedBy,
      note: `Voided ₱${voidedAmount.toLocaleString()} (${voidedReceiptNo || "OR"}). Reason: ${reason}${refundReviewNote ? ` · Linked Refund Review: ${refundReviewNote}` : ""}. Total Paid: ₱${postSummary.grossPaid.toLocaleString()} · Balance Due: ₱${postSummary.balanceDue.toLocaleString()}.`,
    });

    await existing.save();

    await logAudit({
      action: "PAYMENT_VOIDED",
      actorEmail: cleanEmail(req.user?.email || "manager"),
      actorRole: clean(req.user?.role || "manager"),
      actorId: req.user?._id,
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      details: {
        applicationId: existing.id,
        voidedAmount,
        voidedReceiptNo,
        remainingPaid: postSummary.grossPaid,
        remainingBalance: postSummary.balanceDue,
        paymentStatus: postSummary.paymentStatus,
        reason,
        linkedRefundCount: linkedRefunds.length,
        refundReviewNote: refundReviewNote || undefined,
      },
      req,
    });

    try {
      await Notification.create({
        memberEmail: existing.memberEmail,
        title: "Payment Transaction Voided",
        message: `A payment entry of ₱${voidedAmount.toLocaleString()} (${voidedReceiptNo || "OR"}) for ${existing.equipment} was voided by ${voidedBy} (${reason}). Remaining balance: ₱${postSummary.balanceDue.toLocaleString()}.`,
        type: "booking",
        relatedApplicationId: existing._id,
      });
    } catch (notifErr) {
      console.warn("Could not notify member of voided payment:", notifErr.message);
    }

    return res.json({
      ok: true,
      message: `Voided payment of ₱${voidedAmount.toLocaleString()}.`,
      application: existing,
    });
  } catch (error) {
    console.error("Error voiding payment transaction:", error);
    return res.status(500).json({ error: "Failed to void payment transaction." });
  }
});

// KIMPC Refund Determination for cancelled or voided bookings with collected funds
router.post("/applications/:id/refund-determination", authManager, async (req, res) => {
  try {
    const existing = await findApplicationByAnyId(req.params.id);
    if (!existing) return fail(res, 404, "Booking record not found.");
    if (!Array.isArray(existing.timeline)) existing.timeline = [];

    const idempotencyKey = getRequestIdempotencyKey(req);
    if (hasProcessedRequest(existing, idempotencyKey)) {
      return res.json({
        ok: true,
        deduplicated: true,
        message: "Duplicate refund determination ignored.",
        application: existing,
      });
    }

    const summary = computePaymentSummary(existing);
    if (!summary.isClosedBooking) {
      return fail(res, 400, "Refund determination only applies to cancelled, rejected, or voided bookings.");
    }

    const decision = clean(req.body.decision);
    if (!["refund_due", "no_refund"].includes(decision)) {
      return fail(res, 400, 'Invalid decision. Choose "refund_due" or "no_refund".');
    }

    if (req.body.cancellationFee !== undefined && req.body.cancellationFee !== "") {
      const fee = Number(req.body.cancellationFee);
      if (!Number.isFinite(fee) || fee < 0) {
        return fail(res, 400, "Cancellation fee must be a valid non-negative amount.");
      }
      if (summary.grossPaid > 0 && round2(fee) > summary.grossPaid && decision === "refund_due") {
        return fail(res, 400, "Cancellation fee cannot exceed collected amount when marking refund due.");
      }
      existing.cancellationFee = round2(fee);
    }

    const updatedPreRefund = computePaymentSummary(existing);
    if (decision === "refund_due" && updatedPreRefund.grossPaid <= 0) {
      return fail(res, 400, "Cannot mark refund due on a booking with zero collected payments.");
    }
    if (decision === "refund_due" && updatedPreRefund.refundableCap <= 0) {
      return fail(res, 400, "Refundable amount is ₱0 after cancellation fee deduction.");
    }

    const managerName = clean(req.user?.fullName || req.user?.email) || "Manager";
    const note = clean(req.body.note || req.body.reason);
    const now = new Date();

    existing.refundDetermination = decision;
    existing.refundDecisionNote = note;
    existing.refundDecidedBy = managerName;
    existing.refundDecidedAt = now;

    recordProcessedRequest(existing, idempotencyKey);
    const postSummary = syncApplicationFinancials(existing);

    existing.timeline.push({
      event: "refund_determined",
      title: decision === "refund_due" ? "KIMPC Determined Refund Due" : "KIMPC Determined No Refund Due",
      timestamp: now,
      actor: managerName,
      note: `${decision === "refund_due" ? `Refund Pending: ₱${postSummary.refundDueRemaining.toLocaleString()}` : "No refund due for this cancellation"}${existing.cancellationFee > 0 ? ` · Cancellation Fee: ₱${existing.cancellationFee.toLocaleString()}` : ""}${note ? ` · ${note}` : ""}.`,
    });

    await existing.save();

    await logAudit({
      action: "REFUND_DETERMINATION_UPDATED",
      actorEmail: cleanEmail(req.user?.email || "manager"),
      actorRole: clean(req.user?.role || "manager"),
      actorId: req.user?._id,
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      details: {
        applicationId: existing.id,
        decision,
        cancellationFee: existing.cancellationFee,
        refundDueRemaining: postSummary.refundDueRemaining,
        paymentStatus: postSummary.paymentStatus,
        note,
      },
      req,
    });

    try {
      await Notification.create({
        memberEmail: existing.memberEmail,
        title: decision === "refund_due" ? "Refund Approved / Pending Processing" : "Cancellation Financial Review Completed",
        message:
          decision === "refund_due"
            ? `KIMPC has approved a refund of ₱${postSummary.refundDueRemaining.toLocaleString()} for your cancelled booking (${existing.equipment}).`
            : `KIMPC reviewed your cancelled booking (${existing.equipment}) and recorded: No Refund Due${note ? ` (${note})` : ""}.`,
        type: "booking",
        relatedApplicationId: existing._id,
      });
    } catch (notifErr) {
      console.warn("Could not notify member of refund determination:", notifErr.message);
    }

    return res.json({
      ok: true,
      message:
        decision === "refund_due"
          ? `Booking marked Refund Pending (₱${postSummary.refundDueRemaining.toLocaleString()} due).`
          : "Recorded decision: No Refund Due.",
      application: existing,
    });
  } catch (error) {
    console.error("Error updating refund determination:", error);
    return res.status(500).json({ error: "Failed to update refund determination." });
  }
});

// Record a refund linked to an original active payment entry
router.post("/applications/:id/refunds", authManager, async (req, res) => {
  try {
    const existing = await findApplicationByAnyId(req.params.id);
    if (!existing) return fail(res, 404, "Booking record not found.");
    if (!Array.isArray(existing.paymentHistory)) existing.paymentHistory = [];
    if (!Array.isArray(existing.refunds)) existing.refunds = [];
    if (!Array.isArray(existing.timeline)) existing.timeline = [];

    const idempotencyKey = getRequestIdempotencyKey(req);
    if (
      hasProcessedRequest(existing, idempotencyKey) ||
      (idempotencyKey && existing.refunds.some((r) => clean(r.idempotencyKey) === idempotencyKey))
    ) {
      return res.json({
        ok: true,
        deduplicated: true,
        message: "Duplicate refund request ignored.",
        application: existing,
      });
    }

    const preSummary = computePaymentSummary(existing);
    if (preSummary.grossPaid <= 0) {
      return fail(res, 400, "No collected payment found to refund on this booking.");
    }
    if (preSummary.hasFlaggedPayments) {
      return fail(res, 409, "Review and confirm all flagged payments on this voided booking before issuing a refund.");
    }

    const activePayments = existing.paymentHistory.filter((p) => !p.isVoided);
    let linkedPayment = null;
    if (req.body.linkedPaymentId) {
      linkedPayment = existing.paymentHistory.find((p) => String(p._id) === String(req.body.linkedPaymentId));
    } else if (activePayments.length === 1) {
      linkedPayment = activePayments[0];
    }

    if (!linkedPayment) {
      return fail(res, 400, "Select the original payment transaction to link this refund to.");
    }
    if (linkedPayment.isVoided) {
      return fail(res, 400, "Cannot link a refund to a voided payment transaction.");
    }

    const requestedAmount = round2(Number(req.body.amount));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return fail(res, 400, "Refund amount must be greater than ₱0.");
    }

    const refundsForEntry = findLinkedRefundsForPayment(existing, linkedPayment);
    const alreadyRefundedForEntry = round2(
      refundsForEntry.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    );
    const entryRemaining = round2((Number(linkedPayment.amount) || 0) - alreadyRefundedForEntry);

    if (requestedAmount - entryRemaining > 0.01) {
      return fail(
        res,
        400,
        `Refund amount (₱${requestedAmount.toLocaleString()}) exceeds unrefunded balance (₱${entryRemaining.toLocaleString()}) on payment ${linkedPayment.receiptNo || "entry"}.`
      );
    }

    const refundableCapRemaining = preSummary.refundableRemaining ?? Math.max(0, round2(preSummary.refundableCap - preSummary.totalRefunded));
    if (requestedAmount - refundableCapRemaining > 0.01) {
      return fail(
        res,
        400,
        `Refund amount (₱${requestedAmount.toLocaleString()}) exceeds remaining refundable amount (₱${refundableCapRemaining.toLocaleString()}).`
      );
    }

    const reason = clean(req.body.reason);
    if (!reason) {
      return fail(res, 400, "A refund reason is required.");
    }
    const referenceNumber = clean(req.body.referenceNumber);
    if (!referenceNumber) {
      return fail(res, 400, "A refund reference number is required.");
    }

    const now = new Date();
    const refundDate = clean(req.body.refundDate || req.body.dateTime) || now.toISOString();
    const paymentMethod = clean(req.body.paymentMethod) || linkedPayment.paymentMethod || "Cash";
    const recordedBy = clean(req.user?.fullName || req.user?.email) || "Manager";
    if (existing.refundDetermination !== "refund_due") {
      existing.refundDetermination = "refund_due";
      existing.refundDecidedBy = recordedBy;
      existing.refundDecidedAt = now;
    }
    const refundNo =
      clean(req.body.refundNo) ||
      `REF-${now.getFullYear()}-${String(existing._id).slice(-4).toUpperCase()}-${String(existing.refunds.length + 1).padStart(2, "0")}`;

    existing.refunds.push({
      refundNo,
      linkedPaymentId: String(linkedPayment._id),
      linkedReceiptNo: clean(linkedPayment.receiptNo),
      amount: requestedAmount,
      refundDate,
      reason,
      referenceNumber,
      paymentMethod,
      recordedBy,
      recordedAt: now,
      notes: clean(req.body.notes),
      idempotencyKey,
    });

    if (linkedPayment.flaggedForReview && linkedPayment.reviewStatus !== "confirmed_received") {
      linkedPayment.reviewStatus = "confirmed_received";
      linkedPayment.flaggedForReview = false;
      linkedPayment.reviewedBy = recordedBy;
      linkedPayment.reviewedAt = now;
    }

    recordProcessedRequest(existing, idempotencyKey);
    const postSummary = syncApplicationFinancials(existing);

    existing.timeline.push({
      event: "refund_recorded",
      title: `Refund Recorded (${postSummary.paymentStatus})`,
      timestamp: now,
      actor: recordedBy,
      note: `Refunded ₱${requestedAmount.toLocaleString()} against ${linkedPayment.receiptNo || "original payment"} (${paymentMethod}). Ref: ${referenceNumber} · Reason: ${reason}. Total Refunded: ₱${postSummary.totalRefunded.toLocaleString()} of ₱${postSummary.grossPaid.toLocaleString()}.`,
    });

    await existing.save();
    const createdRefund = existing.refunds[existing.refunds.length - 1];

    await logAudit({
      action: "REFUND_RECORDED",
      actorEmail: cleanEmail(req.user?.email || "manager"),
      actorRole: clean(req.user?.role || "manager"),
      actorId: req.user?._id,
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      targetRole: "member",
      details: {
        applicationId: existing.id,
        refundNo,
        linkedPaymentId: String(linkedPayment._id),
        linkedReceiptNo: linkedPayment.receiptNo,
        amount: requestedAmount,
        refundDate,
        referenceNumber,
        reason,
        recordedBy,
        totalRefunded: postSummary.totalRefunded,
        paymentStatus: postSummary.paymentStatus,
      },
      req,
    });

    try {
      await Notification.create({
        memberEmail: existing.memberEmail,
        title: "Refund Issued",
        message: `A refund of ₱${requestedAmount.toLocaleString()} (${refundNo}, Ref: ${referenceNumber}) for ${existing.equipment} has been recorded by ${recordedBy}. Status: ${postSummary.paymentStatus}.`,
        type: "booking",
        relatedApplicationId: existing._id,
      });
    } catch (notifErr) {
      console.warn("Could not notify member of recorded refund:", notifErr.message);
    }

    return res.status(201).json({
      ok: true,
      message: `Recorded refund of ₱${requestedAmount.toLocaleString()} (${postSummary.paymentStatus}).`,
      refundEntry: createdRefund,
      application: existing,
    });
  } catch (error) {
    console.error("Error recording refund:", error);
    return res.status(500).json({ error: "Failed to record refund." });
  }
});

// Manager Review of Payments Flagged When a Booking Was Voided
router.post("/applications/:id/review-flagged-payment", authManager, async (req, res) => {
  try {
    const existing = await findApplicationByAnyId(req.params.id);
    if (!existing) return fail(res, 404, "Booking record not found.");
    if (!Array.isArray(existing.paymentHistory)) existing.paymentHistory = [];
    if (!Array.isArray(existing.timeline)) existing.timeline = [];

    const idempotencyKey = getRequestIdempotencyKey(req);
    if (hasProcessedRequest(existing, idempotencyKey)) {
      return res.json({
        ok: true,
        deduplicated: true,
        message: "Duplicate review request ignored.",
        application: existing,
      });
    }

    const outcome = clean(req.body.outcome);
    if (!["confirmed_received", "not_received_void"].includes(outcome)) {
      return fail(res, 400, 'Invalid outcome. Choose "confirmed_received" or "not_received_void".');
    }

    let target = null;
    if (req.body.entryId) {
      target = existing.paymentHistory.find((p) => String(p._id) === String(req.body.entryId));
    } else if (req.body.index !== undefined && req.body.index !== null) {
      const idx = Number(req.body.index);
      if (Number.isInteger(idx) && idx >= 0 && idx < existing.paymentHistory.length) {
        target = existing.paymentHistory[idx];
      }
    }
    if (!target) {
      return fail(res, 404, "Payment transaction was not found.");
    }
    if (target.isVoided) {
      return fail(res, 400, "This payment transaction is already voided.");
    }

    const managerName = clean(req.user?.fullName || req.user?.email) || "Manager";
    const now = new Date();
    const note = clean(req.body.note || req.body.reason);

    if (outcome === "confirmed_received") {
      target.reviewStatus = "confirmed_received";
      target.flaggedForReview = false;
      target.reviewedBy = managerName;
      target.reviewedAt = now;
      target.reviewNote = note || "Confirmed funds actually received by KIMPC.";

      const optionalRefundDecision = clean(req.body.refundDecision);
      if (["refund_due", "no_refund"].includes(optionalRefundDecision)) {
        existing.refundDetermination = optionalRefundDecision;
        existing.refundDecidedBy = managerName;
        existing.refundDecidedAt = now;
        existing.refundDecisionNote = note;
      }

      recordProcessedRequest(existing, idempotencyKey);
      const postSummary = syncApplicationFinancials(existing);

      existing.timeline.push({
        event: "payment_review_confirmed",
        title: "Flagged Payment Confirmed as Received",
        timestamp: now,
        actor: managerName,
        note: `Confirmed ₱${Number(target.amount || 0).toLocaleString()} (${target.receiptNo || "OR"}) was received.${note ? ` Note: ${note}` : ""} Payment Status: ${postSummary.paymentStatus}.`,
      });

      await existing.save();

      await logAudit({
        action: "FLAGGED_PAYMENT_CONFIRMED",
        actorEmail: cleanEmail(req.user?.email || "manager"),
        actorRole: clean(req.user?.role || "manager"),
        actorId: req.user?._id,
        targetEmail: existing.memberEmail,
        targetName: existing.memberName,
        details: {
          applicationId: existing.id,
          receiptNo: target.receiptNo,
          amount: target.amount,
          refundDecision: existing.refundDetermination,
          note,
        },
        req,
      });

      return res.json({
        ok: true,
        message: `Confirmed payment ${target.receiptNo || "entry"} was received.`,
        application: existing,
      });
    }

    // outcome === "not_received_void"
    if (!note) {
      return fail(res, 400, "A reason is required to void an uncollected/mistaken flagged payment.");
    }
    const linkedRefunds = findLinkedRefundsForPayment(existing, target);
    if (linkedRefunds.length > 0 && !req.body.refundReviewed) {
      return res.status(409).json({
        error: "This flagged payment has linked refunds. Review linked refunds before voiding.",
        code: "LINKED_REFUND_REVIEW_REQUIRED",
        linkedRefunds,
      });
    }

    target.isVoided = true;
    target.voidedAt = now;
    target.voidedBy = managerName;
    target.voidReason = note;
    target.reviewStatus = "voided";
    target.flaggedForReview = false;
    target.reviewedBy = managerName;
    target.reviewedAt = now;
    target.reviewNote = note;

    const midSummary = computePaymentSummary(existing);
    if (midSummary.isClosedBooking && midSummary.grossPaid === 0 && midSummary.totalRefunded === 0) {
      existing.refundDetermination = "not_applicable";
    }

    recordProcessedRequest(existing, idempotencyKey);
    const postSummary = syncApplicationFinancials(existing);

    existing.timeline.push({
      event: "flagged_payment_voided",
      title: "Flagged Payment Voided After Review",
      timestamp: now,
      actor: managerName,
      note: `Voided ₱${Number(target.amount || 0).toLocaleString()} (${target.receiptNo || "OR"}) on voided booking. Reason: ${note}. Balance Due: ₱${postSummary.balanceDue.toLocaleString()}.`,
    });

    await existing.save();

    await logAudit({
      action: "FLAGGED_PAYMENT_VOIDED",
      actorEmail: cleanEmail(req.user?.email || "manager"),
      actorRole: clean(req.user?.role || "manager"),
      actorId: req.user?._id,
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      details: {
        applicationId: existing.id,
        receiptNo: target.receiptNo,
        amount: target.amount,
        reason: note,
        paymentStatus: postSummary.paymentStatus,
      },
      req,
    });

    return res.json({
      ok: true,
      message: `Voided flagged payment of ₱${Number(target.amount || 0).toLocaleString()}.`,
      application: existing,
    });
  } catch (error) {
    console.error("Error reviewing flagged payment:", error);
    return res.status(500).json({ error: "Failed to review flagged payment." });
  }
});

module.exports = router;
