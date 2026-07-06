// server/src/utils/ApiError.js
// ✅ Custom error classes with HTTP status codes
// - isOperational = true: known errors (safe to show to client)
// - isOperational = false: programmer bugs (hidden in production)

class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    this.name = 'ApiError';

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  // ── 4xx Client Errors ──

  static badRequest(message = 'Bad request', details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Access denied') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  static unprocessable(message = 'Unprocessable entity', details = null) {
    return new ApiError(422, message, details);
  }

  static tooMany(message = 'Too many requests, please try again later') {
    return new ApiError(429, message);
  }

  static unsupportedMediaType(message = 'Unsupported Media Type') {
    return new ApiError(415, message);
  }

  // ── 5xx Server Errors ──

  static internal(message = 'Internal server error') {
    const err = new ApiError(500, message);
    err.isOperational = false; // Programmer error, hide details in production
    return err;
  }

  static notImplemented(message = 'Not implemented') {
    const err = new ApiError(501, message);
    err.isOperational = false;
    return err;
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new ApiError(503, message);
  }
}

module.exports = ApiError;
