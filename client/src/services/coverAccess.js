import { getAuthToken } from "./api";

// Mirrors server/config/managerCoverAccess.js. viewOnly pages have nothing to edit.
export const COVER_FEATURES = [
  { key: "dashboard", label: "Dashboard", path: "/manager", viewOnly: true },
  { key: "bookings", label: "Booking Approvals", path: "/booking-approvals" },
  { key: "units", label: "Machinery Units", path: "/manager/units" },
  { key: "calendar", label: "Calendar", path: "/manager/calendar" },
  { key: "drivers", label: "Drivers", path: "/manager/drivers" },
  { key: "payments", label: "Payments", path: "/manager/financials/payments" },
  { key: "expenses", label: "Expenses", path: "/manager/financials/expenses", viewOnly: true },
  { key: "reports", label: "Reports", path: "/manager/reports", viewOnly: true },
  { key: "auditLogs", label: "Audit Logs", path: "/manager/audit-logs", viewOnly: true },
];

const PATH_FEATURES = [
  [/^\/manager\/?$/, "dashboard"],
  [/^\/(booking-approvals|manager\/bookings)/, "bookings"],
  [/^\/(manager\/)?units/, "units"],
  [/^\/(manager\/)?calendar/, "calendar"],
  [/^\/(manager\/)?drivers/, "drivers"],
  [/^\/(manager\/)?(financials\/)?expenses/, "expenses"],
  [/^\/(manager\/)?(financials(\/payments)?|payments)\/?$/, "payments"],
  [/^\/(manager\/)?reports/, "reports"],
  [/^\/manager\/audit-logs/, "auditLogs"],
];

/** Feature access for a member covering for the manager, or null for regular managers/admins (full access). */
export function getCoverPermissions() {
  try {
    const part = (getAuthToken() || "").split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.coverPermissions || null;
  } catch {
    return null;
  }
}

export const featureForPath = (pathname) => PATH_FEATURES.find(([re]) => re.test(pathname))?.[1] || null;

/** "edit" | "view" | null for a feature; regular managers always get "edit". */
export function accessFor(feature, perms = getCoverPermissions()) {
  if (!perms) return "edit";
  return perms[feature] || null;
}

export function firstAllowedPath(perms = getCoverPermissions()) {
  return COVER_FEATURES.find((f) => accessFor(f.key, perms))?.path || "/member";
}
