// server/src/config/database.js
// MongoDB connection with Mongoose

const mongoose = require('mongoose');
const config = require('./env');
const logger = require('./logger');

// ── Connection Options ──
const options = {
  maxPoolSize: config.mongodb.maxPoolSize,
  minPoolSize: config.mongodb.minPoolSize,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true,
};

// ── Connect Function (PPR-004: with retry logic) ──
//
// Retry strategy:
//   - 5 total attempts (initial + 4 retries)
//   - 5-second delay between retries
//   - All errors are logged on each attempt
//   - Only the final error is thrown after all retries are exhausted
//   - Already-connected check is fast-path (no retry needed)
//
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    logger.info('MongoDB already connected');
    return mongoose.connection;
  }

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(config.mongodb.uri, options);
      logger.info({ attempt }, 'MongoDB connected successfully');
      return mongoose.connection;
    } catch (error) {
      lastError = error;

      if (attempt === MAX_RETRIES) {
        logger.error({ err: error, attempt }, 'MongoDB connection failed — all retries exhausted');
        break;
      }

      logger.warn({
        err: { message: error.message, code: error.code },
        attempt,
        nextRetryMs: RETRY_DELAY_MS,
      }, 'MongoDB connection attempt failed — retrying');

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
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

// ── Event Handlers ──
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connection established');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'Mongoose connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected');
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

module.exports = { connectDatabase, disconnectDatabase };
