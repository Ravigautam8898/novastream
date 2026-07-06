// server/src/services/favorites.service.js
// Favorites Service — watchlist/favorites management
//
// Extracted from favorites.routes.js (Phase 3, B-001 architecture boundary fix).

const User = require('../models/User.model');
const Content = require('../models/Content.model');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const {
  FAVORITES_TRIM_THRESHOLD,
} = require('../config/constants');

class FavoritesService {
  /**
   * List all favorites for the current user, populated with full content data.
   * Returns items sorted by addedAt descending.
   *
   * @param {string} userId
   * @returns {Array} Ordered list of favorited content with addedAt
   */
  static async getFavorites(userId) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    // Defensive trim
    if ((user.watchlist || []).length > FAVORITES_TRIM_THRESHOLD) {
      user.trimWatchlist();
      await user.save().catch(() => {});
    }

    const watchlist = (user.watchlist || [])
      .sort((a, b) => b.addedAt - a.addedAt);

    if (watchlist.length === 0) return [];

    // Extract content IDs in order
    const contentIds = watchlist.map((w) => w.contentId).filter(Boolean);

    // Fetch all referenced content
    const contentMap = {};
    const contents = await Content.find({ _id: { $in: contentIds } })
      .select('title slug posterPath backdropPath contentType genres voteAverage releaseDate runtime firstAirDate')
      .lean();

    for (const c of contents) {
      contentMap[c._id.toString()] = c;
    }

    // Build ordered result, skip deleted content
    return watchlist
      .map((w) => {
        const content = contentMap[w.contentId?.toString()];
        if (!content) return null;
        return {
          ...content,
          addedAt: w.addedAt,
          isFavorited: true,
        };
      })
      .filter(Boolean);
  }

  /**
   * Toggle favorite state. If content is in watchlist → remove. If not → add.
   *
   * @param {string} userId
   * @param {string} contentId - MongoDB _id of the content
   * @returns {Object} { isFavorited, item }
   */
  static async toggleFavorite(userId, contentId) {
    // Validate content exists
    const content = await Content.findById(contentId).select('_id title slug').lean();
    if (!content) {
      throw ApiError.notFound('Content not found');
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    const existingIndex = user.watchlist.findIndex(
      (w) => w.contentId && w.contentId.toString() === contentId
    );

    let isFavorited;

    if (existingIndex >= 0) {
      user.watchlist.splice(existingIndex, 1);
      isFavorited = false;
    } else {
      user.watchlist.push({ contentId, addedAt: new Date() });
      user.trimWatchlist();
      isFavorited = true;
    }

    await user.save();

    return {
      isFavorited,
      item: isFavorited
        ? { _id: content._id, title: content.title, slug: content.slug }
        : null,
    };
  }

  /**
   * Check if a specific content item is favorited by the current user.
   *
   * @param {string} userId
   * @param {string} contentId
   * @returns {boolean}
   */
  static async checkFavorite(userId, contentId) {
    const user = await User.findById(userId).select('watchlist').lean();
    if (!user) throw ApiError.notFound('User not found');

    return (user.watchlist || []).some(
      (w) => w.contentId && w.contentId.toString() === contentId
    );
  }

  /**
   * Explicitly remove a content item from favorites.
   *
   * @param {string} userId
   * @param {string} contentId
   * @returns {boolean} Whether anything was removed
   */
  static async removeFavorite(userId, contentId) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    const before = user.watchlist.length;

    user.watchlist = user.watchlist.filter(
      (w) => !(w.contentId && w.contentId.toString() === contentId)
    );

    if (user.watchlist.length !== before) {
      await user.save();
    }

    return true;
  }
}

module.exports = FavoritesService;
