// server/src/routes/favorites.routes.js
// Favorites (My List) Routes — per-user content watchlist
//
// Endpoints:
//   GET    /api/favorites           — List all favorites (populated)
//   POST   /api/favorites/:contentId — Toggle add/remove favorite
//   GET    /api/favorites/check/:contentId — Check if content is favorited
//   DELETE /api/favorites/:contentId — Remove from favorites (explicit)
//
// Architecture:
//   - Routes define middleware chains only
//   - Business logic extracted to FavoritesService
//   - Controllers are thin request→service→ApiResponse layers

const { Router } = require('express');
const { streamLimiter } = require('../middleware/rateLimiter.middleware');
const favoritesController = require('../controllers/favorites.controller');

const router = Router();

/**
 * GET /api/favorites
 * List all favorites for the current user, populated with full content data.
 */
router.get('/', favoritesController.getFavorites);

/**
 * POST /api/favorites/:contentId
 * Toggle favorite state. If content is in watchlist → remove. If not → add.
 */
router.post('/:contentId', streamLimiter, favoritesController.toggleFavorite);

/**
 * GET /api/favorites/check/:contentId
 * Check if a specific content item is favorited by the current user.
 */
router.get('/check/:contentId', favoritesController.checkFavorite);

/**
 * DELETE /api/favorites/:contentId
 * Explicitly remove a content item from favorites.
 */
router.delete('/:contentId', streamLimiter, favoritesController.removeFavorite);

module.exports = router;
