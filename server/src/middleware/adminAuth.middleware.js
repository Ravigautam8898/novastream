// server/src/middleware/adminAuth.middleware.js
// Admin Authorization Middleware
// Checks that the authenticated user has admin/manager role
// Must be used AFTER the authenticate middleware
//
// Supports legacy roles (admin, user) for backward compatibility during migration.
//   admin → super_admin (mapped by normalizeRole)
//   user  → member (mapped by normalizeRole)

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { ROLES, isAdminRole, normalizeRole } = require('../config/roles');

/**
 * Require admin-level role for the route
 * Accepts both super_admin and manager roles (bypass subscription checks).
 * Usage: router.delete('/users/:id', authenticate, adminOnly, handler)
 */
function adminOnly(req, res, next) {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    if (!isAdminRole(req.user.role)) {
      const log = logger.api(req);
      log.warn(        { userId: req.user._id, username: req.user.username, role: req.user.role },
          'Admin access denied'
      );
      throw ApiError.forbidden('Admin access required');
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require specific role(s) for the route
 * Supports legacy role names (admin → super_admin, user → member) via normalizeRole.
 * Usage: router.get('/managers', authenticate, requireRole(ROLES.SUPER_ADMIN), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      // Normalize the user's role for comparison (handles legacy admin/user roles)
      const userRole = normalizeRole(req.user.role);

      // Also normalize the allowed roles for comparison
      const normalizedAllowed = roles.map(r => normalizeRole(r));

      if (!normalizedAllowed.includes(userRole)) {
        const log = logger.api(req);
        log.warn(
          { userId: req.user._id, role: req.user.role, requiredRoles: roles },
          'Role-based access denied'
        );
        throw ApiError.forbidden(`Access requires one of: ${roles.join(', ')}`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Require Super Admin role specifically
 * Gateway for Super Admin-only operations (e.g., ownership transfer, settings management).
 * Usage: router.post('/lifetime', authenticate, requireSuperAdmin, handler)
 */
function requireSuperAdmin(req, res, next) {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const userRole = normalizeRole(req.user.role);

    if (userRole !== ROLES.SUPER_ADMIN) {
      const log = logger.api(req);
      log.warn(        { userId: req.user._id, role: req.user.role },
          'Super Admin access denied'
      );
      throw ApiError.forbidden('Super Admin access required');
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { adminOnly, requireRole, requireSuperAdmin };
