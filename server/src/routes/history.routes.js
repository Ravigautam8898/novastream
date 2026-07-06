// server/src/routes/history.routes.js
// Watch History Routes — per-user viewing history
//
// Endpoints:
//   GET    /api/history        — Get paginated watch history
//   GET    /api/history/recent — Get last 5 watched items (lightweight)
//   DELETE /api/history        — Clear watch history (all or single item)
//
// Architecture:
//   - Routes define middleware chains only
//   - Business logic extracted to HistoryService
//   - Controllers are thin request→service→ApiResponse layers

const { Router } = require('express');
const historyController = require('../controllers/history.controller');

const router = Router();

/**
 * GET /api/history
 * Get user's watch history, grouped by date, paginated.
 * Query params: page (default 1), limit (default 20, max 50)
 */
router.get('/', historyController.getHistory);

/**
 * GET /api/history/recent
 * Get the last 5 watched items (lightweight, for quick display).
 */
router.get('/recent', historyController.getRecentHistory);

/**
 * DELETE /api/history
 * Clear watch history. Optionally remove a single item.
 * Body: { contentId?: string } — if provided, only that item is removed.
 * If omitted, all history is cleared.
 */
router.delete('/', historyController.clearHistory);

module.exports = router;
