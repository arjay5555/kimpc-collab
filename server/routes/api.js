/**
 * Central API Router Aggregator.
 * Composes feature-specific route modules:
 * - authRoutes: Authentication, registration, password recovery, verification, OAuth
 * - accountRoutes: Account management, profile edits, admin PIN & multi-factor verification, audit logs, impersonation
 * - applicationRoutes: Machinery rental applications, status workflows, handover inspections
 * - machineryRoutes: Fleet units catalog, availability, maintenance logs, utilization
 * - transactionRoutes: POS walk-in rentals, return settlements, financial ledger logs
 * - geocodeRoutes: Google Geocoding API & fallback locality forward/reverse lookups
 */
const express = require("express");
const router = express.Router();

const authRoutes = require("./authRoutes");
const accountRoutes = require("./accountRoutes");
const applicationRoutes = require("./applicationRoutes");
const machineryRoutes = require("./machineryRoutes");
const transactionRoutes = require("./transactionRoutes");
const memberRoutes = require("./memberRoutes");
const adminManagementRoutes = require("./adminManagementRoutes");
const geocodeRoutes = require("./geocodeRoutes");

router.use(authRoutes);
router.use(accountRoutes);
router.use(adminManagementRoutes);
router.use(applicationRoutes);
router.use(machineryRoutes);
router.use(transactionRoutes);
router.use(memberRoutes);
router.use(geocodeRoutes);

module.exports = router;
