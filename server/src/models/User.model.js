// server/src/models/User.model.js
// User model — admin-created, no public registration

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  WATCH_HISTORY_MAX,
  FAVORITES_MAX,
} = require('../config/constants');

const loginEntrySchema = new mongoose.Schema({
  ip: { type: String },
  userAgent: { type: String },
  loggedInAt: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[a-zA-Z0-9_]+$/,
    index: true,
  },
  passwordHash: { type: String, required: true },
  displayName: { type: String, trim: true, maxlength: 100 },

  role: {
    type: String,
    enum: ['super_admin', 'manager', 'member'],
    default: 'member',
    index: true,
  },

  // Account lifecycle status (soft delete support)
  accountStatus: {
    type: String,
    enum: ['active', 'disabled', 'archived', 'soft_deleted'],
    default: 'active',
    index: true,
  },

  isActive: { type: Boolean, default: true, index: true },

  // Subscription fields
  subscription: {
    plan: { type: String },
    status: {
      type: String,
      enum: ['active', 'expired', 'suspended', 'disabled'],
    },
    flags: {
      trial: { type: Boolean, default: false },
    },
    activationDate: { type: Date },
    expiryDate: { type: Date },
    trialEndDate: { type: Date },
    renewalCount: { type: Number, default: 0 },
    lastRenewedAt: { type: Date },
    version: { type: Number, default: 1 },
    notes: { type: String, maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date },

    // Pending plan — queued upgrade that auto-activates when current plan expires
    pendingPlan: {
      plan: { type: String },
      startDate: { type: Date },
      durationDays: { type: Number },
      assignedAt: { type: Date },
      assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  },

  // Manager quota usage tracking
  quotaUsage: {
    membersCreated: { type: Number, default: 0 },
    renewalsToday: { type: Number, default: 0 },
    passwordResetsToday: { type: Number, default: 0 },
    extensionsToday: { type: Number, default: 0 },
    lastResetDate: { type: Date },
  },

  // Who created this user (null = system/seeded)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // When this user was soft-deleted (null if not deleted)
  deletedAt: { type: Date, default: null },

  // Who soft-deleted this user
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // Session tracking
  lastLoginAt: { type: Date },
  lastLoginIp: { type: String },
  loginHistory: {
    type: [loginEntrySchema],
    default: [],
    maxlength: 50, // Keep last 50 logins
  },

  // Stream token version — incremented on password reset/logout
  // to invalidate all existing stream tokens
  streamTokenVersion: { type: Number, default: 0 },

  // Watch history (references)
  watchHistory: [{
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Content' },
    episodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Episode' },
    progress: { type: Number, default: 0 },  // Seconds watched
    duration: { type: Number, default: 0 },   // Total duration
    watchedAt: { type: Date, default: Date.now },
  }],

  // Watchlist
  watchlist: [{
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Content' },
    addedAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.passwordHash;
      delete ret.loginHistory;
      delete ret.__v;
      return ret;
    },
  },
});

// ── Indexes ──
userSchema.index({ isActive: 1, role: 1 });

// ── Instance Methods ──
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Trim watch history to the configured maximum.
 * Sorts by most recent watchedAt and drops the oldest entries.
 * Returns true if trimming occurred, false if no action needed.
 */
userSchema.methods.trimWatchHistory = function () {
  if (!this.watchHistory || this.watchHistory.length <= WATCH_HISTORY_MAX) return false;
  this.watchHistory.sort((a, b) => b.watchedAt - a.watchedAt);
  this.watchHistory = this.watchHistory.slice(0, WATCH_HISTORY_MAX);
  return true;
};

/**
 * Trim favorites/watchlist to the configured maximum.
 * Sorts by most recent addedAt and drops the oldest entries.
 * Returns true if trimming occurred, false if no action needed.
 */
userSchema.methods.trimWatchlist = function () {
  if (!this.watchlist || this.watchlist.length <= FAVORITES_MAX) return false;
  this.watchlist.sort((a, b) => b.addedAt - a.addedAt);
  this.watchlist = this.watchlist.slice(0, FAVORITES_MAX);
  return true;
};

userSchema.methods.recordLogin = function (ip, userAgent) {
  this.lastLoginAt = new Date();
  this.lastLoginIp = ip;
  this.loginHistory.push({ ip, userAgent, loggedInAt: this.lastLoginAt });
  if (this.loginHistory.length > 50) {
    this.loginHistory = this.loginHistory.slice(-50);
  }
};

// ── Statics ──
/**
 * Remove watch history and watchlist entries that reference deleted content.
 * Queries Content collection once to check which refs are still valid.
 * Returns the count of stale entries removed.
 */
userSchema.statics.removeStaleWatchRefs = async function (userId) {
  const user = await this.findById(userId);
  if (!user) return 0;

  // Collect all referenced contentIds
  const watchContentIds = [...new Set(
    (user.watchHistory || [])
      .map(e => e.contentId?.toString())
      .filter(Boolean)
  )];
  const watchlistContentIds = [...new Set(
    (user.watchlist || [])
      .map(e => e.contentId?.toString())
      .filter(Boolean)
  )];

  const allIds = [...new Set([...watchContentIds, ...watchlistContentIds])];
  if (allIds.length === 0) return 0;

  // Find which content docs still exist
  const existing = await mongoose.model('Content').find(
    { _id: { $in: allIds } },
    { _id: 1 }
  ).lean();

  const existingIds = new Set(existing.map(c => c._id.toString()));

  // Filter out stale refs
  const beforeHistory = user.watchHistory.length;
  user.watchHistory = (user.watchHistory || []).filter(
    e => !e.contentId || existingIds.has(e.contentId.toString())
  );

  const beforeWatchlist = user.watchlist.length;
  user.watchlist = (user.watchlist || []).filter(
    e => !e.contentId || existingIds.has(e.contentId.toString())
  );

  const totalRemoved = (beforeHistory - user.watchHistory.length) +
    (beforeWatchlist - user.watchlist.length);

  if (totalRemoved > 0) {
    await user.save();
  }

  return totalRemoved;
};

userSchema.statics.findByUsername = function (username) {
  return this.findOne({ username: username.toLowerCase().trim() });
};

/**
 * Create a user with hashed password.
 * This is the canonical user creation method — all password hashing
 * is handled here with a consistent 12 bcrypt rounds.
 *
 * Used by:
 *   - admin routes (POST /api/admin/users)
 *   - novactl CLI (novactl user add — uses native MongoDB driver directly)
 *
 * @param {string} username - Username (lowercased, trimmed)
 * @param {string} password - Plaintext password (will be hashed)
 * @param {string} [role='member'] - 'super_admin', 'manager', or 'member'
 * @param {string|null} [createdBy=null] - Admin user ID who created this user
 * @returns {Promise<Document>} Saved user document
 */
userSchema.statics.createUser = async function (username, password, role = 'member', createdBy = null) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = new this({
    username,
    passwordHash,
    displayName: username,
    role,
    createdBy,
  });
  return user.save();
};

module.exports = mongoose.model('User', userSchema);
