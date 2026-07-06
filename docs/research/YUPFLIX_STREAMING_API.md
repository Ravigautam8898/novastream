# YupFlix Streaming API — Reverse Engineering & Integration Guide

> **Date:** July 1, 2026
> **Source API Base:** `https://jolly-mouse-f41c.annierane.workers.dev/api`
> **Source Website:** `https://watch.yupflix.org`
> **Stream Domains:** `secure.streamraiwind.stream` (Seasons 1-2), `cdn5.streamraiwind.stream` (Season 3)
> **Status:** Series ✅ Verified | Movies ✅ **Verified!**

---

## Table of Contents

1. [Overview](#1-overview)
2. [API Endpoints Map](#2-api-endpoints-map)
3. [Series Streaming URL Structure (✅ Verified)](#3-series-streaming-url-structure--verified)
4. [Movie Streaming URL Structure (❌ Unknown)](#4-movie-streaming-url-structure--unknown)
5. [Stream Host Architecture](#5-stream-host-architecture)
6. [Stream Token Analysis](#6-stream-token-analysis)
7. [How to Integrate Series Streaming into NovaStream](#7-how-to-integrate-series-streaming-into-novastream)
8. [Movie Investigation Guide — Use Your Test Script](#8-movie-investigation-guide--use-your-test-script)

---

## 1. Overview

YupFlix is a streaming platform (Hindi-language UI) that serves movies and TV series via HLS (HTTP Live Streaming). The frontend is React + Vite with **ArtPlayer v5.4.0**, and the backend API runs on **Cloudflare Workers**. The actual video files are hosted on **streamraiwind.stream** CDN.

### Key Facts

| Fact | Detail |
|------|--------|
| **Video Protocol** | HLS (`.m3u8` playlists + `.ts` segments) |
| **DRM** | None (`drm: false` on all links) |
| **Auth** | Token-based URL authentication (`?token=...&expires=...`) |
| **Qualities Available** | 480p, 720p, 1080p |
| **Audio** | Multiple languages (Hindi, English, Korean, etc.) |
| **Content Types** | Series (with seasons + episodes) and Movies |

---

## 2. API Endpoints Map

### ✅ Working Endpoints

| Method | Endpoint | Returns | Status |
|--------|----------|---------|--------|
| `GET` | `/api/views/homepage/sections` | Homepage sections (featured, trending, pinned, continue_watching) with metadata (no streaming URLs) | ✅ Verified |
| `GET` | `/api/movies/public/{movieId}` | Full movie detail: **streamingLinks[]** with 480p/720p/1080p HLS URLs | ✅ **Verified — Has Streaming URLs** |
| `GET` | `/api/series/public/{seriesId}` | Full series detail: seasons, episodes, **streamingLinks[]** for every episode | ✅ **Verified — Has Streaming URLs** |
| `GET` | `/api/search?q={query}` | Search results split into movies[], series[], actors[] — metadata only, **no streaming URLs** | ✅ Verified |
| `GET` | `/api/filters` | Content filters/categories (not fully tested) | ⚠️ Newly discovered

### ❌ Non-Working Endpoints (Tested)

| Endpoint | Result | Notes |
|----------|--------|-------|
| `/api/movies` | 404 | Movie listing endpoint doesn't exist |
| `/api/series` | 404 | Series listing endpoint doesn't exist |
| `/api/trending` | 404 | Dedicated trending endpoint doesn't exist |
| `/api/featured` | 404 | Dedicated featured endpoint doesn't exist |
| `/api/content/public/{id}` | 404 | Generic content endpoint doesn't exist |
| `/api/content/{id}` | 404 | Generic content endpoint doesn't exist |
| `/api/episode/public/{id}` | 404 | Episode public endpoint doesn't exist (episodes are nested under series) |

---

## 3. Series Streaming URL Structure (✅ Verified)

### How to Fetch Series Streaming URLs

**Request:**
```
GET https://jolly-mouse-f41c.annierane.workers.dev/api/series/public/{seriesId}
Headers:
  User-Agent: Mozilla/5.0 ...
  Accept: application/json
  Referer: https://watch.yupflix.org/
```

Where `{seriesId}` is the MongoDB `_id` from any homepage item or search result.

### Response Structure (Simplified)

```json
{
  "_id": "6a27dcc4433e06549fe9fac9",
  "tmdbId": 94997,
  "title": "House of the Dragon",
  "originalTitle": "House of the Dragon",
  "posterPath": "https://image.tmdb.org/t/p/w500/...",
  "backdropPath": "https://image.tmdb.org/t/p/w1280/...",
  "numberOfSeasons": 3,
  "numberOfEpisodes": 26,
  "genres": [ ... ],
  "cast": [ ... ],
  "seasons": [
    {
      "tmdbId": 134965,
      "seasonNumber": 1,
      "name": "Season 1",
      "episodeCount": 10,
      "episodes": [
        {
          "tmdbId": 1971015,
          "episodeNumber": 1,
          "name": "The Heirs of the Dragon",
          "overview": "...",
          "stillPath": "https://image.tmdb.org/t/p/w500/...",
          "airDate": "2022-08-21",
          "runtime": 66,
          "voteAverage": 7.896,
          "streamingLinks": [      ← 🎬 THIS IS WHERE THE VIDEO URLS ARE
            {
              "quality": "480p",
              "url": "https://secure.streamraiwind.stream/img/f9b091fea853/nasty.m3u8?token=qQC1emc4GIXwmUJfmfL7oQ&expires=1782835068",
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
            },
            {
              "quality": "720p",
              "url": "https://secure.streamraiwind.stream/img/c03b7116d36c/nasty.m3u8?token=KgaK4D4vixfIO0IPsnXH4A&expires=1782835068",
              ...
            },
            {
              "quality": "1080p",
              "url": "https://secure.streamraiwind.stream/img/80548b8a5aec/nasty.m3u8?token=3lCLrO3XslvTqwJGE3WymA&expires=1782835068",
              ...
            }
          ]
        }
      ]
    }
  ]
}
```

### StreamingLink Object Fields

| Field | Type | Description | Always Present? |
|-------|------|-------------|-----------------|
| `quality` | string | `"480p"`, `"720p"`, or `"1080p"` | ✅ Yes |
| `url` | string | Full HLS `.m3u8` URL with token | ✅ Yes |
| `type` | string | Always `"hls"` | ✅ Yes |
| `drm` | boolean | Always `false` | ✅ Yes |
| `isActive` | boolean | Whether the link is usable | ✅ Yes |
| `language` | string | Audio language (often empty) | ⚠️ Sometimes empty |
| `headers` | string | Custom HTTP headers for playback (often empty) | ⚠️ Sometimes empty |
| `userAgent` | string | Required UA for playback (often empty) | ⚠️ Sometimes empty |
| `drmUuid` | string | DRM UUID (always empty — no DRM) | ✅ Yes |
| `drmLicenseUri` | string | DRM license URL (always empty) | ✅ Yes |
| `supportedHosts` | boolean | Whether player has host support | No |
| `embed` | boolean | Embed player mode | No |
| `hlsPhpFormat` | boolean | PHP HLS format flag | No |
| `downloadDisabled` | boolean | Download restriction flag | No |

### Example Content IDs (for testing)

| Title | Type | `_id` (Content ID) |
|-------|------|-------------------|
| House of the Dragon | Series | `6a27dcc4433e06549fe9fac9` |
| Game of Thrones | Series | `69e0a832e651a6c8a5f97fd5` |
| Breaking Bad | Series | `69e1c2ade651a6c8a50a9042` |
| The Boys | Series | `69e0a60be651a6c8a5f95070` |
| Money Heist | Series | `69ec5ae2e651a6c8a52e2dc3` |
| Avatar: The Last Airbender | Series | `6a3d06c75f5543dc5c067726` |
| Stranger Things | Series | `69eb5b78e651a6c8a50c6d0a` |
| Cocktail 2 | Movie | `6a37de555f5543dc5c4794d3` |
| Bharat Bhhagya Viddhaata | Movie | `6a2f92a85f5543dc5c012ecc` |

### Quick Test Command

```bash
curl -s "https://jolly-mouse-f41c.annierane.workers.dev/api/series/public/6a27dcc4433e06549fe9fac9" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Accept: application/json" \
  -H "Referer: https://watch.yupflix.org/" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for season in data.get('seasons', []):
    for ep in season.get('episodes', []):
        for link in ep.get('streamingLinks', []):
            print(f\"S{season['seasonNumber']:02d}E{ep['episodeNumber']:02d} [{link['quality']}]: {link['url']}\")
"
```

---

## 4. Movie Streaming URL Structure (✅ Verified)

### How to Fetch Movie Streaming URLs

**Request:**
```
GET https://jolly-mouse-f41c.annierane.workers.dev/api/movies/public/{movieId}
Headers:
  User-Agent: Mozilla/5.0 ...
  Accept: application/json
  Referer: https://watch.yupflix.org/
```

Where `{movieId}` is the MongoDB `_id` from any homepage item or search result with `contentType: "movie"`.

> **Discovery note:** The endpoint is `movies` (plural), **not** `movie` (singular). Found by analyzing the React/JavaScript bundle at `/assets/DmAN33_h.js` which contained the regex: `/\/api\/(movies|series)\/public\/[^/?]+/`

### Response Structure

```json
{
  "_id": "6a37de555f5543dc5c4794d3",
  "tmdbId": 1392469,
  "title": "Cocktail 2",
  "originalTitle": "कॉकटेल २",
  "subTitle": "HDTC",
  "overview": "After a decade together...",
  "posterPath": "https://image.tmdb.org/t/p/w500/...",
  "backdropPath": "https://image.tmdb.org/t/p/w1280/...",
  "releaseDate": "2026-06-19",
  "runtime": 149,
  "genres": [ { "id": 10749, "name": "Romance" }, { "id": 35, "name": "Comedy" } ],
  "certifications": ["GB 12A", "IE 12A", "IN A"],
  "networks": [ { "name": "Maddock Films", "logoPath": "..." } ],
  "categories": ["Bollywood"],
  "cast": [ ... ],
  "voteAverage": 7,
  "voteCount": 1,
  "originalLanguage": "hi",
  "streamingLinks": [                             ← 🎬 SAME STRUCTURE AS SERIES EPISODES
    {
      "quality": "480p",
      "url": "https://cdn5.streamraiwind.stream/img/ad4a16555560/nasty.m3u8?token=Z4Kz0hAPQqUSI-ZwR4L8ag&expires=1782911387",
      "type": "hls",
      "isActive": true,
      "downloadDisabled": true
    },
    {
      "quality": "720p",
      "url": "https://cdn5.streamraiwind.stream/img/5fb91351307e/nasty.m3u8?token=XwTW1LOjNqHLl1ftHE8P8w&expires=1782911387",
      ...
    },
    {
      "quality": "1080p",
      "url": "https://cdn5.streamraiwind.stream/img/4f6b7a64fb27/nasty.m3u8?token=q62mlwdqVvBNWmS0u3EqEA&expires=1782911387",
      ...
    }
  ],
  "enableStream": true,
  "enableWatch": true,
  "viewCount": 3914
}
```

### Verified Movie Examples

| Title | `_id` (Movie ID) | Stream Domain |
|-------|------------------|---------------|
| Cocktail 2 | `6a37de555f5543dc5c4794d3` | `cdn5.streamraiwind.stream` |
| Bharat Bhhagya Viddhaata | `6a2f92a85f5543dc5c012ecc` | `cdn2.streamraiwind.stream` |

### Quick Test Command

```bash
curl -s "https://jolly-mouse-f41c.annierane.workers.dev/api/movies/public/6a37de555f5543dc5c4794d3" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Accept: application/json" \
  -H "Referer: https://watch.yupflix.org/"
```

---

## 5. Stream Host Architecture

### CDN Domains

| Domain | Content Type | Examples |
|--------|-------------|----------|
| `secure.streamraiwind.stream` | Series (older seasons) | House of the Dragon S01-S02 |
| `cdn5.streamraiwind.stream` | Series (newer) & Movies | House of the Dragon S03, Cocktail 2 |
| `cdn2.streamraiwind.stream` | Movies | Bharat Bhhagya Viddhaata |

### URL Pattern

```
https://{domain}/img/{hash}/nasty.m3u8?token={base64_token}&expires={unix_timestamp}
```

| Component | Description | Example |
|-----------|-------------|---------|
| `{domain}` | Stream CDN domain | `secure.streamraiwind.stream` |
| `{hash}` | 12-character hex content hash | `f9b091fea853` |
| `nasty.m3u8` | Playlist filename (always `nasty.m3u8`) | `nasty.m3u8` |
| `token` | Base64-encoded auth token | `qQC1emc4GIXwmUJfmfL7oQ` |
| `expires` | Unix timestamp for URL expiry | `1782835068` |

### Quality Level Structure

Each quality level has a **separate HLS stream** (not a variant playlist):

```json
{
  "480p": "https://{domain}/img/{hash_480p}/nasty.m3u8?token=...",
  "720p": "https://{domain}/img/{hash_720p}/nasty.m3u8?token=...",
  "1080p": "https://{domain}/img/{hash_1080p}/nasty.m3u8?token=..."
}
```

Each quality has a **different content hash** — they're not variant renditions of the same stream but entirely separate encodes stored at different paths.

### Token Expiry

From the scraped data, all tokens share the same `expires` value:
```
expires=1782835068  ≈  June 30, 2026 (when data was scraped)
```

This suggests tokens are short-lived (likely 24 hours) and must be refreshed periodically.

---

## 6. Stream Token Analysis

Tokens are **not standard JWTs**. They appear to be simple base64-encoded opaque strings:

```
token=qQC1emc4GIXwmUJfmfL7oQ
```

Decoded: Likely contains a session identifier or content access key.

The `expires` parameter is a Unix timestamp. URLs with expired tokens will return 403 Forbidden.

**Note:** The stream tokens can be used **as-is** in a browser's HLS player (HLS.js, ArtPlayer, etc.) since they're included directly in the URL query string.

---

## 7. How to Integrate Series & Movie Streaming into NovaStream

### Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Browser     │     │  NovaStream API   │     │  YupFlix API      │
│  (React UI)  │────▶│  (Node.js)       │────▶│  (Cloudflare)     │
│              │     │                  │     │                  │
│  ArtPlayer   │◀────│  Returns stream  │◀────│  Returns content  │
│  + HLS.js    │     │  URL to frontend │     │  + streamingLinks │
└─────────────┘     └──────────────────┘     └──────────────────┘
                            │
                            ▼
                    ┌──────────────────┐
                    │  streamraiwind   │
                    │  CDN (HLS)       │
                    │  Browser fetches │
                    │  .m3u8 + .ts     │
                    │  directly        │
                    └──────────────────┘
```

### What NovaStream Needs

The backend fetches streaming URLs from YupFlix and returns them to the frontend:

| Content Type | YupFlix API Call | How to Extract |
|-------------|-----------------|----------------|
| **Movie** | `GET /api/movies/public/{movieId}` | `response.streamingLinks[]` — pick by quality |
| **Series** | `GET /api/series/public/{seriesId}` | `response.seasons[].episodes[].streamingLinks[]` — find by season/ep number |

**New Service** `server/src/services/yupflix.service.js`:
```javascript
class YupflixService {
  async getMovieStreamUrl(movieId, quality) { /* GET /movies/public/{id} → streamingLinks[] */ }
  async getEpisodeStreamUrl(seriesId, seasonNum, episodeNum, quality) { /* GET /series/public/{id} → seasons → episodes → streamingLinks[] */ }
  async getHomepage() { /* proxy /views/homepage/sections */ }
  async search(query) { /* proxy /search?q= */ }
  async getMovieDetail(movieId) { /* GET /movies/public/{id} full response */ }
  async getSeriesDetail(seriesId) { /* GET /series/public/{id} full response */ }
}
```

### How It Works

1. **Movies:** User clicks "Play" on a movie → NovaStream fetches `GET /api/movies/public/{movieId}` → extracts the best-quality `streamingLinks[].url` → returns it to frontend → ArtPlayer plays `.m3u8`
2. **Series:** User clicks "Play" on an episode → NovaStream fetches `GET /api/series/public/{seriesId}` → finds the episode by season + episode number → extracts `streamingLinks[].url` → returns it to frontend

### What About Existing NovaStream Models?

The NovaStream server has `Content`, `Season`, and `Episode` models populated from TMDB (with `slug` IDs like `"house-of-the-dragon"`). The YupFlix `_id` is different. We need a **mapping layer**:

```
NovaStream Slug (e.g., "house-of-the-dragon") 
  → YupFlix _id (e.g., "6a27dcc4433e06549fe9fac9")
  → YupFlix API /series/public/{id}
  → streamingLinks[]
```

This mapping could be:
- **Stored in DB:** Add an `externalSource` field to Content model with YupFlix ID (preferred)
- **Runtime lookup:** Use YupFlix search API with the title/TMDB ID at play time

### Quick Test to Verify a Movie Plays

```bash
# 1. Get the movie streaming URL
curl -s "https://jolly-mouse-f41c.annierane.workers.dev/api/movies/public/6a2f92a85f5543dc5c012ecc" \
  -H "User-Agent: Mozilla/5.0" -H "Referer: https://watch.yupflix.org/" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['streamingLinks'][1]['url'])"

# 2. Play in VLC
# vlc "{url_from_step_1}"
```

---

*End of Research Document*
