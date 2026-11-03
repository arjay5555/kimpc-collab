require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const { startAuditArchiveWorker } = require("./workers/archiveAuditLogs");
const { startBookingReminderWorker } = require("./workers/bookingReminderNotifications");
const authManager = require("./middleware/authManager");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Static uploads directory for machinery photos
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// Redirect legacy .html URLs to clean Node.js route paths
app.use((req, res, next) => {
  if (req.path.endsWith(".html")) {
    const cleanPath = req.path.slice(0, -5);
    const query = req.url.slice(req.path.length);
    return res.redirect(301, cleanPath + query);
  }
  next();
});

const clientDist = path.join(__dirname, "client", "dist");

// API Routes
app.use("/api/calendar", require("./routes/calendar"));
app.use("/api/manager", authManager);
app.use("/api/manager", require("./routes/manager"));
app.use("/api", require("./routes/api"));

// Serve Pure React Application (SPA)
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(clientDist, "index.html"));
    }
    next();
  });
} else {
  // Fallback to legacy static files if client not built
  app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
}

// Centralized error handler
app.use(errorHandler);

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI. Copy ".env.example" to ".env" and set it.');
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");

    // Start the monthly audit-log archive cron worker.
    startAuditArchiveWorker({ runImmediately: false });
    startBookingReminderWorker();

    app.listen(port, () => console.log(`KIMPC (Kalilangan Irrigators Multi-Purpose Cooperative) is running at http://localhost:${port}/login`));
  })
  .catch((error) => {
    console.error("Could not connect to MongoDB:", error.message);
    process.exit(1);
  });
