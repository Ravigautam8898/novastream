// server/src/services/subscription.service.js
// SubscriptionService — all subscription business logic lives here.
//
// Architecture reference: SUBSCRIPTION_SYSTEM_v3.md §12
//
// Key design rules:
// - Every mutation increments subscription.version for stream token invalidation
// - Every mutation records an AuditLog entry
// - No controller, route, or CLI should modify subscription data directly
// - Role bypasses (SA/Manager) are enforced here for read methods; middleware handles write auth
// - Ownership and quota checks happen in middleware, not in this service

const mongoose = require('mongoose');
const User = require('../models/User.model');
const AuditLog = require('../models/AuditLog.model');
const { getPlan, isValidPlan } = require('../config/plans');
const { requiresSubscription, ROLES } = require('../config/roles');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

class SubscriptionService {

  // ═══════════════════════════════════════════════════════
  //  Public Read Methods
  // ═══════════════════════════════════════════════════════

  /**
   * Check if a user's subscription allows access to protected resources.
   * Super Admin and Manager always bypass subscription checks.
   *
   * @param {string} userId - User ID
   * @returns {Promise<{allowed: boolean, reason: string, subscriptionVersion: number|null}>}
   */
  static async canAccess(userId) {
    const user = await User.findById(userId)
      .select('role accountStatus isActive subscription')
      .lean();

    if (!user) {
      return { allowed: false, reason: 'User not found', subscriptionVersion: null };
    }

    // Role bypass: SA and Manager never require subscription
    if (!requiresSubscription(user.role)) {
      return { allowed: true, reason: '', subscriptionVersion: user.subscription?.version || null };
    }

    // Account status check
    if (user.accountStatus !== 'active') {
      return { allowed: false, reason: `Account is ${user.accountStatus}`, subscriptionVersion: null };
    }

    if (!user.isActive) {
      return { allowed: false, reason: 'Account is deactivated', subscriptionVersion: null };
    }

    // No subscription assigned
    if (!user.subscription || !user.subscription.status) {
      return { allowed: false, reason: 'No subscription assigned', subscriptionVersion: null };
    }

    const sub = user.subscription;
    const now = new Date();

    // Status checks
    if (sub.status === 'suspended') {
      return { allowed: false, reason: 'Subscription is suspended', subscriptionVersion: sub.version };
    }
    if (sub.status === 'disabled') {
      return { allowed: false, reason: 'Subscription is disabled', subscriptionVersion: sub.version };
    }
    if (sub.status === 'expired') {
      return { allowed: false, reason: 'Subscription has expired', subscriptionVersion: sub.version };
    }

    // Activation date check (future activation)
    if (sub.activationDate && new Date(sub.activationDate) > now) {
      const daysUntil = Math.ceil((new Date(sub.activationDate) - now) / (1000 * 60 * 60 * 24));
      return {
        allowed: false,
        reason: `Subscription not yet active — starts in ${daysUntil} day(s)`,
        subscriptionVersion: sub.version,
      };
    }

    // Expiry date check
    if (sub.expiryDate && new Date(sub.expiryDate) <= now) {
      // Check for pending plan — auto-activate if one exists
      if (sub.pendingPlan) {
        const activated = await this._activatePendingPlan(userId);
        if (activated) {
          return { allowed: true, reason: 'Pending plan activated', subscriptionVersion: (sub.version || 0) + 1 };
        }
      }
      return { allowed: false, reason: 'Subscription has expired', subscriptionVersion: sub.version };
    }

    // All checks passed
    return { allowed: true, reason: '', subscriptionVersion: sub.version };
  }

  /**
   * Get remaining days for a user's subscription.
   * @param {string} userId - User ID
   * @returns {Promise<number|null>} Days remaining (0 if expired, null if no subscription)
   */
  static async remainingDays(userId) {
    const user = await User.findById(userId)
      .select('subscription')
      .lean();

    if (!user || !user.subscription || !user.subscription.expiryDate) {
      return null; // No subscription or expiryDate not set
    }

    const now = new Date();
    const expiry = new Date(user.subscription.expiryDate);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) return 0; // Already expired

    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get full subscription status for a user.
   * @param {string} userId - User ID
   * @returns {Promise<object>} Subscription details with computed fields
   */
  static async getStatus(userId) {
    const user = await User.findById(userId)
      .select('role accountStatus isActive subscription')
      .lean();

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const sub = user.subscription;
    const daysRemaining = await this.remainingDays(userId);

    // Try auto-activating pending plan if expired
    if (sub?.pendingPlan && daysRemaining !== null && daysRemaining <= 0) {
      await this._activatePendingPlan(userId);
    }

    // Re-fetch sub after potential activation
    const freshUser = await User.findById(userId).select('subscription').lean();
    const freshSub = freshUser?.subscription;
    const freshDaysRemaining = await this.remainingDays(userId);

    // Compute displayStatus with full nuance (trial, none, etc.)
    let displayStatus;
    if (!freshSub || !freshSub.status) {
      displayStatus = freshSub?.pendingPlan ? 'pending_upgrade' : 'none';
    } else if (freshSub.flags?.trial) {
      displayStatus = freshSub.status === 'active' ? 'trial' : 'trial_expired';
    } else {
      displayStatus = freshSub.status;
    }

    return {
      exists: !!(freshSub?.status || freshSub?.pendingPlan),
      plan: freshSub?.plan || null,
      planLabel: freshSub?.plan ? (getPlan(freshSub.plan)?.label || freshSub.plan) : null,
      status: freshSub?.status || null,
      displayStatus,
      flags: {
        trial: freshSub?.flags?.trial || false,
      },
      activationDate: freshSub?.activationDate || null,
      expiryDate: freshSub?.expiryDate || null,
      trialEndDate: freshSub?.trialEndDate || null,
      daysRemaining: freshDaysRemaining,
      version: freshSub?.version || null,
      renewalCount: freshSub?.renewalCount || 0,
      lastRenewedAt: freshSub?.lastRenewedAt || null,
      notes: freshSub?.notes || '',
      // Pending plan info
      pendingPlan: freshSub?.pendingPlan ? {
        plan: freshSub.pendingPlan.plan,
        planLabel: getPlan(freshSub.pendingPlan.plan)?.label || freshSub.pendingPlan.plan,
        startDate: freshSub.pendingPlan.startDate,
        durationDays: freshSub.pendingPlan.durationDays,
        assignedAt: freshSub.pendingPlan.assignedAt,
      } : null,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Pending Plan / Upgrade System
  // ═══════════════════════════════════════════════════════

  /**
   * Upgrade a subscription by queuing a pending plan.
   * The new plan auto-activates when the current subscription expires.
   *
   * This is NOT a renewal — it schedules a plan change at the end of the
   * current subscription period. This matches real OTT platform behavior
   * (e.g. upgrading from Trial to Monthly during a trial period).
   *
   * @param {string} userId - Target user ID
   * @param {string} planId - Plan ID for the upgrade
   * @param {object} [options]
   * @param {number} [options.customDurationDays] - Required if plan is 'custom'
   * @param {string} [options.reason] - Why upgraded
   * @param {string} [options.notes] - Admin notes
   * @param {string} options.actorUserId - Admin performing the action
   * @param {string} [options.source='api']
   * @param {string} [options.correlationId]
   * @returns {Promise<object>} Updated user document
   * @throws {ApiError} If plan invalid, no current subscription, or lifetime sub
   */
  static async upgrade(userId, planId, options = {}) {
    const plan = getPlan(planId);
    if (!plan || !plan.isActive) {
      throw ApiError.badRequest(`Invalid or inactive plan: '${planId}'`);
    }

    // Validate custom duration
    if (planId === 'custom') {
      const customDays = options.customDurationDays;
      if (!customDays || customDays < 1 || customDays > 3650) {
        throw ApiError.badRequest('Custom duration must be between 1 and 3650 days');
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.subscription || !user.subscription.status) {
      // No current sub — this is an initial assignment, not an upgrade
      throw ApiError.badRequest('User does not have a subscription to upgrade. Use the Assign action instead.');
    }

    // If a pending plan already exists, overwrite it (user may have double-clicked or changed their mind)
    if (user.subscription.pendingPlan) {
      logger.info({ userId, fromPlan: user.subscription.pendingPlan.plan, toPlan: planId },
        'Overwriting existing pending plan upgrade');
    }

    const now = new Date();
    const previousState = { ...user.subscription.toObject() };

    // Calculate when the pending plan should activate
    // If current subscription is active: activate when current expires
    // If already expired: activate immediately (next access check)
    const currentExpiry = user.subscription.expiryDate;
    const isExpired = !currentExpiry || new Date(currentExpiry) <= now;

    const durationDays = planId === 'custom' ? options.customDurationDays : plan.durationDays;

    // Set startDate: if current is still active, start after current expiry; else now + 1 minute
    const startDate = isExpired
      ? new Date(now.getTime() + 60 * 1000) // 1 minute from now for immediate activation
      : new Date(currentExpiry.getTime());

    // Apply pendingPlan atomically
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'subscription.pendingPlan': {
            plan: planId,
            startDate,
            durationDays,
            assignedAt: now,
            assignedBy: new mongoose.Types.ObjectId(options.actorUserId),
          },
          'subscription.updatedAt': now,
        },
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal('Failed to queue upgrade');
    }

    // Record audit log
    await AuditLog.record({
      action: 'subscription_upgrade_queued',
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: options.reason || `Upgrade to ${planId} queued (activates ${startDate.toISOString()})`,
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    logger.info({
      userId,
      fromPlan: updatedUser.subscription.plan,
      toPlan: planId,
      startDate,
      actor: options.actorUserId,
    }, 'Subscription upgrade queued');

    return updatedUser;
  }

  /**
   * Cancel a pending plan upgrade.
   * Removes the pendingPlan field without affecting the current subscription.
   *
   * @param {string} userId - Target user ID
   * @param {object} [options]
   * @param {string} [options.reason]
   * @param {string} options.actorUserId
   * @returns {Promise<object>} Updated user document
   * @throws {ApiError} If no pending plan
   */
  static async cancelUpgrade(userId, options = {}) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.subscription?.pendingPlan) {
      throw ApiError.badRequest('No pending plan upgrade to cancel');
    }

    const now = new Date();
    const previousState = { ...user.subscription.toObject() };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $unset: { 'subscription.pendingPlan': '' },
        $set: { 'subscription.updatedAt': now },
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal('Failed to cancel upgrade');
    }

    await AuditLog.record({
      action: 'subscription_upgrade_cancelled',
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: options.reason || 'Pending upgrade cancelled',
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    return updatedUser;
  }

  /**
   * Activate a pending plan upgrade for a user.
   * Called automatically from canAccess() and getStatus().
   *
   * @param {string} userId - Target user ID
   * @returns {Promise<boolean>} Whether a pending plan was activated
   */
  static async _activatePendingPlan(userId) {
    // Atomic find-and-update: only activate if pendingPlan still exists
    // This prevents race conditions from concurrent canAccess() calls
    const user = await User.findById(userId).select('subscription').lean();
    if (!user || !user.subscription?.pendingPlan) return false;

    const now = new Date();
    const pending = user.subscription.pendingPlan;

    // Only activate if current subscription is expired or pending start date has arrived
    const currentExpiry = user.subscription.expiryDate;
    const isExpired = !currentExpiry || new Date(currentExpiry) <= now;
    const startArrived = new Date(pending.startDate) <= now;

    if (!isExpired && !startArrived) return false;

    const plan = getPlan(pending.plan);
    if (!plan) {
      // Plan was deleted — cancel the pending plan silently
      await User.findByIdAndUpdate(userId, { $unset: { 'subscription.pendingPlan': '' } });
      return false;
    }

    const previousState = { ...user.subscription };

    // Calculate new expiry from now (or from startDate if it's in the future)
    const baseDate = new Date(pending.startDate) > now ? new Date(pending.startDate) : now;
    const newExpiry = new Date(baseDate.getTime() + pending.durationDays * 24 * 60 * 60 * 1000);

    // Apply the upgrade atomically — use foundAndUpdate with filter on pendingPlan existence
    // This ensures only one concurrent call succeeds (the first to reach the update)
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        'subscription.pendingPlan': { $exists: true },
      },
      {
        $set: {
          'subscription.plan': pending.plan,
          'subscription.status': 'active',
          'subscription.flags.trial': false,
          'subscription.expiryDate': newExpiry,
          'subscription.lastRenewedAt': now,
          'subscription.updatedAt': now,
        },
        $unset: { 'subscription.pendingPlan': '' },
        $inc: {
          'subscription.renewalCount': 1,
          'subscription.version': 1,
        },
      },
      { new: true }
    ).lean();

    // If another concurrent call already handled activation, nothing was updated
    if (!updatedUser) return false;

    await AuditLog.record({
      action: 'subscription_upgrade_activated',
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: pending.assignedBy || null,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: 'Pending plan activated — upgrade applied',
      notes: '',
      source: 'system',
      correlationId: null,
    });

    logger.info({
      userId,
      fromPlan: previousState.plan,
      toPlan: pending.plan,
      newExpiry,
    }, 'Pending plan activated automatically');

    return true;
  }

  // ═══════════════════════════════════════════════════════
  //  Public Mutation Methods
  // ═══════════════════════════════════════════════════════

  /**
   * Assign an initial subscription to a user.
   *
   * @param {string} userId - Target user ID
   * @param {string} planId - Plan ID from plans config
   * @param {object} [options]
   * @param {string} [options.activationDate] - Optional future activation date (ISO string)
   * @param {number} [options.customDurationDays] - Required if plan is 'custom'
   * @param {string} [options.reason] - Why created
   * @param {string} [options.notes] - Admin notes
   * @param {string} options.actorUserId - Admin performing the action
   * @param {string} [options.source='api'] - Source of the action
   * @param {string} [options.correlationId] - UUID for tracing
   * @returns {Promise<object>} Updated user document
   * @throws {ApiError} If plan invalid, user already has subscription, or validation fails
   */
  static async create(userId, planId, options = {}) {
    // Validate plan
    const plan = getPlan(planId);
    if (!plan || !plan.isActive) {
      throw ApiError.badRequest(`Invalid or inactive plan: '${planId}'`);
    }

    // Validate custom duration
    if (planId === 'custom') {
      const customDays = options.customDurationDays;
      if (!customDays || customDays < 1 || customDays > 3650) {
        throw ApiError.badRequest('Custom duration must be between 1 and 3650 days');
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Check existing subscription
    if (user.subscription && user.subscription.status) {
      throw ApiError.conflict('User already has a subscription');
    }

    const now = new Date();
    const previousState = null; // No previous subscription

    // Calculate dates
    const activationDate = options.activationDate
      ? new Date(options.activationDate)
      : now;

    let expiryDate = null;
    let trialEndDate = null;

    if (plan.isTrial) {
      // Trial — set trial end date
      trialEndDate = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
      expiryDate = trialEndDate;
    } else {
      // Standard plan
      const durationMs = (planId === 'custom' ? options.customDurationDays : plan.durationDays)
        * 24 * 60 * 60 * 1000;
      expiryDate = new Date(activationDate.getTime() + durationMs);
    }

    // Build subscription object
    const subscription = {
      plan: planId,
      status: 'active',
      flags: {
        trial: plan.isTrial || false,
      },
      activationDate: activationDate > now ? activationDate : now,
      expiryDate,
      trialEndDate,
      renewalCount: 0,
      lastRenewedAt: now,
      version: 1,
      notes: options.notes || '',
      createdBy: new mongoose.Types.ObjectId(options.actorUserId),
      updatedAt: now,
    };

    // Apply via atomic update
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { subscription } },
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal('Failed to create subscription');
    }

    // Record audit log
    await AuditLog.record({
      action: 'subscription_created',
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState: null,
      newState: { subscription },
      reason: options.reason || 'Initial subscription assignment',
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    logger.info({
      userId,
      planId,
      actor: options.actorUserId,
      expiryDate,
    }, 'Subscription created');

    return updatedUser;
  }

  /**
   * Renew a subscription.
   * If currently active: extend from current expiryDate.
   * If already expired: extend from today.
   *
   * @param {string} userId - Target user ID
   * @param {string} planId - Plan ID
   * @param {object} [options]
   * @param {number} [options.customDurationDays] - Required if plan is 'custom'
   * @param {string} [options.reason] - Why renewed
   * @param {string} [options.notes] - Admin notes
   * @param {string} options.actorUserId - Admin performing the action
   * @param {string} [options.source='api'] - Source of the action
   * @param {string} [options.correlationId] - UUID for tracing
   * @returns {Promise<object>} Updated user document
   * @throws {ApiError} If plan invalid or user has no subscription
   */
  static async renew(userId, planId, options = {}) {
    const plan = getPlan(planId);
    if (!plan || !plan.isActive) {
      throw ApiError.badRequest(`Invalid or inactive plan: '${planId}'`);
    }

    // Validate custom duration
    if (planId === 'custom') {
      const customDays = options.customDurationDays;
      if (!customDays || customDays < 1 || customDays > 3650) {
        throw ApiError.badRequest('Custom duration must be between 1 and 3650 days');
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.subscription || !user.subscription.status) {
      throw ApiError.badRequest('User does not have a subscription to renew');
    }

    // If suspended, renewal implicitly resumes the subscription
    // (the $set below will set status to 'active' regardless of current status)
    if (user.subscription.status === 'suspended') {
      logger.warn({ userId, actor: options.actorUserId }, 'Renewing suspended subscription — will be resumed');
    }

    const now = new Date();
    const previousState = { ...user.subscription.toObject() };

    const durationDays = planId === 'custom' ? options.customDurationDays : plan.durationDays;
    const currentExpiry = user.subscription.expiryDate;

    // Automatic renewal rule (v3 architecture):
    // Active → extend from expiryDate
    // Expired → extend from today
    const newExpiry = this._calculateNewExpiry(currentExpiry, durationDays);

    // Apply update atomically
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'subscription.plan': planId,
          'subscription.status': 'active',
          'subscription.flags.trial': false,
          'subscription.expiryDate': newExpiry,
          'subscription.lastRenewedAt': now,
          'subscription.updatedAt': now,
          'subscription.notes': options.notes || user.subscription.notes || '',
        },
        $inc: {
          'subscription.renewalCount': 1,
          'subscription.version': 1,
        },
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal('Failed to renew subscription');
    }

    // Record audit log
    await AuditLog.record({
      action: 'subscription_renewed',
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: options.reason || 'Subscription renewed',
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    logger.info({
      userId,
      planId,
      previousExpiry: currentExpiry,
      newExpiry,
      actor: options.actorUserId,
    }, 'Subscription renewed');

    return updatedUser;
  }

  /**
   * Extend subscription expiry by a number of days.
   * Always adds to current expiry if active, or from today if expired.
   *
   * @param {string} userId - Target user ID
   * @param {number} days - Number of days to extend (1-3650)
   * @param {object} [options]
   * @param {string} [options.reason] - Why extended
   * @param {string} [options.notes] - Admin notes
   * @param {string} options.actorUserId - Admin performing the action
   * @param {string} [options.source='api']
   * @param {string} [options.correlationId]
   * @returns {Promise<object>} Updated user document
   * @throws {ApiError} If days invalid or user has no subscription
   */
  static async extend(userId, days, options = {}) {
    if (!days || days < 1 || days > 3650) {
      throw ApiError.badRequest('Extension days must be between 1 and 3650');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.subscription || !user.subscription.status) {
      throw ApiError.badRequest('User does not have a subscription to extend');
    }

    const now = new Date();
    const previousState = { ...user.subscription.toObject() };
    const currentExpiry = user.subscription.expiryDate;

    const newExpiry = this._calculateNewExpiry(currentExpiry, days);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'subscription.status': 'active',
          'subscription.expiryDate': newExpiry,
          'subscription.updatedAt': now,
        },
        $inc: {
          'subscription.renewalCount': 1,
          'subscription.version': 1,
        },
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal('Failed to extend subscription');
    }

    await AuditLog.record({
      action: 'subscription_extended',
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: options.reason || `Extended by ${days} day(s)`,
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    return updatedUser;
  }

  /**
   * Activate a disabled or suspended subscription.
   * @param {string} userId - Target user ID
   * @param {object} [options]
   * @returns {Promise<object>} Updated user document
   */
  static async activate(userId, options = {}) {
    return this._setStatus(userId, 'active', 'subscription_activated', 'Subscription activated', options);
  }

  /**
   * Deactivate a subscription (set to disabled).
   * Fully resets the subscription — clears expiry, trials, pending plans.
   * This ensures a deactivated sub can be renewed with a new plan.
   *
   * @param {string} userId - Target user ID
   * @param {object} [options]
   * @returns {Promise<object>} Updated user document
   */
  static async deactivate(userId, options = {}) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.subscription || !user.subscription.status) {
      throw ApiError.badRequest('User does not have a subscription');
    }

    const now = new Date();
    const previousState = { ...user.subscription.toObject() };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'subscription.status': 'disabled',
          'subscription.flags.trial': false,
          'subscription.expiryDate': null,
          'subscription.updatedAt': now,
        },
        $unset: { 'subscription.pendingPlan': '' },
        $inc: { 'subscription.version': 1 },
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal('Failed to deactivate subscription');
    }

    await AuditLog.record({
      action: 'subscription_deactivated',
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: options.reason || 'Subscription deactivated',
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    logger.info({ userId, actor: options.actorUserId }, 'Subscription deactivated');

    return updatedUser;
  }

  /**
   * Suspend a subscription (temporary).
   * @param {string} userId - Target user ID
   * @param {object} [options]
   * @returns {Promise<object>} Updated user document
   */
  static async suspend(userId, options = {}) {
    return this._setStatus(userId, 'suspended', 'subscription_suspended', 'Subscription suspended', options);
  }

  /**
   * Resume a suspended subscription (back to active).
   * @param {string} userId - Target user ID
   * @param {object} [options]
   * @returns {Promise<object>} Updated user document
   */
  static async resume(userId, options = {}) {
    return this._setStatus(userId, 'active', 'subscription_resumed', 'Subscription resumed', options);
  }

  /**
   * Expire a subscription immediately.
   * Sets expiryDate to now and status to expired.
   *
   * @param {string} userId - Target user ID
   * @param {object} [options]
   * @returns {Promise<object>} Updated user document
   */
  static async expire(userId, options = {}) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.subscription || !user.subscription.status) {
      throw ApiError.badRequest('User does not have a subscription');
    }

    const now = new Date();
    const previousState = { ...user.subscription.toObject() };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'subscription.status': 'expired',
          'subscription.expiryDate': now,
          'subscription.updatedAt': now,
        },
        $inc: { 'subscription.version': 1 },
      },
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal('Failed to expire subscription');
    }

    await AuditLog.record({
      action: 'subscription_expired',
      category: 'subscription',
      level: 'warning',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: options.reason || 'Subscription expired immediately',
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    return updatedUser;
  }



  // ═══════════════════════════════════════════════════════
  //  Internal Helpers
  // ═══════════════════════════════════════════════════════

  /**
   * Calculate new expiry date based on the automatic renewal rule (v3 architecture).
   *
   * Active subscription (expiryDate > now):
   *   newExpiry = currentExpiry + durationDays
   *
   * Expired or no subscription:
   *   newExpiry = now + durationDays
   *
   * @param {Date|null} currentExpiry - Current expiry (null if not set)
   * @param {number} durationDays - Plan duration in days
   * @returns {Date} Calculated new expiry date
   * @private
   */
  static _calculateNewExpiry(currentExpiry, durationDays) {
    const now = new Date();
    const baseDate = (currentExpiry && new Date(currentExpiry) > now)
      ? new Date(currentExpiry)
      : now;

    return new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
  }

  /**
   * Internal helper to set subscription status and record audit.
   * Used by activate, deactivate, suspend, resume.
   *
   * @param {string} userId - Target user ID
   * @param {string} newStatus - Target status ('active', 'disabled', 'suspended')
   * @param {string} auditAction - Audit action name
   * @param {string} defaultReason - Default reason text
   * @param {object} options - { reason, notes, actorUserId, source, correlationId }
   * @returns {Promise<object>} Updated user document
   * @private
   */
  static async _setStatus(userId, newStatus, auditAction, defaultReason, options = {}) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.subscription || !user.subscription.status) {
      throw ApiError.badRequest('User does not have a subscription');
    }

    const now = new Date();
    const previousState = { ...user.subscription.toObject() };

    const updateFields = {
      'subscription.status': newStatus,
      'subscription.updatedAt': now,
    };

    // When suspending/deactivating also bump version for token invalidation
    const updateOp = {
      $set: updateFields,
      $inc: { 'subscription.version': 1 },
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateOp,
      { new: true }
    ).lean();

    if (!updatedUser) {
      throw ApiError.internal(`Failed to update subscription status to '${newStatus}'`);
    }

    await AuditLog.record({
      action: auditAction,
      category: 'subscription',
      level: 'info',
      targetUserId: userId,
      actorUserId: options.actorUserId,
      previousState,
      newState: { subscription: updatedUser.subscription },
      reason: options.reason || defaultReason,
      notes: options.notes || '',
      source: options.source || 'api',
      correlationId: options.correlationId || null,
    });

    return updatedUser;
  }
}

module.exports = SubscriptionService;
