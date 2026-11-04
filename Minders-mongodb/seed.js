// Creates demo accounts (run with: npm run seed).
// Change these passwords after your first login.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Account = require("./models/Account");

const demoAccounts = [
  { fullName: "System Admin", email: "admin@kimpc.test", password: "Admin123!", role: "admin" },
  { fullName: "Alex Manager", email: "manager@kimpc.test", password: "Manager123!", role: "manager" },
  { fullName: "Demo Member", email: "demo.member@kimpc.test", password: "Member123!", role: "member" }
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const person of demoAccounts) {
    const existing = await Account.findOne({ email: person.email });
    if (existing) {
      existing.emailVerified = true;
      existing.verificationStatus = "verified";
      existing.verifiedAt = new Date();
      existing.isSuspended = false;
      existing.passwordHash = await bcrypt.hash(person.password, 10);
      await existing.save();
      console.log(`Synced ${person.role}: ${person.email}  (password: ${person.password})`);
      continue;
    }
    await Account.create({
      fullName: person.fullName,
      email: person.email,
      passwordHash: await bcrypt.hash(person.password, 10),
      role: person.role,
      emailVerified: true,
      verificationStatus: "verified",
      verifiedAt: new Date()
    });
    console.log(`Created ${person.role}: ${person.email}  (password: ${person.password})`);
  }
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
