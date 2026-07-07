// server/src/app.js
// Express application setup — middleware, routes, error handling

const express = require('express');
const path = require('path');
const fs = require('fs');
const dns = require('dns');

// ── Force IPv4-first DNS resolution (P8-RUNTIME-001) ──
// Prevents TMDB API timeouts on systems where IPv6 DNS resolution hangs.
// IPv4 is used as fallback; IPv6 is still available if explicitly requested.
dns.setDefaultResultOrder('ipv4first');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler.middleware');
const { sanitizeInput } = require('./middleware/sanitize.middleware');
const { enforceContentType } = require('./middleware/contentType.middleware');
const ApiError = require('./utils/ApiError');

// ── Create Express App ──
const app = express();

// ── Development: Direct HLS file access (bypasses token auth — dev only) ──
// In production, always use the token-protected /api/stream/* endpoints.
if (config.server.isDevelopment) {
  app.use('/hls', express.static('uploads', {
    dotfiles: 'deny',
    index: false,
    setHeaders(res, filePath) {
      const ext = filePath.split('.').pop().toLowerCase();
      if (ext === 'm3u8') {
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
      } else if (ext === 'ts') {
        res.set('Content-Type', 'video/mp2t');
        res.set('Cache-Control', 'public, max-age=86400');
      }
    },
  }));
}

// ── Request ID ──
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || require('crypto').randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});

// ── Security Headers (Helmet) ──
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  imgSrc: ["'self'", "https://image.tmdb.org", "https://img.youtube.com", "https://img1.streamraiwind.stream", "data:", "blob:"],
  mediaSrc: ["'self'", "blob:", "https:"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  connectSrc: ["'self'", "https://api.themoviedb.org", "https://img.youtube.com", "https://*.streamraiwind.stream", "https://jolly-mouse-f41c.annierane.workers.dev"],
  frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
  frameAncestors: ["'self'"],
  objectSrc: ["'none'"],
  workerSrc: ["'self'", "blob:"],
};

// Only enable upgrade-insecure-requests in production
if (config.server.isProduction) {
  cspDirectives.upgradeInsecureRequests = [];
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  originAgentCluster: true,
  xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// ── Permissions-Policy (separate from helmet for explicit control) ──
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=(), ' +
    'payment=(), usb=(), fullscreen=(self), display-capture=(), ' +
    'browsing-topics=()'
  );
  next();
});

// ── Response Compression (PF-003) ──
// Skip compression for streaming responses (HLS segments) where it would
// add latency without benefit. Video content is already highly compressed.
app.use(compression({
  threshold: 1024,          // Only compress responses > 1 KB
  filter: (req, res) => {
    // Skip compression for streaming and thumbnail responses
    if (req.path.startsWith('/api/stream') || req.path.startsWith('/hls')) {
      return false;
    }
    // Use default compression filter (compresses text, JSON, JS, CSS, etc.)
    return compression.filter(req, res);
  },
}));

// ── CORS ──
app.use(cors({
  origin: config.server.isProduction
    ? process.env.CLIENT_URL || false
    : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,  // Preflight cache: 24 hours
}));

// ── Input Sanitization (before body parsing) ──
// Strips $ and . keys from query params and headers before parsing
app.use(sanitizeInput);

// ── Content-Type Enforcement ──
app.use(enforceContentType);

// ── Body Parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Request Logging (PF-007: log specific properties only, not full res object) ──
// Logging the full Express response object serializes many internal properties
// (sockets, handlers, etc.) that are irrelevant for log analysis. Instead,
// log only the specific fields we care about: status code, duration, and size.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = logger.api(req);
    log.info({
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.getHeader('content-length'),
    }, 'request completed');
  });
  next();
});

// ── Trust Proxy (for accurate IP detection behind reverse proxy) ──
app.set('trust proxy', 1);

// ── Request Timeout ──
// Global safety net: prevents slow requests (DB query, external API, etc.)
// from holding the event loop indefinitely.
// Uses a JS timer rather than socket timeout to ensure 503 response is sent.
app.use((req, res, next) => {
  // Streaming/thumbnail endpoints get 120s (HLS segments, sprite sheets)
  // All other requests get 30s (API responses, auth, content queries)
  const timeoutMs = req.path.startsWith('/api/stream') || req.path.startsWith('/api/thumbnails')
    ? 120000
    : 30000;

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      next(ApiError.serviceUnavailable('Request timed out'));
    }
  }, timeoutMs);

  // Clean up timer when response completes normally
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));

  next();
});

// ── Routes ──
app.use('/api', routes);

// ── Serve Built Client (production or when accessing Express directly) ──
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
const indexPath = path.resolve(clientDist, 'index.html');

// Read index.html into memory once at startup (PF-012)
// Avoids filesystem stat + read on every SPA navigation under load.
let cachedIndexHtml = null;
let cachedIndexHtmlSize = null;
if (fs.existsSync(indexPath)) {
  try {
    const stat = fs.statSync(indexPath);
    cachedIndexHtml = fs.readFileSync(indexPath, 'utf-8');
    cachedIndexHtmlSize = stat.size;
  } catch (err) {
    logger.warn({ err }, 'Failed to cache index.html (fallback to disk reads)');
  }
}

if (fs.existsSync(clientDist)) {
  // Serve static assets (JS, CSS, images) from the built client
  app.use(express.static(clientDist, {
    dotfiles: 'deny',
    index: false,
    maxAge: config.server.isProduction ? '1y' : 0,
  }));

  // Redirect legacy /favicon.ico to the SVG favicon
  app.get('/favicon.ico', (req, res) => {
    res.redirect(301, '/favicon.svg');
  });

  // SPA fallback: any non-API GET request serves index.html
  // This enables client-side routing (e.g., /my-list, /history, /admin/users)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/hls') || req.path.startsWith('/images')) {
      return next();
    }

    if (cachedIndexHtml) {
      // Serve from memory — no filesystem call per request (PF-012)
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Content-Length', String(cachedIndexHtmlSize));
      res.set('Cache-Control', 'no-cache'); // Must revalidate (HTML can change on rebuild)
      res.status(200).send(cachedIndexHtml);
    } else {
      // Fallback: read from disk (should not happen after first startup)
      res.sendFile(indexPath);
    }
  });
}

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'The requested resource was not found.',
    timestamp: new Date().toISOString(),
  });
});

// ── Global Error Handler ──
app.use(errorHandler);

// ── Start Server ──
async function startServer() {
  try {
    // Connect to MongoDB
    const { connectDatabase } = require('./config/database');
    await connectDatabase();    // Seed default subscription plans (idempotent)
      try {
        const SubscriptionPlan = require('./models/SubscriptionPlan.model');
        await SubscriptionPlan.seedDefaults();
      } catch (err) {
        logger.warn({ err }, 'Failed to seed default plans (non-fatal)');
      }

      // Start sync scheduler (after DB is connected)
      if (config.server.nodeEnv !== 'test') {
      try {
        const syncScheduler = require('./services/sync-scheduler.service');
        syncScheduler.start();
        logger.info('External content sync scheduler started');
      } catch (err) {
        logger.warn({ err }, 'Failed to start sync scheduler (non-fatal)');
      }
    }

    // Start listening
    const server = app.listen(config.server.port, () => {
      logger.info({
        port: config.server.port,
        env: config.server.nodeEnv,
        url: `http://localhost:${config.server.port}`,
      }, `NovaStream server started`);
    });

    // ── Pre-warm homepage cache (non-blocking, async) ──
    // After startup, build the homepage sections in the background so the first
    // user hitting the homepage doesn't trigger a cold cache-miss (which takes
    // ~5s due to serial category queries with remote MongoDB round-trips).
    // This runs after a short delay to let the server fully initialize.
    setTimeout(() => {
      const ContentService = require('./services/content.service');
      ContentService.getHomepageSections().then(() => {
        logger.info('Homepage cache pre-warmed successfully');
      }).catch((err) => {
        logger.warn({ err }, 'Homepage cache pre-warm failed (non-fatal — cache will warm on first request)');
      });
    }, 3000); // Wait 3s after server start to avoid competing with sync scripts

    // ── Graceful Shutdown ──
    // Centralized: stop sync scheduler, close HTTP server, close DB, then exit.
    // Signal handlers from database.js were removed — all shutdown logic is here.
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Shutdown signal received');

      // Stop sync scheduler
      try {
        const syncScheduler = require('./services/sync-scheduler.service');
        syncScheduler.stop();
      } catch {}

      // Stop accepting new HTTP requests, wait for in-flight to complete
      server.close(() => {
        logger.info('HTTP server closed');

        // Close database connection
        const { disconnectDatabase } = require('./config/database');
        disconnectDatabase().then(() => {
          process.exit(0);
        });
      });

      // Force exit after 10s if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// ── Export (for testing) ──
module.exports = app;

// ── Start if not being imported (e.g. in tests) ──
if (require.main === module) {
  startServer();
}
