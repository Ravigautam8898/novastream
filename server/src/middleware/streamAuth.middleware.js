// server/src/middleware/streamAuth.middleware.js
// Stream Authentication Middleware
// Validates signed stream tokens from query parameter (stream URL)
// or Authorization header (token generation endpoint)
//
// Token sources (checked in order):
//   1. ?token= query param (legacy/initial playlist requests)
//   2. stream_token cookie (same-origin segment requests via HLS.js)
//
// Token revocation:
//   - Tokens include a tkv (tokenVersion) claim matching the user's
//     streamTokenVersion in the User model
//   - When a user logs out or resets their password, the version is
//     incremented, invalidating all existing stream tokens
//   - Version is checked against an in-memory Map with TTL to avoid
//     a User lookup on every segment request
//
// Two modes:
//   1. requireStreamToken — Blocks if no valid token (for HLS endpoints)
//   2. authenticateStream — Stream rate limiter + token auth combined

const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { validateStreamToken, checkTokenVersion } = require('../services/stream.service');
const { streamLimiter } = require('./rateLimiter.middleware');

/**
 * Parse cookies from the Cookie header.
 * Simple parser — no dependency on cookie-parser.
 */
function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.substring(0, idx).trim();
    const value = part.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

/**
 * Extract a stream token from the request.
 * Checks: query param → cookie
 */
function extractToken(req) {
  // 1. Query parameter (used for initial playlist requests)
  if (req.query.token) {
    return req.query.token;
  }

  // 2. Cookie (used for subsequent segment requests by HLS.js)
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.stream_token) {
    return cookies.stream_token;
  }

  return null;
}

/**
 * Middleware that requires a valid stream token.
 * Extracts token from ?token= query parameter or stream_token cookie.
 * Validates the token and attaches decoded payload to req.streamToken.
 *
 * Usage: router.get('/segments/:segment', requireStreamToken, handler)
 */
async function requireStreamToken(req, res, next) {
  try {
    // Extract token from query parameter or cookie
    const token = extractToken(req);

    if (!token) {
      throw ApiError.unauthorized('Stream token is required.');
    }

    // Validate the token — extract client IP for IP-bound tokens
    const clientIp = req.ip || req.connection.remoteAddress;
    const decoded = validateStreamToken(token, { ip: clientIp });

    // Check token version for revocation (tkv claim) — ST-006 + SC-003
    // SC-003: Now uses direct MongoDB lookup (indexed on _id, <1ms)
    if (decoded.uid && decoded.tkv !== undefined) {
      if (!(await checkTokenVersion(decoded.uid, decoded.tkv))) {
        throw ApiError.unauthorized('Stream token has been revoked. Please obtain a new one.');
      }
    }

    // Attach decoded token to request for downstream use
    req.streamToken = decoded;

    next();
  } catch (err) {
    if (err instanceof ApiError) {
      const log = logger.api(req);
      log.warn({ err, ip: req.ip, url: req.originalUrl }, 'Stream auth failed');
      return next(err);
    }
    next(err);
  }
}

/**
 * Combined middleware: stream rate limiter + token auth
 * Applies both the stream rate limit and token validation.
 */
const authenticateStream = [streamLimiter, requireStreamToken];

module.exports = {
  requireStreamToken,
  authenticateStream,
};
