// server/src/services/__tests__/auth.service.test.js
// NovaStream — Auth Service unit tests
// Focus: refreshToken() security — expired, valid, revoked session

// Mock env config before requiring auth service
jest.mock('../../config/env', () => ({
  jwt: {
    secret: 'test-jwt-secret-at-least-32-chars!!',
    expiresIn: '7d',
  },
  stream: {
    secret: 'test-stream-secret',
    tokenExpiryHours: 24,
  },
  server: {
    logLevel: 'silent',
    nodeEnv: 'test',
    isDevelopment: false,
  },
}));

// Mock User model
const mockUser = {
  _id: '507f1f77bcf86cd799439011',
  username: 'testuser',
  role: 'member',
  isActive: true,
  toString: () => '507f1f77bcf86cd799439011',
};

// Returns a chainable Mongoose-query-like object with .select()
function mockFindById(result) {
  return { select: jest.fn().mockResolvedValue(result) };
}

jest.mock('../../models/User.model', () => ({
  findById: jest.fn(),
}));

// Mock Session model
jest.mock('../../models/Session.model', () => ({
  findValidSession: jest.fn(),
  updateMany: jest.fn(),
}));

// Mock BlockedIP
jest.mock('../../models/BlockedIP.model', () => ({
  isBlocked: jest.fn(),
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  api: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const User = require('../../models/User.model');
const Session = require('../../models/Session.model');
const AuthService = require('../auth.service');

describe('AuthService.refreshToken', () => {
  const userId = '507f1f77bcf86cd799439011';
  const validPayload = { userId, username: 'testuser', role: 'member' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw on missing token', async () => {
    await expect(AuthService.refreshToken()).rejects.toThrow('No token provided');
    await expect(AuthService.refreshToken('')).rejects.toThrow('No token provided');
    await expect(AuthService.refreshToken(null)).rejects.toThrow('No token provided');
  });

  it('should reject an expired token', async () => {
    // Create a token that's already expired
    const expiredToken = jwt.sign(
      { ...validPayload, exp: Math.floor(Date.now() / 1000) - 3600 },
      config.jwt.secret
    );

    await expect(AuthService.refreshToken(expiredToken))
      .rejects.toThrow('Token has expired');
  });

  it('should reject a token signed with wrong secret', async () => {
    const token = jwt.sign(validPayload, 'wrong-secret');

    await expect(AuthService.refreshToken(token))
      .rejects.toThrow('Invalid token');
  });

  it('should reject a malformed token string', async () => {
    await expect(AuthService.refreshToken('not-a-valid-jwt'))
      .rejects.toThrow('Invalid token');
  });

  it('should reject a revoked session (after logout)', async () => {
    const token = jwt.sign(validPayload, config.jwt.secret);

    // Mock session lookup — session is revoked/inactive
    Session.findValidSession.mockResolvedValue(null);

    await expect(AuthService.refreshToken(token))
      .rejects.toThrow('Session has been invalidated');
  });

  it('should reject for deactivated user', async () => {
    const token = jwt.sign(validPayload, config.jwt.secret);

    // Mock valid session
    Session.findValidSession.mockResolvedValue({ _id: 'session123' });
    // Mock deactivated user — use chainable query with .select()
    User.findById.mockReturnValue(
      mockFindById({ ...mockUser, isActive: false })
    );

    await expect(AuthService.refreshToken(token))
      .rejects.toThrow('User not found or deactivated');
  });

  it('should successfully refresh a valid token', async () => {
    const token = jwt.sign(validPayload, config.jwt.secret);

    // Mock valid session lookup
    Session.findValidSession.mockResolvedValue({ _id: 'session123' });
    // Mock active user — use chainable query with .select()
    User.findById.mockReturnValue(mockFindById(mockUser));
    // Mock session update
    Session.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const result = await AuthService.refreshToken(token);

    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('expiresIn', '7d');
    expect(typeof result.token).toBe('string');

    // Verify old session was deactivated
    expect(Session.updateMany).toHaveBeenCalled();

    // Verify the new token is valid and contains expected payload
    const decoded = jwt.verify(result.token, config.jwt.secret);
    expect(decoded.userId).toBe(userId);
    expect(decoded.username).toBe('testuser');
  });

  it('should deactivate old session and issue new token (rotation)', async () => {
    const token = jwt.sign(validPayload, config.jwt.secret);

    Session.findValidSession.mockResolvedValue({ _id: 'session123' });
    // Mock active user — use chainable query with .select()
    User.findById.mockReturnValue(mockFindById(mockUser));
    Session.updateMany.mockResolvedValue({ modifiedCount: 1 });

    await AuthService.refreshToken(token);

    // Session.updateMany should have been called to deactivate old token
    expect(Session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: expect.any(String) }),
      { $set: { isActive: false } }
    );
  });

  it('should reject token that was already used for a previous refresh', async () => {
    const token = jwt.sign(validPayload, config.jwt.secret);

    // First refresh — valid
    Session.findValidSession.mockResolvedValueOnce({ _id: 'session123' });
    // Mock active user — use chainable query with .select()
    User.findById.mockReturnValue(mockFindById(mockUser));
    Session.updateMany.mockResolvedValue({ modifiedCount: 1 });

    await AuthService.refreshToken(token); // succeeds

    // Second refresh with same token — session now revoked
    Session.findValidSession.mockResolvedValueOnce(null);

    await expect(AuthService.refreshToken(token))
      .rejects.toThrow('Session has been invalidated');
  });
});
