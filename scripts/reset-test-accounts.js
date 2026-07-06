/**
 * Reset Test Accounts — Nuke all users + sessions, create fresh accounts.
 * Run: node scripts/reset-test-accounts.js
 */
const mongoose = require('mongoose');
const path = require('path');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

async function reset() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/novastream';
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;

  // 1. Drop all users
  const userResult = await db.collection('users').deleteMany({});
  console.log(`🗑️  Deleted ${userResult.deletedCount} users`);

  // 2. Drop all sessions
  const sessionResult = await db.collection('sessions').deleteMany({});
  console.log(`🗑️  Deleted ${sessionResult.deletedCount} sessions`);

  // 3. Create fresh accounts
  const User = require(path.join(__dirname, '..', 'server', 'src', 'models', 'User.model'));

  // Super Admin
  const superAdmin = await User.createUser('super_admin', 'admin123', 'super_admin');
  console.log(`✅ Created: super_admin / admin123 — role: super_admin`);

  // Manager
  const manager = await User.createUser('manager', 'admin123', 'manager', superAdmin._id);
  console.log(`✅ Created: manager / admin123 — role: manager (createdBy: super_admin)`);

  // Member / User
  const user = await User.createUser('user', 'user123', 'member', manager._id);
  console.log(`✅ Created: user / user123 — role: member (createdBy: manager)`);

  console.log('\n═══════════════════════════════════════');
  console.log('  Test Accounts Ready!');
  console.log('───────────────────────────────────────');
  console.log('  super_admin  /  admin123   →  Super Admin (full access)');
  console.log('  manager      /  admin123   →  Manager (own members only)');
  console.log('  user         /  user123    →  Member (no admin access)');
  console.log('═══════════════════════════════════════\n');

  await mongoose.disconnect();
  console.log('👋 Disconnected');
  process.exit(0);
}

reset().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
