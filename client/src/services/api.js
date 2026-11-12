function readAuthStorage(keys) {
  for (const key of keys) {
    const val = sessionStorage.getItem(key);
    if (val) return val;
  }
  for (const key of keys) {
    const val = localStorage.getItem(key);
    if (val) return val;
  }
  return "";
}

export function getSignedInEmail() {
  return readAuthStorage(["kimpc-member-email", "minders-member-email"]).trim().toLowerCase();
}

export function getSignedInRole() {
  return readAuthStorage(["kimpc-account-role", "minders-account-role"]) || "member";
}

export function getSignedInName() {
  return readAuthStorage(["kimpc-account-name", "minders-account-name"]);
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp * 1000 <= Date.now();
}

function getRawAuthTokens() {
  return [
    sessionStorage.getItem("kimpc-jwt-token"),
    sessionStorage.getItem("minders-jwt-token"),
    localStorage.getItem("kimpc-jwt-token"),
    localStorage.getItem("minders-jwt-token"),
    localStorage.getItem("token"),
  ].filter(Boolean);
}

export function getAuthToken() {
  const candidates = getRawAuthTokens();
  for (const candidate of candidates) {
    if (!isTokenExpired(candidate)) return candidate;
  }
  return "";
}

export function isAuthenticated() {
  const hasFlag =
    sessionStorage.getItem("kimpc-member-auth") === "true" ||
    sessionStorage.getItem("minders-member-auth") === "true" ||
    localStorage.getItem("kimpc-member-auth") === "true" ||
    localStorage.getItem("minders-member-auth") === "true";
  if (!hasFlag) return false;
  if (getRawAuthTokens().length > 0 && !getAuthToken()) return false;
  return true;
}

function notifyIfAuthRejected(path, status, tokenUsed, data) {
  if (status !== 401 || !tokenUsed) return;
  const normalized = String(path || "").toLowerCase();
  if (
    normalized.startsWith("/login") ||
    normalized.startsWith("/register") ||
    normalized.startsWith("/verify") ||
    normalized.startsWith("/auth/google") ||
    normalized.startsWith("/auth/facebook") ||
    normalized.startsWith("/auth/forgot-password") ||
    normalized.startsWith("/auth/change-temp-password")
  ) {
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kimpc:auth-expired", { detail: data || {} }));
  }
}

export function getDashboardForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/member";
}

// ================= SMART CACHE LAYER (0ms Navigation + Offline/Weak Signal Resilience) =================

// In-memory cache Map: preserves parsed objects directly for fastest lookup (0.01ms)
const memoryCache = new Map();
const SESSION_CACHE_PREFIX = "kimpc_cache_v1_";
const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds fresh window
const pendingRequests = new Map(); // In-flight request deduplication map

function getCacheKey(path, method = "GET") {
  const normMethod = (method || "GET").toUpperCase();
  const token = getAuthToken();
  const email = getSignedInEmail();
  return `${normMethod}:${path}:${email || "guest"}:${token ? "auth" : "anon"}`;
}

function getCachedEntry(cacheKey) {
  // 1. Check in-memory Map first (instant)
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }
  // 2. Check sessionStorage fallback (persists across page reloads/navigation in same session)
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch (e) {
    // Ignore private browsing or quota limits
  }
  return null;
}

function setCachedEntry(cacheKey, data, status = 200, ttl = DEFAULT_TTL_MS) {
  const entry = {
    data,
    status,
    timestamp: Date.now(),
    ttl,
  };
  memoryCache.set(cacheKey, entry);
  try {
    sessionStorage.setItem(SESSION_CACHE_PREFIX + cacheKey, JSON.stringify(entry));
  } catch (e) {
    // Ignore private browsing or quota limits
  }
}

/**
 * Synchronously retrieves cached data for a given GET path.
 * Ideal for initializing React useState without showing a loading spinner.
 */
export function getCachedApiData(path) {
  const cacheKey = getCacheKey(path, "GET");
  const entry = getCachedEntry(cacheKey);
  return entry ? entry.data : null;
}

/**
 * Manually prime or update cached data.
 */
export function setCachedApiData(path, data, ttl = DEFAULT_TTL_MS) {
  const cacheKey = getCacheKey(path, "GET");
  setCachedEntry(cacheKey, data, 200, ttl);
}

/**
 * Invalidate cached entries matching a path pattern or substring.
 * If no pattern is provided, invalidates all cached GET entries.
 */
export function invalidateApiCache(pattern) {
  const keysToDel = [];
  for (const k of memoryCache.keys()) {
    if (!pattern || k.includes(pattern)) {
      keysToDel.push(k);
    }
  }
  keysToDel.forEach((k) => memoryCache.delete(k));

  try {
    const sessionKeys = Object.keys(sessionStorage);
    for (const sk of sessionKeys) {
      if (sk.startsWith(SESSION_CACHE_PREFIX)) {
        const sub = sk.substring(SESSION_CACHE_PREFIX.length);
        if (!pattern || sub.includes(pattern)) {
          sessionStorage.removeItem(sk);
        }
      }
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Completely wipe all API cache entries (e.g. on user logout).
 */
export function clearApiCache() {
  memoryCache.clear();
  try {
    const sessionKeys = Object.keys(sessionStorage);
    for (const sk of sessionKeys) {
      if (sk.startsWith(SESSION_CACHE_PREFIX)) {
        sessionStorage.removeItem(sk);
      }
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Handles automatic cache invalidation when a mutating request succeeds.
 */
function handleMutationInvalidation(path) {
  const p = path.toLowerCase();
  if (p.includes("/applications")) {
    invalidateApiCache("/applications");
    invalidateApiCache("/manager/stats");
    invalidateApiCache("/manager/income-summary");
    invalidateApiCache("/notifications");
  } else if (p.includes("/machinery-units")) {
    invalidateApiCache("/machinery-units");
    invalidateApiCache("/manager/stats");
  } else if (p.includes("/drivers")) {
    invalidateApiCache("/drivers");
    invalidateApiCache("/machinery-units");
  } else if (p.includes("/expenses") || p.includes("/financials")) {
    invalidateApiCache("/expenses");
    invalidateApiCache("/financials");
    invalidateApiCache("/manager/expenses");
    invalidateApiCache("/manager/income-summary");
    invalidateApiCache("/manager/stats");
  } else if (p.includes("/accounts") || p.includes("/permissions") || p.includes("/admin")) {
    invalidateApiCache("/accounts");
    invalidateApiCache("/admin");
    invalidateApiCache("/auth/me");
  } else if (p.includes("/notifications")) {
    invalidateApiCache("/notifications");
  } else if (p.includes("/messages")) {
    invalidateApiCache("/messages");
    invalidateApiCache("/manager/messages");
  } else {
    // General mutation: invalidate generic cache entries to keep state clean
    invalidateApiCache();
  }
}

/**
 * Revalidates a cached endpoint quietly in the background without blocking the UI.
 */
function revalidateInBackground(path, cacheKey, ttl) {
  if (pendingRequests.has(cacheKey)) return;

  const bgPromise = (async () => {
    try {
      const headers = {};
      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const adminEmail = getSignedInEmail();
      if (adminEmail) headers["x-admin-email"] = adminEmail;

      const response = await fetch(`/api${path}`, {
        method: "GET",
        headers: Object.keys(headers).length ? headers : undefined,
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        setCachedEntry(cacheKey, data, response.status, ttl);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("kimpc:data-updated", { detail: { path, data } })
          );
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        notifyIfAuthRejected(path, response.status, token, errData);
      }
    } catch (e) {
      // Keep existing cached data on background failure
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, bgPromise);
}

/**
 * Main API request dispatcher with built-in SWR smart caching, deduplication, and weak signal resilience.
 */
export async function api(path, { method = "GET", body, skipCache = false, ttl = DEFAULT_TTL_MS } = {}) {
  const normMethod = (method || "GET").toUpperCase();
  const cacheKey = getCacheKey(path, normMethod);

  // 1. For GET requests, check cache first (instant response for fast navigation)
  if (normMethod === "GET" && !skipCache) {
    const cached = getCachedEntry(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const isFresh = age < (cached.ttl || ttl);

      if (isFresh) {
        // Return fresh cached data immediately (0ms wait)
        return { ok: true, status: cached.status || 200, data: cached.data, fromCache: true };
      }

      // If stale, return cached data immediately to keep UI fast & responsive,
      // and revalidate in background so fresh data syncs silently
      revalidateInBackground(path, cacheKey, ttl);
      return { ok: true, status: cached.status || 200, data: cached.data, fromCache: true, isStale: true };
    }
  }

  // 2. In-flight request deduplication for concurrent GETs (avoids duplicate requests on slow connections)
  if (normMethod === "GET" && pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const fetchPromise = (async () => {
    try {
      const headers = {};
      if (body) headers["Content-Type"] = "application/json";

      const token = getAuthToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const adminEmail = getSignedInEmail();
      if (adminEmail) headers["x-admin-email"] = adminEmail;

      const response = await fetch(`/api${path}`, {
        method: normMethod,
        headers: Object.keys(headers).length ? headers : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json().catch(() => ({}));
      notifyIfAuthRejected(path, response.status, token, data);
      const result = { ok: response.ok, status: response.status, data };

      if (normMethod === "GET" && response.ok) {
        setCachedEntry(cacheKey, data, response.status, ttl);
      } else if (normMethod !== "GET" && response.ok) {
        handleMutationInvalidation(path);
      }

      return result;
    } catch (err) {
      // 3. Weak signal / Offline resilience:
      // If network fails (e.g. disconnected or weak mobile signal in Bukidnon),
      // fall back to whatever cached data exists so user never sees a broken screen.
      if (normMethod === "GET") {
        const fallbackCached = getCachedEntry(cacheKey);
        if (fallbackCached) {
          return {
            ok: true,
            status: fallbackCached.status || 200,
            data: fallbackCached.data,
            fromCache: true,
            isOffline: true,
          };
        }
      }

      return {
        ok: false,
        status: 0,
        data: { error: "Cannot reach the server. Is it running? (npm start)" },
      };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  if (normMethod === "GET") {
    pendingRequests.set(cacheKey, fetchPromise);
  }

  return fetchPromise;
}
