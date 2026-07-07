// server/src/providers/ProviderRegistry.js
// Provider Registry — database-backed provider configuration (Track C2)
//
// Responsibilities:
//   - Store and retrieve runtime provider config (baseUrl, API keys, timeouts)
//   - Track provider health status (online/offline, success rate, latency)
//   - Support environment variable fallback for local development
//   - No provider logic — only configuration data
//
// Config is stored in a MongoDB collection (_providerConfigs).
// Each document has the provider ID as its _id for fast lookup.

const mongoose = require('mongoose');
const logger = require('../config/logger');

const COLLECTION_NAME = '_providerConfigs';

class ProviderRegistry {
  /**
   * Get the MongoDB collection reference.
   */
  static _collection() {
    return mongoose.connection.db.collection(COLLECTION_NAME);
  }

  /**
   * Ensure indexes exist (called once at startup).
   */
  static async ensureIndexes() {
    try {
      const col = this._collection();
      await col.createIndex({ updatedAt: -1 });
    } catch (err) {
      logger.warn({ err }, 'ProviderRegistry: failed to create indexes');
    }
  }

  /**
   * Get runtime configuration for a provider.
   * Falls back to environment variables if no DB config exists.
   *
   * @param {string} providerId - Provider identifier (e.g. 'yupflix')
   * @returns {Promise<Object>} Provider configuration object
   */
  static async getConfig(providerId) {
    try {
      const doc = await this._collection().findOne({ _id: providerId });
      if (doc) {
        return doc.config || {};
      }
    } catch (err) {
      logger.warn({ err, providerId }, 'ProviderRegistry: DB lookup failed, using env fallback');
    }

    // Environment variable fallback
    return this._envFallback(providerId);
  }

  /**
   * Update runtime configuration for a provider.
   * Creates the document if it doesn't exist.
   *
   * @param {string} providerId - Provider identifier
   * @param {Object} config - Configuration fields
   * @returns {Promise<boolean>} Whether the update succeeded
   */
  static async setConfig(providerId, config) {
    try {
      await this._collection().updateOne(
        { _id: providerId },
        {
          $set: {
            config,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
      logger.info({ providerId, fields: Object.keys(config) }, 'ProviderRegistry: config updated');
      return true;
    } catch (err) {
      logger.error({ err, providerId }, 'ProviderRegistry: failed to update config');
      return false;
    }
  }

  /**
   * Update health status for a provider.
   *
   * @param {string} providerId - Provider identifier
   * @param {Object} health - Health data
   * @param {boolean} health.ok - Whether provider is operational
   * @param {number} health.latency - Response time in ms
   * @param {string} [health.error] - Error message if not ok
   * @returns {Promise<void>}
   */
  static async recordHealth(providerId, health) {
    try {
      await this._collection().updateOne(
        { _id: providerId },
        {
          $set: {
            'health.lastCheck': new Date(),
            'health.ok': health.ok,
            'health.latency': health.latency,
            'health.error': health.error || null,
          },
          $inc: {
            'health.totalChecks': 1,
            ...(health.ok ? { 'health.successfulChecks': 1 } : { 'health.failedChecks': 1 }),
          },
        },
        { upsert: true }
      );
    } catch (err) {
      logger.warn({ err, providerId }, 'ProviderRegistry: failed to record health');
    }
  }

  /**
   * Record a successful stream resolution.
   *
   * @param {string} providerId - Provider identifier
   * @param {number} latencyMs - Resolution time in ms
   * @returns {Promise<void>}
   */
  static async recordSuccess(providerId, latencyMs) {
    try {
      await this._collection().updateOne(
        { _id: providerId },
        {
          $set: { 'stats.lastSuccess': new Date() },
          $inc: { 'stats.totalResolves': 1, 'stats.successfulResolves': 1 },
          $min: { 'stats.minLatency': latencyMs },
          $max: { 'stats.maxLatency': latencyMs },
        },
        { upsert: true }
      );
    } catch (err) {
      logger.warn({ err, providerId }, 'ProviderRegistry: failed to record success');
    }
  }

  /**
   * Record a failed stream resolution.
   *
   * @param {string} providerId - Provider identifier
   * @returns {Promise<void>}
   */
  static async recordFailure(providerId) {
    try {
      await this._collection().updateOne(
        { _id: providerId },
        {
          $set: { 'stats.lastFailure': new Date() },
          $inc: { 'stats.totalResolves': 1, 'stats.failedResolves': 1 },
        },
        { upsert: true }
      );
    } catch (err) {
      logger.warn({ err, providerId }, 'ProviderRegistry: failed to record failure');
    }
  }

  /**
   * List all registered providers with their current config and health.
   *
   * @returns {Promise<Array>} Array of provider documents
   */
  static async listProviders() {
    try {
      return await this._collection().find({}).sort({ 'config.priority': 1 }).toArray();
    } catch (err) {
      logger.error({ err }, 'ProviderRegistry: failed to list providers');
      return [];
    }
  }

  /**
   * Delete a provider's configuration.
   *
   * @param {string} providerId - Provider identifier
   * @returns {Promise<boolean>} Whether deletion succeeded
   */
  static async deleteProvider(providerId) {
    try {
      const result = await this._collection().deleteOne({ _id: providerId });
      return result.deletedCount > 0;
    } catch (err) {
      logger.error({ err, providerId }, 'ProviderRegistry: failed to delete provider');
      return false;
    }
  }

  /**
   * Fall back to environment variables for a provider's configuration.
   *
   * @param {string} providerId - Provider identifier (uppercased for env var lookup)
   * @returns {Object} Configuration from environment variables
   */
  static _envFallback(providerId) {
    const prefix = providerId.toUpperCase().replace(/-/g, '_');
    return {
      baseUrl: process.env[`${prefix}_BASE_URL`] || process.env.EXTERNAL_SOURCE_BASE_URL,
      apiKey: process.env[`${prefix}_API_KEY`] || null,
      userAgent: process.env[`${prefix}_USER_AGENT`] || process.env.EXTERNAL_SOURCE_USER_AGENT,
      referer: process.env[`${prefix}_REFERER`] || process.env.EXTERNAL_SOURCE_REFERER,
      timeout: parseInt(process.env[`${prefix}_TIMEOUT`], 10) ||
               parseInt(process.env.EXTERNAL_SOURCE_TIMEOUT, 10) || 10000,
    };
  }
}

module.exports = ProviderRegistry;
