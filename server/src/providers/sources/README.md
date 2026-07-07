# Provider Sources Directory

This directory contains streaming provider implementations. Each file ending in `.provider.js` is automatically discovered and registered by `ProviderManager` at server startup.

## Privacy

Provider implementations are **private**. Only the framework template (`example.provider.js`) is tracked in git. Actual provider code (e.g., `yupflix.provider.js`) is gitignored per `.gitignore` rules.

## How to Add a Private Provider

### 1. Create your provider file

```
cp example.provider.js myprovider.provider.js
```

Replace `myprovider` with your provider's identifier (e.g., `castletv`, `youtube`, `vimeo`).

### 2. Update metadata

Edit the `static metadata` block:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier used in `providers[].providerName` on Content documents |
| `legacyIds` | Optional — maps old `sourceSite` values to this provider (e.g., `['primary']`) |
| `providerType` | `API` — direct HTTP calls. `LIGHT_SCRAPER` — controlled queue. `BROWSER_SCRAPER` — heavy automation |
| `execution.mode` | Must match `providerType`: `API` → `DIRECT`, `LIGHT_SCRAPER` → `QUEUE`, `BROWSER_SCRAPER` → `WORKER` |
| `streamPolicy.type` | `STATIC_URL` — permanent URL. `SIGNED_URL` — expiring token URL. `DYNAMIC` — per-request generated |
| `priority` | Lower = tried first (APIs: 10-50, scrapers: 60-100) |

### 3. Implement required methods

| Method | Required | Purpose |
|--------|----------|---------|
| `initialize()` | Yes | Load config, API keys, base URL |
| `healthCheck()` | Yes | Return availability status |
| `getStreams(contentId, options)` | Yes | **Primary method** — return playable streaming URLs |
| `search(query)` | Yes | Search for content |
| `getDetails(contentId)` | Yes | Get full content metadata |
| `dispose()` | No | Clean up on provider unload |

### 4. Restart the server

```
pm2 restart novastream
```

ProviderManager will auto-discover your provider on next startup.

### 5. Map content to your provider

For **new content**: use `ContentRegistry.register()` to create Content documents with your `providerName` in the `providers[]` array.

For **existing content**: run the migration pattern from `scripts/migrate-provider-mappings.js` to add your provider mapping to existing documents.

## Provider Resolution Order

When a user presses PLAY, `ProviderManager.resolve()` follows this order:

1. **Lookup Content** — find by slug
2. **Get provider mapping** — check `providers[]` on the Content document
3. **Check `_streamCache`** — return cached URL if valid (10-min safety buffer)
4. **Acquire DistributedLock** — prevent cache stampede (C-008)
5. **Try API providers** — `DIRECT` execution mode
6. **Try LIGHT_SCRAPER providers** — `QUEUE` execution via ScraperQueue
7. **Try BROWSER_SCRAPER providers** — `WORKER` execution via ScraperQueue
8. **Cache result** — store in `_streamCache` with TTL
9. **Return URL** — playable streaming URL

## Provider Types Reference

| Type | Mode | Use Case | Concurrency |
|------|------|----------|-------------|
| `API` | `DIRECT` | Direct HTTP API calls to streaming source | Unlimited (per-provider limit optional) |
| `LIGHT_SCRAPER` | `QUEUE` | Light page scraping (JSON endpoints, DOM parsing) | Global max 5 concurrent |
| `BROWSER_SCRAPER` | `WORKER` | Headless browser automation (JS-rendered pages) | Global max 5 concurrent, circuit breaker |

## Stream Policy Reference

| Policy | TTL | Refresh | Example |
|--------|-----|---------|---------|
| `STATIC_URL` | `24h` (or longer) | Not needed | Direct CDN link to uploaded file |
| `SIGNED_URL` | Token-determined | 10 min before expiry | CloudFront/Cloudflare signed URL |
| `DYNAMIC` | Per-request | Every play | DASH manifest, live stream |

## Converting Decompiled APK / Extracted Providers

When converting a provider from a decompiled APK, `.cs3` plugin file, or network traffic capture, use this workflow:

### 1. Provider Classification

| If the source... | Classify as | `execution.mode` |
|-----------------|:-----------:|:-----------------:|
| Has structured JSON API endpoints | `API` | `DIRECT` |
| Requires HTML parsing (cheerio/DOM) | `LIGHT_SCRAPER` | `QUEUE` |
| Needs headless browser for JS-rendered pages | `BROWSER_SCRAPER` | `WORKER` |

**Important:** Encrypted API responses (AES, custom crypto) do NOT make a provider a scraper. If the communication uses JSON over HTTP with transport-level encryption only, it's still an **API** provider.

### 2. Extract Key Details

| Detail | Where to Find in APK/Source |
|--------|----------------------------|
| Base URL | String constants, `BuildConfig`, obfuscated strings |
| Endpoints | URL path patterns, route builders |
| HTTP method | Request construction code (GET/POST) |
| Headers | Request building code (User-Agent, Authorization) |
| Auth/encryption | Cipher instances, HMAC methods, key derivation |
| Request body | POST body construction |
| Response fields | JSON parsing code, data models |
| Stream URL extraction | Video player init code, URL builders |

### 3. Handle Provider-Specific Crypto

Use Node.js `crypto` module — no extra dependencies needed for standard algorithms:

```js
// Example: AES/CBC/PKCS5Padding (CastleTV-style)
const crypto = require('crypto');
const key = Buffer.concat([Buffer.from(secretKey, 'base64'), Buffer.from(keySuffix)]).slice(0, 16);
const decipher = crypto.createDecipheriv('aes-128-cbc', key, key);
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
return JSON.parse(decrypted.toString('utf8'));
```

### 4. Map Provider Methods to NovaStream Interface

| APK/Extracted Method | NovaStream Method |
|---------------------|:-----------------:|
| `search(query)` | `search(query)` |
| `getMovieDetail(id)` / `getSeriesDetail(id)` | `getDetails(contentId)` |
| `getSeasons(id)` / `getEpisodes(id)` | `getEpisodes(contentId)` |
| `getStreamUrl(id, quality)` | `getStreams(contentId, { season, episode, quality })` |

### 5. Determine Stream Lifecycle

| If the response contains... | Use `streamPolicy.type` |
|----------------------------|:-----------------------:|
| No expiry information, permanent URLs | `STATIC_URL` |
| `expires` param or `expireTime` field | `SIGNED_URL` |
| Short-lived session tokens (< 5 min) | `DYNAMIC` |

### 6. Content ID Mapping Rules

| Provider uses... | Confidence Score | Method |
|-----------------|:----------------:|--------|
| TMDB ID directly | 100 | Direct match by tmdbId |
| IMDb ID | 95+ | Match via ContentRegistry |
| Internal ID only | 85-90 | Title + year + type validation |
| Title-only match | **REJECT** (< 60) | Use title+year disambiguation |

### 7. Security Rules

- **Never commit real provider implementations** — only `example.provider.js` is tracked in git
- Crypto logic goes in the provider file (it IS the provider logic)
- API keys, domains, and tokens go in ProviderRegistry (never hardcoded)

## Troubleshooting

- **Provider not registered**: Check `pm2 logs` for errors. Verify file ends in `.provider.js`.
- **Metadata validation failed**: Check `providerType` matches `execution.mode` (API→DIRECT, etc.).
- **Content not resolving**: Verify `providers[].providerName` matches the provider's `metadata.id`.
