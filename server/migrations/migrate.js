#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 * NovaStream — Migration Runner (PPR-008)
 * ═══════════════════════════════════════════════════════════
 *
 * Applies reversible database migrations from the migrations/ directory.
 * Each migration must export `up(db)` and `down(db)` functions.
 *
 * Usage:
 *   node server/migrations/migrate.js up          # Apply all pending migrations
 *   node server/migrations/migrate.js up 001      # Apply specific migration
 *   node server/migrations/migrate.js down         # Rollback last migration
 *   node server/migrations/migrate.js down 001     # Rollback specific migration
 *   node server/migrations/migrate.js status       # Show migration status
 *   node server/migrations/migrate.js --dry-run    # Preview without changes
 *
 * Migration file format:
 *   server/migrations/001-description.js
 *   ├── async up(db)    — Apply migration
 *   └── async down(db)  — Rollback migration
 *
 * ═══════════════════════════════════════════════════════════
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ── Colors ──
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const MIGRATIONS_DIR = path.resolve(__dirname);
const isDryRun = process.argv.includes('--dry-run');
const command = process.argv.find(a => ['up', 'down', 'status'].includes(a)) || 'status';
const target = process.argv
  .filter(a => /^\d{3}/.test(a))
  .pop() || null;

// ── Migration Tracking Collection ──
// Stores which migrations have been applied and when.
const COLLECTION_NAME = '_migrations';

async function getAppliedMigrations(db) {
  try {
    const collection = db.collection(COLLECTION_NAME);
    const docs = await collection.find({}).sort({ appliedAt: 1 }).toArray();
    return docs.map(d => d.name);
  } catch {
    return [];
  }
}

async function recordMigration(db, name, direction) {
  if (isDryRun) return;
  const collection = db.collection(COLLECTION_NAME);
  if (direction === 'up') {
    await collection.updateOne(
      { name },
      { $set: { name, appliedAt: new Date(), checksum: null } },
      { upsert: true }
    );
  } else {
    await collection.deleteOne({ name });
  }
}

// ── Load migrations ──
function loadMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}-.+\.js$/.test(f))
    .sort();

  return files.map(file => {
    const name = file.replace('.js', '');
    const migration = require(path.join(MIGRATIONS_DIR, file));
    return { name, file, ...migration };
  });
}

// ── Logger ──
function step(msg) { console.log(`\n  ${BOLD}${CYAN}${msg}${RESET}`); }
function log(msg) { console.log(`    ${msg}`); }
function pass(msg) { console.log(`  ${GREEN}✓ ${msg}${RESET}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠ ${msg}${RESET}`); }
function fail(msg) { console.log(`  ${RED}✗ ${msg}${RESET}`); }

// ═══════════════════════════════════════════════════════════
//  Commands
// ═══════════════════════════════════════════════════════════

async function cmdStatus(db) {
  step('Migration Status');

  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(db);

  if (migrations.length === 0) {
    log('No migration files found.');
    return;
  }

  for (const m of migrations) {
    const isApplied = applied.includes(m.name);
    if (isApplied && target && target === m.name.slice(0, 3)) {
      // Show details for specific target
      log(`${GREEN}✓${RESET} ${m.name}  ${GRAY}(applied)${RESET}`);
    } else if (isApplied) {
      log(`${GREEN}✓${RESET} ${m.name}`);
    } else {
      log(`${YELLOW}○${RESET} ${m.name}  ${GRAY}(pending)${RESET}`);
    }
  }

  const pending = migrations.filter(m => !applied.includes(m.name)).length;
  const appliedCount = migrations.length - pending;
  console.log('');
  log(`${appliedCount}/${migrations.length} applied  |  ${pending} pending`);
}

async function cmdUp(db) {
  step('Applying Migrations');

  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(db);

  let targetIndex = migrations.length;

  if (target) {
    targetIndex = migrations.findIndex(m => m.name.startsWith(target));
    if (targetIndex === -1) {
      fail(`Migration '${target}' not found`);
      process.exit(1);
    }
    targetIndex += 1; // Include the target migration
  }

  let count = 0;
  for (const m of migrations) {
    if (applied.includes(m.name)) continue;
    if (migrations.indexOf(m) >= targetIndex) break;

    if (typeof m.up !== 'function') {
      warn(`${m.name}: missing up() function — skipping`);
      continue;
    }

    if (isDryRun) {
      log(`${YELLOW}[DRY RUN]${RESET} Would apply: ${m.name}`);
      count++;
      continue;
    }

    try {
      log(`Applying: ${m.name}`);
      await m.up(db);
      await recordMigration(db, m.name, 'up');
      pass(`${m.name} applied`);
      count++;
    } catch (err) {
      fail(`${m.name} failed: ${err.message}`);
      process.exit(1);
    }
  }

  if (count === 0) {
    warn(isDryRun ? 'No migrations to apply (dry run)' : 'No pending migrations');
  } else {
    pass(`${count} migration(s) applied`);
  }
}

async function cmdDown(db) {
  step('Rolling Back Migrations');

  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(db);

  let toRollback = [];

  if (target) {
    // Rollback specific migration
    const idx = migrations.findIndex(m => m.name.startsWith(target));
    if (idx === -1) {
      fail(`Migration '${target}' not found`);
      process.exit(1);
    }
    if (!applied.includes(migrations[idx].name)) {
      warn(`Migration '${target}' is not applied`);
      return;
    }
    toRollback = [migrations[idx]];
  } else {
    // Rollback last applied migration
    const lastApplied = migrations.filter(m => applied.includes(m.name)).pop();
    if (!lastApplied) {
      warn('No migrations to roll back');
      return;
    }
    toRollback = [lastApplied];
  }

  for (const m of toRollback) {
    if (typeof m.down !== 'function') {
      warn(`${m.name}: missing down() function — cannot roll back`);
      continue;
    }

    if (isDryRun) {
      log(`${YELLOW}[DRY RUN]${RESET} Would roll back: ${m.name}`);
      continue;
    }

    try {
      log(`Rolling back: ${m.name}`);
      await m.down(db);
      await recordMigration(db, m.name, 'down');
      pass(`${m.name} rolled back`);
    } catch (err) {
      fail(`${m.name} rollback failed: ${err.message}`);
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════

(async () => {
  console.log(`\n  ${BOLD}${CYAN}NovaStream — Migration Runner${RESET}`);
  if (isDryRun) console.log(`  ${YELLOW}🔍 DRY RUN MODE${RESET}`);
  console.log('');

  // Connect to MongoDB
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    try {
      const envPath = path.resolve(__dirname, '..', '..', '.env');
      if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        uri = process.env.MONGODB_URI;
      }
    } catch {}
  }

  if (!uri) {
    fail('MONGODB_URI not set. Set it in .env or as an environment variable.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
    });
    pass('Connected to MongoDB');
  } catch (err) {
    fail(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  const db = mongoose.connection.db;

  try {
    switch (command) {
      case 'status':
        await cmdStatus(db);
        break;
      case 'up':
        await cmdUp(db);
        break;
      case 'down':
        await cmdDown(db);
        break;
    }
  } catch (err) {
    fail(`Migration error: ${err.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }

  console.log('');
})();
