/**
 * Centralized API Error Handling Middleware.
 * Catches asynchronous Express route errors, Mongoose validations, and DB duplicate key collisions.
 */
function errorHandler(err, req, res, next) {
  console.error(`[API Error] ${req.method} ${req.originalUrl || req.url}:`, err);

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

  // Standard or custom errors
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Something went wrong on the server.",
  });
}

module.exports = errorHandler;

