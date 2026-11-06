const https = require("https");
const Account = require("../models/Account");
const SystemSetting = require("../models/SystemSetting");
const { getEffectiveOneSignalKeys } = require("./apiKeyManager");

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
            resolve({ ok: true, status: res.statusCode, data: parsed });
          } else {
            resolve({ ok: false, status: res.statusCode, error: parsed.errors || parsed.message || body });
          }
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: `Invalid JSON response: ${body}` });
        }
      });
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
  const fallbackUrl = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/member/bookings`
    : "http://localhost:5173/member/bookings";

  const targetUrl = url || fallbackUrl;

  const notificationPayload = {
    app_id: appId,
    include_aliases: {
      external_id: [targetEmail],
    },
    target_channel: "push",
    headings: { en: title || "KIMPC Booking Update" },
    contents: { en: message || "You have an update on your equipment booking." },
    url: targetUrl,
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

  const appUrl = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL}/member/bookings`
    : "http://localhost:5173/member/bookings";

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

module.exports = {
  isConfigured,
  sendPushNotification,
  sendBookingStatusPush,
};
