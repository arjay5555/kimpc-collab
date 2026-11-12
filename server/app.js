const path = require("path");
const fs = require("fs");
const express = require("express");
const compression = require("compression");

// Middleware imports
const authManager = require("./middleware/authManager");
const errorHandler = require("./middleware/errorHandler");

// Route imports
const calendarRoutes = require("./routes/calendar");
const managerRoutes = require("./routes/manager");
const apiRoutes = require("./routes/api");
const uploadRoutes = require("./routes/uploadRoutes");
const weatherRoutes = require("./routes/weatherRoutes");

const app = express();

// 1. Enable Gzip / Deflate compression for all responses (>1KB) to speed up transfer
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

// 2. Request Parsers
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// 3. Static uploads directory for machinery photos & GCash receipts
// Cache uploaded static media for 7 days with stale-while-revalidate for CDN & browsers
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir, {
  maxAge: "7d",
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  },
}));

// 4. API Security & Cache-Control:
// Dynamic transaction, auth, and booking data must NEVER be cached by intermediate proxies/CDNs
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// 5. API Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/manager", authManager);
app.use("/api/manager", managerRoutes);
app.use("/api", apiRoutes);

// 6. Serve Frontend Application (Vite React SPA) with optimized caching
const clientDist = fs.existsSync(path.join(__dirname, "..", "client", "dist"))
  ? path.join(__dirname, "..", "client", "dist")
  : path.join(__dirname, "client", "dist");

if (fs.existsSync(clientDist)) {
  // Vite build assets (JS/CSS with content hashes) are immutable and can be cached for 1 year
  app.use(express.static(clientDist, {
    maxAge: "1y",
    immutable: true,
    setHeaders: (res, filePath) => {
      // index.html must NEVER be cached long-term so user always receives the latest deployed version
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.sendFile(path.join(clientDist, "index.html"));
    }
    next();
  });
} else {
  app.use(express.static(path.join(__dirname, "public")));
}

// 7. Centralized Error Handler
app.use(errorHandler);

module.exports = app;

