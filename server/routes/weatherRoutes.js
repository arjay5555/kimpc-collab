const express = require("express");
const router = express.Router();
const authManager = require("../middleware/authManager");
const weatherService = require("../services/weatherService");

/**
 * GET /api/weather/forecast
 * Manager-only endpoint fetching 3-day Kalilangan, Bukidnon weather forecast
 */
router.get("/forecast", authManager, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true" || req.query.refresh === "1";
    const data = await weatherService.getKalilanganForecast(forceRefresh);
    if (!data.ok) {
      return res.status(503).json(data);
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Failed to load weather forecast." });
  }
});

module.exports = router;

