// Manager cover: admin grants a member per-feature manager access (view/edit), revokes it, and it never persists as role.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-".padEnd(48, "x");

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const app = require("../app");
const { Account } = require("../models");
const { generateUserToken } = require("../routes/routeHelpers");
const { sanitizePermissions } = require("../config/managerCoverAccess");

let replSet;
let adminToken;
let member;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  const admin = await Account.create({ fullName: "Adm", email: "adm@test.local", passwordHash: "x", role: "admin" });
  member = await Account.create({ fullName: "Mem", email: "mem@test.local", passwordHash: "x", role: "member" });
  adminToken = generateUserToken(admin);
});

const inOneHour = () => new Date(Date.now() + 3600_000).toISOString();
const assignCover = (permissions, until = inOneHour()) =>
  request(app)
    .put(`/api/admin/accounts/${member.email}/manager-cover`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ until, permissions });
const freshToken = async () => generateUserToken(await Account.findById(member._id));
const as = (token) => ({
  get: (p) => request(app).get(p).set("Authorization", `Bearer ${token}`),
  post: (p, body = {}) => request(app).post(p).set("Authorization", `Bearer ${token}`).send(body),
  del: (p) => request(app).delete(p).set("Authorization", `Bearer ${token}`),
});

test("member without cover is denied manager routes", async () => {
  assert.equal((await as(generateUserToken(member)).get("/api/drivers")).status, 403);
});

test("edit access: forces re-login, allows reads and writes, stored role stays member, revoke signs out", async () => {
  const oldToken = generateUserToken(member);
  assert.equal((await assignCover({ drivers: "edit" })).status, 200);
  assert.equal((await as(oldToken).get("/api/drivers")).status, 401);

  const token = await freshToken();
  assert.equal((await as(token).get("/api/drivers")).status, 200);
  assert.equal((await as(token).post("/api/drivers", { name: "Juan", phone: "1" })).status, 201);
  assert.equal((await Account.findById(member._id)).role, "member");

  const revoke = await request(app)
    .delete(`/api/admin/accounts/${member.email}/manager-cover`)
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(revoke.status, 200);
  assert.equal((await as(token).get("/api/drivers")).status, 401);
});

test("view-only access allows reads but blocks writes; ungranted features stay closed", async () => {
  await assignCover({ drivers: "view" });
  const token = await freshToken();
  assert.equal((await as(token).get("/api/drivers")).status, 200);
  assert.equal((await as(token).post("/api/drivers", { name: "Juan", phone: "1" })).status, 403);
  assert.equal((await as(token).get("/api/manager/reports/preview")).status, 403);
});

test("audit logs view-only: can list but never purge", async () => {
  await assignCover({ auditLogs: "edit" }); // edit is downgraded to view for audit logs
  const token = await freshToken();
  assert.equal((await as(token).get("/api/admin/audit-logs")).status, 200);
  assert.equal((await as(token).del("/api/admin/audit-logs")).status, 403);
});

test("changing permissions forces a fresh sign-in", async () => {
  await assignCover({ drivers: "view" });
  const token = await freshToken();
  await new Promise((r) => setTimeout(r, 5));
  await assignCover({ drivers: "edit" });
  assert.equal((await as(token).get("/api/drivers")).status, 401);
});

test("permission input is sanitized and validated", async () => {
  assert.deepEqual(sanitizePermissions({ drivers: "edit", reports: "edit", bogus: "edit", units: "admin" }), {
    drivers: "edit",
    reports: "view",
  });
  assert.equal((await assignCover({})).status, 400);
  assert.equal((await assignCover({ drivers: "view" }, new Date(Date.now() - 1000).toISOString())).status, 400);
  await Account.updateOne({ _id: member._id }, { role: "manager" });
  assert.equal((await assignCover({ drivers: "view" })).status, 404);
});

test("expired cover is no longer manager", () => {
  const acc = { role: "member", managerCover: { until: new Date(Date.now() - 1000) } };
  assert.equal(Account.effectiveRole(acc), "member");
});
