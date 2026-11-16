const https = require("https");
const Account = require("../models/Account");
const SystemSetting = require("../models/SystemSetting");
const { getEffectiveOneSignalKeys } = require("./apiKeyManager");
const { sendMemberNotificationEmail } = require("./mailer");

/**
 * Checks if OneSignal credentials are fully configured (custom or code default)
 */
async function isConfigured() {
  const { appId, restApiKey } = await getEffectiveOneSignalKeys();
  return Boolean(appId && restApiKey);
}

/**
 * Low-level REST API call to OneSignal
 */
function makeOneSignalRequest(path, method, payload, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : "";
    const options = {
      hostname: "api.onesignal.com",
      port: 443,
      path,
      method: method || "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${apiKey}`,
      },
    };

    if (postData) {
      options.headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (Array.isArray(parsed.errors) && parsed.errors.length > 0 && !parsed.id) {
              resolve({
                ok: false,
                status: res.statusCode,
                error: parsed.errors.join("; "),
                data: parsed,
              });
            } else if (parsed.errors && typeof parsed.errors === "object" && !Array.isArray(parsed.errors) && !parsed.id) {
              const errMsg = Object.values(parsed.errors).flat().join("; ");
              resolve({
                ok: false,
                status: res.statusCode,
                error: errMsg || "OneSignal rejected the notification.",
                data: parsed,
              });
            } else {
              resolve({ ok: true, status: res.statusCode, data: parsed });
            }
          } else {
            const errMsg = Array.isArray(parsed.errors)
              ? parsed.errors.join("; ")
              : parsed.errors || parsed.message || body;
            resolve({ ok: false, status: res.statusCode, error: errMsg });
          }
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: `Invalid JSON response: ${body}` });
        }
      });
    });

    req.setTimeout(8000, () => {
      req.destroy(new Error("OneSignal API request timed out."));
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Sends a Web Push Notification to a member by email (external_id).
 * Respects the user's Settings toggle (memberSettings.notifications.push).
 *
 * @param {Object} params
 * @param {string} params.email - Member email address
 * @param {string} params.title - Notification heading
 * @param {string} params.message - Notification body
 * @param {string} [params.url] - Deep link URL on notification click
 * @param {Object} [params.data] - Additional metadata payload
 */
async function sendPushNotification({ email, title, message, url, data = {} }) {
  // Check system setting toggle
  try {
    const settingDoc = await SystemSetting.findOne({ key: "oneSignalEnabled" });
    if (settingDoc && settingDoc.value === false) {
      console.log("[OneSignal] Skipping push: OneSignal service is disabled in System Settings.");
      return { ok: true, skipped: true, reason: "disabled_by_admin" };
    }
  } catch (err) {
    // Proceed if db check fails
  }

  const { appId, restApiKey } = await getEffectiveOneSignalKeys();
  if (!appId || !restApiKey) {
    console.warn("[OneSignal] Skipping push: OneSignal credentials not configured.");
    return { ok: false, error: "OneSignal is not configured." };
  }

  const targetEmail = String(email || "").trim().toLowerCase();
  if (!targetEmail) {
    return { ok: false, error: "No target email provided for push notification." };
  }

  // 1. Check user notification settings in MongoDB
  try {
    const user = await Account.findOne({ email: targetEmail }).select("memberSettings").lean();
    if (user?.memberSettings?.notifications?.push === false) {
      console.log(`[OneSignal] Skipped push to ${targetEmail}: member turned OFF push notifications in Settings.`);
      return { ok: true, skipped: true, reason: "disabled_by_user" };
    }
  } catch (err) {
    console.warn(`[OneSignal] Could not verify user push preference for ${targetEmail}:`, err.message);
  }

  // 2. Prepare payload
  const baseOrigin = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const fallbackUrl = `${baseOrigin}/member/bookings`;

  const targetUrl = url || fallbackUrl;

  const notificationPayload = {
    app_id: appId,
    include_aliases: {
      external_id: [targetEmail],
    },
    target_channel: "push",
    headings: { en: title || "KIMPC Booking Update" },
    contents: { en: message || "You have an update on your equipment booking." },
    web_url: targetUrl,
    data: {
      ...data,
      recipientEmail: targetEmail,
      timestamp: new Date().toISOString(),
    },
  };

  try {
    const result = await makeOneSignalRequest("/notifications", "POST", notificationPayload, restApiKey);
    if (result.ok) {
      console.log(`[OneSignal] Successfully sent push notification to ${targetEmail} (id: ${result.data?.id || "queued"})`);
    } else {
      console.warn(`[OneSignal] Push warning for ${targetEmail}:`, result.error);
    }
    return result;
  } catch (err) {
    console.error(`[OneSignal] Failed to send push notification to ${targetEmail}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * High-level helper to dispatch booking status push notifications
 *
 * @param {Object} application - Application document or plain object
 * @param {string} status - New status or event name
 * @param {string} [customMessage] - Optional custom message or remarks
 */
async function sendBookingStatusPush(application, status, customMessage = "") {
  if (!application || !application.memberEmail) return;

  const equipment = application.equipment || "Machinery";
  const dateRange = application.startDate && application.endDate ? ` (${application.startDate} – ${application.endDate})` : "";
  let title = "Booking Status Update";
  let message = `Your booking for ${equipment} has been updated to ${status}.`;

  switch (status) {
    case "Approved":
      title = "Booking Approved! 🎉";
      message = `Your booking for ${equipment}${dateRange} has been approved by KIMPC management.`;
      break;

    case "Rejected":
      title = "Booking Request Update";
      message = `Your booking request for ${equipment} was declined.${customMessage ? ` Reason: ${customMessage}` : ""}`;
      break;

    case "Checked-Out":
      title = "Machinery Dispatched / Ready 🚜";
      message = `Your booked ${equipment} has been dispatched. Assigned Driver: ${application.assignedDriver || "Pending handover"}.`;
      break;

    case "Returned":
      title = "Machinery Return Completed ✅";
      message = `Your return of ${equipment} has been inspected and confirmed. Thank you!`;
      break;

    case "Rescheduled":
      title = "Booking Rescheduled 📅";
      message = `Your booking schedule for ${equipment} was updated to ${application.startDate} – ${application.endDate}.`;
      break;

    case "Cancellation Granted":
      title = "Cancellation Request Granted";
      message = `Your cancellation request for ${equipment}${dateRange} was approved by KIMPC management.`;
      break;

    case "Cancellation Declined":
      title = "Cancellation Request Update";
      message = `Your cancellation request for ${equipment} was declined.${customMessage ? ` ${customMessage}` : " The booking remains confirmed."}`;
      break;

    case "Cancelled":
      title = "Booking Cancelled";
      message = `Your booking for ${equipment} has been cancelled.${customMessage ? ` Reason: ${customMessage}` : ""}`;
      break;

    default:
      title = `Booking ${status}`;
      message = `Your booking for ${equipment} is now ${status}.`;
  }

  const baseOrigin = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const appUrl = `${baseOrigin}/member/bookings`;
  const cleanEmail = String(application.memberEmail || "").trim().toLowerCase();

  try {
    const member = await Account.findOne({ email: cleanEmail }).select("fullName memberSettings").lean();
    if (member?.memberSettings?.notifications?.email !== false) {
      sendMemberNotificationEmail({
        toEmail: cleanEmail,
        fullName: member?.fullName || application.memberName || "Member",
        title,
        message,
        actionUrl: appUrl,
        category: "Booking Update",
      }).catch((err) => {
        console.warn(`[Mailer] Background booking status email warning for ${cleanEmail}:`, err.message);
      });
    }
  } catch (err) {
    console.warn(`[Mailer] Could not check email preference for ${cleanEmail}:`, err.message);
  }

  return sendPushNotification({
    email: application.memberEmail,
    title,
    message,
    url: appUrl,
    data: {
      applicationId: String(application._id || application.id || ""),
      status,
      equipment,
    },
  });
}

async function getOneSignalWebStatus() {
  const { appId, restApiKey } = await getEffectiveOneSignalKeys();
  if (!appId || !restApiKey) {
    return { configured: false, webConfigured: false, players: 0 };
  }
  try {
    const res = await makeOneSignalRequest(`/apps/${encodeURIComponent(appId)}`, "GET", null, restApiKey);
    if (!res.ok || !res.data) {
      return { configured: true, webConfigured: null, players: null };
    }
    const webConfigured = Boolean(
      res.data.chrome_web_origin ||
        res.data.chrome_web_sub_domain ||
        res.data.safari_site_origin
    );
    return {
      configured: true,
      webConfigured,
      chromeWebOrigin: res.data.chrome_web_origin || null,
      players: Number(res.data.players || 0),
      messageablePlayers: Number(res.data.messageable_players || 0),
    };
  } catch {
    return { configured: true, webConfigured: null, players: null };
  }
}

module.exports = {
  isConfigured,
  sendPushNotification,
  sendBookingStatusPush,
  getOneSignalWebStatus,
};
