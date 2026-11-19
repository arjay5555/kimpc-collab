const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const Notification = require("../models/Notification");
const SupportMessage = require("../models/SupportMessage");
const authenticate = require("../middleware/authenticate");
const { logAudit } = require("../services/auditLogger");
const authManager = require("../middleware/authManager");
const { fail, clean, cleanEmail } = require("./routeHelpers");
const { sendMemberSupportEmail, sendMemberNotificationEmail } = require("../services/mailer");
const cloudinaryService = require("../services/cloudinaryService");
const oneSignalService = require("../services/oneSignalService");

const router = express.Router();

function requireMember(req, res, next) {
  if (req.user?.role !== "member") return fail(res, 403, "Member access is required.");
  return next();
}

// POST /api/notifications/announce - Send an in-app announcement to opted-in members.
router.post("/notifications/announce", authManager, async (req, res) => {
  const title = clean(req.body.title);
  const message = clean(req.body.message);
  if (!title || !message) return fail(res, 400, "Announcement title and message are required.");
  const targetEmail = cleanEmail(req.body.memberEmail);
  const members = targetEmail
    ? await Account.find({ email: targetEmail, role: "member", isArchived: { $ne: true } }).select("email fullName memberSettings").lean()
    : await Account.find({ role: "member", isArchived: { $ne: true } }).select("email fullName memberSettings").lean();
  const recipients = members.filter((member) => member.memberSettings?.notifications?.inApp !== false && member.memberSettings?.notifications?.systemUpdates !== false);
  if (recipients.length === 0) return fail(res, 404, "No opted-in member recipients were found.");
  await Notification.insertMany(recipients.map(({ email }) => ({ memberEmail: email, title, message, type: "system" })));

  // Dispatch Web Push & Email notifications in background according to each member's notification preferences
  const baseOrigin = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  for (const recipient of members) {
    if (recipient.memberSettings?.notifications?.systemUpdates === false) continue;
    if (recipient.memberSettings?.notifications?.push !== false) {
      oneSignalService.sendPushNotification({
        email: recipient.email,
        title,
        message,
        url: `${baseOrigin}/member/notifications`,
      }).catch(() => {});
    }
    if (recipient.memberSettings?.notifications?.email !== false) {
      sendMemberNotificationEmail({
        toEmail: recipient.email,
        fullName: recipient.fullName,
        title,
        message,
        actionUrl: `${baseOrigin}/member/notifications`,
        category: "Announcement",
      }).catch(() => {});
    }
  }

  await logAudit({
    action: "ANNOUNCEMENT_SENT",
    module: "Member Messages",
    actorEmail: req.user?.email || "manager",
    actorName: req.user?.fullName || "",
    actorRole: req.user?.role || "manager",
    actorId: req.user?._id,
    affectedRecord: targetEmail ? `Announcement to ${targetEmail}` : `Broadcast (${recipients.length} members)`,
    targetEmail: targetEmail || "",
    details: { title, recipientCount: recipients.length, targetEmail: targetEmail || "all" },
    status: "Success",
    req,
  });

  return res.status(201).json({ created: recipients.length });
});

router.use(["/member", "/notifications"], authenticate, requireMember);

// GET /api/member/preferences - Read the signed-in member's preferences and support contacts.
router.get("/member/preferences", async (req, res) => {
  res.json({
    theme: req.user.memberSettings?.theme || "light",
    defaultFarmLocation: req.user.memberSettings?.defaultFarmLocation || "",
    defaultFarmCoordinates: {
      lat: req.user.memberSettings?.defaultFarmCoordinates?.lat ?? null,
      lng: req.user.memberSettings?.defaultFarmCoordinates?.lng ?? null,
    },
    notifications: {
      email: req.user.memberSettings?.notifications?.email ?? true,
      inApp: req.user.memberSettings?.notifications?.inApp ?? true,
      bookingReminders: req.user.memberSettings?.notifications?.bookingReminders ?? true,
      systemUpdates: req.user.memberSettings?.notifications?.systemUpdates ?? true,
      push: req.user.memberSettings?.notifications?.push ?? true,
    },
    supportEmail: process.env.SUPPORT_EMAIL || "",
    supportPhone: process.env.SUPPORT_PHONE || "",
  });
});

// PATCH /api/member/preferences - Update the signed-in member's preferences.
router.patch("/member/preferences", async (req, res) => {
  const settings = req.user.memberSettings || {};
  if (req.body.theme !== undefined) {
    if (!["light", "dark"].includes(req.body.theme)) return fail(res, 400, "Theme must be light or dark.");
    settings.theme = req.body.theme;
  }
  if (req.body.defaultFarmLocation !== undefined) {
    const location = clean(req.body.defaultFarmLocation);
    if (location.length > 500) return fail(res, 400, "Farm location must be 500 characters or fewer.");
    settings.defaultFarmLocation = location;
  }
  if (req.body.defaultFarmCoordinates !== undefined) {
    const rawCoords = req.body.defaultFarmCoordinates;
    if (rawCoords === null || (rawCoords.lat == null && rawCoords.lng == null)) {
      settings.defaultFarmCoordinates = { lat: null, lng: null };
    } else {
      const lat = Number(rawCoords.lat);
      const lng = Number(rawCoords.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return fail(res, 400, "Invalid default farm coordinates.");
      }
      settings.defaultFarmCoordinates = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }
  if (req.body.notifications !== undefined) {
    const allowed = ["email", "inApp", "bookingReminders", "systemUpdates", "push"];
    settings.notifications = { ...(settings.notifications || {}) };
    for (const key of allowed) {
      if (req.body.notifications[key] !== undefined) {
        if (typeof req.body.notifications[key] !== "boolean") return fail(res, 400, `${key} must be a boolean.`);
        settings.notifications[key] = req.body.notifications[key];
      }
    }
  }
  req.user.memberSettings = settings;
  await req.user.save();

  void logAudit({
    action: "PREFERENCES_UPDATED",
    module: "Accounts & Roles",
    actorEmail: req.user.email,
    actorName: req.user.fullName || "",
    actorRole: req.user.role || "member",
    actorId: req.user._id,
    affectedRecord: `${req.user.fullName || req.user.email} preferences`,
    targetEmail: req.user.email,
    targetName: req.user.fullName || "",
    details: {
      theme: settings.theme || "light",
      defaultFarmLocation: settings.defaultFarmLocation || "",
    },
    status: "Success",
    req,
  });

  return res.json({
    theme: settings.theme || "light",
    defaultFarmLocation: settings.defaultFarmLocation || "",
    defaultFarmCoordinates: {
      lat: settings.defaultFarmCoordinates?.lat ?? null,
      lng: settings.defaultFarmCoordinates?.lng ?? null,
    },
    notifications: {
      email: settings.notifications?.email ?? true,
      inApp: settings.notifications?.inApp ?? true,
      bookingReminders: settings.notifications?.bookingReminders ?? true,
      systemUpdates: settings.notifications?.systemUpdates ?? true,
      push: settings.notifications?.push ?? true,
    },
  });
});

// POST /api/member/push/test - Send a test web push notification.
router.post("/member/push/test", async (req, res) => {
  try {
    const pushEnabled = req.user.memberSettings?.notifications?.push !== false;
    const emailEnabled = req.user.memberSettings?.notifications?.email !== false;

    if (!pushEnabled && !emailEnabled) {
      return fail(res, 400, "Enable Web Push Notifications or Email Notifications first before sending a test.");
    }

    const title = "KIMPC Notification Test 🚜";
    const message =
      "Notifications are active! You will receive live updates whenever your machinery bookings change status.";
    const baseOrigin = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

    let pushSent = false;
    let pushError = "";
    if (pushEnabled) {
      const pushResult = await oneSignalService.sendPushNotification({
        email: req.user.email,
        title,
        message,
        url: `${baseOrigin}/member/settings`,
      });

      if (pushResult.skipped) {
        pushError =
          pushResult.reason === "disabled_by_admin"
            ? "OneSignal Web Push is disabled in Admin System Settings."
            : "Web Push notifications are turned off in your Member Settings.";
      } else if (!pushResult.ok) {
        const errText = String(pushResult.error || "Failed to dispatch OneSignal test push.");
        if (errText.toLowerCase().includes("not subscribed")) {
          const statusInfo = await oneSignalService.getOneSignalWebStatus();
          if (statusInfo.webConfigured === false) {
            pushError =
              "OneSignal Web Push platform is not configured yet for this App ID (no Web Site URL set in OneSignal Dashboard → Settings → Platforms → Web).";
          } else {
            pushError =
              "This browser is not subscribed in OneSignal yet. Allow notifications in your browser, then toggle Web Push off and back on.";
          }
        } else {
          pushError = errText;
        }
      } else {
        pushSent = true;
      }
    }

    let emailSent = false;
    let emailError = "";
    if (emailEnabled) {
      const emailResult = await sendMemberNotificationEmail({
        toEmail: req.user.email,
        fullName: req.user.fullName,
        title,
        message,
        actionUrl: `${baseOrigin}/member/settings`,
        category: "Notification Test",
      });
      if (emailResult?.sent) {
        emailSent = true;
      } else {
        emailError = emailResult?.error || emailResult?.reason || "Email could not be delivered.";
      }
    }

    if (!pushSent && !emailSent) {
      const combinedError = [pushError, emailError].filter(Boolean).join(" | ") || "Could not deliver test notification.";
      return fail(res, 400, combinedError);
    }

    const parts = [];
    if (pushSent) parts.push("Web Push");
    if (emailSent) parts.push(`Email (${req.user.email})`);

    return res.json({
      ok: true,
      pushSent,
      emailSent,
      pushError: pushError || undefined,
      emailError: emailError || undefined,
      message: `Test notification sent via ${parts.join(" and ")}!`,
    });
  } catch (err) {
    return fail(res, 500, err.message || "Failed to trigger test notification.");
  }
});

// PATCH /api/member/profile - Update the signed-in member's contact profile.
router.patch(["/member/profile", "/member/update-profile"], async (req, res) => {
  const fields = ["fullName", "phone", "address", "address2", "city", "region", "postalCode", "country"];
  for (const field of fields) {
    if (req.body[field] !== undefined) req.user[field] = clean(req.body[field]);
  }

  // Handle avatar upload to Cloudinary
  if (req.body.avatar !== undefined) {
    const rawAvatar = String(req.body.avatar || "").trim();
    if (rawAvatar.startsWith("data:image/")) {
      try {
        const uploadResult = await cloudinaryService.uploadImage(rawAvatar, {
          folder: "kimpc/avatars",
          filename: `avatar-${req.user._id}`,
        });
        req.user.avatar = uploadResult.url;
      } catch (err) {
        console.warn("Could not upload avatar to Cloudinary, fallback applied:", err.message);
        req.user.avatar = clean(rawAvatar);
      }
    } else {
      req.user.avatar = clean(rawAvatar);
    }
  }

  if (!req.user.fullName) return fail(res, 400, "Full name is required.");
  await req.user.save();

  void logAudit({
    action: "PROFILE_UPDATED",
    module: "Accounts & Roles",
    actorEmail: req.user.email,
    actorName: req.user.fullName || "",
    actorRole: req.user.role || "member",
    actorId: req.user._id,
    targetEmail: req.user.email,
    targetName: req.user.fullName || "",
    targetRole: req.user.role || "member",
    details: "Member updated profile information",
    status: "Success",
    req,
  });

  return res.json({
    fullName: req.user.fullName,
    email: req.user.email,
    phone: req.user.phone,
    avatar: req.user.avatar,
    address: req.user.address,
    address2: req.user.address2,
    city: req.user.city,
    region: req.user.region,
    postalCode: req.user.postalCode,
    country: req.user.country
  });
});

// POST /api/member/change-password - Change the signed-in member's password.
router.post("/member/change-password", async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (!currentPassword || !newPassword) return fail(res, 400, "Current and new passwords are required.");
  if (newPassword.length < 8) return fail(res, 400, "New password must be at least 8 characters.");
  const account = await Account.findById(req.user._id).select("+passwordHash");
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    await logAudit({
      action: "PASSWORD_CHANGE_FAILED",
      module: "Authentication",
      actorEmail: req.user.email,
      actorName: req.user.fullName || "",
      actorRole: req.user.role || "member",
      actorId: req.user._id,
      targetEmail: req.user.email,
      details: "Password change denied: incorrect current password",
      status: "Failed",
      req,
    });
    return fail(res, 401, "Current password is incorrect.");
  }
  account.passwordHash = await bcrypt.hash(newPassword, 10);
  account.mustChangePassword = false;
  await account.save();

  await logAudit({
    action: "PASSWORD_CHANGED",
    module: "Authentication",
    actorEmail: account.email,
    actorName: account.fullName || "",
    actorRole: account.role || "member",
    actorId: account._id,
    targetEmail: account.email,
    targetName: account.fullName || "",
    details: "Member updated account password",
    status: "Success",
    req,
  });

  return res.json({ ok: true, message: "Password updated." });
});

// POST /api/member/support-request - Send a support request to the manager.
router.post(["/member/support-request", "/member/messages"], async (req, res) => {
  const subject = clean(req.body.subject);
  const message = clean(req.body.message);
  if (!subject || !message) return fail(res, 400, "A subject and message are required.");
  if (subject.length > 120 || message.length > 3000) return fail(res, 400, "Subject or message exceeds the allowed length.");

  // Save to database so manager can view in Messages
  const inquiry = await SupportMessage.create({
    memberEmail: req.user.email,
    memberName: req.user.fullName || "Cooperative Member",
    subject,
    message,
    status: "unread",
  });

  // Notify all managers in-app
  const managers = await Account.find(Account.activeManagersFilter()).select("email").lean();
  if (managers.length > 0) {
    await Notification.insertMany(
      managers.map((m) => ({
        memberEmail: m.email,
        title: "New Member Question",
        message: `${req.user.fullName || req.user.email} asked: "${subject}"`,
        type: "info",
      }))
    );
  }

  // Log audit event
  await logAudit({
    action: "MEMBER_QUESTION_SUBMITTED",
    module: "Member Messages",
    actorEmail: req.user.email,
    actorName: req.user.fullName || "Cooperative Member",
    actorRole: req.user.role || "member",
    affectedRecord: `Question: "${subject}"`,
    details: `Member submitted question: "${subject}"`,
    status: "Success",
    req,
  });

  // Backup email attempt
  try {
    await sendMemberSupportEmail({
      fromEmail: req.user.email,
      fullName: req.user.fullName,
      subject,
      message,
    });
  } catch (err) {
    // Ignore SMTP errors
  }

  return res.status(201).json({
    ok: true,
    message: "Your question has been sent to the cooperative manager.",
    inquiry,
  });
});

// Member views their questions and manager replies
router.get("/member/messages", async (req, res) => {
  try {
    const messages = await SupportMessage.find({ memberEmail: req.user.email }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, messages });
  } catch (err) {
    return fail(res, 500, "Failed to load messages.");
  }
});

// GET /api/notifications - List the signed-in member's notifications and unread count.
router.get("/notifications", async (req, res) => {
  const notifications = await Notification.find({ memberEmail: req.user.email }).sort({ createdAt: -1 }).limit(100).lean();
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  return res.json({ notifications, unreadCount });
});

// PATCH /api/notifications/read-all - Mark all of the signed-in member's notifications as read.
router.patch("/notifications/read-all", async (req, res) => {
  const result = await Notification.updateMany({ memberEmail: req.user.email, readAt: null }, { $set: { readAt: new Date() } });
  return res.json({ updated: result.modifiedCount });
});

// PATCH /api/notifications/:id/read - Mark one of the signed-in member's notifications as read.
router.patch("/notifications/:id/read", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid notification id.");
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, memberEmail: req.user.email },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) return fail(res, 404, "Notification not found.");
  return res.json(notification);
});

// DELETE /api/notifications/:id - Delete one of the signed-in member's notifications.
router.delete("/notifications/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid notification id.");
  const result = await Notification.deleteOne({ _id: req.params.id, memberEmail: req.user.email });
  if (!result.deletedCount) return fail(res, 404, "Notification not found.");
  return res.json({ ok: true });
});

module.exports = router;
