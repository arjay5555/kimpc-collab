const path = require("path");
const fs = require("fs");
const express = require("express");

// Middleware imports
const authManager = require("./middleware/authManager");
const errorHandler = require("./middleware/errorHandler");

// Route imports
const calendarRoutes = require("./routes/calendar");
const managerRoutes = require("./routes/manager");
const apiRoutes = require("./routes/api");

const app = express();

// 1. Request Parsers
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// 2. Static uploads directory for machinery photos & GCash receipts
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// 3. Redirect legacy .html URLs to clean Node.js route paths
app.use((req, res, next) => {
  if (req.path.endsWith(".html")) {
    const cleanPath = req.path.slice(0, -5);
    const query = req.url.slice(req.path.length);
    return res.redirect(301, cleanPath + query);
  }
  next();
});

// 4. API Routes
app.use("/api/calendar", calendarRoutes);
app.use("/api/manager", authManager);
app.use("/api/manager", managerRoutes);
app.use("/api", apiRoutes);

// 5. Serve Frontend Application (Vite React SPA)
const clientDist = fs.existsSync(path.join(__dirname, "..", "client", "dist"))
  ? path.join(__dirname, "..", "client", "dist")
  : path.join(__dirname, "client", "dist");

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

// 6. Centralized Error Handler
app.use(errorHandler);

module.exports = app;
