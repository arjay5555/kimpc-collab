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
    return res.status(401).json({ error: "Authentication required. Missing Bearer token." });
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
        "_id email fullName role isSuspended isArchived cooperativeId suspensionReason memberSettings tokenVersion"
      );
    }
    if (!account && payload.email) {
      account = await Account.findOne({ email: String(payload.email).trim().toLowerCase() }).select(
        "_id email fullName role isSuspended isArchived cooperativeId suspensionReason memberSettings tokenVersion"
      );
    }

    if (!account) {
      return res.status(401).json({ error: "Account not found. Please sign in again." });
    }

    if (account.isSuspended) {
      return res.status(403).json({ error: "Your account has been suspended.", reason: account.suspensionReason });
    }

    if (account.isArchived) {
      return res.status(403).json({ error: "Your account is archived. Contact administrator." });
    }

    if (
      typeof payload.tokenVersion === "number" &&
      typeof account.tokenVersion === "number" &&
      payload.tokenVersion !== account.tokenVersion
    ) {
      return res.status(401).json({ error: "Your session has expired due to a security update. Please sign in again." });
    }

    req.user = account;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired authentication token. Please sign in again." });
    }
    return next(error);
  }
}

module.exports = authenticate;
