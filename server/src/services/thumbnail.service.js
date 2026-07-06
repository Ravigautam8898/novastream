// server/src/services/thumbnail.service.js
// Thumbnail Service — seek preview sprite generation
//
// Generates sprite sheets for ArtPlayer's seek preview thumbnails.
// Two modes:
//   1. FFmpeg: Extracts frames from video files at regular intervals (async, ST-005)
//   2. Placeholder: Generates a visual placeholder sprite using node-canvas
//      (used when FFmpeg is unavailable or no video files exist)
//
// Performance (ST-005):
//   - All FFmpeg/ffprobe calls use async child_process (no execSync blocking)
//   - FFmpeg availability is cached after first check (avoids repeated execSync)

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const logger = require('../config/logger');

// ── Canvas Module Check ──
// node-canvas is an optional dependency (needed for placeholder sprites when FFmpeg is unavailable).
let canvasCreateCanvas = null;
try {
  canvasCreateCanvas = require('canvas').createCanvas;
} catch {
  logger.warn('canvas module not available — placeholder sprite generation disabled');
}

// ── Constants ──

// SC-017: Configurable thumbnail storage path via THUMBNAILS_PATH env var
// Allows pointing to a shared NFS mount or Docker volume for multi-instance deployments
const config = require('../config/env');
const THUMBNAILS_BASE = config.thumbnails.path
  ? path.resolve(config.thumbnails.path)
  : path.resolve(__dirname, '..', '..', 'thumbnails');
const UPLOADS_BASE = path.resolve(__dirname, '..', '..', 'uploads');

const SPRITE_CONFIG = {
  cols: 5,             // Thumbnails per row
  total: 25,           // Total thumbnails in sprite
  thumbWidth: 160,     // Width of each thumbnail
  thumbHeight: 90,     // Height of each thumbnail
};

// ── Cached FFmpeg Availability Check (ST-005) ──
// Checked once at startup, never rechecks during the process lifetime.
// This avoids calling execSync('ffmpeg -version') on every thumbnail request.
let ffmpegAvailable = null;

/**
 * Check whether FFmpeg is available on the system.
 * Result is cached after the first call (ST-005).
 *
 * @returns {Promise<boolean>}
 */
async function hasFFmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;

  try {
    await execAsync('ffmpeg -version', { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }

  if (ffmpegAvailable) {
    logger.info('FFmpeg detected — sprite generation enabled');
  } else {
    logger.warn('FFmpeg not found — falling back to placeholder sprites');
  }

  return ffmpegAvailable;
}

function getContentDir(contentType, slug) {
  return null; // Will be resolved dynamically
}

/**
 * Resolve the content directory path for thumbnail generation.
 * For movies: uploads/content/:contentId/
 * For episodes: uploads/episodes/:episodeId/
 *
 * @param {string} contentType - 'movie' or 'episode'
 * @param {string} id - MongoDB _id
 * @returns {Promise<string|null>} Resolved filesystem path
 */
async function resolveContentDirectory(contentType, id) {
  const subdir = contentType === 'episode' ? 'episodes' : 'content';
  const dir = path.join(UPLOADS_BASE, subdir, id);
  try {
    await fsp.access(dir, fs.constants.F_OK);
    return dir;
  } catch {
    return null;
  }
}

/**
 * Find video files in a content directory (supporting HLS and raw sources).
 * Checks for .mp4 files first, then .ts segments as fallback.
 */
async function findSourceVideo(contentDir) {
  if (!contentDir) return null;

  try {
    await fsp.access(contentDir, fs.constants.F_OK);
  } catch {
    return null;
  }

  // Check for source MP4 files (async, ST-003)
  const files = await fsp.readdir(contentDir, { withFileTypes: true });
  const mp4Files = files.filter(f => f.isFile() && f.name.endsWith('.mp4'));
  if (mp4Files.length > 0) {
    return path.join(contentDir, mp4Files[0].name);
  }

  // Check quality subdirectories for .ts segments (use first segment as source)
  const qualityDirs = files.filter(f => f.isDirectory());
  for (const qDir of qualityDirs) {
    const qPath = path.join(contentDir, qDir.name);
    try {
      const tsFiles = await fsp.readdir(qPath);
      const tsSegments = tsFiles.filter(f => f.endsWith('.ts'));
      if (tsSegments.length > 0) {
        return path.join(qPath, tsSegments[0]);
      }
    } catch {
      continue; // Skip directories that can't be read
    }
  }

  return null;
}

// ── FFmpeg Sprite Generation (Async, ST-005) ──

/**
 * Generate a thumbnail sprite sheet from a video file using FFmpeg.
 * Extracts `total` frames at regular intervals and tiles them into a grid.
 *
 * Uses async exec() instead of execSync to avoid blocking the event loop (ST-005).
 *
 * @param {string} videoPath - Path to source video file
 * @param {string} outputPath - Path for the output sprite image
 * @param {Object} [config] - Sprite configuration overrides
 * @returns {Promise<boolean>} Whether generation succeeded
 */
async function generateSpriteWithFFmpeg(videoPath, outputPath, config = {}) {
  const { cols, total, thumbWidth, thumbHeight } = { ...SPRITE_CONFIG, ...config };

  try {
    // Ensure output directory exists (async)
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });

    // Calculate grid dimensions
    const rows = Math.ceil(total / cols);
    const spriteWidth = cols * thumbWidth;
    const spriteHeight = rows * thumbHeight;

    // Get video duration for frame interval calculation
    const interval = await getIntervalFromDuration(videoPath, total);

    // FFmpeg command: extract frames at regular intervals and tile into sprite
    const cmd = [
      'ffmpeg -y',
      `-i "${videoPath}"`,
      `-vf "fps=1/${interval},scale=${thumbWidth}:${thumbHeight}:force_original_aspect_ratio=decrease,pad=${thumbWidth}:${thumbHeight}:(ow-iw)/2:(oh-ih)/2,tile=${cols}x${rows}"`,
      '-q:v 3',            // High quality JPEG
      '-frames 1',          // Single output image (the tiled sprite)
      `"${outputPath}"`,
    ].join(' ');

    await execAsync(cmd, { timeout: 120000 }); // Async, 2 min timeout
    logger.info({ outputPath, spriteWidth, spriteHeight }, 'Thumbnail sprite generated with FFmpeg');
    return true;
  } catch (err) {
    logger.warn({ err, videoPath }, 'FFmpeg thumbnail generation failed');
    return false;
  }
}

/**
 * Calculate frame interval based on video duration and desired frame count.
 * Ensures frames are evenly distributed across the video.
 *
 * Uses async exec() instead of execSync (ST-005).
 *
 * @param {string} videoPath - Path to source video
 * @param {number} totalFrames - Desired number of frames
 * @returns {Promise<number>} Interval in seconds between frames
 */
async function getIntervalFromDuration(videoPath, totalFrames) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { timeout: 10000 }
    );
    const duration = parseFloat(stdout.trim());
    if (duration && duration > 0) {
      // Ensure at least 1s interval, space frames across duration
      const interval = Math.max(1, Math.floor(duration / totalFrames));
      return interval;
    }
  } catch {
    // Fall through to default
  }
  return 10; // Default 10s interval
}

// ── Placeholder Sprite Generation (node-canvas) ──

/**
 * Generate a visual placeholder sprite sheet when FFmpeg is unavailable.
 * Creates a grid of colored blocks with frame numbers for visual preview.
 *
 * @param {string} outputPath - Path for the output sprite image
 * @param {Object} [config] - Sprite configuration overrides
 * @returns {Promise<boolean>} Whether generation succeeded
 */
async function generatePlaceholderSprite(outputPath, config = {}) {
  const { cols, total, thumbWidth, thumbHeight } = { ...SPRITE_CONFIG, ...config };

  try {
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });

    if (!canvasCreateCanvas) {
      logger.warn('Cannot generate placeholder sprite — canvas module not installed');
      return false;
    }
    const createCanvas = canvasCreateCanvas;
    const rows = Math.ceil(total / cols);
    const spriteWidth = cols * thumbWidth;
    const spriteHeight = rows * thumbHeight;

    const canvas = createCanvas(spriteWidth, spriteHeight);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, spriteWidth, spriteHeight);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;

    // Draw each thumbnail frame
    const colors = [
      '#e50914', '#e87c03', '#46d369', '#0080ff', '#9b59b6',
      '#e67e22', '#1abc9c', '#3498db', '#e74c3c', '#2ecc71',
      '#f39c12', '#2980b9', '#c0392b', '#27ae60', '#8e44ad',
      '#d35400', '#16a085', '#2c3e50', '#f1c40f', '#7f8c8d',
    ];

    for (let i = 0; i < total; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * thumbWidth;
      const y = row * thumbHeight;

      // Frame background with gradient
      const gradient = ctx.createLinearGradient(x, y, x + thumbWidth, y + thumbHeight);
      const color = colors[i % colors.length];
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, darkenColor(color, 0.3));
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 1, y + 1, thumbWidth - 2, thumbHeight - 2);

      // Frame border
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeRect(x, y, thumbWidth, thumbHeight);

      // Play icon in center
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const cx = x + thumbWidth / 2;
      const cy = y + thumbHeight / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 10);
      ctx.lineTo(cx - 8, cy + 10);
      ctx.lineTo(cx + 10, cy);
      ctx.closePath();
      ctx.fill();

      // Frame number
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${(i + 1) * 4}%`, x + thumbWidth / 2, y + thumbHeight - 6);
    }

    // Save sprite (async, ST-003)
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
    await fsp.writeFile(outputPath, buffer);
    logger.info({ outputPath, spriteWidth, spriteHeight }, 'Placeholder thumbnail sprite generated');
    return true;
  } catch (err) {
    logger.error({ err }, 'Failed to generate placeholder sprite');
    return false;
  }
}

function darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r * (1 - factor))},${Math.floor(g * (1 - factor))},${Math.floor(b * (1 - factor))})`;
}

// ── Main API ──

/**
 * Get or generate a thumbnail sprite for a piece of content.
 *
 * @param {string} contentType - 'movie' or 'episode'
 * @param {string} contentId - MongoDB _id of the content/episode
 * @param {Object} [config] - Sprite config overrides
 * @returns {Promise<{ path: string|null, exists: boolean, width: number, height: number, cols: number, total: number }>}
 */
async function getOrGenerateSprite(contentType, contentId, config = {}) {
  const spriteDir = path.join(THUMBNAILS_BASE, contentType, contentId);
  const spritePath = path.join(spriteDir, 'sprite.jpg');

  const spriteConfig = { ...SPRITE_CONFIG, ...config };

  // Return cached sprite if it exists (async, ST-003)
  try {
    await fsp.access(spritePath, fs.constants.F_OK);
    return {
      path: spritePath,
      exists: true,
      width: spriteConfig.cols * spriteConfig.thumbWidth,
      height: Math.ceil(spriteConfig.total / spriteConfig.cols) * spriteConfig.thumbHeight,
      cols: spriteConfig.cols,
      total: spriteConfig.total,
    };
  } catch {
    // Sprite doesn't exist yet — generate it
  }

  // Try to generate using FFmpeg
  const contentDir = await resolveContentDirectory(contentType, contentId);
  const sourceVideo = contentDir ? await findSourceVideo(contentDir) : null;

  if (sourceVideo && await hasFFmpeg()) {
    const success = await generateSpriteWithFFmpeg(sourceVideo, spritePath, spriteConfig);
    if (success) {
      return {
        path: spritePath,
        exists: true,
        width: spriteConfig.cols * spriteConfig.thumbWidth,
        height: Math.ceil(spriteConfig.total / spriteConfig.cols) * spriteConfig.thumbHeight,
        cols: spriteConfig.cols,
        total: spriteConfig.total,
      };
    }
  }

  // Fall back to placeholder sprite
  const placeholderSuccess = await generatePlaceholderSprite(spritePath, spriteConfig);
  if (placeholderSuccess) {
    return {
      path: spritePath,
      exists: true,
      width: spriteConfig.cols * spriteConfig.thumbWidth,
      height: Math.ceil(spriteConfig.total / spriteConfig.cols) * spriteConfig.thumbHeight,
      cols: spriteConfig.cols,
      total: spriteConfig.total,
    };
  }

  return {
    path: null,
    exists: false,
    width: 0,
    height: 0,
    cols: spriteConfig.cols,
    total: spriteConfig.total,
  };
}

module.exports = {
  getOrGenerateSprite,
  generatePlaceholderSprite,
  SPRITE_CONFIG,
  THUMBNAILS_BASE,
};
