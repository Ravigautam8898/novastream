# NovaStream — Provider Developer SDK Guide

> **Phase:** C — Dynamic Provider Plugin System
> **Document:** PROVIDER_DEVELOPMENT.md — Provider Developer SDK
> **Purpose:** Enable any AI agent or developer to convert a cracked/decoded provider (APK, traffic capture, WaveStream plugin, API docs) into a NovaStream provider plugin without modifying core application code.
> **Last Updated:** July 7, 2026
>
> **C-013 Architecture Rule:** Provider plugins do NOT create movies/shows.
> They only resolve streams for existing content identity.
> Content creation is the responsibility of ContentRegistry and metadata
> providers (TMDB). See `FINDINGS.md` C-013 for full details.
>
> **C5 Architecture Rule:** Metadata providers (discover/search/details) are COMPLETELY
> separate from stream providers (playback). They live in `server/src/metadata/sources/`,
> NOT in `server/src/providers/sources/`. Metadata providers never return stream URLs.
> Stream providers never create catalog entries. See [Metadata Provider vs Stream Provider](#15-metadata-provider-vs-stream-provider).

---

## Table of Contents

1. [Provider Location & Structure](#1-provider-location--structure)
2. [Provider Metadata Contract](#2-provider-metadata-contract)
3. [Provider Execution Strategy](#3-provider-execution-strategy)
4. [BaseProvider Interface](#4-baseprovider-interface)
5. [API Provider Template (CastleTV-Style)](#5-api-provider-template-castletv-style)
6. [Scraper Provider Template (Bollyflix-Style)](#6-scraper-provider-template-bollyflix-style)
7. [Provider-to-Extractor Flow](#7-provider-to-extractor-flow)
8. [APK Reverse Engineering Workflow](#8-apk-reverse-engineering-workflow)
9. [Traffic Capture Conversion](#9-traffic-capture-conversion)
10. [Configuration & Secrets Rules](#10-configuration--secrets-rules)
11. [Error Handling Rules](#11-error-handling-rules)
12. [Performance Rules](#12-performance-rules)
13. [Provider Acceptance Checklist](#13-provider-acceptance-checklist)
14. [Example Source References](#14-example-source-references)
15. [Metadata Provider vs Stream Provider](#15-metadata-provider-vs-stream-provider)

---

## 1. Provider Location & Structure

### Standard Location

All providers live in a single directory:

```
server/src/providers/sources/
```

### Naming Convention

| Format | Example |
|--------|---------|
| `{name}.provider.js` | `yupflix.provider.js` |
| `{name}.provider.js` | `castle.provider.js` |

Lowercase, hyphen-separated names only.

### Full Provider Tree

```
server/src/providers/
    ProviderManager.js          — Discovery, loading, priority, fallback chain
    BaseProvider.js             — Abstract class / interface contract (extend this)
    ProviderRegistry.js         — Database-backed provider config (enable, priority, version)
    ExtractorManager.js         — Video host resolver dispatch

    sources/
        yupflix.provider.js     — YupFlix provider (migrated from ContentSourceService)
        castle.provider.js      — CastleTV provider
        bollyflix.provider.js   — Bollyflix provider

    extractors/
        streamwish.extractor.js — StreamWish video host resolver
        filemoon.extractor.js   — FileMoon video host resolver
```

---

## 2. Provider Metadata Contract

Every provider MUST expose a static `metadata` property. This is read by `ProviderManager` at registration time.

### Full Metadata Schema

```javascript
static metadata = {
  // ── Identity ──
  id: 'castletv',                    // Unique identifier (lowercase, no spaces)
  name: 'CastleTV',                  // Display name for UI
  version: '1.0.0',                  // Semver
  author: 'NovaStream Team',         // Author/maintainer

  // ── Provider Type ──
  providerType: 'API',               // 'API' | 'LIGHT_SCRAPER' | 'BROWSER_SCRAPER'
  //   API:             Fast, low CPU, direct execution — structured JSON endpoints
  //   LIGHT_SCRAPER:   Medium, medium CPU, QUEUE execution — HTTP scraping with cheerio
  //   BROWSER_SCRAPER: Slow, high CPU, WORKER execution — headless browser automation

  // ── Provider Priority ──
  priority: 20,                      // Lower = tried first (default 100)
  enabled: true,                     // false = skipped by ProviderManager

  // ── Execution Strategy ──
  // Controls HOW the provider's getStreams() is executed.
  // API providers run DIRECT. Scrapers run via QUEUE or WORKER.
  execution: {
    mode: 'DIRECT',                  // 'DIRECT' | 'QUEUE' | 'WORKER'
    maxConcurrent: null,             // Max concurrent tasks (null = unlimited for DIRECT)
    timeout: 10000,                  // Per-request timeout in ms
  },

  // ── Stream Lifecycle Policy ──
  streamPolicy: {
    type: 'SIGNED_URL',             // 'STATIC_URL' | 'SIGNED_URL' | 'DYNAMIC'
    ttl: '6h',                      // Typical TTL of returned URLs
    refreshBefore: '10m',           // Refresh this long before expiry
  },
};
```

### Stream Policy Types

| Type | Behavior | TTL | Cache Strategy |
|------|----------|:---:|----------------|
| **STATIC_URL** | URLs are permanent, no expiry | ∞ | Cache indefinitely (no refresh needed) |
| **SIGNED_URL** | URLs contain `expires` param | Per-URL (varies) | Cache until `expires` minus safety buffer; refresh proactively |
| **DYNAMIC** | Fresh session required per request | Minutes | Short cache TTL (60s); always re-fetch on PLAY |

### Examples

```javascript
// YupFlix — API provider, direct execution, signed CDN URLs with 6-hour expiry
{
  id: 'yupflix',
  providerType: 'API',
  execution: { mode: 'DIRECT', timeout: 10000 },
  streamPolicy: { type: 'SIGNED_URL', ttl: '6h', refreshBefore: '10m' },
}

// CastleTV — API provider, direct execution, permanent streaming links
{
  id: 'castletv',
  providerType: 'API',
  execution: { mode: 'DIRECT', timeout: 10000 },
  streamPolicy: { type: 'STATIC_URL', ttl: '24h', refreshBefore: '0m' },
}

// Bollyflix — LIGHT_SCRAPER, queued execution, session-based tokens
{
  id: 'bollyflix',
  providerType: 'LIGHT_SCRAPER',
  execution: { mode: 'QUEUE', maxConcurrent: 3, timeout: 15000 },
  streamPolicy: { type: 'DYNAMIC', ttl: '5m', refreshBefore: '1m' },
}
```

### Provider Registry (Database-Backed)

Runtime configuration is stored separately from provider code:

```json
{
  "id": "castletv",
  "enabled": true,
  "priority": 20,
  "version": "1.0.0",
  "config": {
    "baseUrl": "https://api.castle-provider.com",
    "timeout": 10000,
    "extraHeaders": { "X-API-Key": "...", "X-Device-Id": "..." }
  }
}
```

**Provider code contains LOGIC ONLY. All dynamic values (domains, tokens, API keys, user agents) go in the database-backed ProviderRegistry.**

---

## 3. Provider Execution Strategy

### Why Execution Strategy Matters

Not all providers have equal cost. Running a scraper provider's `getStreams()` directly in the ProviderManager event loop can overload the API server when many different uncached items are requested simultaneously — especially when API providers fail and scraper fallback activates heavily.

### Provider Categories & Execution Modes

| providerType | Execution Mode | Description | Concurrency Control |
|-------------|:--------------:|-------------|:-------------------:|
| `API` | `DIRECT` | Runs inline in ProviderManager. Fast, low CPU, immediate execution. | None needed |
| `LIGHT_SCRAPER` | `QUEUE` | Runs through ScraperQueue with limited concurrency. HTTP scraping with cheerio. | Per-provider + global queue |
| `BROWSER_SCRAPER` | `WORKER` | Runs in isolated child process (`fork()`). Browser automation (Playwright/Puppeteer). | Max 1 globally + process isolation |

### Execution Metadata Field

Every provider declares its execution strategy in metadata:

```javascript
static metadata = {
  id: 'bollyflix',
  providerType: 'LIGHT_SCRAPER',
  execution: {
    mode: 'QUEUE',             // 'DIRECT' | 'QUEUE' | 'WORKER'
    maxConcurrent: 3,          // Max concurrent tasks for this provider (null = unlimited for DIRECT)
    timeout: 15000,            // Per-request timeout in ms
  },
};
```

### ScraperQueue Design

The ScraperQueue manages all LIGHT_SCRAPER and BROWSER_SCRAPER providers under controlled concurrency.

| Property | Value |
|----------|-------|
| **Global max concurrency** | 5 concurrent scraping tasks across all providers |
| **Per-provider concurrency** | Configurable via `execution.maxConcurrent` |
| **Per-request timeout** | Configurable via `execution.timeout` |
| **Queue** | FIFO priority queue |
| **Circuit breaker** | Auto-disable after 5 consecutive failures in 5 min |
| **Backoff** | Exponential: 30s → 60s → 120s before retry |

### BROWSER_SCRAPER Worker Process

BROWSER_SCRAPER providers use headless browsers. They MUST run in isolated child processes to protect the API server.

```
BROWSER_SCRAPER getStreams()
     ↓
ScraperQueue receives request
     ↓
spawns child_process.fork()
     ↓
Child process:
  ├── Launches headless browser
  ├── Loads page, extracts streaming URLs
  └── Sends result via IPC → terminates
     ↓
ProviderManager receives result → saves cache
```

**Restrictions:**
- Max 1 BROWSER_SCRAPER task globally
- 30-second hard timeout per task
- Worker kills browser if timeout exceeded
- No browser process survives after task completion

### Why NOT Client-Side Scraping

Browser-based scraping in the user's browser is NOT the primary architecture because:

| Issue | Impact |
|-------|--------|
| **CORS** | Video hosts block browser CORS requests |
| **Secrets exposed** | Provider API keys visible in client code |
| **No shared cache** | Each user re-scrapes the same content |
| **Harder updates** | Requires frontend deploys |
| **Inconsistent** | Browser/network differences produce different results |

### Protection Layers Summary

| Layer | What It Prevents |
|-------|------------------|
| StreamCache hit | Repeated scraping of same content |
| ProviderResolveLock (C-008) | Cache stampede — 1000 users → 1 resolve |
| ScraperQueue | Server CPU/RAM overload from many uncached items |
| Per-provider concurrency | One scraper monopolizing the queue |
| Timeout | Hanging request blocking the queue |
| Circuit breaker | Repeated failures wasting resources |
| Backoff | Hammering a failing provider |
| Worker isolation | Browser crash corrupting API server |

---

## 4. BaseProvider Interface

Every provider extends `BaseProvider` and implements the following methods.

### Lifecycle Methods

| Method | Returns | Required | Description |
|--------|---------|:--------:|-------------|    | `initialize()` | `Promise<void>` | ✅ | Set up HTTP client, load secrets, validate config |
| `healthCheck()` | `Promise<{ok, latency, error?}>` | ✅ | Check if provider is operational (called every 5 min) |
| `dispose()` | `Promise<void>` | ❌ | Cleanup on unload (close connections, clear timers) |

### Content Methods

| Method | Returns | Required | Description |
|--------|---------|:--------:|-------------|
| `search(query)` | `Promise<Array>` | ✅ | Search movies, series, anime, live TV |
| `getDetails(contentId)` | `Promise<Object>` | ✅ | Full content metadata (title, year, poster, cast) |
| `getEpisodes(contentId)` | `Promise<Array>` | ❌ | Episode list for series (skip for movie-only providers) |
| `getStreams(mapping, options?)` | `Promise<Array>` | ✅ | Streaming URLs with qualities and headers |

### Method Signatures

```javascript
// ── search ──
// Query external provider for content matching the search term.
// Returns a normalized array of content items.
async search(query) {
  // query: string (e.g., "Avengers Endgame")
  // Returns: Array<{ id: string, title: string, year: number, type: string, poster?: string }>
  return [];
}

// ── getDetails ──
// Fetch full metadata for a specific content item by its provider ID.
async getDetails(contentId) {
  // contentId: string (the provider's internal ID for this content)
  // Returns: { id, title, year, overview, poster, backdrop, genres, cast?, runtime?, ... }
  return {};
}

// ── getEpisodes ──
// Fetch episode list for a series. ONLY for series providers.
async getEpisodes(contentId) {
  // contentId: string (the provider's series ID)
  // Returns: Array<{ seasonNumber, episodeNumber, name, overview, stillPath? }>
  return [];
}

// ── getStreams ──
// Fetch playable streaming URLs for a content item.
// ProviderManager passes the FULL provider mapping object (C4c contract).
// Simple providers use mapping.providerContentId.
// Advanced providers can use mapping.providerData for provider-specific fields.
async getStreams(mapping, options = {}) {
  // mapping: { providerContentId: string, providerData?: object, confidenceScore?: number }
  // options: { season?: number, episode?: number, quality?: string, contentType?: string, slug?: string }
  //
  // Simple provider pattern:
  //   const contentId = mapping.providerContentId;
  //
  // Advanced provider pattern:
  //   const { movieId, episodeSlug } = mapping.providerData || {};
  //   const contentId = movieId || mapping.providerContentId;
  //
  // Returns: Array<{ url: string, quality: string, type: string, headers?: object }>
  return [{ url: 'https://...', quality: '720p', type: 'hls', headers: { Referer: '...' } }];
}
```

### Provider Mapping Contract (C4c)

ProviderManager now passes the **full provider mapping object** to `getStreams()`, not just the content ID. This enables:

- **Simple providers** (YupFlix): Use `mapping.providerContentId` directly
- **Advanced providers** (CastleTV): Use `mapping.providerData` for provider-specific fields

```javascript
// Mapping object structure from content.providers[]:
{
  providerName: 'castletv',
  providerContentId: '5823784641434624',   // Always present
  providerData: {                           // Provider-specific (optional)
    movieId: '5823784641434624',
    seasonMap: { '1': 'ep100' },
    matchedYear: 2012,
  },
  confidenceScore: 0.85,
}
```

**Rule:** ProviderManager routes the mapping; the provider decides how to interpret it. ProviderManager must NOT read `providerData` internals.

### Content-Type Independence

Methods use `contentId` (provider-internal ID), NOT `getMovie()` / `getSeries()`. This keeps the interface stable when adding new content types (anime, live TV, etc.). The provider maps content types internally.

---

## 5. API Provider Template (CastleTV-Style)

This is the template for **API-based providers** — structured JSON endpoints with standard HTTP requests.

### Full Example

```javascript
// server/src/providers/sources/castle.provider.js
// CastleTV Provider — API-based content source
//
// Source reference: workable_providers/castletv/provider.py
// API base: https://api.castle-provider.com (configured in ProviderRegistry)

const axios = require('axios');
const BaseProvider = require('../BaseProvider');

class CastleProvider extends BaseProvider {
  static metadata = {
    id: 'castletv',
    name: 'CastleTV',
    version: '1.0.0',
    author: 'NovaStream Team',
    providerType: 'API',
    priority: 20,
    enabled: true,
    streamPolicy: {
      type: 'STATIC_URL',
      ttl: '24h',
      refreshBefore: '0m',
    },
  };

  async initialize() {
    // Read runtime config from ProviderRegistry (not hardcoded)
    const registry = require('../ProviderRegistry');
    this.config = await registry.getConfig(this.constructor.metadata.id);

    // Create HTTP client with provider-specific defaults
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout || 10000,
      headers: {
        'User-Agent': this.config.userAgent || 'NovaStream/1.0',
        'Accept': 'application/json',
        ...(this.config.extraHeaders || {}),
      },
    });
  }

  async healthCheck() {
    const start = Date.now();
    try {
      await this.client.get('/api/health');
      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      return { ok: false, latency: Date.now() - start, error: err.message };
    }
  }

  async search(query) {
    const { data } = await this.client.get('/api/search', {
      params: { q: query },
    });
    // Normalize response to NovaStream format
    return (data.results || []).map(item => ({
      id: String(item.id || item.tmdb_id),
      title: item.title || item.name,
      year: item.year || item.release_date?.split('-')[0],
      type: item.type || (item.episode_count ? 'series' : 'movie'),
      poster: item.poster_path || item.poster,
    }));
  }

  async getDetails(contentId) {
    const { data } = await this.client.get(`/api/movies/public/${contentId}`);
    return {
      id: String(data.id),
      title: data.title,
      year: data.year,
      overview: data.description || data.overview,
      poster: data.poster_path,
      backdrop: data.backdrop_path,
      genres: (data.genres || []).map(g => ({ id: g.id, name: g.name })),
      cast: (data.cast || []).slice(0, 20).map(c => ({
        name: c.name,
        character: c.character,
        profilePath: c.profile_path,
      })),
      runtime: data.runtime,
      voteAverage: data.vote_average,
    };
  }

  async getEpisodes(contentId) {
    const { data } = await this.client.get(`/api/series/public/${contentId}`);
    const episodes = [];
    for (const season of (data.seasons || [])) {
      for (const ep of (season.episodes || [])) {
        episodes.push({
          seasonNumber: season.seasonNumber || ep.seasonNumber,
          episodeNumber: ep.episodeNumber,
          name: ep.name,
          overview: ep.description || ep.overview,
          stillPath: ep.still_path,
          airDate: ep.air_date,
        });
      }
    }
    return episodes;
  }

  async getStreams(mapping, options = {}) {
    const contentId = mapping.providerContentId || mapping;
    const { season, episode, quality } = options;

    const endpoint = season
      ? `/api/series/public/${contentId}`
      : `/api/movies/public/${contentId}`;

    const { data } = await this.client.get(endpoint);

    // Extract streaming links from the provider response
    const rawLinks = season
      ? this._extractEpisodeLinks(data, season, episode)
      : this._extractMovieLinks(data);

    // Map to NovaStream format, applying quality preference
    return rawLinks
      .filter(link => link.url)
      .map(link => ({
        url: link.url,
        quality: link.quality || '720p',
        type: link.type || 'hls',
        headers: this._getStreamHeaders(),
      }));
  }

  _extractMovieLinks(data) {
    return (data.streamingLinks || data.sources || data.videos || []);
  }

  _extractEpisodeLinks(data, seasonNum, episodeNum) {
    for (const season of (data.seasons || [])) {
      if (season.seasonNumber !== seasonNum) continue;
      for (const ep of (season.episodes || [])) {
        if (ep.episodeNumber !== episodeNum) continue;
        return ep.streamingLinks || ep.sources || [];
      }
    }
    return [];
  }

  _getStreamHeaders() {
    // Some providers require specific headers for streaming
    return {
      Referer: this.config.referer || this.config.baseUrl,
      'User-Agent': this.config.userAgent || 'NovaStream/1.0',
    };
  }

  async dispose() {
    // Cleanup if needed (close connections, clear intervals)
  }
}

module.exports = CastleProvider;
```

### Key Patterns for API Providers

| Pattern | Why |
|---------|-----|
| `axios.create({ baseURL })` | Base URL from ProviderRegistry, not hardcoded |
| `healthCheck()` with latency | ProviderManager uses this for ordering |
| Normalize responses to NovaStream format | Standardized output regardless of provider API shape |
| `_getStreamHeaders()` | Per-provider streaming headers (Referer, Origin, cookies) |
| `streamPolicy.type: 'STATIC_URL'` | Tell cache layer URLs don't expire |

---

## 6. Scraper Provider Template (Bollyflix-Style)

This is the template for **scraper-based providers** — HTML parsing, iframe extraction, and ExtractorManager usage.

### Full Example

```javascript
// server/src/providers/sources/bollyflix.provider.js
// Bollyflix Provider — LIGHT_SCRAPER queued execution
//
// Source reference: WaveStream Bollyflix.cs3 decompiled
// Scrapes HTML pages, extracts iframe sources, delegates video resolution to ExtractorManager
//
// Execution: QUEUE mode — runs through ScraperQueue with limited concurrency.
// ProviderManager submits this provider's getStreams() to the ScraperQueue
// instead of calling it directly. This protects the API server from CPU overload.

const axios = require('axios');
const cheerio = require('cheerio');       // HTML parsing
const BaseProvider = require('../BaseProvider');
const ExtractorManager = require('../ExtractorManager');

class BollyflixProvider extends BaseProvider {
  static metadata = {
    id: 'bollyflix',
    name: 'Bollyflix',
    version: '1.0.0',
    author: 'NovaStream Team',
    providerType: 'LIGHT_SCRAPER',
    priority: 50,
    enabled: true,
    execution: {
      mode: 'QUEUE',              // Runs through ScraperQueue
      maxConcurrent: 3,           // Max 3 concurrent scraping tasks
      timeout: 15000,             // 15s per request
    },
    streamPolicy: {
      type: 'DYNAMIC',
      ttl: '5m',
      refreshBefore: '1m',
    },
  };

  async initialize() {
    const registry = require('../ProviderRegistry');
    this.config = await registry.getConfig(this.constructor.metadata.id);

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: (this.config.timeout || 15000) * 2, // Scrapers need longer timeouts
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        ...(this.config.extraHeaders || {}),
      },
      // Scrapers may need to follow redirects or handle cookies
      maxRedirects: 5,
    });
  }

  async healthCheck() {
    const start = Date.now();
    try {
      await this.client.get('/');
      return { ok: true, latency: Date.now() - start };
    } catch (err) {
      return { ok: false, latency: Date.now() - start, error: err.message };
    }
  }

  async search(query) {
    // Scrape search results page
    const { data } = await this.client.get('/search', {
      params: { q: query },
    });

    const $ = cheerio.load(data);
    const results = [];

    $('.movie-card, .search-result, .item').each((i, el) => {
      const $el = $(el);
      results.push({
        id: $el.attr('data-id') || $el.find('a').attr('href')?.split('/').pop(),
        title: $el.find('.title, h3, h2').text().trim(),
        year: parseInt($el.find('.year').text().trim()) || null,
        type: $el.attr('data-type') || 'movie',
        poster: $el.find('img').attr('src'),
      });
    });

    return results;
  }

  async getDetails(contentId) {
    // Scrape detail page
    const { data } = await this.client.get(`/movie/${contentId}`);
    const $ = cheerio.load(data);

    return {
      id: contentId,
      title: $('h1').text().trim(),
      year: parseInt($('.year, .release-date').text().trim()) || null,
      overview: $('.description, .overview, p.storyline').text().trim(),
      poster: $('.poster img, .cover img').attr('src'),
      backdrop: $('.backdrop img').attr('src'),
      genres: [],
      cast: [],
      runtime: null,
    };
  }

  async getStreams(mapping, options = {}) {
    const contentId = mapping.providerContentId || mapping;
    const { season, episode, quality } = options;

    // 1. Scrape the watch/embed page
    const watchPath = season
      ? `/watch/${contentId}?s=${season}&e=${episode}`
      : `/watch/${contentId}`;

    const { data } = await this.client.get(watchPath);
    const $ = cheerio.load(data);

    // 2. Extract iframe sources (video hosts like StreamWish, FileMoon)
    const iframeSources = [];
    $('iframe').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !src.includes('ads')) {
        iframeSources.push(src);
      }
    });

    // Also check for direct video links
    const directLinks = [];
    $('video source, source[type*="m3u8"], source[type*="mp4"]').each((i, el) => {
      directLinks.push($(el).attr('src'));
    });

    // 3. Delegate video URL resolution to ExtractorManager
    //    Provider finds the pages. ExtractorManager resolves the actual m3u8 URL.
    const streams = [];

    for (const src of iframeSources) {
      try {
        const resolved = await ExtractorManager.resolve(src);
        if (resolved && resolved.url) {
          streams.push({
            url: resolved.url,
            quality: resolved.quality || '720p',
            type: 'hls',
            headers: {
              Referer: this.config.baseUrl,
              'User-Agent': 'Mozilla/5.0',
              ...(resolved.headers || {}),
            },
          });
        }
      } catch (err) {
        // If this extractor fails, try the next iframe
        continue;
      }
    }

    // For direct links, return as-is
    for (const url of directLinks) {
      streams.push({
        url,
        quality: quality || '720p',
        type: url.includes('.m3u8') ? 'hls' : 'mp4',
        headers: { Referer: this.config.baseUrl },
      });
    }

    return streams;
  }

  async dispose() {
    // No cleanup needed for stateless scraper
  }
}

module.exports = BollyflixProvider;
```

### Key Patterns for Scraper Providers

| Pattern | Why |
|---------|-----|
| `cheerio.load(data)` | Fast server-side HTML parsing |
| `providerType: 'LIGHT_SCRAPER'` | Declares queued execution — runs through ScraperQueue |
| `execution: { mode: 'QUEUE', maxConcurrent: 3 }` | Limits concurrency to protect API server |
| Longer timeouts | Scraper pages are slower than API endpoints |
| `maxRedirects: 5` | Some scrapers redirect through tracking pages |
| Iframe extraction → ExtractorManager | Provider finds pages; ExtractorManager resolves video URLs |
| `for...of` with `.catch()` per URL | One failed extraction never blocks other sources |
| `streamPolicy.type: 'DYNAMIC'` | Short TTL — re-scrape on each resolve |

---

## 7. Provider-to-Extractor Flow

**Providers find content. Extractors resolve video hosts. Never duplicate extractor code inside providers.**

### Flow Diagram

```
Bollyflix Provider
      |
      |  getStreams() scrapes watch page
      |  finds <iframe src="https://streamwish.com/e/abc123">
      |
      v
ExtractorManager.resolve('https://streamwish.com/e/abc123')
      |
      |  Matches streamwish.extractor.js by domain
      |  Runs StreamWishExtractor.resolve(iframeUrl)
      |  Returns: { url: 'https://cdn.streamwish.com/hls/abc123.m3u8', quality: '720p', headers: {...} }
      |
      v
Bollyflix Provider receives resolved URL
      |
      v
Returns normalized stream to ProviderManager
```

### Extractor Interface

Each extractor in `server/src/providers/extractors/` implements:

```javascript
// server/src/providers/extractors/streamwish.extractor.js
class StreamWishExtractor {
  // Domain pattern(s) this extractor handles
  static domains = ['streamwish.com', 'swish.com'];

  // Resolve an iframe/embed URL to a playable m3u8 URL
  static async resolve(url, options = {}) {
    // url: string (the iframe src URL)
    // options: { headers, cookies, referer }
    // Returns: { url, quality, type, headers } | null
    return null;
  }
}
```

### Why Extractors Are Separate

- **Multiple providers use the same video hosts** — StreamWish links appear in Bollyflix, CineTV, and other providers
- **Extractor code is complex** — Hosts change their embedding patterns frequently. A single extractor serves all providers
- **Hot-fixable independently** — Update `streamwish.extractor.js` without touching any provider

---

## 8. APK Reverse Engineering Workflow

### CastleTV — Documented Conversion Example

CastleTV was the first provider converted from a decompiled APK. Here is the documented workflow:

**Source:** `CastleTvProvider.cs3` (decompiled from Android DEX bytecode)
**Python reference:** `workable_providers/castletv/provider.py`
**Result:** `server/src/providers/sources/castletv.provider.js` (not tracked in git)

| Property | Value |
|----------|-------|
| **Type** | `API` — JSON endpoints with AES/CBC encrypted responses |
| **Base URL** | `https://api.hlowb.com` |
| **Auth** | Dynamic AES key fetched via `/v0.1/system/getSecurityKey/1` |
| **Crypto** | AES-128-CBC/PKCS5Padding, key = base64_decode(key) + `T!BgJB` → 16 bytes, IV = key |
| **Content IDs** | Internal integer `movieId` and `episodeId` (no TMDB/IMDb IDs) |
| **Stream policy** | `SIGNED_URL` — URLs have `expireTime` (~1 hour TTL) |
| **Execution** | `DIRECT` — no queue needed for API provider |
| **Caching** | ProviderManager `_streamCache` handles TTL and refresh |
| **Subtitles** | Available as VTT URLs in stream response |
| **Qualities** | 1=SD 480P, 2=HD 720P, 3=FHD 1080P (cap at 2 for free tier) |

**Key discovery:** Encrypted API responses do NOT mean the provider is a scraper. CastleTV uses structured JSON endpoints with transport-level AES encryption. It is a pure API provider because:
- No HTML parsing
- No browser automation
- No iframe extraction
- All communication is JSON (encrypted at rest, but structured data)

When converting from a decompiled APK, follow this workflow:

### Step 1: Capture the Network Layer

Identify from the APK/source:

| What to Find | Where to Look | Example |
|-------------|---------------|---------|
| **Base URL** | String constants, obfuscated strings, BuildConfig | `https://api.castle-provider.com` |
| **Endpoints** | URL path patterns in the code | `/api/movies/public/{id}` |
| **Headers** | Request building code | `User-Agent`, `X-API-Key`, `Authorization` |
| **Cookies** | CookieJar or SharedPreferences | Session token, device ID |
| **Auth tokens** | Hardcoded strings, BuildConfig fields | API key embedded in APK |
| **Request signing** | HMAC, MD5, AES methods | `sign = md5(path + secret)` |
| **Encryption** | Cipher instances, decrypt methods | AES/CBC/PKCS5Padding |

**Common WaveStream `.cs3` patterns:**
- `CastleTvProvider.cs3` — AES/CBC encrypted API responses, hardcoded API key
- `BilibiliProvider.cs3` — Custom MD5-based request signing, device fingerprint
- `Bollyflix.cs3` — HTML scraper, iframe extraction
- `CineTvProvider.cs3` — API-based, JSON responses, Referer-based auth

### Step 2: Map APK Functions to NovaStream Methods

| APK Method | NovaStream Method | Description |
|------------|:-----------------:|-------------|
| `search(query)` → | `search()` | Full-text search, returns content list |
| `getMovieDetail(id)` → | `getDetails()` | Movie metadata (title, poster, cast) |
| `getSeriesDetail(id)` → | `getDetails()` | Series metadata |
| `getSeasons(id)` → | `getEpisodes()` | Episode list per season |
| `getStreamUrl(id, quality)` → | `getStreams()` | Playable streaming URLs |
| `getHeaders()` → | `_getStreamHeaders()` | Per-provider streaming auth headers |

### Step 3: Classify the Provider

| Characteristic | `providerType` | `streamPolicy.type` |
|---------------|:--------------:|:-------------------:|
| Returns JSON from API | `'API'` | Depends on URL expiry |
| Scrapes HTML pages | `'LIGHT_SCRAPER'` | Usually `'DYNAMIC'` or `'SIGNED_URL'` |
| URLs with `expires` param | — | `'SIGNED_URL'` |
| URLs that don't expire | — | `'STATIC_URL'` |
| Session-based / short-lived | — | `'DYNAMIC'` |

### Step 4: Handle Provider-Specific Crypto

If the provider requires request signing or response decryption:

```javascript
// Example: CastleTV AES/CBC decryption
const crypto = require('crypto');

_decryptResponse(encryptedBase64, secretKey) {
  const key = Buffer.from(secretKey, 'hex');
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const iv = encrypted.slice(0, 16);
  const data = encrypted.slice(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}
```

**Rules:**
- Crypto functions go in the provider file (they ARE the provider logic)
- Keys and secrets go in ProviderRegistry (never hardcoded)
- If hardware attestation is required, document the limitation — NovaStream may not support it

---

## 9. Traffic Capture Conversion

When converting from captured HTTP traffic (Burp Suite, Charles, Wireshark):

### Step 1: Identify the API Contract

From the captured requests:

```
GET https://api.provider.com/api/movies/public/12345
Headers:
  User-Agent: ProviderApp/2.1
  X-Device-Id: a1b2c3d4
  Authorization: Bearer eyJhbGci...

Response:
{
  "id": 12345,
  "title": "Movie Name",
  "streamingLinks": [
    { "url": "https://cdn.provider.com/hls/12345.m3u8?token=abc", "quality": "1080p" },
    { "url": "https://cdn.provider.com/hls/12345_720.m3u8?token=abc", "quality": "720p" }
  ]
}
```

### Step 2: Map to NovaStream Interface

```javascript
// Traffic shows:
//   GET /api/movies/public/{id} → movie details + streaming links
//   GET /api/series/public/{id} → series with seasons + episodes + streaming links
//
// NovaStream mapping:
//   search(query)    → GET /api/search?q={query}
//   getDetails(id)   → GET /api/movies/public/{id}  or  /api/series/public/{id}
//   getEpisodes(id)  → GET /api/series/public/{id}  (extract from seasons)
//   getStreams(id)   → GET /api/movies/public/{id}  or  /api/series/public/{id}  (extract URLs)
```

### Step 3: Document Auth Requirements

```javascript
// Captured auth flow:
// 1. POST /api/auth/login { username, password } → { token }
// 2. Use token in Authorization header for all subsequent requests
// 3. Token expires after 24 hours
//
// NovaStream implementation:
// - Store token in ProviderRegistry
// - Provider.initialize() fetches a fresh token if expired
// - All requests include Authorization: Bearer {token}
```

---

## 10. Configuration & Secrets Rules

### What Goes Where

| Data | Location | Example |
|------|----------|---------|
| Provider logic | `sources/{name}.provider.js` | API endpoints, response parsing, crypto |
| Base URL | ProviderRegistry config | `baseUrl: "https://api.provider.com"` |
| API keys | ProviderRegistry config | `apiKey: "sk_live_..."` |
| User agents | ProviderRegistry config | `userAgent: "Mozilla/5.0..."` |
| Timeouts | ProviderRegistry config | `timeout: 10000` |
| Referer headers | ProviderRegistry config | `referer: "https://provider.com"` |
| Tokens | ProviderRegistry config | `authToken: "eyJhbGci..."` |

### Hardcoded Secrets — FORBIDDEN

```javascript
// ❌ WRONG — secrets in provider code
class BadProvider extends BaseProvider {
  async initialize() {
    this.apiKey = 'sk_live_abc123def456'; // NEVER DO THIS
    this.baseUrl = 'https://api.secret-domain.com'; // NEVER DO THIS
  }
}

// ✅ CORRECT — secrets in ProviderRegistry
class GoodProvider extends BaseProvider {
  async initialize() {
    const registry = require('../ProviderRegistry');
    const config = await registry.getConfig('good-provider');
    this.apiKey = config.apiKey;  // From database
    this.baseUrl = config.baseUrl; // From database
  }
}
```

### Environment Variable Fallback

For local development, ProviderRegistry can fall back to environment variables:

```javascript
// ProviderRegistry.getConfig() pattern:
const config = {
  baseUrl: process.env[`${providerId.toUpperCase()}_BASE_URL`] || defaultBaseUrl,
  apiKey: process.env[`${providerId.toUpperCase()}_API_KEY`] || null,
};
```

---

## 11. Error Handling Rules

### A Provider Must Never Crash NovaStream

```javascript
// ✅ CORRECT — wrap everything in try/catch, return controlled errors
async healthCheck() {
  try {
    const { data } = await this.client.get('/api/health');
    return { ok: true, latency: 150 };
  } catch (err) {
    return { ok: false, latency: -1, error: err.message };
  }
}

// ✅ CORRECT — per-link error isolation
async getStreams(contentId) {
  const links = await this._fetchLinks(contentId);
  const streams = [];
  for (const link of links) {
    try {
      const resolved = await ExtractorManager.resolve(link);
      if (resolved) streams.push(resolved);
    } catch {
      // One failed extraction doesn't block other links
      continue;
    }
  }
  return streams;
}

// ❌ WRONG — unhandled rejection crashes the provider
async getStreams(contentId) {
  const { data } = await this.client.get(`/watch/${contentId}`); // No try/catch!
  // ProviderManager's try/catch around getStreams() protects NovaStream,
  // but this particular provider will be skipped entirely.
}
```

### Error Propagation

ProviderManager wraps every provider call:

```
ProviderManager.tryProvider(provider, contentId)
    ↓
  try { return await provider.getStreams(contentId); }
  catch(err) {
    logger.warn({ provider: provider.metadata.id, err }, 'Provider failed');
    return null;  // ← ProviderManager continues to next provider
  }
    ↓
If all providers return null → "No sources available"
```

### Provider Response Contract

| Scenario | Return Value | What ProviderManager Does |
|----------|-------------|---------------------------|
| Success | `[{ url, quality, type }]` | Saves cache, returns to player |
| Content not found | `[]` (empty array) | Tries next provider |
| Transient error | Throw error | Logs warning, tries next provider |
| Provider offline | `healthCheck()` returns `{ ok: false }` | Marks degraded, skips until next health check |

---

## 12. Performance Rules

### Do NOT Resolve Streams on Detail Page

**WRONG:**
```
User opens Avengers detail page
    ↓
Call all 50 providers for stream URLs
    ↓
Huge server load, slow page load
```

**CORRECT:**
```
User opens Avengers:
  Load only: TMDB data, images, cast, seasons, episodes
  ZERO provider calls.

Provider resolving happens ONLY when:
  1. User presses PLAY
  2. Background refresh worker runs
```

### API Providers Preferred

- API providers have `providerType: 'API'`
- ProviderManager tries ALL API providers before ANY scraper provider
- This reduces CPU usage and improves response times

### Scraper Providers Are Fallback

- LIGHT_SCRAPER providers have `providerType: 'LIGHT_SCRAPER'`
- BROWSER_SCRAPER providers are excluded from automated background refresh entirely (too expensive)
- Only tried when all API providers fail for a given content
- Background refresh: API providers get large batches (50-100 items), LIGHT_SCRAPER providers are limited (5-10 items), BROWSER_SCRAPER excluded

### Cache First, Network Second

```
PLAY
  ↓
Check StreamUrlCache (_streamCache)  ← fast, no network
  ↓
  ├── HIT: return immediately
  │
  └── MISS:
        Check ProviderMatchCache (Content.sourceId)
          ↓
          ├── EXISTS: refresh URL from same provider
          └── MISS: run ProviderManager chain → save to cache
```

---

## 13. Provider Acceptance Checklist

Before a new provider is accepted into NovaStream, ALL items below must pass.

### Metadata & Config

| # | Item | How to Verify |
|---|------|---------------|
| 1 | Metadata complete (all fields present) | Read the static `metadata` property |
| 2 | `id` is unique (not conflicting with existing providers) | Check `providers/sources/` directory |
| 3 | `version` follows semver | `X.Y.Z` format |
| 4 | `streamPolicy` matches actual URL behavior | Verify URLs returned by `getStreams()` |
| 5 | `providerType` is correct (`API`, `LIGHT_SCRAPER`, or `BROWSER_SCRAPER`) | Verify against provider's response format and execution requirements |
| 6 | No secrets hardcoded in provider file | Grep for hardcoded API keys, passwords |

### Functionality

| # | Item | How to Verify |
|---|------|---------------|
| 7 | `initialize()` runs without error | `new Provider().initialize()` |
| 8 | `healthCheck()` returns `{ ok: true }` | Run against live provider API |
| 9 | `search('avengers')` returns results | Run with test query, check array length > 0 |
| 10 | `getDetails(id)` returns content metadata | Call with known content ID from search results |
| 11 | `getEpisodes(id)` returns episodes (series only) | Call with known series ID |
| 12 | `getStreams(id)` returns playable URLs | Call and verify each URL is valid HTTPS |
| 13 | URLs actually play in HLS.js / browser | Open URL in browser or test with HLS.js |

### Stream Lifecycle

| # | Item | How to Verify |
|---|------|---------------|
| 14 | `streamPolicy.type` matches actual URL expiry behavior | Check URLs for `expires` param, session tokens |
| 15 | Cache compatible — TTL is reasonable | `streamPolicy.ttl` matches actual URL lifetime |
| 16 | Proactive refresh works (SIGNED_URL only) | `/refresh` endpoint returns fresh URL before expiry |

### Error Handling

| # | Item | How to Verify |
|---|------|---------------|
| 17 | Timeout implemented via `execution.timeout` | Kill provider during `getStreams()`, verify timeout error |
| 17a | `execution.mode` matches provider type | API → DIRECT, LIGHT_SCRAPER → QUEUE, BROWSER_SCRAPER → WORKER |
| 17b | Scraper providers declare `execution.maxConcurrent` | Verify concurrency limit is reasonable (3-5 for light, 1 for browser) |
| 18 | Provider failure never crashes NovaStream | Throw error in each method, verify other providers still work |
| 19 | `healthCheck()` handles network errors gracefully | Block provider's domain, verify `{ ok: false }` |
| 20 | Empty results return `[]`, not `null` | Search for non-existent content, verify empty array |

### Performance

| # | Item | How to Verify |
|---|------|---------------|
| 21 | Provider does NOT make network calls in `search()` or `getDetails()` | Audit code — only `getStreams()` should make streaming calls |
| 22 | API provider `getStreams()` resolves in <3s | Time a `getStreams()` call |
| 23 | Scraper provider `getStreams()` resolves in <10s | Time a `getStreams()` call |

### Code Quality

| # | Item | How to Verify |
|---|------|---------------|
| 24 | Uses `BaseProvider` extension | `class X extends BaseProvider` |
| 25 | Uses `ExtractorManager` for video host resolution (if applicable) | No duplicate extractor code |
| 26 | Uses `ProviderRegistry` for dynamic config | No hardcoded URLs/tokens |
| 27 | All responses normalized to NovaStream format | Check return shapes match interface |
| 28 | Follows content-type independent method signatures | No `getMovie()` / `getSeries()` |

---

## 14. Example Source References

### WaveStream Decoded Providers (Reference Only)

Located at: `C:\Users\rvg99\OneDrive\Desktop\decode_wavestream\wavestream_audit\providers\`

| Provider | Type | Key Pattern |
|----------|------|-------------|
| `CastleTvProvider.cs3` | API | AES/CBC decryption, hardcoded API key |
| `BilibiliProvider.cs3` | API | MD5 request signing, device fingerprint |
| `Bollyflix.cs3` | Scraper | HTML parsing, iframe extraction |
| `CineTvProvider.cs3` | API | JSON API, Referer-based auth |

### Workable Python Providers

Located at: `workable_providers/`

| Provider | Language | Key Pattern |
|----------|----------|-------------|
| `castletv/provider.py` | Python | HTTP requests, JSON parsing, quality selection |

### Conversion Example: CastleTV Python → NovaStream JS

```python
# Python source (workable_providers/castletv/provider.py)
class CastleTvProvider:
    name = "CastleTvProvider"
    version = 33

    def search(self, query):
        url = f"{self.base_url}/api/search?q={query}"
        # ... HTTP request, parse JSON, return results

    def detail(self, movie_id):
        url = f"{self.base_url}/api/movies/public/{movie_id}"
        # ... HTTP request, parse JSON, return details

    def stream(self, movie_id, episode_id, quality):
        url = f"{self.base_url}/api/movies/public/{movie_id}"
        # ... HTTP request, extract streaming links
```

Maps to NovaStream as:

| Python Method | NovaStream Method | Notes |
|---------------|:-----------------:|-------|
| `search(query)` | `search(query)` | Direct mapping |
| `detail(movie_id)` | `getDetails(contentId)` | Content-type independent |
| `stream(movie_id, ...)` | `getStreams(contentId, {...})` | Merged movie/episode into one method |
| Static `name` | `static metadata.name` | Moved to metadata contract |
| Static `version` | `static metadata.version` | Moved to metadata contract |
| `base_url` | `ProviderRegistry.getConfig().baseUrl` | Moved to runtime config |

---

> **End of Provider Developer SDK Guide**
>
> This document should allow any AI agent or developer to take a cracked/decoded provider (APK, traffic capture, WaveStream plugin, Python code) and convert it into a NovaStream provider plugin without touching core application code.
>
> When adding a new provider: copy an existing provider file, modify it for the new source, run through the acceptance checklist (Section 12), and register it with `ProviderRegistry`. No changes to `ProviderManager.js`, `BaseProvider.js`, or any other core file are needed.

---

## 15. Metadata Provider vs Stream Provider

### The Two Systems Are Completely Independent

NovaStream has **two separate provider systems** that must NEVER be confused:

| Aspect | Stream Providers (C1-C4) | Metadata Providers (C5) |
|--------|-------------------------|------------------------|
| **Directory** | `server/src/providers/sources/` | `server/src/metadata/sources/` |
| **Base class** | `BaseProvider` | `BaseMetadataProvider` |
| **Manager** | `ProviderManager` | `MetadataManager` |
| **Purpose** | Resolve playback URLs | Discover and describe content |
| **Returns** | `[{url, quality, headers}]` | `{title, overview, cast, artwork}` |
| **When called** | On PLAY click | On browse, search, detail view |
| **Registration** | `ProviderManager.discoverProviders()` | `MetadataManager.discoverProviders()` |
| **Frozen** | C1-C4 🔒 FROZEN | C5a 🟡 ACTIVE |

### Stream Provider Rules (C1-C4 Frozen)

- Extends `BaseProvider`
- Lives in `server/src/providers/sources/`
- Implements `getStreams(mapping, options)` → stream URLs
- NEVER creates content catalog entries
- NEVER queries for discovery (trending, search, categories)
- Only called when user presses PLAY

### Metadata Provider Rules (C5 Active)

- Extends `BaseMetadataProvider`
- Lives in `server/src/metadata/sources/`
- Implements `getTrending()`, `search()`, `getDetails()` → content metadata
- NEVER returns stream URLs
- NEVER attached to ProviderManager
- Called on browse, search, and detail views
- Registered with MetadataManager at startup

### Why Separate?

1. **APK-decoded providers** (CastleTV, BiliBili) embed their own search/discovery APIs purely for in-app navigation. These are NOT general-purpose metadata sources like TMDB. Using them for catalog discovery would produce inconsistent results.

2. **Metadata quality** — TMDB (and future IMDb/Trakt) provide authoritative metadata (cast, ratings, artwork, synopsis). Stream providers provide availability data. Mixing them creates identity contamination (C-012).

3. **OTT lifecycle** — Browsing/tending/search should work even when ALL stream providers are offline. The homepage should never depend on stream provider availability.

4. **Scale** — Metadata providers are called heavily (every homepage load, every search). Stream providers are called on PLAY only. Different performance characteristics require separate management.

### Architecture Diagram

```
                    ┌──────────────────────┐
                    │   NovaStream Core     │
                    └──────────┬───────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
    ┌──────────────────┐           ┌──────────────────────┐
    │  MetadataManager  │           │    ProviderManager    │
    │  (C5 — ACTIVE)    │           │  (C1-C4 — FROZEN)    │
    ├──────────────────┤           ├──────────────────────┤
    │ tmdb.metadata.js │           │ yupflix.provider.js  │
    │ trakt.metadata.js│           │ castletv.provider.js │
    │ (future)         │           │ (future scraper)     │
    └──────────────────┘           └──────────────────────┘
               │                               │
               ▼                               ▼
    ┌──────────────────┐           ┌──────────────────────┐
    │  ContentService   │           │   _streamCache (TTL) │
    │  (DB + provider)  │           └──────────────────────┘
    ├──────────────────┤
    │  ContentRegistry  │
    │  (slug + identity)│
    └──────────────────┘
```

### Examples

**What TMDB (metadata provider) does:**
```javascript
// Returns metadata — NO streams
{ title: "Inception", overview: "...", posterPath: "/abc.jpg",
  cast: [{ name: "Leonardo DiCaprio" }], genres: [{ name: "Sci-Fi" }] }
```

**What CastleTV (stream provider) does:**
```javascript
// Returns stream URLs — NO metadata
[{ url: "https://cdn.../master.m3u8", quality: "1080p", type: "hls" }]
```

**Never mix the two.**
