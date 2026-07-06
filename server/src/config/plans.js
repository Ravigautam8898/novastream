// server/src/config/plans.js
// Plan template definitions — single source of truth for all subscription plans.
//
// Plans are NOT hardcoded in models. New plans can be added here without
// changing business logic. Each plan template is used by SubscriptionService
// to calculate durations, display labels, and determine behavior.
//
// Architecture reference: SUBSCRIPTION_SYSTEM_v3.md §7

const PLANS = {
  trial: {
    id: 'trial',
    label: 'Trial',
    description: '7-day free trial with full access',
    durationDays: 7,
    isTrial: true,
    displayOrder: 1,
    badgeColor: 'blue',
    isDefault: true,
    isVisible: true,
    isActive: true,
    internalNotes: 'One trial per user enforced by service logic',
    // Future billing placeholders
    metadata: {},
    price: null,
    currency: null,
  },

  '30d': {
    id: '30d',
    label: '30 Days',
    description: 'One month of unlimited streaming',
    durationDays: 30,
    isTrial: false,
    displayOrder: 2,
    badgeColor: 'green',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: '',
    metadata: {},
    price: null,
    currency: null,
  },

  '60d': {
    id: '60d',
    label: '60 Days',
    description: 'Two months of unlimited streaming',
    durationDays: 60,
    isTrial: false,
    displayOrder: 3,
    badgeColor: 'green',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: '',
    metadata: {},
    price: null,
    currency: null,
  },

  '90d': {
    id: '90d',
    label: '90 Days',
    description: 'Three months of unlimited streaming',
    durationDays: 90,
    isTrial: false,
    displayOrder: 4,
    badgeColor: 'teal',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: '',
    metadata: {},
    price: null,
    currency: null,
  },

  '120d': {
    id: '120d',
    label: '120 Days',
    description: 'Four months of unlimited streaming',
    durationDays: 120,
    isTrial: false,
    displayOrder: 5,
    badgeColor: 'teal',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: '',
    metadata: {},
    price: null,
    currency: null,
  },

  '180d': {
    id: '180d',
    label: '180 Days',
    description: 'Six months of unlimited streaming',
    durationDays: 180,
    isTrial: false,
    displayOrder: 6,
    badgeColor: 'purple',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: '',
    metadata: {},
    price: null,
    currency: null,
  },

  '365d': {
    id: '365d',
    label: '365 Days',
    description: 'One year of unlimited streaming',
    durationDays: 365,
    isTrial: false,
    displayOrder: 7,
    badgeColor: 'purple',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: '',
    metadata: {},
    price: null,
    currency: null,
  },

  '730d': {
    id: '730d',
    label: '730 Days',
    description: 'Two years of unlimited streaming',
    durationDays: 730,
    isTrial: false,
    displayOrder: 8,
    badgeColor: 'purple',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: '',
    metadata: {},
    price: null,
    currency: null,
  },

  custom: {
    id: 'custom',
    label: 'Custom Duration',
    description: 'Manually specified duration in days',
    durationDays: null,
    isTrial: false,
    displayOrder: 100,
    badgeColor: 'purple',
    isDefault: false,
    isVisible: true,
    isActive: true,
    internalNotes: 'Requires manual duration input at creation. Validated by Zod.',
    metadata: {},
    price: null,
    currency: null,
  },
};

/**
 * Get a plan by its ID.
 * @param {string} planId - Plan identifier (e.g. '30d', '90d')
 * @returns {object|null} Plan template or null if not found
 */
function getPlan(planId) {
  return PLANS[planId] || null;
}

/**
 * Get all active (usable) plans, sorted by display order.
 * @returns {object[]} Array of plan objects
 */
function getActivePlans() {
  return Object.values(PLANS)
    .filter(p => p.isActive && p.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Get all plans (including inactive/hidden), for admin display.
 * @returns {object[]} Array of plan objects
 */
function getAllPlans() {
  return Object.values(PLANS)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Check if a plan ID is valid and active.
 * @param {string} planId - Plan identifier
 * @returns {boolean}
 */
function isValidPlan(planId) {
  const plan = PLANS[planId];
  return !!plan && plan.isActive;
}

module.exports = {
  PLANS,
  getPlan,
  getActivePlans,
  getAllPlans,
  isValidPlan,
};
