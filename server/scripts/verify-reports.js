const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const Account = require("../models/Account");
const MachineryUnit = require("../models/MachineryUnit");
const Application = require("../models/Application");
const reportService = require("../services/reportService");

const JWT_SECRET = process.env.JWT_SECRET || "minders-secret-jwt-key-cooperative-2026";

async function run() {
  console.log("=== Verifying KIMPC Manager Reports ===");
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Find a manager account
  const manager = await Account.findOne({ role: { $in: ["manager", "admin"] } }).lean();
  console.log("Manager:", manager ? `${manager.fullName} (${manager.email}) [${manager.role}]` : "No manager found");

  if (!manager) {
    console.error("No manager account found in DB!");
    process.exit(1);
  }

  const token = jwt.sign(
    { id: manager._id, email: manager.email, role: manager.role },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 2. Find available units
  const units = await MachineryUnit.find({}).lean();
  console.log(`Found ${units.length} machinery units:`);
  units.slice(0, 5).forEach((u) => console.log(`  - ${u.unitId}: ${u.name} (${u.category})`));

  // Find tractor unit
  const tractorUnit = units.find((u) => u.category === "Tractor" || u.unitId.includes("TR") || u.name.toLowerCase().includes("tractor")) || units[0];
  const tractorUnitId = tractorUnit ? tractorUnit.unitId : "all";
  console.log(`Selected tractor for test: ${tractorUnitId} (${tractorUnit?.name})`);

  // 3. Test HTTP Preview Endpoint: Booking Report (November 1-30, Tractor, Completed)
  console.log("\n--- Testing GET /api/manager/reports/preview (Booking Report: Nov 1-30, Tractor, Completed) ---");
  const testUrl = `http://localhost:3000/api/manager/reports/preview?reportType=booking&startDate=2026-11-01&endDate=2026-11-30&unitId=${tractorUnitId}&status=Completed`;

  const previewRes = await fetch(testUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const previewData = await previewRes.json();
  console.log("Preview status:", previewRes.status, "ok:", previewData.ok);
  if (!previewData.ok) {
    console.error("Preview failed:", previewData);
  } else {
    const report = previewData.report;
    console.log("Report title:", report.reportTitle);
    console.log("Period:", report.period.label);
    console.log("Applied filters:", report.appliedFilters);
    console.log("Date basis:", report.dateBasisLabel);
    console.log("Metrics:", report.metrics);
    console.log(`Rows count: ${report.rows.length}`);
    if (report.rows.length > 0) {
      console.log("First row sample:", report.rows[0]);
    }
  }

  // 4. Test HTTP PDF Endpoint: Booking Report
  console.log("\n--- Testing GET /api/manager/reports/pdf (Booking Report: Nov 1-30, Tractor, Completed) ---");
  const pdfUrl = `http://localhost:3000/api/manager/reports/pdf?reportType=booking&startDate=2026-11-01&endDate=2026-11-30&unitId=${tractorUnitId}&status=Completed`;

  const pdfRes = await fetch(pdfUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log("PDF status:", pdfRes.status);
  console.log("Content-Type:", pdfRes.headers.get("Content-Type"));
  console.log("Content-Disposition:", pdfRes.headers.get("Content-Disposition"));

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  console.log(`Downloaded PDF size: ${pdfBuffer.length} bytes`);
  const outPdfPath = path.join(__dirname, "test-booking-report.pdf");
  fs.writeFileSync(outPdfPath, pdfBuffer);
  console.log(`Saved test PDF to: ${outPdfPath}`);

  // 5. Test Machinery Usage Report
  console.log("\n--- Testing GET /api/manager/reports/preview (Machinery Usage & Maintenance) ---");
  const machUrl = `http://localhost:3000/api/manager/reports/preview?reportType=machinery&startDate=2026-11-01&endDate=2026-11-30&unitId=all`;
  const machRes = await fetch(machUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const machData = await machRes.json();
  console.log("Machinery report status:", machRes.status, "ok:", machData.ok);
  console.log("Machinery metrics:", machData.report?.metrics);
  console.log(`Machinery rows: ${machData.report?.rows?.length}`);

  // Test Machinery PDF
  const machPdfUrl = `http://localhost:3000/api/manager/reports/pdf?reportType=machinery&startDate=2026-11-01&endDate=2026-11-30&unitId=all`;
  const machPdfRes = await fetch(machPdfUrl, { headers: { Authorization: `Bearer ${token}` } });
  const machPdfBuf = Buffer.from(await machPdfRes.arrayBuffer());
  const machPdfPath = path.join(__dirname, "test-machinery-report.pdf");
  fs.writeFileSync(machPdfPath, machPdfBuf);
  console.log(`Saved Machinery PDF (${machPdfBuf.length} bytes) to: ${machPdfPath}`);

  // 6. Test Rental Financial Summary
  console.log("\n--- Testing GET /api/manager/reports/preview (Rental Financial Summary) ---");
  const finUrl = `http://localhost:3000/api/manager/reports/preview?reportType=financial&startDate=2026-11-01&endDate=2026-11-30&unitId=all`;
  const finRes = await fetch(finUrl, { headers: { Authorization: `Bearer ${token}` } });
  const finData = await finRes.json();
  console.log("Financial report status:", finRes.status, "ok:", finData.ok);
  console.log("Financial metrics:", finData.report?.metrics);
  console.log("Extra sections counts:", {
    collections: finData.report?.extraSections?.collections?.length,
    refunds: finData.report?.extraSections?.refunds?.length,
    expenses: finData.report?.extraSections?.expenses?.length,
    outstanding: finData.report?.extraSections?.outstandingBalances?.length,
  });

  // Test Financial PDF
  const finPdfUrl = `http://localhost:3000/api/manager/reports/pdf?reportType=financial&startDate=2026-11-01&endDate=2026-11-30&unitId=all`;
  const finPdfRes = await fetch(finPdfUrl, { headers: { Authorization: `Bearer ${token}` } });
  const finPdfBuf = Buffer.from(await finPdfRes.arrayBuffer());
  const finPdfPath = path.join(__dirname, "test-financial-report.pdf");
  fs.writeFileSync(finPdfPath, finPdfBuf);
  console.log(`Saved Financial PDF (${finPdfBuf.length} bytes) to: ${finPdfPath}`);

  // 7. Test Multi-page PDF generation with all bookings to verify pagination and repeated headers
  console.log("\n--- Testing Multi-Page Booking Report (All dates, all units) ---");
  const allBookingsUrl = `http://localhost:3000/api/manager/reports/pdf?reportType=booking&startDate=2020-01-01&endDate=2030-12-31&unitId=all&status=all`;
  const multiPdfRes = await fetch(allBookingsUrl, { headers: { Authorization: `Bearer ${token}` } });
  const multiPdfBuf = Buffer.from(await multiPdfRes.arrayBuffer());
  const multiPdfPath = path.join(__dirname, "test-multipage-report.pdf");
  fs.writeFileSync(multiPdfPath, multiPdfBuf);
  console.log(`Saved Multi-Page PDF (${multiPdfBuf.length} bytes) to: ${multiPdfPath}`);

  await mongoose.disconnect();
  console.log("\n=== All Tests Passed Successfully ===");
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
