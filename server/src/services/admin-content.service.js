// server/src/services/admin-content.service.js
// Admin Content Service — content management operations for admin dashboard
//
// Extracted from admin.routes.js (Phase 3, B-001 + B-003 architecture boundary fix).

const Content = require('../models/Content.model');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

class AdminContentService {
  /**
   * List all content with pagination and filters.
   *
   * @param {number} page
   * @param {number} limit
   * @param {string} [type] - 'movie' or 'series'
   * @param {string} [status] - 'active', 'inactive', or 'all'
   * @returns {Object} { items, pagination: { page, limit, total, totalPages } }
   */
  static async listContent(page, limit, type, status = 'all') {
    page = Math.max(1, page);
    limit = Math.min(100, Math.max(1, limit));

    const query = {};
    if (type && ['movie', 'series'].includes(type)) {
      query.contentType = type;
    }
    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;

    const [items, total] = await Promise.all([
      Content.find(query)
        .select('title slug contentType posterPath voteAverage viewCount isActive isFeatured createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Content.countDocuments(query),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update content fields (toggle featured, active status, etc.).
   *
   * @param {string} id - MongoDB _id of the content
   * @param {Object} updates - Fields to update (isFeatured, isActive, isPinned, isPremium)
   * @param {string} [username] - Admin username for logging
   * @returns {Object} Updated content
   */
  static async updateContent(id, updates, username) {
    const allowedFields = ['isFeatured', 'isActive', 'isPinned', 'isPremium'];
    const safeUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      throw ApiError.badRequest('No valid fields to update. Allowed: isFeatured, isActive, isPinned, isPremium');
    }

    const content = await Content.findByIdAndUpdate(id, safeUpdates, { new: true })
      .select('title slug contentType isFeatured isActive isPinned isPremium')
      .lean();

    if (!content) {
      throw ApiError.notFound('Content not found');
    }

    logger.info({ contentId: id, updates: safeUpdates, updatedBy: username }, 'Admin: content updated');

    return content;
  }

  /**
   * Soft-delete content by setting isActive to false.
   *
   * @param {string} id - MongoDB _id of the content
   * @param {string} [username] - Admin username for logging
   * @returns {Object} Deactivated content
   */
  static async deactivateContent(id, username) {
    const content = await Content.findByIdAndUpdate(id, { isActive: false }, { new: true })
      .select('title slug contentType isActive')
      .lean();

    if (!content) {
      throw ApiError.notFound('Content not found');
    }

    logger.info({ contentId: id, title: content.title, deletedBy: username }, 'Admin: content deactivated');

    return content;
  }
}

module.exports = AdminContentService;
