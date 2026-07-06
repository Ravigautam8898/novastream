// server/src/models/AuditLog.model.js
// Generalized enterprise audit log — every administrative action appends a record.
//
// Architecture reference: SUBSCRIPTION_SYSTEM_v3.md §14
//
// This is the single audit infrastructure for the entire platform.
// All modules (subscription, auth, ownership, settings, content, security)
// use this model to record immutable audit trails.
//
// Key design decisions:
// - Append-only: No update/delete operations exposed. Every record is permanent.
// - Immutable timestamps: createdAt is set once, never modified.
// - Snapshot-based: previousState/newState capture full before/after state.
// - SIEM-ready: Flat fields, correlationId for cross-system tracing, level-based filtering.

const mongoose = require('mongoose');

const AUDIT_CATEGORIES = [
  'user',          // User lifecycle: created, activated, disabled, archived, soft_deleted
  'subscription',  // Subscription changes: created, renewed, extended, suspended, etc.
  'auth',          // Authentication events: login, logout, password_reset
  'ownership',     // Ownership changes: transferred, reassigned
  'settings',      // System settings: updated, bulk_updated
  'role',          // Role changes: promoted, demoted
  'content',       // Content management: created, updated, deactivated
  'security',      // Security events: ip_blocked, honeypot_triggered
  'admin',         // Administrative actions: manager_created, quota_modified
  'system',        // System events: server_started, migration_completed
];

const AUDIT_LEVELS = ['info', 'warning', 'critical'];

const auditLogSchema = new mongoose.Schema({
  // Action performed (e.g. 'subscription_renewed', 'ownership_transferred')
  action: {
    type: String,
    required: true,
    index: true,
  },

  // Audit category for grouping and filtering
  category: {
    type: String,
    required: true,
    enum: AUDIT_CATEGORIES,
    index: true,
  },

  // Severity level
  level: {
    type: String,
    required: true,
    enum: AUDIT_LEVELS,
    default: 'info',
    index: true,
  },

  // The user who was acted upon (nullable — e.g. system events have no target)
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },

  // The admin/system who performed the action
  actorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Snapshot of the affected entity BEFORE the change
  previousState: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },

  // Snapshot of the affected entity AFTER the change
  newState: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },

  // Why the change was made (required for administrative actions)
  reason: {
    type: String,
    default: '',
    maxlength: 1000,
  },

  // Additional context or admin notes
  notes: {
    type: String,
    default: '',
    maxlength: 2000,
  },

  // Source of the action
  source: {
    type: String,
    enum: ['dashboard', 'cli', 'api', 'system'],
    default: 'api',
  },

  // UUID for correlating related audit events across different actions
  correlationId: {
    type: String,
    default: null,
    index: true,
  },

  // Whether ownership validation was performed before the action
  ownershipValidated: {
    type: Boolean,
    default: false,
  },

  // IP address of the actor
  adminIp: {
    type: String,
    default: '',
  },

  // User agent of the actor
  userAgent: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

// ── Indexes ──
auditLogSchema.index({ targetUserId: 1, createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ level: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }); // TTL archival support

// ── Statics ──

/**
 * Record an audit event.
 * @param {object} params
 * @param {string} params.action - Action identifier (e.g. 'subscription_renewed')
 * @param {string} params.category - Audit category
 * @param {string} [params.level='info'] - Severity level
 * @param {string|null} [params.targetUserId=null] - User acted upon
 * @param {string} params.actorUserId - User who performed the action
 * @param {object|null} [params.previousState=null] - Before snapshot
 * @param {object|null} [params.newState=null] - After snapshot
 * @param {string} [params.reason=''] - Why the change was made
 * @param {string} [params.notes=''] - Additional context
 * @param {string} [params.source='api'] - Source of the action
 * @param {string|null} [params.correlationId=null] - UUID for tracing
 * @param {boolean} [params.ownershipValidated=false] - Ownership check performed
 * @param {string} [params.adminIp=''] - Actor IP
 * @param {string} [params.userAgent=''] - Actor user agent
 * @param {object} [params.session=null] - Mongoose ClientSession for transactions
 * @returns {Promise<Document>} Saved audit log entry
 */
auditLogSchema.statics.record = async function (params) {
  const doc = {
    action: params.action,
    category: params.category,
    level: params.level || 'info',
    targetUserId: params.targetUserId || null,
    actorUserId: params.actorUserId,
    previousState: params.previousState || null,
    newState: params.newState || null,
    reason: params.reason || '',
    notes: params.notes || '',
    source: params.source || 'api',
    correlationId: params.correlationId || null,
    ownershipValidated: params.ownershipValidated || false,
    adminIp: params.adminIp || '',
    userAgent: params.userAgent || '',
  };

  if (params.session) {
    return this.create([doc], { session: params.session }).then(r => r[0]);
  }
  return this.create(doc);
};

/**
 * Get audit history for a specific user.
 * @param {string} userId - Target user ID
 * @param {object} [options] - Query options
 * @param {number} [options.limit=50] - Max records
 * @param {number} [options.skip=0] - Records to skip
 * @param {string} [options.category] - Filter by category
 * @param {string} [options.level] - Filter by level
 * @returns {Promise<Document[]>} Sorted audit log entries
 */
auditLogSchema.statics.getUserHistory = async function (userId, options = {}) {
  const query = { targetUserId: userId };
  if (options.category) query.category = options.category;
  if (options.level) query.level = options.level;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0)
    .lean();
};

/**
 * Get audit history for a specific actor (admin).
 * @param {string} actorId - Actor user ID
 * @param {object} [options] - Query options
 * @returns {Promise<Document[]>} Sorted audit log entries
 */
auditLogSchema.statics.getActorHistory = async function (actorId, options = {}) {
  const query = { actorUserId: actorId };
  if (options.category) query.category = options.category;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .skip(options.skip || 0)
    .lean();
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
