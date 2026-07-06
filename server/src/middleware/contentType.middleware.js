// server/src/middleware/contentType.middleware.js
// Content-Type Validation Middleware
// Ensures POST, PUT, and PATCH requests include the expected Content-Type header
// Prejects: MIME-type confusion attacks, unexpected content parsing

const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Allowed Content-Types for state-changing requests
 * application/json — for all JSON API requests
 * multipart/form-data — for future file upload routes
 * application/x-www-form-urlencoded — for form submissions
 */
const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'multipart/form-data',
  'application/x-www-form-urlencoded',
];

/**
 * Content-Type enforcement middleware
 * Only validates POST, PUT, PATCH, DELETE requests
 * Skips validation for GET, HEAD, OPTIONS
 */
function enforceContentType(req, res, next) {
  // Only validate state-changing methods
  const statefulMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!statefulMethods.includes(req.method)) {
    return next();
  }

  const contentType = req.headers['content-type'] || '';

  // Allow requests without Content-Type if body is empty
  if (!contentType && (!req.body || Object.keys(req.body).length === 0)) {
    return next();
  }

  // Check if content type matches allowed types
  const isAllowed = ALLOWED_CONTENT_TYPES.some((allowed) =>
    contentType.startsWith(allowed)
  );

  if (!isAllowed && contentType) {
    logger.warn({
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      contentType,
    }, 'Invalid Content-Type rejected');

    return next(ApiError.unsupportedMediaType('Unsupported Media Type. Use application/json.'));
  }

  next();
}

module.exports = { enforceContentType };
