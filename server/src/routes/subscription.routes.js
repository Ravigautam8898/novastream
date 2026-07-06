// server/src/routes/subscription.routes.js
// Subscription Management API Routes
//
// Architecture reference: SUBSCRIPTION_SYSTEM_v3.md §15 — API Endpoints
//
// All endpoints are mounted under /api/admin/subscriptions via routes/index.js
// with authenticate + adminOnly already applied.
//
// Ownership enforcement:
//   SA — full access to all users
//   Manager — scoped to Members where member.createdBy === manager._id

const { Router } = require('express');
const mongoose = require('mongoose');
const validate = require('../middleware/validate.middleware');
const { requireSuperAdmin } = require('../middleware/adminAuth.middleware');
const SubscriptionService = require('../services/subscription.service');
const AuditLog = require('../models/AuditLog.model');
const User = require('../models/User.model');
const { getPlan, getActivePlans, getAllPlans } = require('../config/plans');
const { ROLES } = require('../config/roles');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const {
  createSubscriptionSchema,
  renewSubscriptionSchema,
  extendSubscriptionSchema,
  upgradeSubscriptionSchema,
  cancelUpgradeSchema,
  adminActionSchema,
} = require('../validators/subscription.validator');

const router = Router();

// ════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════

function getAuditMeta(req) {
  return {
    source: 'api',
    adminIp: req.ip,
    userAgent: req.headers['user-agent'] || '',
    correlationId: req.headers['x-correlation-id'] || null,
  };
}

async function requireOwnership(targetUserId, actorUser) {
  if (!actorUser) throw ApiError.unauthorized('Authentication required');
  const actorRole = actorUser.role;

  if (actorRole === ROLES.SUPER_ADMIN || actorRole === 'admin') return;

  if (actorRole === ROLES.MANAGER) {
    const target = await User.findById(targetUserId).select('createdBy role').lean();
    if (!target) throw ApiError.notFound('Target user not found');
    if (target.role === ROLES.SUPER_ADMIN || target.role === ROLES.MANAGER) {
      throw ApiError.forbidden('Cannot manage users with this role');
    }
    if (!target.createdBy || target.createdBy.toString() !== actorUser._id.toString()) {
      throw ApiError.forbidden('You can only manage users you created');
    }
    return;
  }

  throw ApiError.forbidden('Admin access required');
}

// ════════════════════════════════════════════════════════════
//  Statistics & Info (static routes must be BEFORE /:userId)
// ════════════════════════════════════════════════════════════

/**
 * GET /api/admin/subscriptions/plans
 * Serves plans from SubscriptionPlan collection (DB), with config/plans.js as fallback.
 */
router.get('/plans', async (req, res, next) => {
  try {
    const SubscriptionPlan = require('../models/SubscriptionPlan.model');
    // Managers can only see active plans; Super Admin can see all
    const isSA = req.user.role === 'super_admin';
    const showAll = req.query.all === 'true' && isSA;

    let plans = showAll
      ? await SubscriptionPlan.getAllPlans()
      : await SubscriptionPlan.getActivePlans();

    // Fallback to config plans if DB is empty
    if (!plans || plans.length === 0) {
      plans = showAll ? getAllPlans() : getActivePlans();
    }

    ApiResponse.success(res, { plans });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscriptions/plans/:planId
 */
router.get('/plans/:planId', async (req, res, next) => {
  try {
    const SubscriptionPlan = require('../models/SubscriptionPlan.model');
    let plan = await SubscriptionPlan.findByPlanId(req.params.planId);
    if (!plan) {
      plan = getPlan(req.params.planId);
    }
    if (!plan) throw ApiError.notFound(`Plan '${req.params.planId}' not found`);
    ApiResponse.success(res, plan);
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscriptions/stats
 * Global subscription statistics. Super Admin only.
 */
router.get('/stats', requireSuperAdmin, async (req, res, next) => {
  try {
    const [totalUsers, withSubscriptions, active, expired, suspended, disabled, trial] =
      await Promise.all([
        User.countDocuments({ role: ROLES.MEMBER }),
        User.countDocuments({ 'subscription.status': { $exists: true } }),
        User.countDocuments({ 'subscription.status': 'active' }),
        User.countDocuments({ 'subscription.status': 'expired' }),
        User.countDocuments({ 'subscription.status': 'suspended' }),
        User.countDocuments({ 'subscription.status': 'disabled' }),
        User.countDocuments({ 'subscription.flags.trial': true }),
      ]);

    ApiResponse.success(res, { totalMembers: totalUsers, withSubscriptions, active, expired, suspended, disabled, trial });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscriptions/expiring
 * List subscriptions expiring within N days.
 * SA: global. Manager: own Members only.
 */
router.get('/expiring', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const query = {
      'subscription.status': 'active',

      'subscription.expiryDate': { $gte: now, $lte: future },
    };

    if (req.user.role === ROLES.MANAGER) {
      query.createdBy = req.user._id;
    }

    const members = await User.find(query)
      .select('username displayName subscription.expiryDate subscription.plan createdBy')
      .sort({ 'subscription.expiryDate': 1 })
      .limit(100)
      .lean();

    const result = members.map(m => ({
      _id: m._id, username: m.username, displayName: m.displayName,
      plan: m.subscription?.plan, expiryDate: m.subscription?.expiryDate,
      daysRemaining: m.subscription?.expiryDate
        ? Math.ceil((new Date(m.subscription.expiryDate) - now) / (1000 * 60 * 60 * 24)) : 0,
    }));

    ApiResponse.success(res, { members: result, total: result.length, queryDays: days });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscriptions/check/:userId
 */
router.get('/check/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    await requireOwnership(userId, req.user);
    const [access, status] = await Promise.all([
      SubscriptionService.canAccess(userId),
      SubscriptionService.getStatus(userId),
    ]);
    ApiResponse.success(res, { userId, allowed: access.allowed, reason: access.reason, subscriptionVersion: access.subscriptionVersion, status });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════
//  Subscription CRUD
// ════════════════════════════════════════════════════════════

/**
 * POST /api/admin/subscriptions
 * Assign an initial subscription to a user.
 */
router.post('/', validate(createSubscriptionSchema), async (req, res, next) => {
  try {
    const { plan, userId, activationDate, customDurationDays, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);

    // Validate plan exists
    const SubscriptionPlan = require('../models/SubscriptionPlan.model');
    const planExists = await SubscriptionPlan.findByPlanId(plan) || getPlan(plan);
    if (!planExists) throw ApiError.validation(`Plan '${plan}' not found`);

    const result = await SubscriptionService.create(userId, plan, {
      activationDate,
      customDurationDays,
      notes,
      reason: 'Initial subscription assignment',
      actorUserId: req.user._id,
      ...getAuditMeta(req),
    });

    ApiResponse.created(res, { subscription: result.subscription }, 'Subscription created successfully');
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscriptions/:userId
 * Get subscription details for a user.
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    await requireOwnership(userId, req.user);
    const status = await SubscriptionService.getStatus(userId);
    ApiResponse.success(res, status);
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscriptions/:userId/history
 * Get audit history for a user's subscription.
 */
router.get('/:userId/history', async (req, res, next) => {
  try {
    const { userId } = req.params;
    await requireOwnership(userId, req.user);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const history = await AuditLog.getUserHistory(userId, { limit, category: req.query.category });
    ApiResponse.success(res, { history, total: history.length });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════
//  Subscription Actions
// ════════════════════════════════════════════════════════════

/**
 * PUT /api/admin/subscriptions/:userId/renew
 */
router.put('/:userId/renew', validate(renewSubscriptionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { plan, reason, customDurationDays, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);

    // Validate plan exists
    const SubscriptionPlan = require('../models/SubscriptionPlan.model');
    const planExists = await SubscriptionPlan.findByPlanId(plan) || getPlan(plan);
    if (!planExists) throw ApiError.validation(`Plan '${plan}' not found`);

    const result = await SubscriptionService.renew(userId, plan, {
      reason, notes, customDurationDays,
      actorUserId: req.user._id,
      ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Subscription renewed');
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════════════════════
//  Upgrade / Pending Plan
// ════════════════════════════════════════════════════════════

/**
 * PUT /api/admin/subscriptions/:userId/upgrade
 * Queue a plan upgrade (pending plan) that auto-activates when current plan expires.
 */
router.put('/:userId/upgrade', validate(upgradeSubscriptionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { plan, reason, customDurationDays, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);

    const result = await SubscriptionService.upgrade(userId, plan, {
      customDurationDays, reason, notes,
      actorUserId: req.user._id,
      ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Upgrade queued — will activate when current plan expires');
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/subscriptions/:userId/cancel-upgrade
 * Cancel a pending plan upgrade.
 */
router.put('/:userId/cancel-upgrade', validate(cancelUpgradeSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);

    const result = await SubscriptionService.cancelUpgrade(userId, {
      reason, notes,
      actorUserId: req.user._id,
      ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Pending upgrade cancelled');
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/subscriptions/:userId/extend
 */
router.put('/:userId/extend', validate(extendSubscriptionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { days, reason, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);

    const result = await SubscriptionService.extend(userId, days, {
      reason, notes,
      actorUserId: req.user._id,
      ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, `Extended by ${days} day(s)`);
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/subscriptions/:userId/suspend
 */
router.put('/:userId/suspend', validate(adminActionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);
    const result = await SubscriptionService.suspend(userId, {
      reason, notes, actorUserId: req.user._id, ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Subscription suspended');
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/subscriptions/:userId/resume
 */
router.put('/:userId/resume', validate(adminActionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);
    const result = await SubscriptionService.resume(userId, {
      reason, notes, actorUserId: req.user._id, ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Subscription resumed');
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/subscriptions/:userId/activate
 */
router.put('/:userId/activate', validate(adminActionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);
    const result = await SubscriptionService.activate(userId, {
      reason, notes, actorUserId: req.user._id, ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Subscription activated');
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/subscriptions/:userId/deactivate
 */
router.put('/:userId/deactivate', validate(adminActionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);
    const result = await SubscriptionService.deactivate(userId, {
      reason, notes, actorUserId: req.user._id, ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Subscription deactivated');
  } catch (err) { next(err); }
});

/**
 * POST /api/admin/subscriptions/:userId/expire
 */
router.post('/:userId/expire', validate(adminActionSchema), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, notes } = req.validatedBody;
    await requireOwnership(userId, req.user);
    const result = await SubscriptionService.expire(userId, {
      reason, notes, actorUserId: req.user._id, ...getAuditMeta(req),
    });
    ApiResponse.success(res, { subscription: result.subscription }, 'Subscription expired');
  } catch (err) { next(err); }
});

module.exports = router;
