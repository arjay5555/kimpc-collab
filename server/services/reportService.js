const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const {
  Application,
  MachineryUnit,
  MachineryMaintenance,
  MachineryUsage,
  Transaction,
} = require("../models");

/**
 * Format currency in Philippine Pesos
 */
function formatPesos(num) {
  const val = Number(num) || 0;
  return "₱" + val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Get current date/time in Philippine Time (UTC+8)
 */
function getPHTNowString() {
  const now = new Date();
  return now.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Get current PHT YYYY-MM-DD
 */
function getPHTDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts; // "YYYY-MM-DD"
}

/**
 * Convert YYYY-MM-DD to PHT start and end Date objects
 */
function parsePHTBoundaries(startDateStr, endDateStr) {
  const start = new Date(`${startDateStr}T00:00:00+08:00`);
  const end = new Date(`${endDateStr}T23:59:59.999+08:00`);
  return { start, end };
}

/**
 * Validate and sanitize report filters
 */
function validateFilters(query = {}) {
  let rawType = (query.reportType || "booking").trim();
  let reportType = "booking";
  if (rawType === "machinery" || rawType === "machinery_usage") {
    reportType = "machinery_usage";
  } else if (rawType === "financial" || rawType === "financial_summary") {
    reportType = "financial_summary";
  } else {
    reportType = "booking";
  }

  const todayStr = getPHTDateString();
  const firstDayOfMonth = todayStr.slice(0, 8) + "01";

  let startDate = (query.startDate || "").trim();
  let endDate = (query.endDate || "").trim();

  // Basic regex check YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate)) startDate = firstDayOfMonth;
  if (!dateRegex.test(endDate)) endDate = todayStr;

  if (startDate > endDate) {
    const temp = startDate;
    startDate = endDate;
    endDate = temp;
  }

  const unitId = (query.unitId || "all").trim();
  const status = (query.status || "all").trim();
  const paymentMethod = (query.paymentMethod || "all").trim();

  return {
    reportType,
    startDate,
    endDate,
    unitId,
    status,
    paymentMethod,
  };
}

/**
 * Fetch and build report data
 */
async function getReportData(rawQuery = {}) {
  const filters = validateFilters(rawQuery);
  const { reportType, startDate, endDate, unitId, status, paymentMethod } = filters;
  const { start: startPHT, end: endPHT } = parsePHTBoundaries(startDate, endDate);
  const todayPHT = getPHTDateString();

  // Load all machinery units for label mapping and selector
  const allUnits = await MachineryUnit.find({ isArchived: { $ne: true } })
    .select("unitId name category brand model operatingHours currentMeterReading meterReadingUnit status operatingCondition")
    .lean();

  const selectedUnitDoc = unitId !== "all" ? allUnits.find((u) => u.unitId === unitId) : null;
  const unitLabel = selectedUnitDoc ? `${selectedUnitDoc.unitId} - ${selectedUnitDoc.name}` : "All Units";

  let reportTitle = "Booking Report";
  let dateBasisLabel = "";
  let metrics = {};
  let rows = [];
  let extraSections = null;

  // ============================================================
  // 1. BOOKING REPORT
  // ============================================================
  if (reportType === "booking") {
    reportTitle = "Booking Report";
    dateBasisLabel = "Rental Dates (Overlap basis: start <= period end and end >= period start)";

    // Overlap condition: rental starts on or before period end AND ends on or after period start
    const appQuery = {
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    };

    if (unitId !== "all") {
      const uName = selectedUnitDoc ? selectedUnitDoc.name : unitId;
      appQuery.$or = [
        { machineryUnitId: unitId },
        { equipment: new RegExp(unitId, "i") },
        { equipment: uName },
        { machineryModel: uName },
      ];
    }

    const apps = await Application.find(appQuery).sort({ startDate: 1, createdAt: -1 }).lean();

    // Calculate status counts & overdue returns
    let pendingCount = 0;
    let approvedCount = 0;
    let checkedOutCount = 0;
    let returnedCount = 0;
    let cancelledCount = 0;
    let rejectedCount = 0;
    let overdueCount = 0;

    const formattedRows = apps.map((app) => {
      const st = app.status || "Pending";
      const isReturnedOrDone = st === "Returned" || st === "Completed";
      const isCancelledOrRejected = st === "Cancelled" || st === "Rejected" || st === "Cancellation Requested";

      // Overdue return: rental end date has passed, and booking is not returned/cancelled
      const isOverdue = !isReturnedOrDone && !isCancelledOrRejected && app.endDate < todayPHT;

      if (isOverdue) overdueCount++;

      if (st === "Pending") pendingCount++;
      else if (st === "Approved") approvedCount++;
      else if (st === "Checked-Out") checkedOutCount++;
      else if (isReturnedOrDone) returnedCount++;
      else if (isCancelledOrRejected) {
        if (st === "Rejected") rejectedCount++;
        else cancelledCount++;
      }

      // Calculate days duration
      let days = 1;
      try {
        const d1 = new Date(app.startDate);
        const d2 = new Date(app.endDate);
        days = Math.max(1, Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
      } catch (e) {}

      let returnStatus = "On Schedule";
      if (isReturnedOrDone) {
        returnStatus = "Returned";
      } else if (isOverdue) {
        let diffDays = 1;
        try {
          const dEnd = new Date(app.endDate);
          const dNow = new Date(todayPHT);
          diffDays = Math.max(1, Math.round(Math.abs(dNow - dEnd) / (1000 * 60 * 60 * 24)));
        } catch (e) {}
        returnStatus = `Overdue (${diffDays}d)`;
      } else if (isCancelledOrRejected) {
        returnStatus = st;
      }

      const displayBookingId = app.displayId || `APP-${String(app._id).slice(-6).toUpperCase()}`;

      return {
        bookingId: displayBookingId,
        rawId: String(app._id),
        memberName: app.memberName || app.memberEmail || "Member",
        memberEmail: app.memberEmail || "",
        memberPhone: app.memberPhone || app.farmerPhone || app.clientPhone || "—",
        equipment: app.equipment || app.machineryModel || "Machinery Unit",
        machineryUnitId: app.machineryUnitId || "—",
        startDate: app.startDate,
        endDate: app.endDate,
        rentalDates: `${app.startDate} to ${app.endDate} (${days}d)`,
        daysCount: days,
        status: st,
        isOverdue,
        returnStatus,
        paymentStatus: app.paymentStatus || "Pending",
        totalAmount: app.totalAmount || 0,
        paymentMethod: app.paymentMethod || "Cash",
      };
    });

    // Apply status filter if not "all"
    rows = formattedRows.filter((r) => {
      if (status === "all") return true;
      if (status.toLowerCase() === "overdue") return r.isOverdue;
      return r.status.toLowerCase() === status.toLowerCase();
    });

    metrics = {
      totalBookings: apps.length,
      pendingCount,
      approvedCount,
      checkedOutCount,
      returnedCount,
      cancelledCount,
      rejectedCount,
      overdueCount,
      filteredRowsCount: rows.length,
    };
  }

  // ============================================================
  // 2. MACHINERY USAGE AND MAINTENANCE REPORT
  // ============================================================
  else if (reportType === "machinery_usage") {
    reportTitle = "Machinery Usage and Maintenance Report";
    dateBasisLabel = "Usage & Maintenance Dates (Recorded maintenance jobs and rental days within period)";

    // Units to include
    const unitsToInspect = selectedUnitDoc ? [selectedUnitDoc] : allUnits;

    // Fetch all overlapping applications within the period
    const appQuery = {
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
      status: { $in: ["Approved", "Checked-Out", "Returned"] },
    };
    const periodApps = await Application.find(appQuery).lean();

    // Fetch all maintenance records in this period
    const maintQuery = {
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    };
    const periodMaints = await MachineryMaintenance.find(maintQuery).lean();

    let totalRentalDaysAll = 0;
    let totalCompletedMaintAll = 0;
    let totalDaysUnavailableAll = 0;
    let unitsWithUsageCount = 0;

    rows = unitsToInspect.map((unit) => {
      // 1. Rental days booked/operated within the selected period
      const unitApps = periodApps.filter((a) => {
        if (a.machineryUnitId && a.machineryUnitId === unit.unitId) return true;
        if (a.equipment && (a.equipment.includes(unit.unitId) || a.equipment === unit.name)) return true;
        return false;
      });

      let rentalDays = 0;
      unitApps.forEach((a) => {
        // Calculate overlapping days between [a.startDate, a.endDate] and [startDate, endDate]
        const overlapStart = a.startDate > startDate ? a.startDate : startDate;
        const overlapEnd = a.endDate < endDate ? a.endDate : endDate;
        if (overlapStart <= overlapEnd) {
          const d1 = new Date(overlapStart);
          const d2 = new Date(overlapEnd);
          const diff = Math.max(1, Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
          rentalDays += diff;
        }
      });

      if (rentalDays > 0) unitsWithUsageCount++;
      totalRentalDaysAll += rentalDays;

      // 2. Engine hours or meter readings
      let engineHoursDisplay = "Unavailable";
      const reading = unit.currentMeterReading || unit.operatingHours || null;
      if (reading !== null && reading !== undefined && Number(reading) > 0) {
        engineHoursDisplay = `${Number(reading).toLocaleString()} ${unit.meterReadingUnit || "Hours"}`;
      } else {
        // Check latest checkin/checkout odometer from inspection
        const appWithReading = unitApps.find(
          (a) => (a.checkinInspection?.odometerHours > 0) || (a.checkoutInspection?.odometerHours > 0)
        );
        if (appWithReading) {
          const odo = appWithReading.checkinInspection?.odometerHours || appWithReading.checkoutInspection?.odometerHours;
          engineHoursDisplay = `${odo.toLocaleString()} Hours`;
        }
      }

      // 3. Completed maintenance jobs and costs
      const unitMaints = periodMaints.filter(
        (m) => m.equipmentUnitId === unit.unitId || m.equipmentName === unit.name
      );
      const completedMaints = unitMaints.filter((m) => m.status === "Completed");
      const completedMaintCount = completedMaints.length;
      totalCompletedMaintAll += completedMaintCount;

      const totalMaintCost = completedMaints.reduce((sum, m) => sum + (Number(m.maintenanceCost) || 0), 0);

      // 4. Days unavailable (Out of service, in repair, or completed maintenance)
      let daysUnavailable = 0;
      unitMaints.forEach((m) => {
        const overlapStart = m.startDate > startDate ? m.startDate : startDate;
        const overlapEnd = m.endDate < endDate ? m.endDate : endDate;
        if (overlapStart <= overlapEnd) {
          const d1 = new Date(overlapStart);
          const d2 = new Date(overlapEnd);
          const diff = Math.max(1, Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
          daysUnavailable += diff;
        }
      });
      totalDaysUnavailableAll += daysUnavailable;

      return {
        unitId: unit.unitId,
        unitName: unit.name,
        category: unit.category || "Tractor",
        model: unit.model || "Standard",
        rentalDays,
        engineHours: engineHoursDisplay,
        completedMaintenanceCount: completedMaintCount,
        maintenanceCost: totalMaintCost,
        daysUnavailable,
        operatingCondition: unit.operatingCondition || "Operational",
      };
    });

    metrics = {
      totalUnits: unitsToInspect.length,
      unitsWithUsageCount,
      totalRentalDays: totalRentalDaysAll,
      totalCompletedMaintenance: totalCompletedMaintAll,
      totalDaysUnavailable: totalDaysUnavailableAll,
    };
  }

  // ============================================================
  // 3. RENTAL FINANCIAL SUMMARY
  // ============================================================
  else if (reportType === "financial_summary") {
    reportTitle = "Rental Financial Summary";
    dateBasisLabel = "Activity Timestamp (Recorded payment, refund, or expense timestamp; Outstanding balance as real-time snapshot)";

    // 1. Payments Received (Collections)
    // Pull from Transaction model and paid Applications
    const txQuery = {
      createdAt: { $gte: startPHT, $lte: endPHT },
      type: { $in: ["Rental Fee", "Deposit", "Late Fee", "Damage Charge"] },
    };
    if (paymentMethod !== "all") {
      txQuery.paymentMethod = paymentMethod;
    }
    const txCollections = await Transaction.find(txQuery).lean();

    const appPaidQuery = {
      createdAt: { $gte: startPHT, $lte: endPHT },
      paymentStatus: { $in: ["Paid", "Settled"] },
    };
    if (paymentMethod !== "all") {
      appPaidQuery.paymentMethod = paymentMethod;
    }
    if (unitId !== "all") {
      const uName = selectedUnitDoc ? selectedUnitDoc.name : unitId;
      appPaidQuery.$or = [
        { machineryUnitId: unitId },
        { equipment: new RegExp(unitId, "i") },
        { equipment: uName },
        { machineryModel: uName },
      ];
    }
    const appCollections = await Application.find(appPaidQuery).lean();

    const collections = [];
    let totalCollections = 0;

    appCollections.forEach((a) => {
      const amount = Number(a.paymentAmount || a.totalAmount || a.financials?.totalPaid || 0);
      if (amount > 0) {
        totalCollections += amount;
        collections.push({
          id: a.displayId || `APP-${String(a._id).slice(-6).toUpperCase()}`,
          date: a.createdAt ? getPHTDateString(a.createdAt) : startDate,
          client: a.memberName || a.memberEmail || "Member",
          unit: a.equipment || a.machineryModel || "Machinery Unit",
          method: a.paymentMethod || "Cash",
          type: "Rental Payment",
          amount,
        });
      }
    });

    txCollections.forEach((t) => {
      // If specific unit selected, filter transaction equipment
      if (unitId !== "all") {
        const uName = selectedUnitDoc ? selectedUnitDoc.name : unitId;
        const matchesUnit = t.equipment && (t.equipment.includes(unitId) || t.equipment.includes(uName));
        if (!matchesUnit) return;
      }
      const amt = Number(t.amount) || 0;
      totalCollections += amt;
      collections.push({
        id: t.txId || `TX-${String(t._id).slice(-4)}`,
        date: t.createdAt ? getPHTDateString(t.createdAt) : startDate,
        client: t.farmer || "Client",
        unit: t.equipment || "Machinery Unit",
        method: t.paymentMethod || "Cash",
        type: t.type || "Rental Fee",
        amount: amt,
      });
    });

    // 2. Refunds Issued
    const refundTxQuery = {
      createdAt: { $gte: startPHT, $lte: endPHT },
      type: "Deposit Refund",
    };
    if (paymentMethod !== "all") {
      refundTxQuery.paymentMethod = paymentMethod;
    }
    const txRefunds = await Transaction.find(refundTxQuery).lean();

    const appRefundQuery = {
      createdAt: { $gte: startPHT, $lte: endPHT },
      $or: [{ "financials.refundAmount": { $gt: 0 } }, { paymentStatus: "Refunded" }],
    };
    if (unitId !== "all") {
      const uName = selectedUnitDoc ? selectedUnitDoc.name : unitId;
      appRefundQuery.$or = [
        { machineryUnitId: unitId },
        { equipment: new RegExp(unitId, "i") },
      ];
    }
    const appRefunds = await Application.find(appRefundQuery).lean();

    const refunds = [];
    let totalRefunds = 0;

    appRefunds.forEach((a) => {
      const refAmt = Number(a.financials?.refundAmount || a.totalAmount || 0);
      if (refAmt > 0) {
        totalRefunds += refAmt;
        refunds.push({
          id: a.displayId || `REF-${String(a._id).slice(-6).toUpperCase()}`,
          date: a.createdAt ? getPHTDateString(a.createdAt) : startDate,
          client: a.memberName || "Member",
          unit: a.equipment || "Machinery Unit",
          method: a.paymentMethod || "Cash",
          reason: a.cancellationReason || "Deposit / Booking Refund",
          amount: refAmt,
        });
      }
    });

    txRefunds.forEach((t) => {
      if (unitId !== "all") {
        const uName = selectedUnitDoc ? selectedUnitDoc.name : unitId;
        const matchesUnit = t.equipment && (t.equipment.includes(unitId) || t.equipment.includes(uName));
        if (!matchesUnit) return;
      }
      const amt = Number(t.amount) || 0;
      totalRefunds += amt;
      refunds.push({
        id: t.txId || `REF-${String(t._id).slice(-4)}`,
        date: t.createdAt ? getPHTDateString(t.createdAt) : startDate,
        client: t.farmer || "Client",
        unit: t.equipment || "Machinery Unit",
        method: t.paymentMethod || "Cash",
        reason: t.notes || "Deposit Refund",
        amount: amt,
      });
    });

    // 3. Operating Expenses
    // Sourced from MachineryMaintenance costs within period and general operating expenses
    const maintExpQuery = {
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
      maintenanceCost: { $gt: 0 },
    };
    if (unitId !== "all") {
      maintExpQuery.equipmentUnitId = unitId;
    }
    const maintExpenses = await MachineryMaintenance.find(maintExpQuery).lean();

    const expenses = [];
    let totalExpenses = 0;

    maintExpenses.forEach((m) => {
      const cost = Number(m.maintenanceCost) || 0;
      totalExpenses += cost;
      expenses.push({
        id: `MAINT-${String(m._id).slice(-5).toUpperCase()}`,
        date: m.startDate || startDate,
        category: `Maintenance: ${m.maintenanceType || "Routine Servicing"}`,
        unit: `${m.equipmentUnitId} (${m.equipmentName})`,
        notes: m.reason || "Routine upkeep & servicing",
        amount: cost,
      });
    });

    // 4. Outstanding Booking Balances (Snapshot as of right now)
    const outstandingQuery = {
      status: { $in: ["Pending", "Approved", "Checked-Out"] },
      paymentStatus: { $ne: "Paid" },
    };
    if (unitId !== "all") {
      const uName = selectedUnitDoc ? selectedUnitDoc.name : unitId;
      outstandingQuery.$or = [
        { machineryUnitId: unitId },
        { equipment: new RegExp(unitId, "i") },
        { equipment: uName },
        { machineryModel: uName },
      ];
    }
    const outstandingApps = await Application.find(outstandingQuery).sort({ startDate: 1 }).lean();

    const outstandingBalances = [];
    let totalOutstanding = 0;

    outstandingApps.forEach((a) => {
      const totalFee = Number(a.totalAmount || 0);
      const paid = Number(a.paymentAmount || a.financials?.totalPaid || 0);
      const balance = Math.max(0, totalFee - paid);
      if (balance > 0) {
        totalOutstanding += balance;
        outstandingBalances.push({
          bookingId: a.displayId || `APP-${String(a._id).slice(-6).toUpperCase()}`,
          client: a.memberName || a.memberEmail || "Member",
          unit: a.equipment || a.machineryModel || "Machinery Unit",
          dueDate: a.endDate || a.startDate,
          totalFee,
          amountPaid: paid,
          balance,
          status: a.status,
        });
      }
    });

    const netOperatingCashflow = totalCollections - totalRefunds - totalExpenses;

    metrics = {
      totalCollections,
      totalRefunds,
      totalExpenses,
      totalOutstanding,
      netOperatingCashflow,
      snapshotDate: getPHTNowString(),
    };

    extraSections = {
      collections,
      refunds,
      expenses,
      outstandingBalances,
      snapshotDate: getPHTNowString(),
    };

    // Rows represent collections for the main table view
    rows = collections;
  }

  return {
    reportType,
    reportTitle,
    period: {
      startDate,
      endDate,
      label: `${startDate} to ${endDate} (Philippine Time)`,
    },
    appliedFilters: {
      unitId,
      unitLabel,
      status: status || "all",
      paymentMethod: paymentMethod || "all",
    },
    dateBasisLabel,
    generatedAt: getPHTNowString(),
    metrics,
    rows,
    extraSections,
    unitsList: allUnits.map((u) => ({ unitId: u.unitId, name: u.name })),
  };
}

/**
 * Generate PDF document using PDFKit
 */
function generateReportPDF(reportData, stream, options = {}) {
  const { loggedInManager = "Operations Manager" } = options;
  const {
    reportTitle,
    period,
    appliedFilters,
    dateBasisLabel,
    generatedAt,
    metrics,
    rows,
    extraSections,
  } = reportData;

  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    bufferPages: true,
  });

  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - 80; // 40 margin each side

  // -------------------------------------------------------------
  // Letterhead Drawer (Only on First Page)
  // -------------------------------------------------------------
  const drawLetterhead = () => {
    // Logo on upper left (40, 26)
    const printLogoPath = path.join(__dirname, "../public/images/kimpc-logo-print.png");
    const origLogoPath = path.join(__dirname, "../public/images/kimpc logo.png");
    const logoPath = fs.existsSync(printLogoPath) ? printLogoPath : origLogoPath;
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 40, 26, { fit: [50, 50] });
      } catch (err) {
        console.warn("PDFKit logo draw notice:", err.message);
      }
    }

    // Centered lines relative to the full page width
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(
      "KALILANGAN IRRIGATORS MULTI-PURPOSE COOPERATIVE",
      0,
      28,
      { align: "center", width: pageWidth }
    );

    doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(
      "Kimagting, Ninoy Aquino, Kalilangan, Bukidnon",
      0,
      42,
      { align: "center", width: pageWidth }
    );

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#047857").text(
      reportTitle.toUpperCase(),
      0,
      56,
      { align: "center", width: pageWidth }
    );

    // Report Period in header
    let periodText = `Report Period: ${period.startDate} to ${period.endDate}`;
    if (appliedFilters && appliedFilters.unitId && appliedFilters.unitId !== "all") {
      periodText += ` | Unit: ${appliedFilters.unitLabel}`;
    }
    if (appliedFilters && appliedFilters.status && appliedFilters.status !== "all") {
      periodText += ` | Status: ${appliedFilters.status}`;
    }
    if (appliedFilters && appliedFilters.paymentMethod && appliedFilters.paymentMethod !== "all") {
      periodText += ` | Method: ${appliedFilters.paymentMethod}`;
    }

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#334155").text(
      periodText,
      0,
      71,
      { align: "center", width: pageWidth }
    );

    // Thin divider line below letterhead
    const dividerY = 86;
    doc.strokeColor("#cbd5e1").lineWidth(0.75).moveTo(40, dividerY).lineTo(pageWidth - 40, dividerY).stroke();

    return dividerY + 12;
  };

  // -------------------------------------------------------------
  // Table Header Drawer (Called on First Page and on Every New Page)
  // -------------------------------------------------------------
  const drawTableHeader = (cols, yPos) => {
    doc.rect(40, yPos, contentWidth, 18).fill("#1e293b");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff");

    cols.forEach((col) => {
      doc.text(col.label, col.x, yPos + 5, {
        width: col.w,
        align: col.align || "left",
      });
    });

    return yPos + 18;
  };

  // -------------------------------------------------------------
  // Render Section Tables
  // -------------------------------------------------------------
  let currentY = drawLetterhead();

  const checkPageBreak = (neededHeight, cols) => {
    if (currentY + neededHeight > pageHeight - 55) {
      doc.addPage();
      currentY = 40;
      if (cols) {
        currentY = drawTableHeader(cols, currentY);
      }
    }
  };

  // REPORT 1: BOOKING REPORT
  if (reportData.reportType === "booking") {
    const cols = [
      { label: "Booking ID", x: 44, w: 60 },
      { label: "Member Name", x: 106, w: 100 },
      { label: "Machinery Unit", x: 208, w: 110 },
      { label: "Rental Dates", x: 320, w: 85 },
      { label: "Status", x: 407, w: 60, align: "center" },
      { label: "Return Status", x: 469, w: 82, align: "right" },
    ];

    currentY = drawTableHeader(cols, currentY);

    if (rows.length === 0) {
      doc.rect(40, currentY, contentWidth, 24).fillAndStroke("#ffffff", "#e2e8f0");
      doc.font("Helvetica-Oblique").fontSize(8).fillColor("#64748b").text("No bookings found matching the selected filters.", 40, currentY + 7, { align: "center", width: contentWidth });
      currentY += 24;
    } else {
      rows.forEach((r, idx) => {
        checkPageBreak(18, cols);
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(40, currentY, contentWidth, 18).fillAndStroke(bg, "#e2e8f0");

        doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a").text(r.bookingId, 44, currentY + 5, { width: 60 });
        doc.font("Helvetica").fontSize(7).fillColor("#1e293b").text(r.memberName, 106, currentY + 5, { width: 100, ellipsis: true });
        doc.text(r.equipment, 208, currentY + 5, { width: 110, ellipsis: true });
        doc.text(r.rentalDates, 320, currentY + 5, { width: 85 });

        // Status badge color
        const stColor = r.status === "Approved" ? "#059669" : (r.status === "Pending" ? "#d97706" : (r.status === "Returned" ? "#2563eb" : "#dc2626"));
        doc.font("Helvetica-Bold").fillColor(stColor).text(r.status, 407, currentY + 5, { width: 60, align: "center" });

        // Overdue status
        const retColor = r.isOverdue ? "#dc2626" : (r.returnStatus === "Returned" ? "#059669" : "#64748b");
        doc.font(r.isOverdue ? "Helvetica-Bold" : "Helvetica").fillColor(retColor).text(r.returnStatus, 469, currentY + 5, { width: 82, align: "right" });

        currentY += 18;
      });
    }
  }

  // REPORT 2: MACHINERY USAGE AND MAINTENANCE
  else if (reportData.reportType === "machinery_usage") {
    const cols = [
      { label: "Unit ID", x: 44, w: 70 },
      { label: "Machinery Name / Model", x: 116, w: 140 },
      { label: "Rental Days", x: 258, w: 60, align: "center" },
      { label: "Engine Hours", x: 320, w: 75, align: "center" },
      { label: "Completed Maint.", x: 397, w: 75, align: "center" },
      { label: "Days Unavail.", x: 474, w: 77, align: "right" },
    ];

    currentY = drawTableHeader(cols, currentY);

    if (rows.length === 0) {
      doc.rect(40, currentY, contentWidth, 24).fillAndStroke("#ffffff", "#e2e8f0");
      doc.font("Helvetica-Oblique").fontSize(8).fillColor("#64748b").text("No machinery units found matching the selected filters.", 40, currentY + 7, { align: "center", width: contentWidth });
      currentY += 24;
    } else {
      rows.forEach((r, idx) => {
        checkPageBreak(18, cols);
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(40, currentY, contentWidth, 18).fillAndStroke(bg, "#e2e8f0");

        doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a").text(r.unitId, 44, currentY + 5, { width: 70 });
        doc.font("Helvetica").fontSize(7).fillColor("#1e293b").text(r.unitName, 116, currentY + 5, { width: 140, ellipsis: true });
        doc.font("Helvetica-Bold").text(String(r.rentalDays), 258, currentY + 5, { width: 60, align: "center" });

        doc.font(r.engineHours === "Unavailable" ? "Helvetica-Oblique" : "Helvetica")
          .fillColor(r.engineHours === "Unavailable" ? "#94a3b8" : "#0f172a")
          .text(r.engineHours, 320, currentY + 5, { width: 75, align: "center" });

        const maintText = r.completedMaintenanceCount > 0 ? `${r.completedMaintenanceCount} (${formatPesos(r.maintenanceCost)})` : "0";
        doc.font("Helvetica").fillColor("#1e293b").text(maintText, 397, currentY + 5, { width: 75, align: "center" });

        const unavailColor = r.daysUnavailable > 0 ? "#dc2626" : "#64748b";
        doc.font(r.daysUnavailable > 0 ? "Helvetica-Bold" : "Helvetica").fillColor(unavailColor).text(`${r.daysUnavailable} d`, 474, currentY + 5, { width: 77, align: "right" });

        currentY += 18;
      });
    }
  }

  // REPORT 3: RENTAL FINANCIAL SUMMARY
  else if (reportData.reportType === "financial_summary" && extraSections) {
    // Subsection A: Payments Received (Collections)
    checkPageBreak(40);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#059669").text(`1. PAYMENTS RECEIVED (COLLECTIONS) — Subtotal: ${formatPesos(metrics.totalCollections)}`, 40, currentY);
    currentY += 14;

    const collCols = [
      { label: "Ref / Receipt", x: 44, w: 75 },
      { label: "Date", x: 121, w: 55 },
      { label: "Member / Client", x: 178, w: 110 },
      { label: "Machinery Unit", x: 290, w: 110 },
      { label: "Method", x: 402, w: 60, align: "center" },
      { label: "Amount (PHP)", x: 464, w: 87, align: "right" },
    ];
    currentY = drawTableHeader(collCols, currentY);

    if (extraSections.collections.length === 0) {
      doc.rect(40, currentY, contentWidth, 18).fillAndStroke("#ffffff", "#e2e8f0");
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#64748b").text("No payment transactions recorded during this period.", 40, currentY + 5, { align: "center", width: contentWidth });
      currentY += 18;
    } else {
      extraSections.collections.forEach((item, idx) => {
        checkPageBreak(17, collCols);
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(40, currentY, contentWidth, 17).fillAndStroke(bg, "#e2e8f0");
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a").text(item.id, 44, currentY + 4, { width: 75 });
        doc.font("Helvetica").fontSize(7).fillColor("#334155").text(item.date, 121, currentY + 4, { width: 55 });
        doc.text(item.client, 178, currentY + 4, { width: 110, ellipsis: true });
        doc.text(item.unit, 290, currentY + 4, { width: 110, ellipsis: true });
        doc.text(item.method, 402, currentY + 4, { width: 60, align: "center" });
        doc.font("Helvetica-Bold").text(formatPesos(item.amount), 464, currentY + 4, { width: 87, align: "right" });
        currentY += 17;
      });
    }

    // Subsection B: Refunds Issued
    currentY += 14;
    checkPageBreak(40);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#d97706").text(`2. REFUNDS ISSUED — Subtotal: ${formatPesos(metrics.totalRefunds)}`, 40, currentY);
    currentY += 14;

    const refCols = [
      { label: "Refund ID", x: 44, w: 75 },
      { label: "Date", x: 121, w: 55 },
      { label: "Member / Client", x: 178, w: 110 },
      { label: "Reason / Equipment", x: 290, w: 110 },
      { label: "Method", x: 402, w: 60, align: "center" },
      { label: "Refund (PHP)", x: 464, w: 87, align: "right" },
    ];
    currentY = drawTableHeader(refCols, currentY);

    if (extraSections.refunds.length === 0) {
      doc.rect(40, currentY, contentWidth, 18).fillAndStroke("#ffffff", "#e2e8f0");
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#64748b").text("No refunds issued during this period.", 40, currentY + 5, { align: "center", width: contentWidth });
      currentY += 18;
    } else {
      extraSections.refunds.forEach((item, idx) => {
        checkPageBreak(17, refCols);
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(40, currentY, contentWidth, 17).fillAndStroke(bg, "#e2e8f0");
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a").text(item.id, 44, currentY + 4, { width: 75 });
        doc.font("Helvetica").fontSize(7).fillColor("#334155").text(item.date, 121, currentY + 4, { width: 55 });
        doc.text(item.client, 178, currentY + 4, { width: 110, ellipsis: true });
        doc.text(item.reason, 290, currentY + 4, { width: 110, ellipsis: true });
        doc.text(item.method, 402, currentY + 4, { width: 60, align: "center" });
        doc.font("Helvetica-Bold").fillColor("#dc2626").text(formatPesos(item.amount), 464, currentY + 4, { width: 87, align: "right" });
        currentY += 17;
      });
    }

    // Subsection C: Operating Expenses
    currentY += 14;
    checkPageBreak(40);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#dc2626").text(`3. OPERATING EXPENSES — Subtotal: ${formatPesos(metrics.totalExpenses)}`, 40, currentY);
    currentY += 14;

    const expCols = [
      { label: "Expense ID", x: 44, w: 80 },
      { label: "Date", x: 126, w: 55 },
      { label: "Category / Maintenance Title", x: 183, w: 155 },
      { label: "Machinery Unit / Depot", x: 340, w: 120 },
      { label: "Cost (PHP)", x: 462, w: 89, align: "right" },
    ];
    currentY = drawTableHeader(expCols, currentY);

    if (extraSections.expenses.length === 0) {
      doc.rect(40, currentY, contentWidth, 18).fillAndStroke("#ffffff", "#e2e8f0");
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#64748b").text("No operating or maintenance expenses recorded during this period.", 40, currentY + 5, { align: "center", width: contentWidth });
      currentY += 18;
    } else {
      extraSections.expenses.forEach((item, idx) => {
        checkPageBreak(17, expCols);
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(40, currentY, contentWidth, 17).fillAndStroke(bg, "#e2e8f0");
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a").text(item.id, 44, currentY + 4, { width: 80 });
        doc.font("Helvetica").fontSize(7).fillColor("#334155").text(item.date, 126, currentY + 4, { width: 55 });
        doc.text(item.category, 183, currentY + 4, { width: 155, ellipsis: true });
        doc.text(item.unit, 340, currentY + 4, { width: 120, ellipsis: true });
        doc.font("Helvetica-Bold").fillColor("#dc2626").text(formatPesos(item.amount), 462, currentY + 4, { width: 89, align: "right" });
        currentY += 17;
      });
    }

    // Subsection D: Outstanding Booking Balances (Snapshot)
    currentY += 14;
    checkPageBreak(40);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(`4. OUTSTANDING BOOKING BALANCES (Snapshot as of ${extraSections.snapshotDate}) — Subtotal: ${formatPesos(metrics.totalOutstanding)}`, 40, currentY);
    currentY += 14;

    const outCols = [
      { label: "Booking ID", x: 44, w: 75 },
      { label: "Member / Client", x: 121, w: 100 },
      { label: "Machinery Unit", x: 223, w: 105 },
      { label: "Due Date", x: 330, w: 55 },
      { label: "Total Fee", x: 387, w: 55, align: "right" },
      { label: "Paid", x: 444, w: 45, align: "right" },
      { label: "Balance (PHP)", x: 491, w: 60, align: "right" },
    ];
    currentY = drawTableHeader(outCols, currentY);

    if (extraSections.outstandingBalances.length === 0) {
      doc.rect(40, currentY, contentWidth, 18).fillAndStroke("#ffffff", "#e2e8f0");
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#64748b").text("All active bookings are currently fully settled with 0 balance.", 40, currentY + 5, { align: "center", width: contentWidth });
      currentY += 18;
    } else {
      extraSections.outstandingBalances.forEach((item, idx) => {
        checkPageBreak(17, outCols);
        const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(40, currentY, contentWidth, 17).fillAndStroke(bg, "#e2e8f0");
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#0f172a").text(item.bookingId, 44, currentY + 4, { width: 75 });
        doc.font("Helvetica").fontSize(7).fillColor("#334155").text(item.client, 121, currentY + 4, { width: 100, ellipsis: true });
        doc.text(item.unit, 223, currentY + 4, { width: 105, ellipsis: true });
        doc.text(item.dueDate, 330, currentY + 4, { width: 55 });
        doc.text(formatPesos(item.totalFee), 387, currentY + 4, { width: 55, align: "right" });
        doc.text(formatPesos(item.amountPaid), 444, currentY + 4, { width: 45, align: "right" });
        doc.font("Helvetica-Bold").fillColor("#dc2626").text(formatPesos(item.balance), 491, currentY + 4, { width: 60, align: "right" });
        currentY += 17;
      });
    }
  }

  // -------------------------------------------------------------
  // Page Numbers: "Page X of Y" (Footer on every page)
  // -------------------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.strokeColor("#cbd5e1").lineWidth(0.5).moveTo(40, pageHeight - 34).lineTo(pageWidth - 40, pageHeight - 34).stroke();

    doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(
      `Page ${i + 1} of ${range.count}`,
      0,
      pageHeight - 25,
      { align: "center", width: pageWidth, lineBreak: false }
    );

    const footerMeta = `Generated: ${generatedAt} | Generated by: ${loggedInManager}`;
    doc.font("Helvetica").fontSize(6.8).fillColor("#64748b").text(
      footerMeta,
      40,
      pageHeight - 25,
      { align: "left", width: 280, lineBreak: false }
    );

    doc.page.margins.bottom = oldBottomMargin;
  }

  doc.end();
}

module.exports = {
  getReportData,
  generateReportPDF,
  formatPesos,
  validateFilters,
};
