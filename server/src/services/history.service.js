// server/src/services/history.service.js
// History Service — watch history listing, pagination, and management
//
// Extracted from history.routes.js (Phase 3, B-001 architecture boundary fix).

const User = require('../models/User.model');
const Content = require('../models/Content.model');
const Episode = require('../models/Episode.model');
const ApiError = require('../utils/ApiError');
const {
  WATCH_HISTORY_TRIM_THRESHOLD,
} = require('../config/constants');

class HistoryService {
  /**
   * Get user's watch history, paginated and populated with content data.
   *
   * @param {string} userId
   * @param {number} page - Page number (1-indexed)
   * @param {number} limit - Items per page (max 50)
   * @returns {Object} { items, total, page, totalPages }
   */
  static async getHistory(userId, page, limit) {
    page = Math.max(1, page);
    limit = Math.min(50, Math.max(1, limit));

    // SC-009: Project only watchHistory — avoids loading the full 400KB+ user document
    const user = await User.findById(userId).select({ watchHistory: 1, _id: 1 });
    if (!user) throw ApiError.notFound('User not found');

    // Defensive trim: if history exceeds trim threshold, trim to max and save
    if ((user.watchHistory || []).length > WATCH_HISTORY_TRIM_THRESHOLD) {
      user.trimWatchHistory();
      await user.save().catch(() => {});
    }

    // Sort by watchedAt descending
    const sorted = (user.watchHistory || [])
      .sort((a, b) => b.watchedAt - a.watchedAt);

    const total = sorted.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedEntries = sorted.slice((page - 1) * limit, page * limit);

    if (paginatedEntries.length === 0) {
      return { items: [], total, page, totalPages };
    }

    // Populate content data
    const contentIds = [...new Set(paginatedEntries.map(e => e.contentId?.toString()).filter(Boolean))];
    const episodeIds = [...new Set(paginatedEntries.map(e => e.episodeId?.toString()).filter(Boolean))];

    const [contents, episodes] = await Promise.all([
      Content.find({ _id: { $in: contentIds } })
        .select('title slug posterPath contentType genres voteAverage releaseDate firstAirDate')
        .lean(),
      Episode.find({ _id: { $in: episodeIds } })
        .select('name episodeNumber seasonNumber contentId stillPath')
        .populate('contentId', 'title slug posterPath contentType')
        .lean(),
    ]);

    const contentMap = {};
    for (const c of contents) contentMap[c._id.toString()] = c;

    const episodeMap = {};
    for (const e of episodes) {
      episodeMap[e._id.toString()] = e;
    }

    const items = paginatedEntries.map((entry) => {
      let content = null;
      let episode = null;

      if (entry.episodeId && episodeMap[entry.episodeId.toString()]) {
        episode = episodeMap[entry.episodeId.toString()];
        content = episode.contentId || contentMap[entry.contentId?.toString()];
      } else if (entry.contentId && contentMap[entry.contentId.toString()]) {
        content = contentMap[entry.contentId.toString()];
      }

      const progressPercent = entry.duration > 0
        ? Math.min(100, Math.round((entry.progress / entry.duration) * 100))
        : 0;

      return {
        _id: entry._id,
        content,
        episode: episode
          ? {
              _id: episode._id,
              name: episode.name,
              episodeNumber: episode.episodeNumber,
              seasonNumber: episode.seasonNumber,
              stillPath: episode.stillPath,
            }
          : null,
        progress: entry.progress,
        duration: entry.duration,
        progressPercent,
        watchedAt: entry.watchedAt,
      };
    });

    // Filter out items where content was deleted
    const validItems = items.filter((i) => i.content);

    return { items: validItems, total, page, totalPages };
  }

  /**
   * Get the last 5 watched items (lightweight, for quick display).
   *
   * @param {string} userId
   * @returns {Array} Up to 5 items with basic content info
   */
  static async getRecentHistory(userId) {
    // SC-009: Project only watchHistory — avoids loading the full user document
    const user = await User.findById(userId).select({ watchHistory: 1, _id: 1 });
    if (!user) throw ApiError.notFound('User not found');

    // Defensive trim
    if ((user.watchHistory || []).length > WATCH_HISTORY_TRIM_THRESHOLD) {
      user.trimWatchHistory();
      await user.save().catch(() => {});
    }

    const recent = (user.watchHistory || [])
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .slice(0, 5);

    if (recent.length === 0) return [];

    // Lightweight populate — just get titles
    const contentIds = [...new Set(recent.map(e => e.contentId?.toString()).filter(Boolean))];
    const contents = await Content.find({ _id: { $in: contentIds } })
      .select('title slug posterPath contentType')
      .lean();

    const contentMap = {};
    for (const c of contents) contentMap[c._id.toString()] = c;

    return recent
      .map((entry) => {
        const content = contentMap[entry.contentId?.toString()];
        if (!content) return null;
        return {
          ...content,
          progress: entry.progress,
          duration: entry.duration,
          watchedAt: entry.watchedAt,
        };
      })
      .filter(Boolean);
  }

  /**
   * Clear watch history. Optionally remove a single item.
   *
   * @param {string} userId
   * @param {string} [contentId] - If provided, only that item is removed. If omitted, all is cleared.
   * @returns {Object} { removed: number, message: string }
   */
  static async clearHistory(userId, contentId) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    if (contentId) {
      // Remove single item
      const before = user.watchHistory.length;
      user.watchHistory = user.watchHistory.filter(
        (entry) => !(entry.contentId && entry.contentId.toString() === contentId)
      );
      const removed = before - user.watchHistory.length;
      await user.save();
      return { removed, message: 'History entry removed' };
    }

    // Clear all
    const count = user.watchHistory.length;
    user.watchHistory = [];
    await user.save();
    return { removed: count, message: 'Watch history cleared' };
  }
}

module.exports = HistoryService;
