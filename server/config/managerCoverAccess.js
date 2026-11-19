// Per-feature access for members covering for the manager (Account.managerCover.permissions).
// permissions = { [feature]: "view" | "edit" }; a missing feature means no access.

const FEATURES = ["dashboard", "bookings", "units", "calendar", "drivers", "payments", "expenses", "reports", "auditLogs"];
// These pages have nothing to edit, so "edit" is never granted for them.
const VIEW_ONLY_FEATURES = ["dashboard", "expenses", "reports", "auditLogs"];

// Paths are relative to /api with no query string. First matching rule wins.
const READ_RULES = [
  { re: /^\/admin\/audit-logs\/?$/, features: ["auditLogs"], role: "admin" },
  { re: /^\/manager\/dashboard(\/|$)/, features: ["dashboard"] },
  { re: /^\/weather(\/|$)/, features: ["dashboard"] },
  { re: /^\/manager\/reports(\/|$)/, features: ["reports"] },
  { re: /^\/manager\/members(\/|$)/, features: ["bookings"] },
  { re: /^\/manager\/bookings(\/|$)/, features: ["bookings"] },
  { re: /^\/manager\/machinery/, features: ["units"] },
  { re: /^\/applications(\/|$)/, features: ["bookings", "payments", "expenses", "calendar", "drivers"] },
  { re: /^\/machinery-units(\/|$)/, features: ["units", "bookings", "drivers"] },
  { re: /^\/drivers(\/|$)/, features: ["drivers", "units"] },
  { re: /^\/calendar(\/|$)/, features: ["calendar"] },
];

const WRITE_RULES = [
  { re: /^\/applications\/[^/]+\/(payments|void-payment|refunds|refund-determination|review-flagged-payment)$/, features: ["payments"] },
  { re: /^\/applications\/[^/]+\/scan-gcash$/, features: ["payments", "bookings"] },
  { re: /^\/applications\/[^/]+\/(grant-cancellation|decline-cancellation|inspection)$/, features: ["bookings"] },
  { re: /^\/applications(\/[^/]+)?$/, features: ["bookings"] },
  { re: /^\/manager\/bookings\//, features: ["bookings"] },
  { re: /^\/(manager\/)?pos-booking$/, features: ["bookings"] },
  { re: /^\/manager\/pos-settlement$/, features: ["payments"] },
  { re: /^\/ocr\/gcash$/, features: ["bookings", "payments"] },
  { re: /^\/(machinery-units\/upload-photo|upload\/image)$/, features: ["units", "drivers"] },
  { re: /^\/machinery-units(\/|$)/, features: ["units"] },
  { re: /^\/manager\/machinery/, features: ["units"] },
  { re: /^\/drivers(\/|$)/, features: ["drivers"] },
  { re: /^\/calendar\/(sync-now|disconnect)$/, features: ["calendar"] },
];

/** Keep only known features and allowed levels; drops "edit" on view-only pages. */
function sanitizePermissions(input) {
  const out = {};
  for (const feature of FEATURES) {
    let level = input?.[feature];
    if (level === "edit" && VIEW_ONLY_FEATURES.includes(feature)) level = "view";
    if (level === "view" || level === "edit") out[feature] = level;
  }
  return out;
}

/**
 * Decide how a covering member's request is treated.
 * Returns { role } to act with that role, { deny } to block, or {} to act as a plain member.
 */
function resolveCoverAccess(permissions, method, path) {
  const isRead = method === "GET" || method === "HEAD";
  const rule = (isRead ? READ_RULES : WRITE_RULES).find((r) => r.re.test(path));
  if (!rule) return {};
  const ok = rule.features.some((f) => (isRead ? Boolean(permissions?.[f]) : permissions?.[f] === "edit"));
  if (ok) return { role: rule.role || "manager" };
  // Reads fall back to member behaviour (own data only); writes are blocked outright.
  return isRead ? {} : { deny: "You have view-only or no access to this feature. Ask an administrator for edit access." };
}

module.exports = { FEATURES, VIEW_ONLY_FEATURES, sanitizePermissions, resolveCoverAccess };
