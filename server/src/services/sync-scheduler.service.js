// server/src/services/sync-scheduler.service.js
// Sync Scheduler Service — runs external content sync at aligned 6-hour intervals
//
// Architecture:
//   - Runs sync at 00:00, 06:00, 12:00, 18:00 (aligned to server time)
//   - On server start: calculates next sync time and schedules it
//   - Uses a simple setInterval after the first aligned time
//   - Logs sync results via Pino
//   - Extensible: new sources can be synced by adding them to the scheduler
//
// Usage:
//   const syncScheduler = require('./services/sync-scheduler.service');
//   syncScheduler.start();  // Called once during server startup

const ContentSourceService = require('./content-source.service');
const Content = require('../models/Content.model');
const SystemSetting = require('../models/SystemSetting.model');
const config = require('../config/env');
const logger = require('../config/logger');
const DistributedLock = require('../utils/distributedLock');

// ── Constants ──

const SYNC_INTERVAL_HOURS = 6; // Every 6 hours
const SYNC_INTERVAL_MS = SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
const SYNC_GRACE_BUFFER_MS = 30 * 60 * 1000; // 30 min grace buffer to avoid false-positive catch-up on minor restarts

// ── System Setting Keys ──

const LAST_SYNC_KEY = 'sync:external:lastSyncAt'; // ISO timestamp of last successful sync

// ── Distributed Lock ──
// Prevents duplicate sync execution across PM2 cluster workers.
// TTL is set to 45 minutes to safely cover full sync runtime.
const syncLock = new DistributedLock('sync:scheduler', { ttlMs: 45 * 60 * 1000 });

// ── State ──

let syncTimer = null;
let localSyncRunning = false; // Local tracking for getStatus() only

// ── Helpers ──

/**
 * Calculate the next aligned sync time.
 * Aligns to 00:00, 06:00, 12:00, 18:00.
 */
function getNextAlignedSyncTime() {
  const now = new Date();
  const currentHour = now.getUTCHours(); // Use UTC for consistent alignment
  const nextSlot = Math.ceil(currentHour / SYNC_INTERVAL_HOURS) * SYNC_INTERVAL_HOURS;

  const next = new Date(now);
  next.setUTCHours(nextSlot, 0, 0, 0);

  // If next slot is today and we haven't passed it
  if (next <= now) {
    next.setUTCHours(next.getUTCHours() + SYNC_INTERVAL_HOURS, 0, 0, 0);
  }

  return next;
}

/**
 * Format a date for logging.
 */
function formatTime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

// ── Sync Logic ──

/**
 * Run the sync process for all configured content sources.
 * Uses fuzzy title matching to map external content to local DB entries.
 */
async function runSync() {
  // ── Acquire distributed lock ──
  // Only one worker across the PM2 cluster proceeds; others skip this interval.
  let acquired = false;
  try {
    acquired = await syncLock.acquire();
  } catch (err) {
    logger.error({ err }, 'Failed to acquire sync lock — skipping sync');
    return;
  }

  if (!acquired) {
    logger.info('Sync lock held by another worker — skipping this interval');
    return;
  }

  localSyncRunning = true;
  const startTime = Date.now();
  logger.info('Starting external content sync');

  try {
    // 1. Fetch homepage sections from the primary external source
    logger.debug('Fetching external source catalog...');
    const sections = await ContentSourceService.fetchHomepage('primary');
    const data = sections?.data || [];

    if (!data || data.length === 0) {
      logger.warn('No data returned from external source catalog during sync');
      return;
    }

    // 2. Collect unique items from all sections
    const externalItems = new Map();
    for (const section of data) {
      for (const item of section.items || []) {
        const id = item._id || item.sourceId;
        if (!id) continue;
        if (!externalItems.has(id)) {
          externalItems.set(id, {
            externalId: id,
            title: item.title || item.name || 'Unknown',
            contentType: item.contentType || 'movie',
            categories: item.categories || [],
            posterPath: item.posterPath || item.poster || null,
            backdropPath: item.backdropPath || item.backdrop || null,
            overview: item.overview || item.description || null,
            voteAverage: item.voteAverage || item.rating || 0.0,
          });
        }
      }
    }

    logger.info({ totalItems: externalItems.size }, 'External catalog fetched');

    // 3. Batch-resolve existing items (2 queries instead of N)
    const externalIds = [...externalItems.keys()];

    // Batch 1: Find items already mapped by sourceId
    const existingBySource = await Content.find({
      sourceId: { $in: externalIds },
      sourceSite: 'primary',
    }).select('_id sourceId title voteAverage posterPath backdropPath overview').lean();

    const sourceIdToDoc = {};
    for (const doc of existingBySource) {
      sourceIdToDoc[doc.sourceId] = doc;
    }

    // Batch 2: For remaining items, find by title (unmapped items with matching titles)
    const unmatched = externalIds.filter(id => !sourceIdToDoc[id]);
    const remainingTitles = unmatched.map(id => externalItems.get(id).title).filter(Boolean);

    const existingByTitle = remainingTitles.length > 0
      ? await Content.find({
          title: { $in: remainingTitles },
          isActive: true,
          sourceId: { $exists: false },
        }).select('_id title sourceId categories').lean()
      : [];

    const titleToDoc = {};
    for (const doc of existingByTitle) {
      if (!doc.sourceId) titleToDoc[doc.title] = doc;
    }

    // 4. Build bulk operations
    const bulkOps = [];
    let matched = 0;
    let created = 0;

    for (const [externalId, extItem] of externalItems) {
      try {
        const existing = sourceIdToDoc[externalId];

        if (existing) {
          // Update metadata
          // C-012: NEVER overwrite Content identity fields (title, originalTitle,
          // posterPath, backdropPath, overview) with provider data.
          // Provider data is for stream resolution only — TMDB is authoritative
          // for metadata. Only update voteAverage (non-identity field).
          bulkOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: {
                $set: {
                  voteAverage: extItem.voteAverage || existing.voteAverage,
                },
              },
            },
          });
          matched++;
          continue;
        }

        const byTitle = titleToDoc[extItem.title];

        if (byTitle) {
          // Found by title but not mapped — set source mapping
          const setFields = {
            sourceId: externalId,
            sourceSite: 'primary',
          };
          if (!byTitle.categories?.length) {
            setFields.categories = extItem.categories;
          }
          bulkOps.push({
            updateOne: {
              filter: { _id: byTitle._id },
              update: { $set: setFields },
            },
          });
          matched++;
          continue;
        }

        // New item — create it
        bulkOps.push({
          insertOne: {
            document: {
              sourceId: externalId,
              sourceSite: 'primary',
              title: extItem.title,
              slug: Content.generateSlug(extItem.title),
              contentType: extItem.contentType,
              posterPath: extItem.posterPath,
              backdropPath: extItem.backdropPath,
              overview: extItem.overview,
              categories: extItem.categories,
              voteAverage: extItem.voteAverage || 0,
              isActive: true,
            },
          },
        });
        created++;
      } catch (err) {
        logger.warn({ err, externalId, title: extItem.title }, 'Error preparing sync item');
      }
    }

    // 5. Execute bulk operations
    if (bulkOps.length > 0) {
      const result = await Content.bulkWrite(bulkOps, { ordered: false });
      const writeErrors = result.writeErrors || [];
      if (writeErrors.length > 0) {
        logger.warn({ writeErrorCount: writeErrors.length }, 'Some bulk write operations failed (non-fatal)');
      }
      logger.info({
        matched,
        created,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        inserted: result.insertedCount,
      }, 'Bulk sync write completed');
    }

    const duration = Date.now() - startTime;
    logger.info({
      totalItems: externalItems.size,
      matched,
      created,
      durationMs: duration,
    }, 'External content sync completed');

    // ── Persist last sync timestamp (for catch-up detection on restart) ──
    try {
      await SystemSetting.set(LAST_SYNC_KEY, new Date().toISOString(), {
        description: 'Last successful external content sync timestamp (ISO 8601)',
        type: 'string',
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to persist lastSyncAt');
    }

  } catch (err) {
    logger.error({ err }, 'External content sync failed');
  } finally {
    // Always release the lock — both on success and failure
    try {
      await syncLock.release();
    } catch (releaseErr) {
      logger.warn({ err: releaseErr }, 'Failed to release sync lock');
    }
    localSyncRunning = false;
  }
}

// ── Scheduler ──

/**
 * Start the sync scheduler.
 * Calculates the next aligned sync time and schedules the first sync.
 * After the first sync, runs every SYNC_INTERVAL_HOURS hours.
 */
function start() {
  if (syncTimer) {
    logger.warn('Sync scheduler is already running');
    return;
  }

  const nextSync = getNextAlignedSyncTime();
  const delayMs = nextSync.getTime() - Date.now();

  logger.info({
    nextSync: formatTime(nextSync),
    delayMinutes: Math.round(delayMs / 60000),
    intervalHours: SYNC_INTERVAL_HOURS,
  }, 'Sync scheduler initialized');

  // Check if content exists and whether a sync window was missed during downtime
  Content.countDocuments({ isActive: true }).then(async (count) => {
    if (count === 0) {
      // No content yet — run initial sync immediately
      logger.info('No active content found — running initial sync');
      runSync();
      return;
    }

    // Content exists — check if we missed a sync window
    try {
      const lastSyncAtStr = await SystemSetting.get(LAST_SYNC_KEY);
      if (lastSyncAtStr) {
        const lastSyncAt = new Date(lastSyncAtStr).getTime();
        const now = Date.now();
        const gapMs = now - lastSyncAt;
        const thresholdMs = SYNC_INTERVAL_MS + SYNC_GRACE_BUFFER_MS;

        if (gapMs > thresholdMs) {
          const hoursSinceLastSync = Math.round(gapMs / 3600000);
          logger.info({
            lastSync: formatTime(new Date(lastSyncAt)),
            hoursSinceLastSync,
            thresholdHours: SYNC_INTERVAL_HOURS,
            graceBufferMinutes: Math.round(SYNC_GRACE_BUFFER_MS / 60000),
          }, 'Sync window was missed during downtime — running catch-up sync');
          runSync();
          return; // Don't log "skipping initial sync" since we're catching up
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to check lastSyncAt — proceeding normally');
    }

    logger.info({ activeContentCount: count }, 'Content already exists — skipping initial sync');
  }).catch((err) => {
    // If count fails, run sync anyway to be safe
    logger.warn({ err }, 'Failed to check content count — running initial sync');
    runSync();
  });

  // Schedule subsequent syncs at the next aligned time, then every 6 hours
  syncTimer = setTimeout(() => {
    runSync();
    syncTimer = setInterval(runSync, SYNC_INTERVAL_MS);
  }, delayMs);
}

/**
 * Stop the sync scheduler.
 */
function stop() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    clearInterval(syncTimer);
    syncTimer = null;
    logger.info('Sync scheduler stopped');
  }
}

/**
 * Run the sync immediately (for CLI or manual triggers).
 */
async function syncNow() {
  return await runSync();
}

/**
 * Get scheduler status.
 */
async function getStatus() {
  const lastSyncAtStr = await SystemSetting.get(LAST_SYNC_KEY).catch(() => null);
  return {
    isRunning: syncTimer !== null,
    isSyncing: localSyncRunning,
    intervalHours: SYNC_INTERVAL_HOURS,
    nextSync: syncTimer ? 'Scheduled' : 'Not scheduled',
    totalScheduled: syncTimer !== null ? 'Active' : 'Inactive',
    lastSyncAt: lastSyncAtStr || null,
    lockType: 'MongoDB distributed',
    lockOwner: 'cross-worker',
  };
}

module.exports = { start, stop, syncNow, getStatus, runSync };
