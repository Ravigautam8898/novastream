// server/src/controllers/progress.controller.js
// Progress HTTP handlers — thin layer over ProgressService

const ProgressService = require('../services/progress.service');
const ApiResponse = require('../utils/ApiResponse');

/**
 * GET /api/progress/continue-watching
 * Get all items with saved playback progress for the current user.
 */
async function getContinueWatching(req, res, next) {
  try {
    const items = await ProgressService.getContinueWatching(req.user._id);
    ApiResponse.success(res, { items });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/progress/continue-watching/:id
 * Remove a specific item from the user's continue watching list.
 */
async function removeFromContinueWatching(req, res, next) {
  try {
    const { id } = req.params;
    const contentType = req.query.contentType || 'movie';

    const removed = await ProgressService.removeFromContinueWatching(req.user._id, id, contentType);

    if (removed === 0) {
      return ApiResponse.success(res, { removed: 0, message: 'Item not found in watch history' });
    }

    ApiResponse.success(res, { removed });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/progress/save
 * Save or update playback progress for a user.
 */
async function saveProgress(req, res, next) {
  try {
    const { contentId, contentType, progress, duration } = req.body;

    const result = await ProgressService.saveProgress(
      req.user._id,
      contentId,
      contentType,
      progress,
      duration
    );

    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/progress/:type/:id
 * Get saved playback progress for a content item or episode.
 */
async function getProgress(req, res, next) {
  try {
    const { type, id } = req.params;

    const result = await ProgressService.getProgress(req.user._id, type, id);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getContinueWatching,
  removeFromContinueWatching,
  saveProgress,
  getProgress,
};
