# NovaStream — Backend Services & Streaming

> **Part of:** [NovaStream Server Plan](./README.md)
> **Last Updated:** July 4, 2026

---

## 5. Video Processing Pipeline

### 5.1 Upload to HLS Workflow
```
User Uploads Video (MP4)
        │
        ▼
FFmpeg Transcoding
        │
        ├──► 480p (854x480, ~1.5 Mbps)
        ├──► 720p (1280x720, ~3 Mbps)
        └──► 1080p (1920x1080, ~6 Mbps)
        │
        ▼
HLS Packaging
        │
        ├──► /media/{contentId}/{episodeId}/480p/index.m3u8
        ├──► /media/{contentId}/{episodeId}/720p/index.m3u8
        ├──► /media/{contentId}/{episodeId}/1080p/index.m3u8
        └──► /media/{contentId}/{episodeId}/master.m3u8
        │
        ▼
Thumbnail Generation
        │
        ├──► poster.jpg (from video midpoint)
        ├──► thumbnail_%03d.jpg (sprite sheet for seek preview)
        └──► episode_still.jpg (custom frame)
```

### 5.2 FFmpeg Transcoding Commands
```bash
# 480p
ffmpeg -i input.mp4 \
  -vf "scale=854:480" \
  -c:v libx264 -preset medium -b:v 1500k \
  -c:a aac -b:a 128k \
  -hls_time 6 -hls_list_size 0 \
  -hls_segment_filename "480p/segment_%03d.ts" \
  "480p/index.m3u8"

# 720p
ffmpeg -i input.mp4 \
  -vf "scale=1280:720" \
  -c:v libx264 -preset medium -b:v 3000k \
  -c:a aac -b:a 128k \
  -hls_time 6 -hls_list_size 0 \
  -hls_segment_filename "720p/segment_%03d.ts" \
  "720p/index.m3u8"

# 1080p
ffmpeg -i input.mp4 \
  -vf "scale=1920:1080" \
  -c:v libx264 -preset medium -b:v 6000k \
  -c:a aac -b:a 192k \
  -hls_time 6 -hls_list_size 0 \
  -hls_segment_filename "1080p/segment_%03d.ts" \
  "1080p/index.m3u8"

# Master Playlist (all qualities in one command)
ffmpeg -i input.mp4 \
  -map 0:v -map 0:a -map 0:v -map 0:a -map 0:v -map 0:a \
  -vf "scale=854:480,scale=1280:720,scale=1920:1080" \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  -master_pl_name "master.m3u8" \
  -hls_time 6 -hls_list_size 0 \
  -hls_segment_filename "quality_%v/segment_%03d.ts" \
  -b:v:0 1500k -b:v:1 3000k -b:v:2 6000k \
  -c:v libx264 -c:a aac \
  -f hls "quality_%v/index.m3u8"
```

### 5.3 Thumbnail Generation
```bash
# Generate poster (at 30 second mark)
ffmpeg -i input.mp4 -ss 00:00:30 -vframes 1 poster.jpg

# Generate thumbnail sprites for seek preview
ffmpeg -i input.mp4 -vf "fps=1/10,scale=160:90,tile=5x5" thumbnails_sprite.jpg

# Generate episode still (at 10% mark)
ffmpeg -i input.mp4 -ss $(echo "scale=2; $(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4) * 0.1" | bc) -vframes 1 episode_still.jpg
```

---



## 6. TMDB Metadata Integration

### 6.1 TMDB API Configuration (Already Set Up ✅)
```env
TMDB_API_KEY=a9bb97d37ecba878a5a4f5a34d175129
TMDB_ACCESS_TOKEN=eyJhbGciOiJIUzI1NiJ9...
```

### 6.2 Metadata Fetching Service
```javascript
// server/src/services/tmdb.service.js
const { MovieDb } = require('moviedb-promise');
const tmdb = new MovieDb(process.env.TMDB_API_KEY);

class TMDbService {
  async syncMovie(tmdbId) {
    const movie = await tmdb.movieInfo({ id: tmdbId });
    const credits = await tmdb.movieCredits({ id: tmdbId });
    return {
      tmdbId: movie.id, title: movie.title, originalTitle: movie.original_title,
      overview: movie.overview, posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path, releaseDate: movie.release_date,
      runtime: movie.runtime, genres: movie.genres,
      voteAverage: movie.vote_average, voteCount: movie.vote_count,
      cast: credits.cast.slice(0, 20).map(p => ({
        tmdbId: p.id, name: p.name, character: p.character,
        profilePath: p.profile_path, order: p.order
      }))
    };
  }

  async syncSeries(tmdbId) {
    const series = await tmdb.tvInfo({ id: tmdbId });
    const credits = await tmdb.tvCredits({ id: tmdbId });
    const seasons = await Promise.all(
      series.seasons.filter(s => s.season_number > 0)
        .map(s => this.syncSeason(tmdbId, s.season_number))
    );
    return {
      tmdbId: series.id, title: series.name, originalTitle: series.original_name,
      overview: series.overview, posterPath: series.poster_path,
      backdropPath: series.backdrop_path, firstAirDate: series.first_air_date,
      lastAirDate: series.last_air_date, numberOfSeasons: series.number_of_seasons,
      numberOfEpisodes: series.number_of_episodes, genres: series.genres,
      voteAverage: series.vote_average, voteCount: series.vote_count,
      cast: credits.cast.slice(0, 20).map(p => ({
        tmdbId: p.id, name: p.name, character: p.character,
        profilePath: p.profile_path, order: p.order
      })),
      seasons
    };
  }

  async syncSeason(seriesId, seasonNumber) {
    const season = await tmdb.seasonInfo({ id: seriesId, season_number: seasonNumber });
    return {
      tmdbId: season.id, seasonNumber: season.season_number,
      name: season.name, overview: season.overview,
      posterPath: season.poster_path, airDate: season.air_date,
      episodeCount: season.episodes.length,
      episodes: season.episodes.map(ep => ({
        tmdbId: ep.id, episodeNumber: ep.episode_number, name: ep.name,
        overview: ep.overview, stillPath: ep.still_path,
        airDate: ep.air_date, runtime: ep.runtime, voteAverage: ep.vote_average
      }))
    };
  }

  async search(query, page = 1) {
    const [movies, tv] = await Promise.all([
      tmdb.searchMovie({ query, page }),
      tmdb.searchTv({ query, page })
    ]);
    return {
      movies: movies.results, series: tv.results,
      total: movies.total_results + tv.total_results, page,
      totalPages: Math.max(movies.total_pages, tv.total_pages)
    };
  }
}

function getTmdbImageUrl(path, size = 'w500') {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
```

### 6.3 Image Sizes Used
| Type | Size | Purpose |
|------|------|---------|
| Poster | `w500` | Content cards, detail pages |
| Backdrop | `w1280` | Hero banners, backgrounds |
| Profile | `w185` | Cast/actor photos |
| Logo | `w200` | Network/production company logos |
| Still | `w500` | Episode thumbnails |

### 6.4 Attribution
```
This product uses the TMDB API but is not endorsed or certified by TMDB.
```

---



## 10. Logging & Observability with Pino

### 10.1 Logger Setup
```javascript
// server/src/config/logger.js
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ip: req.ip,
      requestId: req.id,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'body.password'],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
```

### 10.2 Request Logging Middleware
```javascript
// server/src/middleware/requestLogger.middleware.js
const logger = require('../config/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      req, res,
      duration: `${duration}ms`,
      contentLength: res.getHeader('content-length'),
    }, 'request completed');
  });
  next();
}
```

### 10.3 Usage in Services (instead of console.log)
```javascript
// server/src/services/transcoder.service.js
const logger = require('../config/logger');

class TranscoderService {
  async transcodeVideo(inputPath, outputDir) {
    logger.info({ inputPath, outputDir }, 'Starting video transcoding');
    // ... FFmpeg logic ...
    logger.info({ outputDir, qualities: ['480p', '720p', '1080p'] }, 'Transcoding complete');
  }
}
```

### 10.4 Log Levels Used
| Level | When |
|-------|------|
| `fatal` | Server crash, unrecoverable |
| `error` | Failed request, DB error |
| `warn` | Rate limit hit, suspicious IP |
| `info` | Request completed, user login |
| `debug` | Dev details (disabled in production) |
| `trace` | FFmpeg raw output (diagnostics) |

---



## 11. Stream Security & Token Signing (Implemented ✅)

The stream security system is implemented in `server/src/services/stream.service.js`. It uses JWT-based tokens signed with `STREAM_SECRET` instead of HMAC-SHA256 for richer payload support.

### Token Generation
```javascript
// server/src/services/stream.service.js
function generateStreamToken({ contentId, contentType, ip } = {}) {
  const payload = {
    sub: contentId,                 // Content or Episode _id
    type: contentType,               // 'movie', 'series', or 'episode'
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (config.stream.tokenExpiryHours * 3600),
  };
  if (ip) payload.ip = ip;           // IP binding (production only)

  return jwt.sign(payload, config.stream.secret, { algorithm: 'HS256' });
}
```

### Token Validation
```javascript
function validateStreamToken(token, { ip } = {}) {
  const decoded = jwt.verify(token, config.stream.secret, { algorithms: ['HS256'] });
  if (decoded.ip && ip && decoded.ip !== ip) {
    throw ApiError.forbidden('Stream token IP mismatch');
  }
  return decoded;
}
```

### Protection Layers
| Layer | Protection | Status |
|-------|-----------|--------|
| 1. | `?token=` query parameter required for all HLS endpoints | ✅ |
| 2. | JWT signed with STREAM_SECRET (64-byte hex) | ✅ |
| 3. | Token expiry: 24 hours (configurable) | ✅ |
| 4. | IP binding in production (optional) | ✅ |
| 5. | Stream rate limiter: 30 req/min per IP | ✅ |
| 6. | Path traversal prevention on segment requests | ✅ |
| 7. | Static `/hls` mount restricted to development only | ✅ |

---



## 19.5 Frontend Video Player Implementation

### 18.1 ArtPlayer + HLS.js Integration
```javascript
const player = new Artplayer({
  container: '.art-player',
  url: streamUrl,
  type: 'hls',
  hlsConfig: {
    startLevel: 2,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    enableWorker: true,
    lowLatencyMode: true,
    useMediaCapabilities: true,
  },
  quality: [
    { html: '480p', url: stream480p },
    { html: '720p', url: stream720p, default: true },
    { html: '1080p', url: stream1080p },
  ],
  thumbnails: {
    url: '/api/thumbnails/' + episodeId,
    number: 25,
    column: 5,
  },
  settings: [{
    width: 200,
    name: 'Play Speed',
    html: 'Speed',
    selector: [
      { html: '0.5x', value: 0.5 },
      { html: 'Normal', value: 1, default: true },
      { html: '1.5x', value: 1.5 },
      { html: '2x', value: 2 },
    ],
    onSelect(item) { player.playbackRate = item.value; },
  }],
});
```

### 18.2 Mobile/iOS Optimizations
- `playsinline` attribute for iOS Safari
- `webkit-playsinline` for older iOS
- `x-webkit-airplay="allow"` for AirPlay
- Touch-friendly controls (larger hit areas)
- `100dvh` for proper mobile viewport height
- Orientation change handling
- Picture-in-picture mode
- Background audio playback support

---




---

**← Previous:** [Part 2: Database & API](./02-DATABASE_AND_API.md) | **Next:** [Part 4: Security & CLI](./04-SECURITY_AND_CLI.md) →
