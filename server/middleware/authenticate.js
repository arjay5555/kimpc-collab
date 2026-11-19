const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Account = require("../models/Account");

const JWT_SECRET = require("../config/jwtSecret");
const { resolveCoverAccess } = require("../config/managerCoverAccess");

/**
 * Middleware to authenticate requests via Bearer JWT token.
 * Populates req.user with the authenticated Mongoose account document.
 */
async function authenticate(req, res, next) {
  let token = "";
  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Bearer ")) {
    token = authorization.slice("Bearer ".length).trim();
  }

  if (!token) {
    return res.status(401).json({ error: "Authentication required. Missing Bearer token." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.id && !payload.email) {
      return res.status(401).json({ error: "Invalid or expired authentication token." });
    }

    let account = null;
    if (payload.id && mongoose.Types.ObjectId.isValid(payload.id)) {
      account = await Account.findById(payload.id).select(
        "_id email fullName role isSuspended isArchived cooperativeId suspensionReason memberSettings tokenVersion managerCover"
      );
    }
    if (!account && payload.email) {
      account = await Account.findOne({ email: String(payload.email).trim().toLowerCase() }).select(
        "_id email fullName role isSuspended isArchived cooperativeId suspensionReason memberSettings tokenVersion managerCover"
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

    if ((Number(payload.tokenVersion) || 0) !== (Number(account.tokenVersion) || 0)) {
      return res.status(401).json({ error: "Your session has expired due to a security update. Please sign in again." });
    }

    // Manager cover granted, changed, revoked or expired since sign-in: force a fresh login so the portal matches.
    const covering = Account.hasActiveManagerCover(account);
    const coverAt = covering ? new Date(account.managerCover.assignedAt).getTime() || 0 : undefined;
    if ((payload.role && payload.role !== Account.effectiveRole(account)) || (covering && Number(payload.coverAt) !== coverAt)) {
      return res.status(401).json({ error: "Your access level has changed. Please sign in again." });
    }
    if (covering) {
      const path = req.originalUrl.split("?")[0].replace(/^\/api(?=\/)/, "");
      const access = resolveCoverAccess(account.managerCover.permissions, req.method, path);
      if (access.deny) return res.status(403).json({ error: access.deny });
      if (access.role) {
        account.role = access.role;
        account.unmarkModified("role"); // in-memory only; a later req.user.save() must not persist it
      }
    }

    req.user = account;
    req.auth = {
      isImpersonated: Boolean(payload.isImpersonated),
      impersonatedBy: payload.impersonatedBy || "",
    };
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired authentication token. Please sign in again." });
    }
    return next(error);
  }
}

module.exports = authenticate;
