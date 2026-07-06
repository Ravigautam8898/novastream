// server/src/routes/plan.routes.js
// Plan Management API Routes — Super Admin only.
//
// CRUD for SubscriptionPlan collection. Plans are stored in DB with
// seed defaults (trial, monthly, quarterly, yearly, custom).
//
// For backward compatibility: the existing /admin/subscriptions/plans
// endpoint (in subscription.routes.js) continues to serve plans from
// this collection as well as config/plans.js.

const { Router } = require('express');
const { requireSuperAdmin } = require('../middleware/adminAuth.middleware');
const SubscriptionPlan = require('../models/SubscriptionPlan.model');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const router = Router();

// All routes require Super Admin
router.use(requireSuperAdmin);

/**
 * GET /api/admin/subscription/plans
 * List all plans (active + inactive). Super Admin only.
 */
router.get('/', async (req, res, next) => {
  try {
    const all = req.query.all === 'true';
    const plans = all
      ? await SubscriptionPlan.getAllPlans()
      : await SubscriptionPlan.getActivePlans();
    ApiResponse.success(res, { plans, total: plans.length });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscription/plans/:planId
 * Get a single plan by planId.
 */
router.get('/:planId', async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByPlanId(req.params.planId);
    if (!plan) throw ApiError.notFound(`Plan '${req.params.planId}' not found`);
    ApiResponse.success(res, plan);
  } catch (err) { next(err); }
});

/**
 * POST /api/admin/subscription/plans
 * Create a new plan. planId is auto-generated from name if not provided.
 */
router.post('/', async (req, res, next) => {
  try {
    const { planId, name, description, durationDays, type, price, currency, maxDevices, maxStreams, isActive, badgeColor } = req.body;

    if (!name || name.trim().length < 2) {
      throw ApiError.validation('Plan name is required (min 2 characters)');
    }

    // Auto-generate planId from name if not provided
    const finalPlanId = planId
      ? planId.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : name.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    if (!finalPlanId || finalPlanId.length < 2) {
      throw ApiError.validation('Could not generate a valid plan ID from the provided name');
    }

    // Check for duplicate planId
    const existing = await SubscriptionPlan.findByPlanId(finalPlanId);
    if (existing) {
      throw ApiError.conflict(`Plan with ID '${finalPlanId}' already exists`);
    }

    // Validate type
    const validTypes = ['trial', 'standard', 'promotional', 'custom'];
    const finalType = validTypes.includes(type) ? type : 'standard';

    // Validate duration
    if (durationDays !== null && durationDays !== undefined) {
      if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
        throw ApiError.validation('Duration must be between 1 and 3650 days, or null for indefinite');
      }
    }

    const plan = await SubscriptionPlan.create({
      planId: finalPlanId,
      name: name.trim(),
      description: description || '',
      durationDays: durationDays ?? null,
      type: finalType,
      price: price ?? null,
      currency: currency || 'USD',
      maxDevices: maxDevices ?? null,
      maxStreams: maxStreams ?? null,
      isActive: isActive !== undefined ? isActive : true,
      badgeColor: badgeColor || 'blue',
      createdBy: req.user._id,
    });

    logger.info({ planId: finalPlanId, name: plan.name }, 'Plan created');
    ApiResponse.created(res, plan, `Plan '${plan.name}' created`);
  } catch (err) { next(err); }
});

/**
 * PUT /api/admin/subscription/plans/:planId
 * Update an existing plan.
 */
router.put('/:planId', async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByPlanId(req.params.planId);
    if (!plan) throw ApiError.notFound(`Plan '${req.params.planId}' not found`);

    const allowedFields = ['name', 'description', 'durationDays', 'type', 'price', 'currency', 'maxDevices', 'maxStreams', 'isActive', 'badgeColor', 'displayOrder'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate duration if provided
    if (updates.durationDays !== undefined && updates.durationDays !== null) {
      if (!Number.isInteger(updates.durationDays) || updates.durationDays < 1 || updates.durationDays > 3650) {
        throw ApiError.validation('Duration must be between 1 and 3650 days, or null for indefinite');
      }
    }

    // Validate type if provided
    if (updates.type) {
      const validTypes = ['trial', 'standard', 'promotional', 'custom'];
      if (!validTypes.includes(updates.type)) {
        throw ApiError.validation(`Invalid type. Must be one of: ${validTypes.join(', ')}`);
      }
    }

    // Sync isTrial with type changes
    if (updates.type === 'trial') {
      updates.isTrial = true;
    } else if (updates.type === 'standard' || updates.type === 'promotional') {
      updates.isTrial = false;
    }

    const updated = await SubscriptionPlan.findOneAndUpdate(
      { planId: req.params.planId },
      { $set: updates },
      { new: true }
    );

    logger.info({ planId: req.params.planId }, 'Plan updated');
    ApiResponse.success(res, updated, `Plan '${updated.name}' updated`);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/admin/subscription/plans/:planId
 * Soft-delete (deactivate) a plan. Does NOT remove from DB.
 * Existing subscriptions with this plan keep working.
 */
router.delete('/:planId', async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByPlanId(req.params.planId);
    if (!plan) throw ApiError.notFound(`Plan '${req.params.planId}' not found`);

    await SubscriptionPlan.findOneAndUpdate(
      { planId: req.params.planId },
      { $set: { isActive: false } }
    );

    logger.info({ planId: req.params.planId, name: plan.name }, 'Plan deactivated');
    ApiResponse.success(res, null, `Plan '${plan.name}' deactivated`);
  } catch (err) { next(err); }
});

module.exports = router;
