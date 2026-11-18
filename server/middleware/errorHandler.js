/**
 * Centralized API Error Handling Middleware.
 * Catches asynchronous Express route errors, Mongoose validations, and DB duplicate key collisions.
 */
function errorHandler(err, req, res, next) {
  console.error(`[API Error] ${req.method} ${req.originalUrl || req.url}:`, err);

  // Optimistic concurrency conflict (see utils/concurrency.js)
  if (err.name === "VersionConflictError") {
    const current = err.current?.toJSON ? err.current.toJSON() : err.current;
    return res.status(409).json({
      error: "VERSION_CONFLICT",
      message: err.message,
      currentVersion: current?.version ?? 0,
      current,
    });
  }
  // Raw Mongoose VersionError from a save() not wrapped by saveVersioned: no doc to return.
  if (err.name === "VersionError") {
    return res.status(409).json({ error: "VERSION_CONFLICT", message: "This resource was modified by someone else." });
  }

  // MongoDB duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "record";
    return res.status(409).json({ error: `That ${field} already exists.` });
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    const details = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: details.join(", ") });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Invalid or expired authentication token." });
  }

  // Standard or custom errors. Never leak internal messages / stack details for 5xx.
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    return res.status(status).json({ error: "Something went wrong on the server." });
  }
  res.status(status).json({
    error: err.expose === false ? "Request could not be processed." : err.message || "Request could not be processed.",
  });
}

module.exports = errorHandler;

