// server/src/services/metadata-refresh-scheduler.service.js
// Metadata Refresh Scheduler — refreshes homepage/search cache via MetadataManager
//
// Architecture (C5f + D-012):
//   - On startup: pre-warms homepage cache after 3s delay
//   - Periodic refresh every hour, aligned to wall clock (HH:00:00)
//   - Multiple PM2 instances naturally align because they all calculate
//     the same next-hour boundary
//   - Uses distributed lock for PM2 cluster safety
//   - Failure resilience: never clears existing cache on failure,
//     retries with exponential backoff, tracks provider degradation
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
//   - New: 1-hour wall-clock aligned intervals (HH:00:00)
//   - Old: no retry logic on failure
//   - New: exponential backoff (3 retries: 10s, 30s, 60s)
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

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // D-012: 1 hour (was 30 min)
const STARTUP_DELAY_MS = 3000;               // 3 seconds after startup
const MAX_RETRIES = 3;                        // D-012: max retries on failure
const RETRY_DELAYS_MS = [10000, 30000, 60000]; // D-012: 10s, 30s, 60s backoff

// ── Distributed Lock ──
// Prevents duplicate cache refreshes across PM2 cluster workers.
// TTL is set to 45 minutes to safely cover a refresh cycle + retries.
const refreshLock = new DistributedLock('metadata:refresh', { ttlMs: 45 * 60 * 1000 });

// ── State ──

let refreshTimer = null;
let localRefreshRunning = false;

// D-012: Health tracking
let lastSuccessAt = null;      // Timestamp of last successful refresh
let lastFailureAt = null;      // Timestamp of last failed refresh
let failureCount = 0;          // Consecutive failure count
let totalRefreshCount = 0;     // Total refresh attempts since startup
let totalSuccessCount = 0;     // Total successful refreshes since startup
let lastRefreshDuration = 0;   // Duration of last refresh in ms
let lastError = null;          // Last error message
let cacheAgeMs = null;         // Current cache age

/**
 * Calculate milliseconds until the next hour boundary (HH:00:00).
 * D-012: Ensures all PM2 instances align to the same wall clock time.
 * @returns {number} Milliseconds until next :00
 */
function msUntilNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime() - now.getTime();
}

// ── Refresh Logic ──

/**
 * Run the metadata cache refresh cycle with retry + resilience.
 * D-012: On failure, retries with exponential backoff and NEVER clears
 * the existing cache. The old cache remains serving requests.
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
  totalRefreshCount++;
  const startTime = Date.now();

  try {
    // D-012: Retry loop with exponential backoff
    let lastRetryError = null;
    let success = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        logger.warn({ attempt, maxRetries: MAX_RETRIES, delayMs: delay },
          'Metadata refresh: retrying after failure');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

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
        lastRefreshDuration = duration;
        lastSuccessAt = new Date();
        failureCount = 0;
        totalSuccessCount++;
        lastError = null;

        logger.info({
          sections: sections.length,
          items: itemCount,
          durationMs: duration,
          attempt: attempt + 1,
        }, 'Metadata cache refreshed successfully');

        success = true;
        break;
      } catch (err) {
        lastRetryError = err;
        logger.warn({ err, attempt: attempt + 1, durationMs: Date.now() - startTime },
          'Metadata cache refresh attempt failed (non-fatal)');

        // D-012: Check if we should retry
        if (attempt < MAX_RETRIES) {
          logger.info({ nextRetryMs: RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] },
            'Metadata refresh: will retry');
        }
      }
    }

    if (!success) {
      // D-012: All retries exhausted — preserve existing cache, track failure
      lastFailureAt = new Date();
      failureCount++;
      lastError = lastRetryError?.message || 'All retries exhausted';

      logger.warn({
        failureCount,
        lastError,
        durationMs: Date.now() - startTime,
      }, 'Metadata cache refresh failed after all retries — existing cache preserved');
    }
  } catch (err) {
    // Outer catch for unexpected errors (lock issues, etc.)
    lastFailureAt = new Date();
    failureCount++;
    lastError = err.message || 'Unexpected error';
    logger.error({ err }, 'Metadata refresh: unexpected error');
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
 * D-012: Aligns to wall clock hour boundary (HH:00:00).
 * Pre-warms homepage cache after STARTUP_DELAY_MS, then calculates the
 * time to the next hour boundary and schedules the first aligned refresh.
 * After that, refreshes every REFRESH_INTERVAL_MS (1 hour).
 */
function start() {
  if (refreshTimer) {
    logger.warn('Metadata refresh scheduler is already running');
    return;
  }

  const msToNextHour = msUntilNextHour();

  logger.info({
    intervalMinutes: REFRESH_INTERVAL_MS / 60000,
    startupDelayMs: STARTUP_DELAY_MS,
    nextHourDelayMs: msToNextHour,
    nextRefreshTime: new Date(Date.now() + msToNextHour).toISOString(),
  }, 'Metadata refresh scheduler initialized — wall-clock hourly alignment');

  // Pre-warm homepage cache after startup delay — replaces the previous
  // inline setTimeout in app.js that did the same thing via ContentService.
  setTimeout(() => {
    runRefresh();
  }, STARTUP_DELAY_MS);

  // Schedule first aligned refresh at next hour boundary (HH:00:00)
  // D-012: All PM2 instances calculate the same msToNextHour, so they
  // naturally align even after a server restart.
  setTimeout(() => {
    runRefresh();

    // After the first aligned refresh, use setInterval for subsequent hours
    refreshTimer = setInterval(runRefresh, REFRESH_INTERVAL_MS);
  }, msToNextHour);
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
 * Get scheduler health and status (D-012: health foundation).
 * Exposes provider status, scheduler state, cache age for future Super Admin panel.
 */
function getStatus() {
  return {
    // Scheduler state
    scheduler: {
      isRunning: refreshTimer !== null,
      isRefreshing: localRefreshRunning,
      intervalMinutes: REFRESH_INTERVAL_MS / 60000,
      nextRefreshTime: refreshTimer
        ? new Date(Date.now() + msUntilNextHour()).toISOString()
        : null,
      lockType: 'MongoDB distributed',
    },
    // Refresh history
    history: {
      totalAttempts: totalRefreshCount,
      totalSuccesses: totalSuccessCount,
      consecutiveFailures: failureCount,
      lastSuccessAt: lastSuccessAt?.toISOString() || null,
      lastFailureAt: lastFailureAt?.toISOString() || null,
      lastError,
      lastRefreshDurationMs: lastRefreshDuration,
    },
    // Health summary
    health: {
      status: totalSuccessCount > 0 && failureCount === 0
        ? 'healthy'
        : failureCount > 0 && totalSuccessCount > 0
          ? 'degraded'
          : totalSuccessCount === 0 && totalRefreshCount > 0
            ? 'failing'
            : 'starting',
      uptime: process.uptime(),
    },
  };
}

module.exports = { start, stop, getStatus };
