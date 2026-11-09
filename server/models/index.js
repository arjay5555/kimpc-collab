/**
 * KIMPC Machinery Portal - Central Models Index
 * 
 * Kalilangan Irrigators Multi-Purpose Cooperative (KIMPC)
 * Central database model registry and unified export point.
 * 
 * Future developers can import individual models or destructure from here:
 * @example
 * const { Account, Application, MachineryUnit, Driver, Transaction, AuditLog } = require("./models");
 */

const Account = require("./Account");
const Application = require("./Application");
const AuditLog = require("./AuditLog");
const Driver = require("./Driver");
const MachineryUnit = require("./MachineryUnit");
const MachineryMaintenance = require("./MachineryMaintenance");
const MachineryUsage = require("./MachineryUsage");
const Notification = require("./Notification");
const SupportMessage = require("./SupportMessage");
const SystemSetting = require("./SystemSetting");
const Transaction = require("./Transaction");

module.exports = {
  Account,
  Application,
  AuditLog,
  Driver,
  MachineryUnit,
  MachineryMaintenance,
  MachineryUsage,
  Notification,
  SupportMessage,
  SystemSetting,
  Transaction,
};

