// server/src/services/__tests__/stream.service.test.js
// NovaStream — Stream Service unit tests
// Tests for token generation and validation (no filesystem operations)

// Mock env config before requiring stream service
// Must include all properties accessed by dependencies (stream.service + logger)
jest.mock('../../config/env', () => ({
  stream: {
    secret: 'test-stream-secret-12345',
    tokenExpiryHours: 24,
  },
  server: {
    logLevel: 'silent',
    nodeEnv: 'test',
    isDevelopment: false,
  },
  jwt: {
    secret: 'test-jwt-secret',
  },
}));

const { generateStreamToken, validateStreamToken } = require('../stream.service');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');

describe('Stream Service', () => {
  describe('generateStreamToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateStreamToken({
        contentId: '507f1f77bcf86cd799439011',
        contentType: 'movie',
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

      // Verify the token is valid and contains expected payload
      const decoded = jwt.verify(token, config.stream.secret);
      expect(decoded.sub).toBe('507f1f77bcf86cd799439011');
      expect(decoded.type).toBe('movie');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    it('should throw on missing contentId', () => {
      expect(() => {
        generateStreamToken({ contentType: 'movie' });  // Missing contentId
      }).toThrow();
    });

    it('should throw on missing contentType', () => {
      expect(() => {
        generateStreamToken({ contentId: '507f1f77bcf86cd799439011' });  // Missing contentType
      }).toThrow();
    });

    it('should throw on empty payload', () => {
      expect(() => {
        generateStreamToken({});
      }).toThrow();
    });

    it('should throw on no arguments', () => {
      expect(() => {
        generateStreamToken();
      }).toThrow();
    });

    it('should include IP when provided', () => {
      const token = generateStreamToken({
        contentId: '507f1f77bcf86cd799439011',
        contentType: 'episode',
        ip: '192.168.1.1',
      });

      const decoded = jwt.verify(token, config.stream.secret);
      expect(decoded.ip).toBe('192.168.1.1');
    });

    it('should set expiry to 24 hours from now', () => {
      const token = generateStreamToken({
        contentId: '507f1f77bcf86cd799439011',
        contentType: 'movie',
      });

      const decoded = jwt.verify(token, config.stream.secret);
      const now = Math.floor(Date.now() / 1000);
      const expectedExpiry = now + 24 * 3600;

      // Allow 2 second tolerance for test execution time
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiry - 2);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 2);
    });
  });

  describe('validateStreamToken', () => {
    it('should validate a correctly signed token', () => {
      const token = generateStreamToken({
        contentId: '507f1f77bcf86cd799439011',
        contentType: 'movie',
      });

      const decoded = validateStreamToken(token);
      expect(decoded.sub).toBe('507f1f77bcf86cd799439011');
      expect(decoded.type).toBe('movie');
    });

    it('should reject an expired token', () => {
      // Create a token that's already expired (exp in the past)
      const expiredPayload = {
        sub: '507f1f77bcf86cd799439011',
        type: 'movie',
        iat: Math.floor(Date.now() / 1000) - 3600,
        exp: Math.floor(Date.now() / 1000) - 1800,
      };
      const expiredToken = jwt.sign(expiredPayload, config.stream.secret, { algorithm: 'HS256' });

      expect(() => {
        validateStreamToken(expiredToken);
      }).toThrow(/expired/);
    });

    it('should reject a token signed with wrong secret', () => {
      const token = jwt.sign(
        { sub: 'test', type: 'movie' },
        'wrong-secret',
        { algorithm: 'HS256' }
      );

      expect(() => {
        validateStreamToken(token);
      }).toThrow(/invalid|malformed/i);
    });

    it('should reject a malformed token string', () => {
      expect(() => {
        validateStreamToken('not-a-valid-jwt');
      }).toThrow(/invalid|malformed/i);
    });

    it('should reject token with empty string', () => {
      expect(() => {
        validateStreamToken('');
      }).toThrow(/invalid|malformed/i);
    });

    it('should verify IP binding when token has ip', () => {
      const token = generateStreamToken({
        contentId: '507f1f77bcf86cd799439011',
        contentType: 'movie',
        ip: '10.0.0.1',
      });

      // Should pass with matching IP
      expect(() => {
        validateStreamToken(token, { ip: '10.0.0.1' });
      }).not.toThrow();

      // Should reject with mismatched IP
      expect(() => {
        validateStreamToken(token, { ip: '10.0.0.2' });
      }).toThrow(/IP mismatch/);
    });

    it('should accept token without IP even when IP checking is requested', () => {
      const token = generateStreamToken({
        contentId: '507f1f77bcf86cd799439011',
        contentType: 'movie',
        // No IP
      });

      expect(() => {
        validateStreamToken(token, { ip: '10.0.0.1' });
      }).not.toThrow();
    });
  });
});
