const path = require("path");
const fs = require("fs");
const express = require("express");
const compression = require("compression");
const { rateLimit } = require("express-rate-limit");

// Middleware imports
const authManager = require("./middleware/authManager");
const errorHandler = require("./middleware/errorHandler");

// Route imports
const calendarRoutes = require("./routes/calendar");
const managerRoutes = require("./routes/manager");
const apiRoutes = require("./routes/api");
const uploadRoutes = require("./routes/uploadRoutes");
const weatherRoutes = require("./routes/weatherRoutes");
const geoRoutes = require("./routes/geoRoutes");
const ocrRoutes = require("./routes/ocrRoutes");

const app = express();

// Only trust X-Forwarded-* when actually deployed behind a proxy (otherwise clients can spoof their IP
// to dodge rate limits and falsify audit logs). Set TRUST_PROXY=1 behind Render/Nginx/Cloudflare etc.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number.isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY));
}
app.disable("x-powered-by");

// Baseline security headers (helmet-equivalent essentials, no extra dependency).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
});

// Rate limiting: a generous global API cap, and strict caps on credential / OTP / PIN endpoints.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." },
});
const CREDENTIAL_PATHS = [
  "/api/login",
  "/api/register",
  "/api/verify",
  "/api/auth/google",
  "/api/auth/facebook",
  "/api/auth/forgot-password",
  "/api/forgot-password",
  "/api/auth/forgot-password-request",
  "/api/auth/reset-password",
  "/api/reset-password",
  "/api/auth/change-password",
  "/api/admin/verify-pin",
  "/api/admin/verify-password",
  "/api/admin/change-pin",
  "/api/admin/set-initial-pin",
  "/api/admin/request-delete-otp",
  "/api/admin/verify-delete-otp",
  "/api/admin/integrations/dev-auth/verify-otp",
  "/api/admin/integrations/dev-auth/request",
];
app.use("/api", apiLimiter);
app.post(CREDENTIAL_PATHS, credentialLimiter);

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
  fallthrough: false,
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Even if a non-image ever lands here, the browser won't run scripts from it.
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    if (!/\.(jpe?g|png|gif|webp)$/i.test(filePath)) {
      res.setHeader("Content-Disposition", "attachment");
    }
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
app.use("/api/geo", geoRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/manager", authManager);
app.use("/api/manager", managerRoutes);
app.use("/api", apiRoutes);
app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint not found." }));

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
      // index.html and service worker scripts must NEVER be cached long-term
      if (filePath.endsWith("index.html") || filePath.endsWith("OneSignalSDKWorker.js")) {
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

