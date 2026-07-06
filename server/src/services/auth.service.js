// server/src/services/auth.service.js
// Authentication business logic — login, logout, verify, refresh

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/env');
const logger = require('../config/logger');
const User = require('../models/User.model');
const Session = require('../models/Session.model');
const BlockedIP = require('../models/BlockedIP.model');
const { incrementStreamTokenVersion } = require('./stream.service');
const ApiError = require('../utils/ApiError');

// ── Account Lockout State ──
// MongoDB-backed tracking of failed login attempts per username.
// Cross-worker safe — uses atomic findOneAndUpdate on an ephemeral _loginLocks collection.
// Prevents brute-force attacks that rotate IPs to bypass per-IP rate limiting.
// Lockout duration: 15 minutes. Threshold: 5 failed attempts.
// State clears on successful login or automatic TTL expiry (1 hour).
//
// Design (SC-001):
// - Separate _loginLocks collection (NOT on User model — avoids write contention)
// - Atomic $inc for cross-PM2-worker safety
// - TTL index for auto-cleanup (safety net beyond lockout window)
// - lockedAt guard prevents double-lock races

const mongoose = require('mongoose');
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Lazily initialized MongoDB _loginLocks collection reference
let _loginLocksCollection = null;
function loginLocks() {
  if (!_loginLocksCollection) {
    _loginLocksCollection = mongoose.connection.db.collection('_loginLocks');
    // Create TTL index for automatic cleanup (1 hour — covers lockout window + grace)
    _loginLocksCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 3600 }
    ).catch(() => {}); // Fail silently — index is a safety net, lock logic works without it
  }
  return _loginLocksCollection;
}

/**
 * Check if an account is currently locked due to too many failed attempts.
 * Cross-worker safe — reads from shared MongoDB collection.
 */
async function isAccountLocked(username) {
  const doc = await loginLocks().findOne({ _id: username });
  if (!doc || !doc.lockedAt) return false;

  // Check if lockout has expired
  if (Date.now() - doc.lockedAt.getTime() > LOCKOUT_WINDOW_MS) {
    // Atomic clear: only delete if lock hasn't been refreshed (guards against race)
    await loginLocks().deleteOne({ _id: username, lockedAt: doc.lockedAt });
    return false;
  }

  return true;
}

/**
 * Record a failed login attempt for an account.
 * Locks the account if threshold is exceeded.
 * Atomic — safe across multiple PM2 workers.
 */
async function recordFailedAttempt(username) {
  // Atomically increment attempt counter
  const after = await loginLocks().findOneAndUpdate(
    { _id: username },
    {
      $inc: { attempts: 1 },
      $setOnInsert: { lockedAt: null, createdAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' }
  );

  if (after.attempts >= LOCKOUT_THRESHOLD) {
    // Set lock — the lockedAt: null guard prevents races:
    // if two workers cross threshold simultaneously, only one sets lockedAt
    await loginLocks().updateOne(
      { _id: username, lockedAt: null },
      { $set: { lockedAt: new Date() } }
    );
    logger.warn({ username, attempts: after.attempts }, 'Account locked due to too many failed login attempts');
    return true; // Account now locked
  }

  return false;
}

/**
 * Clear failed attempt state on successful login.
 */
async function clearFailedAttempts(username) {
  await loginLocks().deleteOne({ _id: username });
}

class AuthService {
  /**
   * Authenticate a user with username + password
   * Returns JWT token and user data (without passwordHash)
   */
  static async login(username, password, ip, userAgent) {
    logger.info({ username, ip }, 'Login attempt');

    // Check if IP is blocked
    const isBlocked = await BlockedIP.isBlocked(ip);
    if (isBlocked) {
      logger.warn({ ip, username }, 'Login from blocked IP');
      throw ApiError.forbidden('Access denied. Your IP has been blocked.');
    }

    // Check if account is locked (per-user brute force protection)
    if (await isAccountLocked(username)) {
      logger.warn({ username, ip }, 'Login from locked account');
      throw ApiError.tooMany('Account temporarily locked due to too many failed attempts. Try again later.');
    }

    // Find user — select only fields needed for auth (exclude heavy embedded watch data)
    const user = await User.findOne({ username: username.toLowerCase().trim() })
      .select('-watchHistory -watchlist -__v');
    if (!user) {
      logger.warn({ username, ip }, 'Login failed: user not found');
      throw ApiError.unauthorized('Invalid username or password');
    }

    // Check if user is active
    if (!user.isActive) {
      logger.warn({ username, ip }, 'Login failed: user deactivated');
      throw ApiError.forbidden('Account has been deactivated. Contact your administrator.');
    }

    // Verify password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      logger.warn({ username, ip }, 'Login failed: wrong password');
      // Track failed attempt per-account (prevents IP-rotation attacks)
      await recordFailedAttempt(username);
      // Auto-block after too many failed attempts (handled by rate limiter middleware)
      throw ApiError.unauthorized('Invalid username or password');
    }

    // Generate JWT
    const tokenPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const token = jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    // Store session in DB
    const session = await Session.createSession(
      user._id,
      token,
      ip,
      userAgent
    );

    // Clear any account lockout state on successful login
    await clearFailedAttempts(username);

    // Update user's last login info via model method
    user.recordLogin(ip, userAgent);
    await user.save();

    logger.info({ username, ip, userId: user._id }, 'Login successful');

    return {
      token,
      expiresIn: config.jwt.expiresIn,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        lastLoginAt: new Date().toISOString(),
        subscription: user.subscription?.status ? {
          status: user.subscription.status,
          plan: user.subscription.plan,
        } : null,
      },
    };
  }

  /**
   * Logout — invalidate the session
   */
  static async logout(token) {
    if (!token) {
      throw ApiError.badRequest('No token provided');
    }

    // Deactivate all sessions for this token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await Session.updateMany(
      { tokenHash, isActive: true },
      { $set: { isActive: false } }
    );

    // ST-006: Increment stream token version to revoke all existing stream tokens
    try {
      const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
      if (decoded.userId) {
        await incrementStreamTokenVersion(decoded.userId);
      }
    } catch {
      // Token may be expired or invalid — skip version increment
      logger.debug('Could not decode token for stream token version increment (may be expired)');
    }

    logger.info({ deactivated: result.modifiedCount }, 'Logout completed');
    return { message: 'Logged out successfully' };
  }

  /**
   * Verify a JWT token and return user data
   */
  static async verifyToken(token) {
    if (!token) {
      throw ApiError.unauthorized('No token provided');
    }

    // Decode and verify JWT signature
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

    // Check session is still active in DB
    const session = await Session.findValidSession(token);
    if (!session) {
      throw ApiError.unauthorized('Session has been invalidated. Please login again.');
    }

    // Get user data — exclude heavy embedded watch arrays
    const user = await User.findById(decoded.userId)
      .select('-passwordHash -loginHistory -watchHistory -watchlist -__v');
    if (!user) {
      throw ApiError.unauthorized('User not found.');
    }
    if (!user.isActive) {
      throw ApiError.forbidden('Account has been deactivated.');
    }

    return {
      valid: true,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        lastLoginAt: user.lastLoginAt,
        subscription: user.subscription?.status ? {
          status: user.subscription.status,
          plan: user.subscription.plan,
        } : null,
      },
    };
  }

  /**
   * Refresh token — invalidates old, issues new
   *
   * Security:
   * - Token must NOT be expired — prevents stolen expired token renewal
   * - Session must be active in DB — logout/revocation immediately blocks refresh
   * - Old session is deactivated, new session is created (token rotation)
   */
  static async refreshToken(token) {
    if (!token) {
      throw ApiError.unauthorized('No token provided');
    }

    // 1. Verify token — must be valid AND not expired
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

    // 2. Verify session is still active in database
    //    (logout, admin revocation, or previous refresh already deactivated it)
    const session = await Session.findValidSession(token);
    if (!session) {
      throw ApiError.unauthorized('Session has been invalidated. Please login again.');
    }

    // 3. Check user still exists and is active
    // Check user still exists and is active — exclude heavy embedded watch data
    const user = await User.findById(decoded.userId)
      .select('-watchHistory -watchlist -loginHistory -__v');
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User not found or deactivated');
    }

    // 4. Deactivate old session (token rotation)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await Session.updateMany({ tokenHash }, { $set: { isActive: false } });

    // 5. Issue new token with fresh expiry
    const tokenPayload = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    const newToken = jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    logger.info({ userId: user._id }, 'Token refreshed');

    return {
      token: newToken,
      expiresIn: config.jwt.expiresIn,
    };
  }
}

module.exports = AuthService;
