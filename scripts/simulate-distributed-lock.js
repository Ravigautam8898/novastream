#!/usr/bin/env node
// scripts/simulate-distributed-lock.js
// Phase 9 Batch A1 — Multi-worker distributed lock simulation
//
// Simulates N PM2 workers all trying to acquire the same distributed lock.
// Verifies:
//   1. Only one worker acquires the lock at a time
//   2. Workers that don't acquire the lock correctly report "not acquired"
//   3. Lock release works (locker releases → another worker can acquire)
//   4. Expired lock takeover works
//   5. Owner-based release prevents cross-worker release

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const path = require('path');

// Import the DistributedLock using the project's path
const DistributedLock = require(path.resolve(__dirname, '..', 'server', 'src', 'utils', 'distributedLock'));

let mongod;
let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.log(`  ❌ ${label}`);
    fail++;
  }
}

async function setup() {
  console.log('=== Phase 9 Batch A1 — Multi-Worker Lock Simulation ===\n');

  // Start ephemeral MongoDB
  console.log('Starting ephemeral MongoDB...');
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  console.log('Connected to ephemeral MongoDB\n');

  // Clean locks collection
  await mongoose.connection.db.collection('_locks').deleteMany({});
}

async function teardown() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

// ── Test 1: Single worker acquires and releases ──
async function testSingleWorkerAcquireRelease() {
  console.log('── Test 1: Single worker acquires and releases ──');

  const worker = new DistributedLock('test:sync', { ttlMs: 60000 });

  const acquired1 = await worker.acquire();
  assert(acquired1 === true, 'Worker acquires lock on first attempt');

  await worker.release();

  const acquired2 = await worker.acquire();
  assert(acquired2 === true, 'Worker re-acquires lock after release');

  await worker.release();
  console.log('');
}

// ── Test 2: Two workers — only one acquires ──
async function testTwoWorkersExclusive() {
  console.log('── Test 2: Two workers exclusive acquisition ──');

  const worker1 = new DistributedLock('test:exclusive', { ttlMs: 60000 });
  const worker2 = new DistributedLock('test:exclusive', { ttlMs: 60000 });

  // Both try to acquire
  const w1a = await worker1.acquire();
  const w2a = await worker2.acquire();

  assert(w1a === true, 'Worker 1 acquires lock');
  assert(w2a === false, 'Worker 2 does NOT acquire lock (held by W1)');

  // Release from worker 1
  await worker1.release();

  // Worker 2 should now acquire
  const w2b = await worker2.acquire();
  assert(w2b === true, 'Worker 2 acquires lock after Worker 1 releases');

  await worker2.release();
  console.log('');
}

// ── Test 3: Expired lock takeover ──
async function testExpiredTakeover() {
  console.log('── Test 3: Expired lock takeover ──');

  const worker1 = new DistributedLock('test:expiry', { ttlMs: 100 }); // 100ms TTL
  const worker2 = new DistributedLock('test:expiry', { ttlMs: 60000 });

  const w1a = await worker1.acquire();
  assert(w1a === true, 'Worker 1 acquires lock (100ms TTL)');

  // Wait for lock to expire
  await new Promise(r => setTimeout(r, 200));

  // Worker 2 should now be able to take over
  const w2a = await worker2.acquire();
  assert(w2a === true, 'Worker 2 acquires expired lock (takeover)');

  // Worker 1 tries to release — should be a no-op (W2 is now owner)
  await worker1.release();
  console.log('  ℹ️  Worker 1 releases (no-op — W2 now owns it)');

  // Worker 2 should still hold the lock (W1's release was owner-guarded)
  const w2b = await worker2.acquire();
  assert(w2b === false, 'Worker 2 still holds lock after W1 attempted release');

  await worker2.release();
  console.log('');
}

// ── Test 4: Three workers contending simultaneously ──
async function testThreeWorkerContention() {
  console.log('── Test 4: Three workers contending ──');

  const workers = [
    new DistributedLock('test:contention', { ttlMs: 60000 }),
    new DistributedLock('test:contention', { ttlMs: 60000 }),
    new DistributedLock('test:contention', { ttlMs: 60000 }),
  ];

  // Simulate near-simultaneous acquisition
  const results = await Promise.all(workers.map(w => w.acquire()));

  const acquiredCount = results.filter(r => r === true).length;
  assert(acquiredCount === 1, `Exactly 1 of 3 workers acquired the lock (got ${acquiredCount})`);

  // Find who acquired it, release, then next should get it
  const holderIndex = results.indexOf(true);
  assert(holderIndex >= 0, 'A worker held the lock');

  console.log(`  ℹ️  Worker ${holderIndex + 1} held the lock`);

  await workers[holderIndex].release();

  // Now another worker should acquire
  const remaining = workers.filter((_, i) => i !== holderIndex);
  const nextResults = await Promise.all(remaining.map(w => w.acquire()));
  const nextAcquired = nextResults.filter(r => r === true).length;
  assert(nextAcquired === 1, `Exactly 1 of 2 remaining workers acquired after release (got ${nextAcquired})`);

  // Cleanup
  for (const w of workers) {
    try { await w.release(); } catch {}
  }
  console.log('');
}

// ── Test 5: Owner-guarded release ──
async function testOwnerGuardedRelease() {
  console.log('── Test 5: Owner-guarded release protection ──');

  const worker1 = new DistributedLock('test:ownerGuard', { ttlMs: 100 });
  const worker2 = new DistributedLock('test:ownerGuard', { ttlMs: 60000 });

  await worker1.acquire();
  await new Promise(r => setTimeout(r, 200)); // Let lock expire

  await worker2.acquire(); // Take over

  // Worker 1 tries to release — should NOT delete worker 2's lock
  const releaseResult = await worker1.release();

  // Worker 2 should still hold the lock
  const w2Check = await worker2.acquire();
  assert(w2Check === false, 'Worker 2 lock intact after W1 attempted release (owner-guarded)');

  await worker2.release();
  console.log('');
}

// ── Main ──
async function main() {
  await setup();

  try {
    await testSingleWorkerAcquireRelease();
    await testTwoWorkersExclusive();
    await testExpiredTakeover();
    await testThreeWorkerContention();
    await testOwnerGuardedRelease();

    console.log('═══ Simulation Complete ═══');
    console.log(`  ✅ Passed: ${pass}`);
    console.log(`  ❌ Failed: ${fail}`);
    console.log(`  Result: ${fail === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);
  } catch (err) {
    console.error('\n❌ Simulation error:', err.message);
    console.error(err.stack);
  } finally {
    await teardown();
  }

  process.exit(fail > 0 ? 1 : 0);
}

main();
