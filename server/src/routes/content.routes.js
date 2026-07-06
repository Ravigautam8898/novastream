// server/src/routes/content.routes.js
// Content API Routes — movies, series, trending, homepage, categories
// All routes require authentication

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { requireActiveSubscription } = require('../middleware/subscription.middleware');
const { generalLimiter } = require('../middleware/rateLimiter.middleware');
const cacheControl = require('../middleware/cacheControl.middleware');
const validate = require('../middleware/validate.middleware');
const {
  paginationSchema,
  slugParamSchema,
  categoryParamSchema,
  episodeIdSchema,
  homepageSchema,
} = require('../validators/content.validator');
const contentController = require('../controllers/content.controller');

const router = Router();

// Cache-Control: browser-cache read-only GET responses for 5 minutes
// This enables instant back-navigation and reduces redundant network requests
router.use(cacheControl({ maxAge: 300, staleWhileRevalidate: 60 }));

// ── Homepage ──
router.get('/homepage/sections',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(homepageSchema),
  contentController.getHomepageSections
);

// ── Movies ──
router.get('/movies',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(paginationSchema),
  contentController.getMovies
);

router.get('/movies/:slug',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(slugParamSchema),
  contentController.getMovieBySlug
);

// ── Series ──
router.get('/series',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(paginationSchema),
  contentController.getSeries
);

router.get('/series/:slug',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(slugParamSchema),
  contentController.getSeriesBySlug
);

router.get('/series/:slug/seasons',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(slugParamSchema),
  contentController.getSeriesSeasons
);

// ── Episodes ──
router.get('/episode/:id',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(episodeIdSchema),
  contentController.getEpisodeById
);

// ── Trending ──
router.get('/trending',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(homepageSchema),
  contentController.getTrending
);

// ── Categories ──
router.get('/categories/:category',
  authenticate,
  requireActiveSubscription,
  generalLimiter,
  validate(categoryParamSchema),
  contentController.getByCategory
);

module.exports = router;
