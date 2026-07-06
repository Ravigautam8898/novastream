// server/src/cli/commands/database.command.js
// Database Tools — status, repair (indexes, defaults), seed data

const SystemService = require('../../services/system.service');
const Content = require('../../models/Content.model');

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const c = (color, text) => colors[color] + text + colors.reset;

async function show(rl, mongoose) {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    console.log(c('red', '\n  ❌ Database not connected.\n'));
    return;
  }

  while (true) {
    console.clear();
    console.log(c('cyan', '\n╔══════════════════════════════════════════╗'));
    console.log(c('cyan', '║          Database Tools                  ║'));
    console.log(c('cyan', '╚══════════════════════════════════════════╝\n'));

    console.log('  [1] Database Status');
    console.log('  [2] Repair Indexes');
    console.log('  [3] Seed Default Data');
    console.log('  [4] Back to Main Menu\n');

    const choice = await ask(rl, '  Choose: ');

    switch (choice.trim()) {
      case '1':
        await dbStatus(mongoose);
        break;
      case '2':
        await repairIndexes(mongoose);
        break;
      case '3':
        await seedDefaults(rl, mongoose);
        break;
      case '4':
        return;
      default:
        console.log(c('red', '\n  ❌ Invalid option.\n'));
    }

    if (choice.trim() !== '4') {
      await ask(rl, c('dim', '\n  Press Enter to continue...'));
    }
  }
}

async function dbStatus(mongoose) {
  console.log(c('bright', '\n  🗄️  Database Status\n'));

  const db = mongoose.connection;
  const stats = await SystemService.getDatabaseStats(db);

  console.log(`     Status:       ${c('green', 'Connected')}`);
  console.log(`     MongoDB:      ${stats.version || 'Unknown'}`);
  console.log(`     Data Size:    ${formatBytes(stats.dataSize || 0)}`);
  console.log(`     Storage Size: ${formatBytes(stats.storageSize || 0)}`);
  console.log(`     Indexes:      ${stats.indexes || 0}`);
  console.log('');

  if (stats.collections && stats.collections.length > 0) {
    console.log(c('bright', '  Collections\n'));
    const header = `  ${'Name'.padEnd(22)} ${'Documents'.padEnd(12)} ${'Size'.padEnd(12)} ${'Indexes'.padEnd(8)}`;
    console.log(c('dim', header));
    console.log(c('dim', '  ' + '-'.repeat(60)));
    for (const col of stats.collections) {
      console.log(
        `  ${col.name.padEnd(22)} ${(col.count || 0).toString().padEnd(12)} ${formatBytes(col.size || 0).padEnd(12)} ${(col.indexes || 0).toString().padEnd(8)}`
      );
    }
    console.log('');
  }
}

async function repairIndexes(mongoose) {
  console.log(c('bright', '\n  🔧 Repair Indexes\n'));

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    let fixed = 0;

    for (const col of collections) {
      try {
        // Ensure text index on contents collection
        if (col.name === 'contents') {
          await mongoose.connection.collection(col.name).createIndex(
            { title: 'text', overview: 'text', tagline: 'text' },
            { name: 'content_text_search', background: true }
          );
          fixed++;
        }
        // Ensure TTL index on sessions
        if (col.name === 'sessions') {
          const indexes = await mongoose.connection.collection(col.name).indexes();
          const hasTTL = indexes.some(idx => idx.expireAfterSeconds !== undefined);
          if (!hasTTL) {
            await mongoose.connection.collection(col.name).createIndex(
              { expiresAt: 1 },
              { expireAfterSeconds: 0, background: true }
            );
            fixed++;
          }
        }
        // Ensure unique username index on users
        if (col.name === 'users') {
          await mongoose.connection.collection(col.name).createIndex(
            { username: 1 },
            { unique: true, background: true }
          );
          fixed++;
        }
      } catch (err) {
        console.log(c('yellow', `  ⚠️  ${col.name}: ${err.message}`));
      }
    }

    console.log(c('green', `  ✅ Indexes repaired. ${fixed} indexes ensured.\n`));
  } catch (err) {
    console.log(c('red', `  ❌ Failed to repair indexes: ${err.message}\n`));
  }
}

async function seedDefaults(rl, mongoose) {
  console.log(c('bright', '\n  🌱 Seed Default Data\n'));

  const confirm = await ask(rl, c('yellow', '  This is idempotent — existing data will not be overwritten.\n  Proceed? (yes/no): '));
  if (confirm.trim().toLowerCase() !== 'yes') {
    console.log(c('yellow', '  Cancelled.\n'));
    return;
  }

  try {
    // Seed subscription plans
    const SubscriptionPlan = require('../../models/SubscriptionPlan.model');
    await SubscriptionPlan.seedDefaults();
    console.log(c('green', '  ✅ Subscription plans seeded.'));

    console.log(c('green', '\n  ✅ Default data seeded successfully.\n'));
  } catch (err) {
    console.log(c('red', `  ❌ Failed to seed: ${err.message}\n`));
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

module.exports = { show };
