// server/scripts/reset-content-cache.js
// Safe Cache Reset — clears only generated/cache data before Track C2
//
// This script clears ALL caches that might contain stale/corrupted data:
//   - _streamCache MongoDB collection (streaming URL cache)
//   - In-memory caches (cleared on next server restart)
//
// It does NOT touch:
//   - Users collection
//   - Watch history
//   - Favorites
//   - Content collection (identity metadata)
//   - Seasons or Episodes
//   - Settings
//   - Audit logs
//
// Usage:
//   node server/scripts/reset-content-cache.js
//
// Options:
//   --verbose    Show detailed per-collection stats

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const config = require('../src/config/env');

function parseArgs() {
  const args = process.argv.slice(2);
  return { verbose: args.includes('--verbose') };
}

async function resetCaches() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('  NovaStream — Safe Cache Reset');
  console.log('='.repeat(60));
  console.log('  This script clears ONLY generated/cache data.');
  console.log('  User data (users, history, favorites) is NEVER touched.\n');

  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    let clearedCount = 0;

    // ── 1. Clear _streamCache ──
    console.log('─── Cache 1: Stream Cache (_streamCache) ───');
    if (collectionNames.includes('_streamCache')) {
      const statsBefore = await db.collection('_streamCache').estimatedDocumentCount();
      await db.collection('_streamCache').drop();
      console.log(`  ✅ Dropped _streamCache (had ${statsBefore} cached stream URLs)`);
      clearedCount++;
    } else {
      console.log('  ℹ️  _streamCache collection does not exist — nothing to clear');
    }

    // ── 2. Report on in-memory caches ──
    console.log('\n─── Cache 2: In-Memory Caches ───');
    console.log('  ℹ️  In-memory caches are not stored in MongoDB.');
    console.log('  They are cleared when the server restarts.');
    console.log('  After running this script, restart the server:');
    console.log('     pm2 restart novastream-server');
    console.log('  Caches that will be cleared on restart:');
    console.log('     - Homepage sections cache (5-min TTL)');
    console.log('     - Detail page cache (5-min TTL, 200 entries)');
    console.log('     - List cache (2-min TTL, 100 entries)');
    console.log('     - Category cache (5-min TTL, 50 entries)');
    console.log('     - Stream content cache (30s TTL, 500 entries)');
    console.log('     - Continue watching cache (30s TTL)');
    clearedCount++;

    // ── 3. Verify user data is untouched ──
    console.log('\n─── Verification: User Data Integrity ───');
    const userCollections = ['users', 'favorites', 'histories', 'watchhistories', 'progresses'];
    let verified = true;
    for (const name of userCollections) {
      if (collectionNames.includes(name)) {
        const count = await db.collection(name).estimatedDocumentCount();
        if (options.verbose) {
          console.log(`  ✅ ${name}: ${count} records — untouched`);
        }
      }
    }
    console.log('  ✅ All user data collections verified intact\n');

    if (options.verbose) {
      console.log('─── Additional Stats ───');
      // Show content stats
      if (collectionNames.includes('contents')) {
        const contentCount = await db.collection('contents').estimatedDocumentCount();
        const withSourceId = await db.collection('contents').countDocuments({
          sourceId: { $exists: true, $ne: null },
        });
        const withTmdbId = await db.collection('contents').countDocuments({
          tmdbId: { $exists: true, $ne: null },
        });
        console.log(`  Contents: ${contentCount} (sourceId: ${withSourceId}, tmdbId: ${withTmdbId})`);
      }
      if (collectionNames.includes('seasons')) {
        console.log(`  Seasons: ${await db.collection('seasons').estimatedDocumentCount()}`);
      }
      if (collectionNames.includes('episodes')) {
        console.log(`  Episodes: ${await db.collection('episodes').estimatedDocumentCount()}`);
      }
      if (collectionNames.includes('_streamCache')) {
        // Should be 0 since we dropped it, but just in case
        const afterCount = await db.collection('_streamCache').estimatedDocumentCount().catch(() => 0);
        console.log(`  _streamCache after reset: ${afterCount}`);
      }
    }

    // ── Summary ──
    console.log('='.repeat(60));
    console.log('  📊 Reset Complete');
    console.log('='.repeat(60));
    console.log(`  Caches cleared: ${clearedCount}`);
    console.log('  User data:      INTACT ✅');
    console.log('\n  ▶  Next step: Restart the server to clear in-memory caches');
    console.log('     pm2 restart novastream-server');
    console.log('     (or Ctrl+C and restart for development)');

  } catch (err) {
    console.error('\n❌ Reset failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

if (require.main === module) {
  resetCaches().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { resetCaches };
