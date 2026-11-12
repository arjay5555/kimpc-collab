const express = require("express");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const SupportMessage = require("../models/SupportMessage");
const Notification = require("../models/Notification");
const { clean, fail } = require("./routeHelpers");
const { logAudit } = require("../services/auditLogger");
const reportService = require("../services/reportService");

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
router.get("/members", async (req, res) => {
  try {
    const members = await Account.find({
      role: "member",
      isArchived: { $ne: true },
      isSuspended: { $ne: true },
    })
      .select("fullName email phone address address2 city region cooperativeId avatar memberSettings.defaultFarmLocation verificationStatus")
      .sort({ fullName: 1 })
      .lean();

    const formatted = members.map((m) => ({
      id: String(m._id),
      fullName: m.fullName || m.email,
      email: m.email,
      phone: m.phone || "",
      address: [m.address, m.address2, m.city, m.region].filter(Boolean).join(", "),
      defaultFarmLocation: m.memberSettings?.defaultFarmLocation || "",
      cooperativeId: m.cooperativeId || "",
      avatar: m.avatar || "",
      verificationStatus: m.verificationStatus || "pending",
    }));

    res.json({ ok: true, members: formatted });
  } catch (err) {
    console.error("Error fetching cooperative members:", err);
    res.status(500).json({ error: "Failed to fetch member accounts." });
  }
});
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

    // Log audit event
    await logAudit({
      action: "MEMBER_INQUIRY_REPLIED",
      module: "Member Messages",
      actorEmail: req.user?.email || "manager@kimpc.test",
      actorName: req.user?.fullName || "Operations Manager",
      actorRole: req.user?.role || "manager",
      affectedRecord: `${msg.memberName} (${msg.memberEmail}) - "${msg.subject}"`,
      details: `Manager replied to inquiry: "${reply.slice(0, 80)}${reply.length > 80 ? '...' : ''}"`,
      status: "Success",
      req,
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

    await logAudit({
      action: "MEMBER_INQUIRY_READ",
      module: "Member Messages",
      actorEmail: req.user?.email || "manager",
      actorName: req.user?.fullName || "",
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      affectedRecord: `${msg.memberName} (${msg.memberEmail}) - "${msg.subject}"`,
      details: `Marked member inquiry "${msg.subject}" as read.`,
      status: "Success",
      req,
    });

    res.json({ ok: true, data: msg });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read." });
  }
});

// Delete message
router.delete("/messages/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid message id.");
    const deleted = await SupportMessage.findByIdAndDelete(req.params.id);
    if (!deleted) return fail(res, 404, "Message not found.");

    await logAudit({
      action: "MEMBER_INQUIRY_DELETED",
      module: "Member Messages",
      actorEmail: req.user?.email || "manager",
      actorName: req.user?.fullName || "",
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      affectedRecord: `${deleted.memberName} (${deleted.memberEmail}) - "${deleted.subject}"`,
      details: `Deleted member inquiry "${deleted.subject}".`,
      status: "Success",
      req,
    });

    res.json({ ok: true, message: "Message deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete message." });
  }
});

// ==========================================
// MANAGER REPORTS ENDPOINTS
// ==========================================

// Preview Report Data
router.get("/reports/preview", async (req, res) => {
  try {
    const reportData = await reportService.getReportData(req.query);
    res.json({ ok: true, report: reportData });
  } catch (err) {
    console.error("Report preview error:", err);
    res.status(500).json({ ok: false, error: "Failed to generate report preview: " + err.message });
  }
});

// Download Report PDF
router.get("/reports/pdf", async (req, res) => {
  try {
    const reportData = await reportService.getReportData(req.query);
    const cleanTitle = (reportData.reportTitle || "Report").replace(/[^a-zA-Z0-9]/g, "-");
    const filename = `KIMPC-${cleanTitle}-${reportData.period.startDate}-to-${reportData.period.endDate}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const loggedInManager =
      req.user?.fullName ||
      (req.user?.firstName && req.user?.lastName ? `${req.user.firstName} ${req.user.lastName}` : null) ||
      req.user?.name ||
      req.user?.email ||
      (req.user?.role === "admin" ? "System Administrator" : "Operations Manager");

    await logAudit({
      action: "REPORT_PDF_EXPORTED",
      module: "Financial Reports",
      actorEmail: req.user?.email || "system",
      actorName: loggedInManager,
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      affectedRecord: `${reportData.reportTitle || "Report"} (${reportData.period.startDate} to ${reportData.period.endDate})`,
      details: {
        reportType: reportData.reportType,
        startDate: reportData.period.startDate,
        endDate: reportData.period.endDate,
        filename,
      },
      status: "Success",
      req,
    });

    reportService.generateReportPDF(reportData, res, {
      loggedInManager,
    });
  } catch (err) {
    console.error("Report PDF error:", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "Failed to generate report PDF: " + err.message });
    }
  }
});

module.exports = router;
