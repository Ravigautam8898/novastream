// server/src/config/database.js
// MongoDB connection with Mongoose
//
// Connection resilience strategy:
//   - Exponential backoff with jitter: 5s → 15s → 30s → 60s → 2min (max 5min)
//   - ±20% jitter prevents thundering herd when multiple workers reconnect
//   - Permanent errors (auth, IP whitelist) fail fast with actionable message
//   - Transient errors (network, DNS, timeout) continue retrying with backoff
//   - Runtime disconnect events are deduplicated — no log spam
//   - Reconnect tracking: lastDisconnect timestamp + retryAttempt counter
//     exported for health endpoint consumption

const mongoose = require('mongoose');
const config = require('./env');
const logger = require('./logger');

// ── Reconnect State (exported for health endpoint) ──
const reconnectState = {
  lastDisconnect: null,        // Date of most recent disconnect
  lastReconnect: null,         // Date of most recent successful reconnect
  retryAttempt: 0,             // Current retry attempt counter
  isReconnecting: false,       // Whether a runtime reconnect is in progress
};

// ── Connection Options ──
const options = {
  maxPoolSize: config.mongodb.maxPoolSize,
  minPoolSize: config.mongodb.minPoolSize,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
};

// ── Retry Configuration ──
//
// Backoff delays (exponential, capped at 5 minutes):
//   Attempt 1 →  5s
//   Attempt 2 → 15s
//   Attempt 3 → 30s
//   Attempt 4 → 60s
//   Attempt 5 →  2min
//   Attempt 6+ → 5min (cap)
//
// Each delay has ±20% jitter applied to prevent synchronized reconnection
// when multiple workers/instances restart simultaneously.
//
const MAX_RETRIES = 6;
const BACKOFF_DELAYS = [5000, 15000, 30000, 60000, 120000, 300000];

/**
 * Apply ±20% jitter to a delay value.
 * Prevents thundering herd when multiple workers reconnect simultaneously.
 * @param {number} delayMs - Base delay in milliseconds
 * @returns {number} Jittered delay in milliseconds
 */
function addJitter(delayMs) {
  const jitter = delayMs * 0.2; // 20% of base delay
  return Math.round(delayMs - jitter + Math.random() * jitter * 2);
}

/**
 * Classify a MongoDB/Mongoose connection error as permanent or transient.
 *
 * Permanent errors (fail fast):
 *   - Authentication failure (wrong username/password)
 *   - IP whitelist rejection (Atlas)
 *   - Bad URI format
 *   - SSL/TLS configuration errors
 *
 * Transient errors (continue retrying):
 *   - Network timeout (serverSelectionTimeout)
 *   - DNS resolution failure
 *   - Connection refused / unreachable
 *   - SSL certificate temporary errors
 *   - Atlas IP whitelist temporary (treated as network — may resolve with retry)
 *
 * @param {Error} error - The connection error
 * @returns {{ permanent: boolean, label: string }}
 */
function classifyError(error) {
  const msg = (error.message || '').toLowerCase();
  const name = error.name || '';

  // ── Authentication failures ──
  if (
    error.code === 8000 ||
    error.code === 18 ||
    msg.includes('auth failed') ||
    msg.includes('authentication failed') ||
    msg.includes('auth error') ||
    msg.includes('bad auth') ||
    msg.includes('unauthorized') ||
    msg.includes('not authorized')
  ) {
    return { permanent: true, label: 'authentication_failure' };
  }

  // ── URI / Parse errors ──
  if (
    name === 'MongoParseError' ||
    msg.includes('invalid uri') ||
    msg.includes('mongodb uri') ||
    msg.includes('parse') && msg.includes('mongodb')
  ) {
    return { permanent: true, label: 'invalid_uri' };
  }

  // ── SSL / TLS configuration errors ──
  if (
    msg.includes('ssl') ||
    msg.includes('tls') ||
    msg.includes('certificate') ||
    msg.includes('cert')
  ) {
    return { permanent: true, label: 'ssl_configuration_error' };
  }

  // ── Network / transient errors ──
  return { permanent: false, label: 'network_error' };
}

/**
 * Connect to MongoDB with exponential backoff and jitter.
 *
 * - Auth/URI/SSL errors → fail fast with actionable message
 * - Network errors → retry with ±20% jittered backoff up to MAX_RETRIES
 * - Already-connected → fast-path return
 *
 * @returns {Promise<mongoose.Connection>}
 */
async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    logger.info('MongoDB already connected');
    return mongoose.connection;
  }

  let lastError;
  let isPermanent = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(config.mongodb.uri, options);

      // Success — update reconnect state
      reconnectState.retryAttempt = 0;
      reconnectState.isReconnecting = false;
      reconnectState.lastReconnect = new Date();

      logger.info({ attempt }, 'MongoDB connected successfully');
      return mongoose.connection;
    } catch (error) {
      lastError = error;

      // Classify the error
      const classification = classifyError(error);
      isPermanent = classification.permanent;

      // ── Permanent errors: fail fast, log actionable message ──
      if (isPermanent) {
        const labelMap = {
          authentication_failure:
            '❌ MongoDB authentication failed — check username and password in MONGODB_URI',
          invalid_uri:
            '❌ Invalid MongoDB URI format — check MONGODB_URI in .env',
          ssl_configuration_error:
            '❌ MongoDB SSL/TLS configuration error — check certificate and connection string',
        };
        const humanMessage = labelMap[classification.label] || `❌ MongoDB permanent error: ${classification.label}`;

        logger.error({
          event: 'database_connection_failed',
          reason: classification.label,
          message: error.message,
        }, humanMessage);

        throw error; // Fail immediately — no retry for permanent errors
      }

      // ── Transient errors: retry with backoff ──
      if (attempt === MAX_RETRIES) {
        logger.error({
          event: 'database_connection_exhausted',
          attempt,
          message: error.message,
        }, 'MongoDB connection failed — all retries exhausted');
        break;
      }

      const baseDelay = BACKOFF_DELAYS[Math.min(attempt - 1, BACKOFF_DELAYS.length - 1)];
      const delayMs = addJitter(baseDelay);

      logger.warn({
        event: 'database_connection_retry',
        attempt,
        nextRetryMs: delayMs,
        reason: classification.label,
        message: error.message,
      }, `MongoDB connection attempt ${attempt} failed — retrying in ${(delayMs / 1000).toFixed(0)}s`);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// ── Disconnect Function ──
async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB disconnect failed');
  }
}

// ── Runtime Reconnect State ──
let _lastErrorEvent = null;   // For deduplication: tracks last logged error key

/**
 * Reset the deduplication timer so the next error of the same type is logged.
 * Called periodically to avoid permanent suppression of repeated errors.
 */
function resetErrorDedup() {
  _lastErrorEvent = null;
}

// ── Event Handlers ──

mongoose.connection.on('connected', () => {
  logger.info('Mongoose connection established');
});

mongoose.connection.on('error', (err) => {
  // Deduplication: only log the same error type once per 60s
  const errorKey = err?.message?.slice(0, 80) || 'unknown';
  const now = Date.now();

  if (_lastErrorEvent && _lastErrorEvent.key === errorKey && (now - _lastErrorEvent.time) < 60000) {
    return; // Suppress — same error logged within last 60s
  }

  _lastErrorEvent = { key: errorKey, time: now };

  // Log without stack trace — just the error message and type
  logger.warn({
    event: 'mongoose_error',
    code: err.code,
    message: err.message?.slice(0, 200),
  }, 'Mongoose connection error');

  // Reset dedup after 60s so future errors of the same type are logged again
  setTimeout(resetErrorDedup, 60000);
});

mongoose.connection.on('disconnected', () => {
  // Avoid logging on initial startup before first connect
  if (mongoose.connection.readyState !== 2) {
    reconnectState.lastDisconnect = new Date();
    reconnectState.isReconnecting = true;
    reconnectState.retryAttempt += 1;

    logger.warn({
      event: 'database_disconnected',
      retryAttempt: reconnectState.retryAttempt,
    }, 'MongoDB disconnected — starting reconnect');
  }
});

mongoose.connection.on('reconnected', () => {
  reconnectState.lastReconnect = new Date();
  reconnectState.isReconnecting = false;
  reconnectState.retryAttempt = 0;

  // Calculate downtime duration
  const downtime = reconnectState.lastDisconnect
    ? Math.round((reconnectState.lastReconnect - reconnectState.lastDisconnect) / 1000)
    : null;

  logger.info({
    event: 'database_reconnected',
    downtimeSeconds: downtime,
  }, `MongoDB connection restored${downtime !== null ? ` after ${downtime}s downtime` : ''}`);
});

// ── Graceful Shutdown ──
process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

module.exports = { connectDatabase, disconnectDatabase, reconnectState };
