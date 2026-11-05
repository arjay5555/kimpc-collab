const Application = require("../models/Application");
const MachineryMaintenance = require("../models/MachineryMaintenance");
const MachineryUnit = require("../models/MachineryUnit");
const MachineryUsage = require("../models/MachineryUsage");
const Transaction = require("../models/Transaction");
const { logAudit } = require("../services/auditLogger");

const REVENUE_TYPES = ["Rental Fee", "Late Fee"];

function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && utcDateString(date) === value;
}

function escapeCsv(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function getDashboardMetrics(req, res) {
  const now = new Date();
  const today = utcDateString(now);
  const dayStart = new Date(`${today}T00:00:00.000Z`);
  const tomorrow = new Date(dayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthStartString = utcDateString(monthStart);
  const monthEndString = utcDateString(new Date(nextMonthStart.getTime() - 86400000));
  const dayCount = (nextMonthStart - monthStart) / 86400000;

  const [
    units,
    usageTotals,
    pendingBookings,
    activeRentals,
    dailyRevenue,
    monthlyRevenue,
    maintenanceCount,
    overdueRentals,
    scheduledBookings
  ] = await Promise.all([
    MachineryUnit.find({ isArchived: { $ne: true } }).select("unitId name category status").lean(),
    MachineryUsage.aggregate([
      { $match: { startAt: { $gte: monthStart, $lt: nextMonthStart } } },
      { $group: { _id: "$unitId", runtimeHours: { $sum: "$runtimeHours" } } }
    ]),
    Application.countDocuments({ status: "Pending" }),
    Application.countDocuments({ status: "Checked-Out" }),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: dayStart, $lt: tomorrow }, type: { $in: REVENUE_TYPES }, status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: monthStart, $lt: nextMonthStart }, type: { $in: REVENUE_TYPES }, status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]),
    MachineryMaintenance.countDocuments({
      status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
      startDate: { $lte: today },
      endDate: { $gte: today }
    }),
    Application.find({ status: "Checked-Out", endDate: { $lt: today } })
      .select("_id equipment machineryUnitId memberName memberEmail startDate endDate")
      .lean(),
    Application.find({
      status: { $in: ["Approved", "Checked-Out"] },
      startDate: { $lte: monthEndString },
      endDate: { $gte: monthStartString }
    }).select("equipment machineryUnitId startDate endDate").lean()
  ]);

  const runtimeByUnit = new Map(usageTotals.map((entry) => [entry._id, entry.runtimeHours]));
  const availableUnits = units.filter((unit) => !["Dispose", "Repair", "Maintenance"].includes(unit.status));
  const capacityHours = availableUnits.length * dayCount * 24;
  const activeUnitIds = new Set(availableUnits.map((unit) => unit.unitId));
  const runtimeHours = usageTotals
    .filter((entry) => activeUnitIds.has(entry._id))
    .reduce((total, entry) => total + entry.runtimeHours, 0);
  const utilizationRate = capacityHours ? round(Math.min(100, (runtimeHours / capacityHours) * 100)) : 0;
  const unitUtilization = units.map((unit) => ({
    unitId: unit.unitId,
    name: unit.name,
    category: unit.category,
    status: unit.status,
    runtimeHours: round(activeUnitIds.has(unit.unitId) ? runtimeByUnit.get(unit.unitId) || 0 : 0)
  }));

  return res.json({
    asOf: now.toISOString(),
    pendingApprovalCount: pendingBookings,
    revenue: {
      daily: round(dailyRevenue[0]?.total || 0),
      monthly: round(monthlyRevenue[0]?.total || 0)
    },
    fleetStatus: {
      total: units.length,
      activeRentals,
      available: units.filter((unit) => unit.status === "Available").length,
      maintenance: units.filter((unit) => unit.status === "Maintenance").length,
      repair: units.filter((unit) => unit.status === "Repair").length,
      dispose: units.filter((unit) => unit.status === "Dispose").length
    },
    utilization: {
      month: monthStartString.slice(0, 7),
      loggedRuntimeHours: round(runtimeHours),
      capacityHours,
      utilizationRate,
      units: unitUtilization
    },
    operationalIssues: {
      activeMaintenanceCount: maintenanceCount,
      overdueRentalCount: overdueRentals.length
    },
    scheduledBookingCount: scheduledBookings.length
  });
}

async function getMachineryUtilization(req, res) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = (nextMonthStart - monthStart) / 86400000;
  const [units, runtimeTotals] = await Promise.all([
    MachineryUnit.find({ isArchived: { $ne: true } }).select("unitId category status").lean(),
    MachineryUsage.aggregate([
      { $match: { startAt: { $gte: monthStart, $lt: nextMonthStart } } },
      { $group: { _id: "$unitId", runtimeHours: { $sum: "$runtimeHours" } } }
    ])
  ]);
  const runtimeByUnit = new Map(runtimeTotals.map((entry) => [entry._id, entry.runtimeHours]));
  const categories = new Map();
  for (const unit of units) {
    if (!categories.has(unit.category)) {
      categories.set(unit.category, { category: unit.category, units: [], runtimeHours: 0 });
    }
    const category = categories.get(unit.category);
    category.units.push(unit);
    if (!["Dispose", "Repair", "Maintenance"].includes(unit.status)) {
      category.runtimeHours += runtimeByUnit.get(unit.unitId) || 0;
    }
  }

  const data = [...categories.values()].map((category) => {
    const activeUnits = category.units.filter((unit) => !["Dispose", "Repair", "Maintenance"].includes(unit.status)).length;
    const totalUnits = category.units.length;
    const capacityHours = activeUnits * daysInMonth * 24;
    return {
      name: category.category,
      category: category.category,
      utilizationRate: capacityHours ? round(Math.min(100, (category.runtimeHours / capacityHours) * 100)) : 0,
      runtimeHours: round(category.runtimeHours),
      activeUnits,
      totalUnits
    };
  });
  return res.json(data);
}

async function getFieldIssues(req, res) {
  const today = utcDateString(new Date());
  const [maintenance, overdueRentals, bookings] = await Promise.all([
    MachineryMaintenance.find({
      status: { $in: ["Out of Service", "In Repair", "Scheduled Maintenance"] },
      endDate: { $gte: today }
    }).sort({ startDate: 1 }).lean(),
    Application.find({ status: "Checked-Out", endDate: { $lt: today } })
      .sort({ endDate: 1 }).lean(),
    Application.find({
      status: { $in: ["Approved", "Checked-Out"] },
      endDate: { $gte: today }
    }).sort({ startDate: 1 }).lean()
  ]);

  const issues = [
    ...maintenance.map((record) => ({
      id: `maintenance-${record._id}`,
      type: record.maintenanceType === "Emergency Breakdown" ? "equipment_breakdown" : "maintenance",
      severity: record.maintenanceType === "Emergency Breakdown" ? "high" : "medium",
      status: record.status,
      unitId: record.equipmentUnitId,
      equipment: record.equipmentName,
      startDate: record.startDate,
      endDate: record.endDate,
      details: record.reason
    })),
    ...overdueRentals.map((booking) => ({
      id: `late-return-${booking._id}`,
      type: "late_return",
      severity: "high",
      status: booking.status,
      bookingId: String(booking._id),
      unitId: booking.machineryUnitId || "",
      equipment: booking.equipment,
      memberName: booking.memberName,
      memberEmail: booking.memberEmail,
      dueDate: booking.endDate
    }))
  ];

  const conflicts = [];
  for (let firstIndex = 0; firstIndex < bookings.length; firstIndex += 1) {
    const first = bookings[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < bookings.length; secondIndex += 1) {
      const second = bookings[secondIndex];
      const sameUnit = first.machineryUnitId && first.machineryUnitId === second.machineryUnitId;
      const sameUnassignedEquipment = !first.machineryUnitId && !second.machineryUnitId && first.equipment === second.equipment;
      if (!(sameUnit || sameUnassignedEquipment)) continue;
      if (first.startDate <= second.endDate && first.endDate >= second.startDate) {
        conflicts.push({
          id: `schedule-conflict-${first._id}-${second._id}`,
          type: "scheduling_conflict",
          severity: "high",
          equipment: first.equipment,
          unitId: first.machineryUnitId || second.machineryUnitId || "",
          bookingIds: [String(first._id), String(second._id)],
          dateRange: {
            startDate: first.startDate > second.startDate ? first.startDate : second.startDate,
            endDate: first.endDate < second.endDate ? first.endDate : second.endDate
          }
        });
      }
    }
  }

  issues.push(...conflicts);
  issues.sort((a, b) => String(a.startDate || a.dueDate || "").localeCompare(String(b.startDate || b.dueDate || "")));
  return res.json({ asOf: new Date().toISOString(), count: issues.length, issues });
}

function getReportRange(period, req, res) {
  const now = new Date();
  if (period === "daily") {
    const date = String(req.query.date || utcDateString(now));
    if (!isDateString(date)) {
      res.status(400).json({ error: "date must use YYYY-MM-DD format and be a valid date." });
      return null;
    }
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end, label: date };
  }
  if (period === "monthly") {
    const month = String(req.query.month || utcDateString(now).slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      res.status(400).json({ error: "month must use YYYY-MM format." });
      return null;
    }
    const [year, monthNumber] = month.split("-").map(Number);
    if (year < 2000) {
      res.status(400).json({ error: "month year must be 2000 or later." });
      return null;
    }
    return {
      start: new Date(Date.UTC(year, monthNumber - 1, 1)),
      end: new Date(Date.UTC(year, monthNumber, 1)),
      label: month
    };
  }
  if (period === "annual") {
    const year = String(req.query.year || now.getUTCFullYear());
    if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 9999) {
      res.status(400).json({ error: "year must be a four-digit year." });
      return null;
    }
    return {
      start: new Date(Date.UTC(Number(year), 0, 1)),
      end: new Date(Date.UTC(Number(year) + 1, 0, 1)),
      label: year
    };
  }
  res.status(400).json({ error: "period must be daily, monthly, or annual." });
  return null;
}

async function getRevenueReport(req, res) {
  const range = getReportRange(req.params.period, req, res);
  if (!range) return;

  const transactions = await Transaction.find({
    createdAt: { $gte: range.start, $lt: range.end },
    status: "Completed"
  }).sort({ createdAt: 1 }).lean();
  const totalsByType = new Map();
  for (const transaction of transactions) {
    totalsByType.set(transaction.type, (totalsByType.get(transaction.type) || 0) + transaction.amount);
  }
  const rentalRevenue = REVENUE_TYPES.reduce((total, type) => total + (totalsByType.get(type) || 0), 0);
  const report = {
    period: req.params.period,
    range: { label: range.label, start: range.start.toISOString(), endExclusive: range.end.toISOString() },
    transactionCount: transactions.length,
    rentalRevenue: round(rentalRevenue),
    totalsByType: Object.fromEntries([...totalsByType.entries()].map(([type, total]) => [type, round(total)]))
  };

  if (String(req.query.format || "").toLowerCase() !== "csv") return res.json(report);

  await logAudit({
    action: "MANAGER_REVENUE_REPORT_EXPORTED",
    actorEmail: req.user.email,
    actorRole: req.user.role,
    actorId: req.user._id,
    details: { period: report.period, label: range.label, transactionCount: transactions.length },
    req
  });
  const rows = [
    ["Transaction ID", "Date", "Member", "Equipment", "Type", "Amount", "Payment Method"],
    ...transactions.map((transaction) => [
      transaction.txId,
      transaction.createdAt.toISOString(),
      transaction.farmer,
      transaction.equipment,
      transaction.type,
      transaction.amount,
      transaction.paymentMethod
    ]),
    ["", "", "", "", "Rental revenue total", round(rentalRevenue), ""]
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  res.type("text/csv");
  res.set("Content-Disposition", `attachment; filename="rental-revenue-${req.params.period}-${range.label}.csv"`);
  return res.send(csv);
}

module.exports = { getDashboardMetrics, getMachineryUtilization, getFieldIssues, getRevenueReport };
