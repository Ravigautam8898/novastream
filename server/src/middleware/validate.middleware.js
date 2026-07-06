// server/src/middleware/validate.middleware.js
// ✅ Generic Zod validation middleware
// Wraps any Zod schema and validates req.body, req.query, req.params
// On success: sets req.validated with parsed data
// On failure: passes ApiError.badRequest to error handler

const ApiError = require('../utils/ApiError');

/**
 * Middleware factory that validates request against a Zod schema
 * The schema should define validation rules for body, query, and/or params
 *
 * Usage:
 *   router.post('/login', validate(loginSchema), authController.login);
 *   router.get('/search', validate(searchSchema), contentController.search);
 *
 * @param {z.ZodObject} schema - Zod schema with body/query/params keys
 * @returns {Function} Express middleware
 */
const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    // Store validated data for the controller
    req.validated = parsed;

    // Also store individual parts for convenience
    if (parsed.body) req.validatedBody = parsed.body;
    if (parsed.query) req.validatedQuery = parsed.query;
    if (parsed.params) req.validatedParams = parsed.params;

    next();
  } catch (err) {
    if (err.name === 'ZodError') {
      const details = err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    next(err);
  }
};

module.exports = validate;
