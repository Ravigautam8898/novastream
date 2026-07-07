// server/src/middleware/errorHandler.middleware.js
// ✅ Global error handler middleware
// - Operational errors (known): returned to client with status code, logged as clean WARN with no stack
// - Programmer errors (bugs): returned generically to client, logged with full stack in dev
//
// Logging policy:
//   4xx (operational):  WARN level, no stack trace — { event, statusCode, message }
//   5xx (programmer):   ERROR level, full stack in dev, message-only in production
//   Mongoose DB errors: WARN level with structured message, no stack
//   DEBUG=true env:     Stack traces on all errors for deep debugging

const logger = require('../config/logger');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// Debug mode — enables stack traces on operational errors for deep debugging
const DEBUG_ENABLED = process.env.DEBUG === 'true';

/**
 * Log an operational error (4xx) — clean WARN with no stack trace.
 * Stack traces are suppressed unless DEBUG=true is set.
 */
function logOperational(req, statusCode, message) {
  const log = logger.api(req);
  log.warn({
    event: 'request_failed',
    statusCode,
    message,
  }, `${statusCode} ${message}`);
}

/**
 * Log an unexpected error (5xx) — ERROR level with stack trace in dev/DEBUG.
 */
function logUnexpected(req, err, statusCode = 500) {
  const log = logger.api(req);

  // Full error log (includes stack via pino's err serializer)
  log.error({ err, statusCode }, 'Unhandled error');
}

function errorHandler(err, req, res, _next) {
  // ── Zod Validation Errors ──
  if (err.name === 'ZodError') {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    logOperational(req, 400, `Validation failed: ${details.map(d => d.field).join(', ')}`);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Mongoose Validation Errors ──
  if (err.name === 'ValidationError') {
    const details = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    logOperational(req, 400, 'Mongoose validation failed');
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      details,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Mongoose Duplicate Key ──
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    logOperational(req, 409, `Duplicate value for ${field}`);
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Mongoose CastError (invalid ObjectId, etc.) ──
  if (err.name === 'CastError') {
    logOperational(req, 400, `Invalid ${err.path}: ${err.value}`);
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── MongoDB Connection Errors (runtime) ──
  if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError' || err.name === 'MongooseError') {
    logOperational(req, 503, 'Database unavailable');
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable',
      timestamp: new Date().toISOString(),
    });
  }

  // ── JSON Parse Error ──
  if (err.type === 'entity.parse.failed') {
    logOperational(req, 400, 'Invalid JSON in request body');
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      timestamp: new Date().toISOString(),
    });
  }

  // ── Multer Errors (file upload) ──
  if (err.name === 'MulterError') {
    logOperational(req, 400, err.message);
    return res.status(400).json({
      success: false,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Our Custom ApiError ──
  if (err instanceof ApiError) {
    // Operational errors (4xx): log as clean WARN, no stack trace
    if (err.statusCode < 500) {
      logOperational(req, err.statusCode, err.message);
    } else {
      // 5xx ApiError (e.g. serviceUnavailable): log with details
      logUnexpected(req, err, err.statusCode);
    }

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details || null,
      ...(err.data !== undefined ? { data: err.data } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  // ── Unknown / Programmer Errors ──
  logUnexpected(req, err, 500);

  if (config.server.isDevelopment || DEBUG_ENABLED) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Something went wrong',
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;
