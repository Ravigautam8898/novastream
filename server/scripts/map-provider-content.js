#!/usr/bin/env node
// server/scripts/map-provider-content.js
// C4b: Generic content mapping tool — search provider APIs and attach providers[] mappings
//
// For every active Content document with a tmdbId, searches the specified provider
// for matching content and attaches the provider's content ID via ContentRegistry.
//
// Usage:
//   node scripts/map-provider-content.js --provider=castletv           # dry-run (no changes)
//   node scripts/map-provider-content.js --provider=castletv --apply   # modifies database
//   node scripts/map-provider-content.js --provider=castletv --verbose # show each match
//   node scripts/map-provider-content.js --provider=castletv --limit=50 # max 50 docs
//
// Matching rules:
//   tmdbId from provider response  → confidence 100 (direct match)
//   title + year + type match      → confidence 85-90
//   title-only match               → REJECTED (logged for review)
//
// Safety:
//   - Idempotent: safe to run multiple times
//   - Dry-run default: requires --apply to modify
//   - Never creates duplicate provider entries ($addToSet)
//   - Skips content that already has the specified provider mapping

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const providerArg = args.find(a => a.startsWith('--provider='));
const isApply = args.includes('--apply');
const isVerbose = args.includes('--verbose');
const limitArg = args.find(a => a.startsWith('--limit='));

const providerName = providerArg ? providerArg.split('=')[1] : null;
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

if (!providerName) {
  console.error('Usage: node scripts/map-provider-content.js --provider=PROVIDER_NAME [--apply] [--verbose] [--limit=N]');
  console.error('');
  console.error('Available providers are discovered by ProviderManager at runtime.');
  console.error('The provider must have search() and getEpisodes() implemented.');
  process.exit(1);
}

async function mapContent() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const contents = db.collection('contents');
  const Content = require('../src/models/Content.model');
  const ContentRegistry = require('../src/providers/ContentRegistry');

  console.log('=== Content Mapping Tool ===');
  console.log(`Provider: ${providerName}`);
  console.log(`Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}${isApply ? '' : ' (use --apply to modify database)'}`);
  console.log(`Limit: ${limit === Infinity ? 'unlimited' : limit}`);
  console.log('');

  // Step 1: Load the provider
  let provider;
  try {
    // Try to load from the sources directory
    const ProviderClass = require(`../src/providers/sources/${providerName}.provider.js`);
    provider = new ProviderClass();
    await provider.initialize();
    console.log(`✅ Provider "${providerName}" loaded successfully`);
  } catch (err) {
    console.error(`❌ Failed to load provider "${providerName}": ${err.message}`);
    console.error('');
    console.error('Make sure the provider file exists at:');
    console.error(`  server/src/providers/sources/${providerName}.provider.js`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Step 2: Health check
  const health = await provider.healthCheck();
  if (!health.ok) {
    console.error(`❌ Provider health check failed: ${health.error || 'unknown'}`);
    console.error('   Cannot proceed — the provider API is unreachable.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Provider health check passed (${health.latency}ms)`);
  console.log('');

  // Step 3: Find content that needs mapping
  const queryFilter = {
    isActive: true,
    // Only process content that has a tmdbId (for confidence matching)
    tmdbId: { $exists: true, $ne: null },
    // Skip content that already has this provider's mapping
    'providers.providerName': { $ne: providerName },
  };

  const totalCandidates = await contents.countDocuments(queryFilter);
  const candidates = await contents.find(queryFilter)
    .project({ slug: 1, title: 1, contentType: 1, tmdbId: 1, releaseDate: 1, firstAirDate: 1 })
    .limit(limit)
    .toArray();

  console.log('Candidates for mapping:');
  console.log(`  Total eligible (with tmdbId, no existing ${providerName} mapping): ${totalCandidates}`);
  console.log(`  Processing (respecting --limit): ${candidates.length}`);
  console.log('');

  if (candidates.length === 0) {
    console.log('✅ No content needs mapping. All eligible content already has this provider mapping.');
    await mongoose.disconnect();
    return;
  }

  // Step 4: Attempt matching
  let matched = 0;
  let rejected = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const doc = candidates[i];
    const year = doc.releaseDate
      ? new Date(doc.releaseDate).getFullYear()
      : doc.firstAirDate
        ? new Date(doc.firstAirDate).getFullYear()
        : null;

    const progress = `[${i + 1}/${candidates.length}]`;
    const docInfo = `"${doc.title}" (${year || 'no year'}, ${doc.contentType}, tmdbId: ${doc.tmdbId})`;

    try {
      // Strategy 1: Search by title on the provider
      const searchResults = await provider.search(doc.title);

      if (!searchResults || searchResults.length === 0) {
        if (isVerbose) console.log(`  ${progress} ${docInfo} → ⏭️  No search results`);
        skipped++;
        continue;
      }

      let bestMatch = null;
      let bestConfidence = 0;
      let matchMethod = 'none';

      for (const result of searchResults) {
        // Check for exact tmdbId match (confidence 100)
        if (result.tmdbId && String(result.tmdbId) === String(doc.tmdbId)) {
          bestMatch = result;
          bestConfidence = 100;
          matchMethod = 'tmdbId';
          break; // Perfect match — stop searching
        }

        // Check for title + year + type match (confidence 85-90)
        if (year && result.year) {
          const yearDiff = Math.abs(result.year - year);
          if (yearDiff <= 2 && result.type === doc.contentType) {
            // Check title similarity
            const titleScore = titleSimilarity(result.title, doc.title);
            if (titleScore > 0.7) {
              const confidence = yearDiff === 0 ? 90 : 85;
              if (confidence > bestConfidence) {
                bestMatch = result;
                bestConfidence = confidence;
                matchMethod = 'titleYearType';
              }
            }
          }
        }
      }

      if (!bestMatch || !bestMatch.id) {
        if (isVerbose) console.log(`  ${progress} ${docInfo} → ❌ No confident match found`);
        rejected++;
        continue;
      }

      // Step 5: Build providerData from search result (C4c)
      // Providers can attach extra fields via providerData for advanced use
      const providerData = bestMatch.providerData || {};
      if (!bestMatch.providerData && bestMatch.year) {
        providerData.matchedYear = bestMatch.year;
        providerData.originalTitle = bestMatch.title;
        providerData.providerType = bestMatch.type;
      }

      // Step 6: Attach the provider mapping
      if (isApply) {
        await ContentRegistry.attachProvider(doc._id, {
          providerName,
          providerContentId: bestMatch.id,
          providerData,
          confidence: bestConfidence / 100,
          status: bestConfidence >= 90 ? 'verified' : 'active',
        });
      }

      matched++;
      if (isVerbose || !isApply) {
        const action = isApply ? '✅ MAPPED' : '🔍 WOULD MAP';
        console.log(`  ${progress} ${docInfo}`);
        console.log(`           ${action} → ${providerName} ID: ${bestMatch.id} (confidence: ${bestConfidence}%, method: ${matchMethod})`);
        console.log(`           providerData: ${JSON.stringify(providerData)}`);
        if (bestConfidence < 100) {
          console.log(`           Provider result: "${bestMatch.title}" (${bestMatch.year || '?'}, ${bestMatch.type})`);
        }
      }
    } catch (err) {
      errors++;
      if (isVerbose) console.log(`  ${progress} ${docInfo} → ⚠️  Error: ${err.message.slice(0, 100)}`);
    }
  }

  // Step 6: Summary
  console.log('');
  console.log('=== Mapping Summary ===');
  console.log(`  Total processed:  ${candidates.length}`);
  console.log(`  Matched:          ${matched}${isApply ? '' : ' (dry-run, use --apply to persist)'}`);
  console.log(`  Rejected:         ${rejected} (no confident match)`);
  console.log(`  Skipped (no results): ${skipped}`);
  console.log(`  Errors:           ${errors}`);

  if (candidates.length > 0 && matched === 0 && rejected === 0 && skipped > 0) {
    console.log('');
    console.log('⚠️  No search results found. Possible issues:');
    console.log(`   - The provider "${providerName}" may not have this content`);
    console.log('   - The provider search API may require different query formatting');
    console.log('   - The provider may be rate-limiting requests');
  }

  await mongoose.disconnect();
}

// ── Title similarity helper (simple word overlap) ──
function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const wordsA = new Set(normalize(a).split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(normalize(b).split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  // Jaccard similarity on significant words
  const union = new Set([...wordsA, ...wordsB]);
  return intersection / union.size;
}

mapContent().catch(err => {
  console.error('Mapping failed:', err);
  process.exit(1);
});
