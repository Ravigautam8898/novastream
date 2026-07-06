// server/src/services/progress.service.js
// Progress Service — watch history tracking, continue-watching, playback position
//
// Extracted from progress.routes.js (Phase 3, B-001 architecture boundary fix).
// Business logic lives here; routes and controllers are thin layers on top.

const User = require('../models/User.model');
const Content = require('../models/Content.model');
const Episode = require('../models/Episode.model');
const ApiError = require('../utils/ApiError');
const MemoryCache = require('../utils/cache');
const logger = require('../config/logger');
const {
  WATCH_HISTORY_TRIM_THRESHOLD,
  CONTINUE_WATCHING_MIN_REMAINING_SEC,
} = require('../config/constants');

// ── In-Memory Cache ──
// 30-second TTL keyed by userId for continue-watching results.
// Watch history doesn't change during active viewing, so caching
// eliminates redundant DB queries on rapid page navigations.
const continueWatchingCache = new MemoryCache(30 * 1000);

class ProgressService {
  /**
   * Get all items with saved playback progress for the current user.
   * Returns populated content data with progress metadata, sorted by most recent.
   * Filters out nearly-completed items (< 90s remaining).
   *
   * Performance: Uses batch queries (3 total) instead of N+1 individual lookups.
   * Results are cached in-memory for 30 seconds.
   */
  static async getContinueWatching(userId) {
    const userIdStr = userId.toString();

    // Check cache first
    const cached = continueWatchingCache.get(userIdStr);
    if (cached) return cached;

    // SC-009: Project only watchHistory — avoids loading the full user document
    // .lean() avoids heavy Mongoose document hydration for read-only access
    const user = await User.findById(userId).select({ watchHistory: 1, _id: 1 }).lean();
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Defensive trim: if array exceeds 210 entries, trim to 200 and save
    if ((user.watchHistory || []).length > WATCH_HISTORY_TRIM_THRESHOLD) {
      const fullUser = await User.findById(userId);
      fullUser.trimWatchHistory();
      await fullUser.save().catch(() => {});
      user.watchHistory = fullUser.watchHistory;
    }

    // Get watch history, filter out near-complete items, limit to 20
    const recentEntries = (user.watchHistory || [])
      .filter((entry) => {
        const remaining = entry.duration - entry.progress;
        return remaining > CONTINUE_WATCHING_MIN_REMAINING_SEC;
      })
      .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
      .slice(0, 20);

    if (recentEntries.length === 0) {
      continueWatchingCache.set(userIdStr, []);
      return [];
    }

    // ── Batch query approach ──
    const contentIds = [];
    const episodeIds = [];
    for (const entry of recentEntries) {
      if (entry.episodeId) {
        episodeIds.push(entry.episodeId);
      } else if (entry.contentId) {
        contentIds.push(entry.contentId);
      }
    }

    const [contentMap, episodeDocs] = await Promise.all([
      contentIds.length > 0
        ? Content.find({ _id: { $in: contentIds } })
            .select('title slug posterPath backdropPath contentType genres voteAverage releaseDate runtime')
            .lean()
            .then(items => {
              const map = {};
              for (const c of items) map[c._id.toString()] = c;
              return map;
            })
        : Promise.resolve({}),

      episodeIds.length > 0
        ? Episode.find({ _id: { $in: episodeIds } })
            .select('name episodeNumber seasonNumber contentId')
            .lean()
            .then(items => {
              const map = {};
              for (const e of items) map[e._id.toString()] = e;
              return map;
            })
        : Promise.resolve({}),
    ]);

    // Batch 3: Parent content for all episodes
    let episodeParentContents = {};
    if (episodeIds.length > 0) {
      const parentIds = [...new Set(
        Object.values(episodeDocs)
          .map(e => e.contentId?.toString())
          .filter(Boolean)
      )];
      if (parentIds.length > 0) {
        const parents = await Content.find({ _id: { $in: parentIds } })
          .select('title slug posterPath backdropPath contentType genres voteAverage')
          .lean();
        for (const p of parents) episodeParentContents[p._id.toString()] = p;
      }
    }

    // Build result entries from batch data
    const items = [];
    for (const entry of recentEntries) {
      const progressPercent = entry.duration > 0
        ? Math.min(100, Math.round((entry.progress / entry.duration) * 100))
        : 0;

      if (entry.episodeId) {
        const epId = entry.episodeId.toString();
        const episode = episodeDocs[epId];
        if (!episode) continue;

        const parentContent = episodeParentContents[episode.contentId?.toString()];
        if (!parentContent) continue;

        items.push({
          _id: parentContent._id,
          episodeId: epId,
          title: parentContent.title,
          slug: parentContent.slug,
          posterPath: parentContent.posterPath,
          backdropPath: parentContent.backdropPath,
          contentType: 'series',
          genres: parentContent.genres,
          voteAverage: parentContent.voteAverage,
          episodeName: episode.name || `Episode ${episode.episodeNumber}`,
          episodeNumber: episode.episodeNumber,
          seasonNumber: episode.seasonNumber,
          progress: entry.progress,
          duration: entry.duration,
          progressPercent,
          watchedAt: entry.watchedAt,
        });
      } else if (entry.contentId) {
        const cId = entry.contentId.toString();
        const content = contentMap[cId];
        if (!content) continue;

        items.push({
          ...content,
          progress: entry.progress,
          duration: entry.duration,
          progressPercent,
          watchedAt: entry.watchedAt,
        });
      }
    }

    continueWatchingCache.set(userIdStr, items);
    return items;
  }

  /**
   * Remove a specific item from the user's continue watching list.
   *
   * @param {string} userId - MongoDB _id of the user
   * @param {string} itemId - MongoDB _id of the Content or Episode
   * @param {string} contentType - 'movie' or 'episode'
   * @returns {number} Number of entries removed
   */
  static async removeFromContinueWatching(userId, itemId, contentType) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const beforeCount = user.watchHistory.length;

    if (contentType === 'episode') {
      user.watchHistory = user.watchHistory.filter(
        (entry) => !(entry.episodeId && entry.episodeId.toString() === itemId)
      );
    } else {
      user.watchHistory = user.watchHistory.filter(
        (entry) => entry.contentId && entry.contentId.toString() === itemId && !entry.episodeId
      );
    }

    const removed = beforeCount - user.watchHistory.length;

    if (removed > 0) {
      await user.save();
    }

    return removed;
  }

  /**
   * Save or update playback progress for a user.
   *
   * @param {string} userId - MongoDB _id of the user
   * @param {string} contentId - MongoDB _id of the Content or Episode
   * @param {string} contentType - 'movie' or 'episode'
   * @param {number} progress - Current playback position in seconds
   * @param {number} duration - Total duration of the content in seconds
   * @returns {Object} { saved, contentId, progress, duration }
   */
  static async saveProgress(userId, contentId, contentType, progress, duration) {
    if (!contentId || !contentType || progress === undefined || !duration) {
      throw ApiError.badRequest(
        'Missing required fields: contentId, contentType, progress, duration'
      );
    }

    if (!['movie', 'episode'].includes(contentType)) {
      throw ApiError.badRequest('contentType must be "movie" or "episode"');
    }

    const progressNum = Number(progress);
    const durationNum = Number(duration);

    if (isNaN(progressNum) || progressNum < 0) {
      throw ApiError.badRequest('progress must be a non-negative number');
    }

    if (isNaN(durationNum) || durationNum <= 0) {
      throw ApiError.badRequest('duration must be a positive number');
    }

    const episodeId = contentType === 'episode' ? contentId : null;
    const contentObjectId = contentType === 'episode' ? null : contentId;

    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Find existing watch history entry for this content/episode
    const existingIndex = user.watchHistory.findIndex((entry) => {
      if (episodeId) {
        return entry.episodeId && entry.episodeId.toString() === episodeId;
      }
      return entry.contentId && entry.contentId.toString() === contentObjectId && !entry.episodeId;
    });

    if (existingIndex >= 0) {
      // Update existing entry
      user.watchHistory[existingIndex].progress = progressNum;
      user.watchHistory[existingIndex].duration = durationNum;
      user.watchHistory[existingIndex].watchedAt = new Date();
    } else {
      // Push new entry
      user.watchHistory.push({
        contentId: contentObjectId,
        episodeId,
        progress: progressNum,
        duration: durationNum,
        watchedAt: new Date(),
      });
      user.trimWatchHistory();
    }

    await user.save();

    return { saved: true, contentId, progress: progressNum, duration: durationNum };
  }

  /**
   * Get saved playback progress for a content item or episode.
   *
   * @param {string} userId - MongoDB _id of the user
   * @param {string} type - 'movie' or 'episode'
   * @param {string} id - MongoDB _id of the Content or Episode
   * @returns {Object} { hasProgress, progress, duration, watchedAt? }
   */
  static async getProgress(userId, type, id) {
    if (!['movie', 'episode'].includes(type)) {
      throw ApiError.badRequest('Type must be movie or episode');
    }

    // SC-009: Project only watchHistory — avoids loading the full user document
    const user = await User.findById(userId).select({ watchHistory: 1, _id: 1 });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    let entry;
    if (type === 'episode') {
      entry = user.watchHistory.find(
        (e) => e.episodeId && e.episodeId.toString() === id
      );
    } else {
      entry = user.watchHistory.find(
        (e) => e.contentId && e.contentId.toString() === id && !e.episodeId
      );
    }

    if (!entry) {
      return { hasProgress: false, progress: 0, duration: 0 };
    }

    return {
      hasProgress: true,
      progress: entry.progress,
      duration: entry.duration,
      watchedAt: entry.watchedAt,
    };
  }

  /**
   * Clear the continue-watching cache for a user (used after mutations).
   */
  static clearCache(userId) {
    continueWatchingCache.delete(userId.toString());
  }
}

module.exports = ProgressService;
