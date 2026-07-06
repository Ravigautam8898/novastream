// server/src/middleware/ipBlocker.middleware.js
// IP Reputation & Blocking Middleware
// Checks incoming IP against the BlockedIP database
// Auto-blocks IPs that exceed failed attempt thresholds

const BlockedIP = require('../models/BlockedIP.model');
const config = require('../config/env');
const logger = require('../config/logger');

/**
 * IP Blocker Middleware
 * Checks if the requesting IP is in the blocked list
 * Blocks access if the IP has an active block (not expired)
 *
 * Usage: app.use(ipBlocker);  // Global
 *        router.use('/api', ipBlocker);  // Route-level
 */
async function ipBlocker(req, res, next) {
  try {
    const ip = req.ip || req.connection.remoteAddress;

    // Skip check for internal/local IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      return next();
    }

    // Check if IP is blocked
    const blocked = await BlockedIP.findOne({
      ip,
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    if (blocked) {
      const log = logger.api(req);
      log.warn(
        { ip, reason: blocked.reason, blockedBy: blocked.blockedBy },
        'Request from blocked IP'
      );

      return res.status(403).json({
        success: false,
        message: 'Access denied',
        reason: blocked.reason,
        expiresAt: blocked.expiresAt ? blocked.expiresAt.toISOString() : null,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  } catch (err) {
    // If database check fails, allow the request through (fail open)
    logger.error({ err }, 'IP blocker check failed — allowing request');
    next();
  }
}

/**
 * Auto-block an IP address after too many failed attempts
 * Called by auth controller when login fails
 *
 * @param {string} ip - The IP to block
 * @param {string} reason - The reason code
 * @param {number} durationHours - Block duration (default 24h)
 */
async function autoBlockIP(ip, reason = 'bruteforce', durationHours = 24) {
  try {
    // Don't auto-block local IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    // Use upsert to increment existing block or create new one
    const result = await BlockedIP.findOneAndUpdate(
      {
        ip,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      },
      {
        $inc: { attemptCount: 1 },
        $setOnInsert: {
          ip,
          reason,
          blockedBy: 'system',
          blockedAt: now,
          expiresAt,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );

    // If threshold exceeded, ensure block is active
    if (result && result.attemptCount >= 10) {
      logger.warn({ ip, attemptCount: result.attemptCount }, 'Auto-blocked IP after repeated violations');
    }
  } catch (err) {
    logger.error({ err, ip }, 'Failed to auto-block IP');
  }
}

module.exports = { ipBlocker, autoBlockIP };
