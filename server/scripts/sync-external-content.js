// server/scripts/sync-external-content.js
// External Content Sync Script
//
// Syncs the external source catalog (homepage sections) into NovaStream's Content collection.
// Maps content by title matching or direct ID matching.
//
// This script:
//   1. Fetches homepage sections from the external source API
//   2. For each content item, checks if it already exists in NovaStream (by title match)
//   3. If found, updates sourceId and sourceSite
//   4. If not found, creates a new Content entry with the external source data
//   5. Reports statistics on what was updated/created
//
// Usage:
//   node server/scripts/sync-external-content.js
//
// Options:
//   --dry-run       Preview changes without writing to DB
//   --force-update  Update all content (not just unmatched)
//   --verbose       Show detailed per-item logs
//
// Examples:
//   node server/scripts/sync-external-content.js --dry-run
//   node server/scripts/sync-external-content.js --verbose

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const config = require('../src/config/env');
const Content = require('../src/models/Content.model');
const ContentSourceService = require('../src/services/content-source.service');
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args.filter(a => typeof a !== 'string' || a.length < 200)),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: () => {},
};

// ── Helpers ──

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    forceUpdate: args.includes('--force-update'),
    verbose: args.includes('--verbose'),
  };
}

/**
 * Stop words that shouldn't trigger substring/title matches.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for',
  'and', 'or', 'is', 'it', 'its', 'from', 'by', 'with',
  'as', 'be', 'but', 'not', 'this', 'that', 'all',
]);

/**
 * Normalize a title for fuzzy matching.
 * Lowercases, removes special chars, trims whitespace.
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get significant words from a title (excluding stop words and short words).
 */
function getSignificantWords(title) {
  return normalizeTitle(title)
    .split(' ')
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Score a title match between external and local content.
 * Returns a match score (0-100) where higher is better.
 * Threshold for a valid match is ≥ 80.
 */
function titleMatchScore(externalTitle, localTitle) {
  const ext = normalizeTitle(externalTitle);
  const local = normalizeTitle(localTitle);
  const extWords = getSignificantWords(externalTitle);
  const localWords = getSignificantWords(localTitle);

  // 1. Exact match
  if (ext === local) return 100;

  // 2. Substring match — only if the shorter title has significant length
  //    AND is not just a stop word
  const MIN_SUBSTR_LEN = 6;
  if (ext.length >= MIN_SUBSTR_LEN && local.length >= MIN_SUBSTR_LEN) {
    if (ext.includes(local)) {
      // Full shorter title is contained in longer title — strong match
      const ratio = local.length / ext.length;
      if (ratio > 0.4) return 95; // e.g. "The Dark Knight" contains "Dark Knight"
    }
    if (local.includes(ext)) {
      const ratio = ext.length / local.length;
      if (ratio > 0.4) return 95;
    }
  }

  // 3. Significant word match
  if (extWords.length > 0 && localWords.length > 0) {
    const common = extWords.filter(w => localWords.includes(w));
    const maxWords = Math.max(extWords.length, localWords.length);
    const minWords = Math.min(extWords.length, localWords.length);

    if (common.length > 0) {
      const ratio = common.length / maxWords;

      // All significant words match — very strong signal
      if (common.length === minWords && common.length >= 2) {
        return Math.min(95, Math.round(ratio * 95));
      }

      // Most words match
      if (ratio >= 0.75 && common.length >= 2) {
        return Math.round(ratio * 85);
      }

      // Partial match with at least 2 common words
      if (common.length >= 2 && ratio >= 0.5) {
        return Math.round(ratio * 75);
      }

      // Single word match — only if that word is unique enough
      // Avoids matching "Notes from the Last Row" with "FROM"
      if (common.length === 1 && maxWords >= 2) {
        return 0; // Single word is not enough to confirm a match
      }
    }
  }

  return 0;
}

// ── Main Sync Logic ──

async function syncExternalContent() {
  const options = parseArgs();
  const stats = {
    totalExternal: 0,
    matched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log('='.repeat(60));
  console.log('  External Content Sync');
  console.log('='.repeat(60));
  console.log(`  Mode: ${options.dryRun ? '🔍 DRY RUN (no changes)' : '🚀 LIVE'}`);
  console.log(`  Force update: ${options.forceUpdate ? 'Yes' : 'No (only unmatched)'}`);
  console.log('');

  try {
    // 1. Connect to MongoDB
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ Connected to MongoDB\n');

    // 2. Fetch external source catalog
    console.log('📡 Fetching external source catalog...');
    const sections = await ContentSourceService.fetchHomepage('primary');
    const data = sections?.data || [];

    if (!data || data.length === 0) {
      console.log('❌ No data returned from external source catalog');
      await mongoose.disconnect();
      return;
    }

    // 3. Collect all unique items from all sections
    const externalItems = new Map(); // id → { title, contentType, categories }
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

    stats.totalExternal = externalItems.size;
    console.log(`📦 Found ${stats.totalExternal} unique items in external catalog\n`);

    if (stats.totalExternal === 0) {
      console.log('No items to sync');
      await mongoose.disconnect();
      return;
    }

    // 4. Try to match each external item with existing NovaStream content
    const allLocalContent = await Content.find({ isActive: true }).lean();
    console.log(`📦 Found ${allLocalContent.length} existing content items in DB\n`);

    let processed = 0;
    for (const [externalId, extItem] of externalItems) {
      processed++;
      if (processed % 50 === 0) {
        console.log(`  Progress: ${processed}/${stats.totalExternal}`);
      }

      try {
        // Check if already mapped
        const existingMapped = await Content.findOne({
          sourceId: externalId,
          sourceSite: 'primary',
          isActive: true,
        }).lean();

        if (existingMapped && !options.forceUpdate) {
          stats.skipped++;
          if (options.verbose) {
            console.log(`  ⏭  Already mapped: "${extItem.title}" → "${existingMapped.title}"`);
          }
          continue;
        }

        // Try to find matching content by title
        let bestMatch = null;
        let bestScore = 0;

        for (const local of allLocalContent) {
          const score = titleMatchScore(extItem.title, local.title);
          if (score > bestScore && score >= 80) {
            // Also check contentType matches
            if (local.contentType === extItem.contentType) {
              bestScore = score;
              bestMatch = local;
            }
          }
        }

        if (bestMatch) {
          // Update existing content with external source IDs
          if (options.dryRun) {
            stats.matched++;
            if (options.verbose) {
              console.log(`  🔗 WOULD MAP: "${extItem.title}" → "${bestMatch.title}" (score: ${bestScore})`);
            }
          } else {
            await Content.findByIdAndUpdate(bestMatch._id, {
              $set: {
                sourceId: externalId,
                sourceSite: 'primary',
                // Update categories from external if not already set
                ...(bestMatch.categories?.length ? {} : { categories: extItem.categories }),
              },
            });
            stats.matched++;
            if (options.verbose) {
              console.log(`  ✅ Mapped: "${extItem.title}" → "${bestMatch.title}"`);
            }
          }
        } else {
          // No match found — create new content entry
          if (!options.dryRun) {
            // Check if slug exists, create unique one
            let slug = Content.generateSlug(extItem.title);
            const slugExists = await Content.findOne({ slug });
            if (slugExists) {
              slug = Content.generateSlug(extItem.title); // generateSlug already appends random suffix
            }

            await Content.create({
              sourceId: externalId,
              sourceSite: 'primary',
              title: extItem.title,
              slug,
              contentType: extItem.contentType,
              posterPath: extItem.posterPath,
              backdropPath: extItem.backdropPath,
              overview: extItem.overview,
              categories: extItem.categories,
              voteAverage: extItem.voteAverage || 0,
              isActive: true,
            });
            stats.created++;
            if (options.verbose) {
              console.log(`  🆕 Created: "${extItem.title}" (slug: ${slug})`);
            }
          } else {
            stats.skipped++;
            if (options.verbose) {
              console.log(`  ❓ WOULD CREATE: "${extItem.title}" (no local match found)`);
            }
          }
        }
      } catch (err) {
        stats.errors++;
        logger.error(`  ❌ Error processing "${extItem.title}": ${err.message}`);
      }
    }

    // 5. Report results
    console.log('\n' + '='.repeat(60));
    console.log('  📊 Sync Complete');
    console.log('='.repeat(60));
    console.log(`  Total external items: ${stats.totalExternal}`);
    console.log(`  Matched (updated sourceId): ${stats.matched}`);
    console.log(`  Created (new entries): ${stats.created}`);
    console.log(`  Skipped (already mapped): ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);

    if (options.dryRun) {
      console.log('\n  ⚠️  This was a DRY RUN — no changes were made.');
      console.log('  Run without --dry-run to apply changes.');
    }

  } catch (err) {
    console.error('\n❌ Sync failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// ── Detect if run directly (not imported) ──
if (require.main === module) {
  syncExternalContent().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { syncExternalContent };
