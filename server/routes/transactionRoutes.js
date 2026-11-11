const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Application = require("../models/Application");
const Transaction = require("../models/Transaction");
const MachineryMaintenance = require("../models/MachineryMaintenance");

const authManager = require("../middleware/authManager");
const { logAudit } = require("../services/auditLogger");
const { clean, cleanEmail, fail, isSameMachineryMatch } = require("./routeHelpers");

/**
 * POST /api/pos-booking and /api/manager/pos-booking
 * Walk-in terminal booking for farmers without online accounts.
 */
const handlePosBooking = async (req, res) => {
  try {
    const farmerName = clean(req.body.farmerName);
    const farmerPhone = clean(req.body.farmerPhone);
    const coopId = clean(req.body.coopId) || "WALK-IN";
    const equipment = clean(req.body.equipment);
    const machineryUnitId = clean(req.body.machineryUnitId) || "";
    const startDate = clean(req.body.startDate);
    const endDate = clean(req.body.endDate);
    const rentalType = clean(req.body.rentalType) || "day";
    const rate = Number(req.body.rate) || Number(req.body.dailyRate) || 120;
    let computedDays = Number(req.body.rentalDays);
    if (!Number.isFinite(computedDays) || computedDays <= 0) {
      const startMs = new Date(`${startDate}T00:00:00`).getTime();
      const endMs = new Date(`${endDate}T00:00:00`).getTime();
      const diff = Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.round((endMs - startMs) / 86400000) + 1
        : 1;
      computedDays = diff > 0 ? diff : 1;
    }
    const rentalDays = Math.max(computedDays, 1);
    const rentalHours = Math.max(Number(req.body.rentalHours) || 1, 1);
    const paymentMethod = clean(req.body.paymentMethod) || "Cash";
    const managerEmail = cleanEmail(req.body.managerEmail || req.user?.email || "manager@coop.local");
    const isPaidNow =
      req.body.isPaid === true ||
      String(req.body.paymentStatus || "").trim().toLowerCase() === "paid";

    if (!farmerName || !equipment || !startDate || !endDate) {
      return fail(res, 400, "Farmer name, machinery, and valid dates are required.");
    }

    // Date validation: cannot rent if date is in the past ("done")
    const today = new Date().toISOString().slice(0, 10);
    if (startDate < today) {
      return fail(res, 400, "Cannot book for a past date. The date has already passed.");
    }
    if (endDate < startDate) {
      return fail(res, 400, "Rental end date cannot be earlier than start date.");
    }

    // Overlap verification with Out of Service records
    const allMaintenances = await MachineryMaintenance.find({
      status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });
    const maintenanceConflict = allMaintenances.find((m) =>
      isSameMachineryMatch(m.equipmentUnitId, m.equipmentName, machineryUnitId, equipment)
    );

    if (maintenanceConflict) {
      return fail(
        res,
        409,
        `Equipment "${equipment}" is Out of Service (${maintenanceConflict.startDate} to ${maintenanceConflict.endDate}). Cannot book for these dates.`
      );
    }

    // Overlap verification with existing bookings for this unit (Quantity: 1 per unit)
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
        `Equipment "${equipment}" (Quantity: 1) is already booked by ${bookingConflict.memberName} from ${bookingConflict.startDate} to ${bookingConflict.endDate}. Please select other dates.`
      );
    }

    const rentalFee = rentalType === "hour" ? (rate * rentalHours) : (rate * rentalDays);
    const totalPaid = isPaidNow ? rentalFee : 0;

    const durationLabel = rentalType === "hour"
      ? `${rentalHours} hr${rentalHours === 1 ? "" : "s"} @ ₱${rate}/hr`
      : `${rentalDays} day${rentalDays === 1 ? "" : "s"} @ ₱${rate}/day`;

    // Create walk-in application (unpaid/Pending unless explicitly marked paid)
    const app = await Application.create({
      memberEmail: `walkin.${Date.now()}@coop.local`,
      memberName: `${farmerName} (${coopId})`,
      equipment,
      machineryUnitId,
      startDate,
      endDate,
      totalAmount: rentalFee,
      ratePerHectare: rentalType === "day" ? rate : 0,
      paymentStatus: isPaidNow ? "Paid" : "Pending",
      paymentAmount: totalPaid,
      paymentMethod,
      status: "Approved",
      isWalkIn: true,
      farmerPhone,
      financials: {
        dailyRate: rate,
        deposit: 0,
        totalPaid,
        paymentMethod,
        isSettled: isPaidNow,
      },
    });

    // Only log cash ledger revenue immediately when payment is collected upfront
    const txId = isPaidNow ? `TX-${Date.now().toString().slice(-6)}` : "";
    if (isPaidNow) {
      await Transaction.create({
        txId,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        farmer: farmerName,
        equipment,
        type: "Rental Fee",
        amount: totalPaid,
        paymentMethod,
        notes: `Walk-in Rental (${durationLabel}) - Zero Security Deposit`,
      });
    }

    await logAudit({
      action: "POS_WALKIN_BOOKING_CREATED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: {
        farmerName,
        equipment,
        machineryUnitId,
        rentalType,
        durationLabel,
        totalCashCollected: totalPaid,
        deposit: 0,
        contractId: app.displayId,
      },
      req,
    });

    res.status(201).json({
      ok: true,
      application: app,
      txId,
      totalCollected: totalPaid,
      message: isPaidNow
        ? `Walk-in rental booking registered. Receipt #${txId} generated.`
        : `Walk-in rental booking registered. Payment status is Pending.`,
    });
  } catch (error) {
    console.error("Error creating POS booking:", error);
    res.status(500).json({ error: "Failed to create POS walk-in booking." });
  }
};

router.post("/pos-booking", handlePosBooking);
router.post("/manager/pos-booking", handlePosBooking);

/**
 * POST /api/manager/pos-settlement
 * Return settlement: late fee, repair deduction, fuel shortage, refund calculation.
 */
router.post("/manager/pos-settlement", authManager, async (req, res) => {
  try {
    const rentalId = clean(req.body.rentalId);
    const initialDeposit = Number(req.body.initialDeposit) || 0;
    const lateDays = Number(req.body.lateDays) || 0;
    const lateFeePerDay = Number(req.body.lateFeePerDay) || 40;
    const repairCost = Number(req.body.repairCost) || 0;
    const fuelCharge = Number(req.body.fuelCharge) || 0;
    const deductionNotes = clean(req.body.deductionNotes);
    const managerEmail = req.user?.email || "manager";

    const totalLateFee = lateDays * lateFeePerDay;
    const totalDeductions = totalLateFee + repairCost + fuelCharge;
    const netRefundOrDue = initialDeposit - totalDeductions;
    const isRefund = netRefundOrDue >= 0;

    // Record ledger transactions for deductions
    if (totalLateFee > 0) {
      await Transaction.create({
        txId: `TX-${Date.now().toString().slice(-6)}-L`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        farmer: rentalId,
        equipment: "Return Overdue",
        type: "Late Fee",
        amount: totalLateFee,
        paymentMethod: "Cash",
        notes: `${lateDays} days overdue @ ₱${lateFeePerDay}/day`,
      });
    }

    if (repairCost > 0) {
      await Transaction.create({
        txId: `TX-${Date.now().toString().slice(-6)}-R`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        farmer: rentalId,
        equipment: "Damage Repair",
        type: "Damage Charge",
        amount: repairCost,
        paymentMethod: "Cash",
        notes: deductionNotes || "Repair parts deduction",
      });
    }

    // Update application record if valid ObjectId (do not override payment settlement status on return)
    if (mongoose.isValidObjectId(rentalId)) {
      await Application.findByIdAndUpdate(rentalId, {
        status: "Returned",
        "financials.lateFee": totalLateFee,
        "financials.repairDeduction": repairCost,
        "financials.fuelCharge": fuelCharge,
        "financials.refundAmount": isRefund ? netRefundOrDue : 0,
      });
    }

    await logAudit({
      action: "DEPOSIT_SETTLEMENT_FINALIZED",
      actorEmail: managerEmail,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: {
        rentalId,
        initialDeposit,
        totalDeductions,
        netRefundOrDue,
        isRefund,
        deductionNotes,
      },
      req,
    });

    res.json({
      ok: true,
      settlement: {
        rentalId,
        initialDeposit,
        totalLateFee,
        repairCost,
        fuelCharge,
        totalDeductions,
        netOutcome: netRefundOrDue,
        isRefund,
      },
      message: isRefund
        ? `Settlement finalized. Refund ₱${netRefundOrDue.toFixed(2)} to farmer.`
        : `Settlement finalized. Collect ₱${Math.abs(netRefundOrDue).toFixed(2)} balance from farmer.`,
    });
  } catch (error) {
    console.error("Error finalizing POS settlement:", error);
    res.status(500).json({ error: "Failed to finalize settlement." });
  }
});

/**
 * GET /api/manager/transactions
 * Returns daily transaction logs with total cash collected.
 */
router.get("/manager/transactions", async (req, res) => {
  try {
    const txs = await Transaction.find({}).sort({ createdAt: -1 }).limit(100);

    const totalCash = txs
      .filter((t) => t.paymentMethod === "Cash")
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const totalRevenue = txs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    res.json({ transactions: txs, totalCash, totalRevenue });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions." });
  }
});

module.exports = router;

