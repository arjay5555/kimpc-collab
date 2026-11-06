const https = require("https");
const SystemSetting = require("../models/SystemSetting");

// In-memory cache for the 3-day forecast
let cachedForecast = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes TTL to prevent excessive external API calls

// Confirmed geographic coordinates for Kalilangan, Bukidnon
const KALILANGAN_COORDS = "7.8211,124.7314";

/**
 * Strips secret API key from log messages or URLs
 */
function sanitizeKey(str) {
  const key = process.env.WEATHER_API_KEY;
  if (!key || typeof str !== "string") return str;
  return str.split(key).join("[REDACTED_API_KEY]");
}

/**
 * Low-level HTTPS helper for WeatherAPI.com
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              const errMsg = data?.error?.message || `HTTP ${res.statusCode}`;
              reject(new Error(sanitizeKey(errMsg)));
            }
          } catch (e) {
            reject(new Error("Invalid JSON response from weather service."));
          }
        });
      })
      .on("error", (err) => {
        reject(new Error(sanitizeKey(err.message)));
      });
  });
}

/**
 * Normalizes condition icon URL to secure https:// format
 */
function normalizeIcon(iconUrl) {
  if (!iconUrl) return "";
  if (iconUrl.startsWith("//")) return `https:${iconUrl}`;
  return iconUrl;
}

/**
 * Fetches and formats 3-day forecast for Kalilangan, Bukidnon.
 * Verifies that the returned location matches Kalilangan, or uses confirmed coordinates.
 */
async function getKalilanganForecast(forceRefresh = false) {
  // Check system setting toggle
  try {
    const settingDoc = await SystemSetting.findOne({ key: "weatherEnabled" });
    if (settingDoc && settingDoc.value === false) {
      cachedForecast = null;
      return {
        ok: false,
        disabled: true,
        error: "Weather forecast service is currently disabled by administrator.",
      };
    }
  } catch (err) {
    // Proceed if db check fails
  }

  const now = Date.now();

  // Return cached result if valid and not expired
  if (!forceRefresh && cachedForecast && now < cacheExpiry) {
    return {
      ...cachedForecast,
      cached: true,
    };
  }

  const apiKey = (process.env.WEATHER_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "Weather API key is not configured in server environment.",
    };
  }

  try {
    // 1. Attempt query using "Kalilangan,Bukidnon"
    let queryParam = "Kalilangan,Bukidnon";
    let url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(queryParam)}&days=3&aqi=no&alerts=no`;

    let data;
    try {
      data = await fetchJson(url);
    } catch (primaryErr) {
      // Fall back to confirmed coordinates
      queryParam = KALILANGAN_COORDS;
      url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(queryParam)}&days=3&aqi=no&alerts=no`;
      data = await fetchJson(url);
    }

    // 2. Verify returned location matches Kalilangan
    const locName = String(data?.location?.name || "").toLowerCase();
    const locRegion = String(data?.location?.region || "").toLowerCase();
    const isKalilanganMatch = locName.includes("kalilangan") || locRegion.includes("bukidnon");

    if (!isKalilanganMatch) {
      // Re-fetch with confirmed coordinates if name didn't match
      queryParam = KALILANGAN_COORDS;
      url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(queryParam)}&days=3&aqi=no&alerts=no`;
      data = await fetchJson(url);
    }

    // 3. Transform and extract the required fields
    const forecastDays = Array.isArray(data?.forecast?.forecastday) ? data.forecast.forecastday : [];

    const formattedForecast = forecastDays.slice(0, 3).map((f) => {
      const d = f.day || {};
      const cond = d.condition || {};
      const dateObj = new Date(f.date);
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      return {
        date: f.date, // "YYYY-MM-DD"
        dayName: !isNaN(dateObj.getTime()) ? dayNames[dateObj.getDay()] : "",
        temp_c: typeof d.avgtemp_c === "number" ? d.avgtemp_c : 0,
        min_temp_c: typeof d.mintemp_c === "number" ? d.mintemp_c : 0,
        max_temp_c: typeof d.maxtemp_c === "number" ? d.maxtemp_c : 0,
        condition: cond.text || "Normal",
        icon: normalizeIcon(cond.icon),
        chance_of_rain: typeof d.daily_chance_of_rain === "number" ? d.daily_chance_of_rain : Number(d.daily_chance_of_rain) || 0,
        humidity: d.avghumidity || 0,
        maxwind_kph: d.maxwind_kph || 0,
      };
    });

    const result = {
      ok: true,
      location: {
        name: data?.location?.name || "Kalilangan",
        region: data?.location?.region || "Bukidnon",
        country: data?.location?.country || "Philippines",
        lat: data?.location?.lat || 7.8211,
        lon: data?.location?.lon || 124.7314,
        localtime: data?.location?.localtime || "",
      },
      current: {
        temp_c: data?.current?.temp_c ?? 25,
        condition: data?.current?.condition?.text || "Clear",
        icon: normalizeIcon(data?.current?.condition?.icon),
        humidity: data?.current?.humidity ?? 70,
        wind_kph: data?.current?.wind_kph ?? 0,
      },
      forecast: formattedForecast,
      cached: false,
      updatedAt: new Date().toISOString(),
    };

    // Cache the result
    cachedForecast = result;
    cacheExpiry = now + CACHE_TTL_MS;

    return result;
  } catch (err) {
    // Keep API key strictly out of logs
    const safeError = sanitizeKey(err.message || "Failed to fetch weather forecast.");
    console.warn("[WeatherService] Forecast fetch warning:", safeError);
    return {
      ok: false,
      error: "Weather forecast is temporarily unavailable.",
    };
  }
}

module.exports = {
  getKalilanganForecast,
  KALILANGAN_COORDS,
};

