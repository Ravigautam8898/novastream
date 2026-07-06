// server/src/controllers/auth.controller.js
// Authentication HTTP handlers — thin layer over AuthService

const AuthService = require('../services/auth.service');
const ApiResponse = require('../utils/ApiResponse');
const { autoBlockIP } = require('../middleware/ipBlocker.middleware');

/**
 * POST /api/auth/login
 * Authenticate user with username + password
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.validatedBody || req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = await AuthService.login(username, password, ip, userAgent);

    ApiResponse.success(res, result, 'Login successful');
  } catch (err) {
    // Auto-block on repeated failures (handled by rate limiter + IP blocker)
    if (err.statusCode === 401) {
      const ip = req.ip || req.connection.remoteAddress;
      // Fire-and-forget: log failed attempt for potential auto-block
      autoBlockIP(ip, 'bruteforce').catch(() => {});
    }
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Invalidate current session
 */
async function logout(req, res, next) {
  try {
    const token = req.token || (req.headers.authorization || '').replace('Bearer ', '');
    const result = await AuthService.logout(token);

    ApiResponse.success(res, null, result.message);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/verify
 * Verify current token and return user data
 */
async function verify(req, res, next) {
  try {
    const token = req.token || (req.headers.authorization || '').replace('Bearer ', '');
    const result = await AuthService.verifyToken(token);

    ApiResponse.success(res, result, 'Token is valid');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Refresh expired token
 */
async function refresh(req, res, next) {
  try {
    const token = req.token || (req.headers.authorization || '').replace('Bearer ', '');
    const result = await AuthService.refreshToken(token);

    ApiResponse.success(res, result, 'Token refreshed');
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, verify, refresh };
