const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const authManager = require("../middleware/authManager");
const authenticate = require("../middleware/authenticate");
const { clean, fail } = require("./routeHelpers");
const { logAudit } = require("../services/auditLogger");

const INITIAL_SEEDED_DRIVERS = [
  {
    name: "John Adams",
    email: "john.adams@example.com",
    phone: "111-222-3333",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    address: "742 Evergreen Terrace",
    workHours: 232,
    performance: 4.6,
    performanceLabel: "Excellent",
    licenseNumber: "N01-14-123456",
  },
  {
    name: "Emily Brown",
    email: "emily.brown@example.com",
    phone: "222-333-4444",
    status: "Sick Leave",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
    address: "512 Pinecrest Blvd",
    workHours: 198,
    performance: 4.4,
    performanceLabel: "Good",
    licenseNumber: "N01-16-654321",
  },
  {
    name: "Michael Clark",
    email: "michael.clark@example.com",
    phone: "333-444-5555",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    address: "88 Market St, Suite 4B",
    workHours: 254,
    performance: 4.8,
    performanceLabel: "Excellent",
    licenseNumber: "N01-12-987654",
  },
  {
    name: "Sarah Davis",
    email: "sarah.davis@example.com",
    phone: "444-555-6666",
    status: "Half-Day Leave",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    address: "204 Oak Ridge Way",
    workHours: 210,
    performance: 4.3,
    performanceLabel: "Good",
    licenseNumber: "N01-18-456789",
  },
  {
    name: "James Evans",
    email: "james.evans@example.com",
    phone: "555-666-7777",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80",
    address: "310 Meadow Lane",
    workHours: 242,
    performance: 4.7,
    performanceLabel: "Excellent",
    licenseNumber: "N01-15-112233",
  },
  {
    name: "Laura Fisher",
    email: "laura.fisher@example.com",
    phone: "666-777-8888",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    address: "95 Westwood Blvd",
    workHours: 236,
    performance: 4.5,
    performanceLabel: "Excellent",
    licenseNumber: "N01-17-445566",
  },
  {
    name: "Robert Gray",
    email: "robert.gray@example.com",
    phone: "777-888-9999",
    status: "Sick Leave",
    avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80",
    address: "109 Lakeview Court",
    workHours: 180,
    performance: 4.2,
    performanceLabel: "Good",
    licenseNumber: "N01-11-778899",
  },
  {
    name: "Jessica Harris",
    email: "jessica.harris@example.com",
    phone: "888-999-0000",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80",
    address: "414 Sunset Boulevard",
    workHours: 220,
    performance: 4.6,
    performanceLabel: "Excellent",
    licenseNumber: "N01-19-990011",
  },
  {
    name: "Daniel Jackson",
    email: "daniel.jackson@example.com",
    phone: "999-000-1111",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80",
    address: "123 Elm Street",
    workHours: 248,
    performance: 4.5,
    performanceLabel: "Excellent",
    licenseNumber: "N01-13-223344",
  },
  {
    name: "Olivia King",
    email: "olivia.king@example.com",
    phone: "000-111-2222",
    status: "On Duty",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    address: "67 Beacon Street",
    workHours: 228,
    performance: 4.6,
    performanceLabel: "Excellent",
    licenseNumber: "N01-20-556677",
  },
  {
    name: "David Lee",
    email: "david.lee@example.com",
    phone: "111-222-3334",
    status: "Half-Day Leave",
    avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80",
    address: "802 Highland Ave",
    workHours: 204,
    performance: 4.3,
    performanceLabel: "Good",
    licenseNumber: "N01-14-889900",
  },
];

// GET /drivers - Fetch all registered drivers (seeds default drivers if collection empty)
router.get("/drivers", async (req, res) => {
  try {
    let drivers = await Driver.find().sort({ name: 1 });
    if (!drivers || drivers.length === 0) {
      await Driver.insertMany(INITIAL_SEEDED_DRIVERS);
      drivers = await Driver.find().sort({ name: 1 });
    }
    return res.json({ ok: true, data: drivers });
  } catch (error) {
    console.error("Error fetching drivers:", error);
    return res.status(500).json({ ok: false, error: "Failed to fetch drivers." });
  }
});

// POST /drivers - Register a new driver
router.post("/drivers", authManager, async (req, res) => {
  try {
    const name = clean(req.body.name);
    if (!name) return fail(res, 400, "Driver name is required.");

    const newDriver = await Driver.create({
      name,
      email: clean(req.body.email),
      phone: clean(req.body.phone) || "555-000-1234",
      status: req.body.status || "On Duty",
      avatar: clean(req.body.avatar) || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
      address: clean(req.body.address) || "Kalilangan, Bukidnon",
      licenseNumber: clean(req.body.licenseNumber),
      workHours: Number(req.body.workHours) || 160,
      performance: Number(req.body.performance) || 4.5,
      performanceLabel: clean(req.body.performanceLabel) || "Excellent",
    });

    await logAudit({
      action: "DRIVER_REGISTERED",
      actorEmail: req.user?.email || "manager",
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      details: { driverId: newDriver._id, name: newDriver.name, phone: newDriver.phone },
      req,
    });

    return res.status(201).json({ ok: true, data: newDriver });
  } catch (error) {
    console.error("Error creating driver:", error);
    return res.status(500).json({ ok: false, error: "Failed to create driver." });
  }
});

// PUT /drivers/:id - Update driver details
router.put("/drivers/:id", authManager, async (req, res) => {
  try {
    const id = req.params.id;
    let driver = null;
    if (mongoose.isValidObjectId(id)) {
      driver = await Driver.findById(id);
    }
    if (!driver) {
      driver = await Driver.findOne({ name: clean(id) });
    }
    if (!driver) return fail(res, 404, "Driver not found.");

    if (req.body.name) driver.name = clean(req.body.name);
    if (req.body.email !== undefined) driver.email = clean(req.body.email);
    if (req.body.phone !== undefined) driver.phone = clean(req.body.phone);
    if (req.body.status) driver.status = req.body.status;
    if (req.body.address !== undefined) driver.address = clean(req.body.address);
    if (req.body.licenseNumber !== undefined) driver.licenseNumber = clean(req.body.licenseNumber);
    if (req.body.workHours !== undefined) driver.workHours = Number(req.body.workHours);
    if (req.body.performance !== undefined) driver.performance = Number(req.body.performance);
    if (req.body.performanceLabel !== undefined) driver.performanceLabel = clean(req.body.performanceLabel);
    if (req.body.avatar !== undefined) driver.avatar = clean(req.body.avatar);

    await driver.save();

    return res.json({ ok: true, data: driver });
  } catch (error) {
    console.error("Error updating driver:", error);
    return res.status(500).json({ ok: false, error: "Failed to update driver." });
  }
});

// DELETE /drivers/:id - Remove driver
router.delete("/drivers/:id", authManager, async (req, res) => {
  try {
    const id = req.params.id;
    await Driver.findByIdAndDelete(id);
    return res.json({ ok: true, message: "Driver removed." });
  } catch (error) {
    console.error("Error deleting driver:", error);
    return res.status(500).json({ ok: false, error: "Failed to delete driver." });
  }
});

module.exports = router;
