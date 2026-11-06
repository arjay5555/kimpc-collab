/**
 * OneSignal Web Push Client Helper
 * Connects members with OneSignal push notifications for live booking status updates.
 */

const ONESIGNAL_APP_ID =
  import.meta.env.VITE_ONESIGNAL_APP_ID || "fc811113-559c-40c3-ba59-e703db896839";

let isInitialized = false;

/**
 * Initializes OneSignal Web Push SDK and binds the logged-in member.
 * @param {Object} user - Authenticated user object containing email
 */
export function initOneSignal(user) {
  if (typeof window === "undefined") return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    if (!isInitialized) {
      try {
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          notifyButton: {
            enable: false, // We control the push experience cleanly via Settings
          },
          allowLocalhostAsSecureOrigin: true, // Allows testing on localhost
        });
        isInitialized = true;
      } catch (err) {
        console.warn("[OneSignal] Client init warning:", err.message);
      }
    }

    if (user?.email) {
      try {
        const cleanEmail = String(user.email).trim().toLowerCase();
        await OneSignal.login(cleanEmail);
      } catch (err) {
        console.warn("[OneSignal] Login link warning:", err.message);
      }
    }
  });
}

/**
 * Checks if Web Push is supported by the user's browser
 */
export function isPushSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

/**
 * Retrieves current browser permission and OneSignal subscription status
 */
export function getPushStatus() {
  return new Promise((resolve) => {
    if (!isPushSupported()) {
      return resolve({ supported: false, permission: "unsupported", optedIn: false });
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function (OneSignal) {
      try {
        const permission = Notification.permission;
        const optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
        resolve({
          supported: true,
          permission,
          optedIn: permission === "granted" && optedIn,
        });
      } catch {
        resolve({
          supported: true,
          permission: Notification.permission,
          optedIn: Notification.permission === "granted",
        });
      }
    });
  });
}

/**
 * Toggles OneSignal Web Push on or off.
 * When enabling, prompts browser for notification permission if not yet granted.
 *
 * @param {boolean} enable
 * @returns {Promise<{ ok: boolean, permission: string, error?: string }>}
 */
export function setPushEnabled(enable) {
  return new Promise((resolve) => {
    if (!isPushSupported()) {
      return resolve({ ok: false, permission: "unsupported", error: "Push notifications are not supported in this browser." });
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        if (enable) {
          // Request browser permission if default
          let permissionResult = Notification.permission;
          if (permissionResult !== "granted") {
            try {
              if (OneSignal.Notifications?.requestPermission) {
                await OneSignal.Notifications.requestPermission();
              } else if (Notification.requestPermission) {
                await Notification.requestPermission();
              }
            } catch (permErr) {
              console.warn("[OneSignal] Permission request error:", permErr);
            }
            permissionResult = Notification.permission;
          }

          if (permissionResult === "denied") {
            return resolve({
              ok: false,
              permission: "denied",
              error: "Notifications are blocked in your browser. Please allow notifications in site settings.",
            });
          }

          // Opt in subscription in OneSignal
          if (OneSignal.User?.PushSubscription?.optIn) {
            await OneSignal.User.PushSubscription.optIn();
          }

          return resolve({
            ok: permissionResult === "granted",
            permission: permissionResult,
          });
        } else {
          // Opt out of push notifications
          if (OneSignal.User?.PushSubscription?.optOut) {
            await OneSignal.User.PushSubscription.optOut();
          }
          return resolve({ ok: true, permission: Notification.permission });
        }
      } catch (err) {
        console.error("[OneSignal] Toggle push error:", err);
        return resolve({ ok: false, permission: Notification.permission, error: err.message });
      }
    });
  });
}

/**
 * Unlinks the OneSignal session on logout
 */
export function logoutOneSignal() {
  if (typeof window === "undefined") return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    try {
      if (OneSignal.logout) {
        await OneSignal.logout();
      }
    } catch (err) {
      console.warn("[OneSignal] Logout warning:", err.message);
    }
  });
}
