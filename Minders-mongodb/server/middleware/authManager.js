const authenticate = require("./authenticate");
const authorizeRoles = require("./authorizeRoles");

/**
 * Legacy authManager middleware.
 * Combines JWT authentication and verifies 'manager' or 'admin' roles.
 * Retained for backward-compatibility across existing manager routes.
 */
async function authManager(req, res, next) {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    authorizeRoles("manager", "admin")(req, res, next);
  });
}

module.exports = authManager;
