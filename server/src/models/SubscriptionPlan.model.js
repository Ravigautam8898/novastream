// server/src/models/SubscriptionPlan.model.js
// SubscriptionPlan model — stored plans with CRUD management.
// Seeds default plans on first load if collection is empty.

const mongoose = require('mongoose');
const logger = require('../config/logger');

const planSchema = new mongoose.Schema({
  // Unique identifier (slug-like, e.g. 'trial', 'monthly', 'diwali-offer')
  planId: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  durationDays: {
    type: Number,
    default: null, // null = indefinite (custom)
  },
  price: {
    type: Number,
    default: null,
  },
  currency: {
    type: String,
    default: 'USD',
    maxlength: 3,
  },
  type: {
    type: String,
    enum: ['trial', 'standard', 'promotional', 'custom'],
    default: 'standard',
    index: true,
  },
  maxDevices: {
    type: Number,
    default: null,
  },
  maxStreams: {
    type: Number,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  isTrial: {
    type: Boolean,
    default: false,
  },
  displayOrder: {
    type: Number,
    default: 50,
  },
  badgeColor: {
    type: String,
    default: 'blue',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(doc, ret) {
      delete ret.__v;
      delete ret.metadata;
      return ret;
    },
  },
});

planSchema.index({ isActive: 1, displayOrder: 1 });

// ── Statics ──

/**
 * Get active plans sorted by display order.
 */
planSchema.statics.getActivePlans = function () {
  return this.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
};

/**
 * Get all plans (including disabled) sorted by display order.
 */
planSchema.statics.getAllPlans = function () {
  return this.find({}).sort({ displayOrder: 1 }).lean();
};

/**
 * Find a plan by planId.
 */
planSchema.statics.findByPlanId = function (planId) {
  return this.findOne({ planId: planId.toLowerCase().trim() }).lean();
};

/**
 * Check if a plan ID is valid and active.
 */
planSchema.statics.isValidPlan = async function (planId) {
  const plan = await this.findOne({ planId: planId.toLowerCase().trim() }).lean();
  return !!plan && plan.isActive;
};

// ── Seed Default Plans ──

const DEFAULT_SEED_PLANS = [
  {
    planId: 'trial',
    name: 'Trial',
    description: '7-day free trial with full access',
    durationDays: 7,
    type: 'trial',
    isTrial: true,
    displayOrder: 1,
    badgeColor: 'blue',
  },
  {
    planId: '30d',
    name: 'Monthly',
    description: '30 days of unlimited streaming',
    durationDays: 30,
    type: 'standard',
    displayOrder: 2,
    badgeColor: 'green',
  },
  {
    planId: '90d',
    name: 'Quarterly',
    description: '90 days of unlimited streaming',
    durationDays: 90,
    type: 'standard',
    displayOrder: 3,
    badgeColor: 'teal',
  },
  {
    planId: '365d',
    name: 'Yearly',
    description: '365 days of unlimited streaming',
    durationDays: 365,
    type: 'standard',
    displayOrder: 4,
    badgeColor: 'purple',
  },
  {
    planId: 'custom',
    name: 'Custom Duration',
    description: 'Manually specified duration in days',
    durationDays: null,
    type: 'custom',
    displayOrder: 100,
    badgeColor: 'purple',
  },
];

/**
 * Seed default plans if the collection is empty.
 * Called once on app startup.
 */
planSchema.statics.seedDefaults = async function () {
  const count = await this.countDocuments();
  if (count > 0) {
    logger.debug({ planCount: count }, 'Plans already seeded, skipping');
    return;
  }

  logger.info('Seeding default subscription plans...');
  for (const plan of DEFAULT_SEED_PLANS) {
    await this.create(plan);
  }
  logger.info({ seeded: DEFAULT_SEED_PLANS.length }, 'Default plans seeded');
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', planSchema);

module.exports = SubscriptionPlan;
