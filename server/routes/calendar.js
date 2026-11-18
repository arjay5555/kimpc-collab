const express = require("express");
const Account = require("../models/Account");
const Application = require("../models/Application");
const MachineryMaintenance = require("../models/MachineryMaintenance");
const {
  generateAuthUrl,
  exchangeCodeAndSave,
  handleCalendarWebhook,
  getManagerSyncStatus,
  disconnectManagerCalendar,
  syncBookingToGoogleCalendar,
  syncMaintenanceToGoogleCalendar
} = require("../services/googleCalendarService");
const weatherService = require("../services/weatherService");
const { getSystemSetting } = require("../models/SystemSetting");
const { logAudit } = require("../services/auditLogger");

const router = express.Router();
const JWT_SECRET = require("../config/jwtSecret");

const crypto = require("crypto");
const authManager = require("../middleware/authManager");

// Calendar endpoints act on the authenticated manager/admin only.
const resolveManager = authManager;

const STATE_TTL_MS = 15 * 60 * 1000;

// OAuth state is HMAC-signed so the callback can trust managerId / returnBaseUrl.
function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!decoded.ts || Date.now() - decoded.ts > STATE_TTL_MS) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Only redirect back to known front-end origins (prevents open redirect).
function safeReturnBase(candidate, req) {
  const toOrigin = (u) => {
    try { return new URL(u).origin; } catch { return null; }
  };
  const allowed = new Set(
    [process.env.APP_BASE_URL, "http://localhost:5173", "http://127.0.0.1:5173", `${req.protocol}://${req.get("host")}`]
      .map(toOrigin)
      .filter(Boolean)
  );
  const origin = toOrigin(candidate);
  if (origin && allowed.has(origin)) return origin;
  return (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
}

/**
 * GET /api/calendar/connect
 * Generates the Google OAuth consent URL with offline access and calendar.events scope.
 */
router.get("/connect", authManager, async (req, res) => {
  try {
    const calendarEnabled = await getSystemSetting("googleCalendarEnabled", true);
    if (calendarEnabled === false) {
      return res.status(403).json({
        error: "Google Calendar integration is currently disabled by administrator.",
        disabled: true,
      });
    }

    const managerId = String(req.user._id);
    const managerEmail = req.user.email || "";

    // Determine return frontend URL so manager returns to their origin (e.g. http://localhost:5173)
    const returnBaseUrl = safeReturnBase(req.query.returnUrl || req.get("origin") || "", req);

    // Signed state: manager ID, timestamp, nonce and validated return origin
    const statePayload = signState({
      managerId,
      ts: Date.now(),
      nonce: crypto.randomBytes(12).toString("hex"),
      returnBaseUrl,
    });

    // Dynamic redirect URI fallback (honors GOOGLE_CALENDAR_REDIRECT_URI from .env if defined)
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";
    const redirectUri =
      process.env.CUSTOM_GOOGLE_CALENDAR_REDIRECT_URI ||
      process.env.DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI ||
      process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${protocol}://${host}/api/calendar/callback`;

    // Passing loginHint tells Google to directly pick the manager's registered account
    const authUrl = generateAuthUrl({ state: statePayload, redirectUri, loginHint: managerEmail });

    if (req.query.json === "true" || req.headers.accept?.includes("application/json")) {
      return res.json({ url: authUrl });
    }

    return res.redirect(authUrl);
  } catch (err) {
    console.error("[GoogleCalendar /connect] Error:", err.message);
    return res.status(500).json({ error: `Could not generate Google consent URL: ${err.message}` });
  }
});

/**
 * GET /api/calendar/callback
 * Exchanges authorization code for tokens, saves credentials to Manager, initiates watch channel,
 * and redirects back to the Manager Dashboard.
 */
router.get("/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  let returnBaseUrl = "";
  let managerId = "";
  const decodedState = verifyState(state);
  if (decodedState) {
    managerId = String(decodedState.managerId || "");
    returnBaseUrl = String(decodedState.returnBaseUrl || "");
  } else if (state) {
    console.warn("[GoogleCalendar /callback] Rejected invalid or expired OAuth state.");
  }

  const clientOrigin = (returnBaseUrl || process.env.APP_BASE_URL || "").replace(/\/+$/, "");
  const buildRedirect = (pathWithQuery) => {
    return clientOrigin ? `${clientOrigin}${pathWithQuery}` : pathWithQuery;
  };

  if (oauthError) {
    console.warn("[GoogleCalendar /callback] OAuth error:", oauthError);
    return res.redirect(buildRedirect(`/manager/calendar?google=denied&error=${encodeURIComponent(oauthError)}`));
  }

  if (!code) {
    return res.status(400).send("Missing authorization code from Google.");
  }

  try {
    if (!managerId) {
      return res.status(400).send("Invalid or expired authorization request. Please start the Google Calendar connection again.");
    }
    const linkingAccount = await Account.findById(managerId).select("role isSuspended isArchived");
    if (!linkingAccount || !["manager", "admin"].includes(linkingAccount.role) || linkingAccount.isSuspended || linkingAccount.isArchived) {
      return res.status(403).send("This account is not allowed to link Google Calendar.");
    }

    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";
    const redirectUri =
      process.env.CUSTOM_GOOGLE_CALENDAR_REDIRECT_URI ||
      process.env.DEFAULT_GOOGLE_CALENDAR_REDIRECT_URI ||
      process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${protocol}://${host}/api/calendar/callback`;

    const updatedManager = await exchangeCodeAndSave(String(code), managerId, redirectUri);

    // Initial sync of all currently approved bookings & maintenance records
    Promise.resolve().then(async () => {
      try {
        const approvedBookings = await Application.find({ status: { $in: ["Approved", "Checked-Out"] } });
        for (const b of approvedBookings) {
          await syncBookingToGoogleCalendar(b, updatedManager);
        }
        const maintenanceLogs = await MachineryMaintenance.find({ status: { $in: ["Out of Service", "Scheduled Maintenance"] } });
        for (const m of maintenanceLogs) {
          await syncMaintenanceToGoogleCalendar(m, updatedManager);
        }
      } catch (syncErr) {
        console.error("[GoogleCalendar Initial Sync] Note:", syncErr.message);
      }
    });

    return res.redirect(buildRedirect("/manager/calendar?google=connected"));
  } catch (err) {
    console.error("[GoogleCalendar /callback] Failed to exchange tokens:", err.message);
    return res.redirect(buildRedirect(`/manager/calendar?google=error&msg=${encodeURIComponent(err.message)}`));
  }
});

/**
 * POST /api/calendar/webhook
 * Receives Google push notifications, looks up Manager by channelId, and syncs date modifications.
 */
router.post("/webhook", async (req, res) => {
  // Immediately acknowledge receipt so Google doesn't retry
  res.status(200).send("OK");

  try {
    await handleCalendarWebhook(req.headers);
  } catch (err) {
    console.error("[GoogleCalendar Webhook Handler] Error:", err.message);
  }
});

/**
 * GET /api/calendar/status
 * Returns Google Calendar synchronization status for the logged-in manager.
 */
router.get("/status", resolveManager, async (req, res) => {
  try {
    const calendarEnabled = await getSystemSetting("googleCalendarEnabled", true);
    if (calendarEnabled === false) {
      return res.json({ connected: false, disabled: true, message: "Google Calendar integration is currently disabled." });
    }

    const status = await getManagerSyncStatus(req.user);
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/calendar/disconnect
 * Disconnects Google Calendar integration for the current manager.
 */
router.post("/disconnect", resolveManager, async (req, res) => {
  try {
    const result = await disconnectManagerCalendar(req.user._id);
    await logAudit({
      action: "GOOGLE_CALENDAR_DISCONNECTED",
      module: "Security Settings",
      actorEmail: req.user?.email || "manager",
      actorName: req.user?.fullName || "",
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      affectedRecord: "Google Calendar Sync",
      details: "Disconnected Google Calendar synchronization",
      status: "Success",
      req,
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/calendar/sync-now
 * Manually pushes all approved equipment rentals and maintenance records to Google Calendar.
 */
router.post("/sync-now", resolveManager, async (req, res) => {
  try {
    const [bookings, maintenance] = await Promise.all([
      Application.find({ status: { $in: ["Approved", "Checked-Out"] } }),
      MachineryMaintenance.find({ status: { $in: ["Out of Service", "Scheduled Maintenance"] } })
    ]);

    let bookingCount = 0;
    let maintenanceCount = 0;

    for (const b of bookings) {
      const eventId = await syncBookingToGoogleCalendar(b, req.user);
      if (eventId) bookingCount++;
    }

    for (const m of maintenance) {
      const eventId = await syncMaintenanceToGoogleCalendar(m, req.user);
      if (eventId) maintenanceCount++;
    }

    await logAudit({
      action: "GOOGLE_CALENDAR_SYNCED",
      module: "Security Settings",
      actorEmail: req.user?.email || "manager",
      actorName: req.user?.fullName || "",
      actorRole: req.user?.role || "manager",
      actorId: req.user?._id,
      affectedRecord: "Google Calendar Sync",
      details: {
        syncedBookings: bookingCount,
        syncedMaintenance: maintenanceCount,
        total: bookingCount + maintenanceCount,
      },
      status: "Success",
      req,
    });

    return res.json({
      success: true,
      syncedBookings: bookingCount,
      syncedMaintenance: maintenanceCount,
      total: bookingCount + maintenanceCount
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/calendar/weather
 * Manager-only endpoint: returns 3-day Kalilangan, Bukidnon weather forecast (briefly cached)
 */
router.get("/weather", resolveManager, async (req, res) => {
  try {
    const weatherEnabled = await getSystemSetting("weatherEnabled", true);
    if (!weatherEnabled) {
      return res.status(403).json({
        ok: false,
        disabled: true,
        error: "Kalilangan Weather Forecast API is currently disabled by administrator.",
      });
    }
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
