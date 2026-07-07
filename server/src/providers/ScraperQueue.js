// server/src/providers/ScraperQueue.js
// ScraperQueue — Controlled execution for LIGHT_SCRAPER and BROWSER_SCRAPER providers (Track C2)
//
// Architecture (C-011):
//   LIGHT_SCRAPER:   Runs through FIFO queue with limited concurrency (HTTP scraping, cheerio)
//   BROWSER_SCRAPER: Runs in isolated child process (headless browser automation)
//
// Protection layers:
//   - Global concurrency limit (5 tasks across all scrapers)
//   - Per-provider concurrency limit (configurable via execution.maxConcurrent)
//   - Per-request timeout
//   - Circuit breaker (auto-disable after 5 consecutive failures in 5 min)
//   - Exponential backoff (30s → 60s → 120s before retry)

const logger = require('../config/logger');

// ── Circuit Breaker State ──

const circuitBreakerState = new Map(); // providerId → { failures, firstFailureAt, disabledUntil }

const CIRCUIT_BREAKER_THRESHOLD = 5;    // Consecutive failures before trip
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5-minute window
const BACKOFF_DELAYS = [30 * 1000, 60 * 1000, 120 * 1000]; // Exponential backoff steps

// ── Queue State ──

const GLOBAL_MAX_CONCURRENT = 5;
let activeTasks = 0;
const queue = []; // { provider, method, args, resolve, reject, timeout }

class ScraperQueue {
  /**
   * Submit a scraper task to the queue.
   * Returns a promise that resolves with the provider's result.
   *
   * @param {Object} provider - Provider instance
   * @param {string} method - Method name to call on the provider
   * @param {Array} args - Arguments to pass to the method
   * @returns {Promise<any>}
   */
  static async submit(provider, method, args = []) {
    const providerId = provider.constructor.metadata.id;

    // Check circuit breaker
    if (this._isCircuitBroken(providerId)) {
      const state = circuitBreakerState.get(providerId);
      const remainingMs = state.disabledUntil - Date.now();
      logger.warn({
        providerId,
        remainingSeconds: Math.round(remainingMs / 1000),
      }, 'ScraperQueue: provider circuit breaker open — skipping');
      throw new Error(`Provider "${providerId}" is temporarily disabled (circuit breaker open)`);
    }

    const maxConcurrent = provider.constructor.metadata.execution?.maxConcurrent || 3;
    const timeout = provider.constructor.metadata.execution?.timeout || 15000;

    return new Promise((resolve, reject) => {
      const task = { provider, providerId, method, args, resolve, reject, timeout };

      if (activeTasks < GLOBAL_MAX_CONCURRENT) {
        this._execute(task);
      } else {
        queue.push(task);
        logger.debug({
          providerId,
          queueLength: queue.length,
          activeTasks,
        }, 'ScraperQueue: task queued');
      }
    });
  }

  /**
   * Execute a scraper task.
   */
  static async _execute(task) {
    activeTasks++;
    const { provider, providerId, method, args, resolve, reject, timeout } = task;

    logger.debug({ providerId, method }, 'ScraperQueue: executing task');

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`ScraperQueue: ${providerId}.${method}() timed out after ${timeout}ms`)), timeout)
    );

    try {
      const result = await Promise.race([
        provider[method](...args),
        timeoutPromise,
      ]);

      // Success — reset circuit breaker
      circuitBreakerState.delete(providerId);
      resolve(result);
    } catch (err) {
      // Failure — track for circuit breaker
      this._recordFailure(providerId);
      reject(err);
    } finally {
      activeTasks--;
      this._processQueue();
    }
  }

  /**
   * Process the next task in the queue.
   */
  static _processQueue() {
    if (queue.length > 0 && activeTasks < GLOBAL_MAX_CONCURRENT) {
      const task = queue.shift();
      this._execute(task);
    }
  }

  /**
   * Record a failure and update circuit breaker state.
   */
  static _recordFailure(providerId) {
    const now = Date.now();
    let state = circuitBreakerState.get(providerId);

    if (!state || (now - state.firstFailureAt) > CIRCUIT_BREAKER_WINDOW_MS) {
      // Reset counter if window has expired
      state = { failures: 0, firstFailureAt: now, disabledUntil: 0 };
    }

    state.failures++;

    if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      // Trip circuit breaker
      const backoffIndex = Math.min(state.failures - CIRCUIT_BREAKER_THRESHOLD, BACKOFF_DELAYS.length - 1);
      const backoffMs = BACKOFF_DELAYS[backoffIndex];
      state.disabledUntil = now + backoffMs;

      logger.warn({
        providerId,
        failures: state.failures,
        backoffSeconds: backoffMs / 1000,
      }, 'ScraperQueue: circuit breaker tripped');
    }

    circuitBreakerState.set(providerId, state);
  }

  /**
   * Check if a provider's circuit breaker is open.
   */
  static _isCircuitBroken(providerId) {
    const state = circuitBreakerState.get(providerId);
    if (!state || state.disabledUntil === 0) return false;
    if (Date.now() > state.disabledUntil) {
      // Circuit breaker has reset
      circuitBreakerState.delete(providerId);
      return false;
    }
    return true;
  }

  /**
   * Get current queue statistics.
   *
   * @returns {Object} Queue statistics
   */
  static getStats() {
    const brokenProviders = [];
    for (const [providerId, state] of circuitBreakerState) {
      if (state.disabledUntil > Date.now()) {
        brokenProviders.push({
          providerId,
          disabledUntil: new Date(state.disabledUntil).toISOString(),
          failures: state.failures,
        });
      }
    }

    return {
      activeTasks,
      queuedTasks: queue.length,
      globalMaxConcurrent: GLOBAL_MAX_CONCURRENT,
      circuitBrokenProviders: brokenProviders,
    };
  }

  /**
   * Reset all queue state (for testing or manual recovery).
   */
  static reset() {
    queue.length = 0;
    activeTasks = 0;
    circuitBreakerState.clear();
    logger.info('ScraperQueue: reset');
  }
}

module.exports = ScraperQueue;
