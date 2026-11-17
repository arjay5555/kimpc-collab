const express = require("express");
const router = express.Router();
const geoService = require("../services/geoService");
const { getSystemSetting } = require("../models/SystemSetting");

/**
 * GET /api/geo/depot
 * Returns KIMPC Motor Pool coordinates and ORS routing availability.
 */
router.get("/depot", async (req, res) => {
  try {
    const orsEnabled = Boolean(await getSystemSetting("orsEnabled", true));
    res.json({
      ok: true,
      depot: geoService.KIMPC_DEPOT,
      orsEnabled,
      defaultProvinceCode: geoService.BUKIDNON_PROVINCE_CODE,
      defaultMunicipalityCode: geoService.KALILANGAN_MUNICIPALITY_CODE,
    });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to load depot configuration." });
  }
});

/**
 * GET /api/geo/psgc/municipalities?provinceCode=101300000
 */
router.get("/psgc/municipalities", async (req, res) => {
  try {
    const municipalities = await geoService.getMunicipalities(req.query.provinceCode);
    res.json({ ok: true, municipalities });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || "Failed to load municipalities." });
  }
});

/**
 * GET /api/geo/psgc/barangays?municipalityCode=101307000
 */
router.get("/psgc/barangays", async (req, res) => {
  try {
    const barangays = await geoService.getBarangays(req.query.municipalityCode);
    res.json({ ok: true, barangays });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || "Failed to load barangays." });
  }
});

/**
 * GET /api/geo/geocode?q=Ninoy+Aquino,+Kalilangan,+Bukidnon
 */
router.get("/geocode", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({ ok: false, error: "Please enter at least 2 characters to search." });
    }
    const results = await geoService.geocodeAddress(q);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || "Failed to search address." });
  }
});

/**
 * GET /api/geo/reverse?lat=7.82&lng=124.73
 */
router.get("/reverse", async (req, res) => {
  try {
    const result = await geoService.reverseGeocode(req.query.lat, req.query.lng);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "Invalid coordinates." });
  }
});

/**
 * POST /api/geo/route
 * Body: { lat, lng }
 */
router.post("/route", async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const route = await geoService.calculateDeliveryRoute(lat, lng);
    res.json(route);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "Failed to calculate delivery route." });
  }
});

module.exports = router;
