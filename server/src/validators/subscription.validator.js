// server/src/validators/subscription.validator.js
// Zod schemas for subscription management request validation.
//
// Architecture reference: SUBSCRIPTION_SYSTEM_v3.md
//
// These schemas define the validation rules for all subscription-related
// API endpoints. They follow the same pattern as auth.validator.js and
// content.validator.js — wrapping body/query/params in a Zod object.

const { z } = require('zod');

/**
 * Plan ID validator — accepts any non-empty string.
 * Server-side validation against DB is done in route handlers.
 */
const planIdSchema = z.string().min(1, 'Plan is required');

/**
 * Create subscription schema
 * - plan: must be a valid plan ID from config
 * - userId: required
 * - activationDate: optional, must be a valid ISO date string
 * - customDurationDays: required if plan is 'custom', 1-3650
 * - notes: optional, max 1000 chars
 */
const createSubscriptionSchema = z.object({
  body: z.object({
    plan: planIdSchema,
    userId: z.string().min(1, 'userId is required'),
    activationDate: z.string().datetime({ offset: true }).optional(),
    customDurationDays: z.number().int('Must be an integer').min(1, 'Minimum 1 day').max(3650, 'Maximum 3650 days').optional(),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
  }),
});

/**
 * Renew subscription schema
 * - plan: must be a valid plan ID from config
 * - reason: optional, max 500 chars (service defaults to 'Subscription renewed')
 * - customDurationDays: required if plan is 'custom', 1-3650
 * - notes: optional, max 1000 chars
 */
const renewSubscriptionSchema = z.object({
  body: z.object({
    plan: planIdSchema,
    reason: z.string().max(500).optional(),
    customDurationDays: z.number().int('Must be an integer').min(1, 'Minimum 1 day').max(3650, 'Maximum 3650 days').optional(),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
  }),
});

/**
 * Extend subscription schema
 * - days: positive integer, max 3650 (10 years)
 * - reason: required, max 500 chars
 * - notes: optional, max 1000 chars
 */
const extendSubscriptionSchema = z.object({
  body: z.object({
    days: z
      .number()
      .int('Days must be an integer')
      .positive('Days must be positive')
      .max(3650, 'Maximum extension is 3650 days (10 years)'),
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
  }),
});

/**
 * Upgrade subscription schema (queue a pending plan)
 * - plan: valid plan ID
 * - reason: required, max 500 chars
 * - customDurationDays: required if plan is 'custom', 1-3650
 * - notes: optional, max 1000 chars
 */
const upgradeSubscriptionSchema = z.object({
  body: z.object({
    plan: planIdSchema,
    reason: z.string().min(1, 'Reason is required').max(500),
    customDurationDays: z.number().int('Must be an integer').min(1, 'Minimum 1 day').max(3650, 'Maximum 3650 days').optional(),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
  }),
});

/**
 * Cancel upgrade schema
 * - reason: required, max 500 chars
 * - notes: optional, max 1000 chars
 */
const cancelUpgradeSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
  }),
});

/**
 * Admin action schema (suspend, resume, activate, deactivate, expire)
 * - reason: required, max 500 chars
 * - notes: optional, max 1000 chars
 */
const adminActionSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
  }),
});

/**
 * Modify dates schema (Super Admin only)
 * - activationDate: optional valid ISO date
 * - expiryDate: optional valid ISO date (must be after activationDate)
 * - reason: required
 */
const modifyDatesSchema = z.object({
  body: z.object({
    activationDate: z.string().datetime({ offset: true }).optional(),
    expiryDate: z.string().datetime({ offset: true }).optional(),
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
  }),
});

/**
 * Add notes schema
 * - notes: required, max 1000 chars
 */
const addNotesSchema = z.object({
  body: z.object({
    notes: z.string().min(1, 'Notes are required').max(1000),
  }),
});

/**
 * Ownership transfer schema
 * - targetUserId: required
 * - newOwnerId: required
 * - reason: required
 */
const ownershipTransferSchema = z.object({
  body: z.object({
    targetUserId: z.string().min(1, 'Target user ID is required'),
    newOwnerId: z.string().min(1, 'New owner ID is required'),
    reason: z.string().min(1, 'Reason is required').max(500),
  }),
});

/**
 * Batch ownership transfer schema
 * - targetUserIds: array of user IDs, min 1, max 100
 * - newOwnerId: required
 * - reason: required
 */
const ownershipTransferBatchSchema = z.object({
  body: z.object({
    targetUserIds: z
      .array(z.string().min(1))
      .min(1, 'At least one user ID is required')
      .max(100, 'Maximum 100 users per batch transfer'),
    newOwnerId: z.string().min(1, 'New owner ID is required'),
    reason: z.string().min(1, 'Reason is required').max(500),
  }),
});

/**
 * Ownership transfer all schema
 * - currentOwnerId: required
 * - newOwnerId: required
 * - reason: required
 */
const ownershipTransferAllSchema = z.object({
  body: z.object({
    currentOwnerId: z.string().min(1, 'Current owner ID is required'),
    newOwnerId: z.string().min(1, 'New owner ID is required'),
    reason: z.string().min(1, 'Reason is required').max(500),
  }),
});

/**
 * Manager quota update schema (Super Admin only)
 * - maxMembers: optional positive integer
 * - maxActiveMembers: optional positive integer
 * - maxTrials: optional positive integer
 * - maxRenewalsPerDay: optional positive integer
 * - maxPasswordResetsPerDay: optional positive integer
 * - maxSubscriptionExtensionsPerDay: optional positive integer
 */
const quotaUpdateSchema = z.object({
  body: z.object({
    maxMembers: z.number().int().positive().optional(),
    maxActiveMembers: z.number().int().positive().optional(),
    maxTrials: z.number().int().positive().optional(),
    maxRenewalsPerDay: z.number().int().positive().optional(),
    maxPasswordResetsPerDay: z.number().int().positive().optional(),
    maxSubscriptionExtensionsPerDay: z.number().int().positive().optional(),
  }),
});

/**
 * System setting update schema
 * - value: required (any type)
 * - description: optional string
 */
const settingUpdateSchema = z.object({
  body: z.object({
    value: z.any(),
    description: z.string().max(500).optional(),
  }),
});

// ── Params schemas ──

const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
});

const settingKeyParamSchema = z.object({
  params: z.object({
    key: z.string().min(1, 'Setting key is required'),
  }),
});

const managerIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Manager ID is required'),
  }),
});

module.exports = {
  // Plan validation
  planIdSchema,

  // Subscription action schemas
  createSubscriptionSchema,
  renewSubscriptionSchema,
  extendSubscriptionSchema,
  upgradeSubscriptionSchema,
  cancelUpgradeSchema,
  adminActionSchema,
  modifyDatesSchema,
  addNotesSchema,

  // Ownership schemas
  ownershipTransferSchema,
  ownershipTransferBatchSchema,
  ownershipTransferAllSchema,

  // Admin schemas
  quotaUpdateSchema,
  settingUpdateSchema,

  // Params schemas
  userIdParamSchema,
  settingKeyParamSchema,
  managerIdParamSchema,
};
