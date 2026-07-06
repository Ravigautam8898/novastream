// server/src/middleware/sanitize.middleware.js
// Input Sanitization Middleware
// - express-mongo-sanitize: Strips $ and . from req.body, req.query, req.params to prevent NoSQL injection
// - hpp: HTTP Parameter Pollution protection — rejects duplicate query parameters
//
// IMPORTANT: This middleware should be placed BEFORE body-parser and route handlers
// so that sanitized data flows through the rest of the pipeline.

const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const logger = require('../config/logger');

/**
 * NoSQL Injection Prevention
 * Strips keys containing $ or . from input objects
 */
const noSqlSanitizer = mongoSanitize({
  replaceWith: '_',          // Replace $ and . with _ instead of stripping
  allowDots: false,          // Don't allow dots in keys
  onSanitize: ({ req, key }) => {
    logger.warn({ ip: req.ip, key }, 'NoSQL injection attempt detected and sanitized');
  },
});

/**
 * HTTP Parameter Pollution Protection
 * Rejects requests with duplicate query parameters
 * Whitelist known safe parameters that can appear multiple times (e.g., 'ids')
 */
const hppProtection = hpp({
  whitelist: [
    // Allow these params to appear multiple times if needed
    'ids',
    'genres',
    'categories',
  ],
});

/**
 * Combined sanitization middleware
 * Runs NoSQL sanitization first, then HPP protection
 */
function sanitizeInput(req, res, next) {
  // Step 1: Sanitize body, query, and params against NoSQL injection
  noSqlSanitizer(req, res, (err) => {
    if (err) return next(err);

    // Step 2: Protect against HTTP Parameter Pollution
    hppProtection(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  });
}

module.exports = { sanitizeInput, noSqlSanitizer, hppProtection };
