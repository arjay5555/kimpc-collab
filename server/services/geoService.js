const { getEffectiveOrsKey } = require("./apiKeyManager");
const { getSystemSetting } = require("../models/SystemSetting");

const KIMPC_DEPOT = {
  name: "KIMPC Motor Pool / Depot (Poblacion, Kalilangan)",
  lat: 7.8211,
  lng: 124.7314,
};

const BUKIDNON_PROVINCE_CODE = "101300000";
const KALILANGAN_MUNICIPALITY_CODE = "101307000";
const PSGC_BASE = "https://psgc.gitlab.io/api";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_USER_AGENT = "KIMPC-Machinery-Rental/1.0 (Kalilangan Bukidnon Cooperative)";
const ORS_ENDPOINTS = [
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
  "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
];

const PSGC_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GEO_TTL_MS = 6 * 60 * 60 * 1000;   // 6 hours
const ROUTE_TTL_MS = 60 * 60 * 1000;     // 1 hour
const MAX_CACHE_ENTRIES = 400;

const psgcCache = new Map();
const geoCache = new Map();
const routeCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimAt = 0;

function fetchNominatim(url) {
  const run = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, 1050 - (Date.now() - lastNominatimAt));
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    lastNominatimAt = Date.now();
    return fetchJson(url, {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        "Accept-Language": "en",
      },
    });
  });
  nominatimQueue = run.catch(() => {});
  return run;
}

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(map, key, data, ttlMs) {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseCoordPair(latRaw, lngRaw) {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function getMunicipalities(provinceCode = BUKIDNON_PROVINCE_CODE) {
  const code = String(provinceCode || BUKIDNON_PROVINCE_CODE).replace(/[^0-9]/g, "");
  const cacheKey = `muni:${code}`;
  const cached = getCached(psgcCache, cacheKey);
  if (cached) return cached;

  const { ok, data } = await fetchJson(`${PSGC_BASE}/provinces/${code}/cities-municipalities/`);
  if (!ok || !Array.isArray(data)) {
    throw new Error("Unable to fetch municipalities from PSGC API.");
  }

  const normalized = data
    .map((item) => ({
      code: String(item.code || ""),
      name: String(item.name || "").trim(),
      isCity: Boolean(item.isCity),
    }))
    .filter((item) => item.code && item.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  setCached(psgcCache, cacheKey, normalized, PSGC_TTL_MS);
  return normalized;
}

async function getBarangays(municipalityCode = KALILANGAN_MUNICIPALITY_CODE) {
  const code = String(municipalityCode || KALILANGAN_MUNICIPALITY_CODE).replace(/[^0-9]/g, "");
  const cacheKey = `brgy:${code}`;
  const cached = getCached(psgcCache, cacheKey);
  if (cached) return cached;

  const { ok, data } = await fetchJson(`${PSGC_BASE}/municipalities/${code}/barangays/`);
  if (!ok || !Array.isArray(data)) {
    throw new Error("Unable to fetch barangays from PSGC API.");
  }

  const normalized = data
    .map((item) => ({
      code: String(item.code || ""),
      name: String(item.name || "").trim(),
    }))
    .filter((item) => item.code && item.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  setCached(psgcCache, cacheKey, normalized, PSGC_TTL_MS);
  return normalized;
}

async function geocodeAddress(query) {
  const cleanQuery = String(query || "").trim();
  if (cleanQuery.length < 2) return [];

  const cacheKey = `fwd:${cleanQuery.toLowerCase()}`;
  const cached = getCached(geoCache, cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: "jsonv2",
    q: cleanQuery,
    countrycodes: "ph",
    limit: "5",
    addressdetails: "1",
  });

  const { ok, data } = await fetchNominatim(`${NOMINATIM_BASE}/search?${params.toString()}`);

  if (!ok || !Array.isArray(data)) {
    throw new Error("Geocoding service is temporarily unavailable.");
  }

  const results = data
    .map((item) => {
      const coords = parseCoordPair(item.lat, item.lon);
      if (!coords) return null;
      return {
        formattedAddress: String(item.display_name || cleanQuery),
        lat: coords.lat,
        lng: coords.lng,
        type: String(item.type || ""),
        address: item.address || {},
      };
    })
    .filter(Boolean);

  setCached(geoCache, cacheKey, results, GEO_TTL_MS);
  return results;
}

async function reverseGeocode(latRaw, lngRaw) {
  const coords = parseCoordPair(latRaw, lngRaw);
  if (!coords) {
    throw new Error("Invalid coordinates supplied.");
  }

  const cacheKey = `rev:${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
  const cached = getCached(geoCache, cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(coords.lat),
    lon: String(coords.lng),
    addressdetails: "1",
    zoom: "16",
  });

  let ok = false;
  let data = null;
  try {
    ({ ok, data } = await fetchNominatim(`${NOMINATIM_BASE}/reverse?${params.toString()}`));
  } catch {
    ok = false;
  }

  if (!ok || !data || data.error) {
    return {
      formattedAddress: `Pinned Farm (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`,
      lat: coords.lat,
      lng: coords.lng,
      barangay: "",
      municipality: "",
      province: "",
    };
  }

  const addr = data.address || {};
  const result = {
    formattedAddress: String(data.display_name || `Pinned Farm (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`),
    lat: coords.lat,
    lng: coords.lng,
    barangay: String(addr.village || addr.suburb || addr.quarter || addr.neighbourhood || "").trim(),
    municipality: String(addr.town || addr.city || addr.municipality || "").trim(),
    province: String(addr.province || addr.state || "").trim(),
  };

  setCached(geoCache, cacheKey, result, GEO_TTL_MS);
  return result;
}

async function requestOrsRoute(apiKey, destCoords) {
  const body = JSON.stringify({
    coordinates: [
      [KIMPC_DEPOT.lng, KIMPC_DEPOT.lat],
      [destCoords.lng, destCoords.lat],
    ],
    preference: "fastest",
  });

  let lastError = "OpenRouteService unavailable";
  for (const endpoint of ORS_ENDPOINTS) {
    try {
      const { ok, status, data } = await fetchJson(
        endpoint,
        {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/json",
          },
          body,
        },
        9000
      );

      if (ok && data?.features?.[0]) {
        const feature = data.features[0];
        const summary = feature.properties?.summary || {};
        const distanceMeters = Number(summary.distance || 0);
        const durationSeconds = Number(summary.duration || 0);
        const rawCoords = Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates : [];
        // Convert GeoJSON [lng, lat] pairs to Leaflet [lat, lng]
        const routeLatLngs = rawCoords
          .map((pair) => (Array.isArray(pair) && pair.length >= 2 ? [Number(pair[1]), Number(pair[0])] : null))
          .filter(Boolean);

        return {
          distanceKm: Number((distanceMeters / 1000).toFixed(2)),
          durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
          routeLatLngs,
          isRoadRoute: true,
          source: "openrouteservice",
        };
      }

      lastError = data?.error?.message || `HTTP ${status}`;
      if (status === 401 || status === 403 || status === 400) break;
    } catch (err) {
      lastError = err?.message || "Network timeout";
    }
  }

  throw new Error(lastError);
}

async function calculateDeliveryRoute(latRaw, lngRaw) {
  const dest = parseCoordPair(latRaw, lngRaw);
  if (!dest) {
    throw new Error("Invalid destination coordinates.");
  }

  const orsEnabled = Boolean(await getSystemSetting("orsEnabled", true));
  const { key: apiKey } = await getEffectiveOrsKey();

  const straightKm = haversineKm(KIMPC_DEPOT.lat, KIMPC_DEPOT.lng, dest.lat, dest.lng);
  const estRoadKm = Number((straightKm * 1.25).toFixed(2));
  const estMinutes = Math.max(1, Math.round((estRoadKm / 28) * 60));

  if (!orsEnabled || !apiKey) {
    return {
      ok: true,
      depot: KIMPC_DEPOT,
      destination: dest,
      distanceKm: estRoadKm,
      durationMinutes: estMinutes,
      routeLatLngs: [
        [KIMPC_DEPOT.lat, KIMPC_DEPOT.lng],
        [dest.lat, dest.lng],
      ],
      isRoadRoute: false,
      source: orsEnabled ? "estimated-no-key" : "estimated-disabled",
    };
  }

  const cacheKey = `route:${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
  const cached = getCached(routeCache, cacheKey);
  if (cached) {
    return { ok: true, depot: KIMPC_DEPOT, destination: dest, ...cached };
  }

  try {
    const orsData = await requestOrsRoute(apiKey, dest);
    setCached(routeCache, cacheKey, orsData, ROUTE_TTL_MS);
    return {
      ok: true,
      depot: KIMPC_DEPOT,
      destination: dest,
      ...orsData,
    };
  } catch (err) {
    return {
      ok: true,
      depot: KIMPC_DEPOT,
      destination: dest,
      distanceKm: estRoadKm,
      durationMinutes: estMinutes,
      routeLatLngs: [
        [KIMPC_DEPOT.lat, KIMPC_DEPOT.lng],
        [dest.lat, dest.lng],
      ],
      isRoadRoute: false,
      source: "haversine-fallback",
      warning: err.message,
    };
  }
}

module.exports = {
  KIMPC_DEPOT,
  BUKIDNON_PROVINCE_CODE,
  KALILANGAN_MUNICIPALITY_CODE,
  parseCoordPair,
  getMunicipalities,
  getBarangays,
  geocodeAddress,
  reverseGeocode,
  calculateDeliveryRoute,
};

