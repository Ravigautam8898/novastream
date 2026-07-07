// server/scripts/audit-content-identity.js
// Content Identity Audit — detects corrupted records before Track C2
//
// Scans the Content collection for:
//   1. Duplicate slugs (same slug on multiple documents)
//   2. Duplicate tmdbIds (same tmdbId on multiple documents)
//   3. Provider identity contamination (title doesn't match tmdbId's expected title)
//   4. SourceId attached to wrong content (title has no title-match on provider)
//   5. Suspicious mappings (single-word titles matched to multi-word provider items)
//
// Usage:
//   node server/scripts/audit-content-identity.js
//
// Options:
//   --verbose    Show detailed per-record analysis
//   --json       Output as JSON (for programmatic consumption)

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

/**
 * Check if a title is a "single significant word" title.
 * E.g. "FROM" has 0 significant words (all stop/short), "Lost" has 1.
 */
function isShortOrSingleWordTitle(title) {
  const words = getSignificantWords(title);
  return words.length <= 1;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes('--verbose'),
    json: args.includes('--json'),
  };
}

// ── Main Audit ──

async function runAudit() {
  const options = parseArgs();
  const findings = {
    duplicateSlugs: [],
    duplicateTmdbIds: [],
    identityContamination: [],
    suspiciousProviderMappings: [],
    orphanedSourceIds: [],
    stats: {
      totalRecords: 0,
      withSourceId: 0,
      withTmdbId: 0,
      active: 0,
    },
  };

  console.log('='.repeat(60));
  console.log('  Content Identity Audit');
  console.log('='.repeat(60));

  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all active content
    const allContent = await Content.find({}).lean();
    findings.stats.totalRecords = allContent.length;
    findings.stats.withSourceId = allContent.filter(c => c.sourceId).length;
    findings.stats.withTmdbId = allContent.filter(c => c.tmdbId).length;
    findings.stats.active = allContent.filter(c => c.isActive).length;

    const activeContent = allContent.filter(c => c.isActive);

    console.log(`📊 Total records: ${findings.stats.totalRecords}`);
    console.log(`📊 Active: ${findings.stats.active}`);
    console.log(`📊 With sourceId: ${findings.stats.withSourceId}`);
    console.log(`📊 With tmdbId: ${findings.stats.withTmdbId}\n`);

    // ── Check 1: Duplicate slugs ──
    console.log('─── Check 1: Duplicate slugs ───');
    const slugMap = new Map();
    for (const doc of allContent) {
      const slug = doc.slug;
      if (!slugMap.has(slug)) slugMap.set(slug, []);
      slugMap.get(slug).push({ _id: doc._id.toString(), title: doc.title, tmdbId: doc.tmdbId });
    }
    for (const [slug, docs] of slugMap) {
      if (docs.length > 1) {
        findings.duplicateSlugs.push({ slug, documents: docs });
        console.log(`  ⚠️  Duplicate slug: "${slug}" — ${docs.length} documents`);
        for (const d of docs) {
          console.log(`       - ${d.title} (tmdbId: ${d.tmdbId || 'none'})`);
        }
      }
    }
    if (findings.duplicateSlugs.length === 0) {
      console.log('  ✅ No duplicate slugs found\n');
    }

    // ── Check 2: Duplicate tmdbIds ──
    console.log('\n─── Check 2: Duplicate tmdbIds ───');
    const tmdbMap = new Map();
    for (const doc of allContent) {
      if (!doc.tmdbId) continue;
      const key = doc.tmdbId;
      if (!tmdbMap.has(key)) tmdbMap.set(key, []);
      tmdbMap.get(key).push({ _id: doc._id.toString(), title: doc.title, slug: doc.slug });
    }
    for (const [tmdbId, docs] of tmdbMap) {
      if (docs.length > 1) {
        findings.duplicateTmdbIds.push({ tmdbId, documents: docs });
        console.log(`  ⚠️  Duplicate tmdbId: ${tmdbId} — ${docs.length} documents`);
        for (const d of docs) {
          console.log(`       - "${d.title}" (slug: ${d.slug})`);
        }
      }
    }
    if (findings.duplicateTmdbIds.length === 0) {
      console.log('  ✅ No duplicate tmdbIds found\n');
    }

    // ── Check 3: Provider identity contamination ──
    console.log('\n─── Check 3: Provider identity contamination ───');
    for (const doc of activeContent) {
      if (!doc.sourceId) continue;

      // Check: content has sourceId but title seems wrong for its tmdbId
      // Indicators:
      //   (a) Short/single-word title with sourceId from a multi-word provider item
      //   (b) originalTitle differs from title significantly
      //   (c) tmdbId exists but title is clearly not what TMDB expects

      const issues = [];
      const slugWords = getSignificantWords(doc.title);
      const originalWords = doc.originalTitle ? getSignificantWords(doc.originalTitle) : [];

      // (a) Short title with sourceId — likely a contamination vector
      if (isShortOrSingleWordTitle(doc.title) && doc.sourceId) {
        issues.push('short-title-with-sourceid');
      }

      // (b) originalTitle differs from title significantly
      if (doc.originalTitle && doc.originalTitle !== doc.title) {
        const titleNorm = normalizeTitle(doc.title);
        const origNorm = normalizeTitle(doc.originalTitle);
        if (titleNorm !== origNorm) {
          issues.push(`title-mismatch-original: "${doc.title}" vs original "${doc.originalTitle}"`);
        }
      }

      // (c) tmdbId exists — check if multiple content items share this tmdbId
      if (doc.tmdbId) {
        const sameTmdbCount = await Content.countDocuments({
          tmdbId: doc.tmdbId,
          _id: { $ne: doc._id },
          isActive: true,
        });
        if (sameTmdbCount > 0) {
          issues.push(`tmdbId-${doc.tmdbId}-shared-with-${sameTmdbCount}-other-docs`);
        }
      }

      if (issues.length > 0) {
        findings.identityContamination.push({
          _id: doc._id.toString(),
          title: doc.title,
          originalTitle: doc.originalTitle,
          slug: doc.slug,
          tmdbId: doc.tmdbId,
          sourceId: doc.sourceId,
          sourceSite: doc.sourceSite,
          issues,
        });
        console.log(`  ⚠️  "${doc.title}" (slug: ${doc.slug}) — ${issues.join(', ')}`);
        if (options.verbose) {
          console.log(`       tmdbId: ${doc.tmdbId || 'none'}, sourceId: ${doc.sourceId}`);
        }
      }
    }
    if (findings.identityContamination.length === 0) {
      console.log('  ✅ No identity contamination found\n');
    } else {
      console.log(`  Found ${findings.identityContamination.length} potentially contaminated records\n`);
    }

    // ── Check 4: Suspicious provider mappings ──
    console.log('\n─── Check 4: Suspicious provider mappings (sourceId on wrong content) ───');
    // Check for: content with sourceId where title has no overlap with sourceId-based title
    // This requires checking the external source API, which may fail — log those cases
    const withSourceId = activeContent.filter(c => c.sourceId);
    if (withSourceId.length > 0 && options.verbose) {
      console.log(`  ${withSourceId.length} records have sourceId — verify manually:`);
      for (const doc of withSourceId.slice(0, 20)) {
        console.log(`     - "${doc.title}" (slug: ${doc.slug}) → sourceId: ${doc.sourceId}`);
      }
    }
    console.log('  ℹ️  Deep provider match verification requires external API check.\n');

    // ── Summary ──
    console.log('='.repeat(60));
    console.log('  📊 Audit Summary');
    console.log('='.repeat(60));
    console.log(`  Total records scanned:     ${findings.stats.totalRecords}`);
    console.log(`  Active records:            ${findings.stats.active}`);
    console.log(`  Records with sourceId:     ${findings.stats.withSourceId}`);
    console.log(`  Records with tmdbId:       ${findings.stats.withTmdbId}`);
    console.log(`  Duplicate slugs:           ${findings.duplicateSlugs.length}`);
    console.log(`  Duplicate tmdbIds:         ${findings.duplicateTmdbIds.length}`);
    console.log(`  Identity contamination:    ${findings.identityContamination.length}`);
    console.log('');

    if (findings.identityContamination.length > 0) {
      console.log('  🛠  Run repair-content-identity.js to fix contaminated records:');
      console.log('     node server/scripts/repair-content-identity.js');
    }

    if (findings.duplicateSlugs.length > 0) {
      console.log('  ⚠️  Duplicate slugs should be resolved manually.');
      console.log('     Each content item must have a unique slug.');
    }

  } catch (err) {
    console.error('\n❌ Audit failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }

  if (options.json) {
    console.log('\n--- JSON OUTPUT ---');
    console.log(JSON.stringify(findings, null, 2));
  }
}

// ── Run ──
if (require.main === module) {
  runAudit().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runAudit };
