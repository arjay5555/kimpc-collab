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
const { sendMemberSupportEmail } = require("../services/mailer");

const router = express.Router();

function requireMember(req, res, next) {
  if (req.user?.role !== "member") return fail(res, 403, "Member access is required.");
  return next();
}

router.post("/notifications/announce", authManager, async (req, res) => {
  const title = clean(req.body.title);
  const message = clean(req.body.message);
  if (!title || !message) return fail(res, 400, "Announcement title and message are required.");
  const targetEmail = cleanEmail(req.body.memberEmail);
  const members = targetEmail
    ? await Account.find({ email: targetEmail, role: "member", isArchived: { $ne: true } }).select("email memberSettings").lean()
    : await Account.find({ role: "member", isArchived: { $ne: true } }).select("email memberSettings").lean();
  const recipients = members.filter((member) => member.memberSettings?.notifications?.inApp !== false && member.memberSettings?.notifications?.systemUpdates !== false);
  if (recipients.length === 0) return fail(res, 404, "No opted-in member recipients were found.");
  await Notification.insertMany(recipients.map(({ email }) => ({ memberEmail: email, title, message, type: "system" })));
  return res.status(201).json({ created: recipients.length });
});

router.use(["/member", "/notifications"], authenticate, requireMember);

router.get("/member/preferences", async (req, res) => {
  res.json({
    theme: req.user.memberSettings?.theme || "light",
    defaultFarmLocation: req.user.memberSettings?.defaultFarmLocation || "",
    notifications: {
      email: req.user.memberSettings?.notifications?.email ?? true,
      inApp: req.user.memberSettings?.notifications?.inApp ?? true,
      bookingReminders: req.user.memberSettings?.notifications?.bookingReminders ?? true,
      systemUpdates: req.user.memberSettings?.notifications?.systemUpdates ?? true,
    },
    supportEmail: process.env.SUPPORT_EMAIL || "",
    supportPhone: process.env.SUPPORT_PHONE || "",
  });
});

router.patch("/member/preferences", async (req, res) => {
  const settings = req.user.memberSettings || {};
  if (req.body.theme !== undefined) {
    if (!["light", "dark"].includes(req.body.theme)) return fail(res, 400, "Theme must be light or dark.");
    settings.theme = req.body.theme;
  }
  if (req.body.defaultFarmLocation !== undefined) {
    const location = clean(req.body.defaultFarmLocation);
    if (location.length > 240) return fail(res, 400, "Farm location must be 240 characters or fewer.");
    settings.defaultFarmLocation = location;
  }
  if (req.body.notifications !== undefined) {
    const allowed = ["email", "inApp", "bookingReminders", "systemUpdates"];
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
  return res.json({
    theme: settings.theme || "light",
    defaultFarmLocation: settings.defaultFarmLocation || "",
    notifications: {
      email: settings.notifications?.email ?? true,
      inApp: settings.notifications?.inApp ?? true,
      bookingReminders: settings.notifications?.bookingReminders ?? true,
      systemUpdates: settings.notifications?.systemUpdates ?? true,
    },
  });
});

router.patch("/member/profile", async (req, res) => {
  const fields = ["fullName", "phone", "address", "address2", "city", "region", "postalCode", "country", "avatar"];
  for (const field of fields) {
    if (req.body[field] !== undefined) req.user[field] = clean(req.body[field]);
  }
  if (!req.user.fullName) return fail(res, 400, "Full name is required.");
  await req.user.save();
  return res.json({ fullName: req.user.fullName, email: req.user.email, phone: req.user.phone, avatar: req.user.avatar, address: req.user.address, address2: req.user.address2, city: req.user.city, region: req.user.region, postalCode: req.user.postalCode, country: req.user.country });
});

router.post("/member/change-password", async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (!currentPassword || !newPassword) return fail(res, 400, "Current and new passwords are required.");
  if (newPassword.length < 8) return fail(res, 400, "New password must be at least 8 characters.");
  const account = await Account.findById(req.user._id).select("+passwordHash");
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) return fail(res, 401, "Current password is incorrect.");
  account.passwordHash = await bcrypt.hash(newPassword, 10);
  account.mustChangePassword = false;
  await account.save();
  return res.json({ ok: true, message: "Password updated." });
});

// Member sends a question / message to manager
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
  const managers = await Account.find({ role: "manager" }).select("email").lean();
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

router.get("/notifications", async (req, res) => {
  const notifications = await Notification.find({ memberEmail: req.user.email }).sort({ createdAt: -1 }).limit(100).lean();
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  return res.json({ notifications, unreadCount });
});

router.patch("/notifications/read-all", async (req, res) => {
  const result = await Notification.updateMany({ memberEmail: req.user.email, readAt: null }, { $set: { readAt: new Date() } });
  return res.json({ updated: result.modifiedCount });
});

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

router.delete("/notifications/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid notification id.");
  const result = await Notification.deleteOne({ _id: req.params.id, memberEmail: req.user.email });
  if (!result.deletedCount) return fail(res, 404, "Notification not found.");
  return res.json({ ok: true });
});

module.exports = router;
