/**
 * One-time migration for optimistic concurrency: copy legacy `__v` into `version` (default 0)
 * and drop `__v` on the collections that now use `versionKey: "version"`.
 * Safe to re-run: only touches documents without a `version` field.
 *
 * Run BEFORE deploying the OCC code: versioned saves filter on `version`, so
 * documents missing it would fail every save with VERSION_CONFLICT.
 *
 * Usage: npm run db:backfill-version (from /server)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const { Account, Application, MachineryUnit, Driver } = require("../models");

async function backfillVersions() {
  const results = {};
  for (const Model of [Account, Application, MachineryUnit, Driver]) {
    const res = await Model.collection.updateMany({ version: { $exists: false } }, [
      { $set: { version: { $ifNull: ["$__v", 0] } } },
      { $unset: "__v" },
    ]);
    results[Model.modelName] = res.modifiedCount;
  }
  return results;
}

if (require.main === module) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(backfillVersions)
    .then((results) => console.log("[backfill-version] Updated documents:", results))
    .catch((err) => {
      console.error("[backfill-version] Failed:", err);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { backfillVersions };
