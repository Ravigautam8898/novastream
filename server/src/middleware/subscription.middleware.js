// server/src/middleware/subscription.middleware.js
// Subscription Enforcement Middleware
//
// Protects resources using SubscriptionService.canAccess().
// MUST be used AFTER the authenticate middleware (req.user must be set).
//
// Middleware order in route chain:
//   authenticate → adminOnly/requireRole → subscription middleware → handler
//
// Key design rules:
// - All subscription decisions come from SubscriptionService — no duplicate logic
// - Super Admin and Manager always bypass subscription checks
// - Standard ApiError errors with application error codes
// - Subscriptions are embedded in User model (no separate query needed)
//
// Error codes:
//   ACC_001 — Account is disabled/deactivated
//   SUB_001 — No subscription or expired
//   SUB_002 — Subscription is suspended
//   SUB_003 — Subscription is disabled
//   SUB_004 — Subscription not yet active (future activation)

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { requiresSubscription } = require('../config/roles');
const SubscriptionService = require('../services/subscription.service');

/**
 * Require an active subscription for the current user.
 * Super Admin and Manager bypass this check.
 * Uses SubscriptionService.canAccess() — no duplicate business logic.
 *
 * Usage: router.get('/premium', authenticate, requireActiveSubscription, handler)
 *
 * Attaches to req:
 *   req.subscriptionVersion — Version number for stream token validation
 */
async function requireActiveSubscription(req, res, next) {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const userId = req.user._id;

    // Role bypass: SA and Manager never require subscription
    if (!requiresSubscription(req.user.role)) {
      // Still attach subscriptionVersion if they have one
      try {
        const status = await SubscriptionService.getStatus(userId);
        req.subscriptionVersion = status.version;
      } catch {
        req.subscriptionVersion = null;
      }
      return next();
    }

    const { allowed, reason, subscriptionVersion } =
      await SubscriptionService.canAccess(userId);

    if (!allowed) {
      // Map reason to error code and HTTP status
      const { code, statusCode } = _mapReasonToError(reason);
      const log = logger.api(req);
      log.warn(
        { userId, username: req.user.username, reason, code },
        'Subscription access denied'
      );

      // Create a structured error with the application error code
      const err = ApiError.forbidden(reason);
      err.code = code;
      err.details = { reason, subscriptionVersion };
      return next(err);
    }

    // Attach subscription version for downstream use (stream token generation)
    req.subscriptionVersion = subscriptionVersion;

    next();
  } catch (err) {
    if (err instanceof ApiError) {
      return next(err);
    }
    next(err);
  }
}

/**
 * Require that a subscription exists for the current user (regardless of status).
 * Super Admin and Manager bypass this check.
 * Does NOT validate expiry, suspension, or activation date.
 *
 * Useful for endpoints that need to know if a subscription exists
 * without checking if it's currently active (e.g., renewal history).
 *
 * Attaches to req:
 *   req.subscriptionStatus — Full subscription status object
 */
async function requireSubscription(req, res, next) {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const userId = req.user._id;

    // Role bypass
    if (!requiresSubscription(req.user.role)) {
      req.subscriptionStatus = null;
      return next();
    }

    const status = await SubscriptionService.getStatus(userId);

    if (!status.exists) {
      const log = logger.api(req);
      log.warn(
        { userId, username: req.user.username },
        'No subscription found'
      );
      const err = ApiError.forbidden('No subscription assigned');
      err.code = 'SUB_001';
      return next(err);
    }

    req.subscriptionStatus = status;

    next();
  } catch (err) {
    if (err instanceof ApiError) {
      return next(err);
    }
    next(err);
  }
}

/**
 * Require that the user's account is active.
 * Checks accountStatus and isActive fields.
 * This middleware runs for ALL roles (SA, Manager, Member).
 *
 * Usage: router.get('/profile', authenticate, requireAccountActive, handler)
 */
async function requireAccountActive(req, res, next) {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    // Fetch current account status from DB (it may have changed since JWT was issued)
    const User = require('../models/User.model');
    const user = await User.findById(req.user._id)
      .select('accountStatus isActive')
      .lean();

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    if (user.accountStatus === 'soft_deleted') {
      const err = ApiError.forbidden('Account has been deleted');
      err.code = 'ACC_001';
      return next(err);
    }

    if (user.accountStatus === 'archived') {
      const err = ApiError.forbidden('Account has been archived');
      err.code = 'ACC_001';
      return next(err);
    }

    if (user.accountStatus === 'disabled') {
      const err = ApiError.forbidden('Account has been disabled');
      err.code = 'ACC_001';
      return next(err);
    }

    if (!user.isActive) {
      const err = ApiError.forbidden('Account is deactivated');
      err.code = 'ACC_001';
      return next(err);
    }

    next();
  } catch (err) {
    if (err instanceof ApiError) {
      return next(err);
    }
    next(err);
  }
}

/**
 * Attach subscription status to the request without blocking.
 * Useful for routes that need subscription info but should work
 * for users without a subscription (e.g., profile page, settings).
 *
 * Attaches to req:
 *   req.subscription — Full subscription status object (null if none)
 *   req.subscriptionVersion — Current version number
 */
async function checkSubscription(req, res, next) {
  try {
    if (!req.user) {
      req.subscription = null;
      req.subscriptionVersion = null;
      return next();
    }

    const userId = req.user._id;

    // Role bypass: SA and Manager get null (no subscription needed)
    if (!requiresSubscription(req.user.role)) {
      req.subscription = null;
      req.subscriptionVersion = null;
      return next();
    }

    try {
      const status = await SubscriptionService.getStatus(userId);
      req.subscription = status;
      req.subscriptionVersion = status.version;
    } catch {
      // Silently handle — subscription data is optional for this middleware
      req.subscription = null;
      req.subscriptionVersion = null;
    }

    next();
  } catch {
    // Never block — this middleware is informational only
    req.subscription = null;
    req.subscriptionVersion = null;
    next();
  }
}

// ═══════════════════════════════════════════════════════
//  Internal Helpers
// ═══════════════════════════════════════════════════════

/**
 * Map a SubscriptionService.canAccess() reason to an application error code.
 * @param {string} reason - Reason string from canAccess()
 * @returns {{ code: string, statusCode: number }}
 * @private
 */
function _mapReasonToError(reason) {
  if (!reason) {
    return { code: 'SUB_001', statusCode: 403 };
  }

  const lower = reason.toLowerCase();

  if (lower.includes('suspended')) {
    return { code: 'SUB_002', statusCode: 403 };
  }
  if (lower.includes('disabled') || lower.includes('deactivated')) {
    return { code: 'SUB_003', statusCode: 403 };
  }
  if (lower.includes('expired')) {
    return { code: 'SUB_001', statusCode: 403 };
  }
  if (lower.includes('no subscription') || lower.includes('not found')) {
    return { code: 'SUB_001', statusCode: 403 };
  }
  if (lower.includes('not yet active') || lower.includes('starts in')) {
    return { code: 'SUB_004', statusCode: 403 };
  }

  // Default: expired
  return { code: 'SUB_001', statusCode: 403 };
}

module.exports = {
  requireActiveSubscription,
  requireSubscription,
  requireAccountActive,
  checkSubscription,
};
