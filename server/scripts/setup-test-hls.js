// server/scripts/setup-test-hls.js
// NovaStream — HLS Test Content Setup
//
// Usage:
//   node server/scripts/setup-test-hls.js [options]
//
// Options:
//   --movie <slug>       Set up HLS for a specific movie by slug
//   --episode <id>       Set up HLS for a specific episode by ID
//   --all                Set up HLS for all content in the database
//   --source <path>      Path to a source video file (.mp4)
//   --download           Download a sample video if no source provided
//
// Examples:
//   node server/scripts/setup-test-hls.js --all
//   node server/scripts/setup-test-hls.js --movie welcome-to-the-jungle-8bzt
//   node server/scripts/setup-test-hls.js --movie welcome-to-the-jungle-8bzt --source ./demo.mp4
//
// If FFmpeg is installed, this script will transcode the source video to HLS
// with multiple quality variants (480p, 720p, 1080p).
// If FFmpeg is not installed, it creates placeholder playlists for testing
// the streaming infrastructure.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// ── Configuration ──

const UPLOADS_BASE = path.resolve(__dirname, '..', 'uploads');

// Sample video URL (Big Buck Bunny — ~30s, 1080p, public domain)
const SAMPLE_VIDEO_URL = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4';

// ── Helpers ──

function log(message, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function hasFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ── FFmpeg HLS transcoding ──

function generateHLSWithFFmpeg(sourceFile, outputDir, title) {
  const qualities = [
    { name: '480p', width: 854, height: 480, bitrate: '800k', maxrate: '1000k', bufsize: '2000k' },
    { name: '720p', width: 1280, height: 720, bitrate: '1500k', maxrate: '2000k', bufsize: '4000k' },
    { name: '1080p', width: 1920, height: 1080, bitrate: '3000k', maxrate: '4000k', bufsize: '8000k' },
  ];

  const variantStreams = [];

  for (const q of qualities) {
    const qDir = path.join(outputDir, q.name);
    fs.mkdirSync(qDir, { recursive: true });

    const playlistFile = path.join(qDir, 'index.m3u8');
    const segmentPattern = path.join(qDir, 'segment-%03d.ts');

    log(`  Transcoding ${q.name} (${q.width}x${q.height})...`);

    const cmd = [
      'ffmpeg -y',
      `-i "${sourceFile}"`,
      `-vf "scale=${q.width}:${q.height}:force_original_aspect_ratio=decrease,pad=${q.width}:${q.height}:(ow-iw)/2:(oh-ih)/2"`,
      `-c:v libx264 -preset medium -b:v ${q.bitrate} -maxrate ${q.maxrate} -bufsize ${q.bufsize}`,
      `-c:a aac -b:a 128k -ar 44100`,
      `-hls_time 6 -hls_list_size 0`,
      `-hls_segment_filename "${segmentPattern}"`,
      `-hls_playlist_type vod`,
      `-progress - -nostats`,
      `"${playlistFile}"`,
    ].join(' ');

    try {
      execSync(cmd, { stdio: 'pipe', timeout: 300000 }); // 5 min timeout per quality
      variantStreams.push({
        quality: q.name,
        playlistPath: path.join(q.name, 'index.m3u8'),
        filePath: qDir,
        bitrate: parseInt(q.bitrate) * 1000,
        resolution: `${q.width}x${q.height}`,
      });
      log(`  ${q.name} transcoded successfully`, 'success');
    } catch (err) {
      log(`  ${q.name} transcoding failed: ${err.message}`, 'error');
    }
  }

  // Generate a master playlist
  if (variantStreams.length > 0) {
    const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3', ''];
    for (const vs of variantStreams) {
      const bandwidth = vs.bitrate || 3000000;
      const resolution = vs.resolution || '1280x720';
      masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}`);
      masterLines.push(vs.playlistPath);
      masterLines.push('');
    }
    fs.writeFileSync(path.join(outputDir, 'master.m3u8'), masterLines.join('\n'));
    log('Master playlist created', 'success');
  }

  return variantStreams;
}

// ── Placeholder HLS creation (when FFmpeg is not available) ──

function generatePlaceholderHLS(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const qualities = ['480p', '720p', '1080p'];

  for (const q of qualities) {
    const qDir = path.join(outputDir, q);
    fs.mkdirSync(qDir, { recursive: true });

    // Create a minimal variant playlist
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:10',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXTINF:10.000,',
      `segment-0.ts`,
      '#EXTINF:10.000,',
      `segment-1.ts`,
      '#EXTINF:10.000,',
      `segment-2.ts`,
      '#EXTINF:10.000,',
      `segment-3.ts`,
      '#EXTINF:10.000,',
      `segment-4.ts`,
      '#EXT-X-ENDLIST',
    ].join('\n');

    fs.writeFileSync(path.join(qDir, 'index.m3u8'), playlist);

    // Create dummy .ts segments (1KB each)
    for (let i = 0; i < 5; i++) {
      const segPath = path.join(qDir, `segment-${i}.ts`);
      if (!fs.existsSync(segPath)) {
        // Create a minimal valid TS packet (188 bytes is the minimum)
        const tsPacket = Buffer.alloc(188, 0x47); // Sync byte 0x47
        tsPacket[1] = 0x40; // Transport error indicator
        tsPacket.writeUInt16BE(i, 2); // Sequence number
        fs.writeFileSync(segPath, tsPacket);
      }
    }
  }

  // Create master playlist
  const master = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480',
    '480p/index.m3u8',
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720',
    '720p/index.m3u8',
    '',
    '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080',
    '1080p/index.m3u8',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, 'master.m3u8'), master);
  log('Placeholder HLS structure created (480p, 720p, 1080p)', 'success');
  log('NOTE: Placeholder .ts files are not valid MPEG-TS —', 'warn');
  log('  Run with --source <file.mp4> and install FFmpeg for real video.', 'warn');
}

// ── Database Integration ──

async function updateContentWithStream(contentId, qualityMetadata, type) {
  const mongoose = require('mongoose');
  const config = require('../src/config/env');

  await mongoose.connect(config.mongodb.uri);

  if (type === 'movie') {
    const Content = require('../src/models/Content.model');
    const content = await Content.findById(contentId);
    if (!content) {
      log(`Content ${contentId} not found`, 'error');
      await mongoose.disconnect();
      return;
    }

    content.streams = qualityMetadata.map(qm => ({
      quality: qm.quality,
      filePath: qm.filePath || path.join('content', contentId.toString(), qm.quality),
      playlistUrl: qm.playlistPath || `${qm.quality}/index.m3u8`,
      bitrate: qm.bitrate || 3000000,
      resolution: qm.resolution || '1280x720',
      isActive: true,
    }));

    await content.save();
    log(`Content "${content.title}" updated with stream metadata`, 'success');
  }

  await mongoose.disconnect();
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const movieSlug = args.find(a => a.startsWith('--movie='))?.split('=')[1];
  const episodeId = args.find(a => a.startsWith('--episode='))?.split('=')[1];
  const sourceFile = args.find(a => a.startsWith('--source='))?.split('=')[1];
  const doAll = args.includes('--all');

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     NovaStream — HLS Setup Utility       ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  if (!movieSlug && !episodeId && !doAll) {
    log('No target specified. Use --movie <slug>, --episode <id>, or --all', 'error');
    console.log('');
    console.log('Examples:');
    console.log('  node server/scripts/setup-test-hls.js --movie welcome-to-the-jungle-8bzt');
    console.log('  node server/scripts/setup-test-hls.js --all');
    console.log('  node server/scripts/setup-test-hls.js --all --source ./video.mp4');
    process.exit(1);
  }

  // Check for FFmpeg
  const ffmpeg = hasFFmpeg();
  if (!ffmpeg && !sourceFile) {
    log('FFmpeg not found — will create placeholder HLS structure', 'warn');
    log('Install FFmpeg (https://ffmpeg.org) for real video transcoding', 'info');
  } else if (ffmpeg && sourceFile) {
    log('FFmpeg found — will transcode source video to HLS', 'success');
  } else if (sourceFile && !ffmpeg) {
    log('Source file provided but FFmpeg is not installed', 'error');
    log('Install FFmpeg to transcode video: https://ffmpeg.org', 'info');
    process.exit(1);
  }

  // Connect to database and find content
  log('Connecting to database...');
  const mongoose = require('mongoose');
  const config = require('../src/config/env');

  try {
    await mongoose.connect(config.mongodb.uri);
    log('Database connected', 'success');
  } catch (err) {
    log(`Database connection failed: ${err.message}`, 'error');
    process.exit(1);
  }

  const Content = require('../src/models/Content.model');

  // Find content items
  let contentItems = [];
  if (doAll) {
    contentItems = await Content.find({ contentType: 'movie', isActive: true }).lean();
    log(`Found ${contentItems.length} active movies`, 'info');
  } else if (movieSlug) {
    const content = await Content.findOne({ slug: movieSlug, contentType: 'movie' }).lean();
    if (!content) {
      log(`Movie '${movieSlug}' not found in database`, 'error');
      await mongoose.disconnect();
      process.exit(1);
    }
    contentItems = [content];
  }

  if (contentItems.length === 0) {
    log('No movies to process', 'warn');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Process each content item
  for (const content of contentItems) {
    console.log('');
    log(`Processing: ${content.title} (${content.slug})`);

    const contentDir = path.join(UPLOADS_BASE, 'content', content._id.toString());

    if (ffmpeg && sourceFile) {
      // Real transcoding
      log('Transcoding to HLS with FFmpeg...');
      const variantStreams = generateHLSWithFFmpeg(sourceFile, contentDir, content.title);

      if (variantStreams.length > 0) {
        // Update database with stream metadata
        await Content.findByIdAndUpdate(content._id, {
          streams: variantStreams.map(vs => ({
            quality: vs.quality,
            filePath: path.join('content', content._id.toString(), vs.quality),
            playlistUrl: vs.playlistPath,
            bitrate: vs.bitrate,
            resolution: vs.resolution,
            isActive: true,
          })),
        });
        log(`Database updated with stream metadata for "${content.title}"`, 'success');
      }
    } else {
      // Placeholder HLS
      generatePlaceholderHLS(contentDir);

      // Update database with placeholder stream metadata
      await Content.findByIdAndUpdate(content._id, {
        streams: [
          { quality: '480p', filePath: path.join('content', content._id.toString(), '480p'), playlistUrl: '480p/index.m3u8', bitrate: 1500000, resolution: '854x480', isActive: true },
          { quality: '720p', filePath: path.join('content', content._id.toString(), '720p'), playlistUrl: '720p/index.m3u8', bitrate: 3000000, resolution: '1280x720', isActive: true },
          { quality: '1080p', filePath: path.join('content', content._id.toString(), '1080p'), playlistUrl: '1080p/index.m3u8', bitrate: 6000000, resolution: '1920x1080', isActive: true },
        ],
      });
      log(`Database updated with placeholder stream metadata`, 'success');
    }
  }

  console.log('');
  log('HLS setup complete!', 'success');
  log(`Streams are available at: /api/stream/movie/:slug/index.m3u8`, 'info');
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
