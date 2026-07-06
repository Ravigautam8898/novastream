// server/src/validators/content.validator.js
// Zod schemas for content request validation

const { z } = require('zod');

/**
 * Pagination query schema — shared by movies/series/category endpoints
 */
const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    sort: z
      .enum(['popularity', 'rating', 'latest', 'title'])
      .optional()
      .default('popularity'),
    genre: z.string().max(100).optional(),
  }),
});

/**
 * Slug param schema — used for movie/series detail routes
 */
const slugParamSchema = z.object({
  params: z.object({
    slug: z.string().min(1).max(200),
  }),
});

/**
 * Category param schema — used for category-based browsing
 */
const categoryParamSchema = z.object({
  params: z.object({
    category: z.string().min(1).max(100),
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  }),
});

/**
 * Episode ID param schema
 */
const episodeIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid episode ID format'),
  }),
});

/**
 * Homepage query schema (optional params)
 */
const homepageSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
  }),
});

module.exports = {
  paginationSchema,
  slugParamSchema,
  categoryParamSchema,
  episodeIdSchema,
  homepageSchema,
};
