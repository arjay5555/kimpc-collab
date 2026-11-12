const express = require("express");
const jwt = require("jsonwebtoken");
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
const JWT_SECRET = process.env.JWT_SECRET || "minders-secret-jwt-key-cooperative-2026";

/**
 * Middleware to resolve the Manager user from Authorization header, ?token query,
 * x-admin-email header, or active manager fallback.
 */
async function resolveManager(req, res, next) {
  let token = "";
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice("Bearer ".length).trim();
  } else if (req.query.token) {
    token = String(req.query.token).trim();
  }

  // 1. Try resolving via JWT token
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const accId = payload?.id || payload?._id || payload?.userId;
      if (accId) {
        const account = await Account.findById(accId);
        if (account && !account.isSuspended && !account.isArchived && ["manager", "admin"].includes(account.role)) {
          req.user = account;
          return next();
        }
      }
    } catch (_) {
      // Ignore token failure and fall through
    }
  }

  // 2. Try resolving via email header or query
  const email = (req.headers["x-admin-email"] || req.query.email || "").toString().trim().toLowerCase();
  if (email) {
    const account = await Account.findOne({ email, isSuspended: { $ne: true }, isArchived: { $ne: true } });
    if (account && ["manager", "admin"].includes(account.role)) {
      req.user = account;
      return next();
    }
  }

  // 3. Fallback: Lookup primary active manager or admin in the cooperative
  const managerAccount = await Account.findOne({
    role: { $in: ["manager", "admin"] },
    isSuspended: { $ne: true },
    isArchived: { $ne: true }
  }).sort({ role: 1, createdAt: 1 });

  if (managerAccount) {
    req.user = managerAccount;
    return next();
  }

  return res.status(401).json({ error: "Manager account not found or unavailable." });
}

/**
 * GET /api/calendar/connect
 * Generates the Google OAuth consent URL with offline access and calendar.events scope.
 */
router.get("/connect", async (req, res) => {
  try {
    const calendarEnabled = await getSystemSetting("googleCalendarEnabled", true);
    if (calendarEnabled === false) {
      return res.status(403).json({
        error: "Google Calendar integration is currently disabled by administrator.",
        disabled: true,
      });
    }

    let managerId = "";
    let managerEmail = "";

    // Try resolving manager from token in header or query parameter
    let token = "";
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
    } else if (req.query.token) {
      token = String(req.query.token).trim();
    }

    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const accId = payload?.id || payload?._id || payload?.userId;
        if (accId) {
          managerId = String(accId);
          const acct = await Account.findById(managerId);
          if (acct?.email) managerEmail = acct.email;
        }
      } catch {
        // Fall back to first available manager if token invalid
      }
    }

    if (!managerId) {
      const emailQuery = (req.query.email || req.headers["x-admin-email"] || "").trim().toLowerCase();
      if (emailQuery) {
        const acct = await Account.findOne({ email: emailQuery, role: { $in: ["manager", "admin"] } });
        if (acct) {
          managerId = String(acct._id);
          managerEmail = acct.email;
        }
      }
    }

    if (!managerId) {
      const defaultManager = await Account.findOne({ role: "manager" });
      if (defaultManager) {
        managerId = String(defaultManager._id);
        managerEmail = defaultManager.email || "";
      }
    }

    // Determine return frontend URL so manager returns to their origin (e.g. http://localhost:5173)
    const returnBaseUrl = (
      req.query.returnUrl ||
      req.get("referer") ||
      req.get("origin") ||
      process.env.APP_BASE_URL ||
      ""
    ).trim().replace(/\/+$/, "");

    // Embed manager ID, timestamp, and return origin into state parameter
    const statePayload = Buffer.from(
      JSON.stringify({ managerId, ts: Date.now(), returnBaseUrl })
    ).toString("base64url");

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
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(String(state), "base64url").toString());
      managerId = decoded.managerId;
      returnBaseUrl = decoded.returnBaseUrl;
    } catch (e) {
      console.warn("[GoogleCalendar /callback] Could not decode state:", e.message);
    }
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
      const fallbackManager = await Account.findOne({ role: "manager" });
      if (fallbackManager) managerId = String(fallbackManager._id);
    }

    if (!managerId) {
      return res.status(400).send("No matching manager found to link Google Calendar.");
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
