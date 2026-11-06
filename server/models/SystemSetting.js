const mongoose = require("mongoose");

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    description: {
      type: String,
      default: ""
    },
    updatedBy: {
      type: String,
      default: "system"
    }
  },
  {
    timestamps: true
  }
);

const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);

async function getSystemSetting(key, defaultValue) {
  try {
    const doc = await SystemSetting.findOne({ key });
    if (!doc || doc.value === undefined || doc.value === null) return defaultValue;
    return doc.value;
  } catch (err) {
    console.error(`Error loading setting "${key}":`, err.message);
    return defaultValue;
  }
}

async function setSystemSetting(key, value, description = "", updatedBy = "system") {
  return await SystemSetting.findOneAndUpdate(
    { key },
    { key, value, description, updatedBy },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

SystemSetting.getSystemSetting = getSystemSetting;
SystemSetting.setSystemSetting = setSystemSetting;

module.exports = SystemSetting;
module.exports.SystemSetting = SystemSetting;
module.exports.getSystemSetting = getSystemSetting;
module.exports.setSystemSetting = setSystemSetting;
