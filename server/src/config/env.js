// server/src/config/env.js
// ✅ Zod-validated environment configuration
// All required env vars are validated at startup for fail-fast behavior

const { z } = require('zod');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load .env from project root (one level up from server/)
const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Try server/.env as fallback
  const localEnv = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
  }
}

// ── Schema Definition ──
const envSchema = z.object({
  // TMDB
  TMDB_API_KEY: z.string().min(1, 'TMDB_API_KEY is required'),
  TMDB_ACCESS_TOKEN: z.string().min(1, 'TMDB_ACCESS_TOKEN is required'),
  TMDB_IMAGE_BASE: z.string().url().default('https://image.tmdb.org/t/p/'),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // JWT Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Stream Security
  STREAM_SECRET: z.string().min(32, 'STREAM_SECRET must be at least 32 characters'),
  STREAM_TOKEN_EXPIRY_HOURS: z.coerce.number().positive().default(24),

  // Server
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // MongoDB Connection Pool
  MONGODB_MAX_POOL_SIZE: z.coerce.number().positive().default(10),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().min(0).default(2),

  // Thumbnail Storage Path (SC-017)
  THUMBNAILS_PATH: z.string().default(''), // Empty = use default path (server/thumbnails/)

  // CDN / Proxy Acceleration (ST-004)
  STREAM_CDN_MODE: z.coerce.boolean().default(false),
  STREAM_CDN_BASE_URL: z.string().default(''),

  // External Source Configuration (ST-009)
  EXTERNAL_SOURCE_BASE_URL: z.string().url().default('https://jolly-mouse-f41c.annierane.workers.dev'),
  EXTERNAL_SOURCE_USER_AGENT: z.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
  EXTERNAL_SOURCE_REFERER: z.string().url().default('https://watch.yupflix.org/'),
  EXTERNAL_SOURCE_TIMEOUT: z.coerce.number().positive().default(5000),

  // Rate Limiting (optional with defaults)
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(5),
  STREAM_RATE_LIMIT_MAX: z.coerce.number().default(30),
});

// ── Parse and Validate ──
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  const formatted = parsed.error.format();
  for (const [key, errors] of Object.entries(formatted)) {
    if (key === '_errors') continue;
    const msgs = Array.isArray(errors) ? errors : errors._errors;
    msgs.forEach(msg => console.error(`  → ${key}: ${msg}`));
  }
  console.error('\n⚠️  Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// ── Exported Config ──
const env = parsed.data;

module.exports = {
  // TMDB
  tmdb: {
    apiKey: env.TMDB_API_KEY,
    accessToken: env.TMDB_ACCESS_TOKEN,
    imageBase: env.TMDB_IMAGE_BASE,
  },

  // Database
  mongodb: {
    uri: env.MONGODB_URI,
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: env.MONGODB_MIN_POOL_SIZE,
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  // Stream
  stream: {
    secret: env.STREAM_SECRET,
    tokenExpiryHours: env.STREAM_TOKEN_EXPIRY_HOURS,
    cdnMode: env.STREAM_CDN_MODE,
    cdnBaseUrl: env.STREAM_CDN_BASE_URL,
  },

  // Thumbnails
  thumbnails: {
    path: env.THUMBNAILS_PATH,
  },

  // External Source
  externalSource: {
    baseUrl: env.EXTERNAL_SOURCE_BASE_URL,
    userAgent: env.EXTERNAL_SOURCE_USER_AGENT,
    referer: env.EXTERNAL_SOURCE_REFERER,
    timeout: env.EXTERNAL_SOURCE_TIMEOUT,
  },

  // Server
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    authMax: env.AUTH_RATE_LIMIT_MAX,
    streamMax: env.STREAM_RATE_LIMIT_MAX,
  },
};
