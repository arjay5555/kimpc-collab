// Creates the first admin and manager accounts (run once with: npm run seed).
// Change these passwords after your first login.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Account = require("./models/Account");

const staff = [
  { fullName: "System Admin", email: "admin@kimpc.test", password: "Admin123!", role: "admin" },
  { fullName: "Alex Manager", email: "manager@kimpc.test", password: "Manager123!", role: "manager" }
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const person of staff) {
    if (await Account.exists({ email: person.email })) {
      console.log(`Skipped (already exists): ${person.email}`);
      continue;
    }
    await Account.create({
      fullName: person.fullName,
      email: person.email,
      passwordHash: await bcrypt.hash(person.password, 10),
      role: person.role,
      emailVerified: true,
      verifiedAt: new Date()
    });
    console.log(`Created ${person.role}: ${person.email}  (password: ${person.password})`);
  }
  await mongoose.disconnect();
})().catch((error) => { console.error(error); process.exit(1); });
