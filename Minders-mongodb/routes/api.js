const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const Application = require("../models/Application");
const AuditLog = require("../models/AuditLog");
const MachineryMaintenance = require("../models/MachineryMaintenance");
const MachineryUnit = require("../models/MachineryUnit");
const Transaction = require("../models/Transaction");
const SystemSetting = require("../models/SystemSetting");
const jwt = require("jsonwebtoken");
const { logAudit, logSystemEvent } = require("../services/auditLogger");
const { sendDeleteOtpEmail } = require("../services/mailer");
const authManager = require("../middleware/authManager");
const { getMachineryUtilization } = require("../controllers/managerAnalyticsController");
const {
  syncBookingToGoogleCalendar,
  syncMaintenanceToGoogleCalendar
} = require("../services/googleCalendarService");

const router = express.Router();

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

const JWT_SECRET = process.env.JWT_SECRET || "minders-secret-jwt-key-cooperative-2026";

function generateUserToken(account, extra = {}) {
  const accObj = account.toObject ? account.toObject() : account;
  return jwt.sign(
    {
      id: String(accObj._id || accObj.id),
      email: accObj.email,
      role: accObj.role,
      fullName: accObj.fullName,
      cooperativeId: accObj.cooperativeId,
      ...extra
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

// Admin-only middleware for impersonation & sensitive operations
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let adminUser = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.role === "admin") {
          adminUser = await Account.findById(decoded.id) || await Account.findOne({ email: decoded.email });
        }
      } catch (err) {
        // Token invalid or expired, continue to check fallback
      }
    }

    if (!adminUser) {
      const adminEmail = cleanEmail(req.headers["x-admin-email"] || req.body?.adminEmail || req.query?.adminEmail);
      if (adminEmail) {
        const candidate = await Account.findOne({ email: adminEmail });
        if (candidate && candidate.role === "admin") {
          adminUser = candidate;
        }
      }
    }

    if (!adminUser || adminUser.role !== "admin") {
      return fail(res, 403, "Access denied. Administrator privileges required.");
    }

    req.admin = adminUser;
    next();
  } catch (error) {
    return fail(res, 500, "Internal server error during authentication check.");
  }
}

const ROLES = ["member", "manager", "admin"];
const STATUSES = ["Pending", "Approved", "Checked-Out", "Returned", "Rejected", "Cancelled"];
const PROFILE_FIELDS = ["fullName", "email", "phone", "address", "address2", "city", "region", "postalCode", "country"];

const clean = (value) => String(value ?? "").trim();
const cleanEmail = (value) => clean(value).toLowerCase();
const fail = (res, status, error) => res.status(status).json({ error });

// In-memory security cache for OTP verification and deletion authorization tokens
const deleteOtpStore = new Map(); // adminEmail -> { code, targetEmail, expiresAt, attempts }
const authorizedDeletions = new Map(); // token -> { adminEmail, targetEmail, expiresAt }

// logAudit is now imported from services/auditLogger.js

// Next sequential Cooperative ID format: M(year)(sequence) e.g. M260001
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

// ---------- Registration, verification, login ----------

router.get("/cooperative-id/next", async (req, res) => {
  res.json({ cooperativeId: await nextCooperativeId() });
});

router.post("/register", async (req, res) => {
  let fullName = clean(req.body.fullName);
  let firstName = clean(req.body.firstName);
  let middleName = clean(req.body.middleName || "");
  let lastName = clean(req.body.lastName);
  
  if (!fullName && (firstName || lastName)) {
    fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  }

  // Derive firstName and lastName from fullName if not explicitly provided
  if (fullName && (!firstName && !lastName)) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  const email = cleanEmail(req.body.email);
  const password = String(req.body.password ?? "");
  let coopId = clean(req.body.cooperativeId);

  if (!fullName || !email) return fail(res, 400, "Full name and email are required.");
  if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
  if (await Account.exists({ email })) return fail(res, 409, "An account already exists for this email address.");

  const coopIdFormat = /^M\d{2}\d{4}$/i;
  if (coopId) {
    coopId = coopId.trim().toUpperCase();
    if (!coopIdFormat.test(coopId)) {
      return fail(res, 400, "Cooperative No ID must follow the format M(Year)(Sequence), for example M260001.");
    }
    const coopIdExists = await Account.exists({
      cooperativeId: { $regex: new RegExp(`^${coopId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") }
    });
    if (coopIdExists) {
      return fail(res, 409, "This Cooperative No ID is already registered.");
    }
  } else {
    coopId = await nextCooperativeId();
  }

  const account = await Account.create({
    firstName: firstName || "",
    middleName: middleName || "",
    lastName: lastName || "",
    fullName,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "member",
    cooperativeId: coopId,
    emailVerified: false
  });

  await logAudit({
    action: "USER_REGISTERED",
    actorEmail: email,
    actorRole: "member",
    targetEmail: email,
    targetName: fullName,
    targetRole: "member",
    details: `New member account created with ID ${coopId}`,
    req
  });

  res.status(201).json(account);
});

// Demo "Confirm email" button.
router.post("/verify", async (req, res) => {
  const email = cleanEmail(req.body.email);
  const account = await Account.findOneAndUpdate(
    { email },
    { emailVerified: true, verifiedAt: new Date() },
    { returnDocument: "after" }
  );
  if (!account) return fail(res, 404, "Account not found.");

  await logAudit({
    action: "EMAIL_VERIFIED",
    actorEmail: email,
    actorRole: account.role,
    targetEmail: email,
    targetName: account.fullName,
    details: `Email address was verified for ${account.fullName}`,
    req
  });

  res.json(account);
});

// Verify Google reCAPTCHA token against Google's verification API.
async function verifyRecaptcha(token) {
  if (process.env.RECAPTCHA_ENABLED === "false") return true;
  if (!token) return false;

  const secret = process.env.RECAPTCHA_SECRET_KEY || "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";
  try {
    const params = new URLSearchParams({ secret, response: token });
    const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    const data = await verifyRes.json();
    return Boolean(data.success);
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return false;
  }
}

router.get("/config", async (req, res) => {
  const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
  const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
  res.json({
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleLoginEnabled: Boolean(googleLoginEnabled),
    facebookAppId: process.env.FACEBOOK_APP_ID || "4031349940338782",
    facebookLoginEnabled: Boolean(facebookLoginEnabled)
  });
});

// Admin System Settings Endpoints
router.get("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
    const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
    res.json({
      googleLoginEnabled: Boolean(googleLoginEnabled),
      facebookLoginEnabled: Boolean(facebookLoginEnabled)
    });
  } catch (err) {
    console.error("Error retrieving admin settings:", err);
    fail(res, 500, "Could not load settings.");
  }
});

router.post("/admin/settings/google-login", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "googleLoginEnabled",
      enabled,
      "Allow members and staff to authenticate using Google Sign-In",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Log in with Google`,
      status: "Success",
      req
    });

    res.json({
      ok: true,
      googleLoginEnabled: enabled,
      message: `Log in with Google has been ${enabled ? "enabled" : "disabled"} successfully.`
    });
  } catch (err) {
    console.error("Error saving Google login setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/facebook-login", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "facebookLoginEnabled",
      enabled,
      "Allow members and staff to authenticate using Facebook Sign-In",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} Log in with Facebook`,
      status: "Success",
      req
    });

    res.json({
      ok: true,
      facebookLoginEnabled: enabled,
      message: `Log in with Facebook has been ${enabled ? "enabled" : "disabled"} successfully.`
    });
  } catch (err) {
    console.error("Error saving Facebook login setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/login", async (req, res) => {
  const isHuman = await verifyRecaptcha(req.body.recaptchaToken);
  if (!isHuman) return fail(res, 400, "reCAPTCHA verification failed. Please check the 'I'm not a robot' box.");

  const identifier = clean(req.body.email || req.body.identifier);
  const password = String(req.body.password ?? "");
  const account = await Account.findOne({
    $or: [
      { email: cleanEmail(identifier) },
      { cooperativeId: identifier },
      { cooperativeId: identifier.toUpperCase() },
      { cooperativeId: { $regex: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") } }
    ]
  });
  if (!account) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: identifier,
      actorRole: "guest",
      details: "Sign-in rejected: account not found in database",
      status: "Failed",
      req
    });
    return fail(res, 401, "No account was found for this Member ID or email.");
  }

  const email = account.email;
  if (!account.emailVerified) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      details: "Sign-in rejected: email address is unverified",
      status: "Denied",
      req
    });
    return fail(res, 403, "Please confirm your email before signing in.");
  }
  if (account.isSuspended) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `Sign-in rejected: account has been suspended (${account.suspensionReason || "Administrative restriction"})`,
      status: "Denied",
      req
    });
    return fail(res, 403, `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`);
  }
  if (account.isArchived) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: "Sign-in rejected: account is in archive folder",
      status: "Denied",
      req
    });
    return fail(res, 403, "This account is currently archived and inactive. Please contact the administrator.");
  }
  if (!(await bcrypt.compare(password, account.passwordHash))) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: email,
      actorRole: account.role,
      details: "Sign-in rejected: invalid password entered",
      status: "Failed",
      req
    });
    return fail(res, 401, "The email or password is incorrect.");
  }

  await logAudit({
    action: "USER_LOGIN",
    actorEmail: email,
    actorRole: account.role,
    targetEmail: email,
    targetName: account.fullName,
    details: `User signed in successfully to ${account.role} portal`,
    req
  });

  const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
  responseData.token = generateUserToken(account);
  res.json(responseData);
});

/**
 * POST /api/auth/forgot-password-request
 * Allows a member to report a forgotten password so an administrator can issue a One-Time Password.
 */
router.post("/auth/forgot-password-request", async (req, res) => {
  const identifier = clean(req.body.identifier || req.body.email);
  if (!identifier) return fail(res, 400, "Please enter your Member ID or registered email.");

  const account = await Account.findOne({
    $or: [
      { email: cleanEmail(identifier) },
      { cooperativeId: identifier },
      { cooperativeId: identifier.toUpperCase() }
    ]
  });

  if (!account) {
    return fail(res, 404, "No account was found matching that Member ID or email address.");
  }

  account.forgotPasswordRequested = true;
  await account.save();

  await logAudit({
    action: "FORGOT_PASSWORD_REQUEST",
    actorEmail: account.email,
    actorRole: account.role,
    targetEmail: account.email,
    targetName: account.fullName,
    details: `Member requested password assistance for ${account.fullName} (${account.email}). Administrator can issue temporary OTP.`,
    req
  });

  res.json({
    ok: true,
    message: "Your password recovery request has been submitted. Please contact your cooperative administrator to receive your temporary One-Time Password (OTP)."
  });
});

/**
 * POST /api/auth/change-temp-password
 * Allows a member logged in with a temporary One-Time Password (mustChangePassword: true)
 * to establish their own permanent private password.
 */
router.post("/auth/change-temp-password", async (req, res) => {
  const email = cleanEmail(req.body.email);
  const tempPassword = String(req.body.tempPassword || "").trim();
  const newPassword = String(req.body.newPassword || "").trim();
  const confirmPassword = String(req.body.confirmPassword || "").trim();

  if (!email || !newPassword || !confirmPassword) {
    return fail(res, 400, "Email, new password, and confirmation are required.");
  }

  if (newPassword.length < 6) {
    return fail(res, 400, "New password must be at least 6 characters.");
  }

  if (newPassword !== confirmPassword) {
    return fail(res, 400, "Confirmation password does not match.");
  }

  const account = await Account.findOne({ email });
  if (!account) return fail(res, 404, "Account not found.");

  if (!account.mustChangePassword) {
    return fail(res, 400, "This account is not flagged for a temporary password change.");
  }

  // If tempPassword was supplied, verify it
  if (tempPassword && !(await bcrypt.compare(tempPassword, account.passwordHash))) {
    return fail(res, 401, "The temporary one-time password provided is incorrect.");
  }

  account.passwordHash = await bcrypt.hash(newPassword, 10);
  account.mustChangePassword = false;
  account.forgotPasswordRequested = false;
  account.oneTimePasswordSetAt = null;
  await account.save();

  await logAudit({
    action: "PASSWORD_CHANGED_FROM_OTP",
    actorEmail: account.email,
    actorRole: account.role,
    targetEmail: account.email,
    targetName: account.fullName,
    details: `Member ${account.fullName} successfully set permanent password after logging in with administrator-issued OTP.`,
    req
  });

  const responseData = account.toJSON ? account.toJSON() : account;
  responseData.token = generateUserToken(account);
  res.json({
    ok: true,
    account: responseData,
    message: "Permanent password established successfully! You are now securely logged in."
  });
});

// Google Authentication Endpoint
router.post("/auth/google", async (req, res) => {
  try {
    let email = cleanEmail(req.body.email);
    let fullName = clean(req.body.fullName);
    const credential = req.body.credential;

    // Decode Google Identity Services credential JWT if provided
    if (credential && typeof credential === "string") {
      try {
        const parts = credential.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
          if (payload.email) {
            email = cleanEmail(payload.email);
            fullName = clean(payload.name || payload.given_name || fullName || "Google Member");
          }
        }
      } catch (err) {
        console.warn("Could not parse Google credential JWT:", err);
      }
    }

    const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
    if (!googleLoginEnabled) {
      await logAudit({
        action: "LOGIN_FAILED",
        actorEmail: email || "unknown@google.com",
        actorRole: "guest",
        details: "Google Sign-In rejected: Log in with Google has been disabled by the system administrator.",
        status: "Denied",
        req
      });
      return fail(res, 403, "Log in with Google is currently disabled by the system administrator.");
    }

    if (!email) {
      return fail(res, 400, "Google account email is required.");
    }

    let account = await Account.findOne({ email });

    if (account) {
      if (account.isSuspended) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: `Google sign-in rejected: account has been suspended (${account.suspensionReason || "Administrative restriction"})`,
          status: "Denied",
          req
        });
        return fail(res, 403, `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`);
      }

      if (account.isArchived) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: "Google sign-in rejected: account is currently in the archive folder",
          status: "Denied",
          req
        });
        return fail(res, 403, "This account is currently archived. Please contact the administrator.");
      }

      // Automatically verify email upon successful Google authentication
      if (!account.emailVerified) {
        account.emailVerified = true;
        account.verifiedAt = new Date();
        await account.save();
      }
    } else {
      // Create new account for first-time Google sign-in
      const cooperativeId = await nextCooperativeId();
      const randomPassword = crypto.randomBytes(16).toString("hex");
      account = await Account.create({
        fullName: fullName || "Google Member",
        email,
        passwordHash: await bcrypt.hash(randomPassword, 10),
        role: "member",
        cooperativeId,
        emailVerified: true,
        verifiedAt: new Date()
      });

      await logAudit({
        action: "ACCOUNT_CREATED",
        actorEmail: email,
        actorRole: "member",
        targetEmail: email,
        targetName: account.fullName,
        targetRole: "member",
        details: `New member registered via Google sign-in (assigned ID: ${cooperativeId})`,
        req
      });
    }

    await logAudit({
      action: "USER_LOGIN",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `User signed in successfully with Google to ${account.role} portal`,
      req
    });

    const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
    responseData.token = generateUserToken(account);
    res.json(responseData);
  } catch (error) {
    console.error("Google authentication error:", error);
    res.status(500).json({ error: "Google authentication failed. Please try again." });
  }
});

// Facebook Authentication Endpoint
router.post("/auth/facebook", async (req, res) => {
  try {
    const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
    if (!facebookLoginEnabled) {
      await logAudit({
        action: "LOGIN_FAILED",
        actorEmail: "facebook-user",
        actorRole: "guest",
        details: "Facebook Sign-In rejected: Log in with Facebook has been disabled by the system administrator.",
        status: "Denied",
        req
      });
      return fail(res, 403, "Log in with Facebook is currently disabled by the system administrator.");
    }

    const { accessToken, userID } = req.body;
    let email = cleanEmail(req.body.email);
    let fullName = clean(req.body.name || req.body.fullName);
    let fbId = clean(userID || req.body.id);

    // Verify access token with Facebook Graph API if provided
    if (accessToken) {
      try {
        const fbUrl = `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(accessToken)}`;
        const fbResponse = await fetch(fbUrl);
        if (fbResponse.ok) {
          const fbData = await fbResponse.json();
          if (fbData.id) fbId = fbData.id;
          if (fbData.name) fullName = clean(fbData.name);
          if (fbData.email) email = cleanEmail(fbData.email);
        } else {
          console.warn("Facebook Graph API validation returned warning:", await fbResponse.text());
        }
      } catch (err) {
        console.warn("Could not reach Facebook Graph API:", err);
      }
    }

    // Fallback: If Facebook account does not provide an email (e.g. phone-only FB accounts), assign consistent identifier
    if (!email && fbId) {
      email = `fb_${fbId}@facebook.member.minders`;
    }

    if (!email) {
      return fail(res, 400, "Facebook account email or user ID is required.");
    }

    let account = await Account.findOne({
      $or: [
        { email },
        ...(fbId ? [{ email: `fb_${fbId}@facebook.member.minders` }] : [])
      ]
    });

    if (account) {
      if (account.isSuspended) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: `Facebook sign-in rejected: account has been suspended (${account.suspensionReason || "Administrative restriction"})`,
          status: "Denied",
          req
        });
        return fail(res, 403, `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`);
      }

      if (account.isArchived) {
        await logAudit({
          action: "LOGIN_FAILED",
          actorEmail: email,
          actorRole: account.role,
          targetEmail: email,
          targetName: account.fullName,
          details: "Facebook sign-in rejected: account is currently in the archive folder",
          status: "Denied",
          req
        });
        return fail(res, 403, "This account is currently archived. Please contact the administrator.");
      }

      // Automatically verify email upon successful Facebook authentication
      if (!account.emailVerified) {
        account.emailVerified = true;
        account.verifiedAt = new Date();
        await account.save();
      }
    } else {
      // Create new account for first-time Facebook sign-in
      const cooperativeId = await nextCooperativeId();
      const randomPassword = crypto.randomBytes(16).toString("hex");
      account = await Account.create({
        fullName: fullName || "Facebook Member",
        email,
        passwordHash: await bcrypt.hash(randomPassword, 10),
        role: "member",
        cooperativeId,
        emailVerified: true,
        verifiedAt: new Date()
      });

      await logAudit({
        action: "ACCOUNT_CREATED",
        actorEmail: email,
        actorRole: "member",
        targetEmail: email,
        targetName: account.fullName,
        targetRole: "member",
        details: `New member registered via Facebook sign-in (assigned ID: ${cooperativeId})`,
        req
      });
    }

    await logAudit({
      action: "USER_LOGIN",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `User signed in successfully with Facebook to ${account.role} portal`,
      req
    });

    const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
    responseData.token = generateUserToken(account);
    res.json(responseData);
  } catch (error) {
    console.error("Facebook authentication error:", error);
    res.status(500).json({ error: "Facebook authentication failed. Please try again." });
  }
});

// ---------- Accounts (admin directory + member profile) ----------

router.get("/accounts", async (req, res) => {
  res.json(await Account.find().sort({ createdAt: 1 }));
});

router.get("/accounts/:email", async (req, res) => {
  const account = await Account.findOne({ email: cleanEmail(req.params.email) });
  if (!account) return fail(res, 404, "Account not found.");
  res.json(account);
});

// Staff account created by an admin (already verified).
router.post("/accounts", async (req, res) => {
  const fullName = clean(req.body.fullName);
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password ?? "");
  const role = clean(req.body.role);
  const adminActor = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || "admin");

  if (!fullName || !email) return fail(res, 400, "Name and email are required.");
  if (!ROLES.includes(role)) return fail(res, 400, "Choose a valid role.");
  if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
  if (await Account.exists({ email })) return fail(res, 409, "An account already exists for this email address.");

  let adminPinHash = null;
  let mustChangePin = false;
  let assignedOneTimePin = null;

  if (role === "admin") {
    let pinInput = req.body.adminPin ? String(req.body.adminPin).trim() : "";
    if (!pinInput) {
      // Automatically generate a 6-digit one-time PIN if left blank
      pinInput = String(Math.floor(100000 + Math.random() * 900000));
    }
    if (!/^\d{6}$/.test(pinInput)) {
      return fail(res, 400, "One-time admin PIN must be exactly 6 digits.");
    }
    assignedOneTimePin = pinInput;
    adminPinHash = await bcrypt.hash(pinInput, 10);
    mustChangePin = true;
  }

  const account = await Account.create({
    fullName,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    emailVerified: true,
    verifiedAt: new Date(),
    adminPinHash,
    mustChangePin
  });

  await logAudit({
    action: "ACCOUNT_CREATED",
    actorEmail: adminActor,
    actorRole: "admin",
    targetEmail: email,
    targetName: fullName,
    targetRole: role,
    details: `Admin (${adminActor}) provisioned verified staff account for "${fullName}" with role ${role}${role === "admin" ? " (assigned 6-digit One-Time Setup PIN)" : ""}`,
    req
  });

  const responseJson = account.toJSON ? account.toJSON() : account;
  if (assignedOneTimePin) {
    responseJson.oneTimePin = assignedOneTimePin;
  }

  res.status(201).json(responseJson);
});

// Admin edits an account (fullName, email, password, role)
router.patch("/accounts/:email", async (req, res) => {
  const currentEmail = cleanEmail(req.params.email);
  const adminActor = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || "admin");
  const account = await Account.findOne({ email: currentEmail });
  if (!account) return fail(res, 404, "Account not found.");

  const oldName = account.fullName;
  const oldRole = account.role;
  const newFullName = clean(req.body.fullName);
  const newEmail = req.body.email ? cleanEmail(req.body.email) : null;
  const newPassword = req.body.password ? String(req.body.password).trim() : null;
  const newRole = req.body.role ? clean(req.body.role) : null;

  if (newFullName) account.fullName = newFullName;

  if (newEmail && newEmail !== currentEmail) {
    if (await Account.exists({ email: newEmail })) {
      return fail(res, 409, "An account already exists for that email address.");
    }
    account.email = newEmail;
  }

  // Disallow permanent password changing by admin.
  // The admin can ONLY issue a temporary One-Time Password (OTP) if the account holder
  // actually requested password recovery on the login page (account.forgotPasswordRequested === true).
  if (req.body.oneTimePassword) {
    if (!account.forgotPasswordRequested) {
      return fail(res, 400, "Cannot issue a One-Time Password. This account has not requested password recovery on the login page.");
    }
    const otpStr = String(req.body.oneTimePassword).trim();
    if (otpStr.length < 6) {
      return fail(res, 400, "One-Time Password must be at least 6 characters.");
    }
    account.passwordHash = await bcrypt.hash(otpStr, 10);
    account.mustChangePassword = true;
    account.forgotPasswordRequested = false;
    account.oneTimePasswordSetAt = new Date();

    await logAudit({
      action: "ONE_TIME_PASSWORD_ISSUED",
      actorEmail: adminActor,
      actorRole: "admin",
      targetEmail: account.email,
      targetName: account.fullName,
      targetRole: account.role,
      details: `Administrator issued temporary One-Time Password (OTP) for account "${account.fullName}" (${account.email}) after member requested password recovery on login page.`,
      req
    });
  }

  if (newRole) {
    if (!ROLES.includes(newRole)) return fail(res, 400, "Invalid role specified.");
    account.role = newRole;
  }

  let pinChanged = false;
  if (req.body.adminPin && (account.role === "admin" || newRole === "admin")) {
    const pinStr = String(req.body.adminPin).trim();
    if (!/^\d{6}$/.test(pinStr)) {
      return fail(res, 400, "Admin Security PIN must be exactly 6 digits.");
    }
    account.adminPinHash = await bcrypt.hash(pinStr, 10);
    account.mustChangePin = false;
    account.pinSetAt = new Date();
    pinChanged = true;
  }

  let verifiedChange = null;
  if (typeof req.body.emailVerified === "boolean") {
    verifiedChange = req.body.emailVerified;
    account.emailVerified = req.body.emailVerified;
    if (req.body.emailVerified && !account.verifiedAt) {
      account.verifiedAt = new Date();
    }
  }

  await account.save();

  // If email or fullName changed, keep existing equipment applications synced
  if ((newEmail && newEmail !== currentEmail) || newFullName) {
    await Application.updateMany(
      { memberEmail: currentEmail },
      { 
        memberEmail: account.email,
        memberName: account.fullName 
      }
    );
  }

  await logAudit({
    action: "ACCOUNT_UPDATED",
    actorEmail: adminActor,
    actorRole: "admin",
    targetEmail: account.email,
    targetName: account.fullName,
    targetRole: account.role,
    details: `Admin updated account "${oldName}" (${oldRole}) -> Name: "${account.fullName}", Role: ${account.role}${newPassword ? ", Password: reset" : ""}${newEmail && newEmail !== currentEmail ? `, Email changed from ${currentEmail}` : ""}${verifiedChange !== null ? `, Verified: ${verifiedChange}` : ""}`,
    req
  });

  res.json(account);
});

// Admin suspends / unsuspends an account
router.patch("/accounts/:email/suspend", async (req, res) => {
  const targetEmail = cleanEmail(req.params.email);
  const adminActor = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || "admin");
  const isSuspended = req.body.isSuspended === true;
  const reason = clean(req.body.reason || "");

  if (targetEmail === adminActor) {
    return fail(res, 400, "You cannot suspend your own administrator account.");
  }

  const account = await Account.findOne({ email: targetEmail });
  if (!account) return fail(res, 404, "Account not found.");

  account.isSuspended = isSuspended;
  account.suspendedAt = isSuspended ? new Date() : null;
  account.suspensionReason = isSuspended ? (reason || "Suspended by administrator") : "";

  await account.save();

  await logAudit({
    action: isSuspended ? "ACCOUNT_SUSPENDED" : "ACCOUNT_ACTIVATED",
    actorEmail: adminActor,
    actorRole: "admin",
    targetEmail: account.email,
    targetName: account.fullName,
    targetRole: account.role,
    details: isSuspended
      ? `Administrator suspended ${account.role} account "${account.fullName}" (${account.email}). Reason: ${account.suspensionReason}`
      : `Administrator restored/unsuspended ${account.role} account "${account.fullName}" (${account.email}).`,
    req
  });

  res.json(account);
});

// Admin archives / unarchives (restores) an account
router.patch("/accounts/:email/archive", async (req, res) => {
  const targetEmail = cleanEmail(req.params.email);
  const adminActor = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || "admin");
  const isArchived = req.body.isArchived === true;

  if (targetEmail === adminActor) {
    return fail(res, 400, "You cannot archive your own administrator account.");
  }

  const account = await Account.findOne({ email: targetEmail });
  if (!account) return fail(res, 404, "Account not found.");

  account.isArchived = isArchived;
  account.archivedAt = isArchived ? new Date() : null;

  await account.save();

  await logAudit({
    action: isArchived ? "ACCOUNT_ARCHIVED" : "ACCOUNT_RESTORED",
    actorEmail: adminActor,
    actorRole: "admin",
    targetEmail: account.email,
    targetName: account.fullName,
    targetRole: account.role,
    details: isArchived
      ? `Administrator moved ${account.role} account "${account.fullName}" (${account.email}) to the archive folder.`
      : `Administrator restored archived ${account.role} account "${account.fullName}" (${account.email}) back to active status.`,
    req
  });

  res.json(account);
});

// ---------- 6-DIGIT ADMIN ACTION SECURITY PIN SYSTEM ----------

// 1. Get current PIN status for an admin
router.get("/admin/pin-status", async (req, res) => {
  const email = cleanEmail(req.query.email);
  if (!email) return fail(res, 400, "Admin email required.");

  const admin = await Account.findOne({ email });
  if (!admin || admin.role !== "admin") return fail(res, 403, "Administrator privileges required.");

  res.json({
    ok: true,
    hasPin: Boolean(admin.adminPinHash),
    mustChangePin: Boolean(admin.mustChangePin)
  });
});

// 2. Set initial 6-digit PIN (for 1st admin or Google admins without a PIN)
router.post("/admin/set-initial-pin", async (req, res) => {
  const email = cleanEmail(req.body.email);
  const newPin = String(req.body.newPin ?? "").trim();
  const confirmPin = String(req.body.confirmPin ?? "").trim();

  if (!email) return fail(res, 400, "Admin email required.");
  const admin = await Account.findOne({ email });
  if (!admin || admin.role !== "admin") return fail(res, 403, "Administrator privileges required.");

  if (admin.adminPinHash && !admin.mustChangePin) {
    return fail(res, 400, "Admin PIN has already been set. Use Change PIN instead.");
  }

  if (!/^\d{6}$/.test(newPin)) {
    return fail(res, 400, "Security PIN must be exactly 6 digits.");
  }

  if (newPin !== confirmPin) {
    return fail(res, 400, "PIN confirmation does not match.");
  }

  admin.adminPinHash = await bcrypt.hash(newPin, 10);
  admin.mustChangePin = false;
  admin.pinSetAt = new Date();
  await admin.save();

  await logAudit({
    action: "ADMIN_PIN_INITIALIZED",
    actorEmail: email,
    actorRole: "admin",
    details: "Administrator initialized permanent 6-digit security PIN",
    req
  });

  res.json({ ok: true, message: "6-digit admin security PIN has been set successfully." });
});

// 3. Change One-Time Temporary PIN or update PIN
router.post("/admin/change-pin", async (req, res) => {
  const email = cleanEmail(req.body.email);
  const currentPin = String(req.body.currentPin ?? "").trim();
  const newPin = String(req.body.newPin ?? "").trim();
  const confirmPin = String(req.body.confirmPin ?? "").trim();

  if (!email) return fail(res, 400, "Admin email required.");
  const admin = await Account.findOne({ email });
  if (!admin || admin.role !== "admin") return fail(res, 403, "Administrator privileges required.");

  if (!admin.adminPinHash) {
    return fail(res, 400, "No PIN has been configured for this account yet. Please initialize your PIN.");
  }

  const match = await bcrypt.compare(currentPin, admin.adminPinHash);
  if (!match) {
    await logAudit({
      action: "ADMIN_PIN_CHANGE_FAILED",
      actorEmail: email,
      actorRole: "admin",
      details: "Attempted PIN change with invalid current/one-time PIN",
      status: "Failed",
      req
    });
    return fail(res, 401, "Invalid current or one-time PIN.");
  }

  if (!/^\d{6}$/.test(newPin)) {
    return fail(res, 400, "New security PIN must be exactly 6 digits.");
  }

  if (newPin !== confirmPin) {
    return fail(res, 400, "New PIN confirmation does not match.");
  }

  if (newPin === currentPin) {
    return fail(res, 400, "New PIN must be different from current one-time PIN.");
  }

  admin.adminPinHash = await bcrypt.hash(newPin, 10);
  admin.mustChangePin = false;
  admin.pinSetAt = new Date();
  await admin.save();

  await logAudit({
    action: "ADMIN_PIN_CHANGED",
    actorEmail: email,
    actorRole: "admin",
    details: "Administrator successfully updated 6-digit security PIN",
    req
  });

  res.json({ ok: true, message: "Admin security PIN updated successfully." });
});

// 4. Verify 6-digit PIN for destructive actions (e.g. Account Deletion)
router.post("/admin/verify-pin", async (req, res) => {
  const adminEmail = cleanEmail(req.body.adminEmail);
  const pin = String(req.body.pin ?? "").trim();
  const targetEmail = cleanEmail(req.body.targetEmail);

  if (!adminEmail || !pin) return fail(res, 400, "Admin email and 6-digit PIN are required.");

  const admin = await Account.findOne({ email: adminEmail });
  if (!admin || admin.role !== "admin") {
    await logAudit({
      action: "ADMIN_AUTH_FAILED",
      actorEmail: adminEmail,
      actorRole: "unknown",
      details: "Admin PIN verification denied: user is not an administrator",
      status: "Denied",
      req
    });
    return fail(res, 403, "Administrator privileges required.");
  }

  if (!admin.adminPinHash) {
    return fail(res, 400, "No 6-digit PIN has been configured for this administrator account. Please set up your PIN first.");
  }

  const match = await bcrypt.compare(pin, admin.adminPinHash);
  if (!match) {
    await logAudit({
      action: "ADMIN_PIN_FAILED",
      actorEmail: adminEmail,
      actorRole: "admin",
      targetEmail,
      details: "Admin 6-digit PIN verification failed: incorrect PIN entered",
      status: "Failed",
      req
    });
    return fail(res, 401, "Incorrect 6-digit admin security PIN.");
  }

  const targetAccount = targetEmail ? await Account.findOne({ email: targetEmail }) : null;

  // Generate single-use authorization token
  const deleteToken = crypto.randomUUID();
  authorizedDeletions.set(deleteToken, {
    adminEmail,
    targetEmail,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  await logAudit({
    action: "ADMIN_PIN_VERIFIED",
    actorEmail: adminEmail,
    actorRole: "admin",
    targetEmail,
    details: `Admin 6-digit PIN verified to authorize action on account (${targetEmail})`,
    req
  });

  res.json({
    ok: true,
    deleteToken,
    target: targetAccount ? {
      email: targetAccount.email,
      fullName: targetAccount.fullName,
      role: targetAccount.role
    } : null,
    message: "Admin 6-digit security PIN verified."
  });
});

// ---------- MULTI-FACTOR ACCOUNT DELETION VERIFICATION FLOW ----------

// Step 2 Verification: Re-authenticate Admin (Accepts either 6-digit PIN or password)
router.post("/admin/verify-password", async (req, res) => {
  const adminEmail = cleanEmail(req.body.adminEmail);
  const passwordOrPin = String(req.body.pin || req.body.password || "").trim();

  if (!adminEmail || !passwordOrPin) return fail(res, 400, "Admin email and security PIN/password are required.");

  const admin = await Account.findOne({ email: adminEmail });
  if (!admin || admin.role !== "admin") {
    await logAudit({
      action: "ADMIN_AUTH_FAILED",
      actorEmail: adminEmail,
      actorRole: "unknown",
      details: "Admin re-verification denied: user is not an administrator",
      status: "Denied",
      req
    });
    return fail(res, 403, "Administrator privileges required.");
  }

  let match = false;
  // Check PIN if set
  if (admin.adminPinHash) {
    match = await bcrypt.compare(passwordOrPin, admin.adminPinHash);
  }
  // Check password if PIN didn't match or not set
  if (!match && admin.passwordHash) {
    match = await bcrypt.compare(passwordOrPin, admin.passwordHash);
  }

  if (!match) {
    await logAudit({
      action: "ADMIN_AUTH_FAILED",
      actorEmail: adminEmail,
      actorRole: "admin",
      details: "Admin verification failed: incorrect PIN or password",
      status: "Failed",
      req
    });
    return fail(res, 401, "Incorrect 6-digit admin PIN or password.");
  }

  const targetEmail = cleanEmail(req.body.targetEmail);
  const targetAccount = targetEmail ? await Account.findOne({ email: targetEmail }) : null;

  // Generate single-use authorization token
  const deleteToken = crypto.randomUUID();
  authorizedDeletions.set(deleteToken, {
    adminEmail,
    targetEmail,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  await logAudit({
    action: "ADMIN_PASSWORD_VERIFIED",
    actorEmail: adminEmail,
    actorRole: "admin",
    targetEmail,
    details: `Admin password verified to authorize deletion of account (${targetEmail})`,
    req
  });

  res.json({
    ok: true,
    deleteToken,
    target: targetAccount ? {
      email: targetAccount.email,
      fullName: targetAccount.fullName,
      role: targetAccount.role
    } : null,
    message: "Admin password verified."
  });
});

// Step 3 Verification: Generate and send OTP to Admin Email
router.post("/admin/request-delete-otp", async (req, res) => {
  const adminEmail = cleanEmail(req.body.adminEmail);
  const targetEmail = cleanEmail(req.body.targetEmail);

  if (!adminEmail || !targetEmail) return fail(res, 400, "Admin email and target email are required.");
  if (adminEmail === targetEmail) return fail(res, 400, "You cannot delete your own admin account.");

  const admin = await Account.findOne({ email: adminEmail });
  if (!admin || admin.role !== "admin") return fail(res, 403, "Administrator privileges required.");

  const target = await Account.findOne({ email: targetEmail });
  if (!target) return fail(res, 404, "Target account does not exist.");

  // Generate 6-digit numeric OTP
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

  deleteOtpStore.set(adminEmail, {
    code: otpCode,
    targetEmail,
    expiresAt,
    attempts: 0
  });

  // Dispatch real email via Nodemailer (or fallback to simulator if SMTP not set up)
  const emailResult = await sendDeleteOtpEmail({
    toEmail: adminEmail,
    otpCode,
    targetName: target.fullName,
    targetRole: target.role,
    targetEmail: target.email
  });

  await logAudit({
    action: "DELETE_OTP_SENT",
    actorEmail: adminEmail,
    actorRole: "admin",
    targetEmail: target.email,
    targetName: target.fullName,
    targetRole: target.role,
    details: `Dispatched 6-digit deletion OTP to admin email (${adminEmail}) for account "${target.fullName}" (${target.role}) [Method: ${emailResult.sent ? "Real SMTP Email" : "Local Simulator"}]`,
    req
  });

  res.json({
    ok: true,
    emailSent: Boolean(emailResult.sent),
    message: emailResult.sent
      ? `A 6-digit verification code has been delivered to ${adminEmail}.`
      : `A 6-digit verification code was generated for ${adminEmail}.`,
    demoOtp: emailResult.sent ? null : otpCode // If real email was sent, don't display plain code on screen
  });
});

// Step 3 Verification (part b): Verify OTP sent to Admin Email
router.post("/admin/verify-delete-otp", async (req, res) => {
  const adminEmail = cleanEmail(req.body.adminEmail);
  const targetEmail = cleanEmail(req.body.targetEmail);
  const enteredOtp = clean(req.body.otp);

  if (!adminEmail || !targetEmail || !enteredOtp) {
    return fail(res, 400, "Admin email, target email, and 6-digit OTP code are required.");
  }

  const session = deleteOtpStore.get(adminEmail);
  if (!session) {
    return fail(res, 400, "No active OTP request found. Please request a new verification code.");
  }

  if (Date.now() > session.expiresAt) {
    deleteOtpStore.delete(adminEmail);
    return fail(res, 400, "The verification code has expired. Please request a new one.");
  }

  if (session.targetEmail !== targetEmail) {
    return fail(res, 400, "Target mismatch for this OTP verification session.");
  }

  session.attempts = (session.attempts || 0) + 1;
  if (session.attempts > 5) {
    deleteOtpStore.delete(adminEmail);
    return fail(res, 400, "Too many failed attempts. Security session terminated.");
  }

  if (session.code !== enteredOtp) {
    await logAudit({
      action: "DELETE_OTP_FAILED",
      actorEmail: adminEmail,
      actorRole: "admin",
      targetEmail,
      details: "Invalid OTP code entered during account deletion authorization",
      status: "Failed",
      req
    });
    return fail(res, 400, "Invalid 6-digit OTP code. Please check your email and try again.");
  }

  // OTP is valid!
  deleteOtpStore.delete(adminEmail);

  // Generate single-use authorization token
  const deleteToken = crypto.randomUUID();
  authorizedDeletions.set(deleteToken, {
    adminEmail,
    targetEmail,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  const target = await Account.findOne({ email: targetEmail });
  if (!target) return fail(res, 404, "Target account does not exist.");

  await logAudit({
    action: "DELETE_OTP_VERIFIED",
    actorEmail: adminEmail,
    actorRole: "admin",
    targetEmail: target.email,
    targetName: target.fullName,
    targetRole: target.role,
    details: `Admin successfully confirmed email OTP for deleting account "${target.fullName}" (${target.role})`,
    req
  });

  res.json({
    ok: true,
    deleteToken,
    target: {
      fullName: target.fullName,
      email: target.email,
      role: target.role,
      cooperativeId: target.cooperativeId || ""
    }
  });
});

// Final Step: Complete Account Deletion (with verified token)
router.delete("/accounts/:email", async (req, res) => {
  const targetEmail = cleanEmail(req.params.email);
  const deleteToken = req.body?.deleteToken || req.headers["x-delete-token"];
  const adminActor = cleanEmail(req.body?.adminEmail || req.headers["x-admin-email"] || "admin");

  if (!deleteToken || !authorizedDeletions.has(deleteToken)) {
    return fail(res, 403, "Deletion authorization token missing or invalid. Complete admin verification first.");
  }

  const authData = authorizedDeletions.get(deleteToken);
  authorizedDeletions.delete(deleteToken); // Invalidate token immediately (single-use)

  if (authData.targetEmail !== targetEmail) {
    return fail(res, 403, "Authorization token target does not match the account being deleted.");
  }

  if (Date.now() > authData.expiresAt) {
    return fail(res, 403, "Authorization token has expired. Please repeat the verification process.");
  }

  const account = await Account.findOne({ email: targetEmail });
  if (!account) return fail(res, 404, "Account not found in MongoDB.");

  const fullName = account.fullName;
  const role = account.role;

  // Completely delete account document
  await Account.deleteOne({ email: targetEmail });
  // Also clean up any associated machinery applications
  await Application.deleteMany({ memberEmail: targetEmail });

  await logAudit({
    action: "ACCOUNT_DELETED",
    actorEmail: authData.adminEmail || adminActor,
    actorRole: "admin",
    targetEmail,
    targetName: fullName,
    targetRole: role,
    details: `Permanently deleted ${role} account "${fullName}" (${targetEmail}) following administrator password verification and final confirmation.`,
    req
  });

  res.json({
    ok: true,
    deleted: targetEmail,
    fullName,
    role,
    message: `Account for ${fullName} (${role}) has been completely deleted.`
  });
});

// Step 1 of a profile edit: store the changes as "pending".
router.post("/accounts/:email/profile-update", async (req, res) => {
  const ownerEmail = cleanEmail(req.params.email);
  const account = await Account.findOne({ email: ownerEmail });
  if (!account) return fail(res, 404, "Account not found.");

  const pending = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, clean(req.body[field])]));
  pending.email = pending.email.toLowerCase();
  if (!pending.fullName || !pending.email) return fail(res, 400, "Name and email are required.");
  if (pending.email !== ownerEmail && (await Account.exists({ email: pending.email }))) {
    return fail(res, 409, "An account already exists for this email address.");
  }
  account.pendingUpdate = pending;
  account.markModified("pendingUpdate");
  await account.save();
  res.json(account);
});

// Step 2: the member confirms, so the pending changes are applied.
router.post("/accounts/:email/profile-confirm", async (req, res) => {
  const ownerEmail = cleanEmail(req.params.email);
  const account = await Account.findOne({ email: ownerEmail });
  if (!account) return fail(res, 404, "Account not found.");
  const pending = account.pendingUpdate;
  if (!pending) return fail(res, 400, "There is no pending profile update.");
  if (pending.email !== ownerEmail && (await Account.exists({ email: pending.email }))) {
    return fail(res, 409, "An account already exists for this email address.");
  }

  PROFILE_FIELDS.forEach((field) => { account[field] = pending[field]; });
  account.emailVerified = true;
  account.pendingUpdate = null;
  await account.save();

  // Keep the member's existing applications linked to their (possibly new) email and name.
  await Application.updateMany(
    { memberEmail: ownerEmail },
    { memberEmail: account.email, memberName: account.fullName }
  );

  await logAudit({
    action: "PROFILE_UPDATED",
    actorEmail: account.email,
    actorRole: account.role,
    targetEmail: account.email,
    targetName: account.fullName,
    details: `Member confirmed profile details update`,
    req
  });

  res.json(account);
});

// ---------- Equipment applications ----------

// ?memberEmail=... returns one member's requests; without it, everything (manager/admin queue).
router.get("/applications", async (req, res) => {
  const filter = req.query.memberEmail ? { memberEmail: cleanEmail(req.query.memberEmail) } : {};
  res.json(await Application.find(filter).sort({ createdAt: -1 }));
});

router.post("/applications", async (req, res) => {
  const memberEmail = cleanEmail(req.body.memberEmail);
  const equipment = clean(req.body.equipment);
  const startDate = clean(req.body.startDate);
  const endDate = clean(req.body.endDate);
  if (!equipment || !startDate || !endDate) return fail(res, 400, "Equipment and both dates are required.");
  if (endDate < startDate) return fail(res, 400, "End date must be on or after the start date.");

  // Automatic Maintenance Overlap Protection:
  const maintenanceConflict = await MachineryMaintenance.findOne({
    equipmentName: { $regex: new RegExp(equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
    status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  });

  if (maintenanceConflict) {
    return fail(
      res,
      409,
      `Equipment "${equipment}" is currently Out of Service for ${maintenanceConflict.maintenanceType} (${maintenanceConflict.startDate} to ${maintenanceConflict.endDate}). Bookings are temporarily blocked for these dates.`
    );
  }

  // Automatic Unique Unit Conflict Protection (Quantity: 1):
  const bookingConflict = await Application.findOne({
    equipment: { $regex: new RegExp(equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
    status: { $in: ["Approved", "Checked-Out"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  });

  if (bookingConflict) {
    return fail(
      res,
      409,
      `Equipment "${equipment}" is already booked from ${bookingConflict.startDate} to ${bookingConflict.endDate}. Each unit is unique (quantity: 1). Please select other dates.`
    );
  }

  const account = await Account.findOne({ email: memberEmail });
  if (!account) return fail(res, 404, "Account not found.");
  const application = await Application.create({
    memberEmail,
    memberName: account.fullName,
    equipment,
    startDate,
    endDate
  });

  await logAudit({
    action: "BOOKING_CREATED",
    actorEmail: memberEmail,
    actorRole: "member",
    targetEmail: memberEmail,
    targetName: account.fullName,
    targetRole: "member",
    details: {
      applicationId: application.id,
      equipment,
      startDate,
      endDate,
      dateRange: `${startDate} – ${endDate}`,
      submittedAt: new Date().toISOString()
    },
    req
  });

  res.status(201).json(application);
});

router.patch("/applications/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
  const existing = await Application.findById(req.params.id);
  if (!existing) return fail(res, 404, "Application not found.");

  const actorEmail = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || existing.memberEmail);
  const actorRole = clean(req.body.actorRole || req.headers["x-actor-role"] || "member");

  // Check if member is editing booking details (equipment, startDate, endDate)
  const isEditingDetails = Boolean(req.body.equipment || req.body.startDate || req.body.endDate);
  if (isEditingDetails) {
    if (existing.status !== "Pending") {
      return fail(res, 400, `Only pending booking requests can be edited prior to manager approval (current status: ${existing.status}).`);
    }

    const newEquipment = clean(req.body.equipment || existing.equipment);
    const newStartDate = clean(req.body.startDate || existing.startDate);
    const newEndDate = clean(req.body.endDate || existing.endDate);

    if (!newEquipment || !newStartDate || !newEndDate) {
      return fail(res, 400, "Equipment and both dates are required.");
    }
    if (newEndDate < newStartDate) {
      return fail(res, 400, "End date must be on or after the start date.");
    }

    // Automatic Maintenance Overlap Protection
    const maintenanceConflict = await MachineryMaintenance.findOne({
      equipmentName: { $regex: new RegExp(newEquipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
      startDate: { $lte: newEndDate },
      endDate: { $gte: newStartDate }
    });

    if (maintenanceConflict) {
      return fail(
        res,
        409,
        `Equipment "${newEquipment}" is currently Out of Service for ${maintenanceConflict.maintenanceType} (${maintenanceConflict.startDate} to ${maintenanceConflict.endDate}). Bookings are temporarily blocked for these dates.`
      );
    }

    const previousEquipment = existing.equipment;
    const previousDates = `${existing.startDate} – ${existing.endDate}`;

    existing.equipment = newEquipment;
    existing.startDate = newStartDate;
    existing.endDate = newEndDate;
    await existing.save();

    await logAudit({
      action: "BOOKING_UPDATED",
      actorEmail,
      actorRole,
      targetEmail: existing.memberEmail,
      targetName: existing.memberName,
      targetRole: "member",
      details: {
        applicationId: existing.id,
        previousEquipment,
        newEquipment,
        previousDates,
        newDates: `${newStartDate} – ${newEndDate}`,
        updatedBy: actorEmail,
        updatedAt: new Date().toISOString()
      },
      req
    });

    return res.json(existing);
  }

  // Otherwise, handle status change
  const newStatus = clean(req.body.status);
  if (!newStatus || !STATUSES.includes(newStatus)) return fail(res, 400, "Invalid status.");

  // Cancellation prior to manager approval check
  if (newStatus === "Cancelled" && existing.status !== "Pending") {
    return fail(res, 400, `Only pending booking requests can be cancelled prior to manager approval (current status: ${existing.status}).`);
  }

  // If approving, enforce that no other booking is already approved on overlapping dates (Quantity: 1)
  if (newStatus === "Approved") {
    const existingConflict = await Application.findOne({
      _id: { $ne: existing._id },
      equipment: { $regex: new RegExp(existing.equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      status: { $in: ["Approved", "Checked-Out"] },
      startDate: { $lte: existing.endDate },
      endDate: { $gte: existing.startDate }
    });
    if (existingConflict) {
      return fail(
        res,
        409,
        `Cannot approve: "${existing.equipment}" (Quantity: 1) is already booked by ${existingConflict.memberName} from ${existingConflict.startDate} to ${existingConflict.endDate}.`
      );
    }
  }

  const previousStatus = existing.status;
  existing.status = newStatus;
  await existing.save();

  // Push approved bookings to Google Calendar (try/catch safe)
  if (newStatus === "Approved") {
    syncBookingToGoogleCalendar(existing, req.user).catch((err) => {
      console.warn("[GoogleCalendar] Background booking approval sync note:", err.message);
    });
  }

  // Use specific action constants for each status transition
  const actionMap = {
    Approved: "BOOKING_APPROVED",
    Rejected: "BOOKING_REJECTED",
    Pending: "BOOKING_STATUS_UPDATED",
    Cancelled: "BOOKING_CANCELLED"
  };
  const action = actionMap[newStatus] || "BOOKING_STATUS_UPDATED";

  await logAudit({
    action,
    actorEmail,
    actorRole,
    targetEmail: existing.memberEmail,
    targetName: existing.memberName,
    targetRole: "member",
    details: {
      applicationId: existing.id,
      equipment: existing.equipment,
      dateRange: `${existing.startDate} – ${existing.endDate}`,
      previousStatus,
      newStatus,
      changedBy: actorEmail,
      changedAt: new Date().toISOString()
    },
    req
  });

  res.json(existing);
});

router.put("/applications/:id", async (req, res) => {
  // Delegate PUT to PATCH logic
  req.method = "PATCH";
  router.handle(req, res);
});

router.delete("/applications/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
  const existing = await Application.findById(req.params.id);
  if (!existing) return fail(res, 404, "Application not found.");

  if (existing.status !== "Pending") {
    return fail(res, 400, `Only pending booking requests can be cancelled prior to manager approval (current status: ${existing.status}).`);
  }

  const actorEmail = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || existing.memberEmail);
  const actorRole = clean(req.body.actorRole || req.headers["x-actor-role"] || "member");

  existing.status = "Cancelled";
  await existing.save();

  await logAudit({
    action: "BOOKING_CANCELLED",
    actorEmail,
    actorRole,
    targetEmail: existing.memberEmail,
    targetName: existing.memberName,
    targetRole: "member",
    details: {
      applicationId: existing.id,
      equipment: existing.equipment,
      dateRange: `${existing.startDate} – ${existing.endDate}`,
      cancelledBy: actorEmail,
      cancelledAt: new Date().toISOString()
    },
    req
  });

  res.json({ ok: true, message: "Booking request cancelled successfully.", application: existing });
});

// ---------- MANAGER RENTAL OPERATIONS, INSPECTIONS, POS & MAINTENANCE ----------

/**
 * PATCH /api/applications/:id/inspection
 * Log pre-rental checkout or post-rental check-in condition inspections.
 */
router.patch("/applications/:id/inspection", authManager, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
  const { type, odometerHours, fuelLevel, notes, photoCount } = req.body;
  const isCheckout = type === "checkout";

  const application = await Application.findById(req.params.id);
  if (!application) return fail(res, 404, "Application not found.");

  const inspectionData = {
    odometerHours: Number(odometerHours) || 0,
    fuelLevel: clean(fuelLevel) || "100%",
    notes: clean(notes) || "Routine inspection passed.",
    photoCount: Number(photoCount) || 0,
    inspectedAt: new Date()
  };

  if (isCheckout) {
    application.checkoutInspection = inspectionData;
    application.status = "Checked-Out";
  } else {
    application.checkinInspection = inspectionData;
    application.status = "Returned";
  }

  await application.save();

  await logAudit({
    action: isCheckout ? "RENTAL_HANDOVER_CHECKOUT" : "RENTAL_RETURN_CHECKIN",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    targetEmail: application.memberEmail,
    targetName: application.memberName,
    details: {
      applicationId: application.id,
      equipment: application.equipment,
      type: isCheckout ? "Pre-Rental Check-Out Handover" : "Post-Rental Check-In Return",
      odometerHours: inspectionData.odometerHours,
      fuelLevel: inspectionData.fuelLevel,
      notes: inspectionData.notes,
      photoCount: inspectionData.photoCount
    },
    req
  });

  res.json({ ok: true, application, message: isCheckout ? "Check-out inspection recorded." : "Check-in return completed." });
});

/**
 * GET /api/manager/machinery-maintenance
 * Returns all machinery maintenance schedules.
 */
router.get("/manager/machinery-maintenance", async (req, res) => {
  const records = await MachineryMaintenance.find({}).sort({ startDate: -1 });
  res.json(records);
});

/**
 * POST /api/manager/machinery-maintenance
 * Puts an equipment unit 'Out of Service' and blocks farmer bookings.
 */
router.post("/manager/machinery-maintenance", async (req, res) => {
  const equipmentUnitId = clean(req.body.equipmentUnitId);
  const equipmentName = clean(req.body.equipmentName);
  const startDate = clean(req.body.startDate);
  const endDate = clean(req.body.endDate);
  const reason = clean(req.body.reason);
  const maintenanceType = clean(req.body.maintenanceType) || "Routine Servicing";
  const managerEmail = req.user.email;

  if (!equipmentUnitId || !equipmentName || !startDate || !endDate || !reason) {
    return fail(res, 400, "All fields (unit ID, machinery name, start date, end date, reason) are required.");
  }

  if (endDate < startDate) return fail(res, 400, "End date must be on or after start date.");

  // Check if any existing approved/pending applications collide
  const collidingBookings = await Application.find({
    equipment: equipmentName,
    status: { $in: ["Approved", "Pending", "Checked-Out"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  });

  const record = await MachineryMaintenance.create({
    equipmentUnitId,
    equipmentName,
    startDate,
    endDate,
    status: "Out of Service",
    maintenanceType,
    reason,
    assignedMechanic: clean(req.body.assignedMechanic) || "In-house Co-op Technician",
    loggedByManager: managerEmail
  });

  // Push maintenance schedule to Google Calendar (try/catch safe)
  syncMaintenanceToGoogleCalendar(record, req.user).catch((err) => {
    console.warn("[GoogleCalendar] Background maintenance sync note:", err.message);
  });

  await logAudit({
    action: "EQUIPMENT_OUT_OF_SERVICE",
    actorEmail: managerEmail,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: {
      equipmentUnitId,
      equipmentName,
      maintenanceType,
      dateRange: `${startDate} to ${endDate}`,
      reason,
      collidingBookingsCount: collidingBookings.length
    },
    req
  });

  res.status(201).json({
    ok: true,
    record,
    collidingBookingsCount: collidingBookings.length,
    message: `Unit ${equipmentUnitId} (${equipmentName}) set to Out of Service.`
  });
});

/**
 * DELETE /api/manager/machinery-maintenance/:id
 * Removes or restores maintenance record back to operational status.
 */
router.delete("/manager/machinery-maintenance/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid maintenance record id.");
  const record = await MachineryMaintenance.findByIdAndDelete(req.params.id);
  if (!record) return fail(res, 404, "Maintenance record not found.");

  await logAudit({
    action: "EQUIPMENT_RETURNED_TO_SERVICE",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: `Equipment unit ${record.equipmentUnitId} (${record.equipmentName}) completed ${record.maintenanceType} and is back in service.`,
    req
  });

  res.json({ ok: true, message: "Maintenance completed. Equipment back in operational service." });
});

// Seed default farm machinery units if database is empty
async function seedDefaultMachineryUnits() {
  try {
    const count = await MachineryUnit.countDocuments();
    if (count > 0) return;

    const initialUnits = [
      {
        unitId: "JD-5075-01",
        name: "John Deere 5075E Utility Tractor",
        category: "Tractor",
        imageUrl: "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Ramon Gutierrez",
        driverPhone: "+63 917 842 1092",
        ratePerDay: 2800,
        ratePerHour: 450,
        status: "Available",
        operatingHours: 640,
        modelYear: "2023",
        serialNumber: "1PY5075EKP012894",
        conditionNotes: "75 HP 3-Cylinder Turbocharged Diesel with PowrReverser 12F/12R transmission. Clean oil inspection, tier-4 diesel filter replaced."
      },
      {
        unitId: "KB-DC70-02",
        name: "Kubota DC-70 Plus Combine Harvester",
        category: "Harvester",
        imageUrl: "https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Danilo Santos",
        driverPhone: "+63 920 631 8840",
        ratePerDay: 5500,
        ratePerHour: 850,
        status: "Available",
        operatingHours: 820,
        modelYear: "2022",
        serialNumber: "KBDC70-99231-PH",
        conditionNotes: "70 HP direct-injection diesel, 2.075m cutting width, high-capacity grain tank and hydraulic hydrostatic transmission."
      },
      {
        unitId: "NH-RB450-03",
        name: "New Holland Roll-Belt 450 Round Baler",
        category: "Baler",
        imageUrl: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Mateo Alcantara",
        driverPhone: "+63 918 392 4411",
        ratePerDay: 3200,
        ratePerHour: 500,
        status: "Maintenance",
        operatingHours: 410,
        modelYear: "2023",
        serialNumber: "NHRB450-7712",
        conditionNotes: "Bale-slice system. Scheduled routine belt tensioning, knotter lubrication, and hydraulic line check."
      },
      {
        unitId: "CASE-90JX-04",
        name: "Case IH Farmall 90JX 4WD Tractor",
        category: "Tractor",
        imageUrl: "https://images.unsplash.com/photo-1594771804886-a933bb2d609b?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Marcus Lee",
        driverPhone: "+63 908 552 1928",
        ratePerDay: 3600,
        ratePerHour: 550,
        status: "Available",
        operatingHours: 1120,
        modelYear: "2021",
        serialNumber: "CIH90JX-55021",
        conditionNotes: "90 HP turbo diesel with heavy-duty Category II 3-point hitch and dual remote hydraulics. Excellent field condition."
      },
      {
        unitId: "KH-GA4121-05",
        name: "Kuhn GA 4121 GM Rotary Hay Rake",
        category: "Mower / Rake",
        imageUrl: "https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Eduardo Ramos",
        driverPhone: "+63 945 771 9023",
        ratePerDay: 1900,
        ratePerHour: 320,
        status: "Repair",
        operatingHours: 350,
        modelYear: "2022",
        serialNumber: "KH-GA4121-8841",
        conditionNotes: "4.1m working width. Hydraulic lift cylinder seal leak detected during pre-field inspection; seal kit ordered."
      },
      {
        unitId: "ISZ-FWD-06",
        name: "Isuzu Forward 6-Wheeler Flatbed Hauler",
        category: "Transport / Truck",
        imageUrl: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Arnel Bautista",
        driverPhone: "+63 927 419 6602",
        ratePerDay: 4200,
        ratePerHour: 650,
        status: "Available",
        operatingHours: 1450,
        modelYear: "2020",
        serialNumber: "ISZ-FWD-6602-PH",
        conditionNotes: "Heavy machinery ramp truck for transport of tractors and balers between cluster barangay farms."
      },
      {
        unitId: "AG-SPR600-07",
        name: "Ag Leader Precision Boom Sprayer (600L)",
        category: "Sprayer",
        imageUrl: "https://images.unsplash.com/photo-1530267981375-f0de937f5f13?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Nestor Cruz",
        driverPhone: "+63 916 230 4589",
        ratePerDay: 2100,
        ratePerHour: 340,
        status: "Available",
        operatingHours: 290,
        modelYear: "2023",
        serialNumber: "AG-SPR600-4319",
        conditionNotes: "12m hydraulic fold booms with triple nozzle bodies, chemical induction hopper, and GPS flow controller."
      },
      {
        unitId: "MF-1840-08",
        name: "Massey Ferguson 1840 Square Baler",
        category: "Baler",
        imageUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=700&q=80",
        assignedDriver: "Unassigned",
        driverPhone: "",
        ratePerDay: 2400,
        ratePerHour: 380,
        status: "Dispose",
        operatingHours: 3200,
        modelYear: "2016",
        serialNumber: "MF-1840-22019",
        conditionNotes: "End of economic lifecycle. Knotter drive gearbox worn beyond specs; approved for co-op asset liquidation / disposal."
      }
    ];

    await MachineryUnit.insertMany(initialUnits);
    console.log("Seeded initial Machinery Units collection successfully.");
  } catch (err) {
    console.error("Error seeding default machinery units:", err);
  }
}

/**
 * GET /api/machinery-units
 * Returns all farm machinery units with optional filters (?status=..., ?search=...)
 */
router.get("/machinery-units", async (req, res) => {
  try {
    await seedDefaultMachineryUnits();
    const { status, search } = req.query;
    const filter = { isArchived: { $ne: true } };

    if (status && status !== "All") {
      filter.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { unitId: { $regex: q, $options: "i" } },
        { assignedDriver: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } }
      ];
    }

    const units = await MachineryUnit.find(filter).sort({ createdAt: -1 });
    res.json({ ok: true, data: units });
  } catch (err) {
    console.error("Error fetching machinery units:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch machinery units" });
  }
});

/**
 * GET /api/machinery-units/:id
 * Returns a single farm machinery unit
 */
router.get("/machinery-units/:id", async (req, res) => {
  try {
    const unit = await MachineryUnit.findById(req.params.id);
    if (!unit) return res.status(404).json({ ok: false, error: "Unit not found" });
    res.json({ ok: true, data: unit });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error fetching unit details" });
  }
});

/**
 * POST /api/machinery-units
 * Registers a new machinery unit in the fleet
 */
router.post("/machinery-units", authManager, async (req, res) => {
  try {
    const unitId = clean(req.body.unitId);
    const name = clean(req.body.name);
    const category = clean(req.body.category) || "Tractor";
    const imageUrl = clean(req.body.imageUrl) || "";
    const assignedDriver = clean(req.body.assignedDriver) || "Unassigned";
    const driverPhone = clean(req.body.driverPhone) || "";
    const ratePerDay = Number(req.body.ratePerDay);
    const ratePerHour = Number(req.body.ratePerHour);
    const status = clean(req.body.status) || "Available";
    const conditionNotes = clean(req.body.conditionNotes) || "";
    const modelYear = clean(req.body.modelYear) || String(new Date().getFullYear());
    const serialNumber = clean(req.body.serialNumber) || "";
    const operatingHours = Number(req.body.operatingHours) || 0;
    const managerEmail = req.user.email;

    if (!unitId || !name) {
      return fail(res, 400, "Machinery Unit ID and Name are required.");
    }
    if (isNaN(ratePerDay) || ratePerDay < 0 || isNaN(ratePerHour) || ratePerHour < 0) {
      return fail(res, 400, "Valid rate per day and rate per hour are required.");
    }

    const existing = await MachineryUnit.findOne({ unitId });
    if (existing) {
      return fail(res, 409, `A machinery unit with ID "${unitId}" already exists.`);
    }

    const newUnit = await MachineryUnit.create({
      unitId,
      name,
      category,
      imageUrl,
      assignedDriver,
      driverPhone,
      ratePerDay,
      ratePerHour,
      status,
      conditionNotes,
      modelYear,
      serialNumber,
      operatingHours
    });

    await logAudit({
      action: "MACHINERY_UNIT_CREATED",
      actorEmail: managerEmail,
      actorRole: req.user.role,
      actorId: req.user._id,
      details: `Added new machinery unit ${unitId} (${name}) with status ${status}.`,
      req
    });

    res.status(201).json({ ok: true, data: newUnit, message: `Machinery unit ${unitId} successfully added.` });
  } catch (err) {
    console.error("Error creating machinery unit:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to create machinery unit" });
  }
});

/**
 * PUT /api/machinery-units/:id
 * Updates an existing machinery unit
 */
router.put("/machinery-units/:id", authManager, async (req, res) => {
  try {
    const unit = await MachineryUnit.findById(req.params.id);
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    const managerEmail = req.user.email;
    const oldStatus = unit.status;

    if (req.body.name) unit.name = clean(req.body.name);
    if (req.body.category) unit.category = clean(req.body.category);
    if (req.body.imageUrl !== undefined) unit.imageUrl = clean(req.body.imageUrl);
    if (req.body.assignedDriver !== undefined) unit.assignedDriver = clean(req.body.assignedDriver);
    if (req.body.driverPhone !== undefined) unit.driverPhone = clean(req.body.driverPhone);
    if (req.body.ratePerDay !== undefined) unit.ratePerDay = Number(req.body.ratePerDay);
    if (req.body.ratePerHour !== undefined) unit.ratePerHour = Number(req.body.ratePerHour);
    if (req.body.status && ["Available", "Maintenance", "Repair", "Dispose"].includes(req.body.status)) {
      unit.status = req.body.status;
    }
    if (req.body.conditionNotes !== undefined) unit.conditionNotes = clean(req.body.conditionNotes);
    if (req.body.modelYear !== undefined) unit.modelYear = clean(req.body.modelYear);
    if (req.body.serialNumber !== undefined) unit.serialNumber = clean(req.body.serialNumber);
    if (req.body.operatingHours !== undefined) unit.operatingHours = Number(req.body.operatingHours);

    await unit.save();

    await logAudit({
      action: "MACHINERY_UNIT_UPDATED",
      actorEmail: managerEmail,
      actorRole: req.user.role,
      actorId: req.user._id,
      details: `Updated machinery unit ${unit.unitId} (${unit.name}). Status: ${oldStatus} -> ${unit.status}.`,
      req
    });

    res.json({ ok: true, data: unit, message: `Machinery unit ${unit.unitId} successfully updated.` });
  } catch (err) {
    console.error("Error updating machinery unit:", err);
    res.status(500).json({ ok: false, error: err.message || "Failed to update machinery unit" });
  }
});

/**
 * PATCH /api/machinery-units/:id/status
 * Quick status change (Available, Maintenance, Repair, Dispose)
 */
router.patch("/machinery-units/:id/status", authManager, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Available", "Maintenance", "Repair", "Dispose"].includes(status)) {
      return fail(res, 400, "Invalid status. Must be Available, Maintenance, Repair, or Dispose.");
    }

    const unit = await MachineryUnit.findById(req.params.id);
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    const oldStatus = unit.status;
    unit.status = status;
    await unit.save();

    const managerEmail = req.user.email;
    await logAudit({
      action: "MACHINERY_STATUS_CHANGED",
      actorEmail: managerEmail,
      actorRole: req.user.role,
      actorId: req.user._id,
      details: `Changed status of ${unit.unitId} (${unit.name}) from ${oldStatus} to ${status}.`,
      req
    });

    res.json({ ok: true, data: unit, message: `Unit ${unit.unitId} status updated to ${status}.` });
  } catch (err) {
    console.error("Error changing machinery status:", err);
    res.status(500).json({ ok: false, error: "Failed to update machinery status" });
  }
});

/**
 * DELETE /api/machinery-units/:id
 * Delete a machinery unit
 */
router.delete("/machinery-units/:id", authManager, async (req, res) => {
  try {
    const unit = await MachineryUnit.findByIdAndDelete(req.params.id);
    if (!unit) return res.status(404).json({ ok: false, error: "Machinery unit not found." });

    const managerEmail = req.user.email;
    await logAudit({
      action: "MACHINERY_UNIT_DELETED",
      actorEmail: managerEmail,
      actorRole: req.user.role,
      actorId: req.user._id,
      details: `Deleted machinery unit ${unit.unitId} (${unit.name}).`,
      req
    });

    res.json({ ok: true, message: `Machinery unit ${unit.unitId} removed from fleet.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to delete unit" });
  }
});

/**
 * GET /api/manager/machinery-availability
 * Returns list of booked and maintenance units for given date range.
 */
router.get("/manager/machinery-availability", async (req, res) => {
  const startDate = clean(req.query.startDate);
  const endDate = clean(req.query.endDate) || startDate;

  if (!startDate || !endDate) {
    return res.json({ bookedUnits: [], maintenanceUnits: [] });
  }

  const bookings = await Application.find({
    status: { $in: ["Approved", "Checked-Out"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  }).select("equipment machineryUnitId startDate endDate memberName");

  const maintenances = await MachineryMaintenance.find({
    status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  }).select("equipmentName equipmentUnitId startDate endDate maintenanceType");

  const bookedUnits = bookings.map((b) => ({
    equipment: b.equipment,
    unitId: b.machineryUnitId,
    startDate: b.startDate,
    endDate: b.endDate,
    memberName: b.memberName
  }));

  const maintenanceUnits = maintenances.map((m) => ({
    equipment: m.equipmentName,
    unitId: m.equipmentUnitId,
    startDate: m.startDate,
    endDate: m.endDate,
    reason: m.maintenanceType
  }));

  res.json({ bookedUnits, maintenanceUnits });
});

/**
 * POST /api/manager/pos-booking
 * Walk-in terminal booking for farmers without online accounts.
 */
router.post("/manager/pos-booking", async (req, res) => {
  const farmerName = clean(req.body.farmerName);
  const farmerPhone = clean(req.body.farmerPhone);
  const coopId = clean(req.body.coopId) || "WALK-IN";
  const equipment = clean(req.body.equipment);
  const machineryUnitId = clean(req.body.machineryUnitId) || "";
  const startDate = clean(req.body.startDate);
  const endDate = clean(req.body.endDate);
  const rentalType = clean(req.body.rentalType) || "day";
  const rate = Number(req.body.rate) || Number(req.body.dailyRate) || 120;
  const rentalDays = Math.max(Number(req.body.rentalDays) || 1, 1);
  const rentalHours = Math.max(Number(req.body.rentalHours) || 1, 1);
  const deposit = 0; // No security deposit for POS walk-in rentals
  const paymentMethod = clean(req.body.paymentMethod) || "Cash";
  const managerEmail = req.user.email;

  if (!farmerName || !equipment || !startDate || !endDate) {
    return fail(res, 400, "Farmer name, machinery, and valid dates are required.");
  }

  // Date validation: cannot rent if date is in the past ("done")
  const today = new Date().toISOString().slice(0, 10);
  if (startDate < today) {
    return fail(res, 400, "Cannot book for a past date. The date has already passed.");
  }
  if (endDate < startDate) {
    return fail(res, 400, "Rental end date cannot be earlier than start date.");
  }

  // Overlap verification with Out of Service records
  const maintenanceConflict = await MachineryMaintenance.findOne({
    equipmentName: { $regex: new RegExp(equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
    status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  });

  if (maintenanceConflict) {
    return fail(res, 409, `Equipment "${equipment}" is Out of Service (${maintenanceConflict.startDate} to ${maintenanceConflict.endDate}). Cannot book for these dates.`);
  }

  // Overlap verification with existing bookings for this unit (Quantity: 1 per unit)
  const bookingConflictQuery = {
    status: { $in: ["Approved", "Checked-Out"] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  };
  if (machineryUnitId) {
    bookingConflictQuery.$or = [
      { machineryUnitId },
      { equipment: { $regex: new RegExp(equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } }
    ];
  } else {
    bookingConflictQuery.equipment = { $regex: new RegExp(equipment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") };
  }
  const bookingConflict = await Application.findOne(bookingConflictQuery);

  if (bookingConflict) {
    return fail(
      res,
      409,
      `Equipment "${equipment}" (Quantity: 1) is already booked by ${bookingConflict.memberName} from ${bookingConflict.startDate} to ${bookingConflict.endDate}. Please select other dates.`
    );
  }

  const rentalFee = rentalType === "hour" ? (rate * rentalHours) : (rate * rentalDays);
  const totalPaid = rentalFee; // Zero deposit

  const durationLabel = rentalType === "hour"
    ? `${rentalHours} hr${rentalHours === 1 ? "" : "s"} @ ₱${rate}/hr`
    : `${rentalDays} day${rentalDays === 1 ? "" : "s"} @ ₱${rate}/day`;

  // Create walk-in application
  const app = await Application.create({
    memberEmail: `walkin.${Date.now()}@coop.local`,
    memberName: `${farmerName} (${coopId})`,
    equipment,
    machineryUnitId,
    startDate,
    endDate,
    status: "Approved",
    isWalkIn: true,
    farmerPhone,
    financials: {
      dailyRate: rate,
      deposit: 0,
      totalPaid,
      paymentMethod,
      isSettled: true
    }
  });

  // Create financial transaction ledger entry
  const txId = `TX-${Date.now().toString().slice(-6)}`;
  await Transaction.create({
    txId,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    farmer: farmerName,
    equipment,
    type: "Rental Fee",
    amount: totalPaid,
    paymentMethod,
    notes: `Walk-in Rental (${durationLabel}) - Zero Security Deposit`
  });

  await logAudit({
    action: "POS_WALKIN_BOOKING_CREATED",
    actorEmail: managerEmail,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: {
      farmerName,
      equipment,
      machineryUnitId,
      rentalType,
      durationLabel,
      totalCashCollected: totalPaid,
      deposit: 0,
      contractId: app.displayId
    },
    req
  });

  res.status(201).json({
    ok: true,
    application: app,
    txId,
    totalCollected: totalPaid,
    message: `Walk-in rental booking registered. Receipt #${txId} generated.`
  });
});

/**
 * POST /api/manager/pos-settlement
 * Return settlement: late fee, repair deduction, fuel shortage, refund calculation.
 */
router.post("/manager/pos-settlement", async (req, res) => {
  const rentalId = clean(req.body.rentalId);
  const initialDeposit = Number(req.body.initialDeposit) || 0;
  const lateDays = Number(req.body.lateDays) || 0;
  const lateFeePerDay = Number(req.body.lateFeePerDay) || 40;
  const repairCost = Number(req.body.repairCost) || 0;
  const fuelCharge = Number(req.body.fuelCharge) || 0;
  const deductionNotes = clean(req.body.deductionNotes);
  const managerEmail = req.user.email;

  const totalLateFee = lateDays * lateFeePerDay;
  const totalDeductions = totalLateFee + repairCost + fuelCharge;
  const netRefundOrDue = initialDeposit - totalDeductions;
  const isRefund = netRefundOrDue >= 0;

  // Record ledger transactions for deductions
  if (totalLateFee > 0) {
    await Transaction.create({
      txId: `TX-${Date.now().toString().slice(-6)}-L`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      farmer: rentalId,
      equipment: "Return Overdue",
      type: "Late Fee",
      amount: totalLateFee,
      paymentMethod: "Cash",
      notes: `${lateDays} days overdue @ ₱${lateFeePerDay}/day`
    });
  }

  if (repairCost > 0) {
    await Transaction.create({
      txId: `TX-${Date.now().toString().slice(-6)}-R`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      farmer: rentalId,
      equipment: "Damage Repair",
      type: "Damage Charge",
      amount: repairCost,
      paymentMethod: "Cash",
      notes: deductionNotes || "Repair parts deduction"
    });
  }

  // Update application record if valid ObjectId
  if (mongoose.isValidObjectId(rentalId)) {
    await Application.findByIdAndUpdate(rentalId, {
      status: "Returned",
      "financials.lateFee": totalLateFee,
      "financials.repairDeduction": repairCost,
      "financials.fuelCharge": fuelCharge,
      "financials.refundAmount": isRefund ? netRefundOrDue : 0,
      "financials.isSettled": true
    });
  }

  await logAudit({
    action: "DEPOSIT_SETTLEMENT_FINALIZED",
    actorEmail: managerEmail,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: {
      rentalId,
      initialDeposit,
      totalDeductions,
      netRefundOrDue,
      isRefund,
      deductionNotes
    },
    req
  });

  res.json({
    ok: true,
    settlement: {
      rentalId,
      initialDeposit,
      totalLateFee,
      repairCost,
      fuelCharge,
      totalDeductions,
      netOutcome: netRefundOrDue,
      isRefund
    },
    message: isRefund
      ? `Settlement finalized. Refund ₱${netRefundOrDue.toFixed(2)} to farmer.`
      : `Settlement finalized. Collect ₱${Math.abs(netRefundOrDue).toFixed(2)} balance from farmer.`
  });
});

/**
 * GET /api/manager/transactions
 * Returns daily transaction logs with total cash collected.
 */
router.get("/manager/transactions", async (req, res) => {
  const txs = await Transaction.find({}).sort({ createdAt: -1 }).limit(100);

  const totalCash = txs
    .filter((t) => t.paymentMethod === "Cash")
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const totalRevenue = txs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  res.json({ transactions: txs, totalCash, totalRevenue });
});

/**
 * GET /api/manager/utilization
 * Returns equipment utilization rates across categories.
 */
router.get("/manager/utilization", async (req, res) => {
  return getMachineryUtilization(req, res);
});

// ---------- AUDIT LOGS ENDPOINTS ----------

router.get("/audit-logs", async (req, res) => {
  const search = clean(req.query.search);
  const action = clean(req.query.action);
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const includeStats = req.query.stats === "true";

  // Build active-only filter (exclude archived rows unless explicitly requested)
  const query = { isArchived: { $ne: true } };
  if (action && action !== "ALL") query.action = action;
  if (search) {
    query.$or = [
      { actorEmail: { $regex: search, $options: "i" } },
      { targetEmail: { $regex: search, $options: "i" } },
      { targetName: { $regex: search, $options: "i" } },
      { action: { $regex: search, $options: "i" } }
    ];
  }

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit);

  // Optionally include aggregate stats so the dashboard doesn't need a second request
  if (includeStats) {
    const allActive = await AuditLog.countDocuments({ isArchived: { $ne: true } });
    const deletions = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /DELETED/ });
    const modifications = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /UPDATED|SUSPENDED|ARCHIVED|RESTORED|ACTIVATED/ });
    const logins = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /LOGIN/ });
    const bookings = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /BOOKING/ });
    return res.json({ logs, stats: { total: allActive, deletions, modifications, logins, bookings } });
  }

  res.json(logs);
});

router.delete("/audit-logs", async (req, res) => {
  const adminEmail = cleanEmail(req.body?.adminEmail || req.headers["x-admin-email"] || "admin");
  await AuditLog.deleteMany({});
  await logAudit({
    action: "AUDIT_LOGS_PURGED",
    actorEmail: adminEmail,
    actorRole: "admin",
    details: "All administrative audit log entries were purged by administrator",
    req
  });
  res.json({ ok: true, message: "All audit logs purged." });
});

// ---------- USER IMPERSONATION SYSTEM (ADMIN ONLY) ----------

/**
 * POST /api/admin/impersonate/:userId
 * Allows an administrator to securely log in as a Member or Manager to troubleshoot their dashboard.
 * - Protected by Admin-only middleware (requireAdmin)
 * - Finds target user by MongoDB _id, cooperativeId, or email
 * - Issues a scoped JWT token for the target user
 * - Audit logs the action with IMPERSONATION_START and target account ID
 */
router.post("/admin/impersonate/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const admin = req.admin;

    // Find the target user in MongoDB by _id, cooperativeId, or email
    let targetUser = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      targetUser = await Account.findById(userId);
    }
    if (!targetUser) {
      targetUser = await Account.findOne({
        $or: [
          { cooperativeId: userId },
          { email: cleanEmail(userId) }
        ]
      });
    }

    if (!targetUser) {
      return fail(res, 404, "Target user not found.");
    }

    if (targetUser.email === admin.email) {
      return fail(res, 400, "You cannot impersonate your own administrator account.");
    }

    // Generate new JWT token for that specific user (Member or Manager)
    const token = generateUserToken(targetUser, {
      isImpersonated: true,
      impersonatedBy: admin.email,
      adminId: String(admin._id || admin.id)
    });

    // Security (Audit Logging): Record IMPERSONATION_START targeting the user's account ID
    await logSystemEvent({
      action: "IMPERSONATION_START",
      actorEmail: admin.email,
      actorRole: "admin",
      actorId: admin.id || admin._id,
      targetEmail: targetUser.email,
      targetName: targetUser.fullName,
      targetRole: targetUser.role,
      targetAccount: String(targetUser._id || targetUser.id),
      details: {
        message: `Admin initiated user impersonation session`,
        targetAccountId: String(targetUser._id || targetUser.id),
        targetCooperativeId: targetUser.cooperativeId,
        targetRole: targetUser.role,
        targetEmail: targetUser.email,
        adminEmail: admin.email
      },
      status: "Success",
      req
    });

    res.json({
      ok: true,
      token,
      user: {
        id: String(targetUser._id || targetUser.id),
        email: targetUser.email,
        role: targetUser.role,
        fullName: targetUser.fullName,
        cooperativeId: targetUser.cooperativeId
      },
      message: `Impersonation session started for ${targetUser.fullName}`
    });
  } catch (error) {
    console.error("Impersonation error:", error);
    res.status(500).json({ error: "Failed to create impersonation session." });
  }
});

/**
 * POST /api/admin/impersonate/end
 * Logs completion when an administrator restores their original session.
 */
router.post("/admin/impersonate/end", async (req, res) => {
  const adminEmail = cleanEmail(req.body?.adminEmail || req.headers["x-admin-email"] || "admin");
  const targetEmail = cleanEmail(req.body?.targetEmail);
  const targetAccountId = req.body?.targetAccountId || "";

  await logSystemEvent({
    action: "IMPERSONATION_END",
    actorEmail: adminEmail,
    actorRole: "admin",
    targetEmail: targetEmail || "session",
    targetAccount: targetAccountId || targetEmail || "session",
    details: {
      message: "Admin exited user impersonation and returned to administrator dashboard",
      targetEmail,
      adminEmail
    },
    status: "Success",
    req
  });

  res.json({ ok: true, message: "Impersonation session ended." });
});

module.exports = router;
