// server/src/services/admin-user.service.js
// Admin User Service — user CRUD, password management, activity tracking
//
// Extracted from admin.routes.js (Phase 3, B-001 + B-003 architecture boundary fix).

const bcrypt = require('bcryptjs');
const { canCreateRole } = require('../config/roles');
const User = require('../models/User.model');
const Session = require('../models/Session.model');
const Content = require('../models/Content.model');
const Episode = require('../models/Episode.model');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { withTransaction } = require('../utils/transaction');
const { incrementStreamTokenVersion } = require('./stream.service');

class AdminUserService {
  /**
   * List all users with enriched subscription data.
   *
   * @param {Object} currentUser - The requesting admin user
   * @param {Date} [now] - Timestamp for computing daysRemaining
   * @returns {Object} { users, total }
   */
  static async listUsers(currentUser, now = new Date()) {
    const query = {};
    if (currentUser.role === 'manager') {
      query.createdBy = currentUser._id;
    }

    const users = await User.find(query)
      .select('username displayName role isActive subscription lastLoginAt lastLoginIp createdAt createdBy')
      .populate('createdBy', 'username displayName role')
      .sort({ createdAt: -1 })
      .lean();

    const enriched = users.map(u => {
      if (u.subscription && u.subscription.expiryDate) {
        const diffMs = new Date(u.subscription.expiryDate).getTime() - now.getTime();
        u.subscription.daysRemaining = diffMs <= 0 ? 0 : Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }
      return u;
    });

    return { users: enriched, total: enriched.length };
  }

  /**
   * Create a new user.
   *
   * @param {Object} creator - The user creating the new account
   * @param {string} username
   * @param {string} password
   * @param {string} [role='member']
   * @param {string} [displayName]
   * @returns {Object} Created user data (safe fields only)
   */
  static async createUser(creator, username, password, role, displayName) {
    const existing = await User.findOne({ username });
    if (existing) {
      throw ApiError.conflict(`User '${username}' already exists`);
    }

    if (!canCreateRole(creator.role, role)) {
      throw ApiError.forbidden('You do not have permission to create users with this role');
    }

    const user = await User.createUser(
      username,
      password,
      role || 'member',
      creator._id
    );

    if (displayName && displayName !== username) {
      user.displayName = displayName;
      await user.save();
    }

    logger.info({ username, role: user.role, createdBy: creator.username }, 'Admin: user created');

    return {
      _id: user._id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      isActive: user.isActive,
    };
  }

  /**
   * Delete a user by ID with safety checks.
   *
   * @param {Object} actor - The admin performing the deletion
   * @param {string} targetId - MongoDB _id of the user to delete
   * @returns {string} Deleted username
   */
  static async deleteUser(actor, targetId) {
    if (targetId === actor._id.toString()) {
      throw ApiError.badRequest('Cannot delete your own account');
    }

    const user = await User.findById(targetId)
      .select('-watchHistory -watchlist -loginHistory');
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Manager scope check
    if (actor.role === 'manager') {
      if (!user.createdBy || user.createdBy.toString() !== actor._id.toString()) {
        throw ApiError.forbidden('You can only manage users you created');
      }
    }

    // Prevent deleting the last admin
    if (user.role === 'admin' || user.role === 'super_admin') {
      const adminCount = await User.countDocuments({
        $or: [{ role: 'admin' }, { role: 'super_admin' }],
        isActive: true,
      });
      if (adminCount <= 1) {
        throw ApiError.badRequest('Cannot delete the last admin account');
      }
    }

    const username = user.username;

    await withTransaction(async (session) => {
      await User.findByIdAndDelete(targetId).session(session);
      await Session.deleteMany({ userId: targetId }).session(session);
    });

    logger.info({ username, deletedBy: actor.username }, 'Admin: user deleted');
    return username;
  }

  /**
   * Reset a user's password and invalidate all sessions.
   *
   * @param {Object} actor - The admin performing the reset
   * @param {string} targetId - MongoDB _id of the user
   * @param {string} newPassword - New password (min 6 chars)
   * @returns {string} Username of the affected user
   */
  static async resetPassword(actor, targetId, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw ApiError.badRequest('Password must be at least 6 characters');
    }

    const user = await User.findById(targetId)
      .select('-watchHistory -watchlist -loginHistory');
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (actor.role === 'manager') {
      if (!user.createdBy || user.createdBy.toString() !== actor._id.toString()) {
        throw ApiError.forbidden('You can only manage users you created');
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);

    await withTransaction(async (session) => {
      await user.save({ session });
      await Session.updateMany(
        { userId: targetId, isActive: true },
        { isActive: false },
        { session }
      );
    });

    // ST-006: Increment stream token version to revoke all existing stream tokens
    await incrementStreamTokenVersion(targetId).catch((err) => {
      logger.warn({ err, userId: targetId }, 'Stream token version increment failed (non-fatal)');
    });

    logger.info({ username: user.username, resetBy: actor.username }, 'Admin: password reset');
    return user.username;
  }

  /**
   * Get full activity timeline for a specific user.
   *
   * Performance: Uses batch queries instead of Mongoose .populate() (which fires
   * individual queries per path). Collects contentIds upfront and fetches all
   * referenced documents in 2 batch queries (Content + Episode).
   *
   * @param {string} targetUserId
   * @returns {Object} { username, displayName, total, activity }
   */
  static async getUserActivity(targetUserId) {
    const user = await User.findById(targetUserId)
      .select('username displayName watchHistory loginHistory watchlist')
      .lean();

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Clean up stale references before loading content
    await User.removeStaleWatchRefs(targetUserId).catch((err) => {
      logger.warn({ err, userId: targetUserId }, 'Stale ref cleanup failed (non-fatal)');
    });

    // Re-fetch user after cleanup (stale refs may have been removed)
    const cleanedUser = await User.findById(targetUserId)
      .select('username displayName watchHistory loginHistory watchlist')
      .lean();

    if (!cleanedUser) {
      throw ApiError.notFound('User not found');
    }

    user.watchHistory = cleanedUser.watchHistory;
    user.watchlist = cleanedUser.watchlist;

    // Collect all referenced content/episode IDs for batch fetching
    const contentIds = new Set();
    const episodeIds = new Set();

    for (const entry of (user.watchHistory || [])) {
      if (entry.contentId) contentIds.add(entry.contentId.toString());
      if (entry.episodeId) episodeIds.add(entry.episodeId.toString());
    }
    for (const entry of (user.watchlist || [])) {
      if (entry.contentId) contentIds.add(entry.contentId.toString());
    }

    // Batch fetch all referenced documents
    const [contentDocs, episodeDocs] = await Promise.all([
      contentIds.size > 0
        ? Content.find({ _id: { $in: [...contentIds] } })
            .select('title slug posterPath contentType')
            .lean()
        : [],
      episodeIds.size > 0
        ? Episode.find({ _id: { $in: [...episodeIds] } })
            .select('name episodeNumber seasonNumber')
            .lean()
        : [],
    ]);

    const contentMap = {};
    for (const c of contentDocs) contentMap[c._id.toString()] = c;

    const episodeMap = {};
    for (const e of episodeDocs) episodeMap[e._id.toString()] = e;

    // Build activity timeline from batch data
    const activity = [];

    for (const entry of (user.watchHistory || [])) {
      const content = entry.contentId ? contentMap[entry.contentId.toString()] : null;
      const episode = entry.episodeId ? episodeMap[entry.episodeId.toString()] : null;
      if (!content) continue;
      activity.push({
        type: 'watch',
        content: {
          _id: content._id,
          title: content.title,
          slug: content.slug,
          posterPath: content.posterPath,
        },
        episode: episode ? {
          _id: episode._id,
          name: episode.name,
          episodeNumber: episode.episodeNumber,
          seasonNumber: episode.seasonNumber,
        } : null,
        progress: entry.progress,
        duration: entry.duration,
        timestamp: entry.watchedAt,
      });
    }

    for (const entry of (user.loginHistory || [])) {
      activity.push({
        type: 'login',
        ip: entry.ip,
        userAgent: entry.userAgent,
        timestamp: entry.loggedInAt,
      });
    }

    for (const entry of (user.watchlist || [])) {
      if (!entry.contentId) continue;
      const content = contentMap[entry.contentId.toString()];
      if (!content) continue;
      activity.push({
        type: 'favorite',
        content: {
          _id: content._id,
          title: content.title,
          slug: content.slug,
        },
        timestamp: entry.addedAt,
      });
    }

    activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      username: user.username,
      displayName: user.displayName,
      total: activity.length,
      activity: activity.slice(0, 100),
    };
  }

  /**
   * Get recent activity across ALL users (last 50 actions).
   *
   * Performance: Uses batch content query instead of N+1 individual lookups.
   *
   * @returns {Object} { items, total }
   */
  static async getRecentActivity() {
    const users = await User.find({ isActive: true })
      .select('username displayName watchHistory')
      .limit(200)
      .lean();

    // Collect ALL contentIds from all users in one pass (instead of N+1 queries)
    const allContentIds = new Set();
    const rawEntries = [];

    for (const user of users) {
      for (const entry of (user.watchHistory || []).slice(-10)) {
        if (entry.contentId) {
          allContentIds.add(entry.contentId.toString());
          rawEntries.push({
            userId: user._id,
            username: user.username,
            displayName: user.displayName,
            contentId: entry.contentId.toString(),
            progress: entry.progress,
            duration: entry.duration,
            timestamp: entry.watchedAt,
          });
        }
      }
    }

    if (rawEntries.length === 0) {
      return { items: [], total: 0 };
    }

    // Batch fetch all referenced content in a single query
    const contentMap = {};
    if (allContentIds.size > 0) {
      const contents = await Content.find({ _id: { $in: [...allContentIds] } })
        .select('title slug contentType')
        .lean();
      for (const c of contents) {
        contentMap[c._id.toString()] = c;
      }
    }

    // Build items from batch data
    const items = [];
    for (const entry of rawEntries) {
      const content = contentMap[entry.contentId];
      if (!content) continue;
      items.push({
        userId: entry.userId,
        username: entry.username,
        displayName: entry.displayName,
        type: 'watch',
        content: {
          _id: content._id,
          title: content.title,
          slug: content.slug,
          contentType: content.contentType,
        },
        progress: entry.progress,
        duration: entry.duration,
        timestamp: entry.timestamp,
      });
    }

    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return { items: items.slice(0, 50), total: items.length > 50 ? items.length : items.slice(0, 50).length };
  }
}

module.exports = AdminUserService;
