// server/src/middleware/auth.middleware.js
// JWT Authentication Middleware
// Verifies Bearer token from Authorization header
// On success: attaches user data to req.user
// On failure: passes ApiError.unauthorized to error handler

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const Session = require('../models/Session.model');
const ApiError = require('../utils/ApiError');

/**
 * Authenticate request using JWT Bearer token
 * Usage: router.get('/protected', authenticate, handler)
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check if Authorization header exists
    if (!authHeader) {
      throw ApiError.unauthorized('No authorization token provided');
    }

    // Check format: "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw ApiError.unauthorized('Invalid authorization format. Use: Bearer <token>');
    }

    const token = parts[1];

    // Verify JWT signature and decode
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Token has expired. Please login again.');
      }
      if (err.name === 'JsonWebTokenError') {
        throw ApiError.unauthorized('Invalid token.');
      }
      throw ApiError.unauthorized('Token verification failed.');
    }

    // Verify session is still active in database
    const session = await Session.findValidSession(token);
    if (!session) {
      throw ApiError.unauthorized('Session has been invalidated. Please login again.');
    }

    // Attach user info to request
    // _id is the canonical user identifier (MongoDB ObjectId).
    // Role is normalized here for backward compatibility:
    //   legacy 'admin' → 'super_admin'
    //   legacy 'user'  → 'member'
    // This ensures all downstream middleware/handlers see the new role names.
    const { normalizeRole } = require('../config/roles');
    req.user = {
      _id: decoded.userId,
      username: decoded.username,
      role: normalizeRole(decoded.role),
    };

    // Attach token for logout/refresh
    req.token = token;

    next();
  } catch (err) {
    if (err instanceof ApiError) {
      const log = logger.api(req);
      log.warn({ err, ip: req.ip }, 'Authentication failed');
      return next(err);
    }
    next(err);
  }
}

/**
 * Optional auth middleware — attaches user if token present, but doesn't block
 * Useful for endpoints that work for both authenticated and anonymous users
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return next();

    const token = parts[1];
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

    const session = await Session.findValidSession(token);
    if (session) {
      const { normalizeRole } = require('../config/roles');
      req.user = {
        _id: decoded.userId,
        username: decoded.username,
        role: normalizeRole(decoded.role),
      };
      req.token = token;
    }
  } catch {
    // Silently ignore auth errors for optional auth
  }
  next();
}

module.exports = { authenticate, optionalAuth };
