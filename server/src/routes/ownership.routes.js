// server/src/routes/ownership.routes.js
// Ownership Transfer & System Settings API Routes
//
// All endpoints require authenticate + adminOnly + requireSuperAdmin middleware
// (applied in routes/index.js).
//
// Architecture reference: SUBSCRIPTION_SYSTEM_v3.md §15

const { Router } = require('express');
const mongoose = require('mongoose');
const validate = require('../middleware/validate.middleware');
const { requireSuperAdmin } = require('../middleware/adminAuth.middleware');
const AuditLog = require('../models/AuditLog.model');
const SystemSetting = require('../models/SystemSetting.model');
const User = require('../models/User.model');
const { ROLES } = require('../config/roles');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { withTransaction } = require('../utils/transaction');

const {
  ownershipTransferSchema,
  ownershipTransferBatchSchema,
  ownershipTransferAllSchema,
  quotaUpdateSchema,
  settingUpdateSchema,
} = require('../validators/subscription.validator');

const router = Router();

// Helper
async function findUserOrThrow(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw ApiError.badRequest('Invalid user ID');
  }
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

// ════════════════════════════════════════════════════════════
//  Ownership Transfer
// ════════════════════════════════════════════════════════════

/**
 * PUT /api/admin/ownership/transfer
 */
router.put('/transfer', requireSuperAdmin, validate(ownershipTransferSchema), async (req, res, next) => {
  try {
    const { targetUserId, newOwnerId, reason } = req.validatedBody;
    const target = await findUserOrThrow(targetUserId);
    const newOwner = await findUserOrThrow(newOwnerId);

    if (newOwner.role !== ROLES.MANAGER && newOwner.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.badRequest('New owner must be a Manager or Super Admin');
    }

    const previousOwnerId = target.createdBy;
    await User.findByIdAndUpdate(targetUserId, { createdBy: newOwnerId });

    await AuditLog.record({
      action: 'ownership_transferred',
      category: 'ownership',
      level: 'info',
      targetUserId,
      actorUserId: req.user._id,
      previousState: { createdBy: previousOwnerId },
      newState: { createdBy: newOwnerId },
      reason,
      source: 'api',
      adminIp: req.ip,
      userAgent: req.headers['user-agent'] || '',
      correlationId: req.headers['x-correlation-id'] || null,
    });

    ApiResponse.success(res, { targetUserId, newOwnerId }, 'Ownership transferred');
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/ownership/transfer-batch
 */
router.put('/transfer-batch', requireSuperAdmin, validate(ownershipTransferBatchSchema), async (req, res, next) => {
  try {
    const { targetUserIds, newOwnerId, reason } = req.validatedBody;
    const newOwner = await findUserOrThrow(newOwnerId);
    if (newOwner.role !== ROLES.MANAGER && newOwner.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.badRequest('New owner must be a Manager or Super Admin');
    }

    const correlationId = req.headers['x-correlation-id'] || new mongoose.Types.ObjectId().toString();

    const { transferred } = await withTransaction(async (session) => {
      let count = 0;

      for (const id of targetUserIds) {
        const target = await User.findById(id).select('createdBy').session(session).lean();
        if (!target) continue;
        const previousOwnerId = target.createdBy;
        await User.findByIdAndUpdate(id, { createdBy: newOwnerId }, { session });
        await AuditLog.record({
          action: 'ownership_transferred',
          category: 'ownership',
          level: 'info',
          targetUserId: id,
          actorUserId: req.user._id,
          previousState: { createdBy: previousOwnerId },
          newState: { createdBy: newOwnerId },
          reason,
          source: 'api',
          adminIp: req.ip,
          userAgent: req.headers['user-agent'] || '',
          correlationId,
          session,
        });
        count++;
      }

      return { transferred: count };
    });

    ApiResponse.success(res, { transferred, total: targetUserIds.length, newOwnerId }, `${transferred} user(s) transferred`);
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/ownership/transfer-all
 */
router.put('/transfer-all', requireSuperAdmin, validate(ownershipTransferAllSchema), async (req, res, next) => {
  try {
    const { currentOwnerId, newOwnerId, reason } = req.validatedBody;
    const oldOwner = await findUserOrThrow(currentOwnerId);
    if (oldOwner.role !== ROLES.MANAGER) throw ApiError.badRequest('Current owner must be a Manager');

    const newOwner = await findUserOrThrow(newOwnerId);
    if (newOwner.role !== ROLES.MANAGER && newOwner.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.badRequest('New owner must be a Manager or Super Admin');
    }

    const memberCount = await User.countDocuments({ createdBy: currentOwnerId, role: ROLES.MEMBER });
    const correlationId = req.headers['x-correlation-id'] || new mongoose.Types.ObjectId().toString();

    await withTransaction(async (session) => {
      await User.updateMany(
        { createdBy: currentOwnerId, role: ROLES.MEMBER },
        { createdBy: newOwnerId },
        { session }
      );

      await AuditLog.record({
        action: 'ownership_transferred_all',
        category: 'ownership',
        level: 'warning',
        targetUserId: currentOwnerId,
        actorUserId: req.user._id,
        previousState: { ownerId: currentOwnerId, memberCount },
        newState: { ownerId: newOwnerId, memberCount },
        reason,
        source: 'api',
        adminIp: req.ip,
        userAgent: req.headers['user-agent'] || '',
        correlationId,
        session,
      });

      await User.findByIdAndUpdate(
        currentOwnerId,
        { isActive: false, accountStatus: 'disabled' },
        { session }
      );
    });

    ApiResponse.success(res, {
      transferredCount: memberCount,
      oldOwner: currentOwnerId,
      newOwner: newOwnerId,
      oldManagerDisabled: true,
    }, `${memberCount} user(s) transferred, old Manager disabled`);
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════
//  Manager Quota
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/ownership/managers/:id/quota
 * Super Admin can view any manager's quota. Manager can view only their own quota.
 */
router.get('/managers/:id/quota', async (req, res, next) => {
  try {
    // Self-access check: Manager can only view their own quota
    if (req.user.role !== 'super_admin' && req.params.id !== req.user._id.toString()) {
      throw ApiError.forbidden('Access denied. You can only view your own quota.');
    }

    const manager = await User.findById(req.params.id).select('username quotaUsage').lean();
    if (!manager) throw ApiError.notFound('Manager not found');

    const [memberCount, activeMemberCount, trialCount] = await Promise.all([
      User.countDocuments({ createdBy: req.params.id, role: ROLES.MEMBER }),
      User.countDocuments({ createdBy: req.params.id, role: ROLES.MEMBER, 'subscription.status': 'active' }),
      User.countDocuments({ createdBy: req.params.id, role: ROLES.MEMBER, 'subscription.flags.trial': true }),
    ]);

    ApiResponse.success(res, {
      managerId: manager._id, username: manager.username,
      quotaUsage: manager.quotaUsage || {},
      currentCounts: { totalMembers: memberCount, activeMembers: activeMemberCount, trials: trialCount },
    });
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/ownership/managers/:id/quota
 */
router.put('/managers/:id/quota', requireSuperAdmin, validate(quotaUpdateSchema), async (req, res, next) => {
  try {
    const manager = await User.findById(req.params.id);
    if (!manager) throw ApiError.notFound('Manager not found');

    const allowedFields = [
      'maxMembers', 'maxActiveMembers', 'maxTrials',
      'maxRenewalsPerDay', 'maxPasswordResetsPerDay', 'maxSubscriptionExtensionsPerDay',
    ];

    for (const field of allowedFields) {
      if (req.validatedBody[field] !== undefined) {
        await SystemSetting.set(`quota_${req.params.id}_${field}`, req.validatedBody[field]);
      }
    }

    await AuditLog.record({
      action: 'quota_modified',
      category: 'admin', level: 'info',
      targetUserId: req.params.id, actorUserId: req.user._id,
      previousState: null, newState: { quotaOverrides: req.validatedBody },
      reason: 'Quota override', source: 'api',
      adminIp: req.ip, userAgent: req.headers['user-agent'] || '',
    });

    ApiResponse.success(res, { updated: Object.keys(req.validatedBody) }, 'Quota limits updated');
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════
//  System Settings
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/ownership/settings
 */
router.get('/settings', requireSuperAdmin, async (req, res, next) => {
  try {
    const settings = await SystemSetting.getAll();
    ApiResponse.success(res, { settings });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/ownership/settings/:key
 */
router.get('/settings/:key', requireSuperAdmin, async (req, res, next) => {
  try {
    const value = await SystemSetting.get(req.params.key);
    if (value === null || value === undefined) {
      throw ApiError.notFound(`Setting '${req.params.key}' not found`);
    }
    ApiResponse.success(res, { key: req.params.key, value });
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/ownership/settings/:key
 */
router.put('/settings/:key', requireSuperAdmin, validate(settingUpdateSchema), async (req, res, next) => {
  try {
    const { value, description } = req.validatedBody;
    const key = req.params.key;
    const previous = await SystemSetting.get(key);
    await SystemSetting.set(key, value, req.user._id, description);

    await AuditLog.record({
      action: 'setting_updated', category: 'settings', level: 'info',
      targetUserId: null, actorUserId: req.user._id,
      previousState: { key, value: previous }, newState: { key, value },
      reason: 'Setting updated', source: 'api',
      adminIp: req.ip, userAgent: req.headers['user-agent'] || '',
    });

    ApiResponse.success(res, { key, value }, `Setting '${key}' updated`);
  } catch (err) { next(err); }
});

module.exports = router;
