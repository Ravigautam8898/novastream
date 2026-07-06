// server/src/utils/__tests__/ApiError.test.js
// NovaStream — ApiError unit tests
// Tests for the custom error class with HTTP status codes

const ApiError = require('../ApiError');

describe('ApiError', () => {
  describe('constructor', () => {
    it('should create an error with status code and message', () => {
      const err = new ApiError(400, 'Bad request');

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Bad request');
      expect(err.isOperational).toBe(true);
      expect(err.name).toBe('ApiError');
    });

    it('should include optional details', () => {
      const details = { field: 'username', reason: 'too short' };
      const err = new ApiError(422, 'Validation failed', details);

      expect(err.details).toEqual(details);
    });

    it('should capture stack trace', () => {
      const err = new ApiError(500, 'Server error');

      expect(err.stack).toBeDefined();
    });
  });

  describe('4xx static factories', () => {
    test('badRequest() returns 400', () => {
      const err = ApiError.badRequest();
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Bad request');
      expect(err.isOperational).toBe(true);
    });

    test('badRequest() accepts custom message and details', () => {
      const err = ApiError.badRequest('Invalid input', { field: 'email' });
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Invalid input');
      expect(err.details).toEqual({ field: 'email' });
    });

    test('unauthorized() returns 401', () => {
      const err = ApiError.unauthorized();
      expect(err.statusCode).toBe(401);
    });

    test('forbidden() returns 403', () => {
      const err = ApiError.forbidden();
      expect(err.statusCode).toBe(403);
    });

    test('notFound() returns 404', () => {
      const err = ApiError.notFound('Movie not found');
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('Movie not found');
    });

    test('conflict() returns 409', () => {
      const err = ApiError.conflict();
      expect(err.statusCode).toBe(409);
    });

    test('unprocessable() returns 422 with details', () => {
      const err = ApiError.unprocessable('Validation error', { field: 'age' });
      expect(err.statusCode).toBe(422);
      expect(err.details).toEqual({ field: 'age' });
    });

    test('tooMany() returns 429', () => {
      const err = ApiError.tooMany();
      expect(err.statusCode).toBe(429);
    });

    test('unsupportedMediaType() returns 415', () => {
      const err = ApiError.unsupportedMediaType();
      expect(err.statusCode).toBe(415);
      expect(err.message).toBe('Unsupported Media Type');
    });
  });

  describe('5xx static factories', () => {
    test('internal() returns 500 with isOperational = false', () => {
      const err = ApiError.internal();
      expect(err.statusCode).toBe(500);
      expect(err.isOperational).toBe(false);
    });

    test('notImplemented() returns 501 with isOperational = false', () => {
      const err = ApiError.notImplemented();
      expect(err.statusCode).toBe(501);
      expect(err.isOperational).toBe(false);
    });

    test('serviceUnavailable() returns 503', () => {
      const err = ApiError.serviceUnavailable();
      expect(err.statusCode).toBe(503);
      expect(err.isOperational).toBe(true);
    });
  });

  describe('instanceof checks', () => {
    it('should be distinguishable from regular Error', () => {
      const apiErr = ApiError.badRequest();
      const regularErr = new Error('Something broke');

      expect(apiErr instanceof ApiError).toBe(true);
      expect(regularErr instanceof ApiError).toBe(false);
    });

    it('should work with try/catch', () => {
      const fn = () => { throw ApiError.notFound(); };

      try {
        fn();
      } catch (err) {
        expect(err.statusCode).toBe(404);
        expect(err.isOperational).toBe(true);
      }
    });
  });
});
