const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const Application = require("../models/Application");

const router = express.Router();

const ROLES = ["member", "manager", "admin"];
const STATUSES = ["Pending", "Approved", "Rejected"];
const PROFILE_FIELDS = ["fullName", "email", "phone", "address", "address2", "city", "region", "postalCode", "country"];

const clean = (value) => String(value ?? "").trim();
const cleanEmail = (value) => clean(value).toLowerCase();
const fail = (res, status, error) => res.status(status).json({ error });

// Next sequential Cooperative ID (CM-001, CM-002, ...).
async function nextCooperativeId() {
  const accounts = await Account.find({ cooperativeId: /^CM-\d+$/ }).select("cooperativeId").lean();
  const highest = accounts.reduce((max, a) => Math.max(max, Number(a.cooperativeId.slice(3))), 0);
  return `CM-${String(highest + 1).padStart(3, "0")}`;
}

// ---------- Registration, verification, login ----------

router.get("/cooperative-id/next", async (req, res) => {
  res.json({ cooperativeId: await nextCooperativeId() });
});

router.post("/register", async (req, res) => {
  const fullName = clean(req.body.fullName);
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password ?? "");
  if (!fullName || !email) return fail(res, 400, "Name and email are required.");
  if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
  if (await Account.exists({ email })) return fail(res, 409, "An account already exists for this email address.");

  const account = await Account.create({
    fullName,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "member",
    cooperativeId: await nextCooperativeId(),
    emailVerified: false
  });
  res.status(201).json(account);
});

// Demo "Confirm email" button. A real app would send an email with a signed link instead.
router.post("/verify", async (req, res) => {
  const account = await Account.findOneAndUpdate(
    { email: cleanEmail(req.body.email) },
    { emailVerified: true, verifiedAt: new Date() },
    { returnDocument: "after" }
  );
  if (!account) return fail(res, 404, "Account not found.");
  res.json(account);
});

router.post("/login", async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password ?? "");
  const account = await Account.findOne({ email });
  if (!account) return fail(res, 401, "No account was found for this email address.");
  if (!account.emailVerified) return fail(res, 403, "Please confirm your email before signing in.");
  if (!(await bcrypt.compare(password, account.passwordHash))) return fail(res, 401, "The email or password is incorrect.");
  res.json(account);
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
  if (!fullName || !email) return fail(res, 400, "Name and email are required.");
  if (!ROLES.includes(role)) return fail(res, 400, "Choose a valid role.");
  if (password.length < 6) return fail(res, 400, "Password must be at least 6 characters.");
  if (await Account.exists({ email })) return fail(res, 409, "An account already exists for this email address.");

  const account = await Account.create({
    fullName,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    emailVerified: true,
    verifiedAt: new Date()
  });
  res.status(201).json(account);
});

router.delete("/accounts/:email", async (req, res) => {
  const deleted = await Account.findOneAndDelete({ email: cleanEmail(req.params.email) });
  if (!deleted) return fail(res, 404, "Account not found.");
  res.json({ deleted: deleted.email });
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

  const account = await Account.findOne({ email: memberEmail });
  if (!account) return fail(res, 404, "Account not found.");
  const application = await Application.create({
    memberEmail,
    memberName: account.fullName,
    equipment,
    startDate,
    endDate
  });
  res.status(201).json(application);
});

router.patch("/applications/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid application id.");
  const status = clean(req.body.status);
  if (!STATUSES.includes(status)) return fail(res, 400, "Invalid status.");
  const application = await Application.findByIdAndUpdate(req.params.id, { status }, { returnDocument: "after" });
  if (!application) return fail(res, 404, "Application not found.");
  res.json(application);
});

module.exports = router;
