#!/usr/bin/env node
// server/scripts/migrate-provider-mappings.js
// C3b: Migrate legacy sourceId/sourceSite → providers[] array
//
// For every Content document with sourceId + sourceSite but no matching yupflix
// entry in providers[], adds the provider mapping.
//
// Usage:
//   node scripts/migrate-provider-mappings.js           # dry-run (no changes)
//   node scripts/migrate-provider-mappings.js --apply    # modifies database
//   node scripts/migrate-provider-mappings.js --verbose  # show each document
//
// Safety:
//   - Idempotent: safe to run multiple times
//   - Dry-run default: requires --apply to modify
//   - Never removes or overwrites existing data
//   - Does not touch documents without sourceId
//   - Does not touch documents that already have a yupflix mapping

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isVerbose = args.includes('--verbose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const contents = db.collection('contents');

  // Phase 1: Scan
  console.log('=== C3b Provider Mapping Migration ===');
  console.log(`Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}${isApply ? '' : ' (use --apply to modify database)'}`);
  console.log('');

  const total = await contents.countDocuments({});
  const withSourceId = await contents.countDocuments({ sourceId: { $exists: true, $ne: null }, isActive: true });
  const withSourceSite = await contents.countDocuments({ sourceSite: { $exists: true, $ne: null } });
  const withProviders = await contents.countDocuments({ providers: { $exists: true, $ne: [], $ne: null } });
  const alreadyMigrated = await contents.countDocuments({ providers: { $elemMatch: { providerName: 'yupflix' } } });
  const noSourceId = total - withSourceId;

  console.log('Collection overview:');
  console.log(`  Total Content documents:     ${total}`);
  console.log(`  Active with sourceId:        ${withSourceId}`);
  console.log(`  Active with sourceSite:      ${withSourceSite}`);
  console.log(`  Already have providers[]:     ${withProviders}`);
  console.log(`  Already have yupflix mapping: ${alreadyMigrated}`);
  console.log(`  No sourceId (metadata only): ${noSourceId}`);
  console.log('');

  // Phase 2: Find documents that need migration
  const needsMigration = await contents.find({
    sourceId: { $exists: true, $ne: null },
    isActive: true,
    $or: [
      { providers: { $exists: false } },
      { providers: { $eq: [] } },
      { providers: { $eq: null } },
      { 'providers.providerName': { $ne: 'yupflix' } },
    ],
  }).project({
    slug: 1,
    title: 1,
    contentType: 1,
    sourceId: 1,
    sourceSite: 1,
    providers: 1,
  }).toArray();

  const moviesNeeded = needsMigration.filter(d => d.contentType === 'movie').length;
  const seriesNeeded = needsMigration.filter(d => d.contentType === 'series').length;

  console.log(`Documents needing migration: ${needsMigration.length}`);
  console.log(`  Movies: ${moviesNeeded}`);
  console.log(`  Series: ${seriesNeeded}`);
  console.log('');

  if (needsMigration.length === 0) {
    console.log('✅ All documents already have provider mappings. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (isVerbose) {
    console.log('--- Documents to migrate ---');
    needsMigration.slice(0, 10).forEach((doc, i) => {
      console.log(`  ${i + 1}. [${doc.contentType}] "${doc.title}" (slug: ${doc.slug})`);
      console.log(`     sourceId: ${doc.sourceId}  sourceSite: ${doc.sourceSite}`);
    });
    if (needsMigration.length > 10) {
      console.log(`  ... and ${needsMigration.length - 10} more`);
    }
    console.log('');
  }

  if (!isApply) {
    console.log('ℹ️  DRY-RUN complete. Run with --apply to perform migration.');
    await mongoose.disconnect();
    return;
  }

  // Phase 3: Apply migration
  const now = new Date();
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  const BATCH_SIZE = 100;

  for (let i = 0; i < needsMigration.length; i += BATCH_SIZE) {
    const batch = needsMigration.slice(i, i + BATCH_SIZE);

    const operations = batch.map(doc => ({
      updateOne: {
        filter: {
          _id: doc._id,
          // Double-check: only update if no yupflix entry exists (race condition safety)
          $or: [
            { providers: { $exists: false } },
            { providers: { $eq: [] } },
            { providers: { $eq: null } },
            { 'providers.providerName': { $ne: 'yupflix' } },
          ],
        },
        update: {
          $push: {
            providers: {
              providerName: 'yupflix',
              providerContentId: doc.sourceId,
              legacySourceSite: doc.sourceSite || 'primary',
              confidenceScore: 100,
              status: 'verified',
              lastVerified: now,
            },
          },
        },
      },
    }));

    try {
      const result = await contents.bulkWrite(operations, { ordered: false });
      migrated += result.modifiedCount;
      skipped += operations.length - result.modifiedCount;

      if (result.writeErrors && result.writeErrors.length > 0) {
        errors += result.writeErrors.length;
        result.writeErrors.forEach(e => {
          console.warn(`  Write error on doc ${batch[e.index]?.slug || 'unknown'}: ${e.errmsg}`);
        });
      }
    } catch (err) {
      console.error(`  Batch error at offset ${i}: ${err.message}`);
      errors += operations.length;
    }

    const progress = Math.min(i + BATCH_SIZE, needsMigration.length);
    process.stdout.write(`\r  Progress: ${progress}/${needsMigration.length} (${migrated} migrated, ${skipped} skipped, ${errors} errors)`);
  }

  console.log('');
  console.log('');

  // Phase 4: Verify
  const afterMigrated = await contents.countDocuments({ providers: { $elemMatch: { providerName: 'yupflix' } } });
  const migrationTotal = await contents.countDocuments({
    sourceId: { $exists: true, $ne: null },
    isActive: true,
  });
  const migratedCount = await contents.countDocuments({
    sourceId: { $exists: true, $ne: null },
    isActive: true,
    providers: { $elemMatch: { providerName: 'yupflix' } },
  });
  const remaining = migrationTotal - migratedCount;

  console.log('=== Migration Complete ===');
  console.log(`  Applied:     ${migrated} documents`);
  console.log(`  Skipped:     ${skipped} (already had mapping or filter mismatch)`);
  console.log(`  Errors:      ${errors}`);
  console.log(`  Total with yupflix mapping: ${afterMigrated}`);
  console.log(`  Remaining unmigrated: ${remaining}`);

  if (remaining === 0) {
    console.log('✅ All active sourceId documents now have yupflix provider mapping.');
  } else {
    console.log(`⚠️  ${remaining} documents still need migration (may be inactive or have no sourceId).`);
  }

  // Phase 5: Duplicate prevention check
  const duplicates = await contents.aggregate([
    { $match: { providers: { $exists: true, $ne: [], $ne: null } } },
    { $unwind: '$providers' },
    { $match: { 'providers.providerName': 'yupflix' } },
    { $group: { _id: '$_id', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]).toArray();

  if (duplicates.length > 0) {
    console.log(`⚠️  Found ${duplicates.length} documents with duplicate yupflix provider entries!`);
    duplicates.forEach(d => {
      console.log(`  _id: ${d._id} — ${d.count} entries`);
    });
  } else {
    console.log('✅ No duplicate yupflix provider entries found.');
  }

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
