// server/scripts/verify-content-identity.js
// Content Identity Audit Tool (Track C5b)
//
// Usage:
//   node server/scripts/verify-content-identity.js              # Full audit
//   node server/scripts/verify-content-identity.js --fix        # Fix duplicate slugs
//   node server/scripts/verify-content-identity.js --verbose    # Show all items
//
// Checks:
//   1. Duplicate tmdbId values (non-null)
//   2. Duplicate metadataSources IDs across documents
//   3. Duplicate slugs
//   4. Missing slug (should never happen — schema required)
//   5. Title/year conflicts (same slug prefix, different titles)
//   6. Items with tmdbId but no metadataSources.tmdb (should fix)
//   7. Items with metadataSources.tmdb but no top-level tmdbId (should fix)
//
// Returns exit code 0 if no issues found, 1 if issues found.

const mongoose = require('mongoose');
const path = require('path');

// ── Configuration ──

const configPath = path.resolve(__dirname, '..', 'src', 'config', 'env');
const config = require(configPath);
const logger = console;

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');
  const verbose = args.includes('--verbose');

  logger.log('═'.repeat(60));
  logger.log('  Content Identity Audit Tool (C5b)');
  logger.log('═'.repeat(60));
  logger.log(`  Mode: ${fixMode ? 'FIX' : 'READ-ONLY'}  |  Verbose: ${verbose ? 'YES' : 'NO'}`);
  logger.log('');

  // Connect to MongoDB
  await mongoose.connect(config.mongodb.uri);
  logger.log(`  Connected to: ${config.mongodb.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  logger.log('');

  const db = mongoose.connection.db;
  const collection = db.collection('contents');
  const total = await collection.countDocuments();
  logger.log(`  Total content documents: ${total}`);
  logger.log('');

  const issues = {
    duplicateTmdbId: [],
    duplicateMetadataSourceId: [],
    duplicateSlug: [],
    missingSlug: [],
    titleYearConflict: [],
    missingMetadataSourcesTmdb: [],
    orphanTmdbId: [],
  };

  // ── Fetch all content items ──
  const allItems = await collection.find({}).project({
    _id: 1,
    slug: 1,
    title: 1,
    contentType: 1,
    releaseDate: 1,
    firstAirDate: 1,
    tmdbId: 1,
    imdbId: 1,
    metadataSources: 1,
    sourceId: 1,
  }).toArray();

  // ── Check 1: Duplicate tmdbId ──
  const tmdbIdMap = new Map(); // tmdbId → [items]
  for (const item of allItems) {
    if (item.tmdbId != null) {
      const key = String(item.tmdbId);
      if (!tmdbIdMap.has(key)) tmdbIdMap.set(key, []);
      tmdbIdMap.get(key).push(item);
    }
  }
  for (const [tmdbIdStr, items] of tmdbIdMap) {
    if (items.length > 1) {
      issues.duplicateTmdbId.push({
        tmdbId: tmdbIdStr,
        count: items.length,
        slugs: items.map(i => i.slug),
        titles: items.map(i => i.title),
      });
    }
  }

  // ── Check 2: Duplicate metadataSources IDs ──
  const metadataSourceMap = new Map(); // "sourceName:id" → [items]
  for (const item of allItems) {
    const sources = item.metadataSources || {};
    for (const [sourceName, sourceData] of Object.entries(sources)) {
      if (sourceData && sourceData.id) {
        const key = `${sourceName}:${sourceData.id}`;
        if (!metadataSourceMap.has(key)) metadataSourceMap.set(key, []);
        metadataSourceMap.get(key).push(item);
      }
    }
  }
  for (const [key, items] of metadataSourceMap) {
    if (items.length > 1) {
      issues.duplicateMetadataSourceId.push({
        sourceKey: key,
        count: items.length,
        slugs: items.map(i => i.slug),
      });
    }
  }

  // ── Check 3: Duplicate slugs ──
  const slugMap = new Map(); // slug → [items]
  for (const item of allItems) {
    if (item.slug) {
      if (!slugMap.has(item.slug)) slugMap.set(item.slug, []);
      slugMap.get(item.slug).push(item);
    }
  }
  for (const [slug, items] of slugMap) {
    if (items.length > 1) {
      issues.duplicateSlug.push({
        slug,
        count: items.length,
        titles: items.map(i => i.title),
      });
    }
  }

  // ── Check 4: Missing slug ──
  issues.missingSlug = allItems
    .filter(item => !item.slug)
    .map(item => ({ _id: item._id, title: item.title }));

  // ── Check 5: Title/year conflicts (same slug prefix, different titles) ──
  const slugPrefixMap = new Map(); // "prefix:contentType" → [{title, year, slug}]
  for (const item of allItems) {
    if (!item.slug) continue;
    const prefix = item.slug.replace(/-[a-z0-9]{4}$/, '');
    const key = `${prefix}:${item.contentType}`;
    if (!slugPrefixMap.has(key)) slugPrefixMap.set(key, []);
    slugPrefixMap.get(key).push({
      title: item.title,
      slug: item.slug,
      year: item.releaseDate
        ? new Date(item.releaseDate).getFullYear()
        : item.firstAirDate
          ? new Date(item.firstAirDate).getFullYear()
          : null,
    });
  }
  for (const [key, items] of slugPrefixMap) {
    if (items.length > 1) {
      // Check if titles are the same
      const uniqueTitles = new Set(items.map(i => i.title.toLowerCase()));
      if (uniqueTitles.size > 1) {
        issues.titleYearConflict.push({
          slugPrefix: key,
          items: items.map(i => `${i.title} (${i.year || '?'}) [${i.slug}]`),
        });
      }
    }
  }

  // ── Check 6: Items with tmdbId but no metadataSources.tmdb ──
  for (const item of allItems) {
    if (item.tmdbId != null) {
      const sources = item.metadataSources || {};
      if (!sources.tmdb || String(sources.tmdb.id) !== String(item.tmdbId)) {
        issues.missingMetadataSourcesTmdb.push({
          slug: item.slug,
          title: item.title,
          tmdbId: item.tmdbId,
          hasTmdbSource: !!sources.tmdb,
        });
      }
    }
  }

  // ── Check 7: Items with metadataSources.tmdb but no top-level tmdbId ──
  for (const item of allItems) {
    const sources = item.metadataSources || {};
    if (sources.tmdb && sources.tmdb.id && item.tmdbId == null) {
      issues.orphanTmdbId.push({
        slug: item.slug,
        title: item.title,
        metadataTmdbId: sources.tmdb.id,
      });
    }
  }

  // ── Report ──
  logger.log('─'.repeat(60));
  logger.log('  AUDIT RESULTS');
  logger.log('─'.repeat(60));
  logger.log('');

  let totalIssues = 0;

  // Check 1
  if (issues.duplicateTmdbId.length > 0) {
    logger.log(`  ❌ DUPLICATE tmdbId: ${issues.duplicateTmdbId.length}`);
    for (const d of issues.duplicateTmdbId) {
      logger.log(`     tmdbId=${d.tmdbId} appears ${d.count}x: ${d.slugs.join(', ')}`);
    }
    totalIssues += issues.duplicateTmdbId.length;
  } else {
    logger.log('  ✅ No duplicate tmdbId values');
  }

  // Check 2
  if (issues.duplicateMetadataSourceId.length > 0) {
    logger.log(`  ❌ DUPLICATE metadataSources ID: ${issues.duplicateMetadataSourceId.length}`);
    for (const d of issues.duplicateMetadataSourceId) {
      logger.log(`     ${d.sourceKey} appears ${d.count}x: ${d.slugs.join(', ')}`);
    }
    totalIssues += issues.duplicateMetadataSourceId.length;
  } else {
    logger.log('  ✅ No duplicate metadataSources IDs');
  }

  // Check 3
  if (issues.duplicateSlug.length > 0) {
    logger.log(`  ❌ DUPLICATE slug: ${issues.duplicateSlug.length}`);
    for (const d of issues.duplicateSlug) {
      logger.log(`     slug="${d.slug}" appears ${d.count}x: ${d.titles.join(', ')}`);
    }
    totalIssues += issues.duplicateSlug.length;
  } else {
    logger.log('  ✅ No duplicate slugs');
  }

  // Check 4
  if (issues.missingSlug.length > 0) {
    logger.log(`  ❌ MISSING slug: ${issues.missingSlug.length} items`);
    if (verbose) {
      for (const m of issues.missingSlug) {
        logger.log(`     _id=${m._id}, title=${m.title}`);
      }
    }
    totalIssues += issues.missingSlug.length;
  } else {
    logger.log('  ✅ All items have slugs');
  }

  // Check 5
  if (issues.titleYearConflict.length > 0) {
    logger.log(`  ⚠️  TITLE/YEAR CONFLICT (same slug prefix, different titles): ${issues.titleYearConflict.length}`);
    for (const c of issues.titleYearConflict) {
      logger.log(`     Prefix: ${c.slugPrefix}`);
      for (const item of c.items) {
        logger.log(`       - ${item}`);
      }
    }
    totalIssues += issues.titleYearConflict.length;
  } else {
    logger.log('  ✅ No title/year conflicts');
  }

  // Check 6
  if (issues.missingMetadataSourcesTmdb.length > 0) {
    logger.log(`  ⚠️  MISSING metadataSources.tmdb (has tmdbId): ${issues.missingMetadataSourcesTmdb.length}`);
    if (verbose) {
      for (const m of issues.missingMetadataSourcesTmdb) {
        logger.log(`     ${m.slug} (${m.title}) — tmdbId=${m.tmdbId}, hasTmdbSource=${m.hasTmdbSource}`);
      }
    }
    totalIssues += issues.missingMetadataSourcesTmdb.length;
  } else {
    logger.log('  ✅ All items with tmdbId have metadataSources.tmdb');
  }

  // Check 7
  if (issues.orphanTmdbId.length > 0) {
    logger.log(`  ⚠️  ORPHAN metadataSources.tmdb (no top-level tmdbId): ${issues.orphanTmdbId.length}`);
    if (verbose) {
      for (const o of issues.orphanTmdbId) {
        logger.log(`     ${o.slug} (${o.title}) — metadata tmdbId=${o.metadataTmdbId}`);
      }
    }
    totalIssues += issues.orphanTmdbId.length;
  } else {
    logger.log('  ✅ No orphan metadataSources.tmdb entries');
  }

  // ── Fix Mode: Resolve duplicate slugs ──
  if (fixMode && issues.duplicateSlug.length > 0) {
    logger.log('');
    logger.log('─'.repeat(60));
    logger.log('  APPLYING FIXES');
    logger.log('─'.repeat(60));
    logger.log('');

    for (const dup of issues.duplicateSlug) {
      // Keep the first item's slug, regenerate for the rest
      const [firstItem, ...restItems] = dup.slugs;
      logger.log(`  Keeping slug "${dup.slug}" for: ${dup.titles[0]}`);

      for (let i = 0; i < restItems.length; i++) {
        const slug = restItems[i];
        const title = dup.titles[i + 1];
        // Find the actual document to get the title for slug generation
        const item = allItems.find(a => a.slug === slug);
        const newSlug = require('../src/models/Content.model').generateSlug(title || item?.title || 'content');
        await collection.updateOne({ slug }, { $set: { slug: newSlug } });
        logger.log(`  → Regenerated slug: "${slug}" → "${newSlug}" (${title})`);
      }
    }
  }

  // ── Fix Mode: Sync metadataSources.tmdb ──
  if (fixMode && issues.missingMetadataSourcesTmdb.length > 0) {
    for (const m of issues.missingMetadataSourcesTmdb) {
      await collection.updateOne(
        { slug: m.slug },
        {
          $set: {
            [`metadataSources.tmdb`]: {
              id: String(m.tmdbId),
              lastSync: new Date(),
            },
          },
        }
      );
      logger.log(`  → Added metadataSources.tmdb to: ${m.slug}`);
    }
  }

  // ── Fix Mode: Sync top-level tmdbId ──
  if (fixMode && issues.orphanTmdbId.length > 0) {
    for (const o of issues.orphanTmdbId) {
      await collection.updateOne(
        { slug: o.slug },
        { $set: { tmdbId: parseInt(o.metadataTmdbId) || o.metadataTmdbId } }
      );
      logger.log(`  → Added top-level tmdbId to: ${o.slug}`);
    }
  }

  // ── Summary ──
  logger.log('');
  logger.log('─'.repeat(60));
  logger.log('  SUMMARY');
  logger.log('─'.repeat(60));
  logger.log(`  Total items scanned: ${allItems.length}`);
  logger.log(`  Total issues found:  ${totalIssues}`);
  logger.log(`  Fix mode:            ${fixMode ? 'YES' : 'NO (run with --fix to apply)'}`);
  logger.log('');
  logger.log('═'.repeat(60));

  await mongoose.disconnect();
  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch(err => {
  logger.error('Audit failed:', err.message);
  process.exit(2);
});
