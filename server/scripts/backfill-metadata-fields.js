// server/scripts/backfill-metadata-fields.js
// Backfill Script — Fill missing metadata fields from TMDB for existing content
//
// D-013 added TMDB certification fetching to syncMovie/syncSeries, but existing
// Content documents created before this change may still have contentRating: null.
// This script backfills those missing fields safely.
//
// Usage:
//   node server/scripts/backfill-metadata-fields.js                        # dry-run (default)
//   node server/scripts/backfill-metadata-fields.js --no-dry-run           # execute updates
//   node server/scripts/backfill-metadata-fields.js --no-dry-run --limit=10  # batch of 10
//   node server/scripts/backfill-metadata-fields.js --verbose              # detailed logging
//
// Target fields (only updates if currently missing):
//   - contentRating  (PG-13, R, TV-MA, etc.)
//
// Rules:
//   - Dry-run default — no data modified without --no-dry-run
//   - Only updates missing fields (never overwrites existing data)
//   - Uses ContentRegistry safe merge rules (same as detail page registration)
//   - Never touches: providers[], slugs, sourceId/sourceSite, isActive, categories
//   - Logs every changed field per document
//   - Supports --limit parameter for batch processing

/* eslint-disable no-console */

const mongoose = require('mongoose');
const config = require('../src/config/env');
const Content = require('../src/models/Content.model');
const TMDbService = require('../src/services/tmdb.service');
const ContentRegistry = require('../src/providers/ContentRegistry');
const logger = require('../src/config/logger');

// Suppress verbose logging during script execution
logger.level = 'warn';

// ── CLI Arguments ──

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--no-dry-run');
const VERBOSE = args.includes('--verbose');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

// ── Stats ──

const stats = {
  total: 0,
  skippedNoTmdbId: 0,
  skippedAlreadyHasRating: 0,
  fetched: 0,
  updated: 0,
  failed: 0,
  errors: [],
};

// ── Main ──

async function backfillMetadata() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  NovaStream — Metadata Fields Backfill      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Mode:     ${DRY_RUN ? '🔍 DRY-RUN (no changes)' : '⚡ LIVE (will update)'}`);
  console.log(`  Limit:    ${LIMIT ? LIMIT : 'All eligible items'}`);
  console.log('──────────────────────────────────────────────────\n');

  // Connect to MongoDB
  await mongoose.connect(config.mongodb.uri);
  console.log('✅ Connected to MongoDB\n');

  try {
    // Find content with missing contentRating AND a TMDB identity
    // Uses $and to combine both conditions (avoids duplicate $or key issue)
    const findQuery = {
      $and: [
        {
          $or: [
            { contentRating: { $exists: false } },
            { contentRating: null },
            { contentRating: '' },
          ],
        },
        {
          $or: [
            { tmdbId: { $exists: true, $ne: null } },
            { 'metadataSources.tmdb.id': { $exists: true, $ne: null } },
          ],
        },
      ],
    };

    const totalEligible = await Content.countDocuments(findQuery);
    console.log(`📊 Found ${totalEligible} items needing backfill\n`);

    if (totalEligible === 0) {
      console.log('✅ Nothing to backfill — all content has contentRating populated.');
      console.log('\n📊 Backfill Summary:');
      console.log('  Total processed:    0');
      console.log('  Updated:            0');
      console.log('  Failed:             0');
      console.log('  Skipped:            0');
      return;
    }

    // Fetch items, ordered by popularity (backfill most-viewed first)
    let cursor = Content.find(findQuery)
      .sort({ popularity: -1 })
      .select('_id title slug contentType tmdbId metadataSources popularity')
      .lean();

    if (LIMIT) {
      cursor = cursor.limit(LIMIT);
    }

    const items = await cursor;
    stats.total = items.length;

    // ── Process each item ──
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const index = `${i + 1}/${items.length}`;

      // Determine TMDB ID from top-level or metadataSources
      let tmdbId = item.tmdbId;
      if (!tmdbId && item.metadataSources?.tmdb?.id) {
        tmdbId = parseInt(item.metadataSources.tmdb.id) || item.metadataSources.tmdb.id;
      }

      if (!tmdbId) {
        stats.skippedNoTmdbId++;
        if (VERBOSE) {
          console.log(`  ${index} ⏭️  ${item.title} — No TMDB ID found`);
        }
        continue;
      }

      process.stdout.write(`  ${index} ${item.contentType === 'movie' ? '🎬' : '📺'} ${item.title}... `);

      try {
        // D-012: Fetch certification ONLY (lightweight — single API call)
        // Uses the dedicated fetchMovieCertification/fetchSeriesCertification
        // methods instead of the heavy syncMovie/syncSeries which fetch
        // full credits, videos, and season data unnecessarily.
        let contentRating = null;

        if (item.contentType === 'movie') {
          contentRating = await TMDbService.fetchMovieCertification(tmdbId, false);
        } else {
          contentRating = await TMDbService.fetchSeriesCertification(tmdbId, false);
        }

        stats.fetched++;

        if (contentRating && DRY_RUN) {
          console.log(`🔍 Would set contentRating → "${contentRating}"`);
        } else if (contentRating && !DRY_RUN) {
          // Update using ContentRegistry safe merge rules
          const identity = {
            tmdbId,
            metadataSource: { name: 'tmdb', id: String(tmdbId) },
          };

          await ContentRegistry.registerOrUpdate({
            identity,
            title: item.title,
            contentType: item.contentType,
            metadata: { contentRating },
          });

          stats.updated++;
          console.log(`✅ contentRating → "${contentRating}"`);
        } else if (!contentRating) {
          console.log(`⚠️  No certification returned from TMDB`);
          stats.skippedAlreadyHasRating++;
        }
      } catch (err) {
        stats.failed++;
        stats.errors.push({ title: item.title, tmdbId, error: err.message });
        console.log(`❌ Failed — ${err.message}`);
      }
    }

    // ── Summary ──
    console.log('\n═══════════════════════════════════════════════');
    console.log('  Backfill Complete!');
    console.log('───────────────────────────────────────────────');
    console.log(`  Mode:       ${DRY_RUN ? '🔍 DRY-RUN' : '⚡ LIVE'}`);
    console.log(`  Processed:  ${stats.total}`);
    console.log(`  Fetched:    ${stats.fetched}`);
    console.log(`  Updated:    ${stats.updated}`);
    console.log(`  Failed:     ${stats.failed}`);
    if (stats.failed > 0) {
      console.log('  Errors:');
      stats.errors.forEach(e => {
        console.log(`    - ${e.title} (tmdb:${e.tmdbId}): ${e.error}`);
      });
    }
    console.log('───────────────────────────────────────────────');

    // Show post-backfill counts
    const stillMissing = await Content.countDocuments({
      $or: [
        { contentRating: { $exists: false } },
        { contentRating: null },
        { contentRating: '' },
      ],
    });
    const nowPopulated = await Content.countDocuments({
      contentRating: { $exists: true, $ne: null, $ne: '' },
    });
    console.log(`\n  Content with contentRating: ${nowPopulated}`);
    console.log(`  Still missing:             ${stillMissing}`);
    console.log(`  Coverage:                  ${((nowPopulated / (nowPopulated + stillMissing)) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n❌ Backfill failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB\n');
  }
}

// ── Entry Point ──
backfillMetadata()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
