// server/src/middleware/errorHandler.middleware.js
// ✅ Global error handler middleware
// - Operational errors (known): returned to client with status code
// - Programmer errors (bugs): hidden in production, shown in dev

const logger = require('../config/logger');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

function errorHandler(err, req, res, _next) {
  // Get contextual logger
  const log = logger.api(req);

  // ── Zod Validation Errors ──
  if (err.name === 'ZodError') {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
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
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Mongoose CastError (invalid ObjectId, etc.) ──
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── JSON Parse Error ──
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      timestamp: new Date().toISOString(),
    });
  }

  // ── Multer Errors (file upload) ──
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Our Custom ApiError ──
  if (err instanceof ApiError) {
    log.warn({ err, statusCode: err.statusCode }, err.message);

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details || null,
      ...(err.data !== undefined ? { data: err.data } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  // ── Unknown / Programmer Errors ──
  log.error({ err, statusCode: 500 }, 'Unhandled error');

  if (config.server.isDevelopment) {
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
