const express = require("express");
const router = express.Router();

// Pre-indexed geographic coordinates for Kalilangan & Bukidnon cooperative farm regions
const BUKIDNON_FARM_LOCALITIES = [
  { name: "Lampanusan, Kalilangan, Bukidnon", barangay: "Lampanusan", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7478, lng: 124.7439 },
  { name: "Poblacion, Kalilangan, Bukidnon", barangay: "Poblacion", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7432, lng: 124.7478 },
  { name: "West Poblacion, Kalilangan, Bukidnon", barangay: "West Poblacion", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7415, lng: 124.7420 },
  { name: "Malinao, Kalilangan, Bukidnon", barangay: "Malinao", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7810, lng: 124.7350 },
  { name: "Pamotolon, Kalilangan, Bukidnon", barangay: "Pamotolon", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7390, lng: 124.7180 },
  { name: "San Vicente, Kalilangan, Bukidnon", barangay: "San Vicente", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7312, lng: 124.7110 },
  { name: "Baborawon, Kalilangan, Bukidnon", barangay: "Baborawon", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7289, lng: 124.7554 },
  { name: "Canituan, Kalilangan, Bukidnon", barangay: "Canituan", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7652, lng: 124.7215 },
  { name: "Kibaning, Kalilangan, Bukidnon", barangay: "Kibaning", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7410, lng: 124.7620 },
  { name: "Kinura, Kalilangan, Bukidnon", barangay: "Kinura", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7125, lng: 124.7780 },
  { name: "Macaopao, Kalilangan, Bukidnon", barangay: "Macaopao", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7620, lng: 124.7812 },
  { name: "Public, Kalilangan, Bukidnon", barangay: "Public", municipality: "Kalilangan", province: "Bukidnon", lat: 7.7550, lng: 124.7610 },
  { name: "Pangantucan, Bukidnon", barangay: "Poblacion", municipality: "Pangantucan", province: "Bukidnon", lat: 7.8285, lng: 124.8190 },
  { name: "Maramag, Bukidnon", barangay: "Anahawon", municipality: "Maramag", province: "Bukidnon", lat: 7.7594, lng: 125.0042 },
  { name: "Valencia City, Bukidnon", barangay: "Poblacion", municipality: "Valencia City", province: "Bukidnon", lat: 7.9064, lng: 125.0941 },
  { name: "Malaybalay City, Bukidnon", barangay: "Casisang", municipality: "Malaybalay City", province: "Bukidnon", lat: 8.1575, lng: 125.1278 },
];

/**
 * GET /api/geocode?query=...
 * Geocodes a farm address or location query into latitude, longitude, and formatted address.
 * Primary: Google Geocoding API using GOOGLE_GEOCODING_API_KEY / GOOGLE_MAPS_API_KEY.
 * Graceful fallback: OpenStreetMap Nominatim or Kalilangan local database.
 */
router.get("/geocode", async (req, res) => {
  const query = (req.query.query || req.query.address || "").trim();
  if (!query) {
    return res.status(400).json({ ok: false, error: "Address query is required." });
  }

  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  // 1. Try Google Geocoding API if key is present
  if (apiKey) {
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:PH&key=${encodeURIComponent(apiKey)}`;
      const googleRes = await fetch(googleUrl, { headers: { "Accept": "application/json" } });
      const googleData = await googleRes.json();

      if (googleData.status === "OK" && Array.isArray(googleData.results) && googleData.results.length > 0) {
        const results = googleData.results.map((item) => ({
          formattedAddress: item.formatted_address,
          lat: item.geometry.location.lat,
          lng: item.geometry.location.lng,
          placeId: item.place_id,
          provider: "google",
        }));
        return res.json({ ok: true, data: results, provider: "google" });
      }
    } catch (err) {
      console.warn("[Geocode] Google Geocoding API error, using fallback:", err.message);
    }
  }

  // 2. Fallback: Search local cooperative Bukidnon farm localities
  const normalized = query.toLowerCase();
  const matchedLocalities = BUKIDNON_FARM_LOCALITIES.filter((loc) =>
    loc.name.toLowerCase().includes(normalized) ||
    loc.barangay.toLowerCase().includes(normalized) ||
    normalized.includes(loc.barangay.toLowerCase())
  );

  if (matchedLocalities.length > 0) {
    const results = matchedLocalities.map((loc) => ({
      formattedAddress: `${loc.barangay}, ${loc.municipality}, ${loc.province}, Philippines`,
      lat: loc.lat,
      lng: loc.lng,
      placeId: `kimpc-${loc.barangay.toLowerCase()}`,
      provider: "cooperative_index",
    }));
    return res.json({ ok: true, data: results, provider: "cooperative_index" });
  }

  // 3. Fallback: Try OpenStreetMap Nominatim
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", Bukidnon, Philippines")}&format=json&limit=5&countrycodes=ph`;
    const osmRes = await fetch(osmUrl, {
      headers: { "User-Agent": "KIMPC-Cooperative-Farm-Locator/1.0" },
    });
    const osmData = await osmRes.json();

    if (Array.isArray(osmData) && osmData.length > 0) {
      const results = osmData.map((item) => ({
        formattedAddress: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        placeId: item.place_id,
        provider: "osm",
      }));
      return res.json({ ok: true, data: results, provider: "osm" });
    }
  } catch (err) {
    console.warn("[Geocode] Nominatim fallback failed:", err.message);
  }

  // 4. Default Kalilangan Poblacion coordinates
  return res.json({
    ok: true,
    data: [
      {
        formattedAddress: `${query}, Kalilangan, Bukidnon, Philippines`,
        lat: 7.7432,
        lng: 124.7478,
        placeId: "default-kalilangan",
        provider: "default_locality",
      },
    ],
    provider: "default_locality",
  });
});

/**
 * GET /api/geocode/reverse?lat=...&lng=...
 * Reverse-geocodes latitude and longitude into a readable address.
 */
router.get("/geocode/reverse", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ ok: false, error: "Valid latitude and longitude are required." });
  }

  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}`;
      const googleRes = await fetch(googleUrl, { headers: { "Accept": "application/json" } });
      const googleData = await googleRes.json();

      if (googleData.status === "OK" && Array.isArray(googleData.results) && googleData.results.length > 0) {
        return res.json({
          ok: true,
          data: {
            formattedAddress: googleData.results[0].formatted_address,
            lat,
            lng,
            provider: "google",
          },
        });
      }
    } catch (err) {
      console.warn("[Geocode Reverse] Google Geocoding API error, using fallback:", err.message);
    }
  }

  // Reverse fallback: find closest known locality
  let closest = BUKIDNON_FARM_LOCALITIES[0];
  let minDistance = Infinity;
  for (const loc of BUKIDNON_FARM_LOCALITIES) {
    const d = Math.hypot(loc.lat - lat, loc.lng - lng);
    if (d < minDistance) {
      minDistance = d;
      closest = loc;
    }
  }

  return res.json({
    ok: true,
    data: {
      formattedAddress: `Near ${closest.barangay}, ${closest.municipality}, ${closest.province}, Philippines`,
      lat,
      lng,
      provider: "cooperative_index",
    },
  });
});

module.exports = router;
