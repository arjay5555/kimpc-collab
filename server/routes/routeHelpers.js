const jwt = require("jsonwebtoken");
const Account = require("../models/Account");
const SystemSetting = require("../models/SystemSetting");

const JWT_SECRET = require("../config/jwtSecret");
const ROLES = ["member", "manager", "admin"];
const PROFILE_FIELDS = ["fullName", "email", "phone", "avatar", "address", "address2", "city", "region", "postalCode", "country"];
const STATUSES = ["Pending", "Approved", "Checked-Out", "Returned", "Rejected", "Cancelled", "Cancellation Requested"];

const clean = (value) => String(value ?? "").trim();
const cleanEmail = (value) => clean(value).toLowerCase();
const fail = (res, status, error) => res.status(status).json({ error });

async function getSystemSetting(key, defaultValue) {
  try {
    const doc = await SystemSetting.findOne({ key });
    if (!doc) return defaultValue;
    return doc.value;
  } catch (err) {
    console.error(`Error loading setting "${key}":`, err);
    return defaultValue;
  }
}

async function setSystemSetting(key, value, description = "", updatedBy = "system") {
  return await SystemSetting.findOneAndUpdate(
    { key },
    { key, value, description, updatedBy },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function generateUserToken(account, extra = {}, options = {}) {
  const accObj = account.toObject ? account.toObject() : account;
  const expiresIn = options.expiresIn || "8h";
  return jwt.sign(
    {
      id: String(accObj._id || accObj.id),
      email: accObj.email,
      role: Account.effectiveRole(accObj),
      fullName: accObj.fullName,
      tokenVersion: typeof accObj.tokenVersion === "number" ? accObj.tokenVersion : 0,
      // Covering members carry their feature access so the client can shape the portal.
      ...(Account.hasActiveManagerCover(accObj)
        ? {
            coverPermissions: accObj.managerCover.permissions || {},
            coverAt: new Date(accObj.managerCover.assignedAt).getTime() || 0,
          }
        : {}),
      ...extra,
    },
    JWT_SECRET,
    { expiresIn }
  );
}

function requireAdmin(req, res, next) {
  const authenticate = require("../middleware/authenticate");
  const finish = () => {
    const user = req.user;
    if (!user || user.role !== "admin" || user.isSuspended || user.isArchived) {
      return fail(res, 403, "Access denied. Valid administrator credentials required.");
    }
    req.admin = user;
    return next();
  };
  // Re-use an already-authenticated user; otherwise run full JWT + tokenVersion verification.
  if (req.user) return finish();
  return authenticate(req, res, (err) => (err ? next(err) : finish()));
}

async function verifyRecaptcha(token) {
  if (process.env.RECAPTCHA_ENABLED === "false") return true;
  const recaptchaEnabled = await getSystemSetting("recaptchaEnabled", true);
  if (!recaptchaEnabled) return true;
  if (!token) return false;
  if (process.env.RECAPTCHA_ALLOW_TEST_TOKENS === "true" && (token === "test" || token === "bypass")) return true;

  const { getEffectiveRecaptchaKeys } = require("../services/apiKeyManager");
  const { secretKey: secret } = await getEffectiveRecaptchaKeys();
  try {
    const params = new URLSearchParams({ secret, response: token });
    const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await verifyRes.json();
    return Boolean(data.success);
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return false;
  }
}

async function nextCooperativeId() {
  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `M${year}`;
  const regex = new RegExp(`^${prefix}(\\d{4})$`, "i");
  const accounts = await Account.find({ cooperativeId: regex }).select("cooperativeId").lean();
  const highest = accounts.reduce((max, a) => {
    const seq = parseInt(String(a.cooperativeId || "").slice(3), 10);
    return isNaN(seq) ? max : Math.max(max, seq);
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

// Helper to determine if an application or maintenance record refers to the same machinery unit
function isSameMachineryMatch(appMachineryUnitId, appEquipment, targetUnitId, targetEquipment) {
  const u1 = (appMachineryUnitId || "").trim().toUpperCase();
  const u2 = (targetUnitId || "").trim().toUpperCase();
  if (u1 && u2 && u1 === u2) return true;

  const e1 = (appEquipment || "").trim().toLowerCase();
  const e2 = (targetEquipment || "").trim().toLowerCase();
  if (e1 && e2 && (e1 === e2 || e1.includes(e2) || e2.includes(e1))) return true;

  return false;
}

module.exports = {
  JWT_SECRET,
  ROLES,
  PROFILE_FIELDS,
  STATUSES,
  clean,
  cleanEmail,
  fail,
  getSystemSetting,
  setSystemSetting,
  generateUserToken,
  requireAdmin,
  verifyRecaptcha,
  nextCooperativeId,
  isSameMachineryMatch,
};
