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

// GET /api/manager/calendar/events - List calendar events for manager views.
router.get("/calendar/events", getCalendarEvents);
// GET /api/manager/bookings - List bookings for manager review.
router.get("/bookings", listBookings);
// PATCH /api/manager/bookings/:id/approve - Approve a booking.
router.patch("/bookings/:id/approve", approveBooking);
// PATCH /api/manager/bookings/:id/reject - Reject a booking.
router.patch("/bookings/:id/reject", rejectBooking);
// PATCH /api/manager/bookings/:id/resolve - Resolve a booking conflict.
router.patch("/bookings/:id/resolve", resolveBookingConflict);
// PATCH /api/manager/bookings/:id/extend - Extend a booking.
router.patch("/bookings/:id/extend", extendBooking);

// GET /api/manager/dashboard/metrics - Return manager dashboard summary metrics.
router.get("/dashboard/metrics", getDashboardMetrics);
// GET /api/manager/utilization - Return machinery utilization analytics.
router.get("/utilization", getMachineryUtilization);
// GET /api/manager/field-issues - List reported field issues.
router.get("/field-issues", getFieldIssues);
// GET /api/manager/reports/revenue/:period - Return revenue totals for a period.
router.get("/reports/revenue/:period", getRevenueReport);

// POST /api/manager/machinery - Register a machinery unit.
router.post("/machinery", createMachinery);
// PATCH /api/manager/machinery/:id/pricing - Update machinery pricing.
router.patch("/machinery/:id/pricing", updateMachineryPricing);
// PATCH /api/manager/machinery/:id/archive - Archive a machinery unit.
router.patch("/machinery/:id/archive", archiveMachinery);
// GET /api/manager/machinery/:id/maintenance-logs - List maintenance records for a unit.
router.get("/machinery/:id/maintenance-logs", listMaintenanceLogs);
// POST /api/manager/machinery/:id/maintenance-logs - Add a maintenance record for a unit.
router.post("/machinery/:id/maintenance-logs", createMaintenanceLog);
// GET /api/manager/machinery/:id/usage-logs - List usage records for a unit.
router.get("/machinery/:id/usage-logs", listUsageLogs);
// POST /api/manager/machinery/:id/usage-logs - Add a usage record for a unit.
router.post("/machinery/:id/usage-logs", createUsageLog);

module.exports = router;
