// server/src/routes/admin.routes.js
// Admin Routes — server management via API
//
// All endpoints require authenticate + adminOnly middleware.
// These are applied in routes/index.js, not in this file.
//
// Endpoints:
//   ── User Management ──
//   GET    /api/admin/users           — List all users
//   POST   /api/admin/users           — Create a new user
//   DELETE /api/admin/users/:id       — Delete a user
//   POST   /api/admin/users/:id/reset — Reset user password
//
//   ── Content Management ──
//   GET    /api/admin/content          — List all content (paginated)
//   PUT    /api/admin/content/:id      — Update content (toggle featured, etc.)
//   DELETE /api/admin/content/:id      — Delete content
//
//   ── System ──
//   GET    /api/admin/stats            — Server statistics
//   GET    /api/admin/logs             — Recent log lines

const { Router } = require('express');
const { adminLimiter } = require('../middleware/rateLimiter.middleware');
const validate = require('../middleware/validate.middleware');
const { createUserSchema } = require('../validators/auth.validator');
const User = require('../models/User.model');
const Content = require('../models/Content.model');
const Session = require('../models/Session.model');
const BlockedIP = require('../models/BlockedIP.model');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const SystemService = require('../services/system.service');
const AdminUserService = require('../services/admin-user.service');
const AdminContentService = require('../services/admin-content.service');

const router = Router();

// ─────────────────────────────────────────────────────────────
//  User Management
// ─────────────────────────────────────────────────────────────

// Apply a moderate rate limiter to all admin endpoints (30 req/min per IP)
router.use(adminLimiter);

/**
 * GET /api/admin/users
 * List all users with their roles, status, and login info.
 */
router.get('/users', async (req, res, next) => {
  try {
    const result = await AdminUserService.listUsers(req.user);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users
 * Create a new user (admin only — no registration page exists).
 * Body: { username, password, role?, displayName? }
 */
router.post('/users', validate(createUserSchema), async (req, res, next) => {
  try {
    const { username, password, role } = req.validatedBody;
    const { displayName } = req.body;

    const user = await AdminUserService.createUser(req.user, username, password, role, displayName);

    ApiResponse.created(res, user, `User '${username}' created successfully`);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user by ID. Manager-scoped: only own members.
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const username = await AdminUserService.deleteUser(req.user, id);
    ApiResponse.success(res, { deleted: username }, `User '${username}' deleted`);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users/:id/reset
 * Reset a user's password.
 * Body: { password }
 */
router.post('/users/:id/reset', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const username = await AdminUserService.resetPassword(req.user, id, password);
    ApiResponse.success(res, { username }, `Password reset for '${username}'`);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  Content Management
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/content
 * List all content with pagination and filters.
 * Query params: page, limit, type (movie|series), status (active|inactive|all)
 */
router.get('/content', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type;
    const status = req.query.status || 'all';

    const result = await AdminContentService.listContent(page, limit, type, status);
    ApiResponse.paginated(res, result.items, result.pagination);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/content/:id
 * Update content fields (toggle featured, active status, etc.)
 * Body: { isFeatured?, isActive?, isPinned?, isPremium? }
 */
router.put('/content/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const content = await AdminContentService.updateContent(id, req.body, req.user.username);
    ApiResponse.success(res, content, 'Content updated');
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/content/:id
 * Soft-delete content by setting isActive to false.
 */
router.delete('/content/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const content = await AdminContentService.deactivateContent(id, req.user.username);
    ApiResponse.success(res, content, `'${content.title}' deactivated`);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  System / Analytics
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Server statistics: user counts, content counts, session counts, blocked IPs.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      adminUsers,
      totalContent,
      movies,
      series,
      activeSessions,
      blockedIPs,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      // Count both legacy 'admin' and new 'super_admin' roles during migration
      User.countDocuments({ $or: [{ role: 'admin' }, { role: 'super_admin' }] }),
      Content.countDocuments(),
      Content.countDocuments({ contentType: 'movie' }),
      Content.countDocuments({ contentType: 'series' }),
      Session.countDocuments({ isActive: true }),
      BlockedIP.countDocuments({ isActive: true }),
    ]);

    ApiResponse.success(res, {
      users: { total: totalUsers, active: activeUsers, admins: adminUsers },
      content: { total: totalContent, movies, series },
      sessions: { active: activeSessions },
      security: { blockedIPs },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/logs
 * Return recent log data from the server.
 * Query params: lines (number of lines, default 50, max 500)
 */
router.get('/logs', async (req, res, next) => {
  try {
    const lines = Math.min(500, Math.max(10, parseInt(req.query.lines) || 50));

    const logPath = path.resolve(process.cwd(), 'logs', 'combined.log');

    if (!fs.existsSync(logPath)) {
      return ApiResponse.success(res, {
        lines: [],
        source: 'none',
        message: 'No log file found. Ensure PM2 logging is configured.',
      });
    }

    const content = fs.readFileSync(logPath, 'utf8');
    const allLines = content.trim().split('\n').filter(Boolean);
    const recentLines = allLines.slice(-lines);

    ApiResponse.success(res, {
      lines: recentLines,
      total: allLines.length,
      showing: recentLines.length,
      source: logPath,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  System Health & Process
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/system/health
 * CPU, memory, disk, uptime, Node.js info.
 */
router.get('/system/health', async (req, res, next) => {
  try {
    const health = {
      cpu: SystemService.getCpuUsage(),
      memory: SystemService.getMemoryInfo(),
      disk: SystemService.getDiskInfo(),
      process: SystemService.getProcessInfo(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString(),
    };
    ApiResponse.success(res, health);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/system/process
 * PID, PM2 status, resource usage.
 */
router.get('/system/process', async (req, res, next) => {
  try {
    ApiResponse.success(res, SystemService.getProcessInfo());
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  Database
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/database
 * MongoDB collections, sizes, counts.
 */
router.get('/database', async (req, res, next) => {
  try {
    const stats = await SystemService.getDatabaseStats(mongoose.connection);
    ApiResponse.success(res, stats);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  Sessions
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/sessions
 * Active sessions with user info.
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await SystemService.getActiveSessions(User);
    ApiResponse.success(res, sessions);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/sessions/:id
 * Force-invalidate a session.
 */
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = await Session.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!session) {
      throw ApiError.notFound('Session not found');
    }
    logger.info({ sessionId: id, invalidatedBy: req.user.username }, 'Admin: session invalidated');
    ApiResponse.success(res, { invalidated: true }, 'Session invalidated');
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/config
 * Server env vars (masked secrets).
 */
router.get('/config', async (req, res, next) => {
  try {
    ApiResponse.success(res, SystemService.getConfig());
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/config/validate
 * Validate .env file integrity.
 */
router.post('/config/validate', async (req, res, next) => {
  try {
    const envPath = path.resolve(__dirname, '..', '..', '..', '.env');

    if (!fs.existsSync(envPath)) {
      throw ApiError.notFound('.env file not found at ' + envPath);
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

    const requiredVars = ['MONGODB_URI', 'JWT_SECRET', 'STREAM_SECRET', 'TMDB_API_KEY'];
    const missing = [];
    const present = [];

    for (const line of lines) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*/);
      if (match) {
        present.push(match[1]);
      }
    }

    for (const v of requiredVars) {
      if (!present.includes(v)) {
        missing.push(v);
      }
    }

    ApiResponse.success(res, {
      valid: missing.length === 0,
      path: envPath,
      totalVars: present.length,
      requiredVars: requiredVars,
      missing: missing,
      present: present,
      message: missing.length === 0
        ? 'All required environment variables are present'
        : `Missing required variables: ${missing.join(', ')}`,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  Security / IP Management
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/security/blocked-ips
 * List blocked IPs.
 */
router.get('/security/blocked-ips', async (req, res, next) => {
  try {
    const ips = await SystemService.getBlockedIPs();
    ApiResponse.success(res, ips);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/security/block-ip
 * Block an IP address.
 * Body: { ip, reason? }
 */
router.post('/security/block-ip', async (req, res, next) => {
  try {
    const { ip, reason } = req.body;
    if (!ip) {
      throw ApiError.badRequest('IP address is required');
    }
    const record = await SystemService.blockIP(ip, reason || 'manual', 'admin');
    logger.info({ ip, reason: reason || 'manual', blockedBy: req.user.username }, 'Admin: IP blocked');
    ApiResponse.created(res, record, `IP ${ip} blocked`);
  } catch (err) {
    if (err.statusCode === 409) {
      return next(ApiError.conflict(err.message));
    }
    next(err);
  }
});

/**
 * POST /api/admin/security/unblock-ip/:id
 * Unblock an IP by record ID.
 */
router.post('/security/unblock-ip/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await SystemService.unblockIP(id);
    logger.info({ ip: record.ip, unblockedBy: req.user.username }, 'Admin: IP unblocked');
    ApiResponse.success(res, record, `IP ${record.ip} unblocked`);
  } catch (err) {
    if (err.statusCode === 404) {
      return next(ApiError.notFound(err.message));
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
//  User Activity / Timeline (Admin)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users/:id/activity
 * Get full activity timeline for a specific user.
 * Combines watch history, login history, and favorites activity.
 */
router.get('/users/:id/activity', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await AdminUserService.getUserActivity(id);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/activity/recent
 * Get recent activity across ALL users (last 50 actions).
 * Returns chronological feed of who watched what.
 */
router.get('/activity/recent', async (req, res, next) => {
  try {
    const result = await AdminUserService.getRecentActivity();
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
