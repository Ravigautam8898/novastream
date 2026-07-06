// server/src/controllers/favorites.controller.js
// Favorites HTTP handlers — thin layer over FavoritesService

const FavoritesService = require('../services/favorites.service');
const ApiResponse = require('../utils/ApiResponse');

/**
 * GET /api/favorites
 * List all favorites for the current user.
 */
async function getFavorites(req, res, next) {
  try {
    const items = await FavoritesService.getFavorites(req.user._id);
    ApiResponse.success(res, { items });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/favorites/:contentId
 * Toggle favorite state. If content is in watchlist → remove. If not → add.
 */
async function toggleFavorite(req, res, next) {
  try {
    const { contentId } = req.params;
    const result = await FavoritesService.toggleFavorite(req.user._id, contentId);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/favorites/check/:contentId
 * Check if a specific content item is favorited by the current user.
 */
async function checkFavorite(req, res, next) {
  try {
    const { contentId } = req.params;
    const isFavorited = await FavoritesService.checkFavorite(req.user._id, contentId);
    ApiResponse.success(res, { isFavorited });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/favorites/:contentId
 * Explicitly remove a content item from favorites.
 */
async function removeFavorite(req, res, next) {
  try {
    const { contentId } = req.params;
    await FavoritesService.removeFavorite(req.user._id, contentId);
    ApiResponse.success(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFavorites,
  toggleFavorite,
  checkFavorite,
  removeFavorite,
};
