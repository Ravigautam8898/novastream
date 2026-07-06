// server/src/middleware/rateLimiter.middleware.js
// Rate Limiting Middleware
// + General API: 100 req / 15 min
// + Auth:         5 req  / 1 min  (login attempts)
// + Stream:       30 req / 1 min  (stream URLs)
// + Slow down:    +500ms delay after 50 req / 15 min
//
// Cluster-mode ownership (SC-006):
// In PM2 cluster mode, express-rate-limit stores IP counters per-process.
// This means the Express limits here are NOT cluster-safe on their own.
// The AUTHORITATIVE cluster-wide rate enforcement happens at the Nginx
// reverse proxy layer (see docker/nginx.conf), which applies:
//   - General API:     30 req/s (zone=api)
//   - Auth endpoints:   5 req/m (zone=auth)
//   - Stream endpoints: 5 req/s (zone=stream)
//
// These Express rate limiters remain as DEFENSE-IN-DEPTH for:
//   - Single-process development mode (no Nginx)
//   - Situations where requests bypass Nginx (direct server access)
//   - Additional logging/visibility on abuse patterns
// Do NOT rely on these counters for cluster-wide enforcement.
// If Redis-backed shared rate limiting is needed later, replace express-rate-limit
// with rate-limit-redis or similar.

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const config = require('../config/env');

/**
 * General API rate limiter
 * 100 requests per 15 minute window per IP
 */
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,  // 15 minutes
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    timestamp: new Date().toISOString(),
  },
});

/**
 * Auth endpoint rate limiter (stricter)
 * 5 failed attempts per minute per IP
 * Only counts failed attempts (skipSuccessfulRequests)
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: config.rateLimit.authMax,  // 5
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,  // Only count failures
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 1 minute.',
    timestamp: new Date().toISOString(),
  },
});

/**
 * Stream endpoint rate limiter
 * 30 requests per minute per IP
 */
const streamLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: config.rateLimit.streamMax,  // 30
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Stream rate limit exceeded. Please slow down.',
    timestamp: new Date().toISOString(),
  },
});

/**
 * Admin panel rate limiter (more generous for testing/admin work)
 * 60 requests per minute per IP
 */
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,  // 60 req/min — generous for admin panel browsing
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
    timestamp: new Date().toISOString(),
  },
});

/**
 * Slow down repeated offenders
 * After 50 requests in 15 min window, add 500ms delay per request
 */
const generalSlowDown = slowDown({
  windowMs: config.rateLimit.windowMs,  // 15 minutes
  delayAfter: Math.floor(config.rateLimit.max / 2),  // Start slowing after 50
  delayMs: (hits) => hits * 500,  // Add 500ms per hit after threshold
  maxDelayMs: 10000,  // Max 10 second delay
});

module.exports = {
  generalLimiter,
  authLimiter,
  streamLimiter,
  adminLimiter,
  generalSlowDown,
};
