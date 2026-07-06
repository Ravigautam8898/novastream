// server/src/routes/search.routes.js
// Search API Route

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { generalLimiter } = require('../middleware/rateLimiter.middleware');
const validate = require('../middleware/validate.middleware');
const { searchQuerySchema } = require('../validators/search.validator');
const contentController = require('../controllers/content.controller');

const router = Router();

// Search requires authentication
router.use(authenticate);
router.use(generalLimiter);

// ── Search ──
router.get('/',
  validate(searchQuerySchema),
  contentController.search
);

module.exports = router;
