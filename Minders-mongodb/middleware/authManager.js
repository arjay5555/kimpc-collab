const jwt = require("jsonwebtoken");
const Account = require("../models/Account");

const JWT_SECRET = process.env.JWT_SECRET || "minders-secret-jwt-key-cooperative-2026";

async function authManager(req, res, next) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.id) {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }

    const account = await Account.findById(payload.id).select("_id email fullName role isSuspended isArchived");
    if (!account || account.isSuspended || account.isArchived) {
      return res.status(401).json({ error: "This account is unavailable. Please sign in again." });
    }
    if (!["manager", "admin"].includes(account.role)) {
      return res.status(403).json({ error: "Manager or administrator privileges are required." });
    }

    req.user = account;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }
    return next(error);
  }
}

module.exports = authManager;
