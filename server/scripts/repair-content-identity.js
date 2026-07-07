// server/scripts/repair-content-identity.js
// Content Identity Repair — fixes contaminated records before Track C2
//
// C-012: TMDB identity is authoritative. Provider data (sourceId, sourceSite)
// is for stream resolution only — never for metadata.
//
// Repair actions:
//   1. Remove sourceId from short-title records where sourceId likely belongs
//      to a different provider item (identity contamination).
//   2. Remove sourceId from records where originalTitle clearly differs from title
//      AND there's no manual confirmation that the mapping is correct.
//   3. Generate a report before making changes.
//
// Usage:
//   node server/scripts/repair-content-identity.js              # Show report only
//   node server/scripts/repair-content-identity.js --apply       # Apply fixes
//   node server/scripts/repair-content-identity.js --verbose     # Show detailed report
//
// Options:
//   --apply      Actually apply fixes (default: dry-run / report only)
//   --verbose    Show detailed per-record analysis
//   --ids        Comma-separated list of specific record _ids to target

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const config = require('../src/config/env');
const Content = require('../src/models/Content.model');

// ── Helpers ──

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for',
  'and', 'or', 'is', 'it', 'its', 'from', 'by', 'with',
  'as', 'be', 'but', 'not', 'this', 'that', 'all',
]);

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSignificantWords(title) {
  return normalizeTitle(title)
    .split(' ')
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function isShortOrSingleWordTitle(title) {
  return getSignificantWords(title).length <= 1;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    verbose: args.includes('--verbose'),
    ids: args.includes('--ids') ? args[args.indexOf('--ids') + 1]?.split(',').map(s => s.trim()).filter(Boolean) : null,
  };
}

/**
 * Check if a sourceId mapping is suspicious on a given content record.
 * Returns an array of issue descriptions, or empty array if clean.
 *
 * C-012: Only flag clear identity violations — not short titles alone.
 * Many valid records have single-word titles (e.g. "Vikings", "Wednesday")
 * with perfectly correct sourceId mappings. Only flag when there's evidence
 * that the TMDB identity (originalTitle, tmdbId) contradicts the provider mapping.
 */
async function checkRecord(doc) {
  const issues = [];

  if (!doc.sourceId) return issues;

  // Rule 1 (HIGH CONFIDENCE): originalTitle differs from title.
  // This means the title was likely overwritten by provider data.
  // Catches cases like title="Notes from the Last Row" vs originalTitle="FROM"
  // where "FROM" is a stop word with 0 significant words.
  if (doc.originalTitle && doc.originalTitle !== doc.title) {
    const normalizedTitle = normalizeTitle(doc.title);
    const normalizedOrig = normalizeTitle(doc.originalTitle);
    const titleWords = getSignificantWords(doc.title);
    const origWords = getSignificantWords(doc.originalTitle);

    // Skip near-identical (case difference only, e.g. "From" vs "FROM")
    if (normalizedTitle === normalizedOrig) return issues;

    // Skip if one is word-different from the other but same meaning
    // e.g. originalTitle="Star Wars: Episode V" vs title="The Empire Strikes Back"
    // This is a genuine TMDB change, not provider corruption
    const commonBase = titleWords.filter(w => origWords.includes(w));
    const allWords = new Set([...titleWords, ...origWords]);

    if (allWords.size > 0 && commonBase.length === 0 && allWords.size <= (titleWords.length + origWords.length)) {
      // No significant words in common — likely overwritten
      issues.push(`title-conflict: title="${doc.title}" differs from originalTitle="${doc.originalTitle}"`);
    }
  }

  // Rule 2 (LOW CONFIDENCE): No tmdbId but has sourceId — orphaned provider link.
  // Without a TMDB anchor, we can't verify the provider mapping is correct.
  // However, these records were likely created by the sync script with provider-only
  // data. Removing sourceId would break streaming with no alternative.
  // These are logged for awareness but NOT auto-fixed without explicit --ids targeting.
  if (!doc.tmdbId && doc.sourceId && doc.title) {
    issues.push(`orphaned-source: no tmdbId but has sourceId "${doc.sourceId}" (log only — requires explicit --ids to fix)`);
  }

  return issues;
}

// ── Main Repair ──

async function runRepair() {
  const options = parseArgs();
  const report = {
    scanned: 0,
    recordsToFix: [],
    fixesApplied: 0,
    errors: [],
  };

  const mode = options.apply ? '🚀 LIVE' : '🔍 DRY RUN (no changes)';
  console.log('='.repeat(60));
  console.log('  Content Identity Repair');
  console.log(`  Mode: ${mode}`);
  console.log('='.repeat(60));

  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ Connected to MongoDB\n');

    // Fetch target records
    let query = { isActive: true, sourceId: { $exists: true, $ne: null } };

    if (options.ids) {
      const ObjectId = mongoose.Types.ObjectId;
      query = {
        _id: { $in: options.ids.map(id => ObjectId.isValid(id) ? new ObjectId(id) : id) },
      };
      console.log(`🔍 Targeting ${options.ids.length} specific records\n`);
    }

    const records = await Content.find(query).lean();
    report.scanned = records.length;
    console.log(`📦 Scanning ${records.length} records with sourceId\n`);

    // Check each record
    for (const doc of records) {
      const issues = await checkRecord(doc);
      if (issues.length > 0) {
        const isTitleConflict = issues.some(i => i.startsWith('title-conflict'));
        const isOrphanedSource = issues.some(i => i.startsWith('orphaned-source'));
        let fixAction;
        if (isTitleConflict) {
          fixAction = 'remove sourceId (safe — has tmdbId anchor)';
        } else if (isOrphanedSource && options.ids) {
          fixAction = 'remove sourceId (explicit --ids targeting)';
        } else if (isOrphanedSource) {
          fixAction = 'log only — requires --ids to fix';
        } else {
          fixAction = 'review manually';
        }
        report.recordsToFix.push({
          _id: doc._id.toString(),
          title: doc.title,
          originalTitle: doc.originalTitle,
          slug: doc.slug,
          tmdbId: doc.tmdbId,
          sourceId: doc.sourceId,
          sourceSite: doc.sourceSite,
          issues,
          fixAction,
        });
      }
    }

    // Show report
    if (report.recordsToFix.length === 0) {
      console.log('✅ No contaminated records found. Your content identity is clean.\n');
    } else {
      console.log(`⚠️  Found ${report.recordsToFix.length} records requiring attention:\n`);
      for (const rec of report.recordsToFix) {
        console.log(`  ┌─ [${rec._id}] "${rec.title}" (slug: ${rec.slug})`);
        console.log(`  │  tmdbId: ${rec.tmdbId || 'none'} | sourceId: ${rec.sourceId}`);
        if (rec.originalTitle) {
          console.log(`  │  originalTitle: "${rec.originalTitle}"`);
        }
        for (const issue of rec.issues) {
          console.log(`  ├─ ⚠️  ${issue}`);
        }
        console.log(`  └─ 🛠  Fix: ${rec.fixAction}`);
        console.log('');
      }
    }

    // Apply fixes if --apply
    if (options.apply && report.recordsToFix.length > 0) {
      console.log('─'.repeat(60));
      console.log('  Applying fixes...\n');

      for (const rec of report.recordsToFix) {
        try {
          const ObjectId = mongoose.Types.ObjectId;
          const docId = ObjectId.isValid(rec._id) ? new ObjectId(rec._id) : rec._id;

          // Remove sourceId and sourceSite — contaminated provider mapping
          const result = await Content.findByIdAndUpdate(docId, {
            $unset: { sourceId: '', sourceSite: '' },
          });

          if (result) {
            report.fixesApplied++;
            console.log(`  ✅ Removed sourceId from "${rec.title}" (${rec._id})`);
          } else {
            report.errors.push(`Record ${rec._id} not found during update`);
            console.log(`  ❌ Record ${rec._id} not found`);
          }
        } catch (err) {
          report.errors.push(`Failed to update ${rec._id}: ${err.message}`);
          console.log(`  ❌ Failed to update "${rec.title}": ${err.message}`);
        }
      }

      console.log(`\n✅ Applied ${report.fixesApplied} fixes`);
      if (report.errors.length > 0) {
        console.log(`❌ ${report.errors.length} errors:`);
        for (const err of report.errors) {
          console.log(`   - ${err}`);
        }
      }
    }

    // ── Summary ──
    console.log('\n' + '='.repeat(60));
    console.log('  📊 Repair Summary');
    console.log('='.repeat(60));
    console.log(`  Records scanned:    ${report.scanned}`);
    console.log(`  Records to fix:     ${report.recordsToFix.length}`);
    console.log(`  Fixes applied:      ${report.fixesApplied}`);
    console.log(`  Errors:             ${report.errors.length}`);

    if (!options.apply && report.recordsToFix.length > 0) {
      console.log('\n  🛠  Run with --apply to apply these fixes:');
      console.log('     node server/scripts/repair-content-identity.js --apply');
    }

  } catch (err) {
    console.error('\n❌ Repair failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// ── Run ──
if (require.main === module) {
  runRepair().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runRepair };
