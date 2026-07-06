// server/src/controllers/history.controller.js
// History HTTP handlers — thin layer over HistoryService

const HistoryService = require('../services/history.service');
const ApiResponse = require('../utils/ApiResponse');

/**
 * GET /api/history
 * Get user's watch history, grouped by date, paginated.
 */
async function getHistory(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await HistoryService.getHistory(req.user._id, page, limit);

    ApiResponse.paginated(res, result.items, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/history/recent
 * Get the last 5 watched items (lightweight, for quick display).
 */
async function getRecentHistory(req, res, next) {
  try {
    const items = await HistoryService.getRecentHistory(req.user._id);
    ApiResponse.success(res, { items });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/history
 * Clear watch history. Optionally remove a single item.
 */
async function clearHistory(req, res, next) {
  try {
    const { contentId } = req.body || {};
    const result = await HistoryService.clearHistory(req.user._id, contentId);
    ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHistory,
  getRecentHistory,
  clearHistory,
};
