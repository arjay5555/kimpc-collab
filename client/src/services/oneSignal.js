/**
 * OneSignal Web Push Client Helper
 * Connects members with OneSignal push notifications for live booking status updates.
 */

const FALLBACK_ONESIGNAL_APP_ID =
  import.meta.env.VITE_ONESIGNAL_APP_ID || "fc811113-559c-40c3-ba59-e703db896839";

let isInitialized = false;
let initPromise = null;
let cachedAppId = null;

async function resolveOneSignalAppId() {
  if (cachedAppId) return cachedAppId;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("/api/config", { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.oneSignalAppId) {
        cachedAppId = String(data.oneSignalAppId).trim();
        return cachedAppId;
      }
    }
  } catch {
    // Fallback to build-time env/default
  }
  return FALLBACK_ONESIGNAL_APP_ID;
}

async function ensureOneSignalInitialized(OneSignal) {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const appId = await resolveOneSignalAppId();
        await OneSignal.init({
          appId,
          notifyButton: {
            enable: false, // We control the push experience cleanly via Settings
          },
          allowLocalhostAsSecureOrigin: true, // Allows testing on localhost
        });
        isInitialized = true;
      } catch (err) {
        console.warn("[OneSignal] Client init warning:", err.message);
      }
    })();
  }
  await initPromise;
}

/**
 * Initializes OneSignal Web Push SDK and binds the logged-in member.
 * @param {Object} user - Authenticated user object containing email
 */
export function initOneSignal(user) {
  if (typeof window === "undefined") return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal) {
    await ensureOneSignalInitialized(OneSignal);

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

const ONESIGNAL_SDK_TIMEOUT_MS = 3500;

/**
 * Retrieves current browser permission and OneSignal subscription status
 * without hanging if the OneSignal CDN script is slow or blocked.
 */
export function getPushStatus() {
  return new Promise((resolve) => {
    if (!isPushSupported()) {
      return resolve({ supported: false, permission: "unsupported", optedIn: false });
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      const permission = Notification.permission;
      finish({
        supported: true,
        permission,
        optedIn: permission === "granted",
      });
    }, ONESIGNAL_SDK_TIMEOUT_MS);

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await ensureOneSignalInitialized(OneSignal);
        const permission = Notification.permission;
        const optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
        const subscriptionId = OneSignal.User?.PushSubscription?.id || null;
        finish({
          supported: true,
          permission,
          optedIn: permission === "granted" && optedIn,
          subscriptionId,
        });
      } catch {
        finish({
          supported: true,
          permission: Notification.permission,
          optedIn: Notification.permission === "granted",
          subscriptionId: null,
        });
      }
    });
  });
}

/**
 * Toggles OneSignal Web Push on or off.
 * When enabling, prompts browser for notification permission if not yet granted.
 * Bounded by a timeout so UI controls never stall if OneSignal SDK fails to load.
 *
 * @param {boolean} enable
 * @returns {Promise<{ ok: boolean, permission: string, error?: string }>}
 */
export function setPushEnabled(enable) {
  return new Promise((resolve) => {
    if (!isPushSupported()) {
      return resolve({ ok: false, permission: "unsupported", error: "Push notifications are not supported in this browser." });
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(async () => {
      if (!enable) {
        return finish({ ok: true, permission: Notification.permission });
      }
      let permission = Notification.permission;
      if (permission === "default" && typeof Notification.requestPermission === "function") {
        try {
          permission = await Notification.requestPermission();
        } catch {
          permission = Notification.permission;
        }
      }
      finish({
        ok: permission === "granted",
        permission,
        ...(permission === "denied"
          ? { error: "Notifications are blocked in your browser. Please allow notifications in site settings." }
          : {}),
      });
    }, ONESIGNAL_SDK_TIMEOUT_MS);

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await ensureOneSignalInitialized(OneSignal);
        if (enable) {
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
            return finish({
              ok: false,
              permission: "denied",
              error: "Notifications are blocked in your browser. Please allow notifications in site settings.",
            });
          }

          if (OneSignal.User?.PushSubscription?.optIn) {
            await OneSignal.User.PushSubscription.optIn();
          }

          return finish({
            ok: permissionResult === "granted",
            permission: permissionResult,
          });
        } else {
          if (OneSignal.User?.PushSubscription?.optOut) {
            await OneSignal.User.PushSubscription.optOut();
          }
          return finish({ ok: true, permission: Notification.permission });
        }
      } catch (err) {
        console.error("[OneSignal] Toggle push error:", err);
        return finish({ ok: false, permission: Notification.permission, error: err.message });
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

