const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Account = require("../models/Account");
const authenticate = require("../middleware/authenticate");
const { logAudit } = require("../services/auditLogger");
const {
  clean,
  cleanEmail,
  fail,
  getSystemSetting,
  setSystemSetting,
  generateUserToken,
  requireAdmin,
  verifyRecaptcha,
} = require("./routeHelpers");

const router = express.Router();

// Helper to calculate sequential Cooperative ID
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

// ---------- Registration & Verification ----------

router.post("/register", async (req, res) => {
  let fullName = clean(req.body.fullName);
  let firstName = clean(req.body.firstName);
  let middleName = clean(req.body.middleName || "");
  let lastName = clean(req.body.lastName);

  if (!fullName && (firstName || lastName)) {
    fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  }

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
      cooperativeId: { $regex: new RegExp(`^${coopId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
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
    emailVerified: false,
  });

  await logAudit({
    action: "USER_REGISTERED",
    actorEmail: email,
    actorRole: "member",
    targetEmail: email,
    targetName: fullName,
    targetRole: "member",
    details: `New member account created with ID ${coopId}`,
    req,
  });

  res.status(201).json(account);
});

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
    req,
  });

  res.json(account);
});

// ---------- System Settings & Public Config ----------

router.get("/config", async (req, res) => {
  const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
  const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
  const recaptchaEnabled = await getSystemSetting("recaptchaEnabled", process.env.RECAPTCHA_ENABLED !== "false");
  res.json({
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "6LfrJe0tAAAAAIIeW87yfUlJuzJOokkWT4KM6UG5",
    recaptchaEnabled: Boolean(recaptchaEnabled),
    googleClientId: process.env.GOOGLE_CLIENT_ID || "1042055157169-ijq2fs7mffqjscvro4eli4928iq0nii4.apps.googleusercontent.com",
    googleLoginEnabled: Boolean(googleLoginEnabled),
    facebookAppId: process.env.FACEBOOK_APP_ID || "4031349940338782",
    facebookLoginEnabled: Boolean(facebookLoginEnabled),
  });
});

router.get("/admin/settings", requireAdmin, async (req, res) => {
  try {
    const googleLoginEnabled = await getSystemSetting("googleLoginEnabled", true);
    const facebookLoginEnabled = await getSystemSetting("facebookLoginEnabled", true);
    const recaptchaEnabled = await getSystemSetting("recaptchaEnabled", process.env.RECAPTCHA_ENABLED !== "false");
    res.json({
      googleLoginEnabled: Boolean(googleLoginEnabled),
      facebookLoginEnabled: Boolean(facebookLoginEnabled),
      recaptchaEnabled: Boolean(recaptchaEnabled),
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
      req,
    });

    res.json({
      ok: true,
      googleLoginEnabled: enabled,
      message: `Log in with Google has been ${enabled ? "enabled" : "disabled"} successfully.`,
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
      req,
    });

    res.json({
      ok: true,
      facebookLoginEnabled: enabled,
      message: `Log in with Facebook has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving Facebook login setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

router.post("/admin/settings/recaptcha", requireAdmin, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const updatedBy = req.admin?.email || "admin";
    await setSystemSetting(
      "recaptchaEnabled",
      enabled,
      "Require Google reCAPTCHA verification on login and registration",
      updatedBy
    );

    await logAudit({
      action: "SETTINGS_UPDATED",
      actorEmail: updatedBy,
      actorRole: req.admin?.role || "admin",
      details: `Administrator ${enabled ? "enabled" : "disabled"} reCAPTCHA security verification`,
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      recaptchaEnabled: enabled,
      message: `reCAPTCHA verification has been ${enabled ? "enabled" : "disabled"} successfully.`,
    });
  } catch (err) {
    console.error("Error saving reCAPTCHA setting:", err);
    fail(res, 500, "Failed to update setting.");
  }
});

// ---------- Core Login & Password Recovery ----------

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
      { cooperativeId: { $regex: new RegExp(`^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
    ],
  });

  if (!account) {
    await logAudit({
      action: "LOGIN_FAILED",
      actorEmail: identifier,
      actorRole: "guest",
      details: "Sign-in rejected: account not found in database",
      status: "Failed",
      req,
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
      req,
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
      req,
    });
    return fail(
      res,
      403,
      `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`
    );
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
      req,
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
      req,
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
    req,
  });

  const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
  responseData.token = generateUserToken(account);
  res.json(responseData);
});

router.post("/auth/forgot-password-request", async (req, res) => {
  const identifier = clean(req.body.identifier || req.body.email);
  if (!identifier) return fail(res, 400, "Please enter your Member ID or registered email.");

  const account = await Account.findOne({
    $or: [
      { email: cleanEmail(identifier) },
      { cooperativeId: identifier },
      { cooperativeId: identifier.toUpperCase() },
    ],
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
    req,
  });

  res.json({
    ok: true,
    message:
      "Your password recovery request has been submitted. Please contact your cooperative administrator to receive your temporary One-Time Password (OTP).",
  });
});

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
    req,
  });

  const responseData = account.toJSON ? account.toJSON() : account;
  responseData.token = generateUserToken(account);
  res.json({
    ok: true,
    account: responseData,
    message: "Permanent password established successfully! You are now securely logged in.",
  });
});

// ---------- Social Authentication (Google & Facebook) ----------

router.post("/auth/google", async (req, res) => {
  try {
    let email = cleanEmail(req.body.email);
    let fullName = clean(req.body.fullName);
    const credential = req.body.credential;

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
        req,
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
          req,
        });
        return fail(
          res,
          403,
          `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`
        );
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
          req,
        });
        return fail(res, 403, "This account is currently archived. Please contact the administrator.");
      }

      if (!account.emailVerified) {
        account.emailVerified = true;
        account.verifiedAt = new Date();
        await account.save();
      }
    } else {
      const cooperativeId = await nextCooperativeId();
      const randomPassword = crypto.randomBytes(16).toString("hex");
      account = await Account.create({
        fullName: fullName || "Google Member",
        email,
        passwordHash: await bcrypt.hash(randomPassword, 10),
        role: "member",
        cooperativeId,
        emailVerified: true,
        verifiedAt: new Date(),
      });

      await logAudit({
        action: "ACCOUNT_CREATED",
        actorEmail: email,
        actorRole: "member",
        targetEmail: email,
        targetName: account.fullName,
        targetRole: "member",
        details: `New member registered via Google sign-in (assigned ID: ${cooperativeId})`,
        req,
      });
    }

    await logAudit({
      action: "USER_LOGIN",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `User signed in successfully with Google to ${account.role} portal`,
      req,
    });

    const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
    responseData.token = generateUserToken(account);
    res.json(responseData);
  } catch (error) {
    console.error("Google authentication error:", error);
    res.status(500).json({ error: "Google authentication failed. Please try again." });
  }
});

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
        req,
      });
      return fail(res, 403, "Log in with Facebook is currently disabled by the system administrator.");
    }

    const { accessToken, userID } = req.body;
    let email = cleanEmail(req.body.email);
    let fullName = clean(req.body.name || req.body.fullName);
    let fbId = clean(userID || req.body.id);

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

    if (!email && fbId) {
      email = `fb_${fbId}@facebook.member.minders`;
    }

    if (!email) {
      return fail(res, 400, "Facebook account email or user ID is required.");
    }

    let account = await Account.findOne({
      $or: [{ email }, ...(fbId ? [{ email: `fb_${fbId}@facebook.member.minders` }] : [])],
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
          req,
        });
        return fail(
          res,
          403,
          `This account has been suspended by the administrator.${account.suspensionReason ? ` Reason: ${account.suspensionReason}` : " Please contact the administrator."}`
        );
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
          req,
        });
        return fail(res, 403, "This account is currently archived. Please contact the administrator.");
      }

      if (!account.emailVerified) {
        account.emailVerified = true;
        account.verifiedAt = new Date();
        await account.save();
      }
    } else {
      const cooperativeId = await nextCooperativeId();
      const randomPassword = crypto.randomBytes(16).toString("hex");
      account = await Account.create({
        fullName: fullName || "Facebook Member",
        email,
        passwordHash: await bcrypt.hash(randomPassword, 10),
        role: "member",
        cooperativeId,
        emailVerified: true,
        verifiedAt: new Date(),
      });

      await logAudit({
        action: "ACCOUNT_CREATED",
        actorEmail: email,
        actorRole: "member",
        targetEmail: email,
        targetName: account.fullName,
        targetRole: "member",
        details: `New member registered via Facebook sign-in (assigned ID: ${cooperativeId})`,
        req,
      });
    }

    await logAudit({
      action: "USER_LOGIN",
      actorEmail: email,
      actorRole: account.role,
      targetEmail: email,
      targetName: account.fullName,
      details: `User signed in successfully with Facebook to ${account.role} portal`,
      req,
    });

    const responseData = account.toJSON ? account.toJSON() : (account.toObject ? account.toObject() : account);
    responseData.token = generateUserToken(account);
    res.json(responseData);
  } catch (error) {
    console.error("Facebook authentication error:", error);
    res.status(500).json({ error: "Facebook authentication failed. Please try again." });
  }
});

// ---------- Authenticated User Profile & Password Management (Admin, Manager, Member) ----------

// Get current authenticated user's profile information
router.get("/auth/me", authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.user._id).select("-passwordHash -adminPinHash").lean();
    if (!account) return fail(res, 404, "Account not found.");
    res.json(account);
  } catch (error) {
    console.error("Fetch current profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile information." });
  }
});

// Authenticated user changes their own password
router.post("/auth/change-password", authenticate, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "").trim();
    const newPassword = String(req.body.newPassword || "").trim();
    const confirmPassword = String(req.body.confirmPassword || "").trim();

    if (!currentPassword || !newPassword) {
      return fail(res, 400, "Current and new passwords are required.");
    }
    if (newPassword.length < 6) {
      return fail(res, 400, "New password must be at least 6 characters.");
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      return fail(res, 400, "New passwords do not match.");
    }

    const account = await Account.findById(req.user._id).select("+passwordHash");
    if (!account) return fail(res, 404, "Account not found.");

    const match = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!match) {
      return fail(res, 401, "Current password is incorrect.");
    }

    account.passwordHash = await bcrypt.hash(newPassword, 10);
    account.mustChangePassword = false;
    await account.save();

    await logAudit({
      action: "PASSWORD_CHANGED",
      actorEmail: account.email,
      actorRole: account.role,
      targetEmail: account.email,
      targetName: account.fullName,
      details: `${account.role} ${account.fullName} updated their account password`,
      req,
    });

    return res.json({ ok: true, message: "Password updated successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Failed to update password." });
  }
});

// Authenticated user updates their own profile details
router.patch("/auth/profile", authenticate, async (req, res) => {
  try {
    const account = await Account.findById(req.user._id);
    if (!account) return fail(res, 404, "Account not found.");

    if (req.body.fullName) account.fullName = clean(req.body.fullName);
    if (req.body.phone !== undefined) account.phone = clean(req.body.phone);
    if (req.body.address !== undefined) account.address = clean(req.body.address);
    if (req.body.city !== undefined) account.city = clean(req.body.city);

    await account.save();

    await logAudit({
      action: "PROFILE_UPDATED",
      actorEmail: account.email,
      actorRole: account.role,
      targetEmail: account.email,
      targetName: account.fullName,
      details: `${account.role} ${account.fullName} updated personal profile details`,
      req,
    });

    const responseData = account.toJSON ? account.toJSON() : account;
    delete responseData.passwordHash;
    delete responseData.adminPinHash;
    return res.json({ ok: true, user: responseData });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

module.exports = router;

