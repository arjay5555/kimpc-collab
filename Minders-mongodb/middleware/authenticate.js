const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Account = require("../models/Account");

const JWT_SECRET = process.env.JWT_SECRET || "minders-secret-jwt-key-cooperative-2026";

/**
 * Middleware to authenticate requests via Bearer JWT token.
 * Populates req.user with the authenticated Mongoose account document.
 */
async function authenticate(req, res, next) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const token = authorization.slice("Bearer ".length).trim();
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.id && !payload.email) {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }

    let account = null;
    if (payload.id && mongoose.Types.ObjectId.isValid(payload.id)) {
      account = await Account.findById(payload.id).select(
        "_id email fullName role isSuspended isArchived cooperativeId suspensionReason memberSettings"
      );
    }
    if (!account && payload.email) {
      account = await Account.findOne({ email: String(payload.email).trim().toLowerCase() }).select(
        "_id email fullName role isSuspended isArchived cooperativeId suspensionReason memberSettings"
      );
    }

    if (!account || account.isSuspended || account.isArchived) {
      return res.status(401).json({ error: "This account is unavailable. Please sign in again." });
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

module.exports = authenticate;
