/**
 * Role-based authorization middleware factory.
 * Verifies that the authenticated user's role matches one of the allowed roles.
 *
 * Example usage:
 *   router.get("/admin-only", authenticate, authorizeRoles("admin"), handler);
 *   router.get("/staff-only", authenticate, authorizeRoles("manager", "admin"), handler);
 */
function authorizeRoles(...allowedRoles) {
  const normalized = allowedRoles.flat().map((r) => String(r).toLowerCase());

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required before role verification." });
    }

    const userRole = (req.user.role || "").toLowerCase();
    if (!normalized.includes(userRole)) {
      return res.status(403).json({
        error: `Access denied. Privileges required: ${allowedRoles.join(" or ")}.`,
      });
    }

    return next();
  };
}

module.exports = authorizeRoles;

