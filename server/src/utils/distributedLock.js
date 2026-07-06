// server/src/utils/distributedLock.js
// MongoDB Distributed Lock — cross-process coordination for PM2 cluster mode
//
// Architecture:
//   - Uses MongoDB as the coordination authority (no Redis dependency)
//   - Atomic insertOne for fresh lock acquisition
//   - Atomic findOneAndUpdate for expired lock takeover
//   - Owner-based release ensures only the lock holder can release it
//   - TTL-based expiry prevents stuck locks from blocking forever
//
// Lock Protocol:
//   acquire():
//     1. Try insertOne — if document doesn't exist, we own the lock (atomic)
//     2. If duplicate key (lock exists), check if expired via findOneAndUpdate
//     3. If expired and we took over → we own it; otherwise → someone else holds it
//
//   release():
//     1. deleteOne with { _id, owner } — only deletes if we are the owner
//
// Usage:
//   const lock = new DistributedLock('my-lock', { ttlMs: 60000 });
//   const acquired = await lock.acquire();
//   if (!acquired) { /* another worker holds it */ return; }
//   try {
//     // critical section
//   } finally {
//     await lock.release();
//   }

const mongoose = require('mongoose');
const os = require('os');
const crypto = require('crypto');
const logger = require('../config/logger');

class DistributedLock {
  /**
   * @param {string} name - Unique lock identifier
   * @param {object} [options]
   * @param {number} [options.ttlMs=2700000] - Lock TTL in ms (default: 45 minutes)
   */
  constructor(name, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('DistributedLock requires a non-empty string name');
    }
    this.name = name;
    this.ttlMs = options.ttlMs || 45 * 60 * 1000; // 45 minutes
    // Owner identity: hostname:pid:uniqueSessionId
    // The random session token ensures uniqueness even within the same process,
    // which is critical for correct owner-guarded release in test/simulation contexts.
    this.owner = `${os.hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
    this._collection = null;
  }

  /**
   * Ensure the MongoDB collection and index are available.
   * Throws if MongoDB is not connected.
   */
  async _ensureCollection() {
    if (this._collection) return;

    if (mongoose.connection.readyState !== 1) {
      throw new Error(
        `MongoDB not connected (readyState=${mongoose.connection.readyState}) — ` +
        'cannot initialize distributed lock'
      );
    }

    this._collection = mongoose.connection.db.collection('_locks');

    // Create TTL index so MongoDB auto-cleans expired lock docs.
    // expireAfterSeconds: 0 means documents expire at their expiresAt date.
    // This is a safety net; release() also explicitly deletes.
    await this._collection.createIndex(
      { expiresAt: 1 },
      { background: true, expireAfterSeconds: 0 }
    ).catch(() => {});
  }

  /**
   * Try to acquire the distributed lock.
   * @returns {Promise<boolean>} true if this worker now holds the lock
   */
  async acquire() {
    await this._ensureCollection();

    const now = Date.now();
    const expiry = new Date(now + this.ttlMs);

    // ── Step 1: Try atomic insert ──
    // If no document exists for this lock name, insertOne succeeds and we own it.
    try {
      await this._collection.insertOne({
        _id: this.name,
        owner: this.owner,
        acquiredAt: new Date(now),
        expiresAt: expiry,
      });
      logger.debug({ lock: this.name, owner: this.owner }, 'Distributed lock acquired (new)');
      return true;
    } catch (err) {
      if (err.code !== 11000) {
        // Unexpected error — not a duplicate key
        logger.error({ err, lock: this.name }, 'Unexpected error acquiring distributed lock');
        throw err;
      }
    }

    // ── Step 2: Lock exists — try to take over if expired ──
    // findOneAndUpdate atomically matches an expired lock and updates it.
    // If the lock isn't expired, nothing matches and we don't acquire it.
    const result = await this._collection.findOneAndUpdate(
      {
        _id: this.name,
        expiresAt: { $lt: new Date(now) },
      },
      {
        $set: {
          owner: this.owner,
          acquiredAt: new Date(now),
          expiresAt: expiry,
        },
      },
      { returnDocument: 'after' }
    );

    const acquired = result !== null && result.owner === this.owner;
    if (acquired) {
      logger.debug(
        { lock: this.name, owner: this.owner },
        'Distributed lock acquired (expired takeover)'
      );
    }
    return acquired;
  }

  /**
   * Release the distributed lock.
   * Only succeeds if this worker is the current owner (safe release).
   */
  async release() {
    if (!this._collection) return;

    try {
      const result = await this._collection.deleteOne({
        _id: this.name,
        owner: this.owner, // Only delete our own lock
      });

      if (result.deletedCount > 0) {
        logger.debug({ lock: this.name, owner: this.owner }, 'Distributed lock released');
      } else {
        // This can happen if the lock expired and was claimed by another worker
        // before we called release. Not an error.
        logger.debug(
          { lock: this.name, owner: this.owner },
          'Distributed lock release skipped — no longer owner (may have expired)'
        );
      }
    } catch (err) {
      logger.warn({ err, lock: this.name, owner: this.owner }, 'Error releasing distributed lock');
    }
  }
}

module.exports = DistributedLock;
