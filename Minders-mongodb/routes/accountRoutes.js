const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const router = express.Router();

const Account = require("../models/Account");
const Application = require("../models/Application");
const AuditLog = require("../models/AuditLog");

const { sendDeleteOtpEmail } = require("../services/mailer");
const { logAudit, logSystemEvent } = require("../services/auditLogger");
const {
  ROLES,
  PROFILE_FIELDS,
  clean,
  cleanEmail,
  fail,
  generateUserToken,
  requireAdmin,
  nextCooperativeId,
} = require("./routeHelpers");

// Temporary in-memory stores for multi-factor admin deletion flow
const deleteOtpStore = new Map(); // adminEmail -> { code, targetEmail, expiresAt, attempts }
const authorizedDeletions = new Map(); // token -> { adminEmail, targetEmail, expiresAt }

// ---------- Sequential Cooperative ID ----------
router.get("/cooperative-id/next", async (req, res) => {
  try {
    res.json({ cooperativeId: await nextCooperativeId() });
  } catch (error) {
    console.error("Error fetching next cooperative ID:", error);
    res.status(500).json({ error: "Failed to generate next cooperative ID." });
  }
});

// ---------- Accounts (admin directory + member profile) ----------

router.get("/accounts", async (req, res) => {
  try {
    res.json(await Account.find().sort({ createdAt: 1 }));
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ error: "Failed to fetch accounts." });
  }
});

router.get("/accounts/:email", async (req, res) => {
  try {
    const account = await Account.findOne({ email: cleanEmail(req.params.email) });
    if (!account) return fail(res, 404, "Account not found.");
    res.json(account);
  } catch (error) {
    console.error("Error fetching account:", error);
    res.status(500).json({ error: "Failed to fetch account." });
  }
});

// Account created by an administrator (Staff or Member, pre-verified)
router.post("/accounts", async (req, res) => {
  try {
    const fullName = clean(req.body.fullName);
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password ?? "");
    const role = clean(req.body.role);
    const adminActor = cleanEmail(req.body.actorEmail || req.headers["x-actor-email"] || req.user?.email || "admin");

    if (!fullName || !email) return fail(res, 400, "Full name and email are required.");
    if (!ROLES.includes(role)) return fail(res, 400, "Please select a valid role (Member, Staff/Manager, or Admin).");
    if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
    if (await Account.exists({ email })) return fail(res, 409, "An account already exists for this email address.");

    let cooperativeId = clean(req.body.cooperativeId);
    if (!cooperativeId && (role === "member" || role === "manager")) {
      cooperativeId = await nextCooperativeId();
    }
    if (cooperativeId) {
      const existingCoop = await Account.findOne({
        $or: [
          { cooperativeId },
          { cooperativeId: cooperativeId.toUpperCase() },
        ],
      });
      if (existingCoop) {
        return fail(res, 409, `Cooperative ID "${cooperativeId}" is already assigned to another account (${existingCoop.fullName}).`);
      }
    }

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

    const phone = clean(req.body.phone);
    const account = await Account.create({
      fullName,
      email,
      phone,
      cooperativeId: cooperativeId || undefined,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      emailVerified: true,
      verificationStatus: req.body.verificationStatus || "verified",
      verifiedAt: new Date(),
      adminPinHash,
      mustChangePin,
      mustChangePassword: Boolean(req.body.mustChangePassword),
    });

    await logAudit({
      action: "ACCOUNT_CREATED",
      actorEmail: adminActor,
      actorRole: "admin",
      targetEmail: email,
      targetName: fullName,
      targetRole: role,
      details: `Admin provisioned verified ${role} account for "${fullName}" (${email})${cooperativeId ? ` [Coop ID: ${cooperativeId}]` : ""}${role === "admin" ? " (assigned 6-digit Setup PIN)" : ""}`,
      req,
    });

    const responseJson = account.toJSON ? account.toJSON() : account;
    if (assignedOneTimePin) {
      responseJson.oneTimePin = assignedOneTimePin;
    }

    res.status(201).json(responseJson);
  } catch (error) {
    console.error("Error creating account:", error);
    res.status(500).json({ error: error.message || "Failed to create account." });
  }
});

// Admin edits an account (fullName, email, password, role)
router.patch("/accounts/:email", async (req, res) => {
  try {
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
        req,
      });
    }

    if (newRole) {
      if (!ROLES.includes(newRole)) return fail(res, 400, "Invalid role specified.");
      account.role = newRole;
    }

    if (req.body.adminPin && (account.role === "admin" || newRole === "admin")) {
      const pinStr = String(req.body.adminPin).trim();
      if (!/^\d{6}$/.test(pinStr)) {
        return fail(res, 400, "Admin Security PIN must be exactly 6 digits.");
      }
      account.adminPinHash = await bcrypt.hash(pinStr, 10);
      account.mustChangePin = false;
      account.pinSetAt = new Date();
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
      req,
    });

    res.json(account);
  } catch (error) {
    console.error("Error updating account:", error);
    res.status(500).json({ error: "Failed to update account." });
  }
});

// Admin suspends / unsuspends an account
router.patch("/accounts/:email/suspend", async (req, res) => {
  try {
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
      req,
    });

    res.json(account);
  } catch (error) {
    console.error("Error toggling account suspension:", error);
    res.status(500).json({ error: "Failed to update account suspension." });
  }
});

// Admin archives / unarchives (restores) an account
router.patch("/accounts/:email/archive", async (req, res) => {
  try {
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
      req,
    });

    res.json(account);
  } catch (error) {
    console.error("Error toggling account archive:", error);
    res.status(500).json({ error: "Failed to update account archive status." });
  }
});

// ---------- 6-DIGIT ADMIN ACTION SECURITY PIN SYSTEM ----------

// 1. Get current PIN status for an admin
router.get("/admin/pin-status", async (req, res) => {
  try {
    const email = cleanEmail(req.query.email);
    if (!email) return fail(res, 400, "Admin email required.");

    const admin = await Account.findOne({ email });
    if (!admin || admin.role !== "admin") return fail(res, 403, "Administrator privileges required.");

    res.json({
      ok: true,
      hasPin: Boolean(admin.adminPinHash),
      mustChangePin: Boolean(admin.mustChangePin),
    });
  } catch (error) {
    console.error("Error fetching PIN status:", error);
    res.status(500).json({ error: "Failed to fetch PIN status." });
  }
});

// 2. Set initial 6-digit PIN (for 1st admin or Google admins without a PIN)
router.post("/admin/set-initial-pin", async (req, res) => {
  try {
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
      req,
    });

    res.json({ ok: true, message: "6-digit admin security PIN has been set successfully." });
  } catch (error) {
    console.error("Error setting initial PIN:", error);
    res.status(500).json({ error: "Failed to set security PIN." });
  }
});

// 3. Change One-Time Temporary PIN or update PIN
router.post("/admin/change-pin", async (req, res) => {
  try {
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
        req,
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
      req,
    });

    res.json({ ok: true, message: "Admin security PIN updated successfully." });
  } catch (error) {
    console.error("Error changing admin PIN:", error);
    res.status(500).json({ error: "Failed to update security PIN." });
  }
});

// 4. Verify 6-digit PIN for destructive actions
router.post("/admin/verify-pin", async (req, res) => {
  try {
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
        req,
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
        req,
      });
      return fail(res, 401, "Incorrect 6-digit admin security PIN.");
    }

    const targetAccount = targetEmail ? await Account.findOne({ email: targetEmail }) : null;

    // Generate single-use authorization token
    const deleteToken = crypto.randomUUID();
    authorizedDeletions.set(deleteToken, {
      adminEmail,
      targetEmail,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await logAudit({
      action: "ADMIN_PIN_VERIFIED",
      actorEmail: adminEmail,
      actorRole: "admin",
      targetEmail,
      details: `Admin 6-digit PIN verified to authorize action on account (${targetEmail})`,
      req,
    });

    res.json({
      ok: true,
      deleteToken,
      target: targetAccount ? {
        email: targetAccount.email,
        fullName: targetAccount.fullName,
        role: targetAccount.role,
      } : null,
      message: "Admin 6-digit security PIN verified.",
    });
  } catch (error) {
    console.error("Error verifying admin PIN:", error);
    res.status(500).json({ error: "Failed to verify admin PIN." });
  }
});

// ---------- MULTI-FACTOR ACCOUNT DELETION VERIFICATION FLOW ----------

// Step 2 Verification: Re-authenticate Admin (Accepts either 6-digit PIN or password)
router.post("/admin/verify-password", async (req, res) => {
  try {
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
        req,
      });
      return fail(res, 403, "Administrator privileges required.");
    }

    let match = false;
    if (admin.adminPinHash) {
      match = await bcrypt.compare(passwordOrPin, admin.adminPinHash);
    }
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
        req,
      });
      return fail(res, 401, "Incorrect 6-digit admin PIN or password.");
    }

    const targetEmail = cleanEmail(req.body.targetEmail);
    const targetAccount = targetEmail ? await Account.findOne({ email: targetEmail }) : null;

    const deleteToken = crypto.randomUUID();
    authorizedDeletions.set(deleteToken, {
      adminEmail,
      targetEmail,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await logAudit({
      action: "ADMIN_PASSWORD_VERIFIED",
      actorEmail: adminEmail,
      actorRole: "admin",
      targetEmail,
      details: `Admin password verified to authorize deletion of account (${targetEmail})`,
      req,
    });

    res.json({
      ok: true,
      deleteToken,
      target: targetAccount ? {
        email: targetAccount.email,
        fullName: targetAccount.fullName,
        role: targetAccount.role,
      } : null,
      message: "Admin password verified.",
    });
  } catch (error) {
    console.error("Error verifying password/PIN:", error);
    res.status(500).json({ error: "Failed to verify admin password." });
  }
});

// Step 3 Verification: Generate and send OTP to Admin Email
router.post("/admin/request-delete-otp", async (req, res) => {
  try {
    const adminEmail = cleanEmail(req.body.adminEmail);
    const targetEmail = cleanEmail(req.body.targetEmail);

    if (!adminEmail || !targetEmail) return fail(res, 400, "Admin email and target email are required.");
    if (adminEmail === targetEmail) return fail(res, 400, "You cannot delete your own admin account.");

    const admin = await Account.findOne({ email: adminEmail });
    if (!admin || admin.role !== "admin") return fail(res, 403, "Administrator privileges required.");

    const target = await Account.findOne({ email: targetEmail });
    if (!target) return fail(res, 404, "Target account does not exist.");

    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    deleteOtpStore.set(adminEmail, {
      code: otpCode,
      targetEmail,
      expiresAt,
      attempts: 0,
    });

    const emailResult = await sendDeleteOtpEmail({
      toEmail: adminEmail,
      otpCode,
      targetName: target.fullName,
      targetRole: target.role,
      targetEmail: target.email,
    });

    await logAudit({
      action: "DELETE_OTP_SENT",
      actorEmail: adminEmail,
      actorRole: "admin",
      targetEmail: target.email,
      targetName: target.fullName,
      targetRole: target.role,
      details: `Dispatched 6-digit deletion OTP to admin email (${adminEmail}) for account "${target.fullName}" (${target.role}) [Method: ${emailResult.sent ? "Real SMTP Email" : "Local Simulator"}]`,
      req,
    });

    res.json({
      ok: true,
      emailSent: Boolean(emailResult.sent),
      message: emailResult.sent
        ? `A 6-digit verification code has been delivered to ${adminEmail}.`
        : `A 6-digit verification code was generated for ${adminEmail}.`,
      demoOtp: emailResult.sent ? null : otpCode,
    });
  } catch (error) {
    console.error("Error requesting delete OTP:", error);
    res.status(500).json({ error: "Failed to send delete verification code." });
  }
});

// Step 3 Verification (part b): Verify OTP sent to Admin Email
router.post("/admin/verify-delete-otp", async (req, res) => {
  try {
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
        req,
      });
      return fail(res, 400, "Invalid 6-digit OTP code. Please check your email and try again.");
    }

    deleteOtpStore.delete(adminEmail);

    const deleteToken = crypto.randomUUID();
    authorizedDeletions.set(deleteToken, {
      adminEmail,
      targetEmail,
      expiresAt: Date.now() + 5 * 60 * 1000,
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
      req,
    });

    res.json({
      ok: true,
      deleteToken,
      target: {
        fullName: target.fullName,
        email: target.email,
        role: target.role,
        cooperativeId: target.cooperativeId || "",
      },
    });
  } catch (error) {
    console.error("Error verifying delete OTP:", error);
    res.status(500).json({ error: "Failed to verify delete OTP." });
  }
});

// Final Step: Complete Account Deletion (with verified token)
router.delete("/accounts/:email", async (req, res) => {
  try {
    const targetEmail = cleanEmail(req.params.email);
    const deleteToken = req.body?.deleteToken || req.headers["x-delete-token"];
    const adminActor = cleanEmail(req.body?.adminEmail || req.headers["x-admin-email"] || "admin");

    if (!deleteToken || !authorizedDeletions.has(deleteToken)) {
      return fail(res, 403, "Deletion authorization token missing or invalid. Complete admin verification first.");
    }

    const authData = authorizedDeletions.get(deleteToken);
    authorizedDeletions.delete(deleteToken);

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

    await Account.deleteOne({ email: targetEmail });
    await Application.deleteMany({ memberEmail: targetEmail });

    await logAudit({
      action: "ACCOUNT_DELETED",
      actorEmail: authData.adminEmail || adminActor,
      actorRole: "admin",
      targetEmail,
      targetName: fullName,
      targetRole: role,
      details: `Permanently deleted ${role} account "${fullName}" (${targetEmail}) following administrator password verification and final confirmation.`,
      req,
    });

    res.json({
      ok: true,
      deleted: targetEmail,
      fullName,
      role,
      message: `Account for ${fullName} (${role}) has been completely deleted.`,
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ error: "Failed to delete account." });
  }
});

// Step 1 of a profile edit: store the changes as "pending".
router.post("/accounts/:email/profile-update", async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error staging profile update:", error);
    res.status(500).json({ error: "Failed to stage profile update." });
  }
});

// Step 2: the member confirms, so the pending changes are applied.
router.post("/accounts/:email/profile-confirm", async (req, res) => {
  try {
    const ownerEmail = cleanEmail(req.params.email);
    const account = await Account.findOne({ email: ownerEmail });
    if (!account) return fail(res, 404, "Account not found.");
    const pending = account.pendingUpdate;
    if (!pending) return fail(res, 400, "There is no pending profile update.");
    if (pending.email !== ownerEmail && (await Account.exists({ email: pending.email }))) {
      return fail(res, 409, "An account already exists for this email address.");
    }

    PROFILE_FIELDS.forEach((field) => {
      account[field] = pending[field];
    });
    account.emailVerified = true;
    account.pendingUpdate = null;
    await account.save();

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
      details: "Member confirmed profile details update",
      req,
    });

    res.json(account);
  } catch (error) {
    console.error("Error confirming profile update:", error);
    res.status(500).json({ error: "Failed to confirm profile update." });
  }
});

// ---------- AUDIT LOGS ENDPOINTS ----------

router.get("/audit-logs", async (req, res) => {
  try {
    const search = clean(req.query.search);
    const action = clean(req.query.action);
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const includeStats = req.query.stats === "true";

    const query = { isArchived: { $ne: true } };
    if (action && action !== "ALL") query.action = action;
    if (search) {
      query.$or = [
        { actorEmail: { $regex: search, $options: "i" } },
        { targetEmail: { $regex: search, $options: "i" } },
        { targetName: { $regex: search, $options: "i" } },
        { action: { $regex: search, $options: "i" } },
      ];
    }

    const rawLogs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();

    const logs = rawLogs.map((log) => {
      const resolvedModule = log.module && log.module !== "General" && log.module !== "System"
        ? log.module
        : deriveModule(log.action);

      const resolvedAffected = log.affectedRecord && log.affectedRecord !== "—"
        ? log.affectedRecord
        : deriveAffectedRecord(log);

      const actorEmail = log.actorEmail || log.actor?.email || "system@kimpc.coop";
      const actorName = log.actorName || log.actor?.fullName || (actorEmail.includes("@") ? actorEmail.split("@")[0] : "System");
      const actorRole = log.actorRole || log.actor?.role || "admin";

      let detailsText = "";
      if (typeof log.details === "object" && log.details !== null) {
        try {
          detailsText = Object.entries(log.details)
            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
            .join(" • ");
        } catch (e) {
          detailsText = JSON.stringify(log.details);
        }
      } else {
        detailsText = String(log.details || "—");
      }

      return {
        _id: String(log._id),
        id: String(log._id),
        createdAt: log.createdAt,
        timestamp: log.createdAt,
        date: log.createdAt
          ? new Date(log.createdAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Recently",
        performedBy: {
          name: actorName,
          email: actorEmail,
          role: actorRole,
        },
        actorEmail,
        actorName,
        actorRole,
        module: resolvedModule,
        action: log.action,
        affectedRecord: resolvedAffected,
        result: log.status || "Success",
        status: log.status || "Success",
        details: detailsText,
        rawDetails: log.details,
        ip: log.ip || "",
      };
    });

    if (includeStats) {
      const allActive = await AuditLog.countDocuments({ isArchived: { $ne: true } });
      const deletions = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /DELETED/ });
      const modifications = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /UPDATED|SUSPENDED|ARCHIVED|RESTORED|ACTIVATED/ });
      const logins = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /LOGIN/ });
      const bookings = await AuditLog.countDocuments({ isArchived: { $ne: true }, action: /BOOKING/ });
      return res.json({ logs, stats: { total: allActive, deletions, modifications, logins, bookings } });
    }

    res.json({ ok: true, logs, total: logs.length });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Failed to fetch audit logs." });
  }
});

router.delete("/audit-logs", async (req, res) => {
  try {
    const adminEmail = cleanEmail(req.body?.adminEmail || req.headers["x-admin-email"] || "admin");
    await AuditLog.deleteMany({});
    await logAudit({
      action: "AUDIT_LOGS_PURGED",
      actorEmail: adminEmail,
      actorRole: "admin",
      details: "All administrative audit log entries were purged by administrator",
      req,
    });
    res.json({ ok: true, message: "All audit logs purged." });
  } catch (error) {
    console.error("Error purging audit logs:", error);
    res.status(500).json({ error: "Failed to purge audit logs." });
  }
});

// ---------- USER IMPERSONATION SYSTEM (ADMIN ONLY) ----------

router.post("/admin/impersonate/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const admin = req.admin;

    let targetUser = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      targetUser = await Account.findById(userId);
    }
    if (!targetUser) {
      targetUser = await Account.findOne({
        $or: [
          { cooperativeId: userId },
          { email: cleanEmail(userId) },
        ],
      });
    }

    if (!targetUser) {
      return fail(res, 404, "Target user not found.");
    }

    if (targetUser.email === admin.email) {
      return fail(res, 400, "You cannot impersonate your own administrator account.");
    }

    const token = generateUserToken(targetUser, {
      isImpersonated: true,
      impersonatedBy: admin.email,
      adminId: String(admin._id || admin.id),
    });

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
        message: "Admin initiated user impersonation session",
        targetAccountId: String(targetUser._id || targetUser.id),
        targetCooperativeId: targetUser.cooperativeId,
        targetRole: targetUser.role,
        targetEmail: targetUser.email,
        adminEmail: admin.email,
      },
      status: "Success",
      req,
    });

    res.json({
      ok: true,
      token,
      user: {
        id: String(targetUser._id || targetUser.id),
        email: targetUser.email,
        role: targetUser.role,
        fullName: targetUser.fullName,
        cooperativeId: targetUser.cooperativeId,
      },
      message: `Impersonation session started for ${targetUser.fullName}`,
    });
  } catch (error) {
    console.error("Impersonation error:", error);
    res.status(500).json({ error: "Failed to create impersonation session." });
  }
});

router.post("/admin/impersonate/end", async (req, res) => {
  try {
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
        adminEmail,
      },
      status: "Success",
      req,
    });

    res.json({ ok: true, message: "Impersonation session ended." });
  } catch (error) {
    console.error("Error ending impersonation:", error);
    res.status(500).json({ error: "Failed to end impersonation session." });
  }
});

module.exports = router;

