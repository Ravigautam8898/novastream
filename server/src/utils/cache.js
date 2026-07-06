// server/src/utils/cache.js
// Reusable in-memory cache utility with TTL and max size support
// Used to cache frequently-hit API responses server-side

class MemoryCache {
  constructor(defaultTTLMs = 5 * 60 * 1000, maxSize = 500) {
    this._store = new Map();
    this._defaultTTL = defaultTTLMs;
    this._maxSize = maxSize;
  }

  /**
   * Get a cached value. Returns undefined if missing or expired.
   * On access, re-inserts the key to maintain LRU order.
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    // LRU: re-insert to move key to end (most recently used)
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  /**
   * Set a cached value with optional custom TTL.
   * Evicts the least recently used entry if at max capacity.
   */
  set(key, value, ttlMs) {
    // Delete existing key first so re-insert updates LRU order
    if (this._store.has(key)) {
      this._store.delete(key);
    }

    // Evict oldest entry if at capacity (LRU = first inserted key)
    if (this._store.size >= this._maxSize) {
      const oldestKey = this._store.keys().next().value;
      if (oldestKey !== undefined) {
        this._store.delete(oldestKey);
      }
    }

    this._store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this._defaultTTL),
    });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key) {
    const entry = this._store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key.
   */
  delete(key) {
    this._store.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  clear() {
    this._store.clear();
  }

  /**
   * Get the number of cached entries (including expired, cleaned lazily).
   */
  get size() {
    return this._store.size;
  }
}

module.exports = MemoryCache;
