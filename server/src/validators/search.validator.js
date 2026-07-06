// server/src/validators/search.validator.js
// Zod schemas for search request validation

const { z } = require('zod');

/**
 * Search query schema
 * - q: search query (required, 1-200 chars)
 * - type: filter by content type
 * - page: pagination
 * - limit: results per page
 */
const searchQuerySchema = z.object({
  query: z.object({
    q: z
      .string()
      .trim()
      .min(1, 'Search query is required')
      .max(200, 'Search query too long'),
    type: z.enum(['movie', 'series', 'all']).optional().default('all'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  }),
});

module.exports = {
  searchQuerySchema,
};
