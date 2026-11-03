const express = require("express");
const mongoose = require("mongoose");
const SupportMessage = require("../models/SupportMessage");
const Notification = require("../models/Notification");
const { clean, fail } = require("./routeHelpers");

const {
  getCalendarEvents,
  listBookings,
  approveBooking,
  rejectBooking,
  resolveBookingConflict,
  extendBooking
} = require("../controllers/managerController");
const {
  getDashboardMetrics,
  getMachineryUtilization,
  getFieldIssues,
  getRevenueReport
} = require("../controllers/managerAnalyticsController");
const {
  createMachinery,
  updateMachineryPricing,
  archiveMachinery,
  listMaintenanceLogs,
  createMaintenanceLog,
  listUsageLogs,
  createUsageLog
} = require("../controllers/managerMachineryController");

const router = express.Router();

router.get("/calendar/events", getCalendarEvents);
router.get("/bookings", listBookings);
router.patch("/bookings/:id/approve", approveBooking);
router.patch("/bookings/:id/reject", rejectBooking);
router.patch("/bookings/:id/resolve", resolveBookingConflict);
router.patch("/bookings/:id/extend", extendBooking);

router.get("/dashboard/metrics", getDashboardMetrics);
router.get("/utilization", getMachineryUtilization);
router.get("/field-issues", getFieldIssues);
router.get("/reports/revenue/:period", getRevenueReport);

router.post("/machinery", createMachinery);
router.patch("/machinery/:id/pricing", updateMachineryPricing);
router.patch("/machinery/:id/archive", archiveMachinery);
router.get("/machinery/:id/maintenance-logs", listMaintenanceLogs);
router.post("/machinery/:id/maintenance-logs", createMaintenanceLog);
router.get("/machinery/:id/usage-logs", listUsageLogs);
router.post("/machinery/:id/usage-logs", createUsageLog);

// ==========================================
// Manager Member Messages & Inquiries
// ==========================================

// List all member inquiries/questions
router.get("/messages", async (req, res) => {
  try {
    const messages = await SupportMessage.find().sort({ createdAt: -1 }).lean();
    const unreadCount = messages.filter((m) => m.status === "unread").length;
    res.json({ ok: true, messages, unreadCount });
  } catch (err) {
    console.error("Error loading manager messages:", err);
    res.status(500).json({ error: "Failed to load messages." });
  }
});

// Reply to a member inquiry
router.patch("/messages/:id/reply", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid message id.");
    const reply = clean(req.body.reply);
    if (!reply) return fail(res, 400, "Reply message is required.");

    const msg = await SupportMessage.findById(req.params.id);
    if (!msg) return fail(res, 404, "Message not found.");

    msg.reply = reply;
    msg.repliedBy = req.user?.fullName || req.user?.email || "Cooperative Manager";
    msg.repliedAt = new Date();
    msg.status = "replied";
    await msg.save();

    // Send in-app notification to the member
    await Notification.create({
      memberEmail: msg.memberEmail,
      title: `Manager Reply: ${msg.subject}`,
      message: reply,
      type: "system",
    });

    res.json({ ok: true, message: "Reply sent to member successfully.", data: msg });
  } catch (err) {
    console.error("Error replying to message:", err);
    res.status(500).json({ error: "Failed to send reply." });
  }
});

// Mark message as read
router.patch("/messages/:id/read", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid message id.");
    const msg = await SupportMessage.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "read" } },
      { new: true }
    );
    if (!msg) return fail(res, 404, "Message not found.");
    res.json({ ok: true, data: msg });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read." });
  }
});

// Delete message
router.delete("/messages/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid message id.");
    await SupportMessage.findByIdAndDelete(req.params.id);
    res.json({ ok: true, message: "Message deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete message." });
  }
});

module.exports = router;
