const crypto = require("crypto");
const { google } = require("googleapis");
const Account = require("../models/Account");
const Application = require("../models/Application");
const MachineryMaintenance = require("../models/MachineryMaintenance");

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

/**
 * Creates an OAuth2 client configured with environment credentials.
 * @param {string} [redirectUri] - Optional custom redirect URI.
 */
function createOAuth2Client(redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl =
    redirectUri ||
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/calendar/callback";

  return new google.auth.OAuth2(clientId, clientSecret, callbackUrl);
}

/**
 * Generates the Google OAuth 2.0 authorization URL.
 * Requests offline access (to obtain a refresh token) and calendar.events scope.
 * @param {object} [options]
 * @param {string} [options.state] - State to pass through OAuth handshake (e.g. manager ID).
 * @param {string} [options.redirectUri]
 * @returns {string} The consent URL
 */
function generateAuthUrl({ state = "", redirectUri } = {}) {
  const oauth2Client = createOAuth2Client(redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force consent prompt to guarantee refresh token delivery
    scope: SCOPES,
    include_granted_scopes: true,
    state
  });
}

/**
 * Helper to compute exclusive end date for Google Calendar all-day events.
 * (e.g. 2026-11-05 inclusive -> 2026-11-06 exclusive)
 */
function toExclusiveEndDate(inclusiveDateStr) {
  if (!inclusiveDateStr) return inclusiveDateStr;
  try {
    const d = new Date(`${inclusiveDateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  } catch {
    return inclusiveDateStr;
  }
}

/**
 * Helper to convert Google Calendar exclusive end date back to inclusive.
 * (e.g. 2026-11-06 exclusive -> 2026-11-05 inclusive)
 */
function toInclusiveEndDate(exclusiveDateStr) {
  if (!exclusiveDateStr) return exclusiveDateStr;
  try {
    const d = new Date(`${exclusiveDateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  } catch {
    return exclusiveDateStr;
  }
}

/**
 * Finds an active manager or admin with Google Calendar credentials.
 * If a specific manager is passed, checks that account first.
 */
async function getConnectedManager(preferredManager) {
  if (preferredManager) {
    const ref = preferredManager.googleOAuth?.refreshToken || preferredManager.refreshToken;
    if (ref) return preferredManager;
  }

  // Find any active manager or admin who has connected their Google Calendar
  return await Account.findOne({
    role: { $in: ["manager", "admin"] },
    isSuspended: { $ne: true },
    isArchived: { $ne: true },
    $or: [
      { "googleOAuth.refreshToken": { $exists: true, $ne: "" } },
      { refreshToken: { $exists: true, $ne: "" } }
    ]
  }).sort({ updatedAt: -1 });
}

/**
 * Builds an authenticated Google Calendar API client for a manager.
 * Automatically handles token refreshing and persists new access tokens to MongoDB.
 */
function getCalendarClient(manager) {
  const refreshToken =
    manager.googleOAuth?.refreshToken || manager.refreshToken;

  if (!refreshToken) {
    throw new Error(`Manager ${manager.email} does not have a Google refresh token.`);
  }

  const oauth2Client = createOAuth2Client();
  const accessToken =
    manager.googleOAuth?.accessToken || manager.accessToken || undefined;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  // Automatically persist newly refreshed access tokens back to MongoDB
  oauth2Client.on("tokens", async (newTokens) => {
    try {
      if (newTokens.access_token) {
        await Account.updateOne(
          { _id: manager._id },
          {
            $set: {
              "googleOAuth.accessToken": newTokens.access_token,
              accessToken: newTokens.access_token,
              ...(newTokens.refresh_token
                ? {
                    "googleOAuth.refreshToken": newTokens.refresh_token,
                    refreshToken: newTokens.refresh_token
                  }
                : {})
            }
          }
        );
      }
    } catch (err) {
      console.error("[GoogleCalendar] Error saving refreshed access token:", err.message);
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Sets up a Google Calendar watch channel (push notifications webhook).
 * @param {object} manager - The manager account document
 * @param {string} [callbackBaseUrl] - Base URL (e.g. https://my-domain.com or tunnel)
 */
async function watchManagerCalendar(manager, callbackBaseUrl) {
  try {
    const calendar = getCalendarClient(manager);
    const channelId = crypto.randomUUID();
    const calendarId = manager.googleOAuth?.calendarId || manager.calendarId || "primary";

    const baseUrl =
      callbackBaseUrl ||
      process.env.APP_BASE_URL ||
      process.env.WEBHOOK_BASE_URL ||
      "http://localhost:3000";

    const webhookAddress = `${baseUrl.replace(/\/+$/, "")}/api/calendar/webhook`;

    // Google watch requires HTTPS in production, but we attempt registration
    // and gracefully record credentials regardless of local/tunnel environment
    const watchRes = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: webhookAddress
      }
    });

    const resourceId = watchRes.data.resourceId || "";
    const expiration = watchRes.data.expiration
      ? new Date(Number(watchRes.data.expiration))
      : null;

    await Account.updateOne(
      { _id: manager._id },
      {
        $set: {
          "googleOAuth.channelId": channelId,
          "googleOAuth.resourceId": resourceId,
          "googleOAuth.channelExpiration": expiration,
          channelId,
          resourceId
        }
      }
    );

    return { channelId, resourceId, expiration };
  } catch (err) {
    // If webhook registration fails (e.g. running on local non-HTTPS without tunnel),
    // save a generated channelId so simulated or tunneled webhooks still function.
    const fallbackChannelId = crypto.randomUUID();
    await Account.updateOne(
      { _id: manager._id },
      {
        $set: {
          "googleOAuth.channelId": fallbackChannelId,
          channelId: fallbackChannelId
        }
      }
    );
    console.warn(
      `[GoogleCalendar] Webhook watch registration note: ${err.message}. Local sync will operate via API polling / events.`
    );
    return { channelId: fallbackChannelId, resourceId: "", error: err.message };
  }
}

/**
 * Exchanges authorization code for tokens and saves them to the manager document.
 * @param {string} code - Authorization code from Google
 * @param {string} managerId - ID of the manager connecting
 * @param {string} [redirectUri]
 */
async function exchangeCodeAndSave(code, managerId, redirectUri) {
  const oauth2Client = createOAuth2Client(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error("Google did not return authentication tokens.");
  }

  const manager = await Account.findById(managerId);
  if (!manager) {
    throw new Error(`Manager account not found (id: ${managerId}).`);
  }

  const updateFields = {
    "googleOAuth.connectedAt": new Date(),
    "googleOAuth.calendarId": "primary",
    calendarId: "primary"
  };

  if (tokens.access_token) {
    updateFields["googleOAuth.accessToken"] = tokens.access_token;
    updateFields.accessToken = tokens.access_token;
  }
  if (tokens.refresh_token) {
    updateFields["googleOAuth.refreshToken"] = tokens.refresh_token;
    updateFields.refreshToken = tokens.refresh_token;
  }

  const updatedManager = await Account.findByIdAndUpdate(
    managerId,
    { $set: updateFields },
    { new: true }
  );

  // Setup webhook watch channel
  await watchManagerCalendar(updatedManager);

  return updatedManager;
}

/**
 * Pushes an approved booking to the Manager's primary Google Calendar.
 * Updates the existing Google Calendar event if one exists.
 * Wrapped in try/catch to ensure core booking flow is never interrupted.
 * @param {object} booking - Mongoose Application document or plain object
 * @param {object} [preferredManager] - Manager triggering the sync
 * @returns {Promise<string|null>} The googleCalendarEventId or null
 */
async function syncBookingToGoogleCalendar(booking, preferredManager) {
  try {
    const manager = await getConnectedManager(preferredManager);
    if (!manager) {
      console.log("[GoogleCalendar] No connected manager found. Skipping calendar push.");
      return null;
    }

    const calendar = getCalendarClient(manager);
    const calendarId = manager.googleOAuth?.calendarId || manager.calendarId || "primary";

    const displayId =
      booking.displayId || `APP-${String(booking._id || booking.id).slice(-6).toUpperCase()}`;

    const eventPayload = {
      summary: `🚜 Equipment Rental: ${booking.equipment} (${booking.memberName})`,
      description: [
        `Minders Cooperative Machinery Rental`,
        `Booking Ref: ${displayId}`,
        `Equipment: ${booking.equipment}`,
        booking.machineryUnitId ? `Unit ID: ${booking.machineryUnitId}` : null,
        `Farmer: ${booking.memberName} (${booking.memberEmail})`,
        booking.farmerPhone ? `Phone: ${booking.farmerPhone}` : null,
        `Status: ${booking.status}`,
        `Period: ${booking.startDate} to ${booking.endDate}`,
        booking.managerRemarks ? `Remarks: ${booking.managerRemarks}` : null
      ]
        .filter(Boolean)
        .join("\n"),
      start: {
        date: booking.startDate // Format: YYYY-MM-DD
      },
      end: {
        date: toExclusiveEndDate(booking.endDate) // Google Calendar all-day exclusive end date
      },
      colorId: "2", // Sage/Green color in Google Calendar
      extendedProperties: {
        private: {
          mindersType: "booking",
          bookingId: String(booking._id || booking.id),
          equipment: String(booking.equipment || "")
        }
      }
    };

    let eventId = booking.googleCalendarEventId;

    if (eventId) {
      try {
        const updateRes = await calendar.events.update({
          calendarId,
          eventId,
          requestBody: eventPayload
        });
        return updateRes.data.id;
      } catch (updateErr) {
        // If event was deleted in Google Calendar, re-create it
        if (updateErr.code === 404 || updateErr.code === 410) {
          eventId = null;
        } else {
          throw updateErr;
        }
      }
    }

    const insertRes = await calendar.events.insert({
      calendarId,
      requestBody: eventPayload
    });

    const newEventId = insertRes.data.id;

    // Persist googleCalendarEventId on the booking document
    await Application.updateOne(
      { _id: booking._id || booking.id },
      { $set: { googleCalendarEventId: newEventId } }
    );

    console.log(`[GoogleCalendar] Synced booking ${displayId} → Event ${newEventId}`);
    return newEventId;
  } catch (err) {
    console.error("[GoogleCalendar] Failed to sync booking to Google Calendar:", err.message);
    return null;
  }
}

/**
 * Pushes a scheduled equipment maintenance out-of-service event to Google Calendar.
 * Wrapped in try/catch so maintenance scheduling is never blocked.
 * @param {object} maintenance - Mongoose MachineryMaintenance document
 * @param {object} [preferredManager]
 * @returns {Promise<string|null>} The googleCalendarEventId or null
 */
async function syncMaintenanceToGoogleCalendar(maintenance, preferredManager) {
  try {
    const manager = await getConnectedManager(preferredManager);
    if (!manager) return null;

    const calendar = getCalendarClient(manager);
    const calendarId = manager.googleOAuth?.calendarId || manager.calendarId || "primary";

    const eventPayload = {
      summary: `🔧 Maintenance / Out of Service: ${maintenance.equipmentName} (${maintenance.equipmentUnitId})`,
      description: [
        `Cooperative Fleet Maintenance Schedule`,
        `Equipment: ${maintenance.equipmentName} (${maintenance.equipmentUnitId})`,
        `Type: ${maintenance.maintenanceType}`,
        `Status: ${maintenance.status}`,
        `Assigned Mechanic: ${maintenance.assignedMechanic}`,
        `Reason / Notes: ${maintenance.reason}`,
        `Scheduled Range: ${maintenance.startDate} to ${maintenance.endDate}`
      ].join("\n"),
      start: { date: maintenance.startDate },
      end: { date: toExclusiveEndDate(maintenance.endDate) },
      colorId: "11", // Red/Tomato color in Google Calendar
      extendedProperties: {
        private: {
          mindersType: "maintenance",
          maintenanceId: String(maintenance._id || maintenance.id),
          equipmentUnitId: String(maintenance.equipmentUnitId)
        }
      }
    };

    let eventId = maintenance.googleCalendarEventId;

    if (eventId) {
      try {
        const updateRes = await calendar.events.update({
          calendarId,
          eventId,
          requestBody: eventPayload
        });
        return updateRes.data.id;
      } catch (err) {
        if (err.code !== 404 && err.code !== 410) throw err;
      }
    }

    const insertRes = await calendar.events.insert({
      calendarId,
      requestBody: eventPayload
    });

    const newEventId = insertRes.data.id;
    await MachineryMaintenance.updateOne(
      { _id: maintenance._id || maintenance.id },
      { $set: { googleCalendarEventId: newEventId } }
    );

    console.log(`[GoogleCalendar] Synced maintenance ${maintenance.equipmentUnitId} → Event ${newEventId}`);
    return newEventId;
  } catch (err) {
    console.error("[GoogleCalendar] Failed to sync maintenance to Google Calendar:", err.message);
    return null;
  }
}

/**
 * Handles incoming Google Calendar push notification webhooks.
 * Looks up the Manager by channelId, fetches recently modified events using calendar.events.list with updatedMin,
 * and updates corresponding booking dates in MongoDB.
 * @param {object} headers - HTTP request headers
 * @returns {Promise<object>} Processing summary
 */
async function handleCalendarWebhook(headers) {
  const channelId = headers["x-goog-channel-id"];
  const resourceState = headers["x-goog-resource-state"];

  if (!channelId) {
    return { ok: false, message: "Missing x-goog-channel-id header" };
  }

  // Google sends a 'sync' handshake when the watch channel is established
  if (resourceState === "sync") {
    console.log(`[GoogleCalendar] Handshake sync received for channel ${channelId}`);
    return { ok: true, state: "sync", message: "Channel handshake verified" };
  }

  // Look up manager by channelId
  const manager = await Account.findOne({
    role: { $in: ["manager", "admin"] },
    $or: [
      { "googleOAuth.channelId": channelId },
      { channelId: channelId }
    ]
  });

  if (!manager) {
    console.warn(`[GoogleCalendar] No manager associated with channelId ${channelId}`);
    return { ok: false, message: "Channel not found" };
  }

  try {
    const calendar = getCalendarClient(manager);
    const calendarId = manager.googleOAuth?.calendarId || manager.calendarId || "primary";

    // Query events updated in the past 15 minutes
    const updatedMin = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const listRes = await calendar.events.list({
      calendarId,
      updatedMin,
      singleEvents: true,
      maxResults: 50
    });

    const items = listRes.data.items || [];
    let updatedCount = 0;

    for (const event of items) {
      if (!event.id) continue;

      // Check if this event corresponds to a Booking (Application)
      const booking = await Application.findOne({ googleCalendarEventId: event.id });
      if (booking) {
        let newStartDate = "";
        let newEndDate = "";

        if (event.start?.date) {
          newStartDate = event.start.date;
          newEndDate = toInclusiveEndDate(event.end?.date || event.start.date);
        } else if (event.start?.dateTime) {
          newStartDate = event.start.dateTime.slice(0, 10);
          newEndDate = (event.end?.dateTime || event.start.dateTime).slice(0, 10);
        }

        if (newStartDate && newEndDate && (booking.startDate !== newStartDate || booking.endDate !== newEndDate)) {
          const oldRange = `${booking.startDate} to ${booking.endDate}`;
          booking.startDate = newStartDate;
          booking.endDate = newEndDate;
          await booking.save();
          updatedCount++;
          console.log(`[GoogleCalendar Webhook] Updated booking ${booking._id} dates from Google: ${oldRange} → ${newStartDate} to ${newEndDate}`);
        }
        continue;
      }

      // Check if this event corresponds to a Maintenance Record
      const maintenance = await MachineryMaintenance.findOne({ googleCalendarEventId: event.id });
      if (maintenance) {
        let newStartDate = "";
        let newEndDate = "";

        if (event.start?.date) {
          newStartDate = event.start.date;
          newEndDate = toInclusiveEndDate(event.end?.date || event.start.date);
        } else if (event.start?.dateTime) {
          newStartDate = event.start.dateTime.slice(0, 10);
          newEndDate = (event.end?.dateTime || event.start.dateTime).slice(0, 10);
        }

        if (newStartDate && newEndDate && (maintenance.startDate !== newStartDate || maintenance.endDate !== newEndDate)) {
          maintenance.startDate = newStartDate;
          maintenance.endDate = newEndDate;
          await maintenance.save();
          updatedCount++;
          console.log(`[GoogleCalendar Webhook] Updated maintenance ${maintenance._id} dates from Google: ${newStartDate} to ${newEndDate}`);
        }
      }
    }

    return { ok: true, channelId, updatedEventsCount: updatedCount };
  } catch (err) {
    console.error("[GoogleCalendar Webhook] Error processing event updates:", err.message);
    return { ok: false, error: err.message };
  }
}

async function getManagerSyncStatus(manager) {
  const ref = manager.googleOAuth?.refreshToken || manager.refreshToken;
  const isConnected = Boolean(ref);

  return {
    ok: true,
    connected: isConnected,
    isConnected,
    email: manager.email || "",
    calendarId: manager.googleOAuth?.calendarId || manager.calendarId || "primary",
    channelId: manager.googleOAuth?.channelId || manager.channelId || null,
    connectedAt: manager.googleOAuth?.connectedAt || null,
    channelExpiration: manager.googleOAuth?.channelExpiration || null
  };
}

/**
 * Disconnects Google Calendar integration for a manager.
 */
async function disconnectManagerCalendar(managerId) {
  const manager = await Account.findById(managerId);
  if (!manager) throw new Error("Manager not found.");

  // If there's an active watch channel, attempt to stop it
  try {
    const channelId = manager.googleOAuth?.channelId || manager.channelId;
    const resourceId = manager.googleOAuth?.resourceId || manager.resourceId;
    if (channelId && resourceId) {
      const calendar = getCalendarClient(manager);
      await calendar.channels.stop({
        requestBody: { id: channelId, resourceId }
      });
    }
  } catch (err) {
    // Ignore channel stop errors (channel may have expired)
  }

  await Account.updateOne(
    { _id: managerId },
    {
      $set: {
        "googleOAuth.accessToken": "",
        "googleOAuth.refreshToken": "",
        "googleOAuth.channelId": "",
        "googleOAuth.resourceId": "",
        "googleOAuth.connectedAt": null,
        "googleOAuth.channelExpiration": null,
        accessToken: "",
        refreshToken: "",
        channelId: "",
        resourceId: ""
      }
    }
  );

  return { success: true };
}

module.exports = {
  createOAuth2Client,
  generateAuthUrl,
  exchangeCodeAndSave,
  getConnectedManager,
  getCalendarClient,
  watchManagerCalendar,
  syncBookingToGoogleCalendar,
  syncMaintenanceToGoogleCalendar,
  handleCalendarWebhook,
  getManagerSyncStatus,
  disconnectManagerCalendar,
  toExclusiveEndDate,
  toInclusiveEndDate
};
