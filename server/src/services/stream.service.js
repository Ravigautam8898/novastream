// server/src/services/stream.service.js
// Streaming Service — HLS playlist/segment serving, token generation, content resolution
//
// Architecture:
//   - Content (Movie): HLS files stored at uploads/content/:contentId/:quality/
//   - Episode (Series): HLS files stored at uploads/episodes/:episodeId/:quality/
//   - Each quality directory contains: index.m3u8 (variant playlist) + .ts segments
//
// Token Security:
//   - Stream URLs are protected by signed JWT tokens
//   - Tokens contain: contentId, contentType, ip (optional), exp, uid, tkv
//   - Frontend requests a token via POST /api/stream/token (authenticated)
//   - Token is transported via httpOnly cookie (ST-001) + optional query param
//   - StreamAuth middleware validates before serving files
//
// Performance (ST-003):
//   - All filesystem operations are async via fs.promises (no blocking)
//   - Segment reads use async open/read/close for range requests
//
// Caching (ST-010):
//   - Stream paths cached 60s (per contentId+quality)
//   - Playlist content cached 30s (per file path)
//   - Master playlists cached 30s (per contentId)

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const jwt = require('jsonwebtoken');
const Content = require('../models/Content.model');
const Episode = require('../models/Episode.model');
const Season = require('../models/Season.model');
const User = require('../models/User.model');
const config = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

// ── Constants ──

const UPLOADS_BASE = path.resolve(__dirname, '..', '..', 'uploads');
const TOKEN_ALGORITHM = 'HS256';

const STREAM_MIME_TYPES = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
  '.srt': 'text/plain',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.ac3': 'audio/ac3',
  '.m4s': 'application/octet-stream',
  '.mpd': 'application/dash+xml',
};

// ── Token Generation ──

/**
 * Generate a signed stream token for a content item.
 * The token grants access to stream the specified content for a limited time.
 *
 * @param {Object} payload - Token payload
 * @param {string} payload.contentId - MongoDB ObjectId of the content/episode
 * @param {string} payload.contentType - 'movie', 'series', or 'episode'
 * @param {string} [payload.ip] - Optional client IP for IP-bound tokens
 * @returns {string} Signed JWT token
 */
function generateStreamToken({ contentId, contentType, ip, uid, tokenVersion } = {}) {
  if (!contentId || !contentType) {
    throw ApiError.badRequest('contentId and contentType are required for stream token');
  }

  const payload = {
    sub: contentId,
    type: contentType,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (config.stream.tokenExpiryHours * 3600),
  };

  // Optionally bind to client IP for extra security
  if (ip) {
    payload.ip = ip;
  }

  // Include user ID for token version lookup on revocation check
  if (uid) {
    payload.uid = uid;
  }

  // Include token version for revocation support (ST-006)
  if (tokenVersion !== undefined) {
    payload.tkv = tokenVersion;
  }

  return jwt.sign(payload, config.stream.secret, { algorithm: TOKEN_ALGORITHM });
}

/**
 * Validate a stream token and return its decoded payload.
 *
 * @param {string} token - JWT stream token
 * @param {Object} [options]
 * @param {string} [options.ip] - Client IP to verify against
 * @returns {Object} Decoded token payload
 * @throws {ApiError} If token is invalid or expired
 */
function validateStreamToken(token, { ip } = {}) {
  try {
    const decoded = jwt.verify(token, config.stream.secret, { algorithms: [TOKEN_ALGORITHM] });

    // Verify IP binding if present in token
    if (decoded.ip && ip && decoded.ip !== ip) {
      logger.warn({ tokenIp: decoded.ip, requestIp: ip }, 'Stream token IP mismatch');
      throw ApiError.forbidden('Stream token IP mismatch');
    }

    // Check expiry
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      throw ApiError.unauthorized('Stream token has expired');
    }

    return decoded;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Stream token has expired');
    }
    if (err.name === 'JsonWebTokenError') {
      throw ApiError.unauthorized('Invalid stream token');
    }
    throw ApiError.unauthorized('Stream token validation failed');
  }
}

// ── Content Resolution ──

/**
 * Resolve a content item by slug and type, returning the DB document
 * along with its resolved file system path for HLS files.
 *
 * @param {string} slug - Content slug
 * @returns {Promise<{content: Object, streamDir: string|null, streams: Array}>}
 */
async function resolveMovieContent(slug) {
  const content = await Content.findOne({ slug, contentType: 'movie', isActive: true }).lean();
  if (!content) {
    throw ApiError.notFound(`Movie '${slug}' not found`);
  }

  // Check for existing HLS streams in the content document
  const activeStreams = (content.streams || []).filter(s => s.isActive !== false);

  // Also check the filesystem convention path (async, ST-003)
  const fsPath = path.join(UPLOADS_BASE, 'content', content._id.toString());
  const hasFsStreams = await dirExists(fsPath) && (await readDirNamesSafe(fsPath)).length > 0;

  return {
    content,
    streamDir: hasFsStreams ? fsPath : null,
    streams: activeStreams.length > 0 ? activeStreams : null,
  };
}

/**
 * Resolve an episode by ID, returning the DB document along with its
 * resolved file system path for HLS files.
 *
 * @param {string} episodeId - MongoDB ObjectId of the episode
 * @returns {Promise<{episode: Object, streamDir: string|null, streams: Array}>}
 */
async function resolveEpisodeContent(episodeId) {
  const episode = await Episode.findById(episodeId)
    .populate('contentId', 'title slug contentType')
    .lean();

  if (!episode) {
    throw ApiError.notFound(`Episode '${episodeId}' not found`);
  }

  // Check for existing HLS streams from the episode document
  const activeStreams = (episode.streams || []).filter(s => s.isActive !== false);

  // Also check the filesystem convention path (async, ST-003)
  const fsPath = path.join(UPLOADS_BASE, 'episodes', episode._id.toString());
  const hasFsStreams = await dirExists(fsPath) && (await readDirNamesSafe(fsPath)).length > 0;

  return {
    episode,
    streamDir: hasFsStreams ? fsPath : null,
    streams: activeStreams.length > 0 ? activeStreams : null,
  };
}

// ── HLS File Serving ──

/**
 * Determine the best available stream directory and quality for a resolved content item.
 * Returns the path to the quality variant's directory containing the playlist and segments.
 *
 * Results are cached per contentId+quality pair with a 60s TTL (ST-010).
 *
 * Priority: filesystem > DB playlistUrl > DB filePath > fallback
 *
 * @param {Object} resolved - Result from resolveMovieContent or resolveEpisodeContent
 * @param {string} [requestedQuality] - Desired quality ('480p', '720p', '1080p', '4K')
 * @returns {Promise<{ dirPath: string|null, quality: string|null, playlistPath: string|null, isAvailable: boolean }>}
 */
async function resolveStreamPath(resolved, requestedQuality) {
  const { content, episode, streamDir, streams } = resolved;
  const id = (content?._id || episode?._id)?.toString();
  const cacheKey = id ? `streamPath:${id}:${requestedQuality || '*'}` : null;

  return withCache(cacheKey, PATH_CACHE_TTL_MS, async () => {
    // If filesystem has HLS files, use those
    if (streamDir) {
      if (requestedQuality) {
        const qualityDir = path.join(streamDir, requestedQuality);
        if (await dirExists(qualityDir)) {
          return {
            dirPath: qualityDir,
            quality: requestedQuality,
            playlistPath: path.join(qualityDir, 'index.m3u8'),
            isAvailable: true,
          };
        }
      }

      // No specific quality requested — look for a master playlist or any quality variant
      const masterPath = path.join(streamDir, 'master.m3u8');
      if (await dirExists(masterPath)) {
        return {
          dirPath: streamDir,
          quality: null,
          playlistPath: masterPath,
          isAvailable: true,
        };
      }

      // Try to find any quality directory
      const entries = await readDirSafe(streamDir);
      const dirs = entries.filter(d => d.isDirectory()).map(d => d.name);

      // Prioritize qualities
      const qualityOrder = ['1080p', '720p', '480p', '4K'];
      for (const q of qualityOrder) {
        if (dirs.includes(q)) {
          const qualityDir = path.join(streamDir, q);
          return {
            dirPath: qualityDir,
            quality: q,
            playlistPath: path.join(qualityDir, 'index.m3u8'),
            isAvailable: true,
          };
        }
      }

      // Fall back to the first directory found
      if (dirs.length > 0) {
        const qualityDir = path.join(streamDir, dirs[0]);
        return {
          dirPath: qualityDir,
          quality: dirs[0],
          playlistPath: path.join(qualityDir, 'index.m3u8'),
          isAvailable: true,
        };
      }
    }

    // If DB has stream records with playlistUrl or filePath
    if (streams && streams.length > 0) {
      // If a specific quality is requested, try to match it
      if (requestedQuality) {
        const matchedStream = streams.find(s => s.quality === requestedQuality);
        if (matchedStream) {
          const dbPath = matchedStream.filePath
            ? path.resolve(UPLOADS_BASE, matchedStream.filePath)
            : null;
          if (dbPath && await dirExists(dbPath)) {
            return {
              dirPath: dbPath,
              quality: requestedQuality,
              playlistPath: path.join(dbPath, 'index.m3u8'),
              isAvailable: true,
            };
          }
        }
      }

      // Return the first active stream's path
      const firstStream = streams[0];
      const dbPath = firstStream.filePath
        ? path.resolve(UPLOADS_BASE, firstStream.filePath)
        : null;
      if (dbPath && await dirExists(dbPath)) {
        return {
          dirPath: dbPath,
          quality: firstStream.quality,
          playlistPath: path.join(dbPath, 'index.m3u8'),
          isAvailable: true,
        };
      }
    }

    // No streams available
    return {
      dirPath: null,
      quality: null,
      playlistPath: null,
      isAvailable: false,
    };
  });
}

/**
 * Serve a master (multi-variant) or variant playlist file.
 * Scans the stream directory for available quality variants and generates
 * a master playlist on the fly if one doesn't exist.
 *
 * Playlist content is cached per path with a 30s TTL (ST-010).
 *
 * @param {Object} resolved - Result from resolveMovieContent or resolveEpisodeContent
 * @param {string} [quality] - Specific quality variant to serve
 * @returns {Promise<{ content: string|null, mimeType: string, statusCode: number }>}
 */
async function servePlaylist(resolved, quality) {
  const streamInfo = await resolveStreamPath(resolved, quality);

  if (!streamInfo.isAvailable || !streamInfo.playlistPath) {
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 404,
    };
  }

  const mimeType = STREAM_MIME_TYPES['.m3u8'] || 'application/vnd.apple.mpegurl';
  const playlistPath = streamInfo.playlistPath;

  // Cache playlist content with a short TTL (ST-010)
  try {
    const content = await withCache(`playlist:${playlistPath}`, PLAYLIST_CACHE_TTL_MS, async () => {
      return await fsp.readFile(playlistPath, 'utf8');
    });
    return { content, mimeType, statusCode: 200 };
  } catch (err) {
    logger.error({ err, path: playlistPath }, 'Failed to read playlist');
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 500,
    };
  }
}

/**
 * Generate a master playlist from available quality variants on the filesystem.
 *
 * Cached per contentId with a 30s TTL (ST-010).
 *
 * @param {Object} resolved - Resolved content
 * @returns {Promise<string|null>} Generated M3U8 master playlist content
 */
async function generateMasterPlaylist(resolved) {
  const { content, episode, streamDir } = resolved;
  const id = (content?._id || episode?._id)?.toString();
  const cacheKey = id ? `masterPlaylist:${id}` : null;

  return withCache(cacheKey, PLAYLIST_CACHE_TTL_MS, async () => {
    if (!streamDir) return null;

    // Scan for quality directories (async, ST-003)
    const entries = await readDirSafe(streamDir);
    const dirs = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const playlistPath = path.join(streamDir, entry.name, 'index.m3u8');
        if (await dirExists(playlistPath)) {
          dirs.push(entry.name);
        }
      }
    }

    if (dirs.length === 0) return null;

    // Sort by quality (highest first for better default)
    const qualityOrder = ['4K', '1080p', '720p', '480p'];
    const sortedDirs = dirs.sort((a, b) => qualityOrder.indexOf(a) - qualityOrder.indexOf(b));

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '',
    ];

    for (const q of sortedDirs) {
      const resolution = {
        '4K': '3840x2160',
        '1080p': '1920x1080',
        '720p': '1280x720',
        '480p': '854x480',
      }[q] || '1280x720';

      const bandwidth = {
        '4K': 16000000,
        '1080p': 6000000,
        '720p': 3000000,
        '480p': 1500000,
      }[q] || 3000000;

      lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}`);
      lines.push(`${q}/index.m3u8`);
      lines.push('');
    }

    return lines.join('\n');
  });
}

/**
 * Serve a specific .ts segment file.
 *
 * All filesystem operations use async fs.promises (ST-003).
 * Range requests use async open/read/close instead of sync equivalents.
 *
 * @param {Object} resolved - Resolved content
 * @param {string} quality - Quality variant
 * @param {string} segment - Segment filename
 * @param {Object} [range] - Optional HTTP range for seeking
 * @returns {Promise<{ content: Buffer|null, mimeType: string, statusCode: number, headers: Object }>}
 */
async function serveSegment(resolved, quality, segment, range) {
  // Sanitize segment filename (prevent path traversal)
  const sanitized = path.basename(segment);
  if (sanitized !== segment) {
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 400,
      headers: {},
    };
  }

  // Filename whitelist: only allow known HLS/DASH segment and playlist patterns
  // This provides defense-in-depth beyond the path traversal check.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(ts|m3u8|mp4|vtt|srt|aac|mp3|ac3|m4s|mpd)$/.test(sanitized)) {
    logger.warn({ sanitized, segment }, 'Segment filename rejected by whitelist');
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 400,
      headers: {},
    };
  }

  const streamInfo = await resolveStreamPath(resolved, quality);

  if (!streamInfo.isAvailable || !streamInfo.dirPath) {
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 404,
      headers: {},
    };
  }

  const segmentPath = path.join(streamInfo.dirPath, sanitized);

  // Security: ensure the resolved path is within the stream directory
  const resolvedPath = path.resolve(segmentPath);
  const resolvedBase = path.resolve(streamInfo.dirPath);
  if (!resolvedPath.startsWith(resolvedBase)) {
    logger.warn({ segmentPath, resolvedBase }, 'Path traversal detected in segment request');
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 403,
      headers: {},
    };
  }

  if (!(await dirExists(resolvedPath))) {
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 404,
      headers: {},
    };
  }

  const ext = path.extname(sanitized).toLowerCase();
  const mimeType = STREAM_MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const stat = await fsp.stat(resolvedPath);

    // Handle range requests for seeking (async, ST-003)
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      const file = await fsp.open(resolvedPath, 'r');
      try {
        const buffer = Buffer.alloc(chunkSize);
        await file.read(buffer, 0, chunkSize, start);
        return {
          content: buffer,
          mimeType,
          statusCode: 206,
          filePath: resolvedPath,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': chunkSize,
            'Accept-Ranges': 'bytes',
          },
        };
      } finally {
        await file.close();
      }
    }

    // Full file (async, ST-003)
    const content = await fsp.readFile(resolvedPath);
    return {
      content,
      mimeType,
      statusCode: 200,
      filePath: resolvedPath,
      headers: {
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
      },
    };
  } catch (err) {
    logger.error({ err, path: resolvedPath }, 'Failed to read segment');
    return {
      content: null,
      mimeType: 'text/plain',
      statusCode: 500,
      headers: {},
    };
  }
}

/**
 * Get the stream info metadata for the frontend (qualities available, etc.)
 *
 * Cached per contentId with a 60s TTL (ST-010).
 *
 * @param {Object} resolved - Resolved content
 * @returns {Promise<Object>} Stream info for frontend
 */
async function getStreamInfo(resolved) {
  const { content, episode, streamDir, streams } = resolved;
  const item = content || episode;
  const id = item._id.toString();
  const cacheKey = `streamInfo:${id}`;

  return withCache(cacheKey, PATH_CACHE_TTL_MS, async () => {
    // Qualities from filesystem (async, ST-003)
    const fsQualities = [];
    if (streamDir) {
      const entries = await readDirSafe(streamDir);
      const dirs = entries.filter(d => d.isDirectory()).map(d => d.name);

      // Filter to known quality names
      const knownQualities = ['480p', '720p', '1080p', '4K'];
      for (const q of knownQualities) {
        if (dirs.includes(q)) {
          const qDir = path.join(streamDir, q);
          const qFiles = await readDirNamesSafe(qDir);
          fsQualities.push({
            quality: q,
            segmentCount: qFiles.filter(f => f.endsWith('.ts')).length,
            hasPlaylist: qFiles.includes('index.m3u8'),
          });
        }
      }
    }

    // Qualities from DB
    const dbQualities = (streams || [])
      .filter(s => s.isActive !== false)
      .map(s => ({
        quality: s.quality,
        bitrate: s.bitrate,
        resolution: s.resolution,
        fileSize: s.fileSize,
      }));

    return {
      id,
      hasStreams: fsQualities.length > 0 || dbQualities.length > 0,
      qualities: fsQualities.length > 0 ? fsQualities : dbQualities,
      source: fsQualities.length > 0 ? 'filesystem' : (dbQualities.length > 0 ? 'database' : 'none'),
    };
  });
}

// ── Master Playlist for Episodes ──

/**
 * Generate a combined multi-quality master playlist for an episode.
 * Scans the episode's stream directory for quality variants.
 *
 * @param {Object} resolved - Result from resolveEpisodeContent
 * @returns {Promise<string|null>} M3U8 master playlist content
 */
async function generateEpisodeMasterPlaylist(resolved) {
  const { streamDir, streams } = resolved;

  // First try filesystem
  if (streamDir) {
    const masterContent = await generateMasterPlaylist(resolved);
    if (masterContent) return masterContent;
  }

  // Fall back to DB stream records
  if (streams && streams.length > 0) {
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '',
    ];

    for (const stream of streams.sort((a, b) => {
      const order = ['4K', '1080p', '720p', '480p'];
      return order.indexOf(a.quality) - order.indexOf(b.quality);
    })) {
      if (stream.isActive === false) continue;

      const resolution = stream.resolution || {
        '4K': '3840x2160',
        '1080p': '1920x1080',
        '720p': '1280x720',
        '480p': '854x480',
      }[stream.quality] || '1280x720';

      const bandwidth = stream.bitrate || {
        '4K': 16000000,
        '1080p': 6000000,
        '720p': 3000000,
        '480p': 1500000,
      }[stream.quality] || 3000000;

      lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}`);
      lines.push(`${stream.quality}/index.m3u8`);
      lines.push('');
    }

    return lines.join('\n');
  }

  return null;
}

// ── In-Memory Caches (ST-006 + ST-010 + SC-013) ──
// contentCache is now a MemoryCache instance with LRU eviction.
// tokenVersionCache removed in SC-003 — uses direct DB lookup.

const MemoryCache = require('../utils/cache');
const contentCache = new MemoryCache(30000, 500); // 30s default TTL, max 500 entries

const PATH_CACHE_TTL_MS = 60 * 1000;
const PLAYLIST_CACHE_TTL_MS = 30 * 1000;

/**
 * Generic async cache helper used for stream paths, playlists, and info.
 * Returns cached value if still valid, otherwise computes and stores.
 * Uses MemoryCache with LRU eviction + TTL (SC-013).
 *
 * @param {string} cacheKey - Cache key (null/undefined = bypass cache)
 * @param {number} ttlMs - Time-to-live in milliseconds
 * @param {Function} fn - Async function returning the value to cache
 * @returns {Promise<any>}
 */
async function withCache(cacheKey, ttlMs, fn) {
  if (!cacheKey) return fn();

  const cached = contentCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const value = await fn();
  contentCache.set(cacheKey, value, ttlMs || 30000);
  return value;
}

/**
 * Clear all cached stream data. Called when content changes to prevent stale data.
 */
function clearContentCache() {
  contentCache.clear();
}

// ── Async Filesystem Helpers (ST-003) ──

/**
 * Async directory exists check via fsp.access.
 */
async function dirExists(dir) {
  try {
    await fsp.access(dir, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Async readdir that returns [] on error instead of throwing.
 */
async function readDirSafe(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Async readdir of just file/directory names, returning [] on error.
 */
async function readDirNamesSafe(dir) {
  try {
    return await fsp.readdir(dir);
  } catch {
    return [];
  }
}

// ── Token Version Validation (ST-006 + SC-003) ──
// SC-003: Removed tokenVersionCache in-memory Map.
// Now uses direct indexed DB lookup for every check, closing the 60s
// stale revocation window. User.findById is a covered query on _id (<1ms).

/**
 * Check if a stream token's version is still valid.
 * Uses direct MongoDB indexed lookup (SC-003) — closes the 60s stale
 * revocation window that existed with the in-memory cache.
 *
 * @param {string} userId - User ID from the token's uid claim
 * @param {number} tokenVersion - Token's tkv claim value
 * @returns {Promise<boolean>} True if token version is valid
 */
async function checkTokenVersion(userId, tokenVersion) {
  if (tokenVersion === undefined || tokenVersion === null) {
    return true; // No version in token = old token format, allow
  }

  try {
    // Direct indexed lookup — User.findById uses _id index (<1ms)
    const user = await User.findById(userId)
      .select('streamTokenVersion')
      .lean()
      .maxTimeMS(2000);

    if (!user) {
      logger.warn({ userId }, 'User not found for token version check');
      return false;
    }

    if (tokenVersion < (user.streamTokenVersion || 0)) {
      logger.warn({ userId, tokenVersion, expectedVersion: user.streamTokenVersion }, 'Stream token version mismatch — token revoked');
      return false;
    }

    return true;
  } catch (err) {
    logger.error({ err, userId }, 'Token version check failed — allowing request');
    return true; // Degrade gracefully on error
  }
}

/**
 * Invalidate all existing stream tokens for a user by incrementing
 * their streamTokenVersion. Future stream requests with older versions
 * will be rejected by checkTokenVersion.
 *
 * SC-003: Removed in-memory cache update — checkTokenVersion now reads
 * directly from DB, so the new version is immediately visible to all workers.
 *
 * @param {string} userId - MongoDB _id of the user
 * @returns {number|null} New token version, or null if user not found
 */
async function incrementStreamTokenVersion(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { streamTokenVersion: 1 } },
    { new: true, select: 'streamTokenVersion' }
  );

  if (!user) {
    logger.warn({ userId }, 'Failed to increment stream token version — user not found');
    return null;
  }

  logger.info({ userId, newVersion: user.streamTokenVersion }, 'Stream token version incremented');
  return user.streamTokenVersion;
}

module.exports = {
  generateStreamToken,
  validateStreamToken,
  incrementStreamTokenVersion,
  resolveMovieContent,
  resolveEpisodeContent,
  resolveStreamPath,
  servePlaylist,
  serveSegment,
  getStreamInfo,
  generateMasterPlaylist,
  generateEpisodeMasterPlaylist,
  clearContentCache,
  UPLOADS_BASE,
  STREAM_MIME_TYPES,
};
