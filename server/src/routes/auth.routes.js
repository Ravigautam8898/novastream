// server/src/routes/auth.routes.js
// Auth routes — login, logout, verify, refresh
// All mounted under /api/auth

const { Router } = require('express');
const validate = require('../middleware/validate.middleware');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');
const { ipBlocker } = require('../middleware/ipBlocker.middleware');
const { loginSchema, logoutSchema } = require('../validators/auth.validator');
const authController = require('../controllers/auth.controller');

const router = Router();

// ── Login (rate limited + IP blocked) ──
// POST /api/auth/login
router.post(
  '/login',
  ipBlocker,                  // Check if IP is blocked
  authLimiter,                // 5 attempts per minute
  validate(loginSchema),      // Validate input
  authController.login        // Authenticate
);

// ── Logout ──
// POST /api/auth/logout
router.post(
  '/logout',
  authenticate,               // Must be logged in
  authController.logout       // Invalidate session
);

// ── Verify Token ──
// GET /api/auth/verify
router.get(
  '/verify',
  optionalAuth,               // Optional — works with or without token
  authController.verify       // Check if token is valid
);

// ── Refresh Token ──
// POST /api/auth/refresh
router.post(
  '/refresh',
  authenticate,               // Must have active token
  authController.refresh      // Issue new token
);

module.exports = router;
