// server/src/services/metadata-refresh-scheduler.service.js
// Metadata Refresh Scheduler — refreshes homepage/search cache via MetadataManager
//
// Architecture (C5f — replaces old sync scheduler):
//   - On startup: pre-warms homepage cache after 3s delay
//   - Periodic refresh every 30 minutes
//   - Uses distributed lock for PM2 cluster safety
//   - Does NOT create Content documents
//   - Only calls ContentService.getHomepageSections() (which goes through MetadataManager)
//
// Flow:
//   MetadataRefreshScheduler
//     ↓
//   ContentService.getHomepageSections()
//     ↓
//   MetadataManager.getTrending() → TMDB/metadata providers
//     ↓
//   ContentService.#homepageCache (in-memory, 5 min TTL)
//     ↓
//   Frontend gets fresh homepage data
//
// Key differences from the old sync-scheduler:
//   - Old: fetched external provider catalog → created/updated Content documents
//   - New: refreshes metadata cache only → no Content documents created
//   - Old: 6-hour aligned intervals (00:00, 06:00, 12:00, 18:00)
//   - New: 30-minute intervals (homepage cache TTL is 5 min)
//   - Old: created Content records from provider data (forbidden in Track C)
//   - New: uses MetadataManager (metadata providers, not stream providers)
//
// Usage:
//   const scheduler = require('./services/metadata-refresh-scheduler.service');
//   scheduler.start();   // Called once during server startup
//   scheduler.stop();    // Called during shutdown

const ContentService = require('./content.service');
const logger = require('../config/logger');
const DistributedLock = require('../utils/distributedLock');

// ── Constants ──

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const STARTUP_DELAY_MS = 3000;               // 3 seconds after startup

// ── Distributed Lock ──
// Prevents duplicate cache refreshes across PM2 cluster workers.
// TTL is set to 10 minutes to safely cover a refresh cycle.
const refreshLock = new DistributedLock('metadata:refresh', { ttlMs: 10 * 60 * 1000 });

// ── State ──

let refreshTimer = null;
let localRefreshRunning = false;

// ── Refresh Logic ──

/**
 * Run the metadata cache refresh cycle.
 * Acquires a distributed lock so only one PM2 worker refreshes at a time.
 * Calls ContentService.getHomepageSections() which internally delegates to
 * MetadataManager.getTrending() → TMDB/metadata providers.
 * Does NOT create or modify Content documents.
 */
async function runRefresh() {
  // ── Acquire distributed lock ──
  let acquired = false;
  try {
    acquired = await refreshLock.acquire();
  } catch (err) {
    logger.error({ err }, 'Metadata refresh: failed to acquire lock');
    return;
  }

  if (!acquired) {
    logger.debug('Metadata refresh: lock held by another worker — skipping');
    return;
  }

  localRefreshRunning = true;
  const startTime = Date.now();

  try {
    // Call ContentService.getHomepageSections() which goes through:
    //   MetadataManager.getTrending() → TMDB/metadata providers
    //
    // This:
    //   - Refreshes ContentService.#homepageCache
    //   - Does NOT create Content documents
    //   - Does NOT touch ProviderManager or stream providers
    const sections = await ContentService.getHomepageSections();
    const itemCount = sections.reduce((sum, s) => sum + (s.items?.length || 0), 0);

    const duration = Date.now() - startTime;
    logger.info({
      sections: sections.length,
      items: itemCount,
      durationMs: duration,
    }, 'Metadata cache refreshed successfully');
  } catch (err) {
    logger.warn({ err, durationMs: Date.now() - startTime },
      'Metadata cache refresh failed (non-fatal)');
  } finally {
    try {
      await refreshLock.release();
    } catch (releaseErr) {
      logger.warn({ err: releaseErr }, 'Metadata refresh: failed to release lock');
    }
    localRefreshRunning = false;
  }
}

// ── Scheduler ──

/**
 * Start the metadata refresh scheduler.
 * Pre-warms homepage cache after STARTUP_DELAY_MS, then refreshes
 * every REFRESH_INTERVAL_MS.
 */
function start() {
  if (refreshTimer) {
    logger.warn('Metadata refresh scheduler is already running');
    return;
  }

  logger.info({
    intervalMinutes: REFRESH_INTERVAL_MS / 60000,
    startupDelayMs: STARTUP_DELAY_MS,
  }, 'Metadata refresh scheduler initialized');

  // Pre-warm homepage cache after startup delay — replaces the previous
  // inline setTimeout in app.js that did the same thing via ContentService.
  setTimeout(() => {
    runRefresh();
  }, STARTUP_DELAY_MS);

  // Schedule periodic refreshes to keep metadata cache fresh
  refreshTimer = setInterval(runRefresh, REFRESH_INTERVAL_MS);
}

/**
 * Stop the metadata refresh scheduler.
 */
function stop() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info('Metadata refresh scheduler stopped');
  }
}

/**
 * Get scheduler status.
 */
function getStatus() {
  return {
    isRunning: refreshTimer !== null,
    isRefreshing: localRefreshRunning,
    intervalMinutes: REFRESH_INTERVAL_MS / 60000,
    lockType: 'MongoDB distributed',
  };
}

module.exports = { start, stop, getStatus };
