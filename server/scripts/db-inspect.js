/**
 * KIMPC Database Inspection & Health Check CLI Tool
 * 
 * Usage:
 *   node server/scripts/db-inspect.js
 *   or: npm run db:check (from /server)
 * 
 * Provides an immediate, clean overview of the database state, collections,
 * document counts, account breakdowns, and operational metrics.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
if (!process.env.MONGODB_URI) {
  require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
}

const mongoose = require("mongoose");
const {
  Account,
  Application,
  MachineryUnit,
  Driver,
  Transaction,
  AuditLog,
  Notification,
  SupportMessage,
  SystemSetting,
} = require("../models");

async function run() {
  console.log("===============================================================");
  console.log("   KIMPC MACHINERY PORTAL - DATABASE HEALTH & DATA INSPECTION  ");
  console.log("===============================================================");

  if (!process.env.MONGODB_URI) {
    console.error("❌ ERROR: MONGODB_URI environment variable is not set in .env");
    process.exit(1);
  }

  const startTime = Date.now();
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const latency = Date.now() - startTime;
    const db = mongoose.connection.db;

    console.log(`\n✅ Connected to MongoDB Atlas in ${latency}ms`);
    console.log(`• Host:     ${mongoose.connection.host}`);
    console.log(`• Database: ${db.databaseName}`);
    console.log(`• Ready:    ${mongoose.connection.readyState === 1 ? "Connected (State 1)" : "Disconnected"}`);

    // 1. Collections & Document Counts
    const collections = await db.listCollections().toArray();
    console.log("\n---------------------------------------------------------------");
    console.log(" COLLECTIONS OVERVIEW");
    console.log("---------------------------------------------------------------");
    
    let totalDocs = 0;
    const counts = {};
    for (const col of collections.sort((a, b) => a.name.localeCompare(b.name))) {
      const c = await db.collection(col.name).countDocuments();
      counts[col.name] = c;
      totalDocs += c;
      console.log(`  📁 ${col.name.padEnd(26)} : ${String(c).padStart(6)} documents`);
    }
    console.log(`  -------------------------------------------------------------`);
    console.log(`  TOTAL DATA DOCUMENTS       : ${String(totalDocs).padStart(6)} records`);

    // 2. Accounts Breakdown
    console.log("\n---------------------------------------------------------------");
    console.log(" ACCOUNTS BREAKDOWN");
    console.log("---------------------------------------------------------------");
    const [admins, managers, members, suspended, withPin] = await Promise.all([
      Account.countDocuments({ role: "admin" }),
      Account.countDocuments({ role: "manager" }),
      Account.countDocuments({ role: "member" }),
      Account.countDocuments({ isSuspended: true }),
      Account.countDocuments({ adminPinHash: { $ne: null } }),
    ]);
    console.log(`  • Administrators (role=admin)   : ${admins}`);
    console.log(`  • Managers (role=manager)       : ${managers}`);
    console.log(`  • Members (role=member)         : ${members}`);
    console.log(`  • Suspended / Deactivated       : ${suspended}`);
    console.log(`  • Admins with Custom 6-Digit PIN: ${withPin}`);

    // 3. Machinery & Service Applications Breakdown
    console.log("\n---------------------------------------------------------------");
    console.log(" MACHINERY & SERVICE APPLICATIONS");
    console.log("---------------------------------------------------------------");
    const [units, drivers, appsPending, appsApproved, appsCompleted, appsRejected] = await Promise.all([
      MachineryUnit.countDocuments(),
      Driver.countDocuments(),
      Application.countDocuments({ status: "Pending" }),
      Application.countDocuments({ status: "Approved" }),
      Application.countDocuments({ status: "Returned" }),
      Application.countDocuments({ status: "Rejected" }),
    ]);
    console.log(`  • Registered Machinery Units    : ${units}`);
    console.log(`  • Registered Drivers / Operators: ${drivers}`);
    console.log(`  • Applications - Pending        : ${appsPending}`);
    console.log(`  • Applications - Approved       : ${appsApproved}`);
    console.log(`  • Applications - Returned (Done): ${appsCompleted}`);
    console.log(`  • Applications - Rejected       : ${appsRejected}`);

    // 4. Integrations & System Settings
    console.log("\n---------------------------------------------------------------");
    console.log(" INTEGRATION TOGGLE STATUSES (SystemSetting)");
    console.log("---------------------------------------------------------------");
    const settings = await SystemSetting.find().lean();
    if (!settings.length) {
      console.log("  (Using standard environment defaults)");
    } else {
      settings.forEach((s) => {
        const valStr = typeof s.value === "boolean" ? (s.value ? "ENABLED" : "DISABLED") : JSON.stringify(s.value);
        console.log(`  • ${s.key.padEnd(26)} : ${valStr}`);
      });
    }

    console.log("\n===============================================================");
    console.log("   INSPECTION COMPLETE: All collections healthy and responsive. ");
    console.log("===============================================================\n");
  } catch (err) {
    console.error("❌ Database connection error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
