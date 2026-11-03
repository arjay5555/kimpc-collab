/**
 * KIMPC Theme Management Service
 * Supports 'light', 'dark', and 'device' (follows system OS preference).
 */

let mediaQueryListener = null;

export function getStoredTheme() {
  return localStorage.getItem("kimpc-theme") || "light";
}

function resolveDeviceTheme() {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(mode) {
  const effectiveTheme = mode === "device" ? resolveDeviceTheme() : mode;

  // Clean up existing media query listener if any
  if (mediaQueryListener && typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.removeEventListener("change", mediaQueryListener);
    mediaQueryListener = null;
  }

  // If follow device is active, listen to OS theme changes in real time
  if (mode === "device" && typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQueryListener = (e) => {
      const newTheme = e.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", newTheme);
      document.body.setAttribute("data-theme", newTheme);
      window.dispatchEvent(new CustomEvent("kimpc-theme-change", { detail: { mode: "device", effective: newTheme } }));
    };
    mq.addEventListener("change", mediaQueryListener);
  }

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    document.body.setAttribute("data-theme", effectiveTheme);
  }

  localStorage.setItem("kimpc-theme", mode);
  window.dispatchEvent(new CustomEvent("kimpc-theme-change", { detail: { mode, effective: effectiveTheme } }));
  return effectiveTheme;
}

export function initTheme() {
  const stored = getStoredTheme();
  return applyTheme(stored);
}

// Auto-initialize on import
initTheme();
