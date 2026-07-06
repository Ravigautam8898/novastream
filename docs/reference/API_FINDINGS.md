# YupFlix API - Reverse Engineering Findings

> **Date:** June 30, 2026
> **Source Website:** https://watch.yupflix.org
> **API Base:** https://jolly-mouse-f41c.annierane.workers.dev/api

---

## 1. Overview

YupFlix is a streaming platform for Bollywood movies, Hollywood series, Korean dramas, and South Indian films. The frontend is built with **Vite + React** (modern JS bundling) and uses **ArtPlayer v5.4.0** for video playback. The backend API is hosted on **Cloudflare Workers**.

---

## 2. API Endpoints

### 2.1 Homepage Sections
```
GET /views/homepage/sections
```
Returns sections as an array, each containing items for display.

**Response structure:**
```json
{
  "data": [
    {
      "sectionType": "featured" | "continue_watching" | "trending" | "pinned",
      "title": "Featured" | "Continue Watching" | "Trending Now" | "Featured",
      "items": [...]
    }
  ]
}
```

**Section Types Identified:**
| sectionType | title | Purpose |
|-------------|-------|---------|
| `featured` | "Featured" | Curated featured content |
| `continue_watching` | "Continue Watching" | User's in-progress content |
| `trending` | "Trending Now" | Popular content sorted by views |
| `pinned` | "Featured" | Admin-pinned items |

### 2.2 Series Details
```
GET /series/public/{seriesId}
```
Returns complete series data with seasons, episodes, cast, and streaming links.

**Episodes contain `streamingLinks[]` array:**
```json
{
  "quality": "480p" | "720p" | "1080p",
  "url": "https://secure.streamraiwind.stream/img/.../nasty.m3u8?token=...&expires=...",
  "type": "hls",
  "drm": false,
  "isActive": true,
  "downloadDisabled": true
}
```

### 2.3 Search
```
GET /search?q={query}
```
Returns paginated search results split by type.

**Response:**
```json
{
  "movies": [...],
  "series": [...],
  "actors": [...],
  "total": 26,
  "page": 1,
  "totalPages": 2
}
```

### 2.4 Non-working Endpoints (404)
- `/movies` ❌
- `/series` ❌  
- `/trending` ❌
- `/featured` ❌

---

## 3. Data Models

### 3.1 Content Item (Homepage / Search Result)

| Field | Type | Description |
|-------|------|-------------|
| `_id` | string | Internal MongoDB ObjectId |
| `tmdbId` | number | TMDB reference ID |
| `title` | string | Display title |
| `originalTitle` | string | Original language title |
| `subTitle` | string | Episode info or quality tag (e.g. "S03E02", "HDTC") |
| `overview` | string | Plot description |
| `posterPath` | string | Poster image URL |
| `backdropPath` | string | Backdrop image URL |
| `contentType` | "series" \| "movie" | Content type |
| `genre` | string | Primary genre |
| `genres[]` | array | Full genre list with IDs |
| `categories[]` | string[] | Region: Hollywood, Bollywood, Korean, South Indian |
| `releaseDate` | string | Release date |
| `firstAirDate` | string | Series first air date |
| `runtime` | number | Movie runtime in minutes |
| `voteAverage` | number | Rating (0-10) |
| `voteCount` | number | Number of votes |
| `viewCount` | number | Total views |
| `trendingViews` | number | Trending period views |
| `numberOfSeasons` | number | (Series only) |
| `isPinned` | boolean | Whether item is pinned |
| `isPremium` | boolean | Premium content flag |
| `order` | number | Display order within section |

### 3.2 Full Series Detail

| Field | Type | Description |
|-------|------|-------------|
| `cast[]` | array | Actor info: `name`, `character`, `profilePath` |
| `seasons[]` | array | Season data (see below) |
| `networks[]` | array | Production networks: `name`, `logoPath` |
| `spokenLanguages[]` | array | Languages: `code`, `name` |
| `certifications[]` | string[] | Age ratings per country |
| `trailerUrl` | string | YouTube trailer URL |
| `status` | string | Series status |
| `enableWatch` | boolean | Whether streaming is enabled |
| `enableDownload` | boolean | Whether download is enabled |
| `originalLanguage` | string | e.g. "en", "hi", "ko" |

**Season structure:**
```json
{
  "tmdbId": 134965,
  "seasonNumber": 1,
  "name": "Season 1",
  "overview": "...",
  "posterPath": "https://image.tmdb.org/t/p/w500/...",
  "airDate": "2022-08-21",
  "episodeCount": 10,
  "episodes": [...]
}
```

**Episode structure:**
```json
{
  "tmdbId": 1971015,
  "episodeNumber": 1,
  "name": "The Heirs of the Dragon",
  "overview": "...",
  "stillPath": "https://image.tmdb.org/t/p/w500/...",
  "airDate": "2022-08-21",
  "runtime": 66,
  "voteAverage": 7.896,
  "streamingLinks": [...]
}
```

**Streaming Link structure:**
```json
{
  "quality": "1080p",
  "url": "https://secure.streamraiwind.stream/img/80548b8a5aec/nasty.m3u8?token=...&expires=...",
  "language": "",
  "headers": "",
  "userAgent": "",
  "drmUuid": "",
  "drmLicenseUri": "",
  "supportedHosts": false,
  "drm": false,
  "embed": false,
  "hlsPhpFormat": false,
  "type": "hls",
  "isActive": true,
  "downloadDisabled": true
}
```

---

## 4. Image Serving Architecture

Two CDN origins for images:

| Source | Domain | Size Variants |
|--------|--------|---------------|
| **TMDB** | `https://image.tmdb.org/t/p/` | `w500`, `w1280`, `w185`, `w200` |
| **Streamraiwind** | `https://img1.streamraiwind.stream/t/p/` | `w500`, `w1280`, `w185` |

- **Posters:** `w500` size
- **Backdrops:** `w1280` size
- **Cast profiles:** `w185` size
- **Episode stills:** `w500` size
- **Network logos:** `w200` size

---

## 5. Video Streaming Architecture

### 5.1 Stream Protocol
- All streams are **HLS** (HTTP Live Streaming)
- Format: `.m3u8` playlists with `.ts` segments
- No DRM protection (`drm: false`)
- Token-based URL authentication with expiry timestamps

### 5.2 Stream Domains
- `https://secure.streamraiwind.stream/` - Season 1 & 2
- `https://cdn5.streamraiwind.stream/` - Season 3

### 5.3 Quality Levels
| Quality | Resolution (typical) | Typical Bitrate |
|---------|---------------------|-----------------|
| 480p | 854x480 | ~1.5 Mbps |
| 720p | 1280x720 | ~3 Mbps |
| 1080p | 1920x1080 | ~6 Mbps |

### 5.4 URL Pattern
```
https://{domain}/img/{hash}/nasty.m3u8?token={base64_token}&expires={unix_timestamp}
```
- `{domain}`: `secure.streamraiwind.stream` or `cdn5.streamraiwind.stream`
- `{hash}`: 12-character hex string (e.g., `80548b8a5aec`)
- Token: Base64-encoded authentication token
- Expires: Unix timestamp for URL expiry

---

## 6. Frontend Technology Stack

| Technology | Purpose |
|------------|---------|
| **React + Vite** | Frontend framework/bundler |
| **ArtPlayer v5.4.0** | HTML5 video player with HLS support |
| **Cloudflare Workers** | Backend API hosting |
| **Cloudflare Pages** | Static asset hosting |
| **Cloudflare Analytics** | Site analytics (beacon) |
| **TMDB** | Metadata (posters, backdrops, genres) |
| **MongoDB** | Database (ObjectId patterns in `_id`) |

### 6.1 ArtPlayer Key Features Used
- Multi-quality selector (480p/720p/1080p)
- Volume control with slider
- Playback speed control
- Audio track selection
- Subtitle toggle
- Fullscreen / web-fullscreen
- Mini-popup player
- Progress bar with thumbnails
- Mobile-optimized touch controls
- Backdrop filter effects

### 6.2 Site Features
- **Language:** Hindi (`lang="hi"`)
- **SEO blocked** (noindex, nofollow)
- **Responsive:** Uses `100dvh` for mobile viewport
- **Episode sidebar:** Slide-out panel showing all episodes with thumbnails
- **Next Episode button:** Floating CTA for binge-watching

---

## 7. Content Categories

| Category | Description | Examples |
|----------|-------------|---------|
| Hollywood | Western movies & series | House of the Dragon, The Boys |
| Bollywood | Indian Hindi content | Mirzapur, Thukra Ke Mera Pyaar |
| Korean | K-dramas & Korean content | Squid Game, Sweet Home |
| South Indian | Tamil/Telugu/Malayalam/etc. | Blast, Peddi |

---

## 8. Key Insights for Building a Similar Server

1. **Node.js + Express** is ideal for the backend
2. **HLS.js** or **Shaka Player** on frontend for HLS playback
3. **TMDB API** integration for metadata (posters, backdrops, cast info)
4. **MongoDB** for content database (or PostgreSQL)
5. **Token-based URL signing** for stream security
6. **Multi-quality encoding** (480p/720p/1080p) using FFmpeg
7. **Responsive design** is critical for mobile + iOS Safari
8. **ArtPlayer** is a great open-source choice for the video player
9. Content organization by **region/category** is key
10. **Search** with Movie/Series/Actor split is important
