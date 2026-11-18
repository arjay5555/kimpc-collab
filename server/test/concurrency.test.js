// Optimistic concurrency + transaction tests against the real Express app on an in-memory replica set.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-".padEnd(48, "x");

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const app = require("../app");
const { Account, Application, Driver, Transaction } = require("../models");
const { backfillVersions } = require("../scripts/backfill-version");

let replSet;
let managerToken;
let memberToken;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createCollection()));
});

after(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  const manager = await Account.create({ fullName: "Mgr", email: "mgr@test.local", passwordHash: "x", role: "manager" });
  const member = await Account.create({ fullName: "Mem", email: "mem@test.local", passwordHash: "x", role: "member" });
  const sign = (a) => jwt.sign({ id: String(a._id), email: a.email, role: a.role, tokenVersion: 0 }, process.env.JWT_SECRET);
  managerToken = sign(manager);
  memberToken = sign(member);
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

test("concurrent driver updates with the same version: exactly one 200, one 409, winner persisted", async () => {
  const driver = await Driver.create({ name: "Juan" });
  const send = (phone) =>
    request(app).put(`/api/drivers/${driver._id}`).set(auth(managerToken)).send({ phone, version: driver.version });

  const responses = await Promise.all([send("111"), send("222")]);
  const statuses = responses.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 409]);

  const winner = responses.find((r) => r.status === 200).body.data;
  const saved = await Driver.findById(driver._id);
  assert.equal(saved.phone, winner.phone);
  assert.equal(saved.version, driver.version + 1);
});

test("concurrent payments on one booking cannot both apply against the same balance", async () => {
  const booking = await Application.create({
    memberEmail: "mem@test.local",
    memberName: "Mem",
    equipment: "Tractor",
    startDate: "2099-01-01",
    endDate: "2099-01-02",
    status: "Approved",
    totalAmount: 1000,
  });
  const pay = () =>
    request(app)
      .post(`/api/applications/${booking._id}/payments`)
      .set(auth(managerToken))
      .send({ amount: 1000, version: booking.version });

  const responses = await Promise.all([pay(), pay()]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const saved = await Application.findById(booking._id);
  assert.equal(saved.paymentHistory.length, 1);
});

test("stale version returns 409 with the standardized body", async () => {
  const driver = await Driver.create({ name: "Pedro" });
  await request(app).put(`/api/drivers/${driver._id}`).set(auth(managerToken)).send({ phone: "1", version: 0 }).expect(200);

  const res = await request(app)
    .put(`/api/drivers/${driver._id}`)
    .set(auth(managerToken))
    .send({ phone: "2", version: 0 })
    .expect(409);

  assert.equal(res.body.error, "VERSION_CONFLICT");
  assert.equal(res.body.message, "This resource was modified by someone else.");
  assert.equal(res.body.currentVersion, 1);
  assert.equal(res.body.current.phone, "1");
  assert.equal(res.body.current.version, 1);
});

test("stale version on approve returns 409 VERSION_CONFLICT and leaves the booking pending", async () => {
  const booking = await Application.create({
    memberEmail: "mem@test.local", memberName: "Mem", equipment: "Tractor",
    startDate: "2099-02-01", endDate: "2099-02-02", status: "Pending",
  });
  await Application.updateOne({ _id: booking._id }, { $set: { managerRemarks: "x" }, $inc: { version: 1 } });

  const res = await request(app)
    .patch(`/api/manager/bookings/${booking._id}/approve`)
    .set(auth(managerToken))
    .send({ version: 0 })
    .expect(409);
  assert.equal(res.body.error, "VERSION_CONFLICT");
  assert.equal((await Application.findById(booking._id)).status, "Pending");
});

test("update to a nonexistent id returns 404, not 409", async () => {
  const id = new mongoose.Types.ObjectId();
  await request(app).put(`/api/drivers/${id}`).set(auth(managerToken)).send({ phone: "1", version: 0 }).expect(404);
  await request(app).post(`/api/applications/${id}/payments`).set(auth(managerToken)).send({ amount: 1, version: 0 }).expect(404);
});

test("transaction: POS booking leaves no booking behind when the ledger write fails", async () => {
  const original = Transaction.create;
  Transaction.create = async () => {
    throw new Error("ledger down");
  };
  try {
    await request(app)
      .post("/api/manager/pos-booking")
      .set(auth(managerToken))
      .send({ farmerName: "Walk In", equipment: "Tractor", startDate: "2099-03-01", endDate: "2099-03-01", isPaid: true })
      .expect(500);
  } finally {
    Transaction.create = original;
  }
  assert.equal(await Application.countDocuments({ isWalkIn: true }), 0);
  assert.equal(await Transaction.countDocuments({}), 0);
});

test("member self-service save still works (req.user loaded with a field selection)", async () => {
  await request(app).patch("/api/member/preferences").set(auth(memberToken)).send({ theme: "dark" }).expect(200);
  assert.equal((await Account.findOne({ email: "mem@test.local" })).memberSettings.theme, "dark");
});

test("backfill sets version from __v and is idempotent", async () => {
  await Driver.collection.insertOne({ name: "Legacy", __v: 3 });
  await Driver.collection.insertOne({ name: "Legacy2" });
  await backfillVersions();
  await backfillVersions();
  const legacy = await Driver.collection.findOne({ name: "Legacy" });
  assert.equal(legacy.version, 3);
  assert.equal(legacy.__v, undefined);
  assert.equal((await Driver.collection.findOne({ name: "Legacy2" })).version, 0);
});

test("admin toggle style update (plain fields + $inc) bumps version so open edit forms go stale", async () => {
  const acc = await Account.findOne({ email: "mem@test.local" });
  const updated = await Account.findOneAndUpdate(
    { _id: acc._id },
    { isSuspended: true, $inc: { version: 1 } },
    { new: true }
  );
  assert.equal(updated.isSuspended, true);
  assert.equal(updated.version, acc.version + 1);
});
