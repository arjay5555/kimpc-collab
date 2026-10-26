const express = require("express");
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

module.exports = router;
