// server/src/routes/progress.routes.js
// Playback Progress Routes — continue watching / resume playback
//
// Endpoints:
//   GET    /api/progress/continue-watching   — Get all items with saved progress
//   DELETE /api/progress/continue-watching/:id — Remove from continue-watching
//   POST   /api/progress/save                — Save playback progress
//   GET    /api/progress/:type/:id           — Get saved progress for an item
//
// Architecture:
//   - Routes define middleware chains only
//   - Business logic extracted to ProgressService
//   - Controllers are thin request→service→ApiResponse layers

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { streamLimiter } = require('../middleware/rateLimiter.middleware');
const progressController = require('../controllers/progress.controller');

const router = Router();

/**
 * GET /api/progress/continue-watching
 * Get all items with saved playback progress for the current user.
 */
router.get('/continue-watching', authenticate, progressController.getContinueWatching);

/**
 * DELETE /api/progress/continue-watching/:id
 * Remove a specific item from the user's continue watching list.
 *
 * @query contentType — 'movie' or 'episode' (query param)
 */
router.delete('/continue-watching/:id', authenticate, progressController.removeFromContinueWatching);

/**
 * POST /api/progress/save
 * Save or update playback progress for a user.
 *
 * Body: contentId, contentType, progress, duration
 */
router.post('/save', authenticate, streamLimiter, progressController.saveProgress);

/**
 * GET /api/progress/:type/:id
 * Get saved playback progress for a content item or episode.
 *
 * @param {string} type - 'movie' or 'episode'
 * @param {string} id - MongoDB _id of the Content or Episode
 */
router.get('/:type/:id', authenticate, progressController.getProgress);

module.exports = router;
